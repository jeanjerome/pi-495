import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
	Runner,
	candidate,
	decisionRequest,
	evidence,
	integrationPrepared,
	mandate,
	ownerDecides,
	ref,
	tick,
	tuiOrigin,
	AGENT,
	HUMAN,
	KERNEL,
	ENV,
} from "../helpers/change-fixture.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { apply } from "../../src/domain/change/apply.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";

describe("attempts, budgets and stagnation (SA-015, SA-016, RM-032, RM-034, RM-035, DEC-03)", () => {
	it("a correction creates a distinct attempt, keeps history and invalidates dependent evidence", () => {
		const r = new Runner().toDeciding(candidate("c1"), { unit: "FAIL", lint: "PASS" }).g5();
		r.run({
			type: "correction.authorize",
			at: tick(),
			actor: KERNEL,
			attempt_id: "att_2",
			feedback: { digest: digestValue("fb"), bytes: 120, truncated: false },
		});
		assert.equal(r.s.phase, "implementing");
		assert.equal(r.s.attempts.length, 2);
		assert.equal(r.s.attempts[0]?.result, "superseded");
		assert.equal(r.s.attempts[0]?.candidate?.candidate_id, "cand_c1");
		assert.equal(r.s.gates.G4, undefined);
		assert.equal(r.s.gates.G5, undefined);
		assert.equal(r.s.evidence.length, 2, "old evidence stays historised");
		assert.equal(r.s.feedback.length, 1);
		r.implement("int_2", "att_2");
		assert.equal(r.s.attempts.length, 2, "the open attempt is reused");
		const c2 = candidate("c2");
		r.freeze(c2)
			.verify([
				evidence({ control_id: "unit", subject_digest: c2.manifest_digest }),
				evidence({ control_id: "lint", subject_digest: c2.manifest_digest }),
			])
			.g5();
		const g5 = r.state!.gates.G5;
		assert.equal(g5?.verdict, "PASS");
		assert.ok(g5?.evidence_ignored.some((x) => x.endsWith("other candidate")));
	});
	it("a fourth attempt is refused with attempts_exhausted until a budget extension (IH-07)", () => {
		const r = new Runner();
		r.toDeciding(candidate("c1"), { unit: "FAIL", lint: "PASS" }).g5();
		for (const n of [2, 3]) {
			r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: `att_${n}`, feedback: null });
			r.implement(`int_${n}`, `att_${n}`);
			const c = candidate(`c${n}`);
			r.freeze(c)
				.verify([
					evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "FAIL" }),
					evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
				])
				.g5();
		}
		assert.equal(r.s.budgets.attempts_used, 3);
		assert.equal(r.s.gates.G5?.next_action, "stop:attempts_exhausted");
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_4", feedback: null });
		assert.equal(r.s.status, "blocked");
		assert.equal(r.s.stop_reason, "attempts_exhausted");
		assert.equal(r.s.attempts.length, 3);
		r.expectError({ type: "change.unblock", at: tick(), actor: KERNEL }, "ATTEMPTS_EXHAUSTED");
		r.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-07", {
				decision_id: "dec_b",
				subject: { kind: "change", id: "chg_1", revision: r.s.revision, digest: r.s.candidate!.manifest_digest },
				question: "Étendre ?",
				options: [
					{ id: "extend", label: "Étendre", effect: "+n", risky: false },
					{ id: "stop", label: "Arrêter", effect: "", risky: false },
				],
				allow_free_text: true,
			}),
		});
		const rev = r.s.pending_decisions[0]!.subject.revision;
		r.run({
			type: "decision.answer",
			at: tick(),
			actor: HUMAN,
			human_decision_id: "hd_b",
			response: {
				decision_id: "dec_b",
				option_id: "extend",
				free_text: "2",
				reason: "one more",
				subject_revision: rev,
				scope: null,
				expires_at: null,
			},
			origin: tuiOrigin(),
		});
		assert.equal(r.s.budgets.max_attempts, 5);
		assert.equal(r.s.budgets.attempts_used, 3, "consumption is not reset (RM-034)");
		assert.equal(r.s.status, "ready");
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_4", feedback: null });
		assert.equal(r.s.attempts.length, 4);
	});
	it("un changement s'ouvre avec le budget de tentatives de la politique : l'événement change.created et l'état portent 2, et une extension IH-07 d'une tentative écrit new_max_attempts à 3", () => {
		const r = new Runner({ budgets: { max_attempts: 2 } }).create();
		const created = r.events.find((e) => e.type === "change.created");
		assert.equal(created?.type === "change.created" ? created.max_attempts : undefined, 2);
		assert.equal(r.s.budgets.max_attempts, 2);
		assert.equal(r.s.budgets.attempts_used, 0);
		ownerDecides(
			r,
			decisionRequest("IH-07", {
				decision_id: "dec_b",
				subject: { kind: "change", id: "chg_1", revision: r.s.revision, digest: r.s.reference.digest },
				question: "Étendre ?",
				options: [
					{ id: "extend", label: "Étendre", effect: "+n", risky: false },
					{ id: "stop", label: "Arrêter", effect: "", risky: false },
				],
				allow_free_text: true,
			}),
			"extend",
			"1",
			"hd_b",
		);
		const extended = r.events.find((e) => e.type === "budget.extended");
		assert.equal(extended?.type === "budget.extended" ? extended.new_max_attempts : undefined, 3);
	});
	it("un change.created sans max_attempts se rejoue à 3", () => {
		const r = new Runner({ budgets: { max_attempts: 2 } }).create();
		const created = r.events.find((e) => e.type === "change.created")!;
		const { max_attempts: _written, ...legacy } = created as Extract<ChangeEvent, { type: "change.created" }>;
		assert.equal(apply(null, legacy).budgets.max_attempts, 3);
	});
	it("identical candidates stop with stagnation before the attempt budget", () => {
		const r = new Runner({ stagnation_identical_candidates: 2 });
		r.toDeciding(candidate("same"), { unit: "FAIL", lint: "PASS" }).g5();
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_2", feedback: null });
		r.implement("int_2", "att_2");
		const c = candidate("same");
		r.freeze(c)
			.verify([
				evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "FAIL" }),
				evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
			])
			.g5();
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_3", feedback: null });
		assert.equal(r.s.stop_reason, "stagnation");
	});
	it("tool call budget refuses the call beyond the limit", () => {
		const r = new Runner({ budgets: { tool_calls_per_intervention: 5 } }).toImplementing();
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
		r.run({
			type: "budget.consume",
			at: tick(),
			actor: KERNEL,
			intervention_id: "i",
			counters: { tool_calls: 5, duration_ms: 0, tokens_known: 0, delegations: 0 },
		});
		r.expectError(
			{
				type: "budget.consume",
				at: tick(),
				actor: KERNEL,
				intervention_id: "i",
				counters: { tool_calls: 1, duration_ms: 0, tokens_known: 0, delegations: 0 },
			},
			"BUDGET_EXHAUSTED",
		);
	});
	it("technical retries are bounded to two and never retry an in-flight effect (RM-033, RM-055)", () => {
		const r = new Runner().toImplementing();
		r.run({ type: "operation.fail", at: tick(), actor: KERNEL, operation_key: "spawn" });
		r.run({ type: "operation.fail", at: tick(), actor: KERNEL, operation_key: "spawn" });
		assert.equal(r.s.status, "ready");
		r.run({ type: "operation.fail", at: tick(), actor: KERNEL, operation_key: "spawn" });
		assert.equal(r.s.status, "blocked");
		assert.equal(r.s.stop_reason, "execution_error");
	});
	it("an unqualified execution profile blocks before the intervention (AGT-01, capability_missing)", () => {
		const r = new Runner().toImplementing();
		r.expectError(
			{
				type: "intervention.start",
				at: tick(),
				actor: KERNEL,
				intervention_id: "i",
				role: "implement",
				attempt_id: "a",
				model: { provider_id: "p", model_id: "m", thinking_level: "off", location: "on_machine" },
				profile_id: "implement",
				profile_qualified: false,
			},
			"CAPABILITY_MISSING",
		);
		r.expectError(
			{
				type: "intervention.start",
				at: tick(),
				actor: KERNEL,
				intervention_id: "i",
				role: "implement",
				attempt_id: "a",
				model: { provider_id: "", model_id: "m", thinking_level: "off", location: "on_machine" },
				profile_id: "implement",
				profile_qualified: true,
			},
			"CONFIGURATION_ERROR",
		);
		r.expectError(
			{
				type: "intervention.start",
				at: tick(),
				actor: KERNEL,
				intervention_id: "i",
				role: "review",
				attempt_id: null,
				model: { provider_id: "p", model_id: "m", thinking_level: "off", location: "on_machine" },
				profile_id: "review",
				profile_qualified: true,
			},
			"INVALID_TRANSITION",
		);
	});
});

