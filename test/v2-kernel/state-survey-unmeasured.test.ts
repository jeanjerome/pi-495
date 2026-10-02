import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HUMAN } from "../helpers/change-fixture.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { acceptSurvey, makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

/** What a survey says of one control and of one requirement, as this test reads it from the dossier. */
interface SurveyedControl {
	control_id: string;
	verdict: string | null;
	blind_spot?: string | null;
}
interface SurveyedRequirement {
	requirement_id: string;
	measures: { control_id: string; verdict: string }[];
}

const QUESTION = "que mesure la couverture de mes tests ?";

/** A Node project that asks node:test for coverage, and whose test file runs code without declaring a case. */
function projectWithoutOwnCases(root: string): void {
	writeFiles(root, {
		"package.json": JSON.stringify({
			name: "f-no-cases",
			version: "1.0.0",
			type: "module",
			scripts: { test: "node --test --experimental-test-coverage" },
		}),
		"src/greet.js": "export function greet(name) {\n  return `Hello, ${name}`;\n}\n",
		"test/greet.test.js": 'import { greet } from "../src/greet.js";\n\ngreet("x");\n',
	});
}

describe("a control that measures nothing of the reference", () => {
	it("l'état des lieux d'un projet Node qui demande sa couverture et dont les tests ne déclarent aucun cas propre nomme le contrôle de tests et le contrôle de couverture comme angles morts, chacun avec sa raison, et ne présente aucun des deux avec PASS", async () => {
		const p = trackedProject(projectWithoutOwnCases);
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
								{
									requirement_id: "R2",
									statement: "the code of the project is covered by its tests",
									mandatory: true,
									criterion: "the lines of src/ are executed by the suite",
									category: "coverage",
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

		assert.ok(state.adopted.survey, `a survey is adopted: ${result.steps.join(" | ")} ${state.stop_detail ?? ""}`);
		const surveyed = await t.harness.artifacts.read<{
			controls: SurveyedControl[];
			requirements: SurveyedRequirement[];
		}>(state.adopted.survey.ref);
		const control = (id: string): SurveyedControl => {
			const found = surveyed.controls.find((c) => c.control_id === id);
			assert.ok(found, `the survey carries the control ${id}`);
			return found;
		};
		assert.match(
			control("unit").blind_spot ?? "",
			/the reference executes no test of its own/,
			`the test control is a blind spot: ${JSON.stringify(control("unit"))}`,
		);
		assert.match(
			control("coverage").blind_spot ?? "",
			/it measures only the lines a change introduces/,
			`the coverage control is a blind spot: ${JSON.stringify(control("coverage"))}`,
		);
		for (const id of ["unit", "coverage"]) {
			assert.notEqual(control(id).verdict, "PASS", `${id} is not presented with PASS`);
			for (const r of surveyed.requirements)
				assert.equal(
					r.measures.some((m) => m.control_id === id && m.verdict === "PASS"),
					false,
					`${r.requirement_id} does not present ${id} with PASS`,
				);
		}
	});
});
