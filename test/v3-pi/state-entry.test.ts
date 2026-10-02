/**
 * V3 — `/495 state <question>` opens a change whose deliverable is the state of the project, binds
 * the session to it and conducts it, as `/495 start` does for a change that delivers a candidate.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR, commandProject } from "../helpers/command-fixture.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { specReport } from "../helpers/harness-fixture.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("state-entry-", cleanups);
});

/** A session over a Node project, whose scripted specification asks whether the suite passes. */
function sessionOnProject(name: string): { pi: FakePi; session: ExtensionSession; ctx: FakeContext } {
	const cwd = commandProject("495-state-entry-", cleanups);
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
								objective: "où en sont les tests ?",
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
	const ctx = new FakeContext(cwd, "rpc", `s-${name}`);
	session.openedAt(ctx.asCommand());
	return { pi, session, ctx };
}

describe("`/495 state` opens a survey of the project", () => {
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

	it("/495 state avec une question crée un changement dont le livrable est l'état du projet, lie la session et le conduit ; sans texte il affiche son usage et ne crée rien ; /495 start ouvre toujours un changement à candidat", async () => {
		const asked = sessionOnProject("state");
		try {
			await asked.pi.run("state où en sont les tests ?", asked.ctx);
			assert.ok(asked.session.binding, `the session is bound: ${asked.pi.said.join(" | ")}`);
			const state = asked.session.runtime().ledger.loadChange(asked.session.binding.change_id)!.state;
			assert.equal(state.deliverable, "state", "the change delivers the state of the project");
			assert.ok(state.adopted.survey, `the change is conducted to its survey: ${asked.pi.said.join(" | ")}`);
		} finally {
			await asked.session.close();
		}

		const bare = sessionOnProject("bare");
		try {
			await bare.pi.run("state", bare.ctx);
			assert.ok(
				bare.pi.said.some((m) => m.includes("usage: /495 state")),
				bare.pi.said.join(" | "),
			);
			assert.equal(bare.session.binding, null, "the session is bound to nothing");
			assert.deepEqual(bare.session.runtime().ledger.listChanges(), [], "no change is created");
		} finally {
			await bare.session.close();
		}

		const started = sessionOnProject("start");
		try {
			await started.pi.run("start tidy greet", started.ctx);
			assert.ok(started.session.binding, started.pi.said.join(" | "));
			const state = started.session.runtime().ledger.loadChange(started.session.binding.change_id)!.state;
			assert.equal(state.deliverable, "candidate", "/495 start opens a change that delivers a candidate");
		} finally {
			await started.session.close();
		}
	});
});
