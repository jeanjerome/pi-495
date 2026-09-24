/**
 * V3 — the worker observes each provider request through the hook Pi publishes,
 * `before_provider_request`, and the request leaves as the provider built it (CTX-02, D-55).
 *
 * A local server stands in for both providers and keeps every body it receives. The subscription
 * path is the real one: the host reads an OAuth credential whose token carries the subscription
 * prefix, and the Anthropic provider, routed to the stand-in by its catalogue, writes its own block
 * above the harness instructions. Nothing leaves the machine and no quota is spent.
 *
 * The host adds a section of its own to the instructions it is given — Pi 0.87.0 closes every
 * structured prompt with the session's working directory (`buildSystemPromptSections`). That part
 * is the host's, not the provider's, and the observation keeps the two apart.
 */
import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import * as pi from "@earendil-works/pi-coding-agent";
import { RequestLayerObserver, loadRequestObserver } from "../../src/adapters/pi-worker/provider-request.ts";
import { PiWorkerAgent } from "../../src/adapters/pi-worker/supervisor.ts";
import type { ObservedLayers } from "../../src/domain/imposed-layers.ts";
import type { InterventionEvent } from "../../src/ports/execution.ts";
import { collect, mandate } from "../helpers/intervention-fixture.ts";

const LOCAL = "You are the review role of the 495 harness.";
const IMPOSED = "You are Claude Code, Anthropic's official CLI for Claude.";

let root: string;
let server: Server | null = null;
let bodies: unknown[] = [];
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "request-hook-"));
	bodies = [];
});
afterEach(async () => {
	if (server) await new Promise<void>((done) => server?.close(() => done()));
	server = null;
	rmSync(root, { recursive: true, force: true });
});

const sse = (frames: Array<[string | null, unknown]>) =>
	frames.map(([event, data]) => `${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`).join("");

/** One prose answer, in the stream shape each provider reads. */
function answer(anthropic: boolean): string {
	if (anthropic)
		return sse([
			[
				"message_start",
				{
					type: "message_start",
					message: {
						id: "msg_1",
						type: "message",
						role: "assistant",
						model: "claude-sonnet-5",
						content: [],
						stop_reason: null,
						usage: { input_tokens: 40, output_tokens: 1 },
					},
				},
			],
			["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
			[
				"content_block_delta",
				{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "an answer" } },
			],
			["content_block_stop", { type: "content_block_stop", index: 0 }],
			["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }],
			["message_stop", { type: "message_stop" }],
		]);
	const head = { id: "hook-1", object: "chat.completion.chunk", created: 0, model: "local" };
	return `${sse([
		[null, { ...head, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }],
		[null, { ...head, choices: [{ index: 0, delta: { content: "an answer" }, finish_reason: null }] }],
		[
			null,
			{
				...head,
				choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
				usage: { prompt_tokens: 40, completion_tokens: 3, total_tokens: 43 },
			},
		],
	])}data: [DONE]\n\n`;
}

/**
 * The stand-in, a catalogue that routes both providers to it, and a subscription credential for
 * Anthropic that the host reads without refreshing.
 */
async function declareEndpoints(): Promise<void> {
	const listening = createServer((request, response) => {
		const chunks: Buffer[] = [];
		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("end", () => {
			bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
			response.end(answer(request.url?.includes("/messages") === true));
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
					models: [{ id: "local", reasoning: false, contextWindow: 128_000, maxTokens: 512 }],
				},
				anthropic: { baseUrl: `http://127.0.0.1:${port}` },
			},
		}),
	);
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
}

const settings = () => pi.SettingsManager.inMemory({ retry: { enabled: false } });

