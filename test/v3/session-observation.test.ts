/**
 * V3 — what a Pi session reports of itself, and what the worker was leaving unread (CTX-02, AGT-02,
 * D-55). A local server stands in for a compatible endpoint, declared with a context window small
 * enough that Pi rewrites the conversation. No model is called and nothing leaves the machine.
 */
import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ModelRuntime, SessionManager, SettingsManager, createAgentSession } from "@earendil-works/pi-coding-agent";
import { observeSessionEvent, type SessionEventRead } from "../../src/adapters/pi-worker/session-observer.ts";
import type { InterventionEvent } from "../../src/ports/execution.ts";

let root: string;
let server: Server | null = null;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "observe-"));
});
afterEach(async () => {
	if (server) await new Promise<void>((done) => server?.close(() => done()));
	server = null;
	rmSync(root, { recursive: true, force: true });
});

/** One prose answer, with the usage an OpenAI-compatible server reports for it. */
function chunks(text: string, total: number): string[] {
	const head = { id: "obs-1", object: "chat.completion.chunk", created: 0, model: "local-1" };
	return [
		JSON.stringify({ ...head, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }),
		JSON.stringify({ ...head, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }),
		JSON.stringify({
			...head,
			choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
			usage: { prompt_tokens: total - 20, completion_tokens: 20, total_tokens: total },
		}),
		"[DONE]",
	];
}

/** A conversation that grows: each answer reports a context larger than the one before it. */
async function endpoint(): Promise<number> {
	let answered = 0;
	const listening = createServer((request, response) => {
		request.on("data", () => {});
		request.on("end", () => {
			answered += 1;
			response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
			const answer = chunks("## Goal\nreply\n\n## Next Steps\n1. continue", 400 * answered);
			for (const chunk of answer) response.write(`data: ${chunk}\n\n`);
			response.end();
		});
	});
	server = listening;
	await new Promise<void>((ready) => listening.listen(0, "127.0.0.1", ready));
	return (listening.address() as { port: number }).port;
}

/** A session on the stand-in endpoint, built as the worker builds one. */
async function session(contextWindow: number) {
	const port = await endpoint();
	writeFileSync(
		join(root, "models.json"),
		JSON.stringify({
			providers: {
				omlx: {
					baseUrl: `http://127.0.0.1:${port}/v1`,
					api: "openai-completions",
					apiKey: "not-a-secret-this-server-ignores-it",
					models: [{ id: "local-1", reasoning: false, contextWindow, maxTokens: 512 }],
				},
			},
		}),
	);
	const modelRuntime = await ModelRuntime.create({
		authPath: join(root, "auth.json"),
		modelsPath: join(root, "models.json"),
	});
	const model = modelRuntime.getModel("omlx", "local-1");
	assert.ok(model, "the stand-in endpoint is declared to the host");
	const created = await createAgentSession({
		cwd: root,
		model,
		modelRuntime,
		noTools: "all",
		tools: [],
		customTools: [],
		sessionManager: SessionManager.inMemory(root),
		settingsManager: SettingsManager.inMemory({
			compaction: { enabled: true, reserveTokens: 9000, keepRecentTokens: 1 },
			retry: { enabled: false },
		}),
	});
	return created.session;
}

describe("what a session reports of the context it rewrote (CTX-02, D-55)", () => {
	it("counts the summary and names the rewrite when the window forces one", async () => {
		const live = await session(10_000);
		const seen: InterventionEvent[] = [];
		let tokens = 0;
		live.subscribe((event) => {
			const observed = observeSessionEvent(event as unknown as SessionEventRead, "2026-09-22T00:00:00.000Z");
			tokens += observed.tokens;
			seen.push(...observed.events);
		});
		for (const ask of ["first", "second", "third", "fourth"]) await live.prompt(ask);
		live.dispose();
		const compacted = seen.filter((e) => e.type === "context_compacted");
		assert.equal(compacted.length > 0, true, "the host rewrote the context and said so");
		const first = compacted[0];
		assert.ok(first && first.type === "context_compacted");
		assert.equal(first.reason, "threshold");
		assert.equal(first.unwritten, null, "the summary was written");
		assert.ok((first.tokens_before ?? 0) > 0, "what the summary replaced is reported");
		assert.ok(first.summary_tokens > 0, "producing the summary consumed tokens");
		const answers = seen
			.filter((e) => e.type === "model_event" && e.kind === "usage")
			.reduce((sum, e) => sum + (e.type === "model_event" ? (e.tokens ?? 0) : 0), 0);
		assert.equal(
			tokens,
			answers + compacted.reduce((sum, e) => sum + (e.type === "context_compacted" ? e.summary_tokens : 0), 0),
		);
		assert.ok(tokens > answers, "the counter carries the summary on top of the answers");
	});

	it("keeps the answers it already carried, and says nothing of an event it does not read", () => {
		const answered = observeSessionEvent(
			{
				type: "message_end",
				message: {
					role: "assistant",
					usage: { totalTokens: 42 },
					content: [{ type: "text", text: "done" }],
					stopReason: "stop",
				},
			},
			"2026-09-22T00:00:00.000Z",
		);
		assert.equal(answered.tokens, 42);
		assert.equal(answered.text, "done");
		assert.deepEqual(answered.events, [
			{ type: "model_event", at: "2026-09-22T00:00:00.000Z", kind: "usage", tokens: 42 },
		]);
		const ignored = observeSessionEvent({ type: "queue_update" }, "2026-09-22T00:00:00.000Z");
		assert.deepEqual(ignored, { tokens: 0, events: [] });
	});

	it("a rewrite that did not happen is reported as not having happened", () => {
		const aborted = observeSessionEvent(
			{ type: "compaction_end", reason: "overflow", result: undefined, aborted: true },
			"2026-09-22T00:00:00.000Z",
		);
		assert.equal(aborted.tokens, 0);
		assert.deepEqual(aborted.events, [
			{
				type: "context_compacted",
				at: "2026-09-22T00:00:00.000Z",
				reason: "overflow",
				tokens_before: null,
				tokens_after: null,
				summary_tokens: 0,
				unwritten: "aborted",
			},
		]);
	});
});
