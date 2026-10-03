/**
 * V3 — `/495 next` starts the change of the next ready increment of the program the session is bound
 * to, and is refused while another increment of the program is open.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { ASKS_Q1, FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR, commandProject } from "../helpers/command-fixture.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { increment, threeIncrements } from "../helpers/trajectory.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("program-next-entry-", cleanups);
});

describe("`/495 next` starts the next increment of the program", () => {
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

	it("sur une session liée au programme dont le changement de A attend une décision, demander l'incrément suivant est refusé avec un message qui dit qu'un incrément à la fois est conduit, sans changement créé, la session restant liée à A", async () => {
		const cwd = commandProject("495-program-next-entry-", cleanups);
		const agentScript = join(root, "agent.json");
		writeFileSync(
			agentScript,
			JSON.stringify({
				default: { steps: [{ kind: "fail", error: "not reached" }] },
				roles: { specify: { steps: [{ kind: "complete", output: ASKS_Q1 }] } },
			}),
		);
		const trajectory = join(root, "trajectory.json");
		writeFileSync(trajectory, JSON.stringify(threeIncrements()));
		process.env.HARNESS495_DATA_DIR = join(root, "data");
		process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
		if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
		const pi = new FakePi();
		const session = new ExtensionSession(pi.host());
		registerCommand495(pi.host(), session);
		// A session with no dialog: the question the change of A asks stays unanswered.
		const ctx = new FakeContext(cwd, "json", "s-program-next");
		session.openedAt(ctx.asCommand());
		try {
			await pi.run(`adopt ${trajectory}`, ctx);
			assert.ok(session.binding, `the session is bound to the change of A: ${pi.said.join(" | ")}`);
			const a = session.binding.change_id;
			const ledger = session.runtime().ledger;
			assert.equal(ledger.loadChange(a)!.state.status, "decision_required", pi.said.join(" | "));

			await pi.run("next", ctx);
			assert.ok(
				pi.said.at(-1)?.includes("the program conducts one increment at a time"),
				`the request is refused: ${pi.said.at(-1)}`,
			);
			assert.deepEqual(
				ledger.listChanges().map((c) => c.change_id),
				[a],
				"no change is created",
			);
			assert.equal(session.binding.change_id, a, "the session stays bound to the change of A");
		} finally {
			await session.close();
		}
	});

	it("le changement de A annulé depuis Pi et B indépendant de A, demander l'incrément suivant crée le changement de B rattaché au programme et y lie la session", async () => {
		const cwd = commandProject("495-program-next-entry-", cleanups);
		const agentScript = join(root, "agent.json");
		writeFileSync(agentScript, JSON.stringify({ default: { steps: [{ kind: "fail", error: "not reached" }] } }));
		const trajectory = join(root, "trajectory.json");
		// B does not depend on A: once A is set aside, B is the next ready increment.
		const independent = threeIncrements({
			increments: [
				increment("A", "Common base"),
				increment("B", "Export", [], ["R1"]),
				increment("C", "Import", ["A"], ["R1"]),
			],
		});
		writeFileSync(trajectory, JSON.stringify(independent));
		process.env.HARNESS495_DATA_DIR = join(root, "data");
		process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
		process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
		if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
		const pi = new FakePi();
		const session = new ExtensionSession(pi.host());
		registerCommand495(pi.host(), session);
		const ctx = new FakeContext(cwd, "rpc", "s-program-next-started");
		session.openedAt(ctx.asCommand());
		try {
			await pi.run(`adopt ${trajectory}`, ctx);
			assert.ok(session.binding, `the session is bound to the change of A: ${pi.said.join(" | ")}`);
			const { program_id, change_id: a } = session.binding;
			await pi.run("cancel the common base is dropped", ctx);
			const ledger = session.runtime().ledger;
			assert.equal(ledger.loadChange(a)!.state.status, "cancelled", pi.said.join(" | "));

			await pi.run("next", ctx);
			const b = ledger.listChanges().find((c) => c.change_id !== a);
			assert.ok(b, `the change of B is created: ${pi.said.join(" | ")}`);
			const change = ledger.loadChange(b.change_id)!.state;
			assert.equal(change.program_id, program_id, "B's change belongs to the program");
			assert.equal(change.increment_id, "B");
			assert.deepEqual(
				session.binding,
				{ program_id, change_id: b.change_id },
				"the session is bound to the change of B",
			);
		} finally {
			await session.close();
		}
	});
});
