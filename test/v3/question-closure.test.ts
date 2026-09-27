/**
 * V3 — `/495 close <question>` closes a material question from Pi, from the stop of a stalled
 * specification (BES-02), on the model of `/495 cancel`: binding required, human provenance
 * required, confirmation on a dialog-capable session, then the change is conducted onward as after
 * `/495 resume`. The conversational tool offers no closure at all: none of its seven operations
 * decides, adopts or closes.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerCommand495 } from "../../src/extension/command.ts";
import { registerTool495 } from "../../src/extension/tool.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";

const RPC_ACTOR = "owner-1";

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "question-closure-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function project(): string {
	const path = tempDir("495-question-closure-");
	fixtureTs(path);
	initRepo(path);
	return path;
}

/** A report that only ever asks Q1, and never declares it: replayed identically on every round, it
 * never carries the answer the owner gives, so the change stalls on it once, exactly as e01s02
 * already pins for a lost answer — no second, distinct script is needed to reach that stop. */
const ASKS_Q1 = {
	objective: "x",
	facts: [],
	assumptions: [],
	questions: [{ id: "q1", question: "422 ou 400 ?", material: true }],
	answers: [],
	out_of_scope: [],
	risks: [],
	requirements: [
		{
			requirement_id: "R1",
			statement: "le refus est exposé",
			mandatory: true,
			criterion: "le scénario le vérifie",
			category: "interface",
			satisfied_by_reference: true,
		},
	],
	design: { summary: "x", components: [], interfaces: [], risks: [] },
};

class FakePi {
	command: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | null = null;
	readonly said: string[] = [];
	registerCommand(_name: string, options: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) {
		this.command = options.handler;
	}
	registerTool(_def: unknown): void {}
	registerMessageRenderer(): void {}
	on(): void {}
	sendMessage(message: { content: string }): void {
		this.said.push(message.content);
	}
	appendEntry(): void {}
}

/**
 * Pi's context: only what session.ts, command.ts and conduct.ts actually read. `rpc` is used for the
 * dialog-capable cases instead of `tui`, so the confirmation and the decision it exercises are real
 * (`hasUI` is true in both, per Pi's own contract) without pulling in the terminal's own rendering
 * primitives, which nothing here needs to draw.
 */
class FakeContext {
	readonly mode: "rpc" | "json";
	readonly hasUI: boolean;
	readonly thinkingLevel = "off";
	readonly modelRegistry = null;
	readonly model = { provider: "stand-in", id: "scripted-1", baseUrl: "http://127.0.0.1:9/v1" };
	readonly cwd: string;
	readonly sessionManager: { getSessionId: () => string };
	readonly confirmAnswer: boolean;
	confirmations = 0;
	/** Set by a test that needs to observe session state at the moment a confirmation is put, before
	 * the fake answers it. */
	onConfirm: (() => void) | null = null;
	readonly ui: {
		select: (q: string, opts: string[]) => Promise<string | null>;
		input: (prompt: string) => Promise<string | null>;
		confirm: (title: string, message: string) => Promise<boolean>;
		notify: (text: string, level?: string) => void;
		setStatus: (id: string, text: string) => void;
	};
	constructor(cwd: string, mode: "rpc" | "json", sessionId: string, confirmAnswer = true) {
		this.cwd = cwd;
		this.mode = mode;
		this.hasUI = mode === "rpc";
		this.sessionManager = { getSessionId: () => sessionId };
		this.confirmAnswer = confirmAnswer;
		this.ui = {
			select: async (_q, opts) => opts[0] ?? null,
			input: async () => "réponse à la question",
			confirm: async () => {
				this.confirmations++;
				this.onConfirm?.();
				return this.confirmAnswer;
			},
			notify: () => undefined,
			setStatus: () => undefined,
		};
	}
}

/** Starts a change whose only material question is asked, answered, then lost by the report that
 * never declared it: the change stalls in clarification for stagnation, naming q1. */
