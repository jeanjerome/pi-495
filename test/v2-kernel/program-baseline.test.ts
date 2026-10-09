/**
 * V2 — a trajectory that brings a project to standards starts from the survey the owner accepted: the
 * harness reads the gaps of that survey from its dossier, by rule, module and perimeter, and refuses a
 * cited change that did not measure the project as it stands (QLT-02, QLT-03).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { canonicalize } from "../../src/contracts/canonical.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { formatStatus } from "../../src/presentation/structured/text.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { LedgerServingAnotherObject } from "../helpers/ledger-serving-another-object.ts";
import { specReport, type TestHarness, trackedProject } from "../helpers/harness-fixture.ts";
import { integrated, programHarness, programOf } from "../helpers/program-fixture.ts";
import {
	answer,
	complex,
	GENERATED_GRADER,
	GRADER,
	latestSurvey,
	onlyComplex,
	QUALIFIED_GENERATED,
	QUALITY_SOURCES,
	qualityProject,
	qualityReactor,
	surveyed,
	surveyOn,
} from "../helpers/quality-survey.ts";
import { increment, threeIncrements } from "../helpers/trajectory.ts";

const reactor = () =>
	qualityReactor({
		"domain/src/main/java/io/h495/Grader.java": QUALITY_SOURCES[GRADER]!,
		"infrastructure/src/main/java/io/h495/Router.java": onlyComplex("Router"),
	});

/** Carries the survey of `changeId` to its close: the referential adopted or left aside, then the survey accepted or refused. */
async function closeSurvey(
	t: TestHarness,
	changeId: string,
	referential: "adopt_referential" | "leave_blind_spot",
	acceptance: "accept" | "refuse",
): Promise<void> {
	answer(t, changeId, referential);
	await t.harness.advance(changeId, { max_steps: 40 });
	answer(t, changeId, acceptance);
	assert.equal(t.ledger.loadChange(changeId)!.state.phase, "closed", "the survey is closed");
}

const gap = (rule_id: string, module: string, authorship?: "proprietary" | "generated") => ({
	rule_id,
	module,
	...(authorship ? { authorship } : {}),
});

/** A document that cites the survey `changeId`: A removes the two gaps of domain, B, on A, the gap of infrastructure. */
function standards(changeId: string) {
	const A = {
		...increment("A", "Domain to standards"),
		gaps: [gap("CyclomaticComplexity", "domain"), gap("UnusedPrivateMethod", "domain")],
	};
	const B = {
		...increment("B", "Infrastructure to standards", ["A"]),
		gaps: [gap("CyclomaticComplexity", "infrastructure")],
	};
	return {
		title: "Bring the reactor to standards",
		baseline: { change_id: changeId },
		increments: [A, B],
		milestones: [
			{ milestone_id: "M1", title: "Standards", increment_ids: ["A", "B"], global_requirement_ids: [], final: true },
		],
		global_requirements: [],
	};
}

/** An accepted survey of `project`, whose dossier serves the survey `edit` rewrites in place of the recorded one. */
async function acceptedSurveyServedAs(
	project: string,
	edit: (survey: Survey) => Survey,
): Promise<{ t: TestHarness; changeId: string }> {
	let ledger: LedgerServingAnotherObject | undefined;
	const { t, changeId } = await surveyed(project, {
		ledger: (path) => {
			ledger = new LedgerServingAnotherObject(path);
			return ledger;
		},
	});
	await closeSurvey(t, changeId, "adopt_referential", "accept");
	const adopted = t.ledger.loadChange(changeId)!.state.adopted.survey!.ref;
	const edited = edit(await latestSurvey(t, changeId));
	ledger!.serve(adopted, await t.objects.put(new TextEncoder().encode(canonicalize(edited)), "application/json"));
	return { t, changeId };
}