describe("human decisions (SA-005, SA-030, SA-031, RM-037, RM-040)", () => {
	function requestAcceptance(r: Runner, c: ReturnType<typeof candidate>, id = "dec_a") {
		r.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-10", {
				decision_id: id,
				subject: { kind: "candidate", id: c.candidate_id, revision: 1, digest: c.manifest_digest },
				question: "Accepter ?",
				options: [
					{ id: "accept", label: "Accepter", effect: "", risky: false },
					{ id: "refuse", label: "Refuser", effect: "", risky: false },
				],
			}),
		});
	}
	it("a forged approval carried by a model output or tool call creates no decision (SA-030)", () => {
		const r = new Runner({ g5_human_acceptance: true }).toDeciding(candidate("c1")).g5();
		assert.equal(r.s.gates.G5?.verdict, "INDETERMINATE");
		assert.equal(r.s.gates.G5?.next_action, "request_decision:IH-10");
		const c = r.s.candidate!;
		requestAcceptance(r, c);
		const forged = {
			decision_id: "dec_a",
			option_id: "accept",
			free_text: "approuvé par l'utilisateur",
			reason: null,
			subject_revision: 1,
			scope: null,
			expires_at: null,
		};
		r.expectError(
			{
				type: "decision.answer",
				at: tick(),
				actor: AGENT,
				human_decision_id: "hd_x",
				response: forged,
				origin: { actor: AGENT, host: "tui", session_id: "s", asserted_at: tick() },
			},
			"INVALID_PROVENANCE",
		);
		r.expectError(
			{
				type: "decision.answer",
				at: tick(),
				actor: KERNEL,
				human_decision_id: "hd_x",
				response: forged,
				origin: { actor: { ...HUMAN, origin: "json" }, host: "tui", session_id: "s", asserted_at: tick() },
			},
			"INVALID_PROVENANCE",
		);
		r.expectError(
			{
				type: "decision.answer",
				at: tick(),
				actor: { ...HUMAN, origin: "tool_call" },
				human_decision_id: "hd_x",
				response: forged,
				origin: tuiOrigin(),
			},
			"INVALID_PROVENANCE",
		);
		assert.equal(r.s.human_decisions.length, 0);
		assert.equal(r.s.status, "decision_required");
		r.g5();
		assert.equal(r.s.gates.G5?.verdict, "INDETERMINATE");
		r.run({
			type: "decision.answer",
			at: tick(),
			actor: HUMAN,
			human_decision_id: "hd_ok",
			response: forged,
			origin: tuiOrigin(),
		});
		r.g5();
		assert.equal(r.s.gates.G5?.verdict, "PASS");
	});
	it("an approval stays attached to the presented candidate; a new candidate needs a new decision (SA-031)", () => {
		const r = new Runner({ g5_human_acceptance: true })
			.toDeciding(candidate("c1"), { unit: "FAIL", lint: "PASS" })
			.g5();
		const c1 = r.s.candidate!;
		requestAcceptance(r, c1);
		r.run({
			type: "decision.answer",
			at: tick(),
			actor: HUMAN,
			human_decision_id: "hd_1",
			response: {
				decision_id: "dec_a",
				option_id: "accept",
				free_text: null,
				reason: null,
				subject_revision: 1,
				scope: null,
				expires_at: null,
			},
			origin: tuiOrigin(),
		});
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_2", feedback: null });
		assert.equal(r.s.human_decisions[0]?.valid, false, "decision revoked by candidate replacement");
		r.implement("int_2", "att_2");
		const c2 = candidate("c2");
		r.freeze(c2)
			.verify([
				evidence({ control_id: "unit", subject_digest: c2.manifest_digest }),
				evidence({ control_id: "lint", subject_digest: c2.manifest_digest }),
			])
			.g5();
		assert.equal(r.s.gates.G5?.verdict, "INDETERMINATE");
		assert.ok(r.s.gates.G5?.evidence_missing.includes("human:IH-10"));
	});
	it("a decision on a stale revision or after expiry is refused (RM-037)", () => {
		const r = new Runner().toDeciding(candidate("c1")).g5();
		const r2 = new Runner({ g5_human_acceptance: true }).toDeciding(candidate("c1")).g5();
		const c = r2.s.candidate!;
		r2.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-10", {
				decision_id: "d",
				subject: { kind: "candidate", id: c.candidate_id, revision: 1, digest: c.manifest_digest },
				question: "?",
				options: [{ id: "accept", label: "", effect: "", risky: false }],
				expires_at: "2026-09-16T10:00:00.000Z",
			}),
		});
		r2.expectError(
			{
				type: "decision.answer",
				at: tick(),
				actor: HUMAN,
				human_decision_id: "h",
				response: {
					decision_id: "d",
					option_id: "accept",
					free_text: null,
					reason: null,
					subject_revision: 1,
					scope: null,
					expires_at: null,
				},
				origin: tuiOrigin(),
			},
			"DECISION_EXPIRED",
		);
		r2.expectError(
			{
				type: "decision.answer",
				at: "2026-09-16T09:00:00.000Z",
				actor: HUMAN,
				human_decision_id: "h",
				response: {
					decision_id: "d",
					option_id: "accept",
					free_text: null,
					reason: null,
					subject_revision: 2,
					scope: null,
					expires_at: null,
				},
				origin: tuiOrigin(),
			},
			"DECISION_NOT_APPLICABLE",
		);
		assert.equal(r.s.outcome, "accepted");
	});
	it("no answer never means approval: the change stays decision_required (RM-040)", () => {
		const r = new Runner({ g5_human_acceptance: true }).toDeciding(candidate("c1")).g5();
		requestAcceptance(r, r.s.candidate!);
		r.g5();
		assert.equal(r.s.gates.G5?.verdict, "INDETERMINATE");
		assert.equal(r.s.status, "decision_required");
		r.expectError(
			{ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "x", feedback: null },
			"DECISION_REQUIRED",
		);
		r.expectError(
			{
				type: "intervention.start",
				at: tick(),
				actor: KERNEL,
				intervention_id: "i",
				role: "observe",
				attempt_id: null,
				model: { provider_id: "p", model_id: "m", thinking_level: "off", location: "on_machine" },
				profile_id: "observe",
				profile_qualified: true,
			},
			"DECISION_REQUIRED",
		);
		assert.equal(r.s.outcome, "pending");
	});
});