async function stalledOnQ1(
	dataDir: string,
	cwd: string,
): Promise<{ pi: FakePi; session: ExtensionSession; ctx: FakeContext; changeId: string }> {
	const agentScript = join(dataDir, "agent.json");
	writeFileSync(
		agentScript,
		JSON.stringify({
			default: { steps: [{ kind: "fail", error: "not reached" }] },
			roles: { specify: { steps: [{ kind: "complete", output: ASKS_Q1 }] } },
		}),
	);
	process.env.HARNESS495_DATA_DIR = join(dataDir, "data");
	process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
	process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
	if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi as unknown as ExtensionAPI);
	registerCommand495(pi as unknown as ExtensionAPI, session);
	const ctx = new FakeContext(cwd, "rpc", "s-question-closure");
	session.openedAt(ctx as unknown as ExtensionContext);
	// `start` conducts the change itself (`conduct` -> `advance` then `presentDecisions`): the fake UI
	// already answers Q1 there, so no separate `/495 decide` is needed. What it does not do is drive
	// `advance` again on the answer just given; `resume` does, reaching the round that loses it.
	await pi.command!("start x", ctx as unknown as ExtensionCommandContext);
	if (!session.binding) throw new Error(`start did not bind: ${pi.said.join(" | ")}`);
	const changeId = session.binding.change_id;
	assert.ok(
		session
			.runtime()
			.ledger.loadChange(changeId)!
			.state.open_questions.find((q) => q.id === "q1")?.answer,
		pi.said.join(" | "),
	);
	await pi.command!("resume", ctx as unknown as ExtensionCommandContext);
	const state = session.runtime().ledger.loadChange(changeId)!.state;
	assert.equal(state.status, "blocked", pi.said.join(" | "));
	assert.equal(state.stop_reason, "stagnation", pi.said.join(" | "));
	assert.ok(state.stop_detail?.includes("q1"), state.stop_detail ?? "");
	return { pi, session, ctx, changeId };
}

