import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Runner, candidate, evidence, protocol, ref, tick, AGENT, KERNEL } from "../helpers/change-fixture.ts";
import { unknownCost } from "../../src/domain/change/state.ts";
import { evaluateG5 } from "../../src/domain/gates/g5.ts";

describe("verifiability G2 (SA-008, SA-009, REQ-03, RM-014)", () => {
	it("refuses an obligation without control and reports the gap", () => {
		const r = new Runner().create().g0().g1();
		const p = protocol({
			obligations: [
				{
					requirement: { requirement_id: "R1", revision: 1 },
					mandatory: true,
					control_ids: [],
					combination: "all_pass",
					human_interaction: null,
					not_applicable_reason: null,
				},
			],
		});
		r.run({ type: "gate.evaluate", gate: "G2", at: tick(), actor: KERNEL, protocol_ref: ref("p", p), protocol: p });
		assert.equal(r.s.gates.G2?.verdict, "FAIL");
		assert.ok(r.s.gates.G2?.fail_requirements.includes("R1"));
		assert.ok(r.s.gates.G2?.fail_requirements.includes("R2"));
		assert.equal(r.s.gates.G2?.next_action, "prepare_capabilities_or_assign_human_decision");
		assert.equal(r.s.phase, "qualification");
	});
	it("refuses a control whose negative witness does not detect the defect (blind sensor)", () => {
		const r = new Runner().create().g0().g1();
		const p = protocol();
		p.qualifications.unit = { ...p.qualifications.unit!, negative: "PASS" };
		r.run({ type: "gate.evaluate", gate: "G2", at: tick(), actor: KERNEL, protocol_ref: ref("p", p), protocol: p });
		assert.equal(r.s.gates.G2?.verdict, "FAIL");
		assert.ok(r.s.gates.G2?.reasons.some((x) => x.includes("negative witness")));
	});
	it("refuses a control whose runner incident does not yield INDETERMINATE", () => {
		const r = new Runner().create().g0().g1();
		const p = protocol();
		p.qualifications.lint = { ...p.qualifications.lint!, incident: "PASS" };
		r.run({ type: "gate.evaluate", gate: "G2", at: tick(), actor: KERNEL, protocol_ref: ref("p", p), protocol: p });
		assert.equal(r.s.gates.G2?.verdict, "FAIL");
	});
	it("accepts an obligation assigned to a human decision", () => {
		const r = new Runner().create().g0().g1();
		const p = protocol();
		p.obligations[1] = {
			requirement: { requirement_id: "R2", revision: 1 },
			mandatory: true,
			control_ids: [],
			combination: "human_decision",
			human_interaction: "IH-10",
			not_applicable_reason: null,
		};
		r.run({ type: "gate.evaluate", gate: "G2", at: tick(), actor: KERNEL, protocol_ref: ref("p", p), protocol: p });
		assert.equal(r.s.gates.G2?.verdict, "PASS");
	});
	it("opens a bounded preparation and returns to qualification once qualified", () => {
		const r = new Runner().create().g0().g1();
		r.run({ type: "preparation.open", at: tick(), actor: KERNEL, mandate_ref: ref("prep", { files: ["test/"] }) });
		assert.equal(r.s.phase, "preparing");
		r.run({
			type: "intervention.start",
			at: tick(),
			actor: KERNEL,
			intervention_id: "int_p",
			role: "prepare",
			attempt_id: "att_p",
			model: { provider_id: "omlx", model_id: "m", thinking_level: "off", location: "on_machine" },
			profile_id: "prepare",
			profile_qualified: true,
		});
		r.expectError(
			{
				type: "preparation.close",
				at: tick(),
				actor: KERNEL,
				qualified: true,
				capability_ids: ["unit"],
				adopted_ref: null,
			},
			"PRECONDITION_FAILED",
		);
		r.run({
			type: "intervention.finish",
			at: tick(),
			actor: KERNEL,
			intervention_id: "int_p",
			result: "completed",
			counters: { tool_calls: 1, duration_ms: 10, tokens_known: 0, delegations: 0 },
			detail: null,
			cost: unknownCost("a fixture reports no host session"),
			imposed_layers: [],
		});
		r.run({
			type: "preparation.close",
			at: tick(),
			actor: KERNEL,
			qualified: true,
			capability_ids: ["unit"],
			adopted_ref: null,
		});
		assert.equal(r.s.phase, "qualification");
		// preparation attempts are counted separately from implementation attempts? They share the increment budget of attempts_used
		r.g2();
		assert.equal(r.s.phase, "design");
	});
});