/** Adopting `document` on `project` is refused with a message that names `changeId` and matches `reason`, and writes nothing. */
async function refused(t: TestHarness, project: string, document: unknown, changeId: string, reason: RegExp) {
	const programs = t.ledger.listPrograms().length;
	const changes = t.ledger.listChanges().length;
	await assert.rejects(
		t.harness.adopt({ project_path: project, trajectory: document, actor: HUMAN }),
		(error: Error) => {
			assert.ok(error.message.includes(`change ${changeId}`), `the refusal names the cited change: ${error.message}`);
			assert.match(error.message, reason);
			return true;
		},
	);
	assert.equal(t.ledger.listPrograms().length, programs, "no program is created");
	assert.equal(t.ledger.listChanges().length, changes, "no change is created");
}

describe("a trajectory reads its gaps in the dossier of the survey it cites", () => {
	it("adopter une trajectoire qui cite l'état des lieux accepté du réacteur inscrit au programme l'état des lieux, le digest de l'arbre mesuré et ses trois écarts du code propriétaire avec leur nombre, et la demande du changement de A nomme ses deux écarts avec leur règle, leur seuil, leur module et leur nombre", async () => {
		const project = reactor();
		const { t, changeId } = await surveyed(project);
		await closeSurvey(t, changeId, "adopt_referential", "accept");
		const survey = await latestSurvey(t, changeId);

		const { program, change } = await t.harness.adopt({
			project_path: project,
			trajectory: standards(changeId),
			actor: HUMAN,
			language: "en",
		});
		assert.equal(program.baseline?.change_id, changeId, "the program names the cited survey");
		assert.equal(
			program.baseline?.reference_digest,
			survey.reference_digest,
			"with the digest of the tree it measured",
		);
		assert.deepEqual(
			program.baseline?.gaps.map((g) => [g.rule_id, g.module, g.authorship, g.violations, g.scope_decision]),
			[
				["CyclomaticComplexity", "domain", "proprietary", 1, null],
				["CyclomaticComplexity", "infrastructure", "proprietary", 1, null],
				["UnusedPrivateMethod", "domain", "proprietary", 1, null],
			],
			"the three gaps of the proprietary code, each with its count",
		);
		assert.deepEqual(
			program.increments.map((i) => [i.increment_id, i.gaps.map((g) => `${g.rule_id} ${g.module} ${g.authorship}`)]),
			[
				["A", ["CyclomaticComplexity domain proprietary", "UnusedPrivateMethod domain proprietary"]],
				["B", ["CyclomaticComplexity infrastructure proprietary"]],
			],
		);

		const request = (await t.harness.artifacts.read<string>(change.request)).split("\n");
		assert.ok(
			request.includes(
				"- CyclomaticComplexity in domain, proprietary code: 1 violation at the survey (threshold: a method whose cyclomatic complexity is 10 or more)",
			),
			request.join("\n"),
		);
		assert.ok(
			request.includes(
				"- UnusedPrivateMethod in domain, proprietary code: 1 violation at the survey (threshold: any occurrence)",
			),
			request.join("\n"),
		);
		assert.ok(!request.some((l) => l.includes("infrastructure")), "A's request names only A's gaps");
	});

	it("l'écart du code généré écarté par une décision de périmètre motivée est inscrit avec sa raison", async () => {
		const project = qualityProject("", {
			[GRADER]: onlyComplex("Grader"),
			[GENERATED_GRADER]: complex("GeneratedGrader", QUALIFIED_GENERATED).replace(
				"\n    private static int never() { return 0; }\n",
				"",
			),
		});
		const { t, changeId } = await surveyed(project);
		await closeSurvey(t, changeId, "adopt_referential", "accept");
		const reason = "the generated mappers are rewritten by their generator on every build";

		const { program } = await t.harness.adopt({
			project_path: project,
			trajectory: {
				title: "Bring the project to standards",
				baseline: {
					change_id: changeId,
					scope_decisions: [{ ...gap("CyclomaticComplexity", ".", "generated"), reason }],
				},
				increments: [{ ...increment("A", "Grader to standards"), gaps: [gap("CyclomaticComplexity", ".")] }],
				milestones: [
					{ milestone_id: "M1", title: "Standards", increment_ids: ["A"], global_requirement_ids: [], final: true },
				],
				global_requirements: [],
			},
			actor: HUMAN,
		});
		assert.deepEqual(
			program.baseline?.gaps.map((g) => [g.rule_id, g.module, g.authorship, g.violations, g.scope_decision]),
			[
				["CyclomaticComplexity", ".", "proprietary", 1, null],
				["CyclomaticComplexity", ".", "generated", 1, { reason }],
			],
			"the gap of the generated code is recorded with the scope decision and its reason",
		);
	});

	it("un document qui cite un changement inconnu ou un état des lieux encore ouvert est refusé en nommant le changement, et une décision de périmètre qui écarte un écart que l'état des lieux ne porte pas est refusée en nommant l'écart, sans programme créé", async () => {
		const project = reactor();
		const { t, changeId: open } = await surveyed(project);
		await refused(t, project, standards("chg_unknown"), "chg_unknown", /which does not exist/);
		await refused(t, project, standards(open), open, /the owner did not accept its survey: it is still open/);

		await closeSurvey(t, open, "adopt_referential", "accept");
		const programs = t.ledger.listPrograms().length;
		const document = {
			...standards(open),
			baseline: { change_id: open, scope_decisions: [{ ...gap("CPD", "domain"), reason: "duplication is accepted" }] },
		};
		await assert.rejects(t.harness.adopt({ project_path: project, trajectory: document, actor: HUMAN }), {
			message: "a scope decision sets aside CPD in domain (proprietary code), a gap the cited survey does not carry",
		});
		assert.equal(t.ledger.listPrograms().length, programs, "no program is created");
	});

	it("un écart que rien ne prend en charge et un incrément qui supprime un écart que l'état des lieux ne porte pas sont refusés en nommant l'écart, sans programme ni changement créé", async () => {
		const project = reactor();
		const { t, changeId } = await surveyed(project);
		await closeSurvey(t, changeId, "adopt_referential", "accept");
		const document = standards(changeId);
		const [A, B] = document.increments;
		const programs = t.ledger.listPrograms().length;
		const changes = t.ledger.listChanges().length;

		await assert.rejects(
			t.harness.adopt({
				project_path: project,
				trajectory: { ...document, increments: [A, { ...B!, gaps: [] }] },
				actor: HUMAN,
			}),
			{
				message:
					"gap CyclomaticComplexity in infrastructure (proprietary code, 1 violation) is removed by no increment and set aside by no scope decision",
			},
		);
		await assert.rejects(
			t.harness.adopt({
				project_path: project,
				trajectory: { ...document, increments: [{ ...A!, gaps: [...A!.gaps, gap("CPD", "domain")] }, B] },
				actor: HUMAN,
			}),
			{ message: "increment A removes CPD in domain (proprietary code), a gap the cited survey does not carry" },
		);
		assert.equal(t.ledger.listPrograms().length, programs, "no program is created");
		assert.equal(t.ledger.listChanges().length, changes, "no change is created");
	});

	it("un document qui cite un changement à candidat, un état des lieux refusé, sans référentiel adopté, d'un autre projet ou dont pmd n'est pas qualifié est refusé avec un message qui nomme le changement et la raison, sans programme créé", async () => {
		const project = reactor();
		const { t, changeId: rejected } = await surveyed(project);
		await closeSurvey(t, rejected, "adopt_referential", "refuse");
		await refused(t, project, standards(rejected), rejected, /the owner did not accept its survey: it closed rejected/);

		const { changeId: unreferenced } = await surveyOn(t, project);
		await closeSurvey(t, unreferenced, "leave_blind_spot", "accept");
		await refused(t, project, standards(unreferenced), unreferenced, /its survey adopted no quality referential/);

		const other = qualityReactor({
			"domain/src/main/java/io/h495/Grader.java": QUALITY_SOURCES[GRADER]!,
			"infrastructure/src/main/java/io/h495/Gateway.java": onlyComplex("Gateway"),
		});
		const { changeId: foreign } = await surveyOn(t, other);
		await closeSurvey(t, foreign, "adopt_referential", "accept");
		await refused(t, project, standards(foreign), foreign, /it surveyed another project/);

		const { change: candidate } = await t.harness.start({
			project_path: project,
			request_text: "add a grading mode",
			actor: HUMAN,
		});
		await refused(
			t,
			project,
			standards(candidate.change_id),
			candidate.change_id,
			/it delivers a candidate, not a survey of the project/,
		);

		const blind = await acceptedSurveyServedAs(project, (survey) => ({
			...survey,
			controls: survey.controls.map((c) =>
				c.control_id === "pmd"
					? {
							...c,
							verdict: null,
							blind_spot:
								"blind spot: the control is not qualified: negative witness gave PASS: the control does not detect the defect it claims to cover",
						}
					: c,
			),
		}));
		await refused(
			blind.t,
			project,
			standards(blind.changeId),
			blind.changeId,
			/its control pmd measured nothing of the reference: blind spot: the control is not qualified/,
		);
	});

	it("un état des lieux dont un contrôle du référentiel manque à la liste des contrôles mesurés est refusé en nommant le changement et le contrôle, sans programme créé", async () => {
		const project = reactor();
		const missing = await acceptedSurveyServedAs(project, (survey) => ({
			...survey,
			controls: survey.controls.filter((c) => c.control_id !== "pmd"),
		}));
		await refused(
			missing.t,
			project,
			standards(missing.changeId),
			missing.changeId,
			/its control pmd measured nothing of the reference$/,
		);
	});

	it("un état des lieux dont le contrôle pmd a gardé 1000 des 1001 constats de son rapport est refusé avec un message qui nomme le changement, le contrôle et les deux comptes, sans programme ni changement créé", async () => {
		// A thousand methods of complexity 11 precede, in the report, the only private method nothing calls.
		const graders = Object.fromEntries(
			Array.from({ length: 1000 }, (_, n) => {
				const name = `Grader${String(n).padStart(4, "0")}`;
				return [`infrastructure/src/main/java/io/h495/${name}.java`, onlyComplex(name)];
			}),
		);
		const project = qualityReactor({
			"domain/src/main/java/io/h495/Clean.java":
				"package io.h495;\n\npublic final class Clean {\n    private Clean() {}\n}\n",
			...graders,
			"infrastructure/src/main/java/io/h495/Router.java":
				"package io.h495;\n\npublic final class Router {\n    private Router() {}\n\n    private static int never() { return 0; }\n}\n",
		});
		const { t, changeId } = await surveyed(project);
		await closeSurvey(t, changeId, "adopt_referential", "accept");
		const document = {
			title: "Bring the infrastructure to standards",
			baseline: { change_id: changeId },
			increments: [
				{
					...increment("A", "Infrastructure to standards"),
					gaps: [gap("CyclomaticComplexity", "infrastructure")],
				},
			],
			milestones: [
				{ milestone_id: "M1", title: "Standards", increment_ids: ["A"], global_requirement_ids: [], final: true },
			],
			global_requirements: [],
		};

		await refused(t, project, document, changeId, /its control pmd kept 1000 of the 1001 findings its report counts/);
	});

	const exception = {
		owner: "équipe infrastructure",
		due: "2027-03-31",
		reason: "the message broker client is replaced with the next platform release",
	};
	/** A document that cites the survey `changeId`: A removes the two gaps of domain, an exception tolerates the gap of infrastructure. */
	const underException = (changeId: string, granted: Partial<typeof exception>) => {
		const document = standards(changeId);
		return {
			...document,
			baseline: { change_id: changeId, exceptions: [{ ...gap("CyclomaticComplexity", "infrastructure"), ...granted }] },
			increments: [document.increments[0]!],
			milestones: [{ ...document.milestones[0]!, increment_ids: ["A"] }],
		};
	};

	it("un document qui cite l'état des lieux accepté du réacteur et pose sur CyclomaticComplexity dans infrastructure une exception avec propriétaire, échéance et raison est adopté, et le programme inscrit l'écart avec son exception", async () => {
		const project = reactor();
		const { t, changeId } = await surveyed(project);
		await closeSurvey(t, changeId, "adopt_referential", "accept");

		const { program } = await t.harness.adopt({
			project_path: project,
			trajectory: underException(changeId, exception),
			actor: HUMAN,
		});
		assert.deepEqual(
			program.baseline?.gaps.map((g) => [g.rule_id, g.module, g.violations, g.exception ?? null]),
			[
				["CyclomaticComplexity", "domain", 1, null],
				["CyclomaticComplexity", "infrastructure", 1, exception],
				["UnusedPrivateMethod", "domain", 1, null],
			],
			"the gap of infrastructure is recorded with its exception",
		);
	});

	it("une exception sans propriétaire ou sans échéance est refusée avec un message qui nomme CyclomaticComplexity dans infrastructure et ce qui lui manque, sans programme créé", async () => {
		const project = reactor();
		const { t, changeId } = await surveyed(project);
		await closeSurvey(t, changeId, "adopt_referential", "accept");
		const programs = t.ledger.listPrograms().length;
		const changes = t.ledger.listChanges().length;
		const { owner: _owner, ...ownerless } = exception;
		const { due: _due, ...undated } = exception;

		for (const [granted, lacks] of [
			[ownerless, "has no owner"],
			[undated, "has no due date"],
		] as const)
			await assert.rejects(
				t.harness.adopt({ project_path: project, trajectory: underException(changeId, granted), actor: HUMAN }),
				{ message: `exception on gap CyclomaticComplexity in infrastructure (proprietary code) ${lacks}` },
			);
		await assert.rejects(
			t.harness.adopt({
				project_path: project,
				trajectory: {
					...underException(changeId, exception),
					baseline: { change_id: changeId, exceptions: [{ ...gap("CPD", "domain"), ...exception }] },
				},
				actor: HUMAN,
			}),
			{ message: "an exception tolerates CPD in domain (proprietary code), a gap the cited survey does not carry" },
		);
		assert.equal(t.ledger.listPrograms().length, programs, "no program is created");
		assert.equal(t.ledger.listChanges().length, changes, "no change is created");
	});

	it("deux méthodes de complexité 11 dans domain font un écart de 2 violations, que le programme inscrit et que la demande du changement de A nomme, quel que soit le document", async () => {
		const project = qualityReactor({
			"domain/src/main/java/io/h495/Grader.java": QUALITY_SOURCES[GRADER]!,
			"domain/src/main/java/io/h495/Ranker.java": onlyComplex("Ranker"),
			"infrastructure/src/main/java/io/h495/Router.java": onlyComplex("Router"),
		});
		const { t, changeId } = await surveyed(project);
		await closeSurvey(t, changeId, "adopt_referential", "accept");

		const { program, change } = await t.harness.adopt({
			project_path: project,
			trajectory: standards(changeId),
			actor: HUMAN,
			language: "en",
		});
		assert.deepEqual(
			program.baseline?.gaps.map((g) => [g.rule_id, g.module, g.violations]),
			[
				["CyclomaticComplexity", "domain", 2],
				["CyclomaticComplexity", "infrastructure", 1],
				["UnusedPrivateMethod", "domain", 1],
			],
			"the count of a gap is the one the survey reads",
		);
		const request = (await t.harness.artifacts.read<string>(change.request)).split("\n");
		assert.ok(
			request.includes(
				"- CyclomaticComplexity in domain, proprietary code: 2 violations at the survey (threshold: a method whose cyclomatic complexity is 10 or more)",
			),
			request.join("\n"),
		);
	});
});

