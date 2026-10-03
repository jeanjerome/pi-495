/**
 * A survey is a repeat only within the change that ran it.
 *
 * The operations of every change of a dossier share one register. Two surveys of the same project
 * read the same reference at the same revision, so a key naming only the reference and the revision
 * would make the second survey a repeat of the first, even after the owner refused the first.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import {
	makeHarness,
	refuseSurvey,
	specReport,
	type TestHarness,
	trackedProject,
	verificationOpenedBy,
} from "../helpers/harness-fixture.ts";

const QUESTION = "où en sont les tests ?";

/** The specification a question on the tests gives: one requirement, the suite of the project. */
const testsReport = specReport({
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
});

/** Starts a survey of the project and conducts it until it stops. */
async function survey(t: TestHarness, projectPath: string) {
	const { change } = await t.harness.start({
		project_path: projectPath,
		request_text: QUESTION,
		actor: HUMAN,
		deliverable: "state",
	});
	const result = await t.harness.advance(change.change_id, { max_steps: 40 });
	return { changeId: change.change_id, result };
}

describe("two surveys of one dossier on the same tree", () => {
	it("deux états des lieux d'un dossier sur le même arbre mesurent chacun le projet : après le refus de A, B inscrit ses preuves, propose son survey et attend IH-10, aucune étape ne nomme OPERATION_ACTIVE, le registre porte une mesure pour A et une pour B, et une seconde ouverture sous la clé de A, dans A, est refusée en nommant l'opération de A", async () => {
		const p = trackedProject();
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: testsReport }] },
			policy: { g5_human_acceptance: false },
		});

		const a = await survey(t, p);
		await refuseSurvey(t, a.changeId, "la couverture manque");
		assert.equal(t.ledger.loadChange(a.changeId)!.state.outcome, "rejected", "the owner refused A");

		const b = await survey(t, p);
		assert.equal(
			b.result.steps.some((s) => s.includes("OPERATION_ACTIVE")),
			false,
			`no step of B names OPERATION_ACTIVE: ${b.result.steps.join(" | ")}`,
		);
		const state = t.ledger.loadChange(b.changeId)!.state;
		assert.ok(
			t.ledger.listEvidence(b.changeId).some((e) => e.subject.kind === "reference"),
			`B records the evidence of its measurement: ${b.result.steps.join(" | ")}`,
		);
		assert.ok(state.proposals.survey?.at(-1), "B proposes its own survey");
		assert.equal(
			t.harness.pendingDecisions(b.changeId).filter((d) => d.interaction === "IH-10").length,
			1,
			"B awaits the IH-10 decision",
		);

		const ofA = verificationOpenedBy(t, a.changeId);
		const ofB = verificationOpenedBy(t, b.changeId);
		assert.equal(ofA.operation?.aggregate_id, a.changeId, "the register holds a measurement for A");
		assert.equal(ofB.operation?.aggregate_id, b.changeId, "the register holds a measurement for B");

		const loaded = t.ledger.loadChange(a.changeId)!;
		const repeat: ChangeEvent = {
			type: "operation.opened",
			at: "2026-10-04T12:00:00.000Z",
			actor: KERNEL_ACTOR,
			operation_id: "op_repeat",
			kind: "verification",
			idempotency_key: ofA.key,
		};
		assert.throws(
			() => t.ledger.appendChange(a.changeId, loaded.revision, [repeat], { correlation_id: "cor_repeat" }),
			(e: Error) =>
				e.message.includes("already holds the idempotency key") && e.message.includes(ofA.operation!.operation_id),
			"a second measurement of A under A's key is refused, naming A's operation",
		);
	});
});
