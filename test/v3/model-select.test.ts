/**
 * V3 — the model an intervention runs with is the one Pi holds as selected when it starts (AGT-07).
 * The selection is read once per intervention, from the context of the command that advances the
 * change: the capability check judges that reading, the start journals it and the worker is handed
 * it. Nothing of the selection is kept from session start, when a later `/model` has not happened yet.
 */
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import { ScriptedAgent } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import type { AgentCapabilities, ModelSelection } from "../../src/ports/execution.ts";
import { describedAs } from "../helpers/capabilities.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { PiRpcClient } from "../helpers/rpc-client.ts";

// Both stand-ins are registered in Pi at a loopback address, below, so they read as on this machine.
const FIRST: ModelSelection = {
	provider_id: "stand-in-a",
	model_id: "first-1",
	thinking_level: "off",
	location: "on_machine",
};
const SECOND: ModelSelection = {
	provider_id: "stand-in-b",
	model_id: "second-1",
	thinking_level: "off",
	location: "on_machine",
};
const NONE: ModelSelection = { provider_id: "", model_id: "", thinking_level: "off", location: "off_machine" };

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "model-select-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A scripted agent that describes the model it is asked about, and remembers every model it judged. */
class ModelJudgingAgent extends ScriptedAgent {
	readonly judged: ModelSelection[] = [];
	constructor() {
		super({ steps: [{ kind: "complete", output: specReport() }] });
	}
	override async describeCapabilities(model: ModelSelection): Promise<AgentCapabilities> {
		this.judged.push(model);
		return describedAs(model);
	}
}

function project(): string {
	const path = tempDir("495-model-select-");
	fixtureTs(path);
	initRepo(path);
	return path;
}

/** The model each intervention of the change journaled at its start, in order. */
function startedWith(ledger: SqliteLedger, changeId: string): ModelSelection[] {
	return ledger
		.readChangeEvents(changeId)
		.filter((e) => e.type === "intervention.started")
		.map((e) => (e.event as { model: ModelSelection }).model);
}

async function startChange(t: TestHarness, cleanup: string[]): Promise<string> {
	cleanup.push(t.root);
	const path = project();
	cleanup.push(path);
	const { change } = await t.harness.start({ project_path: path, request_text: "x", actor: HUMAN });
	return change.change_id;
}

