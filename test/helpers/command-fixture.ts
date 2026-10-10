/**
 * The Pi host a `/495` subcommand runs in, faked down to what session.ts, command.ts and conduct.ts
 * read, and a change stopped in clarification because its specification loses the answer to Q1.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Phase } from "../../src/contracts/v1/common.ts";
import { registerCommand495 } from "../../src/extension/command.ts";
import { selectedModel } from "../../src/extension/conduct.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { NO_QUALIFIED_SANDBOX, fixtureTs, initRepo, tempDir } from "./fixtures.ts";

export const RPC_ACTOR = "owner-1";

/** The environment a command test sets for the harness runtime, saved and restored around each test. */
export const HARNESS_ENV = [
	"HARNESS495_DATA_DIR",
	"HARNESS495_SCRIPTED_AGENT",
	"HARNESS495_ALLOW_UNCONFINED",
	"HARNESS495_RPC_HUMAN_ACTOR",
	"HARNESS495_LANGUAGE",
] as const;

export function commandProject(prefix: string, cleanups?: string[]): string {
	const path = tempDir(prefix, cleanups);
	fixtureTs(path);
	initRepo(path);
	return path;
}

/** A report that only ever asks Q1, and never declares it: replayed identically on every round, it
 * never carries the answer the owner gives, so the change stalls on it once, as a specification that
 * loses an answer does — no second, distinct script is needed to reach that stop. */
export const ASKS_Q1 = {
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
	design: {
		summary: "x",
		components: [],
		interfaces: [],
		risks: [],
		tasks: [
			{
				task_id: "T1",
				summary: "x",
				responsibility: "greet",
				requirement_ids: ["R1"],
				depends_on: [],
				paths: ["src/greet.js"],
				checks: ["node --test"],
			},
		],
	},
};

export class FakePi {
	command: ((args: string, ctx: ExtensionCommandContext) => Promise<void>) | null = null;
	readonly said: string[] = [];
	/** The structured details handed with each message, in the order of `said`. */
	readonly details: unknown[] = [];
	/** What `/495` says of itself in Pi's command list. */
	description = "";
	registerCommand(
		_name: string,
		options: { description?: string; handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> },
	) {
		this.description = options.description ?? "";
		this.command = options.handler;
	}

	registerTool(_def: unknown): void {}
	registerMessageRenderer(): void {}
	on(): void {}
	sendMessage(message: { content: string; details?: unknown }): void {
		this.said.push(message.content);
		this.details.push(message.details);
	}
	appendEntry(): void {}

	/** This fake as the extension API 495 is registered on: it implements only what 495 reaches. */
	host(): ExtensionAPI {
		return this as unknown as ExtensionAPI;
	}

	/** Runs `/495 <args>` in `ctx`, once the command is registered. */
	async run(args: string, ctx: FakeContext): Promise<void> {
		assert.ok(this.command, "/495 is registered");
		await this.command(args, ctx.asCommand());
	}
}

/**
 * Pi's context: only what session.ts, command.ts and conduct.ts actually read. `rpc` is used for the
 * dialog-capable cases instead of `tui`, so the confirmation and the decision it exercises are real
 * (`hasUI` is true in both, per Pi's own contract) without pulling in the terminal's own rendering
 * primitives, which nothing here needs to draw.
 */
export class FakeContext {
	readonly mode: "rpc" | "json" | "print";
	readonly hasUI: boolean;
	readonly thinkingLevel = "off";
	readonly modelRegistry = null;
	readonly model = { provider: "stand-in", id: "scripted-1", baseUrl: "http://127.0.0.1:9/v1" };
	readonly cwd: string;
	readonly sessionManager: { getSessionId: () => string };
	readonly confirmAnswer: boolean;
	confirmations = 0;
	/** The message of each confirmation put to the owner, in order. */
	readonly confirmed: string[] = [];
	/** Set by a test that needs to observe session state, or to act, at the moment a confirmation is
	 * put, before the fake answers it. */
	onConfirm: (() => void | Promise<void>) | null = null;
	readonly ui: {
		select: (q: string, opts: string[]) => Promise<string | null>;
		input: (prompt: string) => Promise<string | null>;
		confirm: (title: string, message: string) => Promise<boolean>;
		notify: (text: string, level?: string) => void;
		setStatus: (id: string, text: string) => void;
		setWidget: (key: string, content: string[] | undefined, options?: { placement?: string }) => void;
	};
	/** Each footer status set, in order. */
	readonly statuses: string[] = [];
	/** Each widget set or removed, with where it was placed, in order. */
	readonly widgets: { key: string; content: string[] | undefined; placement: string | undefined }[] = [];
	/** Each selection put to the owner, with the options offered, in order. */
	readonly selections: { question: string; options: string[] }[] = [];
	constructor(cwd: string, mode: "rpc" | "json" | "print", sessionId: string, confirmAnswer = true) {
		this.cwd = cwd;
		this.mode = mode;
		this.hasUI = mode === "rpc";
		this.sessionManager = { getSessionId: () => sessionId };
		this.confirmAnswer = confirmAnswer;
		this.ui = {
			select: async (question, opts) => {
				this.selections.push({ question, options: opts });
				return opts[0] ?? null;
			},
			input: async () => "réponse à la question",
			confirm: async (_title, message) => {
				this.confirmed.push(message);
				this.confirmations++;
				await this.onConfirm?.();
				return this.confirmAnswer;
			},
			notify: () => undefined,
			setStatus: (_id, text) => {
				this.statuses.push(text);
			},
			setWidget: (key, content, options) => {
				this.widgets.push({ key, content, placement: options?.placement });
			},
		};
	}

