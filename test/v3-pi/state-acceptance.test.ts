/**
 * V3 — `/495 state <question>` puts the survey in front of the owner before the change closes: the
 * facts first, then the acceptance dialog; without a screen, the change waits on the decision.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DecisionRequest } from "../../src/contracts/v1/decision.ts";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR } from "../helpers/command-fixture.ts";
import { fixtureTsWithFailingTest, initRepo, outputDir, removedAfterEach, tempDir } from "../helpers/fixtures.ts";
import { specReport } from "../helpers/harness-fixture.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("state-acceptance-", cleanups);
});

const QUESTION = "où en sont les tests ?";

/** A session over a Node project whose test fails, in `mode`, whose scripted specification asks whether the suite passes. */
function sessionOnFailingProject(
	name: string,
	mode: "rpc" | "json",
): { pi: FakePi; session: ExtensionSession; ctx: FakeContext } {
	const cwd = tempDir("495-state-acceptance-", cleanups);
	fixtureTsWithFailingTest(cwd);
	initRepo(cwd);
	const agentScript = join(root, `${name}-agent.json`);
	writeFileSync(
		agentScript,
		JSON.stringify({
			default: { steps: [{ kind: "fail", error: "not reached" }] },
			roles: {
				specify: {
					steps: [
						{
							kind: "complete",
							output: specReport({
								objective: QUESTION,
								requirements: [
									{
										requirement_id: "R1",
										statement: "the test suite of the project passes",
										mandatory: true,
										criterion: "the unit test suite passes",
										category: "functional",
										satisfied_by_reference: true,
									},
								],
							}),
						},
					],
				},
			},
		}),
	);
	process.env.HARNESS495_DATA_DIR = join(root, `${name}-data`);
	process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
	process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
	if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi.host());
	registerCommand495(pi.host(), session);
	const ctx = new FakeContext(cwd, mode, `s-${name}`);
	session.openedAt(ctx.asCommand());
	return { pi, session, ctx };
}

/** The decision requests 495 put in front of the owner, read from the details of what it said. */
function presented(pi: FakePi): DecisionRequest[] {
	return pi.details.flatMap((d) =>
		d && typeof d === "object" && "decision" in d ? [(d as { decision: DecisionRequest }).decision] : [],
	);
}

describe("`/495 state` presents the survey before the owner accepts or refuses it", () => {
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

	it("/495 state sur un projet dont un test échoue affiche le contrôle de tests en FAIL avec le fichier du test puis ouvre le dialogue Accepter cet état des lieux ? ; refuser demande le motif et clôt rejected ; sans écran le changement s'arrête sur decision_required avec les mêmes faits", async () => {
		const asked = sessionOnFailingProject("interactive", "rpc");
		let factsShown: string | null = null;
		let interactiveFacts: string[] = [];
		const prompts: string[] = [];
		try {
			asked.ctx.ui.select = async (question, options) => {
				asked.ctx.selections.push({ question, options });
				factsShown = asked.pi.said.find((m) => /unit FAIL/.test(m) && m.includes("test/farewell.test.js")) ?? null;
				return options.find((o) => o.startsWith("refuse")) ?? null;
			};
			asked.ctx.ui.input = async (prompt) => {
				prompts.push(prompt);
				return "la couverture manque";
			};
			await asked.pi.run(`state ${QUESTION}`, asked.ctx);

			assert.deepEqual(
				asked.ctx.selections.map((s) => s.question),
				["Accepter cet état des lieux ?"],
				`the acceptance dialog opens: ${asked.pi.said.join(" | ")}`,
			);
			assert.ok(
				factsShown,
				`the test control in FAIL with the file of the failing test is shown before the dialog: ${asked.pi.said.join(" | ")}`,
			);
			assert.deepEqual(prompts, ["Motif du refus"], "refusing asks for the reason");
			assert.ok(asked.session.binding, "the session is bound");
			const state = asked.session.runtime().ledger.loadChange(asked.session.binding.change_id)!.state;
			assert.equal(state.outcome, "rejected", `the change is closed rejected: ${asked.pi.said.join(" | ")}`);
			assert.equal(state.phase, "closed");
			interactiveFacts = presented(asked.pi).find((r) => r.interaction === "IH-10")?.facts ?? [];
		} finally {
			await asked.session.close();
		}

		const headless = sessionOnFailingProject("headless", "json");
		try {
			await headless.pi.run(`state ${QUESTION}`, headless.ctx);
			assert.ok(headless.session.binding, headless.pi.said.join(" | "));
			const state = headless.session.runtime().ledger.loadChange(headless.session.binding.change_id)!.state;
			assert.equal(
				state.status,
				"decision_required",
				`the change waits on the decision: ${headless.pi.said.join(" | ")}`,
			);
			assert.notEqual(state.phase, "closed");
			const request = presented(headless.pi).find((r) => r.interaction === "IH-10");
			assert.ok(request, "the acceptance is presented without a screen");
			assert.ok(interactiveFacts.length > 0, "the interactive session was shown facts");
			assert.deepEqual(request.facts, interactiveFacts, "the same facts are presented without a screen");
		} finally {
			await headless.session.close();
		}
	});
});
