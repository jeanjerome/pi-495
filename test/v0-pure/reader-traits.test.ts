import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { controlsOfNature, surveyOf } from "../../src/domain/survey.ts";

/** What a fictitious technology declares of its two report readers. */
const FICTITIOUS_READERS = [
	{ id: "fict-lines", version: "1.0.0", nature: "behaviour" as const, differential: false, located: false },
	{ id: "fict-cov", version: "1.0.0", nature: "coverage" as const, differential: true, located: false },
];

const FICTITIOUS_CONTROLS = [
	{ control_id: "fict-tests", parser: "fict-lines" },
	{ control_id: "fict-coverage", parser: "fict-cov" },
];

describe("the nature of a control is read in the reader its technology declares", () => {
	it("given a functional requirement, then it is measured by the control that reads fict-lines; given the survey of the reference, then the control that reads fict-cov is a blind spot because it measures only the introduced lines", () => {
		assert.deepEqual(controlsOfNature("functional", FICTITIOUS_CONTROLS, [], FICTITIOUS_READERS), {
			control_ids: ["fict-tests"],
		});
		const survey = surveyOf({
			change_id: "chg_1",
			reference_digest: "sha256:ref",
			protocol_revision: 1,
			protocol: {
				controls: FICTITIOUS_CONTROLS,
				obligations: [],
				capability_diagnosis: {
					stack: "fict",
					level: "executed",
					test_files: 1,
					discovered: 1,
					executed: 1,
					undiscriminated_requirements: [],
					unobserved_requirements: [],
					notes: [],
				},
				qualifications: {},
			},
			passes: [
				{ control_id: "fict-tests", verdict: "PASS", evidence_id: "evr_1", findings: [] },
				{ control_id: "fict-coverage", verdict: "PASS", evidence_id: "evr_2", findings: [] },
			],
			readers: FICTITIOUS_READERS,
		});
		assert.equal(
			survey.controls.find((c) => c.control_id === "fict-coverage")?.blind_spot,
			"blind spot: it measures only the lines a change introduces, and the reference introduces none",
		);
	});
});