/** A session built the way the worker builds one, with the extensions it is given and nothing else. */
async function prompted(provider: string, modelId: string, extensions: pi.LoadExtensionsResult): Promise<void> {
	const runtime = await pi.ModelRuntime.create({
		authPath: join(root, "auth.json"),
		modelsPath: join(root, "models.json"),
	});
	const model = runtime.getModel(provider, modelId);
	assert.ok(model, `${provider}/${modelId} is declared to the host`);
	const resourceLoader: pi.ResourceLoader = {
		getExtensions: () => extensions,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => LOCAL,
		getSystemPromptSource: () => undefined,
		getAppendSystemPrompt: () => [],
		getAppendSystemPromptSources: () => [],
		extendResources: () => {},
		reload: async () => {},
	};
	const { session } = await pi.createAgentSession({
		cwd: root,
		agentDir: root,
		model,
		modelRuntime: runtime,
		resourceLoader,
		noTools: "all",
		tools: [],
		customTools: [],
		sessionManager: pi.SessionManager.inMemory(root),
		settingsManager: settings(),
	});
	await session.prompt("answer");
	session.dispose();
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

const reviewer = (provider_id: string, model_id: string) =>
	mandate("answer", root, {
		role: "review",
		system_prompt: LOCAL,
		tools: ["read"],
		model: { provider_id, model_id, thinking_level: "off", location: "on_machine" },
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

/** The section Pi closes its prompt with, naming the session's working directory. */
const cwdSection = () => `\n\n<cwd>\n${root}\n</cwd>`;

const observationsIn = (events: InterventionEvent[]): ObservedLayers[] =>
	events.flatMap((e) => (e.type === "imposed_layers_observed" ? [e.observation] : []));

describe("each provider request is observed through the hook Pi publishes (CTX-02, D-55)", () => {
	for (const [provider, modelId, above] of [
		["omlx", "local", []],
		["anthropic", "claude-sonnet-5", [IMPOSED]],
	] as const) {
		it(`the ${provider} stand-in receives the same request with the observer as without it`, async () => {
			await declareEndpoints();
			const reported: ObservedLayers[] = [];
			const observer = new RequestLayerObserver(
				provider === "anthropic" ? "anthropic-messages" : "openai-completions",
				LOCAL,
				(o) => reported.push(o),
			);
			const where = { cwd: root, agentDir: root, settingsManager: settings() };
			await prompted(provider, modelId, await loadRequestObserver(pi, where, observer));
			await prompted(provider, modelId, { extensions: [], errors: [], runtime: pi.createExtensionRuntime() });
			assert.equal(bodies.length, 2, "one request for each session");
			assert.deepEqual(bodies[0], bodies[1], "the observer left the request as the provider built it");
			assert.equal(reported.length, 1, "the observer did see the request it left alone");
			assert.deepEqual(reported[0], {
				status: "observed",
				api: provider === "anthropic" ? "anthropic-messages" : "openai-completions",
				above_local_instructions: above,
				below_local_instructions: [],
				added_by_host: [cwdSection()],
			});
		});
	}

	it("the worker reports the block the provider wrote above the harness instructions on the subscription path", async () => {
		await declareEndpoints();
		const events = await collect((await worker().startIntervention(reviewer("anthropic", "claude-sonnet-5"))).events);
		assert.equal(events.at(-1)?.type, "completed");
		assert.deepEqual(observationsIn(events), [
			{
				status: "observed",
				api: "anthropic-messages",
				above_local_instructions: [IMPOSED],
				below_local_instructions: [],
				added_by_host: [cwdSection()],
			},
		]);
	});

	it("the worker loads the observer and no extension the project or the agent directory offers", async () => {
		await declareEndpoints();
		const trap = (marker: string) =>
			`import { writeFileSync } from "node:fs";\nexport default function () { writeFileSync(${JSON.stringify(marker)}, "loaded"); }\n`;
		const agentMarker = join(root, "agent-extension-loaded");
		const projectMarker = join(root, "project-extension-loaded");
		mkdirSync(join(root, "extensions"), { recursive: true });
		mkdirSync(join(root, ".pi", "extensions"), { recursive: true });
		writeFileSync(join(root, "extensions", "trap.ts"), trap(agentMarker));
		writeFileSync(join(root, ".pi", "extensions", "trap.ts"), trap(projectMarker));
		// The control: Pi's own loader, left to discover, does load what the agent directory offers.
		const discovering = new pi.DefaultResourceLoader({ cwd: root, agentDir: root, settingsManager: settings() });
		await discovering.reload();
		assert.ok(existsSync(agentMarker), "the trap is one Pi loads when discovery is on");
		rmSync(agentMarker, { force: true });
		rmSync(projectMarker, { force: true });

		const events = await collect((await worker().startIntervention(reviewer("omlx", "local"))).events);
		assert.equal(events.at(-1)?.type, "completed");
		assert.ok(!existsSync(agentMarker), "an agent-directory extension was loaded into the worker");
		assert.ok(!existsSync(projectMarker), "a project extension was loaded into the worker");
		assert.deepEqual(observationsIn(events), [
			{
				status: "observed",
				api: "openai-completions",
				above_local_instructions: [],
				below_local_instructions: [],
				added_by_host: [cwdSection()],
			},
		]);
	});

	it("an observer that fails to read the payload returns nothing and reports it as not observed (6h)", () => {
		const reported: ObservedLayers[] = [];
		const observer = new RequestLayerObserver("anthropic-messages", LOCAL, (o) => reported.push(o));
		const hostile = new Proxy(
			{},
			{
				get() {
					throw new Error("a payload that cannot be read");
				},
			},
		);
		assert.equal(
			observer.observe(hostile, () => LOCAL),
			undefined,
			"the request is left as it was built",
		);
		const request = { messages: [{ role: "system", content: LOCAL }] };
		const hostSilent = () => {
			throw new Error("the host's prompt cannot be read");
		};
		assert.equal(observer.observe(request, hostSilent), undefined);
		assert.deepEqual(
			reported.map((o) => o.status),
			["not_observed", "not_observed"],
		);
		for (const o of reported) assert.match(o.status === "not_observed" ? o.reason : "", /cannot be read/);
	});

	it("identical requests are reported once, and a request that differs is reported again (6i)", () => {
		const reported: ObservedLayers[] = [];
		const observer = new RequestLayerObserver("openai-completions", LOCAL, (o) => reported.push(o));
		const request = (leading: string[]) => ({
			messages: [...leading.map((content) => ({ role: "system", content })), { role: "user", content: "go" }],
		});
		const host = () => LOCAL;
		observer.observe(request([LOCAL]), host);
		observer.observe(request([LOCAL]), host);
		observer.observe(request(["a preamble", LOCAL]), host);
		observer.observe(request(["a preamble", LOCAL]), host);
		assert.deepEqual(
			reported.map((o) => (o.status === "observed" ? o.above_local_instructions : o.status)),
			[[], ["a preamble"]],
		);
	});
});
