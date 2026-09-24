/**
 * V3 — a config.json its contract refuses stops every change in a real `pi`, on the entries that
 * carry a structured payload, and the same file repaired is read after a reload (SEC-05, UX-02).
 * Real `pi`, scripted agent, no model called.
 */
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PiRpcClient } from "../helpers/rpc-client.ts";
import { fixtureTs, initRepo } from "../helpers/fixtures.ts";

const PI = process.env.HARNESS495_PI_BIN ?? "pi";
const EXT = join(process.cwd(), "src", "extension", "index.ts");
// RPC has no `/reload` of its own: Pi's example command calls `ctx.reload()`, which runs the same
// `session.reload()` as the interactive `/reload`.
const RELOAD = join(
	process.cwd(),
	"node_modules",
	"@earendil-works",
	"pi-coding-agent",
	"examples",
	"extensions",
	"reload-runtime.ts",
);
const REQUEST = "/495 start tidy greet without behaviour change";
const REFUSED = JSON.stringify({ policy: { adoptoin: { design: "human" } } });
const REPAIRED = JSON.stringify({ policy: { adoption: { design: "kernel" } } });

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "v3cfg-"));
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

/** One project, one data directory holding `config.json`, and a scripted agent so no model is called. */
function channel(name: string, config: string): { project: string; configPath: string; env: Record<string, string> } {
	const project = join(root, `proj-${name}`);
	fixtureTs(project);
	initRepo(project);
	const agent = join(root, `agent-${name}.json`);
	writeFileSync(
		agent,
		JSON.stringify({
			default: { steps: [{ kind: "complete", output: SPEC }] },
			roles: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{
							kind: "complete",
							output: { summary: "d", changed_paths: ["src/greet.js"], tests_claimed: false, notes: [] },
						},
					],
				},
			},
		}),
	);
	const data = join(root, `data-${name}`);
	mkdirSync(data, { recursive: true });
	const configPath = join(data, "config.json");
	writeFileSync(configPath, config);
	const env: Record<string, string> = { HARNESS495_DATA_DIR: data, HARNESS495_SCRIPTED_AGENT: agent };
	if (process.platform !== "darwin") env.HARNESS495_ALLOW_UNCONFINED = "1";
	return { project, configPath, env };
}

interface Said {
	content: string;
	outcome: string | undefined;
}

function saidOf(message: { content?: unknown; details?: Record<string, unknown> }): Said {
	const view = (message.details as { view?: { change?: { outcome: string } } } | undefined)?.view;
	return { content: String(message.content ?? ""), outcome: view?.change?.outcome };
}

function runJson(cwd: string, env: Record<string, string>, prompt: string): Said[] {
	const r = spawnSync(PI, ["-ne", "--mode", "json", "--no-session", "-e", EXT, prompt], {
		cwd,
		encoding: "utf8",
		timeout: 300_000,
		env: { ...process.env, ...env },
		maxBuffer: 64 * 1024 * 1024,
	});
	if (r.error) throw r.error;
	return r.stdout
		.split("\n")
		.filter(Boolean)
		.flatMap((line) => {
			let event: {
				type?: string;
				message?: { customType?: string; content?: unknown; details?: Record<string, unknown> };
			};
			try {
				event = JSON.parse(line) as typeof event;
			} catch {
				return [];
			}
			if (event.type !== "message_end" || event.message?.customType !== "495") return [];
			return [saidOf(event.message)];
		});
}

async function ask(client: PiRpcClient, id: string, message: string): Promise<void> {
	client.send({ id, type: "prompt", message });
	await client.waitFor((e) => e.type === "response" && e.id === id, 60_000);
	await client.waitQuiet();
}

const refusal = /config\.json cannot be read: policy\.adoptoin is not a known setting/;

describe("config.json refused by its contract in a real Pi (SEC-05)", { skip }, () => {
	it("an unknown key stops /495 start in JSON mode, naming where it lies, and no change is recorded", () => {
		const json = channel("json", REFUSED);
		const said = runJson(json.project, json.env, REQUEST);
		const text = said.map((s) => s.content).join("\n");
		assert.match(text, refusal);
		assert.doesNotMatch(text, /chg_/, "no change is started");
		assert.deepEqual(
			said.filter((s) => s.outcome !== undefined),
			[],
			"no change view is emitted",
		);
	});

	// Pi hands the extension its own copy of TypeBox, whose pointers may leave a `/` in a key unescaped:
	// a key read back from the pointer would then be cut into identifiers and cited.
	it("a key holding a slash is not cited, under the copy of TypeBox Pi hands the extension", () => {
		const secret = "sk-q8v2x7";
		const json = channel("slash", JSON.stringify({ [`${secret}/token`]: 1, policy: { "zq8v2/key": 1 } }));
		const text = runJson(json.project, json.env, REQUEST)
			.map((s) => s.content)
			.join("\n");
		assert.match(text, /: the file holds a key that is not a known setting; policy holds a key that is not a known/);
		assert.equal(text.includes("q8v2"), false, `a key is cited: ${text}`);
	});

	// The same copy points a key holding a slash at the place of a key it would nest under, so the
	// pointer alone cannot tell the two apart.
	it("an unknown key a key holding a slash points at is still named, under the copy of TypeBox Pi hands the extension", () => {
		const json = channel("nested", JSON.stringify({ policy: { "budgets/zq8v2": 1, budgets: { zq8v2: 1 } } }));
		const text = runJson(json.project, json.env, REQUEST)
			.map((s) => s.content)
			.join("\n");
		assert.match(text, /policy\.budgets\.zq8v2 is not a known setting/);
		assert.match(text, /policy holds a key that is not a known setting/);
		assert.equal(text.includes("budgets/"), false, `a key holding a slash is cited: ${text}`);
	});

	it("an unknown key stops /495 start over RPC, and the same file repaired is read after a reload", async () => {
		const rpc = channel("rpc", REFUSED);
		const client = new PiRpcClient({
			bin: PI,
			args: ["-ne", "--mode", "rpc", "--no-session", "-e", EXT, "-e", RELOAD],
			cwd: rpc.project,
			env: { ...process.env, ...rpc.env },
		});
		try {
			await ask(client, "refused", REQUEST);
			const before = client.messages().map(saidOf);
			writeFileSync(rpc.configPath, REPAIRED);
			await ask(client, "reload", "/reload-runtime");
			await ask(client, "accepted", REQUEST);
			const after = client.messages().map(saidOf).slice(before.length);

			const refusedText = before.map((s) => s.content).join("\n");
			assert.match(refusedText, refusal);
			assert.doesNotMatch(refusedText, /chg_/, "the refused file starts no change");
			const afterText = after.map((s) => s.content).join("\n");
			assert.doesNotMatch(afterText, /cannot be read/, "the reloaded session reads the repaired file");
			assert.equal(after.filter((s) => s.outcome !== undefined).at(-1)?.outcome, "accepted", afterText);
		} finally {
			await client.close();
		}
	});
});