describe("the milestone of a trajectory adopted on a survey", () => {
	it("A puis B intégrés, la demande du changement de B nomme son écart, le programme inscrit une évaluation du jalon final INDETERMINATE qui nomme chacun des trois écarts comme non mesuré sur le projet intégré, et le programme n'est pas clos, ce que dit le statut", async () => {
		const project = reactor();
		const { t, changeId } = await surveyed(project, { integration: true });
		await closeSurvey(t, changeId, "adopt_referential", "accept");
		const { program, change } = await t.harness.adopt({
			project_path: project,
			trajectory: standards(changeId),
			actor: HUMAN,
			language: "en",
		});
		// The increments are candidates: the model specifies a behaviour, not the quality question of the survey.
		t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: specReport() }] });

		await integrated(t, change.change_id, "A");
		const b = await t.harness.startNext({ program_id: program.program_id, actor: HUMAN, language: "en" });
		const request = (await t.harness.artifacts.read<string>(b.change.request)).split("\n");
		assert.ok(
			request.includes(
				"- CyclomaticComplexity in infrastructure, proprietary code: 1 violation at the survey (threshold: a method whose cyclomatic complexity is 10 or more)",
			),
			request.join("\n"),
		);
		const last = await integrated(t, b.change.change_id, "B");

		const state = programOf(t, program.program_id);
		const evaluation = state.milestone_evaluations.at(-1);
		assert.equal(evaluation?.integrated_digest, last, "the milestone is evaluated on B's integration");
		assert.equal(evaluation?.verdict, "INDETERMINATE");
		assert.deepEqual(evaluation?.remaining, [], "no increment remains");
		const unmeasured = [
			"gap:CyclomaticComplexity in domain (proprietary code): not measured on the integrated project",
			"gap:CyclomaticComplexity in infrastructure (proprietary code): not measured on the integrated project",
			"gap:UnusedPrivateMethod in domain (proprietary code): not measured on the integrated project",
		];
		assert.deepEqual(evaluation?.indeterminate, unmeasured);
		assert.equal(state.closed, false, "the program is not closed");
		const en = formatStatus(t.harness.status(b.change.change_id), "en").split("\n");
		assert.ok(
			en.includes(`  Milestone M1 (Standards): INDETERMINATE — indeterminate: ${unmeasured.join(", ")}`),
			en.join("\n"),
		);
		assert.ok(
			en.includes(`Program: Bring the reactor to standards (${program.program_id}) — ${project}`),
			`the status does not say the program closed: ${en.join("\n")}`,
		);
	});
});

