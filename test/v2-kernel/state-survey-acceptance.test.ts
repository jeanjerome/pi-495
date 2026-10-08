import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { DecisionRequest } from "../../src/contracts/v1/decision.ts";
import { HUMAN, tuiOrigin } from "../helpers/change-fixture.ts";
import { makeHarness, specReport, trackedProject, type TestHarness } from "../helpers/harness-fixture.ts";
import { STACKS_WITHOUT_NODE_STRUCTURE } from "../helpers/technologies.ts";

/** What a survey says of one requirement, as this test reads it from the dossier. */
interface SurveyedRequirement {
	requirement_id: string;
	measures: { control_id: string; verdict: string }[];
	blind_spot: string | null;
}

const QUESTION = "où en sont les tests et la couverture ?";

/** A question on the tests and the architecture: one requirement measured, one a blind spot of a Node project. */
const surveyReport = specReport({
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
		{
			requirement_id: "R-ARCH",
			statement: "the domain modules import nothing from the infrastructure modules",
			mandatory: true,
			criterion: "no import from src/infra under src/domain",
			category: "architecture",
			satisfied_by_reference: true,
		},
	],
});

/** Starts a survey of a Node project whose suite passes, under a policy that asks no acceptance, and conducts it. */
async function surveyed(): Promise<{ t: TestHarness; changeId: string }> {
	const t = makeHarness({
		// A technology that reads no structure of the project proposes no architecture map for it.
		stacks: STACKS_WITHOUT_NODE_STRUCTURE,
		defaultScript: { steps: [{ kind: "complete", output: surveyReport }] },
		policy: { g5_human_acceptance: false },
	});
	const { change } = await t.harness.start({
		project_path: trackedProject(),
		request_text: QUESTION,
		actor: HUMAN,
		deliverable: "state",
	});
	await t.harness.advance(change.change_id, { max_steps: 40 });
	return { t, changeId: change.change_id };
}

/** The IH-10 decision the survey awaits. */
function awaitedAcceptance(t: TestHarness, changeId: string): DecisionRequest {
	const pending = t.harness.pendingDecisions(changeId).filter((d) => d.interaction === "IH-10");
	const state = t.ledger.loadChange(changeId)!.state;
	assert.equal(
		pending.length,
		1,
		`an IH-10 decision awaits the owner: ${state.phase}/${state.status} outcome=${state.outcome} G5=${state.gates.G5?.verdict}`,
	);
	return pending[0]!;
}

/** The owner answers the awaited acceptance, then the change is conducted again. */
async function answer(t: TestHarness, changeId: string, optionId: string, freeText: string | null) {
	const asked = awaitedAcceptance(t, changeId);
	const answered = t.harness.answerDecision(
		changeId,
		{
			decision_id: asked.decision_id,
			option_id: optionId,
			free_text: freeText,
			reason: null,
			subject_revision: asked.subject.revision,
			scope: null,
			expires_at: null,
		},
		tuiOrigin(),
	);
	assert.equal(answered.error, null, answered.error?.message);
	await t.harness.advance(changeId, { max_steps: 10 });
	return { decision: answered.decision!, state: t.ledger.loadChange(changeId)!.state };
}

describe("the owner accepts or refuses the survey", () => {
	it("G5 d'un état des lieux demande IH-10 sur le survey avec les seules options accepter et refuser et un fait par exigence, même quand la politique n'exige pas l'acceptation", async () => {
		const { t, changeId } = await surveyed();
		const asked = awaitedAcceptance(t, changeId);
		const state = t.ledger.loadChange(changeId)!.state;

		const survey = state.proposals.survey?.at(-1);
		assert.ok(survey, "a survey is proposed");
		assert.equal(asked.subject.kind, "artifact", "the decision is asked on the survey");
		assert.equal(asked.subject.id, survey.artifact_id);
		assert.equal(asked.subject.digest, survey.content_digest);
		assert.equal(asked.question, "Accepter cet état des lieux ?");
		assert.deepEqual(
			asked.options.map((o) => o.id),
			["accept", "refuse"],
			"accept and refuse are the only options",
		);

		const content = await t.harness.artifacts.read<{ requirements: SurveyedRequirement[] }>(survey);
		assert.equal(
			asked.facts.length,
			content.requirements.length,
			`one fact per requirement: ${asked.facts.join(" | ")}`,
		);
		for (const r of content.requirements) {
			const fact = asked.facts.find((f) => f.startsWith(r.requirement_id));
			assert.ok(fact, `a fact names ${r.requirement_id}: ${asked.facts.join(" | ")}`);
			for (const m of r.measures)
				assert.ok(fact.includes(`${m.control_id} ${m.verdict}`), `${fact} gives ${m.control_id}`);
			if (r.blind_spot) assert.ok(fact.includes(r.blind_spot), `${fact} gives the reason of the blind spot`);
		}
		const architecture = content.requirements.find((r) => r.requirement_id === "R-ARCH");
		assert.ok(architecture?.blind_spot, "the architecture requirement is a blind spot");

		assert.notEqual(state.phase, "closed", "the change is not closed before the owner answers");
		assert.equal(state.outcome, "pending", "no outcome is set before the owner answers");
		assert.equal(state.status, "decision_required");
	});

	it("accepter clôt l'état des lieux accepted avec la décision du propriétaire", async () => {
		const { t, changeId } = await surveyed();
		const { decision, state } = await answer(t, changeId, "accept", null);

		assert.equal(state.outcome, "accepted");
		assert.equal(state.phase, "closed");
		assert.equal(state.acceptance_decision_id, decision.human_decision_id, "the acceptance is the owner's decision");
		assert.ok(state.adopted.survey, "the survey is adopted");
	});

	it("refuser avec un motif clôt l'état des lieux rejected, inscrit le motif et n'ouvre aucune tentative", async () => {
		const { t, changeId } = await surveyed();
		const { decision, state } = await answer(t, changeId, "refuse", "la couverture manque");

		assert.equal(state.outcome, "rejected");
		assert.equal(state.phase, "closed");
		const recorded = state.human_decisions.find((d) => d.human_decision_id === decision.human_decision_id);
		assert.equal(recorded?.option_id, "refuse");
		assert.equal(recorded?.free_text, "la couverture manque", "the reason is recorded with the decision");
		assert.equal(
			t.ledger.listHumanDecisions(changeId).find((d) => d.human_decision_id === decision.human_decision_id)?.response
				.free_text,
			"la couverture manque",
		);
		assert.equal(state.attempts.length, 0, "no attempt is opened");
		assert.deepEqual(
			state.interventions.map((i) => i.role),
			["specify"],
			"no intervention is opened after the refusal",
		);
		assert.equal(state.acceptance_decision_id, null);
		assert.equal(state.adopted.survey, undefined, "the refused survey is not adopted");
	});
});