describe("candidate G4 (SA-011, BES-03, SEC-03)", () => {
	it("a candidate altering a protected control fails G4 and the protocol revision is unchanged", () => {
		const r = new Runner().toImplementing().implement();
		const before = r.s.protocol?.ref;
		r.freeze(candidate("c1"), {
			changed_paths: ["src/greet.ts", "test/greet.test.ts"],
			altered_protected_paths: ["test/greet.test.ts"],
		});
		assert.equal(r.s.gates.G4?.verdict, "FAIL");
		assert.equal(r.s.phase, "deciding");
		assert.deepEqual(r.s.protocol?.ref, before);
		assert.ok(
			r.events.some(
				(e) => e.type === "gate.decided" && e.decision.gate === "G4" && e.decision.reasons[0]?.includes("protected"),
			),
		);
	});
	it("a change outside the mandate scope fails G4 (path derived from the mandate)", () => {
		const r = new Runner().toImplementing().implement();
		r.freeze(candidate("c1"), { changed_paths: ["src/greet.ts", "docs/README.md"] });
		assert.equal(r.s.gates.G4?.verdict, "FAIL");
		assert.ok(r.s.gates.G4?.reasons.some((x) => x.includes("docs/README.md")));
	});
	it("an incomplete observation cannot pass G4 (RM-064, AT-12)", () => {
		const r = new Runner().toImplementing().implement();
		r.freeze(candidate("c1"), { complete: false, limits_notes: ["file too large"] });
		assert.equal(r.s.gates.G4?.verdict, "FAIL");
	});
	it("cannot freeze while a producer is running (VER-03)", () => {
		const r = new Runner().toImplementing();
		r.run({
			type: "intervention.start",
			at: tick(),
			actor: KERNEL,
			intervention_id: "i",
			role: "implement",
			attempt_id: "a",
			model: { provider_id: "p", model_id: "m", thinking_level: "off", location: "on_machine" },
			profile_id: "implement",
			profile_qualified: true,
		});
		r.expectError(
			{
				type: "candidate.freeze",
				at: tick(),
				actor: KERNEL,
				attempt_id: "a",
				facts: {
					candidate: candidate("c"),
					entry_count: 1,
					changed_paths: [],
					out_of_scope_paths: [],
					altered_protected_paths: [],
					complete: true,
					limits_notes: [],
					allowed_protected_paths: [],
					submodule_paths: [],
				},
			},
			"PRECONDITION_FAILED",
		);
	});
});

