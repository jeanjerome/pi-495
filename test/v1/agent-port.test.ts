import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PiWorkerAgent } from "../../src/adapters/pi-worker/supervisor.ts";
import { ScriptedAgent } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { collect, fakeWorkerAgent, mandate as buildMandate } from "../helpers/intervention-fixture.ts";
import { extractJsonOutput, OUTPUT_SCHEMAS } from "../../src/adapters/pi-worker/protocol.ts";
import { Value } from "typebox/value";

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "agent-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("worker supervisor protocol (C-AGT, AGT-03, AGT-06, ADR-007)", () => {
	it("relays started, tool and completed events with a validated structured output", async () => {
		const handle = await fakeWorkerAgent().startIntervention(buildMandate("complete", root));
		const events = await collect(handle.events);
		assert.deepEqual(
			events.map((e) => e.type),
			["started", "tool_started", "tool_finished", "completed"],
		);
		const done = events[3];
		assert.ok(done && done.type === "completed" && done.output_valid);
		assert.equal(readFileSync(join(root, "from-worker.txt"), "utf8"), "written by fake worker\n");
	});
	it("an invalid structured output is reported as invalid, the claim of success is not a decision (SA-012, AGT-06)", async () => {
		const events = await collect(
			(await fakeWorkerAgent().startIntervention(buildMandate("invalid-output", root))).events,
		);
		const done = events.at(-1);
		assert.ok(done && done.type === "completed" && done.output_valid === false);
	});
	it("a crashing worker yields failed, never completed", async () => {
		const events = await collect((await fakeWorkerAgent().startIntervention(buildMandate("crash", root))).events);
		assert.equal(events.at(-1)?.type, "failed");
	});
	it("a silent worker is killed after the silence timeout and reported failed", async () => {
		const t0 = Date.now();
		const events = await collect((await fakeWorkerAgent().startIntervention(buildMandate("silent", root))).events);
		assert.equal(events.at(-1)?.type, "failed");
		assert.match((events.at(-1) as { error: string }).error, /silent/);
		assert.ok(Date.now() - t0 < 5000);
	});
	it("abort reaches the worker and produces cancelled (§12.3)", async () => {
		const handle = await fakeWorkerAgent().startIntervention(buildMandate("hang", root));
		setTimeout(() => void handle.abort("user"), 150);
		const events = await collect(handle.events);
		assert.equal(events.at(-1)?.type, "cancelled");
	});
	it("a missing worker binary is a failed event, not an exception", async () => {
		const agent = new PiWorkerAgent({
			config: {
				pi_package_dir: "/none",
				pi_agent_dir: "/none",
				sandbox_backend: "unconfined",
				denied_read_paths: [],
				heartbeat_ms: 50,
			},
			workerCommand: ["/nonexistent/495-worker"],
			silence_timeout_ms: 500,
		});
		const events = await collect((await agent.startIntervention(buildMandate("complete", root))).events);
		assert.equal(events.at(-1)?.type, "failed");
	});
});

describe("scripted agent and output extraction", () => {
	it("replays writes only through allowed tools and blocks the rest (AGT-04, SA-018)", async () => {
		const agent = new ScriptedAgent({
			steps: [
				{ kind: "write", path: "src/a.js", content: "1" },
				{ kind: "tool", tool: "bash" },
				{ kind: "complete", output: { summary: "ok", changed_paths: ["src/a.js"], tests_claimed: false, notes: [] } },
			],
		});
		const reviewer = await agent.startIntervention(buildMandate("review", root, { role: "review", tools: ["read"] }));
		const events = await collect(reviewer.events);
		assert.equal(existsSync(join(root, "src", "a.js")), false, "reviewer write blocked");
		assert.ok(events.some((e) => e.type === "tool_finished" && e.blocked));
		const producer = await agent.startIntervention(buildMandate("impl", root));
		await collect(producer.events);
		assert.equal(readFileSync(join(root, "src", "a.js"), "utf8"), "1");
	});
	it("extracts the last JSON block and validates it against the output schema", () => {
		const text =
			'I changed things.\n```json\n{"summary":"x","changed_paths":[],"tests_claimed":true,"notes":[]}\n```\nDone.';
		const out = extractJsonOutput(text);
		assert.equal(Value.Check(OUTPUT_SCHEMAS["producer-report"], out), true);
		assert.equal(
			Value.Check(OUTPUT_SCHEMAS["producer-report"], extractJsonOutput('```json\n{"status":"accepted"}\n```')),
			false,
		);
		assert.equal(extractJsonOutput("no json here"), undefined);
	});
});
