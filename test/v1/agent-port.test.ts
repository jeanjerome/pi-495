import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PiWorkerAgent } from "../../src/adapters/pi-worker/supervisor.ts";
import { ScriptedAgent } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { collect, fakeWorkerAgent, mandate as buildMandate } from "../helpers/intervention-fixture.ts";
import { extractJsonOutput, OUTPUT_SCHEMAS } from "../../src/adapters/pi-worker/protocol.ts";
import { PiModelDescription, type PiModelCatalogue } from "../../src/adapters/pi-worker/capabilities.ts";
import type { ModelSelection } from "../../src/ports/execution.ts";
import type { Api, AssistantMessage as PiAssistantMessage, Model } from "@earendil-works/pi-ai";
import { Value } from "typebox/value";

type PiModel = Model<Api>;

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

/** An OpenAI-compatible model as Pi's catalogue carries one, with only the fields a description reads. */
function catalogued(over: Partial<PiModel> = {}): PiModel {
	return {
		id: "local-1",
		name: "local-1",
		api: "openai-completions",
		provider: "omlx",
		baseUrl: "http://127.0.0.1:8000/v1",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 131072,
		maxTokens: 32768,
		...over,
	} as PiModel;
}

/** Pi's model surface, with what the endpoint answers written by the test rather than by a server. */
class FakeCatalogue implements PiModelCatalogue {
	readonly asked: string[] = [];
	private readonly models: PiModel[];
	private readonly authenticated: boolean;
	private readonly answer: () => { tool_call: boolean } | Error;
	constructor(models: PiModel[], authenticated: boolean, answer: () => { tool_call: boolean } | Error) {
		this.models = models;
		this.authenticated = authenticated;
		this.answer = answer;
	}
	find(provider: string, modelId: string): PiModel | undefined {
		return this.models.find((m) => m.provider === provider && m.id === modelId);
	}
	hasConfiguredAuth(): boolean {
		return this.authenticated;
	}
	async complete(model: PiModel): Promise<PiAssistantMessage> {
		this.asked.push(model.id);
		const answer = this.answer();
		if (answer instanceof Error) throw answer;
		return {
			role: "assistant",
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: answer.tool_call ? "toolUse" : "stop",
			timestamp: Date.now(),
			content: answer.tool_call
				? [{ type: "toolCall", id: "c1", name: "harness495_probe", arguments: { ready: true } }]
				: [{ type: "text", text: "I am ready." }],
		} as PiAssistantMessage;
	}
}

const calls = () => ({ tool_call: true });
const prose = () => ({ tool_call: false });
const selection = (over: Partial<ModelSelection> = {}): ModelSelection => ({
	provider_id: "omlx",
	model_id: "local-1",
	thinking_level: "off",
	...over,
});

describe("what a model is described as being able to do (AGT-01, D-55)", () => {
	it("carries the seven kinds AGT-01 enumerates, each saying where its value comes from", async () => {
		const catalogue = new FakeCatalogue([catalogued()], true, calls);
		const described = await new PiModelDescription(catalogue).describe(selection());
		assert.equal(described.available, true);
		for (const [kind, fact] of [
			["tools", described.tools],
			["streaming", described.streaming],
			["cancellation", described.cancellation],
			["sessions", described.sessions],
			["thinking_levels", described.thinking_levels],
			["limits", described.limits],
			["result_shape", described.result_shape],
		] as const) {
			assert.ok(fact.origin === "reported" || fact.origin === "restated", `${kind} says where its value comes from`);
			assert.ok(fact.note.length > 0, `${kind} carries the note of what its value rests on`);
		}
		assert.equal(described.limits.value?.context_window_tokens, 131072);
		assert.equal(described.limits.value?.max_output_tokens, 32768);
		assert.equal(described.limits.origin, "reported");
		assert.equal(described.streaming.origin, "restated", "no model of the host carries a streaming field");
	});

	it("reports the thinking levels the host accepts for this model, and nothing wider", async () => {
		const reasoning = new FakeCatalogue([catalogued()], true, calls);
		const withReasoning = await new PiModelDescription(reasoning).describe(selection());
		assert.deepEqual(withReasoning.thinking_levels.value, ["off", "minimal", "low", "medium", "high"]);
		assert.equal(withReasoning.thinking_levels.origin, "reported");

		const plain = new FakeCatalogue([catalogued({ reasoning: false })], true, calls);
		const withoutReasoning = await new PiModelDescription(plain).describe(selection());
		assert.deepEqual(withoutReasoning.thinking_levels.value, ["off"]);
	});

	it("a supervisor with no catalogue claims nothing: an absence is not an availability", async () => {
		const described = await new PiModelDescription(null).describe(selection());
		assert.equal(described.available, false);
		assert.ok(
			described.reasons.some((r) => /catalogue/.test(r)),
			described.reasons.join(" | "),
		);
		assert.equal(described.tools.value, null, "nothing is affirmed of a model that could not be consulted");
		assert.equal(described.thinking_levels.value, null);
		assert.equal(described.limits.value, null);
	});

	it("a pair absent from the catalogue is unavailable, and the endpoint is never asked", async () => {
		const catalogue = new FakeCatalogue([catalogued()], true, calls);
		const described = await new PiModelDescription(catalogue).describe(selection({ model_id: "never-configured" }));
		assert.equal(described.available, false);
		assert.ok(described.reasons.join(" ").includes("never-configured"), described.reasons.join(" | "));
		assert.deepEqual(catalogue.asked, [], "a pair that is not configured costs no request");
	});

	it("a provider without complete authentication is unavailable, and the endpoint is never asked", async () => {
		const catalogue = new FakeCatalogue([catalogued()], false, calls);
		const described = await new PiModelDescription(catalogue).describe(selection());
		assert.equal(described.available, false);
		assert.ok(/authentication/.test(described.reasons.join(" ")), described.reasons.join(" | "));
		assert.deepEqual(catalogue.asked, []);
	});

	it("observes the tool-call format the host reports of no model, and holds the answer for the pair", async () => {
		const answering = new FakeCatalogue([catalogued()], true, calls);
		const description = new PiModelDescription(answering);
		const first = await description.describe(selection());
		assert.equal(first.tools.value, true);
		assert.equal(first.tools.origin, "reported");
		await description.describe(selection());
		assert.equal(answering.asked.length, 1, "a pair already observed is not observed again");

		const silent = new FakeCatalogue([catalogued()], true, prose);
		const refused = await new PiModelDescription(silent).describe(selection());
		assert.equal(refused.tools.value, false, "an endpoint that answers in prose has not proven the format");
		assert.equal(
			refused.available,
			true,
			"the pair is reachable: what it cannot do is said by the fact, not by availability",
		);
	});

	it("an observation that does not complete leaves the format unestablished, carrying what was received", async () => {
		const unreachable = new FakeCatalogue([catalogued()], true, () => new Error("connect ECONNREFUSED 127.0.0.1:8000"));
		const described = await new PiModelDescription(unreachable).describe(selection());
		assert.equal(described.tools.value, null);
		assert.match(described.tools.note, /ECONNREFUSED/);
	});
});
