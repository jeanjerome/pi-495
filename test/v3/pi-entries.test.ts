/**
 * V3 — the same operation through Pi print and JSON entries (UX-02, REC-39, SA-005, SA-029).
 * Runs the real `pi` binary with the extension and a scripted agent; no model is called.
 */
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fixtureTs, initRepo } from "../helpers/fixtures.ts";

const PI = process.env.HARNESS495_PI_BIN ?? "pi";
const EXT = join(process.cwd(), "src", "extension", "index.ts");
const ESC = String.fromCharCode(27);
let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "v3-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function piAvailable(): boolean {
	try {
		execFileSync(PI, ["--version"], { stdio: "ignore", timeout: 20000 });
		return true;
	} catch {
		return false;
	}
}
const skip = !piAvailable() && "pi binary not available";

/** Runs pi; print mode text is read from stdout and stderr together (Pi keeps stdout for the model answer). */
function runPi(
	mode: "print" | "json",
	cwd: string,
	dataDir: string,
	prompt: string,
	extraEnv: Record<string, string> = {},
): string {
	// Explicitly load the source extension while ignoring packages installed in the user's Pi config.
	const args =
		mode === "print"
			? ["-ne", "-p", "--no-session", "-e", EXT, prompt]
			: ["-ne", "--mode", "json", "--no-session", "-e", EXT, prompt];
	const env: Record<string, string | undefined> = { ...process.env, HARNESS495_DATA_DIR: dataDir, ...extraEnv };
	if (process.platform !== "darwin") env.HARNESS495_ALLOW_UNCONFINED = "1";
	const r = spawnSync(PI, args, { cwd, encoding: "utf8", timeout: 300_000, env, maxBuffer: 64 * 1024 * 1024 });
	if (r.error) throw r.error;
	return mode === "print" ? `${r.stdout}${r.stderr}` : r.stdout;
}

function scriptFile(dir: string, spec: unknown, implContent: string): string {
	const path = join(dir, "agent.json");
	writeFileSync(
		path,
		JSON.stringify({
			default: { steps: [{ kind: "complete", output: spec }] },
			roles: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: implContent },
						{
							kind: "complete",
							output: { summary: "d", changed_paths: ["src/greet.js"], tests_claimed: false, notes: [] },
						},
					],
				},
			},
		}),
	);
	return path;
}
const SPEC = {
	objective: "tidy greet",
	facts: [],
	assumptions: [],
	questions: [],
	answers: [],
	out_of_scope: [],
	risks: [],
	requirements: [
		{
			requirement_id: "R1",
			statement: "greet unchanged",
			mandatory: true,
			criterion: "tests pass",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
	design: { summary: "touch src/greet.js", components: [], interfaces: [], risks: [] },
};
const RIGHT = "export function greet(name) {\n  return `Hello, ${name}`; // tidy\n}\n";

describe("Pi entries: print and JSON (C-PI)", { skip }, () => {
	it("the same start yields the same verdict in print and in JSON; JSON carries the canonical view (REC-39)", () => {
		const outcomes: Record<string, string> = {};
		for (const mode of ["print", "json"] as const) {
			const proj = join(root, `proj-${mode}`);
			fixtureTs(proj);
			initRepo(proj);
			const data = join(root, `data-${mode}`);
			const out = runPi(mode, proj, data, "/495 start tidy greet without behaviour change", {
				HARNESS495_SCRIPTED_AGENT: scriptFile(root, SPEC, RIGHT),
			});
			if (mode === "print") {
				assert.match(out, /Résultat: accepted/);
				assert.match(out, /G5=PASS/);
				outcomes.print = "accepted";
			} else {
				const lines = out
					.split("\n")
					.filter(Boolean)
					.map(
						(l) =>
							JSON.parse(l) as {
								type: string;
								message?: {
									customType?: string;
									details?: { view?: { change?: { outcome: string; gates: { gate: string; verdict: string }[] } } };
								};
							},
					);
				const views = lines
					.filter((l) => l.type === "message_end" && l.message?.customType === "495" && l.message.details?.view?.change)
					.map((l) => l.message!.details!.view!.change!);
				assert.ok(views.length > 0, "canonical view emitted as a structured message");
				const last = views.at(-1)!;
				outcomes.json = last.outcome;
				assert.equal(last.gates.find((g) => g.gate === "G5")?.verdict, "PASS");
				assert.ok(!out.includes(`${ESC}[`), "no terminal widget in JSON mode");
			}
		}
		assert.equal(outcomes.print, outcomes.json);
	});
	it("a required human decision stops at a safe point with decision_required in print and JSON, without approval (SA-005, REC-21)", () => {
		const proj = join(root, "proj-dec");
		fixtureTs(proj);
		initRepo(proj);
		const data = join(root, "data-dec");
		const out = runPi("print", proj, data, "/495 start tidy greet", {
			HARNESS495_SCRIPTED_AGENT: scriptFile(root, SPEC, RIGHT),
			HARNESS495_HUMAN_ACCEPTANCE: "1",
		});
		assert.match(out, /decision_required/);
		assert.match(out, /IH-10/);
		assert.match(out, /Résultat: pending/);
		const again = runPi("json", proj, data, "/495 status", {});
		assert.match(again, /"status":"decision_required"/);
		assert.match(again, /"outcome":"pending"/);
	});
	it("a startup diagnostic reaches every entry, not only the one that has a screen (AT-12, UX-02)", () => {
		const proj = join(root, "proj-diag");
		fixtureTs(proj);
		initRepo(proj);
		for (const mode of ["print", "json"] as const) {
			const data = join(root, `data-diag-${mode}`);
			mkdirSync(data, { recursive: true });
			// An unreadable configuration is honoured by falling back to the defaults, and saying so.
			writeFileSync(join(data, "config.json"), "{ not json");
			const out = runPi(mode, proj, data, "/495 status", {});
			assert.match(out, /config\.json ignored/, `${mode} mode announces the diagnostic`);
		}
	});
});