describe("invalidation (SA-034, BES-05, RM-070, RM-076)", () => {
	it("revising a requirement after successful verification invalidates G1..G5 but keeps evidence historised", () => {
		const r = new Runner().toDeciding(candidate("c1")).g5();
		const r2 = new Runner().toDeciding(candidate("c1"));
		r2.run({
			type: "artifact.revise",
			at: tick(),
			actor: KERNEL,
			kind: "requirements",
			ref: ref("rqs_1", { v: 2 }, 2),
			reason: "business rule changed",
		});
		assert.equal(r2.s.phase, "specifying");
		assert.equal(r2.s.gates.G1, undefined);
		assert.equal(r2.s.gates.G2, undefined);
		assert.equal(r2.s.gates.G4, undefined);
		assert.equal(r2.s.gates.G0?.verdict, "PASS");
		assert.equal(r2.s.evidence.length, 2);
		assert.ok(r2.s.evidence.every((e) => !e.valid));
		assert.equal(r.s.outcome, "accepted");
	});
	it("a lost evidence invalidates the gate that consumed it and returns to verifying", () => {
		const r = new Runner().toDeciding(candidate("c1")).g5();
		const r2 = new Runner({ g5_human_acceptance: true }).toDeciding(candidate("c1")).g5();
		const evd = r2.s.evidence[0]!.evidence_id;
		r2.run({
			type: "evidence.invalidate",
			at: tick(),
			actor: KERNEL,
			evidence_id: evd,
			reason: "digest mismatch in store",
		});
		assert.equal(r2.s.gates.G5, undefined);
		assert.equal(r2.s.phase, "verifying");
		assert.equal(r.s.outcome, "accepted");
	});
	it("an environment change invalidates qualification and returns to verification_design", () => {
		const r = new Runner().toDeciding(candidate("c1"));
		r.run({ type: "environment.change", at: tick(), actor: KERNEL, digest: digestValue({ pi: "0.86.0" }) });
		assert.equal(r.s.phase, "verification_design");
		assert.equal(r.s.gates.G2, undefined);
		assert.ok(r.s.evidence.every((e) => !e.valid));
		assert.notEqual(r.s.environment_digest, ENV);
	});
});

