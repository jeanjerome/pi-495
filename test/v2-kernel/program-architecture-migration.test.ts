/**
 * V2 — a migration starts from the accepted survey of the architecture whose owner chose an alternative: the harness
 * reads the target and the violations of the adopted map in the dossier of that survey, never in the document, and
 * refuses a violated rule nothing takes in charge, a step that removes a rule the survey did not find broken, an
 * exception without its owner or its due date, and a survey that gives no target or measured nothing (ARC-03).
 * Maven and ArchUnit are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { canonicalize } from "../../src/contracts/canonical.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { formatStatus } from "../../src/presentation/structured/text.ts";
import { ADJUST, RECOMMENDATION, RECOMMENDATION_MODULES, recommended } from "../helpers/architecture-recommendation.ts";
import { mavenReactor } from "../helpers/architecture-survey.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { LedgerServingAnotherObject } from "../helpers/ledger-serving-another-object.ts";
import {
	acceptedSurvey,
	APP_TO_INFRA,
	EXCEPTION,
	MIGRATION_MAP,
	MIGRATION_SOURCES,
	migration,
	PART_CYCLE,
	UNMAPPED_SOURCE,
} from "../helpers/migration.ts";
import { integrated, programOf } from "../helpers/program-fixture.ts";
import { latestSurvey } from "../helpers/quality-survey.ts";

/** Adopting `document` on `project` is refused with a message `check` reads, and writes neither a program nor a change. */
async function refused(t: TestHarness, project: string, document: unknown, check: (message: string) => void) {
	const programs = t.ledger.listPrograms().length;
	const changes = t.ledger.listChanges().length;
	await assert.rejects(
		t.harness.adopt({ project_path: project, trajectory: document, actor: HUMAN }),
		(error: Error) => {
			check(error.message);
			return true;
		},
	);
	assert.equal(t.ledger.listPrograms().length, programs, "no program is created");
	assert.equal(t.ledger.listChanges().length, changes, "no change is created");
}

/** The survey of the reactor, accepted with A2 chosen, whose dossier serves the survey `served` makes of the measured one. */
async function acceptedSurveyServedAs(served: (survey: Survey) => Survey) {
	let ledger: LedgerServingAnotherObject | undefined;
	const accepted = await acceptedSurvey("A2", {
		ledger: (path) => {
			ledger = new LedgerServingAnotherObject(path);
			return ledger;
		},
	});
	const adopted = accepted.t.ledger.loadChange(accepted.changeId)!.state.adopted.survey!.ref;
	const survey = served(await latestSurvey(accepted.t, accepted.changeId));
	ledger!.serve(
		adopted,
		await accepted.t.objects.put(new TextEncoder().encode(canonicalize(survey)), "application/json"),
	);
	return accepted;
}

/** The message names each of `said`. */
const naming =
	(...said: string[]) =>
	(message: string) => {
		for (const s of said) assert.ok(message.includes(s), `the refusal names « ${s} »: ${message}`);
	};