describe("a dossier written before increments named gaps", () => {
	it("le statut d'un programme dont la projection stockée a été écrite avant que ses incréments nomment des écarts liste chacun avec son titre et son statut, sans écart ni état des lieux, et le dossier reste intègre", async () => {
		const t = programHarness(true);
		const { program, change } = await t.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements(),
			actor: HUMAN,
		});
		// The projection as a dossier recorded before increments named gaps stores it: no gaps, no baseline.
		const stored = JSON.parse(
			JSON.stringify(t.ledger.loadProgram(program.program_id)!.state, (field, value) =>
				field === "gaps" || field === "baseline" ? undefined : value,
			),
		);
		t.ledger.db
			.prepare("UPDATE programs SET state = ? WHERE program_id = ?")
			.run(JSON.stringify(stored), program.program_id);
		assert.equal("gaps" in stored.increments[0], false);

		const view = t.harness.status(change.change_id);
		assert.deepEqual(
			view.program?.increments.map((i) => [i.increment_id, i.title, i.status, i.gaps]),
			[
				["A", "Common base", "active", []],
				["B", "Export", "planned", []],
				["C", "Import", "planned", []],
			],
		);
		assert.equal(view.program?.baseline, null);
		assert.deepEqual(view.program?.set_aside, []);
		const fr = formatStatus(view, "fr").split("\n");
		assert.ok(fr.includes("  Incrément A (Common base): actif"), fr.join("\n"));
		assert.ok(fr.includes("  Incrément B (Export): planifié"), fr.join("\n"));
		assert.equal(
			(await t.ledger.verifyIntegrity()).problems.filter((p) => p.subject === program.program_id).length,
			0,
			"the projection of the dossier is the replay of its journal",
		);
	});
});

describe("the measure of a program that cites no survey", () => {
	it("mesurer un programme dont la trajectoire ne cite aucun état des lieux est refusé en le disant, sans évaluation inscrite", async () => {
		const t = programHarness(false);
		const { program } = await t.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements(),
			actor: HUMAN,
		});
		const evaluations = programOf(t, program.program_id).milestone_evaluations.length;
		await assert.rejects(
			t.harness.measure({ program_id: program.program_id, change_id: "chg-unknown", actor: HUMAN }),
			new RegExp(`program ${program.program_id} cites no survey to measure against`),
		);
		assert.equal(
			programOf(t, program.program_id).milestone_evaluations.length,
			evaluations,
			"no evaluation is recorded",
		);
	});
});
