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
import { answer, GRADER, onlyComplex, QUALITY_SOURCES, qualityReactor, surveyed } from "../helpers/quality-survey.ts";
import { increment, threeIncrements } from "../helpers/trajectory.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("program-entry-", cleanups);
});

/** A session over a Git project, whose scripted agent fails at once: the change stops where it starts. */
function sessionOnProject(
	name: string,
	cwd = commandProject("495-program-entry-", cleanups),
): { pi: FakePi; session: ExtensionSession; ctx: FakeContext } {
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

/**
 * A Maven reactor whose survey the owner accepted, recorded in the data directory the session `name`
 * opens: `domain` carries a method of complexity 11 and a private method nothing calls, `infrastructure`
 * a method of complexity 11.
 */
async function acceptedSurvey(name: string): Promise<{ project: string; changeId: string }> {
	const project = qualityReactor({
		"domain/src/main/java/io/h495/Grader.java": QUALITY_SOURCES[GRADER]!,
		"infrastructure/src/main/java/io/h495/Router.java": onlyComplex("Router"),
	});
	const { t, changeId } = await surveyed(project, { root: join(root, `${name}-data`) });
	answer(t, changeId, "adopt_referential");
	await t.harness.advance(changeId, { max_steps: 40 });
	answer(t, changeId, "accept");
	assert.equal(t.ledger.loadChange(changeId)!.state.outcome, "accepted", "the survey is accepted");
	t.ledger.close();
	return { project, changeId };
}

/** A document citing the survey `changeId`: A removes the two gaps of domain, B, on A, the gap of infrastructure. */
function standards(changeId: string) {
	const gap = (rule_id: string, module: string) => ({ rule_id, module });
	return {
		title: "Bring the reactor to standards",
		baseline: { change_id: changeId },
		increments: [
			{
				...increment("A", "Domain to standards"),
				gaps: [gap("CyclomaticComplexity", "domain"), gap("UnusedPrivateMethod", "domain")],
			},
			{
				...increment("B", "Infrastructure to standards", ["A"]),
				gaps: [gap("CyclomaticComplexity", "infrastructure")],
			},
		],
		milestones: [
			{ milestone_id: "M1", title: "Standards", increment_ids: ["A", "B"], global_requirement_ids: [], final: true },
		],
		global_requirements: [],
	};
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

	it("un document qui ne cite aucun état des lieux et dont l'incrément A supprime CPD dans domain est refusé depuis Pi en nommant A et l'écart, sans programme, changement ni liaison", async () => {
		const { pi, session, ctx } = sessionOnProject("gap");
		try {
			const document = {
				...threeIncrements(),
				increments: [
					{ ...increment("A", "Common base"), gaps: [{ rule_id: "CPD", module: "domain" }] },
					increment("B", "Export", ["A"], ["R1"]),
					increment("C", "Import", ["A"], ["R1"]),
				],
			};
			await pi.run(`adopt ${documentAt("gap", document)}`, ctx);
			assert.ok(
				pi.said.some((m) =>
					m.includes("increment A removes CPD in domain (proprietary code), a gap no cited survey carries"),
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

	it("adopter depuis Pi une trajectoire qui cite l'état des lieux accepté du réacteur inscrit ses trois écarts, lie la session au changement de A dont la demande nomme ses deux écarts, et le statut liste sous A et sous B les écarts que chacun supprime", async () => {
		const { project, changeId } = await acceptedSurvey("standards");
		const { pi, session, ctx } = sessionOnProject("standards", project);
		try {
			await pi.run(`adopt ${documentAt("standards", standards(changeId))}`, ctx);
			assert.ok(session.binding, `the session is bound: ${pi.said.join(" | ")}`);
			const rt = session.runtime();
			const program = rt.ledger.loadProgram(session.binding.program_id)?.state;
			assert.equal(program?.baseline?.change_id, changeId, "the program names the cited survey");
			assert.deepEqual(
				program?.baseline?.gaps.map((g) => [g.rule_id, g.module, g.authorship, g.violations]),
				[
					["CyclomaticComplexity", "domain", "proprietary", 1],
					["CyclomaticComplexity", "infrastructure", "proprietary", 1],
					["UnusedPrivateMethod", "domain", "proprietary", 1],
				],
			);
			const change = rt.ledger.loadChange(session.binding.change_id)!.state;
			assert.equal(change.increment_id, "A");
			const request = (await rt.harness.artifacts.read<string>(change.request)).split("\n");
			for (const line of [
				"- CyclomaticComplexity dans domain, code propriétaire : 1 violation à l'état des lieux (seuil : a method whose cyclomatic complexity is 10 or more)",
				"- UnusedPrivateMethod dans domain, code propriétaire : 1 violation à l'état des lieux (seuil : any occurrence)",
			])
				assert.ok(request.includes(line), `${line}\n${request.join("\n")}`);
			await pi.run("status", ctx);
			const status = pi.said.at(-1)!.split("\n");
			const a = status.indexOf("  Incrément A (Domain to standards): actif");
			const b = status.indexOf("  Incrément B (Infrastructure to standards): planifié");
			assert.ok(a >= 0 && b > a, status.join("\n"));
			assert.deepEqual(status.slice(a + 1, b), [
				"    supprime CyclomaticComplexity dans domain, code propriétaire: 1 violation à l'état des lieux",
				"    supprime UnusedPrivateMethod dans domain, code propriétaire: 1 violation à l'état des lieux",
			]);
			assert.equal(
				status[b + 1],
				"    supprime CyclomaticComplexity dans infrastructure, code propriétaire: 1 violation à l'état des lieux",
			);
		} finally {
			await session.close();
		}
	});

	it("adopter depuis Pi une trajectoire sans l'incrément B, dont rien n'écarte CyclomaticComplexity dans infrastructure, est refusé en nommant l'écart, sans programme, changement ni liaison", async () => {
		const { project, changeId } = await acceptedSurvey("unhandled");
		const { pi, session, ctx } = sessionOnProject("unhandled", project);
		try {
			const document = standards(changeId);
			const withoutB = {
				...document,
				increments: document.increments.slice(0, 1),
				milestones: [{ ...document.milestones[0]!, increment_ids: ["A"] }],
			};
			const programs = session.runtime().ledger.listPrograms().length;
			await pi.run(`adopt ${documentAt("unhandled", withoutB)}`, ctx);
			assert.ok(
				pi.said.some((m) =>
					m.includes(
						"gap CyclomaticComplexity in infrastructure (proprietary code, 1 violation) is removed by no increment and set aside by no scope decision",
					),
				),
				pi.said.join(" | "),
			);
			assert.equal(session.binding, null, "the session stays unbound");
			assert.equal(session.runtime().ledger.listPrograms().length, programs, "no program is created");
			assert.deepEqual(
				session
					.runtime()
					.ledger.listChanges()
					.map((c) => c.change_id),
				[changeId],
				"no change but the survey",
			);
		} finally {
			await session.close();
		}
	});
});
