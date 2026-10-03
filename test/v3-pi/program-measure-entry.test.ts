/**
 * V3 — `/495 measure <change>` judges each milestone of the program the session is bound to on the
 * accepted survey of the integrated project that change took, and refuses a change that does not
 * measure the integrated project under the referential of the starting survey.
 */
import { strict as assert } from "node:assert";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { canonicalize } from "../../src/contracts/canonical.ts";
import type { Protocol, QualityRule } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { registerCommand495 } from "../../src/extension/command.ts";
import { ExtensionSession } from "../../src/extension/session.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { FakeContext, FakePi, HARNESS_ENV, RPC_ACTOR } from "../helpers/command-fixture.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";
import { specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { integrate } from "../helpers/program-fixture.ts";
import {
	answer,
	GRADER,
	onlyComplex,
	QUALITY_SOURCES,
	qualityReactor,
	surveyed,
	surveyOn,
} from "../helpers/quality-survey.ts";
import { increment } from "../helpers/trajectory.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("program-measure-entry-", cleanups);
});

const DOMAIN = "domain/src/main/java/io/h495/Grader.java";
const INFRASTRUCTURE = "infrastructure/src/main/java/io/h495/Router.java";

/** A class `name` that violates no rule of the referential. */
const clean = (name: string) => `package io.h495;\n\npublic final class ${name} {\n    private ${name}() {}\n}\n`;

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

/** Carries the survey `changeId` to its close: the referential adopted, then the survey accepted or refused. */
async function closeSurvey(t: TestHarness, changeId: string, acceptance: "accept" | "refuse" = "accept") {
	answer(t, changeId, "adopt_referential");
	await t.harness.advance(changeId, { max_steps: 40 });
	answer(t, changeId, acceptance);
	assert.equal(t.ledger.loadChange(changeId)!.state.phase, "closed", "the survey is closed");
}

/**
 * A survey of `project` as it stands, closed, its specification the quality question of the survey.
 * With `aside`, the survey is taken with an untracked file of that name in the tree, removed afterwards:
 * two surveys of one dossier on identical trees collide on the key of their verification.
 */
async function surveyNow(t: TestHarness, project: string, acceptance: "accept" | "refuse" = "accept", aside?: string) {
	t.agent.scripts.delete("specify");
	if (aside) writeFileSync(join(project, aside), `${aside}\n`);
	const { changeId } = await surveyOn(t, project);
	await closeSurvey(t, changeId, acceptance);
	if (aside) rmSync(join(project, aside));
	return changeId;
}

/** Scripts the producer to write `files`, then integrates the change. */
async function integratedWriting(t: TestHarness, changeId: string, files: Record<string, string>) {
	// The increments are candidates: the model specifies a behaviour, not the quality question of the survey.
	t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: specReport() }] });
	t.agent.scripts.set("implement", {
		steps: [
			...Object.entries(files).map(([path, content]) => ({ kind: "write" as const, path, content })),
			{
				kind: "complete",
				output: { summary: "done", changed_paths: Object.keys(files), tests_claimed: true, notes: [] },
			},
		],
	});
	return integrate(t, changeId);
}

/**
 * The program of a reactor whose survey the owner accepted, recorded in `data`: A removes the two gaps
 * of domain, B, on A, the gap of infrastructure. `between` runs once A is integrated, `after` once B is.
 */
async function integratedProgram(
	data: string,
	between: (t: TestHarness, project: string) => Promise<void> = async () => {},
) {
	const project = qualityReactor({ [DOMAIN]: QUALITY_SOURCES[GRADER]!, [INFRASTRUCTURE]: onlyComplex("Router") });
	const { t, changeId: start } = await surveyed(project, { root: data, integration: true });
	await closeSurvey(t, start);
	const { program, change } = await t.harness.adopt({
		project_path: project,
		trajectory: standards(start),
		actor: HUMAN,
		language: "en",
	});
	await integratedWriting(t, change.change_id, { [DOMAIN]: clean("Grader") });
	await between(t, project);
	const b = await t.harness.startNext({ program_id: program.program_id, actor: HUMAN, language: "en" });
	await integratedWriting(t, b.change.change_id, { [INFRASTRUCTURE]: clean("Router") });
	return { t, project, start, program_id: program.program_id, b: b.change.change_id };
}

/** Rewrites, in the dossier of `changeId`, the latest artifact of `kind` as `edit` makes it. */
async function rewrite<T>(t: TestHarness, changeId: string, kind: "protocol" | "survey", edit: (content: T) => T) {
	const { ref, content } = (await t.harness.artifacts.latest<T>(t.ledger.loadChange(changeId)!.state, kind))!;
	const edited = edit(content);
	const object = await t.objects.put(new TextEncoder().encode(canonicalize(edited)), "application/json");
	t.ledger.db
		.prepare("UPDATE artifacts SET content_digest = ?, size_bytes = ? WHERE artifact_id = ? AND revision = ?")
		.run(object.digest, object.size_bytes, ref.artifact_id, ref.revision);
}