describe("a migration is adopted on the chosen target and the violations of the map", () => {
	it("adopter une migration qui cite l'état des lieux accepté du réacteur, où le propriétaire a choisi A2, inscrit au programme l'état des lieux, le digest de l'arbre mesuré, A2 avec sa nature et sa description, les écarts part app may not depend on part infra 2 et every main source belongs to a part 1, l'exception avec son propriétaire et son échéance, et le statut liste sous E2 l'écart qu'elle supprime avec ses 2 violations", async () => {
		const { t, changeId, project } = await acceptedSurvey();
		const survey = await latestSurvey(t, changeId);

		const { program, change } = await t.harness.adopt({
			project_path: project,
			trajectory: migration(changeId),
			actor: HUMAN,
			language: "en",
		});
		assert.equal(program.migration?.change_id, changeId, "the program names the cited survey");
		assert.equal(
			program.migration?.reference_digest,
			survey.reference_digest,
			"with the digest of the tree it measured",
		);
		assert.deepEqual(
			program.migration?.target,
			{ alternative_id: "A2", nature: "adjust", description: ADJUST.description },
			"the target is the alternative the owner chose, with its nature and its description",
		);
		assert.deepEqual(
			program.migration?.gaps.map((g) => [g.rule_id, g.violations]),
			[
				[UNMAPPED_SOURCE, 1],
				[APP_TO_INFRA, 2],
			],
			"the two violated rules of the map, each with its count at the survey",
		);
		const { rule_id: _rule, ...exception } = EXCEPTION;
		assert.deepEqual(
			program.migration?.gaps.find((g) => g.rule_id === UNMAPPED_SOURCE)?.exception,
			exception,
			"the exception with its owner, its due date and its reason",
		);
		assert.equal(
			program.increments.find((i) => i.increment_id === "E1")?.change_id,
			change.change_id,
			"a change is created for E1",
		);

		const en = formatStatus(t.harness.status(change.change_id), "en").split("\n");
		const e2 = en.indexOf("  Increment E2 (Move app behind the port): planned");
		assert.ok(e2 > 0, en.join("\n"));
		assert.equal(en[e2 + 1], `    removes ${APP_TO_INFRA}: 2 violations at the survey`, en.join("\n"));
		assert.ok(
			en.includes(
				`  Exception: ${UNMAPPED_SOURCE}: 1 violation at the survey — équipe paiement, due 2026-12-31 — ${EXCEPTION.reason}`,
			),
			en.join("\n"),
		);
	});

	it("une règle enfreinte qu'aucune étape ne supprime ni qu'aucune décision ou exception ne prend en charge, une étape qui supprime no cycle between the parts, ou une exception sans propriétaire ou sans échéance, est refusée avec un message qui la nomme, sans programme créé", async () => {
		const { t, changeId, project } = await acceptedSurvey();
		const { owner: _owner, ...ownerless } = EXCEPTION;
		const { due: _due, ...undated } = EXCEPTION;

		await refused(
			t,
			project,
			migration(changeId, { migration: { exceptions: [] } }),
			naming(
				`rule ${UNMAPPED_SOURCE} (1 violation)`,
				"removed by no increment",
				"set aside by no scope decision",
				"tolerated by no exception",
			),
		);
		await refused(
			t,
			project,
			migration(changeId, { e1: { removes: [PART_CYCLE] } }),
			naming(`increment E1 removes ${PART_CYCLE}`, "a violated rule the cited survey does not carry"),
		);
		await refused(
			t,
			project,
			migration(changeId, { migration: { exceptions: [ownerless] } }),
			naming(`exception on rule ${UNMAPPED_SOURCE} has no owner`),
		);
		await refused(
			t,
			project,
			migration(changeId, { migration: { exceptions: [undated] } }),
			naming(`exception on rule ${UNMAPPED_SOURCE} has no due date`),
		);
	});

	it("une décision de périmètre motivée qui écarte every main source belongs to a part prend la règle en charge : la migration est adoptée et le statut dit la règle écartée avec sa raison ; une décision ou une exception qui nomme no cycle between the parts est refusée, sans programme créé", async () => {
		const { t, changeId, project } = await acceptedSurvey();
		const reason = "la source hors carte relève du module historique";

		await refused(
			t,
			project,
			migration(changeId, { migration: { exceptions: [], scope_decisions: [{ rule_id: PART_CYCLE, reason }] } }),
			naming(`a scope decision sets aside ${PART_CYCLE}`, "a violated rule the cited survey does not carry"),
		);
		await refused(
			t,
			project,
			migration(changeId, { migration: { exceptions: [{ ...EXCEPTION, rule_id: PART_CYCLE }] } }),
			naming(`an exception tolerates ${PART_CYCLE}`, "a violated rule the cited survey does not carry"),
		);

		const { program, change } = await t.harness.adopt({
			project_path: project,
			trajectory: migration(changeId, {
				migration: { exceptions: [], scope_decisions: [{ rule_id: UNMAPPED_SOURCE, reason }] },
			}),
			actor: HUMAN,
			language: "en",
		});
		assert.deepEqual(
			program.migration?.gaps.find((g) => g.rule_id === UNMAPPED_SOURCE)?.scope_decision,
			{ reason },
			"the scope decision with its reason",
		);
		const en = formatStatus(t.harness.status(change.change_id), "en").split("\n");
		assert.ok(en.includes(`  Set aside: ${UNMAPPED_SOURCE}: 1 violation at the survey — ${reason}`), en.join("\n"));
	});
});

describe("the gaps of a migration come from the architecture control alone", () => {
	it("un constat d'un contrôle de l'état des lieux qui ne mesure pas la carte n'est pas un écart de la migration : elle est adoptée avec les deux seuls écarts du contrôle d'architecture", async () => {
		const other = "CyclomaticComplexity";
		const { t, changeId, project } = await acceptedSurveyServedAs((survey) => {
			const off = survey.controls.find((c) => c.control_id !== "architecture");
			assert.ok(
				off,
				`the survey carries a control besides the architecture one: ${survey.controls.map((c) => c.control_id)}`,
			);
			return {
				...survey,
				controls: survey.controls.map((c) =>
					c === off
						? {
								...c,
								findings: [
									...c.findings,
									{ message: "OrderService.java:12 is too complex", path: "OrderService.java", rule_id: other },
								],
							}
						: c,
				),
			};
		});

		const { program } = await t.harness.adopt({ project_path: project, trajectory: migration(changeId), actor: HUMAN });
		assert.deepEqual(
			program.migration?.gaps.map((g) => [g.rule_id, g.violations]),
			[
				[UNMAPPED_SOURCE, 1],
				[APP_TO_INFRA, 2],
			],
			`only the violations of the architecture control are gaps, never ${other}`,
		);
	});
});

