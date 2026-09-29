/**
 * V3 — the owner's answer "revise" to the IH-04 decision, given from Pi: the dialog asks what the
 * requirement should become, and the text lands in the decision the journal records.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR } from "../helpers/command-fixture.ts";
import { fixtureTsWithoutTests, initRepo, tempDir } from "../helpers/fixtures.ts";
import { specReport } from "../helpers/harness-fixture.ts";

const OWNER_TEXT = "R1 must be checked against the name 'Ada'";

/** R1 asks for behaviour the reference does not have, in a target with no test: nothing can judge it. */
const unjudgeable = specReport({
	requirements: [
		{
			requirement_id: "R1",
			statement: "shout(name) returns greet(name) upper-cased",
			mandatory: true,
			criterion: "unit test on shout passes",
			category: "functional",
			satisfied_by_reference: false,
		},
	],
});

const emptyPreparation = {
	steps: [
		{
			kind: "complete",
			output: { summary: "nothing to add", changed_paths: [], tests_claimed: false, notes: [] },
		},
	],
};

let root: string;
let cwd: string;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "requirement-revision-dialog-"));
	for (const name of HARNESS_ENV) saved[name] = process.env[name];
	delete process.env.HARNESS495_LANGUAGE;
	cwd = tempDir("495-revision-dialog-");
	fixtureTsWithoutTests(cwd);
	initRepo(cwd);
});
afterEach(() => {
	for (const [name, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
	rmSync(root, { recursive: true, force: true });
	rmSync(cwd, { recursive: true, force: true });
});

describe("answering revise to the IH-04 decision from Pi", () => {
	it("asks the owner what the requirement should become and records the text with the decision", async () => {
		const agentScript = join(root, "agent.json");
		writeFileSync(
			agentScript,
			JSON.stringify({
				default: { steps: [{ kind: "fail", error: "not reached" }] },
				roles: {
					specify: { steps: [{ kind: "complete", output: unjudgeable }] },
					prepare: emptyPreparation,
				},
			}),
		);
		process.env.HARNESS495_DATA_DIR = join(root, "data");
		process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
		process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
		if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
		const pi = new FakePi();
		const session = new ExtensionSession(pi as unknown as ExtensionAPI);
		registerCommand495(pi as unknown as ExtensionAPI, session);
		const ctx = new FakeContext(cwd, "rpc", "s-requirement-revision-dialog");
		const inputs: string[] = [];
		const choose = ctx.ui.select;
		ctx.ui.select = async (question, options) => {
			const revise = options.find((o) => o.startsWith("revise — "));
			return revise ?? (await choose(question, options));
		};
		ctx.ui.input = async (prompt) => {
			inputs.push(prompt);
			return OWNER_TEXT;
		};
		session.openedAt(ctx as unknown as ExtensionContext);
		try {
			await pi.command!("start x", ctx as unknown as ExtensionCommandContext);
			for (let round = 0; round < 6 && inputs.length === 0; round++)
				await pi.command!("resume", ctx as unknown as ExtensionCommandContext);

			assert.deepEqual(inputs, ["Ce que l'exigence doit devenir"], pi.said.join(" | "));
			const state = session.runtime().ledger.loadChange(session.binding!.change_id)!.state;
			const revision = state.human_decisions.find((d) => d.interaction === "IH-04" && d.option_id === "revise");
			assert.equal(revision?.free_text, OWNER_TEXT, "the owner's text is kept with the decision");
		} finally {
			await session.close();
		}
	});
});
