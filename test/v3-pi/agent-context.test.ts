/**
 * V3 — the agent reports the context of its session after each answer, as the host counts it.
 * A local server stands in for a compatible endpoint and reports the same usage for every answer;
 * the catalogue declares the window of the model. No model is called and nothing leaves the machine.
 */
import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PiWorkerAgent } from "../../src/adapters/pi-worker/supervisor.ts";
import { collect, mandate } from "../helpers/intervention-fixture.ts";
import { removedAfterEach, outputDir } from "../helpers/fixtures.ts";
import { openaiChunks } from "../helpers/openai-chunks.ts";

let root: string;
let server: Server | null = null;
beforeEach(() => {
	root = outputDir("context-", cleanups);
});
afterEach(async () => {
	if (server) await new Promise<void>((done) => server?.close(() => done()));
	server = null;
});
/** Registered after the teardown above, so the directories are removed once it has run. */
const cleanups = removedAfterEach();

/** An answer that calls the read tool on `notes.md`, then waits for its result. */
const READS_NOTES = {
	tool_calls: [
		{ index: 0, id: "call_1", type: "function", function: { name: "read", arguments: '{"path":"notes.md"}' } },
	],
};

/**
 * The stand-in endpoint, on a model of 128,000 tokens. It plays `answers` in turn, one per request,
 * and declares for each the tokens it gives; by default, a single answer of 400 tokens.
 */
async function declareEndpoint(
	answers: { delta: Record<string, unknown>; total: number }[] = [{ delta: { content: "an answer" }, total: 400 }],
): Promise<void> {
	let requests = 0;
	const listening = createServer((request, response) => {
		request.on("data", () => {});
		request.on("end", () => {
			const answer = answers[Math.min(requests++, answers.length - 1)]!;
			response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
			const chunks = openaiChunks(
				{ id: `context-${requests}`, model: "local" },
				answer.delta,
				{ prompt_tokens: answer.total - 20, completion_tokens: 20, total_tokens: answer.total },
				"tool_calls" in answer.delta ? "tool_calls" : "stop",
			);
			for (const chunk of chunks) response.write(`data: ${chunk}\n\n`);
			response.end();
		});
	});
	server = listening;
	await new Promise<void>((ready) => listening.listen(0, "127.0.0.1", ready));
	const port = (listening.address() as { port: number }).port;
	writeFileSync(
		join(root, "models.json"),
		JSON.stringify({
			providers: {
				omlx: {
					baseUrl: `http://127.0.0.1:${port}/v1`,
					api: "openai-completions",
					apiKey: "not-a-secret-this-server-ignores-it",
					models: [{ id: "windowed", reasoning: false, contextWindow: 128_000, maxTokens: 512 }],
				},
			},
		}),
	);
}

/** A reviewer on the stand-in model, which may read the files of `root`. */
function reviewer() {
	return mandate("answer", root, {
		role: "review",
		tools: ["read"],
		model: { provider_id: "omlx", model_id: "windowed", thinking_level: "off", location: "on_machine" },
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
}

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

describe("the agent reports the context of its session after each answer", () => {
	it("an intervention whose local server declares 400 tokens for the answer, on a model whose window is 128,000 tokens, sends after the answer a model event of kind context that carries 400 tokens and a window of 128,000", async () => {
		await declareEndpoint();
		const events = await collect((await worker().startIntervention(reviewer())).events);
		assert.equal(events.at(-1)?.type, "completed");
		const answered = events.findIndex((e) => e.type === "model_event" && e.kind === "usage");
		assert.ok(answered >= 0, "the model answered");
		const reported = events.findIndex((e) => e.type === "model_event" && e.kind === "context");
		const context = events[reported];
		assert.deepEqual(
			context && { ...context, at: "" },
			{ type: "model_event", at: "", kind: "context", tokens: 400, context_window: 128_000 },
			"a model event of kind context carries the tokens and the window the host counts",
		);
		assert.ok(reported > answered, "the context is reported after the answer");
	});

	it("an intervention whose model reads a file before answering, in two answers of 400 then 900 tokens, sends a model event of kind context after each answer, the last one carrying 900 tokens", async () => {
		writeFileSync(join(root, "notes.md"), "a note the reviewer reads\n");
		await declareEndpoint([
			{ delta: READS_NOTES, total: 400 },
			{ delta: { content: "an answer" }, total: 900 },
		]);
		const events = await collect((await worker().startIntervention(reviewer())).events);
		assert.equal(events.at(-1)?.type, "completed");
		const reports = events.flatMap((e, i) => (e.type === "model_event" && e.kind === "context" ? [i] : []));
		const answers = events.flatMap((e, i) => (e.type === "model_event" && e.kind === "usage" ? [i] : []));
		assert.equal(answers.length, 2, "the model answered twice");
		assert.equal(reports.length, 2, "a context is reported after each answer, not once for the session");
		assert.ok(answers[0]! < reports[0]! && reports[0]! < answers[1]!, "the first context follows the first answer");
		assert.ok(answers[1]! < reports[1]!, "the second context follows the second answer");
		const last = events[reports[1]!];
		assert.equal(last?.type === "model_event" && last.kind === "context" && last.tokens, 900);
	});
});