	/** This fake as the context Pi hands a command, which is also the one it hands a hook. */
	asCommand(): ExtensionCommandContext {
		return this as unknown as ExtensionCommandContext;
	}
}

/** Starts a change whose only material question is asked, answered, then lost by the report that
 * never declared it: the change stalls in clarification for stagnation, naming q1. */
export async function stalledOnQ1(
	dataDir: string,
	cwd: string,
	sessionId = "s-question-closure",
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
	if (NO_QUALIFIED_SANDBOX) process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi.host());
	registerCommand495(pi.host(), session);
	const ctx = new FakeContext(cwd, "rpc", sessionId);
	session.openedAt(ctx.asCommand());
	// `start` conducts the change itself (`conduct` -> `advance` then `presentDecisions`): the fake UI
	// already answers Q1 there, so no separate `/495 decide` is needed. What it does not do is drive
	// `advance` again on the answer just given; `resume` does, reaching the round that loses it.
	await pi.run("start x", ctx);
	if (!session.binding) throw new Error(`start did not bind: ${pi.said.join(" | ")}`);
	const changeId = session.binding.change_id;
	assert.ok(
		session
			.runtime()
			.ledger.loadChange(changeId)!
			.state.open_questions.find((q) => q.id === "q1")?.answer,
		pi.said.join(" | "),
	);
	await pi.run("resume", ctx);
	const state = session.runtime().ledger.loadChange(changeId)!.state;
	assert.equal(state.status, "blocked", pi.said.join(" | "));
	assert.equal(state.stop_reason, "stagnation", pi.said.join(" | "));
	assert.ok(state.stop_detail?.includes("q1"), state.stop_detail ?? "");
	return { pi, session, ctx, changeId };
}

/** Takes a change with no question to its frozen candidate, in its verification with no control run yet. */
export function atVerification(
	dataDir: string,
	cwd: string,
	sessionId: string,
): Promise<{ pi: FakePi; session: ExtensionSession; ctx: FakeContext; changeId: string }> {
	return atPhase(dataDir, cwd, sessionId, "verifying");
}

/** Conducts a change with no question, one step at a time, until it enters `phase`. */
export async function atPhase(
	dataDir: string,
	cwd: string,
	sessionId: string,
	phase: Phase,
): Promise<{ pi: FakePi; session: ExtensionSession; ctx: FakeContext; changeId: string }> {
	const agentScript = join(dataDir, "agent.json");
	writeFileSync(
		agentScript,
		JSON.stringify({
			default: { steps: [{ kind: "complete", output: { ...ASKS_Q1, questions: [] } }] },
			roles: {
				implement: {
					steps: [
						{
							kind: "write",
							path: "src/greet.js",
							content: "export function greet(name) {\n  return `Hello, ${name}`; // tidy\n}\n",
						},
						{
							kind: "complete",
							output: { summary: "tidy", changed_paths: ["src/greet.js"], tests_claimed: false, notes: [] },
						},
					],
				},
			},
		}),
	);
	process.env.HARNESS495_DATA_DIR = join(dataDir, "data");
	process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
	process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
	if (NO_QUALIFIED_SANDBOX) process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi.host());
	registerCommand495(pi.host(), session);
	const ctx = new FakeContext(cwd, "rpc", sessionId);
	session.openedAt(ctx.asCommand());
	const rt = session.runtime();
	const owner = session.humanOrigin(ctx.asCommand())!.actor;
	const { program, change } = await rt.harness.start({ project_path: cwd, request_text: "x", actor: owner });
	const changeId = change.change_id;
	session.bind(ctx.asCommand(), { program_id: program.program_id, change_id: changeId });
	const readModel = () => selectedModel(ctx.asCommand());
	for (let step = 0; rt.ledger.loadChange(changeId)!.state.phase !== phase; step++) {
		assert.ok(step < 20, `the change never reaches ${phase}: ${rt.ledger.loadChange(changeId)!.state.phase}`);
		await rt.harness.advance(changeId, { max_steps: 1, readModel });
	}
	return { pi, session, ctx, changeId };
}
