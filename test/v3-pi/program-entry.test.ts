/**
 * V3 — `/495 adopt <trajectory>` adopts a trajectory the owner wrote, of several linked increments,
 * and starts the change of the first ready one, as `/495 start` starts a change.
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR, commandProject } from "../helpers/command-fixture.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { increment, threeIncrements } from "../helpers/trajectory.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("program-entry-", cleanups);
});

/** A session over a Git project, whose scripted agent fails at once: the change stops where it starts. */
function sessionOnProject(name: string): { pi: FakePi; session: ExtensionSession; ctx: FakeContext } {
	const cwd = commandProject("495-program-entry-", cleanups);
	const agentScript = join(root, `${name}-agent.json`);
	writeFileSync(agentScript, JSON.stringify({ default: { steps: [{ kind: "fail", error: "not reached" }] } }));
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

/** Writes the document outside the project, and returns its path. */
function documentAt(name: string, document: unknown): string {
	const path = join(root, `${name}.json`);
	writeFileSync(path, JSON.stringify(document));
	return path;
}

describe("`/495 adopt` adopts a trajectory of several increments", () => {
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

	it("adopter depuis Pi un document de trois incréments crée le programme, lie la session au changement de A dont la demande porte le titre, la valeur et le critère de clôture de A, et le statut liste A actif, B et C planifiés", async () => {
		const { pi, session, ctx } = sessionOnProject("adopt");
		try {
			await pi.run(`adopt ${documentAt("three", threeIncrements())}`, ctx);
			assert.ok(session.binding, `the session is bound: ${pi.said.join(" | ")}`);
			const rt = session.runtime();
			const program = rt.ledger.loadProgram(session.binding.program_id)?.state;
			assert.ok(program, "the program is recorded");
			assert.deepEqual(
				program.increments.map((i) => [i.increment_id, i.depends_on, i.status]),
				[
					["A", [], "active"],
					["B", ["A"], "planned"],
					["C", ["A"], "planned"],
				],
			);
			assert.deepEqual(
				program.milestones.map((m) => [m.milestone_id, m.increment_ids, m.final]),
				[["M1", ["A", "B", "C"], true]],
			);
			assert.deepEqual(program.global_requirements, [{ requirement_id: "R1", scope_decision: null }]);
			const change = rt.ledger.loadChange(session.binding.change_id)!.state;
			assert.equal(change.program_id, program.program_id);
			assert.equal(change.increment_id, "A");
			const request = await rt.harness.artifacts.read<string>(change.request);
			const a = increment("A", "Common base");
			for (const words of [a.title, a.value, a.closure_criterion])
				assert.ok(request.includes(words), `the request of A carries "${words}": ${request}`);
			await pi.run("status", ctx);
			const status = pi.said.at(-1)!.split("\n");
			for (const line of [
				"  Incrément A (Common base): actif",
				"  Incrément B (Export): planifié",
				"  Incrément C (Import): planifié",
				"  Jalon M1 (Release): sans évaluation",
			])
				assert.ok(status.includes(line), `${line}\n${status.join("\n")}`);
		} finally {
			await session.close();
		}
	});

	it("un document dont R2 est écartée par une décision de périmètre motivée et R3 vérifiée par le jalon final est adopté depuis Pi, et le programme garde R2 avec sa raison", async () => {
		const { pi, session, ctx } = sessionOnProject("scoped");
		try {
			const reason = "the legacy export is retired with the next release";
			const document = threeIncrements({
				global_requirements: [
					{ requirement_id: "R1" },
					{ requirement_id: "R2", scope_decision: { reason } },
					{ requirement_id: "R3" },
				],
				milestone_globals: ["R3"],
			});
			await pi.run(`adopt ${documentAt("scoped", document)}`, ctx);
			assert.ok(session.binding, `the session is bound: ${pi.said.join(" | ")}`);
			const program = session.runtime().ledger.loadProgram(session.binding.program_id)?.state;
			assert.ok(program, "the program is recorded");
			assert.deepEqual(program.global_requirements, [
				{ requirement_id: "R1", scope_decision: null },
				{ requirement_id: "R2", scope_decision: { reason } },
				{ requirement_id: "R3", scope_decision: null },
			]);
			assert.deepEqual(
				program.milestones.map((m) => [m.milestone_id, m.global_requirement_ids, m.final]),
				[["M1", ["R3"], true]],
			);
		} finally {
			await session.close();
		}
	});

	it("un document qui déclare R2 affectée à rien est refusé avec un message qui nomme R2, sans changement ni liaison", async () => {
		const { pi, session, ctx } = sessionOnProject("unassigned");
		try {
			const document = threeIncrements({
				global_requirements: [{ requirement_id: "R1" }, { requirement_id: "R2" }],
			});
			await pi.run(`adopt ${documentAt("unassigned", document)}`, ctx);
			assert.ok(
				pi.said.some((m) =>
					m.includes(
						"global requirement R2 is assigned neither to an increment, nor to a milestone verification, nor to a scope decision",
					),
				),
				pi.said.join(" | "),
			);
			assert.equal(session.binding, null, "the session stays unbound");
			assert.deepEqual(session.runtime().ledger.listChanges(), [], "no change is created");
			assert.deepEqual(session.runtime().ledger.listPrograms(), [], "no program is created");
		} finally {
			await session.close();
		}
	});

	it("un document dont un incrément n'a pas de critère de clôture est refusé avec un message qui le nomme", async () => {
		const { pi, session, ctx } = sessionOnProject("malformed");
		try {
			const { closure_criterion: _, ...withoutCriterion } = increment("B", "Export", ["A"], ["R1"]);
			const missing = threeIncrements({
				increments: [increment("A", "Common base"), withoutCriterion, increment("C", "Import", ["A"], ["R1"])],
			});
			await pi.run(`adopt ${documentAt("missing", missing)}`, ctx);
			assert.ok(
				pi.said.some((m) => /increment B\b.*closure_criterion/.test(m)),
				`the refusal names B and its missing closure criterion: ${pi.said.join(" | ")}`,
			);
			const undeclared = threeIncrements({
				increments: [
					increment("A", "Common base"),
					increment("B", "Export", ["A"], ["R1"]),
					increment("C", "Import", ["Z"], ["R1"]),
				],
			});
			await pi.run(`adopt ${documentAt("undeclared", undeclared)}`, ctx);
			assert.ok(
				pi.said.some((m) => m.includes("increment C depends on unknown Z")),
				`the refusal names C and the increment it depends on: ${pi.said.join(" | ")}`,
			);
			assert.equal(session.binding, null, "the session stays unbound");
			assert.deepEqual(session.runtime().ledger.listChanges(), [], "no change is created");
			assert.deepEqual(session.runtime().ledger.listPrograms(), [], "no program is created");
		} finally {
			await session.close();
		}
	});
});
