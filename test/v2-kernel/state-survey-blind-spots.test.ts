import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HUMAN } from "../helpers/change-fixture.ts";
import { acceptSurvey, makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

/** What a survey says of one requirement, as this test reads it from the dossier. */
interface SurveyedRequirement {
	requirement_id: string;
	measures: { control_id: string; verdict: string; evidence_id: string }[];
	blind_spot?: string | null;
}

const QUESTION = "le domaine dépend-il de l'infrastructure ?";

describe("a requirement no control of its nature measures", () => {
	it("une exigence d'architecture d'un projet Node est un angle mort du survey avec la raison qu'aucun contrôle ne mesure sa nature, ne porte le verdict d'aucun contrôle, et l'état des lieux est clos accepted sans préparation ni décision IH-04", async () => {
		const p = trackedProject();
		const t = makeHarness({
			defaultScript: {
				steps: [
					{
						kind: "complete",
						output: specReport({
							objective: QUESTION,
							requirements: [
								{
									requirement_id: "R-ARCH",
									statement: "the domain modules import nothing from the infrastructure modules",
									mandatory: true,
									criterion: "no import from src/infra under src/domain",
									category: "architecture",
									// Not met by the reference, so a candidate change would have opened a preparation for it.
									satisfied_by_reference: false,
								},
							],
						}),
					},
				],
			},
		});
		const { change } = await t.harness.start({
			project_path: p,
			request_text: QUESTION,
			actor: HUMAN,
			deliverable: "state",
		});
		const conducted = await t.harness.advance(change.change_id, { max_steps: 40 });
		const result = await acceptSurvey(t, change.change_id);
		result.steps.unshift(...conducted.steps);
		const state = t.ledger.loadChange(change.change_id)!.state;

		assert.ok(state.adopted.survey, `a survey is adopted: ${result.steps.join(" | ")} ${state.stop_detail ?? ""}`);
		const surveyed = await t.harness.artifacts.read<{ requirements: SurveyedRequirement[] }>(state.adopted.survey.ref);
		const architecture = surveyed.requirements.find((r) => r.requirement_id === "R-ARCH");
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			/no control of the target measures its nature/,
			"the survey names the requirement as a blind spot, with its reason",
		);
		assert.deepEqual(architecture.measures, [], "no control's verdict is attributed to the requirement");

		assert.equal(state.proposals.preparation, undefined, "no preparation is opened");
		assert.equal(
			result.steps.some((s) => s.includes("preparing")),
			false,
			result.steps.join(" | "),
		);
		assert.equal(
			t.requested.some((r) => r.interaction === "IH-04"),
			false,
			"no IH-04 decision is asked for",
		);
		assert.equal(state.outcome, "accepted");
		assert.equal(state.phase, "closed");
	});
});
