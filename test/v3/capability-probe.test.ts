/**
 * V3 — what the installed Pi reports of a model, and what only the endpoint can answer (AGT-01,
 * AGT-02, D-55). A local server stands in for a compatible endpoint: one variant calls the tool it
 * is given, the other answers in prose. No model is called and nothing leaves the machine.
 */
import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { PiModelDescription } from "../../src/adapters/pi-worker/capabilities.ts";
import type { ModelSelection } from "../../src/ports/execution.ts";

let root: string;
let server: Server | null = null;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "probe-"));
});
afterEach(async () => {
	if (server) await new Promise<void>((done) => server?.close(() => done()));
	server = null;
	rmSync(root, { recursive: true, force: true });
});

/** The chunks an OpenAI-compatible server streams, with or without a tool call. */
function chunks(callsTool: boolean): string[] {
	const head = { id: "probe-1", object: "chat.completion.chunk", created: 0, model: "local-1" };
	const delta = callsTool
		? {
				tool_calls: [
					{
						index: 0,
						id: "call_1",
						type: "function",
						function: { name: "harness495_probe", arguments: '{"ready":true}' },
					},
				],
			}
		: { content: "I am ready." };
	return [
		JSON.stringify({ ...head, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }),
		JSON.stringify({ ...head, choices: [{ index: 0, delta, finish_reason: null }] }),
		JSON.stringify({
			...head,
			choices: [{ index: 0, delta: {}, finish_reason: callsTool ? "tool_calls" : "stop" }],
			usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
		}),
		"[DONE]",
	];
}

/** Starts the stand-in endpoint and declares it to Pi exactly as a local server is declared. */
async function endpoint(callsTool: boolean, tools: string[] = []): Promise<number> {
	const listening = createServer((request, response) => {
		let body = "";
		request.on("data", (d: Buffer) => {
			body += d.toString("utf8");
		});
		request.on("end", () => {
			tools.push(
				...((JSON.parse(body || "{}") as { tools?: { function?: { name?: string } }[] }).tools ?? []).map(
					(t) => t.function?.name ?? "?",
				),
			);
			response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
			for (const chunk of chunks(callsTool)) response.write(`data: ${chunk}\n\n`);
			response.end();
		});
	});
	server = listening;
	await new Promise<void>((ready) => listening.listen(0, "127.0.0.1", ready));
	return (listening.address() as { port: number }).port;
}

async function catalogue(port: number, over: Record<string, unknown> = {}): Promise<ModelRegistry> {
	writeFileSync(
		join(root, "models.json"),
		JSON.stringify({
			providers: {
				omlx: {
					baseUrl: `http://127.0.0.1:${port}/v1`,
					api: "openai-completions",
					apiKey: "not-a-secret-this-server-ignores-it",
					models: [{ id: "local-1", reasoning: false, contextWindow: 8192, maxTokens: 1024, ...over }],
				},
			},
		}),
	);
	const runtime = await ModelRuntime.create({
		authPath: join(root, "auth.json"),
		modelsPath: join(root, "models.json"),
	});
	return new ModelRegistry(runtime);
}

const selection = (over: Partial<ModelSelection> = {}): ModelSelection => ({
	provider_id: "omlx",
	model_id: "local-1",
	thinking_level: "off",
	...over,
});

describe("what the host reports of a model, and what only the endpoint answers (AGT-01, AGT-02)", () => {
	it("reads the limits and the accepted thinking levels from the host, not from the request", async () => {
		const described = await new PiModelDescription(await catalogue(await endpoint(true))).describe(
			selection({ thinking_level: "high" }),
		);
		assert.equal(described.available, true);
		assert.equal(described.limits.origin, "reported");
		assert.deepEqual(described.limits.value, {
			context_window_tokens: 8192,
			max_output_tokens: 1024,
			max_request_bytes: null,
		});
		assert.deepEqual(
			described.thinking_levels.value,
			["off"],
			"a model declared without reasoning accepts one level, whatever the request asks for",
		);
	});

	it("an endpoint that calls the tool it is given proves the format the host reports of no model", async () => {
		const offered: string[] = [];
		const described = await new PiModelDescription(await catalogue(await endpoint(true, offered))).describe(
			selection(),
		);
		assert.equal(described.tools.value, true);
		assert.equal(described.tools.origin, "reported");
		assert.deepEqual(offered, ["harness495_probe"], "one tool was offered, and it is the probe's own");
	});

	it("an endpoint that answers in prose is not qualified by the compatibility it announces", async () => {
		const described = await new PiModelDescription(await catalogue(await endpoint(false))).describe(selection());
		assert.equal(described.tools.value, false, "the declaration said openai-completions; the answer says otherwise");
		assert.equal(described.available, true, "the pair is reachable: what it cannot do is said by the fact");
		assert.ok(described.tools.note.length > 0);
	});

	it("a pair the host does not carry is unavailable, and the endpoint is never asked", async () => {
		const offered: string[] = [];
		const described = await new PiModelDescription(await catalogue(await endpoint(true, offered))).describe(
			selection({ model_id: "never-configured" }),
		);
		assert.equal(described.available, false);
		assert.deepEqual(offered, []);
	});

	it("a model the host reports as reasoning carries the levels the host derives, not a list of 495's", async () => {
		const described = await new PiModelDescription(
			await catalogue(await endpoint(true), { reasoning: true, thinkingLevelMap: { low: null } }),
		).describe(selection());
		assert.deepEqual(described.thinking_levels.value, ["off", "minimal", "medium", "high"]);
	});
});
