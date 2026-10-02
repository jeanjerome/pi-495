import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTs } from "../helpers/fixtures.ts";
import { makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

/** What a survey says of one control, as this test reads it from the dossier. */
interface SurveyedControl {
	control_id: string;
	verdict: string | null;
	blind_spot: string | null;
}

const QUESTION = "où en sont les tests ?";

describe("a control whose qualification failed", () => {
	it("dans l'état des lieux d'un projet dont le lint ne détecte pas son témoin négatif, le contrôle lint est un angle mort avec la note de sa qualification et ne porte aucun verdict", async () => {
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
			project_path: trackedProject(fixtureTs),
			request_text: QUESTION,
			actor: HUMAN,
			deliverable: "state",
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;

		const protocol = await t.harness.artifacts.latest<Protocol>(state, "protocol");
		const qualification = protocol?.content.qualifications.lint;
		assert.equal(qualification?.qualified, false, "the lint control does not detect its negative witness");
		const proposed = state.proposals.survey?.at(-1);
		assert.ok(proposed, `a survey is established: ${state.phase}/${state.status} ${state.stop_detail ?? ""}`);
		const surveyed = await t.harness.artifacts.read<{ controls: SurveyedControl[] }>(proposed);
		const lint = surveyed.controls.find((c) => c.control_id === "lint");
		assert.ok(lint, "the survey carries the lint control");
		assert.equal(lint.verdict, null, `no verdict is attributed to the lint control: ${JSON.stringify(lint)}`);
		assert.ok(lint.blind_spot, `the lint control is a blind spot: ${JSON.stringify(lint)}`);
		for (const note of qualification.notes)
			assert.ok(lint.blind_spot.includes(note), `the reason is the note of its qualification: ${lint.blind_spot}`);
	});
});
