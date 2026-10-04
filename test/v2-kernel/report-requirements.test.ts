import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
	makeHarness,
	specificationRounds,
	specReport,
	trackedProject,
	type TestHarness,
} from "../helpers/harness-fixture.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { HumanOrigin } from "../../src/contracts/v1/decision.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";

const origin = (): HumanOrigin => ({
	actor: HUMAN,
	host: "tui",
	session_id: "s1",
	asserted_at: "2026-09-28T12:00:00.000Z",
});

type Requirement = ReturnType<typeof specReport>["requirements"][number];
const REQ_400: Requirement = {
	requirement_id: "REQ-400",
	statement: "REQ-400 tient",
	mandatory: true,
	criterion: "le scénario d'acceptation le vérifie",
	category: "interface",
	satisfied_by_reference: true,
};

const Q1 = { id: "q1", question: "Quel statut pour une saisie invalide ?", material: true };
const POSES_Q1 = specReport({ questions: [Q1], answers: [], requirements: [REQ_400] });
const bindsQ1To400 = (requirements: Requirement[]) =>
	specReport({
		questions: [],
		answers: [{ question_id: Q1.id, observable: true, requirement_ids: [REQ_400.requirement_id] }],
		requirements,
	});

/** Starts a change under a human acceptance, answers Q1 "400" through IH-01, and conducts it until it stops. */
async function answeredAndConducted(t: TestHarness, second: ReturnType<typeof specReport>) {
	specificationRounds(t, [POSES_Q1, second]);
	const { change } = await t.harness.start({ project_path: trackedProject(), request_text: "x", actor: HUMAN });
	assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
	const asked = t.harness.pendingDecisions(change.change_id)[0]!;
	assert.equal(asked.interaction, "IH-01");
	const resolved = t.harness.answerDecision(
		change.change_id,
		{
			decision_id: asked.decision_id,
			option_id: "answer",
			free_text: "400",
			reason: null,
			subject_revision: asked.subject.revision,
			scope: null,
			expires_at: null,
		},
		origin(),
	);
	assert.equal(resolved.error, null);
	const conducted = await t.harness.advance(change.change_id, { max_steps: 30 });
	return { changeId: change.change_id, conducted };
}

describe("the engineering report lists only the requirements G1 adopted", () => {
	it("lists REQ-400, adopted at G1, for a change awaiting IH-10", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId, conducted } = await answeredAndConducted(t, bindsQ1To400([REQ_400]));
		assert.equal(conducted.stopped_because, "decision_required", conducted.steps.join(" | "));
		assert.deepEqual(
			t.harness.pendingDecisions(changeId).map((d) => d.interaction),
			["IH-10"],
		);
		assert.ok(t.ledger.loadChange(changeId)!.state.adopted.requirements, "G1 adopted the requirements");

		const report = await t.harness.report(changeId);

		assert.deepEqual(
			report.requirements.map((r) => r.requirement_id),
			["REQ-400"],
		);
	});

	it("lists no requirement, and shows none under Requirements, for a change whose specification repeating REQ-400 G1 refused", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId, conducted } = await answeredAndConducted(t, bindsQ1To400([REQ_400, REQ_400]));
		assert.equal(conducted.stopped_because, "blocked", conducted.steps.join(" | "));
		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(state.gates.G1?.verdict, "FAIL");
		assert.ok(
			state.gates.G1!.reasons.some((r) => r.includes("duplicate requirement id REQ-400")),
			state.gates.G1!.reasons.join(" | "),
		);
		assert.equal(state.adopted.requirements, undefined, "G1 adopted nothing");

		const report = await t.harness.report(changeId);

		assert.deepEqual(
			report.requirements.map((r) => r.requirement_id),
			[],
			"the report lists no requirement G1 refused",
		);
		assert.ok(formatReport(report, "en").includes("## Requirements\n  none"), formatReport(report, "en"));
	});
});