describe("integration effects (SA-020, SA-021, RM-054, RM-055, NFR-03)", () => {
	function toIntegrating(): { r: Runner; c: ReturnType<typeof candidate> } {
		const r = new Runner({ integration_enabled: true });
		r.create()
			.g0(mandate({ integration: "local_branch" }))
			.g1()
			.g2()
			.g3()
			.implement();
		return { r, c: integrationPrepared(r) };
	}
	it("an uncertain effect blocks until reconciliation and is never retried", () => {
		const { r, c } = toIntegrating();
		r.run({
			type: "integration.effect",
			at: tick(),
			actor: KERNEL,
			operation_id: "op_i",
			effect_state: "started",
			detail: null,
			decision_id: null,
		});
		r.run({
			type: "integration.effect",
			at: tick(),
			actor: KERNEL,
			operation_id: "op_i",
			effect_state: "uncertain",
			detail: "process died",
			decision_id: "dec_r",
		});
		assert.equal(r.s.status, "decision_required");
		assert.equal(r.s.operation?.effect_state, "uncertain");
		r.expectError(
			{
				type: "integration.prepare",
				at: tick(),
				actor: KERNEL,
				operation_id: "op_j",
				idempotency_key: "k2",
				destination: "main",
				destination_before: "a".repeat(40),
				plan_digest: digestValue("plan"),
			},
			"DECISION_REQUIRED",
		);
		r.expectError({ type: "change.resume", at: tick(), actor: HUMAN }, "PRECONDITION_FAILED");
		r.run({
			type: "decision.answer",
			at: tick(),
			actor: HUMAN,
			human_decision_id: "hd_r",
			response: {
				decision_id: "dec_r",
				option_id: "confirm_applied",
				free_text: null,
				reason: null,
				subject_revision: r.s.pending_decisions[0]!.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin: tuiOrigin(),
		});
		assert.equal(r.s.operation?.effect_state, "reconciled");
		r.run({
			type: "integration.reconcile",
			at: tick(),
			actor: KERNEL,
			operation_id: "op_i",
			applied: true,
			destination_after: "b".repeat(40),
			receipt_digest: digestValue("rcpt"),
		});
		assert.equal(r.s.operation?.effect_state, "confirmed");
		r.run({
			type: "gate.evaluate",
			gate: "G6",
			at: tick(),
			actor: KERNEL,
			destination_after: "b".repeat(40),
			applied_digest: c.manifest_digest,
			receipt_digest: digestValue("rcpt"),
		});
		assert.equal(r.s.outcome, "integrated");
	});
	it("the same idempotency key returns the same prepared operation; another key conflicts", () => {
		const { r } = toIntegrating();
		r.run({
			type: "integration.prepare",
			at: tick(),
			actor: KERNEL,
			operation_id: "op_i",
			idempotency_key: "k",
			destination: "main",
			destination_before: "a".repeat(40),
			plan_digest: digestValue("plan"),
		});
		r.expectError(
			{
				type: "integration.prepare",
				at: tick(),
				actor: KERNEL,
				operation_id: "op_z",
				idempotency_key: "z",
				destination: "main",
				destination_before: "a".repeat(40),
				plan_digest: digestValue("plan"),
			},
			"OPERATION_ACTIVE",
		);
	});
	it("a destination that advanced with a different combined tree re-runs verification (SA-021)", () => {
		const { r } = toIntegrating();
		r.run({
			type: "integration.destination_advanced",
			at: tick(),
			actor: KERNEL,
			destination_before: "c".repeat(40),
			combined_changed: true,
		});
		assert.equal(r.s.phase, "verifying");
		assert.equal(r.s.gates.G5, undefined);
		assert.equal(r.s.gates.G4, undefined);
		assert.ok(r.s.evidence.every((e) => !e.valid));
		assert.equal(r.s.human_decisions.find((d) => d.human_decision_id === "hd_i")?.valid, false);
	});
	it("a destination that advanced with a different combined tree withdraws the accepted outcome, and a failed re-verification is not said accepted", () => {
		const { r, c } = toIntegrating();
		assert.equal(r.s.outcome, "accepted", "G5 accepted the candidate");
		r.run({
			type: "integration.destination_advanced",
			at: tick(),
			actor: KERNEL,
			destination_before: "c".repeat(40),
			combined_changed: true,
		});
		assert.equal(r.s.outcome, "pending", "the fallback withdraws the acceptance");
		r.verify([
			evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "FAIL" }),
			evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
		]).g5();
		assert.equal(r.s.gates.G5?.verdict, "FAIL");
		assert.equal(r.s.outcome, "pending", "a failed re-verification is not said accepted");
	});
	/** The integration applied, confirmed, and judged by G6 on a tree other than the accepted candidate's. */
	function appliedAnotherTree(r: Runner): void {
		for (const effect_state of ["started", "confirmed"] as const)
			r.run({
				type: "integration.effect",
				at: tick(),
				actor: KERNEL,
				operation_id: "op_i",
				effect_state,
				detail: null,
				decision_id: null,
			});
		r.run({
			type: "gate.evaluate",
			gate: "G6",
			at: tick(),
			actor: KERNEL,
			destination_after: "b".repeat(40),
			applied_digest: candidate("other").manifest_digest,
			receipt_digest: digestValue("r"),
		});
	}
	it("G6 fails when the applied tree differs from the accepted candidate (RM-053)", () => {
		const { r } = toIntegrating();
		appliedAnotherTree(r);
		assert.equal(r.s.gates.G6?.verdict, "FAIL");
		assert.equal(r.s.stop_reason, "integration_conflict");
	});
	it("a destination that advanced with the same combined tree after G6 failed invalidates G6 alone, and the accepted outcome stays with G5", () => {
		const { r } = toIntegrating();
		appliedAnotherTree(r);
		assert.equal(r.s.outcome, "accepted", "G5 accepted the candidate");
		r.run({
			type: "integration.destination_advanced",
			at: tick(),
			actor: KERNEL,
			destination_before: "c".repeat(40),
			combined_changed: false,
		});
		assert.equal(r.s.gates.G6, undefined, "G6 is invalidated");
		assert.equal(r.s.gates.G5?.verdict, "PASS", "G5 still holds");
		assert.equal(r.s.outcome, "accepted", "the acceptance goes only with G5");
	});
	it("a pause between an integration's preparation and the start of its effect leaves the integration open, so the resume finds what it prepared", () => {
		const { r } = toIntegrating();
		assert.deepEqual([r.s.operation?.operation_id, r.s.operation?.effect_state], ["op_i", "prepared"]);
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });
		assert.equal(r.s.status, "paused");
		assert.deepEqual(
			[r.s.operation?.operation_id, r.s.operation?.effect_state],
			["op_i", "prepared"],
			"the pause closes only a verification",
		);
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });
		assert.deepEqual(
			[r.s.operation?.operation_id, r.s.operation?.effect_state],
			["op_i", "prepared"],
			"a second pause closes only a verification too",
		);
		r.run({ type: "change.resume", at: tick(), actor: HUMAN });
		assert.equal(r.s.operation?.operation_id, "op_i", "the resume finds the integration it prepared");
	});
});

