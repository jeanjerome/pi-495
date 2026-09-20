/**
 * NFR-06, REC-24: observability without imposed surveillance. A full change is conducted with
 * every outbound entry point of the process instrumented, and the sources are read for any way of
 * reaching a network at all. Nothing here has to be turned off: there is nothing to turn off.
 */
import { strict as assert } from "node:assert";
import dns from "node:dns";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { join, relative } from "node:path";
import tls from "node:tls";
import { afterEach, describe, it } from "node:test";
import { makeHarness, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { exportChange } from "../../src/export/export-service.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

function project(): string {
	const p = tempDir("495-proj-");
	cleanups.push(p);
	fixtureTs(p);
	initRepo(p);
	return p;
}
function track(t: TestHarness): TestHarness {
	cleanups.push(t.root);
	return t;
}
const RIGHT = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: true, notes: [] });

/** Every way this process could open a connection, recorded instead of forbidden. */
function instrumentNetwork(): { attempts: string[]; restore: () => void } {
	const attempts: string[] = [];
	const undo: (() => void)[] = [];
	const target = (arg: unknown): string =>
		typeof arg === "object" && arg !== null ? JSON.stringify(arg) : String(arg);
	const spy = (holder: Record<string, unknown>, key: string, label: string): void => {
		const original = holder[key];
		if (typeof original !== "function") return;
		holder[key] = function patched(this: unknown, ...args: unknown[]): unknown {
			attempts.push(`${label} -> ${target(args[0])}`);
			return (original as (...a: unknown[]) => unknown).apply(this, args);
		};
		undo.push(() => {
			holder[key] = original;
		});
	};
	spy(net.Socket.prototype as unknown as Record<string, unknown>, "connect", "net.Socket.connect");
	spy(net as unknown as Record<string, unknown>, "connect", "net.connect");
	spy(net as unknown as Record<string, unknown>, "createConnection", "net.createConnection");
	spy(tls as unknown as Record<string, unknown>, "connect", "tls.connect");
	spy(http as unknown as Record<string, unknown>, "request", "http.request");
	spy(https as unknown as Record<string, unknown>, "request", "https.request");
	spy(dns as unknown as Record<string, unknown>, "lookup", "dns.lookup");
	spy(dns as unknown as Record<string, unknown>, "resolve", "dns.resolve");
	spy(dns.promises as unknown as Record<string, unknown>, "lookup", "dns.promises.lookup");
	spy(globalThis as unknown as Record<string, unknown>, "fetch", "fetch");
	return {
		attempts,
		restore: () => {
			for (const u of undo.reverse()) u();
		},
	};
}

function sources(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) sources(p, files);
		else if (p.endsWith(".ts")) files.push(p);
	}
	return files;
}
/** Comments may name a URL; code may not reach one. */
function codeOf(text: string): string[] {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.split("\n")
		.filter((line) => !/^\s*(\/\/|\*)/.test(line));
}

describe("observability without imposed surveillance (NFR-06, REC-24)", () => {
	it("an instrumented change, from the request to the redacted export, opens no connection and resolves no host", async () => {
		const p = project();
		const profiles: string[] = [];
		const t = track(
			makeHarness({
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: RIGHT },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
				},
				controls: (real) => ({
					runControl: async (invocation, signal) => {
						profiles.push(`control:${invocation.control.control_id}:${invocation.control.network}`);
						return real.runControl(invocation, signal);
					},
				}),
			}),
		);
		const startIntervention = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (mandate) => {
			profiles.push(`intervention:${mandate.role}:${mandate.profile.network}`);
			return startIntervention(mandate);
		};

		const { attempts, restore } = instrumentNetwork();
		try {
			const { change } = await t.harness.start({
				project_path: p,
				request_text: "Keep greet behaviour, tidy the implementation",
				actor: HUMAN,
			});
			const result = await t.harness.advance(change.change_id, { max_steps: 30 });
			assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
			assert.equal(result.view.change?.outcome, "accepted");
			const dossier = join(t.root, "export");
			await exportChange(t.ledger, t.objects, {
				change_id: change.change_id,
				destination: dossier,
				redact: true,
				now: "2026-09-16T12:00:00.000Z",
				producer: "495 test",
			});
		} finally {
			restore();
		}
		assert.deepEqual(attempts, [], "a conducted change reached out somewhere");
		// Nothing was reached because nothing was allowed to: what ran outside this process had no
		// route out either.
		assert.ok(profiles.length > 0);
		assert.deepEqual([...new Set(profiles.map((entry) => entry.split(":")[2]))], ["denied"], profiles.join(" | "));
	});

	it("no source can reach a network: no client, no socket, no endpoint literal", () => {
		const outbound =
			/\bfetch\s*\(|\bhttps?\.(request|get)\s*\(|\bnet\.(connect|createConnection)\s*\(|\btls\.connect\s*\(|\bdgram\b|\bWebSocket\b|\bXMLHttpRequest\b|\bsendBeacon\b|from\s+["']node:(http|https|net|tls|dgram|dns)["']/;
		const endpoint = /https?:\/\/[^\s"'`)]+/;
		const found: string[] = [];
		for (const file of sources(join(process.cwd(), "src"))) {
			for (const line of codeOf(readFileSync(file, "utf8"))) {
				if (outbound.test(line) || endpoint.test(line)) found.push(`${relative(process.cwd(), file)}: ${line.trim()}`);
			}
		}
		assert.deepEqual(found, [], "the product has no telemetry endpoint and no way to reach one");
	});
});