describe("a survey that gives no target or measured nothing is not the starting point of a migration", () => {
	it("un état des lieux dont le propriétaire a laissé le choix en suspens, sans recommandation présentée, dont la carte est en angle mort ou dont le contrôle d'architecture n'a rien mesuré est refusé avec un message qui nomme le changement et la raison, sans programme créé", async () => {
		const cases: [Awaited<ReturnType<typeof acceptedSurvey>>, string][] = [
			[await acceptedSurvey("suspend"), "the owner left the choice of its recommendation pending"],
			[
				// A recommendation of a single alternative is not presented to the owner.
				await acceptedSurvey("A2", { recommendation: { ...RECOMMENDATION, alternatives: [ADJUST] } }),
				"it presented no architecture recommendation to choose from",
			],
			[await acceptedSurvey("A2", { answer: "leave_blind_spot" }), "its survey adopted no architecture map"],
		];
		const unmeasured = await acceptedSurveyServedAs((survey) => ({
			...survey,
			controls: survey.controls.map((c) =>
				c.control_id === "architecture"
					? { ...c, verdict: null, findings: [], blind_spot: "blind spot: the control is not qualified" }
					: c,
			),
		}));
		cases.push([unmeasured, "its control architecture measured nothing of the reference"]);

		for (const [{ t, changeId, project }, reason] of cases)
			await refused(
				t,
				project,
				migration(changeId),
				naming(`trajectory cites change ${changeId}, which is not the starting point of a migration`, reason),
			);
	});
});

describe("a migration starts only from an accepted survey of the same project", () => {
	it("un document de migration qui cite un changement inconnu, un état des lieux encore ouvert ou l'état des lieux accepté d'un autre projet est refusé avec un message qui nomme le changement et la raison, sans programme créé", async () => {
		const { t, changeId, project } = await acceptedSurvey();
		await refused(
			t,
			project,
			migration("chg_unknown"),
			naming("trajectory cites change chg_unknown, which does not exist"),
		);
		await refused(
			t,
			mavenReactor(RECOMMENDATION_MODULES, MIGRATION_SOURCES),
			migration(changeId),
			naming(
				`trajectory cites change ${changeId}, which is not the starting point of a migration`,
				"it surveyed another project",
			),
		);

		const open = await recommended([RECOMMENDATION], MIGRATION_SOURCES, "en", { map: MIGRATION_MAP });
		await refused(
			open.t,
			open.project,
			migration(open.changeId),
			naming(
				`trajectory cites change ${open.changeId}, which is not the starting point of a migration`,
				"the owner did not accept its survey: it is still open",
			),
		);
	});
});

describe("the milestone of a migration does not pass on the closure of its steps alone", () => {
	it("E1 et E2 intégrés, le jalon final est INDETERMINATE, nomme les deux écarts d'architecture comme non mesurés sur le projet intégré, et le programme n'est pas clos", async () => {
		const { t, changeId, project } = await acceptedSurvey("A2", { integration: true });
		const { program, change } = await t.harness.adopt({
			project_path: project,
			trajectory: migration(changeId),
			actor: HUMAN,
			language: "en",
		});
		// The steps are candidates: the model specifies a behaviour, not the architecture question of the survey.
		t.agent.scripts.set("specify", { steps: [{ kind: "complete", output: specReport() }] });

		await integrated(t, change.change_id, "E1");
		const e2 = await t.harness.startNext({ program_id: program.program_id, actor: HUMAN, language: "en" });
		const last = await integrated(t, e2.change.change_id, "E2");

		const state = programOf(t, program.program_id);
		const evaluation = state.milestone_evaluations.at(-1);
		assert.equal(evaluation?.integrated_digest, last, "the milestone is evaluated on E2's integration");
		assert.equal(evaluation?.verdict, "INDETERMINATE");
		assert.deepEqual(evaluation?.remaining, [], "no step remains");
		const unmeasured = [
			`rule:${UNMAPPED_SOURCE}: not measured on the integrated project`,
			`rule:${APP_TO_INFRA}: not measured on the integrated project`,
		];
		assert.deepEqual(evaluation?.indeterminate, unmeasured);
		assert.equal(state.closed, false, "the program is not closed");
		const en = formatStatus(t.harness.status(e2.change.change_id), "en").split("\n");
		assert.ok(
			en.includes(`  Milestone M1 (Migration): INDETERMINATE — indeterminate: ${unmeasured.join(", ")}`),
			en.join("\n"),
		);
		assert.ok(
			en.includes(`Program: Put the payment behind a port (${program.program_id}) — ${project}`),
			`the status does not say the program closed: ${en.join("\n")}`,
		);
	});
});
