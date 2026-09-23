/**
 * V3 — what an intervention cost, as the host totals it for the session (AGT-07, NFR-06, D-55).
 * A local server stands in for a compatible endpoint and reports the same usage for every answer;
 * the catalogue rates are the ones declared for it. No model is called and nothing leaves the
 * machine: the subscription case writes a credential the host reads without refreshing it, and the
 * session opened on it sends nothing.
 */
import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ModelRuntime, SessionManager, SettingsManager, createAgentSession } from "@earendil-works/pi-coding-agent";
import { readSessionCost } from "../../src/adapters/pi-worker/session-observer.ts";
import { PiWorkerAgent } from "../../src/adapters/pi-worker/supervisor.ts";
import type { InterventionCost } from "../../src/domain/change/state.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";
import { collect, mandate } from "../helpers/intervention-fixture.ts";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";

let root: string;
let server: Server | null = null;
const cleanups: string[] = [];
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "cost-"));
});
afterEach(async () => {
	if (server) await new Promise<void>((done) => server?.close(() => done()));
	server = null;
	rmSync(root, { recursive: true, force: true });
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** One prose answer, with the usage an OpenAI-compatible server reports for it. */
function chunks(text: string): string[] {
	const head = { id: "cost-1", object: "chat.completion.chunk", created: 0, model: "local" };
	return [
		JSON.stringify({ ...head, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }),
		JSON.stringify({ ...head, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }),
		JSON.stringify({
			...head,
			choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
			usage: { prompt_tokens: 380, completion_tokens: 20, total_tokens: 400 },
		}),
		"[DONE]",
	];
}

/**
 * The stand-in endpoint, and the catalogue that declares it: one model priced on every rate, one
 * priced on its output alone, and one left without a rate — which the host reads as zero.
 */
async function declareEndpoint(): Promise<void> {
	const listening = createServer((request, response) => {
		request.on("data", () => {});
		request.on("end", () => {
			response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
			for (const chunk of chunks("an answer")) response.write(`data: ${chunk}\n\n`);
			response.end();
		});
	});
	server = listening;
	await new Promise<void>((ready) => listening.listen(0, "127.0.0.1", ready));
	const port = (listening.address() as { port: number }).port;
	const model = (id: string, cost?: Record<string, number>) => ({
		id,
		reasoning: false,
		contextWindow: 128_000,
		maxTokens: 512,
		...(cost ? { cost } : {}),
	});
	writeFileSync(
		join(root, "models.json"),
		JSON.stringify({
			providers: {
				omlx: {
					baseUrl: `http://127.0.0.1:${port}/v1`,
					api: "openai-completions",
					apiKey: "not-a-secret-this-server-ignores-it",
					models: [
						model("priced", { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }),
						model("output-only", { input: 0, output: 15, cacheRead: 0, cacheWrite: 0 }),
						model("unpriced"),
					],
				},
			},
		}),
	);
}

async function host(): Promise<ModelRuntime> {
	return ModelRuntime.create({ authPath: join(root, "auth.json"), modelsPath: join(root, "models.json") });
}

/** A session built as the worker builds one, on a model the host catalogue declares. */
async function session(runtime: ModelRuntime, provider: string, modelId: string) {
	const model = runtime.getModel(provider, modelId);
	assert.ok(model, `${provider}/${modelId} is declared to the host`);
	const created = await createAgentSession({
		cwd: root,
		model,
		modelRuntime: runtime,
		noTools: "all",
		tools: [],
		customTools: [],
		sessionManager: SessionManager.inMemory(root),
		settingsManager: SettingsManager.inMemory({ retry: { enabled: false } }),
	});
	return { live: created.session, model };
}

describe("what an intervention cost, as the host totals it for the session (AGT-07)", () => {
	it("a model the catalogue prices costs what the host totals, and says it is not used through a subscription", async () => {
		await declareEndpoint();
		const runtime = await host();
		const { live, model } = await session(runtime, "omlx", "priced");
		await live.prompt("answer");
		const stats = live.getSessionStats();
		const cost = readSessionCost(live, runtime, model);
		live.dispose();
		assert.ok(stats.cost > 0, "the host priced the answer");
		assert.deepEqual(cost, {
			usd: stats.cost,
			unknown_reason: null,
			basis: "host_catalogue",
			subscription: runtime.isUsingSubscription("omlx"),
		});
		assert.equal(cost.subscription, false, "a provider reached with a key is not a subscription");
	});

	it("one rate the catalogue sets is enough for the amount to be the host's", async () => {
		await declareEndpoint();
		const runtime = await host();
		const { live, model } = await session(runtime, "omlx", "output-only");
		await live.prompt("answer");
		const stats = live.getSessionStats();
		const cost = readSessionCost(live, runtime, model);
		live.dispose();
		assert.ok(stats.cost > 0);
		assert.equal(cost.usd, stats.cost);
		assert.equal(cost.unknown_reason, null);
	});

	it("a model the catalogue leaves without a rate has an unknown cost, never a free one", async () => {
		await declareEndpoint();
		const runtime = await host();
		const { live, model } = await session(runtime, "omlx", "unpriced");
		await live.prompt("answer");
		const stats = live.getSessionStats();
		const cost = readSessionCost(live, runtime, model);
		live.dispose();
		assert.ok(stats.tokens.total > 0, "the session did consume");
		assert.equal(stats.cost, 0, "the host computes zero on a zero rate");
		assert.equal(cost.usd, null, "a zero computed on a zero rate is not recorded as free");
		assert.match(cost.unknown_reason ?? "", /catalogue/);
		assert.match(cost.unknown_reason ?? "", /omlx\/unpriced/, "the reason names the model");
		assert.equal(cost.basis, "host_catalogue");
	});

	it("a session that reported no usage has an unknown cost", async () => {
		await declareEndpoint();
		const runtime = await host();
		const { live, model } = await session(runtime, "omlx", "priced");
		const cost = readSessionCost(live, runtime, model);
		live.dispose();
		assert.equal(live.getSessionStats().tokens.total, 0);
		assert.equal(cost.usd, null);
		assert.match(cost.unknown_reason ?? "", /no usage/);
	});

	it("whether the provider is used through a subscription is what the host says of it", async () => {
		writeFileSync(join(root, "models.json"), JSON.stringify({ providers: {} }));
		writeFileSync(
			join(root, "auth.json"),
			JSON.stringify({
				anthropic: {
					type: "oauth",
					access: "sk-ant-oat01-not-a-token",
					refresh: "not-a-refresh-token",
					expires: Date.now() + 3_600_000,
				},
			}),
		);
		const runtime = await host();
		const { live, model } = await session(runtime, "anthropic", "claude-sonnet-5");
		const cost = readSessionCost(live, runtime, model);
		live.dispose();
		assert.equal(runtime.isUsingSubscription("anthropic"), true, "the host reads the credential as a subscription");
		assert.equal(cost.subscription, true);
		assert.equal(cost.usd, null, "nothing was sent, so nothing was consumed");
	});
});

describe("the worker reports the host's total with its last event (AGT-07)", () => {
	function worker(): PiWorkerAgent {
		return new PiWorkerAgent({
			config: {
				pi_package_dir: join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent"),
				pi_agent_dir: root,
				sandbox_backend: "unconfined",
				denied_read_paths: [],
				heartbeat_ms: 200,
			},
			silence_timeout_ms: 20_000,
			grace_ms: 500,
		});
	}
	const reviewer = (modelId: string) =>
		mandate("answer", root, {
			role: "review",
			tools: ["read"],
			model: { provider_id: "omlx", model_id: modelId, thinking_level: "off" },
			output_schema: "review-report",
			profile: {
				profile_id: "review",
				read_paths: [root],
				write_paths: [],
				network: "denied",
				env_allowlist: ["PATH"],
				env: {},
			},
		});
	const costOf = (events: Awaited<ReturnType<typeof collect>>): InterventionCost => {
		const last = events.at(-1);
		assert.ok(last && (last.type === "completed" || last.type === "failed" || last.type === "cancelled"));
		return last.cost;
	};

	it("a session on a priced model ends on the amount the host totals for the same answer", async () => {
		await declareEndpoint();
		const runtime = await host();
		const { live } = await session(runtime, "omlx", "priced");
		await live.prompt("answer");
		const expected = live.getSessionStats().cost;
		live.dispose();
		const events = await collect((await worker().startIntervention(reviewer("priced"))).events);
		assert.equal(events.at(-1)?.type, "completed");
		assert.deepEqual(costOf(events), { usd: expected, unknown_reason: null, basis: "host_catalogue", subscription: false });
	});

	it("a session on a model without a rate ends on an unknown cost", async () => {
		await declareEndpoint();
		const events = await collect((await worker().startIntervention(reviewer("unpriced"))).events);
		assert.equal(events.at(-1)?.type, "completed");
		const cost = costOf(events);
		assert.equal(cost.usd, null);
		assert.match(cost.unknown_reason ?? "", /catalogue/);
	});

	it("an intervention that never opened a session ends on an unknown cost", async () => {
		await declareEndpoint();
		const events = await collect((await worker().startIntervention(reviewer("not-declared"))).events);
		assert.equal(events.at(-1)?.type, "failed");
		const cost = costOf(events);
		assert.equal(cost.usd, null);
		assert.match(cost.unknown_reason ?? "", /session/);
	});
});

describe("the dossier carries the cost of each intervention (AGT-07)", () => {
	function project(): string {
		const p = tempDir("495-proj-");
		cleanups.push(p);
		fixtureTs(p);
		initRepo(p);
		return p;
	}
	const reported = (usd: number): InterventionCost => ({
		usd,
		unknown_reason: null,
		basis: "host_catalogue",
		subscription: true,
	});
	function finished(t: TestHarness, changeId: string): Extract<ChangeEvent, { type: "intervention.finished" }>[] {
		return t.ledger
			.readChangeEvents(changeId)
			.map((stored) => stored.event)
			.filter((e): e is Extract<ChangeEvent, { type: "intervention.finished" }> => e.type === "intervention.finished");
	}

	it("each finished intervention carries the cost its session reported, a stop on the tool-call bound included", async () => {
		const p = project();
		const t = makeHarness({
			policy: { budgets: { tool_calls_per_intervention: 2 } },
			defaultScript: { steps: [{ kind: "complete", output: specReport() }], cost: reported(0.0125) },
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "src/w1.js", content: "1\n" },
						{ kind: "write", path: "src/w2.js", content: "2\n" },
						{ kind: "write", path: "src/w3.js", content: "3\n" },
						{ kind: "complete", output: { summary: "done", changed_paths: [], tests_claimed: true, notes: [] } },
					],
					cost: reported(0.0375),
				},
			},
		});
		cleanups.push(t.root);
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 20 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.stop_reason, "budget_exhausted", "the producer was stopped on its bound");
		const records = finished(t, change.change_id);
		const roleOf = (id: string) => state.interventions.find((i) => i.intervention_id === id)?.role;
		const specify = records.find((e) => roleOf(e.intervention_id) === "specify");
		const implement = records.find((e) => roleOf(e.intervention_id) === "implement");
		assert.deepEqual(specify?.cost, reported(0.0125));
		assert.equal(implement?.result, "cancelled");
		assert.deepEqual(implement?.cost, reported(0.0375), "what was spent before the stop is in the dossier");
	});

	it("an intervention whose session reported no cost is recorded as unknown with its reason, never as zero", async () => {
		const p = project();
		const t = makeHarness();
		cleanups.push(t.root);
		const { change } = await t.harness.start({ project_path: p, request_text: "Keep greet behaviour", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 2 });
		const records = finished(t, change.change_id);
		assert.ok(records.length > 0, "an intervention ran");
		for (const record of records) {
			assert.equal(record.cost?.usd, null);
			assert.ok((record.cost?.unknown_reason ?? "").length > 0, "an unknown cost says why");
		}
	});
});