describe("the model selected in Pi when an intervention starts (AGT-07)", () => {
	const cleanup: string[] = [];
	afterEach(() => {
		for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
	});

	it("a model selected between two interventions is the one the second starts with, and the first keeps its own (6b)", async () => {
		const agent = new ModelJudgingAgent();
		const t = makeHarness({ agent });
		const changeId = await startChange(t, cleanup);
		// One step opens the specifying intervention; four more reach the implementing one.
		await t.harness.advance(changeId, { max_steps: 1, readModel: () => FIRST });
		await t.harness.advance(changeId, { max_steps: 4, readModel: () => SECOND });
		assert.deepEqual(
			startedWith(t.ledger, changeId),
			[FIRST, SECOND],
			"the boundary between two models reads in the journal",
		);
	});

	it("each intervention reads the selection once, and the model judged is the one journaled and handed to the worker (§5, 6c)", async () => {
		const agent = new ModelJudgingAgent();
		const t = makeHarness({ agent });
		const changeId = await startChange(t, cleanup);
		const selections = [FIRST, SECOND];
		let reads = 0;
		// Every read after the first returns another model: a second read within one intervention
		// would journal or hand over a model other than the one judged.
		const readModel = (): ModelSelection => selections[Math.min(reads++, selections.length - 1)]!;
		await t.harness.advance(changeId, { max_steps: 5, readModel });
		assert.equal(reads, 2, "two interventions, one reading each");
		assert.deepEqual(agent.judged, [FIRST, SECOND], "the capability check judged each reading");
		assert.deepEqual(startedWith(t.ledger, changeId), [FIRST, SECOND], "each start journals the model judged");
		assert.deepEqual(
			agent.started.map((m) => m.model),
			[FIRST, SECOND],
			"each worker is handed the model judged",
		);
	});

	it("a thinking level changed alone is the one the next intervention starts with (6d)", async () => {
		const t = makeHarness({ agent: new ModelJudgingAgent() });
		const changeId = await startChange(t, cleanup);
		await t.harness.advance(changeId, { max_steps: 1, readModel: () => FIRST });
		await t.harness.advance(changeId, { max_steps: 4, readModel: () => ({ ...FIRST, thinking_level: "high" }) });
		assert.deepEqual(
			startedWith(t.ledger, changeId).map((m) => m.thinking_level),
			["off", "high"],
		);
	});

	it("a selection with no provider is refused by the capability check, and no worker starts (6e)", async () => {
		const agent = new ModelJudgingAgent();
		const t = makeHarness({ agent });
		const changeId = await startChange(t, cleanup);
		const result = await t.harness.advance(changeId, { max_steps: 1, readModel: () => NONE });
		assert.equal(result.stopped_because, "capability_missing");
		assert.deepEqual(agent.judged, [NONE], "the refusal is the model's, not the sandbox's");
		assert.deepEqual(agent.started, []);
		assert.deepEqual(startedWith(t.ledger, changeId), []);
	});

	it("a change refused for its model is resumed with the model selected since (6e)", async () => {
		const t = makeHarness({ agent: new ModelJudgingAgent() });
		const changeId = await startChange(t, cleanup);
		await t.harness.advance(changeId, { max_steps: 1, readModel: () => NONE });
		t.harness.resume(changeId, HUMAN);
		const result = await t.harness.advance(changeId, { max_steps: 1, readModel: () => FIRST });
		assert.notEqual(result.stopped_because, "capability_missing", result.steps.join(" | "));
		assert.deepEqual(startedWith(t.ledger, changeId), [FIRST]);
	});

	it("a producer refused for its model, then resumed, works in the one workspace prepared for it (6e)", async () => {
		const t = makeHarness({ agent: new ModelJudgingAgent() });
		const changeId = await startChange(t, cleanup);
		const workspaces = (): string[] => readdirSync(join(t.root, "workspaces"));
		await t.harness.advance(changeId, { max_steps: 1, readModel: () => FIRST });
		// Four steps reach the implementing one, which is refused before its producer starts.
		await t.harness.advance(changeId, { max_steps: 4, readModel: () => NONE });
		const prepared = workspaces();
		for (const model of [NONE, FIRST]) {
			t.harness.resume(changeId, HUMAN);
			await t.harness.advance(changeId, { max_steps: 1, readModel: () => model });
		}
		assert.deepEqual(startedWith(t.ledger, changeId), [FIRST, FIRST]);
		assert.deepEqual(workspaces(), prepared, "no workspace is created for a producer that never started");
		assert.equal(
			t.ledger.listArtifacts(changeId, "candidate").filter((a) => a.ref.artifact_id.startsWith("ws_")).length,
			1,
			"the dossier names one producer workspace",
		);
	});
});

/** The part of Pi's extension API the `/495` command reaches, recording what it is told. */
class FakePi {
	command: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | null = null;
	readonly said: string[] = [];
	registerCommand(_name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) {
		this.command = options.handler;
	}
	sendMessage(message: { content: string }): void {
		this.said.push(message.content);
	}
	appendEntry(): void {}
}

/** Pi's context for a client with no screen, whose model is read when it is asked for, as Pi does. */
class FakeRpcContext {
	readonly mode = "rpc";
	readonly hasUI = false;
	readonly thinkingLevel = "off";
	readonly modelRegistry = null;
	readonly sessionManager = { getSessionId: (): string => "session-model-select" };
	readonly cwd: string;
	private readonly selected: () => { provider: string; id: string; baseUrl: string } | undefined;
	constructor(cwd: string, selected: () => { provider: string; id: string; baseUrl: string } | undefined) {
		this.cwd = cwd;
		this.selected = selected;
	}
	get model(): { provider: string; id: string; baseUrl: string } | undefined {
		return this.selected();
	}
}