/** Rewrites every rule of the referential of `changeId`'s protocol as `edit` makes it. */
const rules = (t: TestHarness, changeId: string, edit: (rule: QualityRule) => QualityRule) =>
	rewrite<Protocol>(t, changeId, "protocol", (p) => ({
		...p,
		quality_referential: { ...p.quality_referential!, rules: p.quality_referential!.rules.map(edit) },
	}));

/** A session over `project`, on the dossier of `data`, bound to the change `changeId`. */
async function boundSession(name: string, project: string, data: string, changeId: string) {
	const agentScript = join(root, `${name}-agent.json`);
	writeFileSync(agentScript, JSON.stringify({ default: { steps: [{ kind: "fail", error: "not reached" }] } }));
	process.env.HARNESS495_DATA_DIR = data;
	process.env.HARNESS495_SCRIPTED_AGENT = agentScript;
	process.env.HARNESS495_RPC_HUMAN_ACTOR = RPC_ACTOR;
	if (process.platform !== "darwin") process.env.HARNESS495_ALLOW_UNCONFINED = "1";
	const pi = new FakePi();
	const session = new ExtensionSession(pi.host());
	registerCommand495(pi.host(), session);
	const ctx = new FakeContext(project, "rpc", `s-${name}`);
	session.openedAt(ctx.asCommand());
	await pi.run(`bind ${changeId}`, ctx);
	assert.equal(session.binding?.change_id, changeId, pi.said.join(" | "));
	return { pi, session, ctx };
}

