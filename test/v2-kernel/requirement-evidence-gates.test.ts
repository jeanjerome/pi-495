import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";
import { fixtureTsWithoutTests, removedAfterEach, SHOUT_IMPL, SHOUT_TEST } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { ChangeState } from "../../src/domain/change/state.ts";
import { evaluateG2 } from "../../src/domain/gates/g2.ts";
import { evaluateG5 } from "../../src/domain/gates/g5.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";

removedAfterEach();

const spec = specReport({
	objective: "add shout(name) returning the greeting in upper case",
	requirements: [
		{
			requirement_id: "R1",
			statement: "shout(name) returns greet(name) upper-cased",
			mandatory: true,
			criterion: "unit test on shout passes",
			category: "functional",
			satisfied_by_reference: false,
		},
		{
			requirement_id: "R2",
			statement: "greet unchanged",
			mandatory: true,
			criterion: "unit test on greet passes",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
	design: { summary: "add shout next to greet", components: ["greet"], interfaces: ["shout(name)"], risks: [] },
});
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: false, notes: [] });
const R1_CASE = "R1 shout upper-cases the greeting";

describe("G2 and G5 consume the binding of each requirement to its observations", () => {
	it("seules les observations des liaisons adoptées satisfont les obligations correspondantes", async () => {
		const p = trackedProject(fixtureTsWithoutTests);
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: {
				prepare: {
					steps: [
						{ kind: "write", path: "test/shout.test.js", content: SHOUT_TEST },
						{ kind: "complete", output: report(["test/shout.test.js"]) },
					],
				},
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				},
			},
		});
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.outcome, "accepted");
		const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
		assert.deepEqual(
			protocol.obligations.map((o) => [o.requirement.requirement_id, o.oracle]),
			[
				["R1", { control_id: "unit", cases: [R1_CASE] }],
				["R2", { control_id: "unit", cases: ["R2 greet unchanged"] }],
			],
			"each obligation names the cases of its own adopted binding",
		);
		const unitEvidence = state.evidence.filter((e) => e.control_id === "unit" && e.valid).at(-1)!;
		assert.ok(unitEvidence.passed_cases?.includes(R1_CASE), "the candidate's run observed the case of R1 passing");

		// The same PASS of the unit control, without the case of R1 among what it observed, satisfies no obligation of R1.
		const foreign: ChangeState = {
			...state,
			evidence: state.evidence.map((e) =>
				e.evidence_id === unitEvidence.evidence_id
					? { ...e, passed_cases: (e.passed_cases ?? []).filter((c) => c !== R1_CASE) }
					: e,
			),
		};
		const g5 = evaluateG5(foreign, state.protocol!, state.candidate!, DEFAULT_POLICY);
		assert.notEqual(g5.verdict, "PASS", "a PASS foreign to the binding of R1 does not satisfy its obligation");
		assert.deepEqual(g5.indeterminate_requirements, ["R1"]);
		assert.match(g5.reasons.join(" | "), /R1.*R1 shout upper-cases the greeting/);
		// any_pass is kept, and another control's PASS still does not stand in for the binding.
		const anyPass = {
			...state.protocol!,
			obligations: state.protocol!.obligations.map((o) => ({ ...o, combination: "any_pass" as const })),
		};
		assert.deepEqual(evaluateG5(foreign, anyPass, state.candidate!, DEFAULT_POLICY).indeterminate_requirements, ["R1"]);
		assert.equal(evaluateG5(state, anyPass, state.candidate!, DEFAULT_POLICY).verdict, "PASS");

		// G2 shows a requirement still without an oracle of its own, unless the owner was assigned its decision.
		const withoutOracle: Protocol = {
			...protocol,
			capability_diagnosis: { ...protocol.capability_diagnosis, undiscriminated_requirements: ["R2"] },
		};
		const g2 = evaluateG2(state, withoutOracle, DEFAULT_POLICY);
		assert.equal(g2.verdict, "FAIL");
		assert.deepEqual(g2.uncovered_requirements, ["R2"]);
		assert.match(g2.reasons.join(" | "), /R2 has no oracle of its own/);
		const assigned: Protocol = {
			...withoutOracle,
			obligations: withoutOracle.obligations.map((o) =>
				o.requirement.requirement_id === "R2"
					? { ...o, control_ids: [], combination: "human_decision" as const, human_interaction: "IH-10" as const }
					: o,
			),
		};
		assert.equal(
			evaluateG2(state, assigned, DEFAULT_POLICY).verdict,
			"PASS",
			"a decision assigned to the owner is kept",
		);
	});
});
