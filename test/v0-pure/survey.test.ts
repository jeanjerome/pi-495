import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { EvidenceEntry } from "../../src/domain/change/state.ts";
import { controlsOfNature, evaluateSurvey, surveyOf } from "../../src/domain/survey.ts";

const NODE_CONTROLS = [
	{ control_id: "unit", parser: "node-test" as const },
	{ control_id: "coverage", parser: "lcov" as const },
	{ control_id: "lint", parser: "exit-code" as const },
];

describe("the controls of a requirement's nature", () => {
	it("measures behaviour by the tests, style by the declared lint, coverage by its sensor", () => {
		assert.deepEqual(controlsOfNature("functional", NODE_CONTROLS, ["lint"]), { control_ids: ["unit"] });
		assert.deepEqual(controlsOfNature("quality", NODE_CONTROLS, ["lint"]), { control_ids: ["lint"] });
		assert.deepEqual(controlsOfNature("coverage", NODE_CONTROLS, ["lint"]), { control_ids: ["coverage"] });
	});

	it("names a blind spot for a nature no control measures, and for a category it does not recognise", () => {
		assert.deepEqual(controlsOfNature("architecture", NODE_CONTROLS, ["lint"]), {
			blind_spot: "blind spot: no control of the target measures its nature (structure)",
		});
		assert.deepEqual(controlsOfNature("quality", NODE_CONTROLS, []), {
			blind_spot: "blind spot: no control of the target measures its nature (style)",
		});
		assert.deepEqual(controlsOfNature("performance", NODE_CONTROLS, ["lint"]), {
			blind_spot: 'blind spot: category "performance" names no nature a control measures',
		});
	});
});

describe("the survey of the reference", () => {
	const diagnosis = {
		stack: "node",
		level: "executed" as const,
		test_files: 1,
		discovered: 1,
		executed: 1,
		undiscriminated_requirements: [],
		unobserved_requirements: [],
		notes: [],
	};
	const obligation = (requirementId: string, controlIds: string[]) => ({
		requirement: { requirement_id: requirementId, revision: 1 },
		mandatory: true,
		control_ids: controlIds,
		combination: "all_pass" as const,
		human_interaction: null,
		not_applicable_reason: null,
	});
	const surveyed = (executed: number) =>
		surveyOf({
			change_id: "chg_1",
			reference_digest: "sha256:ref",
			protocol_revision: 1,
			protocol: {
				controls: NODE_CONTROLS,
				obligations: [obligation("R1", ["unit"]), obligation("R2", ["coverage"])],
				capability_diagnosis: { ...diagnosis, executed },
				qualifications: {},
			},
			passes: [
				{ control_id: "unit", verdict: "PASS", evidence_id: "evr_1", findings: [] },
				{ control_id: "coverage", verdict: "PASS", evidence_id: "evr_2", findings: [] },
			],
		});

	it("presents a differential control without a verdict, and a test control too once the reference executes no case of its own", () => {
		const measured = surveyed(1);
		assert.deepEqual(
			measured.controls.map((c) => [c.control_id, c.verdict]),
			[
				["unit", "PASS"],
				["coverage", null],
			],
		);
		assert.match(measured.requirements[1]!.blind_spot ?? "", /coverage: blind spot: it measures only the lines/);
		const unexecuted = surveyed(0);
		assert.equal(unexecuted.controls[0]!.verdict, null);
		assert.match(unexecuted.controls[0]!.blind_spot ?? "", /the reference executes no test of its own/);
		assert.deepEqual(unexecuted.requirements[0]!.measures, []);
	});
});

describe("the gate of a survey", () => {
	const protocol = {
		control_ids: ["unit", "lint"],
		ref: { protocol_id: "prt_1", revision: 2, content_digest: "sha256:prt" },
		environment_digest: "sha256:env",
	};
	const evidence = (over: Partial<EvidenceEntry>): EvidenceEntry => ({
		evidence_id: "evr_unit",
		control_id: "unit",
		control_version: "1",
		requirement_ids: ["R1"],
		subject_digest: "sha256:ref",
		protocol_revision: 2,
		environment_digest: "sha256:env",
		verdict: "FAIL",
		valid: true,
		invalid_reason: null,
		recorded_at: "2026-10-02T00:00:00.000Z",
		findings_blocking: 1,
		...over,
	});
	const state = (entries: EvidenceEntry[]) => ({
		evidence: entries,
		reference: { reference_id: "ref_1", kind: "git", digest: "sha256:ref" },
		environment_digest: "sha256:env",
	});
	const control = (
		controlId: string,
		verdict: "PASS" | "FAIL" | "INDETERMINATE" | null,
		blindSpot: string | null = null,
	) => ({
		control_id: controlId,
		evidence_id: `evr_${controlId}`,
		verdict,
		findings: [],
		blind_spot: blindSpot,
	});
	const lint = evidence({ evidence_id: "evr_lint", control_id: "lint", verdict: "PASS", findings_blocking: 0 });

	it("passes with what the controls found, a FAIL included, once every control has its evidence on the reference", () => {
		const result = evaluateSurvey(state([evidence({}), lint]), protocol, {
			controls: [control("unit", "FAIL"), control("lint", "PASS")],
		});
		assert.deepEqual(
			[result.verdict, result.retained, result.next_action],
			["PASS", ["evr_unit", "evr_lint"], "close_accepted"],
		);
	});

	it("does not conclude on a control the survey leaves without evidence, or on an evidence taken elsewhere", () => {
		const missing = evaluateSurvey(state([lint]), protocol, { controls: [control("lint", "PASS")] });
		assert.deepEqual([missing.verdict, missing.missing], ["FAIL", ["unit"]]);
		const cases: [Partial<EvidenceEntry>, RegExp][] = [
			[{ valid: false, invalid_reason: "superseded" }, /superseded/],
			[{ control_id: "lint" }, /evidence of another control \(lint\)/],
			[{ subject_digest: "sha256:cand" }, /taken on another tree than the reference/],
			[{ protocol_revision: 1 }, /taken under another protocol revision/],
			[{ environment_digest: "sha256:other" }, /taken in another environment/],
			[{ verdict: "PASS" }, /the survey carries FAIL where the evidence says PASS/],
		];
		for (const [over, reason] of cases) {
			const result = evaluateSurvey(state([evidence(over), lint]), protocol, {
				controls: [control("unit", "FAIL"), control("lint", "PASS")],
			});
			assert.equal(result.verdict, "FAIL", JSON.stringify(over));
			assert.match(result.reasons.join("; "), reason);
			assert.equal(result.retained.includes("evr_unit"), false);
		}
	});

	it("stops INDETERMINATE on a measured control that concluded nothing, but not on a blind spot", () => {
		const stopped = evaluateSurvey(state([evidence({ verdict: "INDETERMINATE" }), lint]), protocol, {
			controls: [control("unit", "INDETERMINATE"), control("lint", "PASS")],
		});
		assert.deepEqual([stopped.verdict, stopped.indeterminate_controls], ["INDETERMINATE", ["unit"]]);
		const blind = evaluateSurvey(state([evidence({ verdict: "INDETERMINATE" }), lint]), protocol, {
			controls: [control("unit", null, "blind spot: nothing measured"), control("lint", "PASS")],
		});
		assert.equal(blind.verdict, "PASS");
	});
});