describe("`/495 measure` judges the program on a survey of the integrated project", () => {
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

	it("sur une session liée au programme dont A et B sont intégrés, mesurer avec l'état des lieux accepté du projet intégré qui ne compte plus aucun écart inscrit une évaluation du jalon final PASS qui cite cet état des lieux, clôt le programme, et le statut annonce la conformité dans le périmètre contrôlé, qu'il nomme par les six règles avec PMD 7.17.0, les modules domain et infrastructure, et la duplication entre modules que CPD ne mesure pas", async () => {
		const data = join(root, "conform-data");
		const { t, project, program_id, b } = await integratedProgram(data);
		const measured = await surveyNow(t, project);
		t.ledger.close();

		const { pi, session, ctx } = await boundSession("conform", project, data, b);
		try {
			await pi.run(`measure ${measured}`, ctx);
			const program = session.runtime().ledger.loadProgram(program_id)!.state;
			const evaluation = program.milestone_evaluations.at(-1);
			assert.equal(evaluation?.verdict, "PASS", pi.said.join(" | "));
			assert.equal(
				evaluation?.measure?.change_id,
				measured,
				"the evaluation cites the survey of the integrated project",
			);
			assert.deepEqual(
				evaluation?.measure?.gaps.map((g) => [g.rule_id, g.module, g.outcome, g.surveyed, g.measured]),
				[
					["CyclomaticComplexity", "domain", "removed", 1, 0],
					["CyclomaticComplexity", "infrastructure", "removed", 1, 0],
					["UnusedPrivateMethod", "domain", "removed", 1, 0],
				],
			);
			assert.equal(program.closed, true, "the program is closed");
			await pi.run("status", ctx);
			const status = pi.said.at(-1)!.split("\n");
			const milestone = status.indexOf(
				"  Jalon M1 (Standards): PASS — conforme au référentiel dans le périmètre contrôlé",
			);
			assert.ok(milestone >= 0, status.join("\n"));
			const perimeter = status.indexOf("    Périmètre contrôlé:", milestone);
			assert.deepEqual(
				status.slice(perimeter, perimeter + 9),
				[
					"    Périmètre contrôlé:",
					"      règle CyclomaticComplexity: PMD 7.17.0",
					"      règle CognitiveComplexity: PMD 7.17.0",
					"      règle UnusedPrivateMethod: PMD 7.17.0",
					"      règle UnusedPrivateField: PMD 7.17.0",
					"      règle UnusedLocalVariable: PMD 7.17.0",
					"      règle CPD: PMD 7.17.0",
					"      modules mesurés: domain, infrastructure",
					"      hors de la mesure: duplication between two modules — CPD compares the files of one module with each other only (aggregate is false by default in maven-pmd-plugin 3.28.0)",
				],
				"the status names the controlled perimeter of the referential the measure was taken under",
			);
		} finally {
			await session.close();
		}
	});

	it("mesurer de nouveau le programme que la mesure a clos est refusé en disant qu'il est clos, sans évaluation inscrite", async () => {
		const data = join(root, "closed-data");
		const { t, project, program_id, b } = await integratedProgram(data);
		const measured = await surveyNow(t, project);
		t.ledger.close();

		const { pi, session, ctx } = await boundSession("closed", project, data, b);
		try {
			await pi.run(`measure ${measured}`, ctx);
			const ledger = session.runtime().ledger;
			assert.equal(ledger.loadProgram(program_id)!.state.closed, true, pi.said.join(" | "));
			const evaluations = ledger.loadProgram(program_id)!.state.milestone_evaluations.length;
			await pi.run(`measure ${measured}`, ctx);
			assert.match(pi.said.at(-1) ?? "", new RegExp(`program ${program_id} is closed`));
			assert.equal(
				ledger.loadProgram(program_id)!.state.milestone_evaluations.length,
				evaluations,
				"no evaluation is recorded",
			);
		} finally {
			await session.close();
		}
	});

	it("un changement à candidat, un état des lieux refusé, d'un autre projet, pris sur un arbre sans l'intégration de B, dont pmd n'a rien mesuré ou a gardé moins de constats que son rapport, ou dont le référentiel diffère par une règle absente, le seuil d'une règle, la version de PMD ou un module mesuré, est refusé avec un message qui nomme le changement et la raison, sans évaluation inscrite", async () => {
		const data = join(root, "refused-data");
		let withoutB = "";
		const { t, project, start, program_id, b } = await integratedProgram(data, async (t, project) => {
			withoutB = await surveyNow(t, project);
		});
		// Each refusal below but the tree's is read before the tree is: these surveys may be taken on other trees.
		const rejected = await surveyNow(t, project, "refuse", "rejected.txt");
		const other = qualityReactor({
			[DOMAIN]: clean("Grader"),
			"infrastructure/src/main/java/io/h495/Gateway.java": clean("Gateway"),
		});
		const foreign = await surveyNow(t, other);
		const kept = await surveyNow(t, project, "accept", "kept.txt");
		const blind = await surveyNow(t, project, "accept", "blind.txt");
		await rewrite<Survey>(t, blind, "survey", (survey) => ({
			...survey,
			controls: survey.controls.map((c) =>
				c.control_id === "pmd" ? { ...c, verdict: null, blind_spot: "blind spot: the control is not qualified" } : c,
			),
		}));
		const pmd = t.ledger.loadChange(kept)!.state.evidence.find((e) => e.control_id === "pmd")!.evidence_id;
		t.ledger.db
			.prepare("UPDATE evidence SET document = json_set(document, '$.facts.findings', 1) WHERE evidence_id = ?")
			.run(pmd);
		const threshold = await surveyNow(t, project, "accept", "threshold.txt");
		await rules(t, threshold, (r) =>
			r.rule_id === "CyclomaticComplexity"
				? {
						...r,
						threshold: "a method whose cyclomatic complexity is 15 or more",
						properties: { methodReportLevel: "15" },
					}
				: r,
		);
		const dropped = await surveyNow(t, project, "accept", "dropped.txt");
		await rewrite<Protocol>(t, dropped, "protocol", (p) => ({
			...p,
			quality_referential: {
				...p.quality_referential!,
				rules: p.quality_referential!.rules.filter((r) => r.rule_id !== "UnusedLocalVariable"),
			},
		}));
		const version = await surveyNow(t, project, "accept", "version.txt");
		await rules(t, version, (r) => ({ ...r, tool: "PMD 7.16.0" }));
		const module = await surveyNow(t, project, "accept", "module.txt");
		await rewrite<Protocol>(t, module, "protocol", (p) => ({
			...p,
			quality_referential: {
				...p.quality_referential!,
				perimeter: {
					...p.quality_referential!.perimeter!,
					measured: p.quality_referential!.perimeter!.measured.filter((m) => m.module === "domain"),
				},
			},
		}));
		t.ledger.close();

		const { pi, session, ctx } = await boundSession("refused", project, data, b);
		try {
			const ledger = session.runtime().ledger;
			const evaluations = ledger.loadProgram(program_id)!.state.milestone_evaluations.length;
			const refusals: [string, RegExp][] = [
				[b, /it delivers a candidate, not a survey of the project/],
				[rejected, /the owner did not accept its survey: it closed rejected/],
				[foreign, /it surveyed another project/],
				[withoutB, /it was taken on a tree that does not carry the latest integration of the program/],
				[blind, /its control pmd measured nothing of the reference: blind spot: the control is not qualified/],
				[kept, /its control pmd kept 0 of the 1 findings its report counts/],
				[
					dropped,
					new RegExp(
						`its referential differs from that of the starting survey ${start}: rule UnusedLocalVariable is in the referential of only one of the two surveys`,
					),
				],
				[
					threshold,
					new RegExp(
						`its referential differs from that of the starting survey ${start}: rule CyclomaticComplexity has the threshold "a method whose cyclomatic complexity is 15 or more" \\(methodReportLevel=15\\) instead of "a method whose cyclomatic complexity is 10 or more" \\(methodReportLevel=10\\)`,
					),
				],
				[version, /rule CyclomaticComplexity is checked by PMD 7\.16\.0 instead of PMD 7\.17\.0/],
				[module, /it measures the modules domain instead of domain, infrastructure/],
			];
			for (const [cited, reason] of refusals) {
				await pi.run(`measure ${cited}`, ctx);
				const said = pi.said.at(-1) ?? "";
				assert.ok(
					said.includes(`the measure cites change ${cited}, which does not measure the integrated project`),
					`the refusal names the cited change: ${said}`,
				);
				assert.match(said, reason);
			}
			const program = ledger.loadProgram(program_id)!.state;
			assert.equal(program.milestone_evaluations.length, evaluations, "no evaluation is recorded");
			assert.equal(program.closed, false, "the program is not closed");
		} finally {
			await session.close();
		}
	});
});