describe("`/495 close <question>` closes a material question from the stop of a stalled specification (BES-02)", () => {
	const saved: Record<string, string | undefined> = {};
	beforeEach(() => {
		for (const name of [
			"HARNESS495_DATA_DIR",
			"HARNESS495_SCRIPTED_AGENT",
			"HARNESS495_ALLOW_UNCONFINED",
			"HARNESS495_RPC_HUMAN_ACTOR",
			"HARNESS495_LANGUAGE",
		])
			saved[name] = process.env[name];
	});
	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it("is refused for a session with no binding", async () => {
		const cwd = project();
		process.env.HARNESS495_DATA_DIR = join(root, "data-unbound");
		const pi = new FakePi();
		const session = new ExtensionSession(pi as unknown as ExtensionAPI);
		registerCommand495(pi as unknown as ExtensionAPI, session);
		const ctx = new FakeContext(cwd, "rpc", "s-unbound");
		session.openedAt(ctx as unknown as ExtensionContext);
		try {
			await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m === "no binding"),
				pi.said.join(" | "),
			);
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("is refused without naming a question, saying its usage, once bound", async () => {
		const cwd = project();
		const { pi, session, ctx } = await stalledOnQ1(root, cwd);
		try {
			await pi.command!("close", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m.includes("usage: /495 close")),
				pi.said.join(" | "),
			);
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("is refused while the session is already busy, and inscribes nothing (BES-02)", async () => {
		const cwd = project();
		delete process.env.HARNESS495_LANGUAGE;
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd);
		try {
			session.busy = true;
			try {
				await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			} finally {
				session.busy = false;
			}
			assert.equal(ctx.confirmations, 0, "the confirmation is never put to the owner while busy");
			assert.ok(
				pi.said.some((m) => m.includes("opération est déjà en cours")),
				pi.said.join(" | "),
			);
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.equal(state.open_questions.find((q) => q.id === "q1")?.closed_at, null, "nothing is inscribed");
			assert.equal(state.status, "blocked", "the change stays stopped");
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("refuses a busy session in the session's own language, English included, not always in French (BES-02)", async () => {
		const cwd = project();
		process.env.HARNESS495_LANGUAGE = "en";
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd);
		try {
			assert.equal(session.lang(), "en");
			session.busy = true;
			try {
				await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			} finally {
				session.busy = false;
			}
			assert.ok(
				pi.said.some((m) => m.includes("operation is already running")),
				pi.said.join(" | "),
			);
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.equal(state.open_questions.find((q) => q.id === "q1")?.closed_at, null, "nothing is inscribed");
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("holds busy from the confirmation through the write, and releases it before conduct (BES-02)", async () => {
		const cwd = project();
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd);
		try {
			let busyDuringConfirm: boolean | undefined;
			ctx.onConfirm = () => {
				busyDuringConfirm = session.busy;
			};
			await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			assert.equal(busyDuringConfirm, true, "busy is held while the confirmation is put to the owner");
			// `conduct` itself refuses busy at its own entry (`conduct.ts`): if it ran while `close` still
			// held the flag, this is the message it would have said instead of advancing.
			assert.ok(
				!pi.said.some((m) => m === session.busyRefusal()),
				"conduct is not itself refused as busy, so busy was released before it started",
			);
			assert.equal(session.busy, false, "busy is released once the closure inscribes, before conduct runs");
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.ok(state.open_questions.find((q) => q.id === "q1")?.closed_at, "the closure still inscribes");
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("is refused in a mode without a screen, saying a human origin is required, and inscribes nothing (6i)", async () => {
		const cwd = project();
		const { pi, session, changeId } = await stalledOnQ1(root, cwd);
		try {
			const jsonCtx = new FakeContext(cwd, "json", "s-question-closure");
			await pi.command!("close q1", jsonCtx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => /human origin|provenance humaine/.test(m)),
				pi.said.join(" | "),
			);
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.equal(state.open_questions.find((q) => q.id === "q1")?.closed_at, null, "nothing is inscribed");
			assert.equal(state.status, "blocked", "the change stays stopped");
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("inscribes nothing and leaves the change stopped when the confirmation is refused (6k)", async () => {
		const cwd = project();
		const { pi, session, changeId } = await stalledOnQ1(root, cwd);
		try {
			const refusing = new FakeContext(cwd, "rpc", "s-question-closure", false);
			await pi.command!("close q1", refusing as unknown as ExtensionCommandContext);
			assert.equal(refusing.confirmations, 1, "the closure is put to the owner before anything is inscribed");
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			assert.equal(state.open_questions.find((q) => q.id === "q1")?.closed_at, null, "nothing is inscribed");
			assert.equal(state.status, "blocked", "the change stays stopped");
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("displays the code and the reason of a closure the kernel refuses (6j)", async () => {
		const cwd = project();
		const { pi, session, ctx } = await stalledOnQ1(root, cwd);
		try {
			await pi.command!("close not-a-question", ctx as unknown as ExtensionCommandContext);
			assert.ok(
				pi.said.some((m) => m.includes("495 error:") && m.includes("UNKNOWN_REFERENCE")),
				pi.said.join(" | "),
			);
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("closes the question under the human actor, confirmed, and conducts the change onward as after a resume", async () => {
		const cwd = project();
		const { pi, session, ctx, changeId } = await stalledOnQ1(root, cwd);
		try {
			await pi.command!("close q1", ctx as unknown as ExtensionCommandContext);
			assert.ok(!pi.said.some((m) => m.startsWith("495 error:")), pi.said.join(" | "));
			const state = session.runtime().ledger.loadChange(changeId)!.state;
			const q1 = state.open_questions.find((q) => q.id === "q1")!;
			assert.ok(q1.closed_at, "the question is closed");
			assert.equal(q1.closed_by?.actor_id, RPC_ACTOR);
			assert.notEqual(state.stop_reason, "stagnation", "the stagnation stop the closure answers is lifted");
			// Lifting the stop is not conducting: the domain event alone leaves phase and gates untouched.
			// What only `conduct` reaches is asserted here, so removing its call after the closure (as after
			// a resume) leaves the change ready but stuck in clarifying, unnoticed by the assertions above.
			assert.equal(state.gates.G0?.verdict, "PASS", "G0 is evaluated once the closure settles the report");
			assert.ok(state.adopted.mandate, "the mandate the settled report proposes is carried to adoption");
			assert.notEqual(state.phase, "clarifying", "the change moves past clarifying, as after a resume");
		} finally {
			await session.close();
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("the conversational tool offers no closure (BES-02, M3)", () => {
	it("is pinned to its seven operations: none decides, adopts or closes", () => {
		let captured: { parameters: { properties: { operation: { enum: string[] } } } } | undefined;
		const pi = {
			registerTool: (def: unknown) => {
				captured = def as typeof captured;
			},
		};
		registerTool495(pi as unknown as ExtensionAPI, {} as unknown as ExtensionSession);
		assert.ok(captured, "the tool is registered");
		const ops = captured!.parameters.properties.operation.enum;
		assert.deepEqual(
			[...ops].sort(),
			["export", "list_pending_decisions", "report", "review_summary", "start", "status", "verify"].sort(),
		);
		for (const forbidden of ["decide", "adopt", "close", "cancel", "resume", "pause", "revoke"])
			assert.equal(ops.includes(forbidden), false, `${forbidden} must not be an operation of harness495`);
	});
});