describe("pause, resume, cancel (PF-17, RM-056)", () => {
	it("pauses at a safe point and resumes at the same phase; cancellation keeps the dossier", () => {
		const r = new Runner().toImplementing();
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });
		assert.equal(r.s.status, "paused");
		r.expectError(
			{
				type: "intervention.start",
				at: tick(),
				actor: KERNEL,
				intervention_id: "i",
				role: "implement",
				attempt_id: "a",
				model: { provider_id: "p", model_id: "m", thinking_level: "off", location: "on_machine" },
				profile_id: "implement",
				profile_qualified: true,
			},
			"PRECONDITION_FAILED",
		);
		r.run({ type: "change.resume", at: tick(), actor: HUMAN });
		assert.equal(r.s.status, "ready");
		assert.equal(r.s.phase, "implementing");
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
		r.expectError({ type: "change.cancel", at: tick(), actor: AGENT, reason: "x" }, "INVALID_PROVENANCE");
		r.run({ type: "change.cancel", at: tick(), actor: HUMAN, reason: "not needed" });
		assert.equal(r.s.outcome, "abandoned");
		assert.equal(r.s.status, "cancelled");
		assert.equal(r.s.interventions[0]?.result, "cancelled");
		assert.equal(r.s.attempts[0]?.result, "cancelled");
		assert.equal(r.s.adopted.protocol?.ref.artifact_id, "prt_1", "dossier kept");
	});

	it("refuses to pause a blocked change, which keeps its stop, its detail and its retryability", () => {
		const r = new Runner().create();
		const detail = "the specification loses material answer(s) q1";
		r.run({ type: "change.block", at: tick(), actor: KERNEL, reason: "stagnation", detail, retryable: true });
		const refused = r.expectError({ type: "change.pause", at: tick(), actor: HUMAN }, "PRECONDITION_FAILED");
		assert.deepEqual(refused.nextActions, ["resume", "cancel"]);
		assert.equal(r.s.status, "blocked");
		assert.equal(r.s.stop_reason, "stagnation");
		assert.equal(r.s.stop_detail, detail);
		assert.equal(r.s.stop_retryable, true);
	});

	it("ends the running intervention when it blocks a change, so a pause is still refused and the stop kept", () => {
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
		r.run({ type: "change.block", at: tick(), actor: KERNEL, reason: "capability_missing", detail: "no sandbox" });
		assert.equal(r.s.interventions[0]?.result, "failed");
		assert.equal(r.s.attempts[0]?.result, "open", "the attempt outlives the stop");
		const refused = r.expectError({ type: "change.pause", at: tick(), actor: HUMAN }, "PRECONDITION_FAILED");
		assert.deepEqual(refused.nextActions, ["cancel"], "a resume does not lift a missing capability");
		assert.equal(r.s.status, "blocked");
		assert.equal(r.s.stop_reason, "capability_missing");
		assert.equal(r.s.stop_detail, "no sandbox");
	});
});
