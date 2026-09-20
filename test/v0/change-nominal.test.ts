import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { replay } from "../../src/domain/change/apply.ts";
import { Runner, candidate, evidence, tick, KERNEL, HUMAN } from "../helpers/change-fixture.ts";

describe("change nominal cycle (SA-001, PF-13, DEC-01)", () => {
	it("goes from intake to closed/accepted through G0..G5 without integration", () => {
		const r = new Runner();
		r.create();
		assert.equal(r.s.phase, "clarifying");
		assert.equal(r.s.status, "ready");
		assert.equal(r.s.adopted.request?.ref.artifact_id, "req_1");
		r.g0();
		assert.equal(r.s.phase, "specifying");
		assert.equal(r.s.gates.G0?.verdict, "PASS");
		r.g1();
		assert.equal(r.s.phase, "verification_design");
		r.g2();
		assert.equal(r.s.phase, "designing");
		assert.ok(r.s.protocol);
		assert.deepEqual(r.s.protocol?.protected_paths, ["test/", "eslint.config.js"]);
		r.g3();
		assert.equal(r.s.phase, "implementing");
		r.implement();
		assert.equal(r.s.attempts.length, 1);
		assert.equal(r.s.budgets.attempts_used, 1);
		const c = candidate("c1");
		r.freeze(c);
		assert.equal(r.s.phase, "verifying");
		assert.equal(r.s.gates.G4?.verdict, "PASS");
		r.verify([evidence({ control_id: "unit", subject_digest: c.manifest_digest }), evidence({ control_id: "lint", subject_digest: c.manifest_digest })]);
		assert.equal(r.s.phase, "deciding");
		r.g5();
		assert.equal(r.s.gates.G5?.verdict, "PASS");
		assert.equal(r.s.outcome, "accepted");
		assert.equal(r.s.phase, "closed");
		assert.equal(r.s.status, "completed");
		assert.equal(r.s.gates.G5?.evidence_retained.length, 2);
	});

	it("replaying the event stream yields the same state (determinism, EVD-02)", () => {
		const r = new Runner();
		r.toDeciding(candidate("c1")).g5();
		assert.deepEqual(replay(r.events), r.s);
	});

	it("integrates with IH-11 authorization and confirms G6", () => {
		const r = new Runner({ integration_enabled: true });
		r.create().g0({ ...(await_mandate()), integration: "local_branch" }).g1().g2().g3().implement();
		const c = candidate("c1");
		r.freeze(c).verify([evidence({ control_id: "unit", subject_digest: c.manifest_digest }), evidence({ control_id: "lint", subject_digest: c.manifest_digest })]).g5();
		assert.equal(r.s.phase, "integrating");
		assert.equal(r.s.outcome, "accepted");
		r.expectError({ type: "integration.prepare", at: tick(), actor: KERNEL, operation_id: "op_i", idempotency_key: "k_i", destination: "main", destination_before: "a".repeat(40), plan_digest: `sha256:${"1".repeat(64)}` }, "DECISION_REQUIRED");
		r.run({ type: "decision.request", at: tick(), actor: KERNEL, request: { decision_id: "dec_1", change_id: "chg_1", interaction: "IH-11", subject: { kind: "candidate", id: c.candidate_id, revision: 1, digest: c.manifest_digest }, question: "Intégrer ?", facts: [], recommendation: null, options: [{ id: "integrate", label: "Intégrer", effect: "applique", risky: true }, { id: "export_only", label: "Exporter", effect: "rien", risky: false }], required_authority: "change_owner", allow_free_text: false, requested_at: tick(), expires_at: null, language: "fr" } });
		assert.equal(r.s.status, "decision_required");
		r.run({ type: "decision.answer", at: tick(), actor: HUMAN, human_decision_id: "hd_1", response: { decision_id: "dec_1", option_id: "integrate", free_text: null, reason: null, subject_revision: 1, scope: null, expires_at: null }, origin: { actor: HUMAN, host: "tui", session_id: "s1", asserted_at: tick() } });
		assert.equal(r.s.status, "ready");
		assert.equal(r.s.integration_authorization_id, "hd_1");
		r.run({ type: "integration.prepare", at: tick(), actor: KERNEL, operation_id: "op_i", idempotency_key: "k_i", destination: "main", destination_before: "a".repeat(40), plan_digest: `sha256:${"1".repeat(64)}` });
		assert.equal(r.s.operation?.effect_state, "prepared");
		r.run({ type: "integration.effect", at: tick(), actor: KERNEL, operation_id: "op_i", effect_state: "started", detail: null, decision_id: null });
		r.run({ type: "integration.effect", at: tick(), actor: KERNEL, operation_id: "op_i", effect_state: "confirmed", detail: null, decision_id: null });
		r.run({ type: "gate.evaluate", gate: "G6", at: tick(), actor: KERNEL, destination_after: "b".repeat(40), applied_digest: c.manifest_digest, receipt_digest: `sha256:${"2".repeat(64)}` });
		assert.equal(r.s.outcome, "integrated");
		assert.equal(r.s.phase, "closed");
		assert.equal(r.s.integration?.receipt_digest, `sha256:${"2".repeat(64)}`);
	});
});

function await_mandate() {
	return { change_id: "chg_1", objective: "Add greet", scope: ["src/"], out_of_scope: [], assumptions: [], open_questions: [], allowed_paths: ["src/", "test/"], integration: "disabled" as const, language: "fr" as const };
}
