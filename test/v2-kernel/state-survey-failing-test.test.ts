import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTsWithFailingTest } from "../helpers/fixtures.ts";
import { acceptSurvey, makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

/** What a survey says of one control, as this test reads it from the dossier. */
interface SurveyedControl {
	control_id: string;
	verdict: string;
	findings: { message: string; path: string | null }[];
}

const QUESTION = "où en sont les tests ?";

describe("the survey of a project whose test fails", () => {
	it("l'état des lieux d'un projet dont un test échoue passe G2, porte FAIL pour le contrôle de tests avec un constat qui nomme le fichier du test en échec, et est clos accepted", async () => {
		const p = trackedProject(fixtureTsWithFailingTest);
		const t = makeHarness({
			defaultScript: {
				steps: [
					{
						kind: "complete",
						output: specReport({
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

		assert.equal(
			state.gates.G2?.verdict,
			"PASS",
			`G2 qualifies the test sensor by the cases of its witnesses: ${state.gates.G2?.reasons.join("; ")} ${state.stop_detail ?? ""}`,
		);
		assert.ok(state.adopted.survey, `a survey is adopted: ${result.steps.join(" | ")}`);
		const surveyed = await t.harness.artifacts.read<{ controls: SurveyedControl[] }>(state.adopted.survey.ref);
		const unit = surveyed.controls.find((c) => c.control_id === "unit");
		assert.ok(unit, "the survey carries the test control");
		assert.equal(unit.verdict, "FAIL", "the survey carries FAIL for the test control");
		assert.ok(
			unit.findings.some((f) => f.path === "test/farewell.test.js"),
			`a finding names the file of the failing test: ${JSON.stringify(unit.findings)}`,
		);
		assert.equal(state.outcome, "accepted");
		assert.equal(state.phase, "closed");
	});
});