describe("a session opened with no model selected (6a)", () => {
	const saved: Record<string, string | undefined> = {};
	const env = (name: string, value: string): void => {
		if (!(name in saved)) saved[name] = process.env[name];
		process.env[name] = value;
	};
	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
			delete saved[name];
		}
	});

	it("runs its first intervention with the model selected before /495 start", async () => {
		const agentScript = join(root, "agent.json");
		// The intervention fails once it has started: its start is all this test reads.
		writeFileSync(agentScript, JSON.stringify({ default: { steps: [{ kind: "fail", error: "stop here" }] } }));
		env("HARNESS495_DATA_DIR", join(root, "data"));
		env("HARNESS495_SCRIPTED_AGENT", agentScript);
		if (process.platform !== "darwin") env("HARNESS495_ALLOW_UNCONFINED", "1");
		const cwd = project();
		const pi = new FakePi();
		const session = new ExtensionSession(pi as unknown as ExtensionAPI);
		registerCommand495(pi as unknown as ExtensionAPI, session);
		let selected: { provider: string; id: string; baseUrl: string } | undefined;
		try {
			session.openedAt(new FakeRpcContext(cwd, () => selected) as unknown as ExtensionContext);
			selected = { provider: FIRST.provider_id, id: FIRST.model_id, baseUrl: "http://127.0.0.1:9/v1" };
			await pi.command!(
				"start tidy greet",
				new FakeRpcContext(cwd, () => selected) as unknown as ExtensionCommandContext,
			);
			const changeId = session.binding?.change_id;
			assert.ok(changeId, pi.said.join(" | "));
			assert.deepEqual(startedWith(session.runtime().ledger, changeId), [FIRST], pi.said.join(" | "));
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

const PI = process.env.HARNESS495_PI_BIN ?? "pi";
function piAvailable(): boolean {
	try {
		execFileSync(PI, ["--version"], { stdio: "ignore", timeout: 20000 });
		return true;
	} catch {
		return false;
	}
}

/** Two models Pi can select; nothing listens at their address, and the scripted agent never calls them. */
function catalogueWithTwoModels(agentDir: string): void {
	mkdirSync(agentDir, { recursive: true });
	const provider = (id: string) => ({
		baseUrl: "http://127.0.0.1:9/v1",
		api: "openai-completions",
		apiKey: "not-a-secret-nothing-listens",
		models: [{ id, reasoning: false, contextWindow: 8192, maxTokens: 1024 }],
	});
	writeFileSync(
		join(agentDir, "models.json"),
		JSON.stringify({
			providers: {
				[FIRST.provider_id]: provider(FIRST.model_id),
				[SECOND.provider_id]: provider(SECOND.model_id),
			},
		}),
	);
}

describe("a session Pi replaced (6g)", {
	skip: !piAvailable() && "pi binary not available",
}, () => {
	it("runs the next intervention with the model selected in the replacing session", async () => {
		const agentDir = join(root, "agent");
		catalogueWithTwoModels(agentDir);
		const agentScript = join(root, "agent.json");
		writeFileSync(agentScript, JSON.stringify({ default: { steps: [{ kind: "fail", error: "stop here" }] } }));
		const dataDir = join(root, "data");
		const cwd = project();
		const client = new PiRpcClient({
			bin: PI,
			args: ["-ne", "--mode", "rpc", "--no-session", "-e", join(process.cwd(), "src", "extension", "index.ts")],
			cwd,
			env: {
				...process.env,
				PI_CODING_AGENT_DIR: agentDir,
				HARNESS495_DATA_DIR: dataDir,
				HARNESS495_SCRIPTED_AGENT: agentScript,
				...(process.platform !== "darwin" ? { HARNESS495_ALLOW_UNCONFINED: "1" } : {}),
			},
		});
		const call = async (id: string, command: Record<string, unknown>): Promise<Record<string, unknown>> => {
			client.send({ id, ...command });
			const response = await client.waitFor((e) => e.type === "response" && e.id === id, 60_000);
			await client.waitQuiet();
			return response as Record<string, unknown>;
		};
		try {
			assert.equal(
				(await call("first", { type: "set_model", provider: FIRST.provider_id, modelId: FIRST.model_id })).success,
				true,
			);
			// Pi replaces the session and loads 495 again, which opens its runtime before the second
			// model is selected (measured with Pi 0.87.1).
			assert.equal((await call("replace", { type: "new_session" })).success, true);
			assert.equal(
				(await call("second", { type: "set_model", provider: SECOND.provider_id, modelId: SECOND.model_id })).success,
				true,
			);
			await call("start", { type: "prompt", message: "/495 start tidy greet" });
		} finally {
			await client.close();
		}
		const said = client.messages().map((m) => m.content);
		const ledger = new SqliteLedger(join(dataDir, "state.sqlite"));
		try {
			const changeId = /Programme créé: \S+ \/ (\S+)/.exec(said.join("\n"))?.[1];
			assert.ok(changeId, said.join(" | "));
			assert.deepEqual(startedWith(ledger, changeId), [SECOND], said.join(" | "));
		} finally {
			ledger.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