describe("verification and G5 (SA-012, SA-013, SA-014, SA-032, RM-036, VER-03)", () => {
	it("a candidate with no executed control is NOT_RUN and not accepted (SA-012)", () => {
		const r = new Runner().toImplementing().implement();
		const c = candidate("c1");
		r.freeze(c).verify([]).g5();
		assert.equal(r.s.gates.G5?.verdict, "INDETERMINATE");
		assert.ok(r.s.gates.G5?.evidence_missing.includes("unit:R1"));
		assert.equal(r.s.outcome, "pending");
		assert.equal(r.s.phase, "deciding");
	});
	it("timeout gives INDETERMINATE, not FAIL nor PASS, with next action resolve_incident (SA-014)", () => {
		const r = new Runner().toDeciding(candidate("c1"), { unit: "INDETERMINATE", lint: "PASS" }).g5();
		assert.equal(r.s.gates.G5?.verdict, "INDETERMINATE");
		assert.deepEqual(r.s.gates.G5?.indeterminate_requirements, ["R1"]);
		assert.equal(r.s.gates.G5?.next_action, "resolve_incident");
	});
	it("FAIL and INDETERMINATE are both kept (SA-032)", () => {
		const r = new Runner().toDeciding(candidate("c1"), { unit: "FAIL", lint: "INDETERMINATE" }).g5();
		assert.equal(r.s.gates.G5?.verdict, "FAIL");
		assert.deepEqual(r.s.gates.G5?.fail_requirements, ["R1"]);
		assert.deepEqual(r.s.gates.G5?.indeterminate_requirements, ["R2"]);
		assert.equal(r.s.gates.G5?.next_action, "correct");
	});
	it("evidence about another candidate is rejected at recording (VER-03, AT-05)", () => {
		const r = new Runner().toImplementing().implement();
		const c = candidate("c1");
		r.freeze(c);
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op", idempotency_key: "k" });
		r.run({
			type: "verification.record",
			at: tick(),
			actor: KERNEL,
			evidence: [
				evidence({ control_id: "unit", subject_digest: candidate("other").manifest_digest }),
				evidence({ control_id: "unit", subject_digest: c.manifest_digest, protocol_revision: 2 }),
				evidence({ control_id: "unknown", subject_digest: c.manifest_digest }),
			],
		});
		assert.equal(r.s.evidence.length, 0);
		assert.equal(r.events.filter((e) => e.type === "evidence.rejected").length, 3);
	});
	it("G5 ignores evidence that ran under an earlier revision of the frozen protocol", () => {
		const c = candidate("c1");
		const r = new Runner().toDeciding(c);
		const frozen = r.s.protocol!;
		const revised = { ...frozen, ref: { ...frozen.ref, revision: frozen.ref.revision + 1 } };
		const g5 = evaluateG5(r.s, revised, c, r.policy);
		assert.notEqual(g5.verdict, "PASS");
		assert.deepEqual(g5.retained, []);
		assert.deepEqual(
			g5.ignored,
			r.s.evidence.map((e) => `${e.evidence_id}:other protocol revision`),
		);
	});
	it("G5 ignores evidence that ran under a protocol the revised preparation replaced, at the same revision", () => {
		const c = candidate("c1");
		const r = new Runner().toDeciding(c);
		const frozen = r.s.protocol!;
		const p2 = { ...frozen, ref: { ...frozen.ref, protocol_id: "prt_2" } };
		const g5 = evaluateG5(r.s, p2, c, r.policy);
		assert.notEqual(g5.verdict, "PASS", "a P1 result does not contribute to the acceptance under P2");
		assert.deepEqual(g5.retained, []);
		assert.deepEqual(
			g5.ignored,
			r.s.evidence.map((e) => `${e.evidence_id}:other protocol revision`),
		);
	});
	it("a PASS with blocking findings counts as FAIL", () => {
		const r = new Runner().toImplementing().implement();
		const c = candidate("c1");
		r.freeze(c)
			.verify([
				evidence({ control_id: "unit", subject_digest: c.manifest_digest, findings_blocking: 2 }),
				evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
			])
			.g5();
		assert.equal(r.s.gates.G5?.verdict, "FAIL");
	});
	it("required review missing blocks G5; a rejecting review fails it (PF-11)", () => {
		const r = new Runner({ required_reviews: ["security"] });
		r.create()
			.g0()
			.g1()
			.g2(protocol({ required_reviews: ["security"] }))
			.g3()
			.implement();
		const c = candidate("c1");
		r.freeze(c).verify([
			evidence({ control_id: "unit", subject_digest: c.manifest_digest }),
			evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
		]);
		assert.equal(r.s.phase, "reviewing");
		r.run({ type: "review.complete", at: tick(), actor: KERNEL });
		r.g5();
		assert.equal(r.s.gates.G5?.verdict, "INDETERMINATE");
		assert.ok(r.s.gates.G5?.evidence_missing.includes("review:security"));
		r.run({
			type: "review.record",
			at: tick(),
			actor: { ...AGENT, role: "reviewer_agent" },
			review_id: "rv1",
			reviewer_role: "security",
			subject_digest: c.manifest_digest,
			conclusion: "reject",
			blocking_findings: 1,
		});
		r.g5();
		assert.equal(r.s.gates.G5?.verdict, "FAIL");
	});
	it("contradictory required reviews trigger arbitration, never a majority (SA-035, RM-038)", () => {
		const r = new Runner();
		r.create()
			.g0()
			.g1()
			.g2(protocol({ required_reviews: ["security", "architecture"] }))
			.g3()
			.implement();
		const c = candidate("c1");
		r.freeze(c).verify([
			evidence({ control_id: "unit", subject_digest: c.manifest_digest }),
			evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
		]);
		r.run({
			type: "review.record",
			at: tick(),
			actor: KERNEL,
			review_id: "rv1",
			reviewer_role: "security",
			subject_digest: c.manifest_digest,
			conclusion: "approve",
			blocking_findings: 0,
		});
		r.run({
			type: "review.record",
			at: tick(),
			actor: KERNEL,
			review_id: "rv2",
			reviewer_role: "architecture",
			subject_digest: c.manifest_digest,
			conclusion: "reject",
			blocking_findings: 1,
		});
		r.run({ type: "review.complete", at: tick(), actor: KERNEL });
		r.g5();
		assert.equal(r.s.gates.G5?.verdict, "FAIL");
		assert.ok(r.s.gates.G5?.reasons.some((x) => x.includes("arbitration")));
		assert.ok(r.s.gates.G5?.evidence_missing.includes("human:IH-08"));
	});
});
