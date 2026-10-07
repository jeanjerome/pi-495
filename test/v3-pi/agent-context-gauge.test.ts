/**
 * V3 — a gauge under the editor shows the context of the working agent during an intervention, in
 * the language of the session, and goes away when the intervention ends. The agent is scripted: it
 * reports the contexts a real session would report after its answers, and no model is called.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { ASKS_Q1, FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR, commandProject } from "../helpers/command-fixture.ts";
import { NO_QUALIFIED_SANDBOX, removedAfterEach, outputDir } from "../helpers/fixtures.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("agent-context-gauge-", cleanups);
});

const CONTEXTS = [
	{ kind: "context", tokens: 340_000, context_window: 1_000_000 },
	{ kind: "context", tokens: 520_000, context_window: 1_000_000 },
	{ kind: "context", tokens: null, context_window: 1_000_000 },
];

/**
 * Starts a change whose specifying agent reports 340,000 then 520,000 tokens, then a context unknown
 * to Pi, then plays `ending`. The agent consumes 1,200 tokens for $0.05, so the 495 footer line has a
 * consumption to show again. `budgets` goes to the harness configuration.
 */
async function startWithContexts(
	language: "fr" | "en",
	ending: object[] = [{ kind: "complete", output: ASKS_Q1 }],
	budgets?: object,
): Promise<FakeContext> {
	const cwd = commandProject("495-agent-context-gauge-", cleanups);
	const agentScript = join(root, "agent.json");
	writeFileSync(
		agentScript,
		JSON.stringify({
			default: { steps: [{ kind: "fail", error: "not reached" }] },
			roles: {
				specify: {
					steps: [...CONTEXTS, ...ending],
					tokens: 1_200,
					cost: { usd: 0.05, unknown_reason: null, basis: "host_catalogue", subscription: false },
				},
			},
		}),
	);
	process.env.HARNESS495_DATA_DIR = join(root, "data");
	if (budgets) {
		mkdirSync(join(root, "data"), { recursive: true });
		writeFileSync(join(root, "data", "config.json"), JSON.stringify({ policy: { budgets } }));
	}
	process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
	process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
	process.env.HARNESS495_LANGUAGE = language;
	if (NO_QUALIFIED_SANDBOX) process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi.host());
	registerCommand495(pi.host(), session);
	const ctx = new FakeContext(cwd, "rpc", `s-agent-context-${language}`);
	session.openedAt(ctx.asCommand());
	await pi.run("start x", ctx);
	assert.ok(session.binding, pi.said.join(" | "));
	return ctx;
}

const shown = (ctx: FakeContext) => ctx.widgets.filter((w) => w.content !== undefined);

describe("a gauge under the editor shows the context of the working agent during an intervention", () => {
	const saved: Record<string, string | undefined> = {};
	beforeEach(() => {
		for (const name of HARNESS_ENV) saved[name] = process.env[name];
	});
	afterEach(() => {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	it("an intervention whose scripted agent reports 340,000 then 520,000 tokens on a window of 1,000,000, then an unknown context, shows each line in turn under the editor, then removes the line at the end of the intervention", async () => {
		const ctx = await startWithContexts("en");
		assert.deepEqual(
			shown(ctx).map((w) => w.content),
			[
				["Agent context  ██████░░░░░░░░░░░░░░  34%   340.0k / 1.0M"],
				["Agent context  ██████████░░░░░░░░░░  52%   520.0k / 1.0M"],
				["Agent context  ░░░░░░░░░░░░░░░░░░░░  ?   ? / 1.0M"],
			],
			"the line under the editor follows each context the agent reports",
		);
		assert.ok(
			shown(ctx).every((w) => w.placement === "belowEditor"),
			"the line is under the editor",
		);
		const last = ctx.widgets.at(-1);
		assert.equal(last?.content, undefined, "no Agent context line is displayed once the intervention has ended");
		assert.ok(
			ctx.widgets.every((w) => w.key === last?.key),
			"the line removed is the one that was shown",
		);
		assert.match(
			ctx.statuses.at(-1) ?? "",
			/^495 [A-Z][a-z]+ · [a-z_]+.* · agents 1\.2k tokens · ~\$0\.05$/,
			"the 495 footer line shows the step, the status and the consumption again",
		);
	});

	// A bound of one tool call stops the agent at its second call: the kernel aborts the session.
	for (const [ending, steps, budgets] of [
		["fails", [{ kind: "fail", error: "the model gave up" }], undefined],
		[
			"is stopped",
			[
				{ kind: "tool", tool: "read" },
				{ kind: "tool", tool: "read" },
				{ kind: "complete", output: ASKS_Q1 },
			],
			{ tool_calls_per_intervention: 1 },
		],
	] as const)
		it(`an intervention that ${ending} after showing the line removes it too`, async () => {
			const ctx = await startWithContexts("en", [...steps], budgets);
			assert.equal(shown(ctx).length, 3, "the line was shown while the agent worked");
			assert.equal(ctx.widgets.at(-1)?.content, undefined, `no Agent context line is displayed once it ${ending}`);
			assert.match(
				ctx.statuses.at(-1) ?? "",
				/^495 [A-Z][a-z]+ · [a-z_]+.* · agents 1\.2k tokens · ~\$0\.05$/,
				`the 495 footer line shows the step, the status and the consumption again once it ${ending}`,
			);
		});

	it("in French, the first line is the French one", async () => {
		const ctx = await startWithContexts("fr");
		assert.deepEqual(
			shown(ctx)[0]?.content,
			["Contexte de l'agent  ██████░░░░░░░░░░░░░░  34 %   340,0 k / 1,0 M"],
			"the gauge speaks the language of the session",
		);
	});
});
