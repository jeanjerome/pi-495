import type { ChangeEvent } from "./events.ts";
import type { ChangeState } from "./state.ts";
import { DEFAULT_POLICY } from "../policy.ts";

/** Pure projection of one event onto the aggregate. Never throws for known events. */
export function apply(state: ChangeState | null, event: ChangeEvent): ChangeState {
	if (event.type === "change.created") {
		return {
			schema_version: 1,
			change_id: event.change_id,
			program_id: event.program_id,
			increment_id: event.increment_id,
			revision: 1,
			created_at: event.at,
			updated_at: event.at,
			phase: "intake",
			status: "ready",
			outcome: "pending",
			stop_reason: null,
			stop_detail: null,
			request: event.request,
			reference: event.reference,
			proposals: {},
			adopted: { request: { kind: "request", ref: event.request, adopted_at: event.at, gate: null } },
			protocol: null,
			mandate: null,
			requirement_ids: [],
			mandatory_requirement_ids: [],
			open_questions: [],
			gates: {},
			attempts: [],
			interventions: [],
			candidate: null,
			candidate_history: [],
			evidence: [],
			reviews: [],
			pending_decisions: [],
			human_decisions: [],
			operation: null,
			budgets: { max_attempts: DEFAULT_POLICY.budgets.max_attempts, attempts_used: 0, retries: {}, increment_ms_used: 0, tool_calls_total: 0, extensions: [] },
			integration: null,
			environment_digest: event.environment_digest,
			resume_point: null,
			acceptance_decision_id: null,
			integration_authorization_id: null,
			last_actor: event.actor,
			feedback: [],
		};
	}
	if (!state) throw new Error(`event ${event.type} applied before change.created`);
	const s: ChangeState = { ...state, revision: state.revision + 1, updated_at: event.at, last_actor: event.actor };
	switch (event.type) {
		case "phase.entered":
			s.phase = event.phase;
			s.status = event.status;
			if (event.status !== "blocked") {
				s.stop_reason = null;
				s.stop_detail = null;
			}
			return s;
		case "status.changed":
			s.status = event.status;
			s.stop_reason = event.stop_reason;
			s.stop_detail = event.detail;
			return s;
		case "outcome.set":
			s.outcome = event.outcome;
			return s;
		case "artifact.proposed":
			s.proposals = { ...s.proposals, [event.kind]: [...(s.proposals[event.kind] ?? []), event.ref] };
			return s;
		case "artifact.adopted":
			s.adopted = { ...s.adopted, [event.kind]: { kind: event.kind, ref: event.ref, adopted_at: event.at, gate: event.gate } };
			return s;
		case "artifact.revised": {
			s.proposals = { ...s.proposals, [event.kind]: [...(s.proposals[event.kind] ?? []), event.ref] };
			const gates = { ...s.gates };
			for (const g of event.invalidated_gates) delete gates[g];
			s.gates = gates;
			s.phase = event.rollback_phase;
			s.status = "ready";
			s.stop_reason = null;
			s.stop_detail = null;
			s.outcome = s.outcome === "integrated" ? s.outcome : "pending";
			return s;
		}
		case "mandate.recorded":
			s.mandate = { allowed_paths: event.allowed_paths, integration: event.integration, language: event.language };
			return s;
		case "requirements.recorded":
			s.requirement_ids = event.requirement_ids;
			s.mandatory_requirement_ids = event.mandatory_requirement_ids;
			return s;
		case "protocol.frozen":
			s.protocol = event.protocol;
			return s;
		case "question.opened":
			s.open_questions = [...s.open_questions, { id: event.id, question: event.question, material: event.material, answer: null, decision_id: event.decision_id }];
			return s;
		case "question.answered":
			s.open_questions = s.open_questions.map((q) => (q.id === event.id ? { ...q, answer: event.answer } : q));
			return s;
		case "gate.decided":
			s.gates = { ...s.gates, [event.decision.gate]: event.decision };
			return s;
		case "gate.invalidated": {
			const gates = { ...s.gates };
			delete gates[event.gate];
			s.gates = gates;
			return s;
		}
		case "attempt.opened":
			s.attempts = [...s.attempts, { attempt_id: event.attempt_id, index: event.index, started_at: event.at, ended_at: null, interventions: [], candidate: null, counters: { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 }, result: "open" }];
			s.budgets = { ...s.budgets, attempts_used: s.budgets.attempts_used + 1 };
			return s;
		case "attempt.closed":
			s.attempts = s.attempts.map((a) => (a.attempt_id === event.attempt_id ? { ...a, result: event.result, ended_at: event.at } : a));
			return s;
		case "intervention.started":
			s.interventions = [...s.interventions, { intervention_id: event.intervention_id, role: event.role, attempt_id: event.attempt_id, model: event.model, profile_id: event.profile_id, started_at: event.at, ended_at: null, result: "running", counters: { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 } }];
			if (event.attempt_id) s.attempts = s.attempts.map((a) => (a.attempt_id === event.attempt_id ? { ...a, interventions: [...a.interventions, event.intervention_id] } : a));
			s.status = "running";
			return s;
		case "intervention.finished":
			s.interventions = s.interventions.map((i) => (i.intervention_id === event.intervention_id ? { ...i, result: event.result, ended_at: event.at, counters: addCounters(i.counters, event.counters) } : i));
			s.status = "ready";
			return addCountersToAttempt(s, event.intervention_id, event.counters);
		case "budget.consumed":
			s.interventions = s.interventions.map((i) => (i.intervention_id === event.intervention_id ? { ...i, counters: addCounters(i.counters, event.counters) } : i));
			return addCountersToAttempt(s, event.intervention_id, event.counters);
		case "budget.extended":
			s.budgets = { ...s.budgets, max_attempts: event.new_max_attempts, extensions: [...s.budgets.extensions, { amount: event.amount, decision_id: event.decision_id, at: event.at }] };
			return s;
		case "candidate.frozen":
			s.candidate = event.candidate;
			s.candidate_history = [...s.candidate_history, event.candidate.manifest_digest];
			s.attempts = s.attempts.map((a) => (a.attempt_id === event.attempt_id ? { ...a, candidate: event.candidate, result: "completed", ended_at: event.at } : a));
			return s;
		case "evidence.recorded":
			s.evidence = [...s.evidence, { evidence_id: event.evidence_id, control_id: event.control_id, control_version: event.control_version, requirement_ids: event.requirement_ids, subject_digest: event.subject_digest, protocol_revision: event.protocol_revision, environment_digest: event.environment_digest, verdict: event.verdict, valid: true, invalid_reason: null, recorded_at: event.at, findings_blocking: event.findings_blocking }];
			return s;
		case "evidence.rejected":
			return s;
		case "evidence.invalidated":
			s.evidence = s.evidence.map((e) => (e.evidence_id === event.evidence_id ? { ...e, valid: false, invalid_reason: event.reason } : e));
			return s;
		case "review.recorded":
			s.reviews = [...s.reviews, { review_id: event.review_id, reviewer_role: event.reviewer_role, subject_digest: event.subject_digest, conclusion: event.conclusion, blocking_findings: event.blocking_findings, valid: true, recorded_at: event.at }];
			return s;
		case "review.invalidated":
			s.reviews = s.reviews.map((r) => (r.review_id === event.review_id ? { ...r, valid: false } : r));
			return s;
		case "decision.requested":
			s.pending_decisions = [...s.pending_decisions, { decision_id: event.decision_id, interaction: event.interaction, subject: event.subject, requested_at: event.at, expires_at: event.expires_at }];
			s.status = "decision_required";
			s.stop_reason = "decision_pending";
			s.stop_detail = event.interaction;
			return s;
		case "decision.recorded":
			s.pending_decisions = s.pending_decisions.filter((d) => d.decision_id !== event.decision_id);
			s.human_decisions = [...s.human_decisions, { human_decision_id: event.human_decision_id, decision_id: event.decision_id, interaction: event.interaction, option_id: event.option_id, subject: event.subject, actor_id: event.actor_id, scope: event.scope, valid: true, recorded_at: event.at }];
			if (event.interaction === "IH-10" && event.option_id === "accept") s.acceptance_decision_id = event.human_decision_id;
			if (event.interaction === "IH-11" && event.option_id === "integrate") s.integration_authorization_id = event.human_decision_id;
			if (s.pending_decisions.length === 0 && s.status === "decision_required") {
				s.status = "ready";
				s.stop_reason = null;
				s.stop_detail = null;
			}
			return s;
		case "decision.rejected":
			return s;
		case "decision.revoked":
			s.human_decisions = s.human_decisions.map((d) => (d.human_decision_id === event.human_decision_id ? { ...d, valid: false } : d));
			if (s.acceptance_decision_id === event.human_decision_id) s.acceptance_decision_id = null;
			if (s.integration_authorization_id === event.human_decision_id) s.integration_authorization_id = null;
			return s;
		case "feedback.produced":
			s.feedback = [...s.feedback, { attempt_id: event.attempt_id, digest: event.digest, bytes: event.bytes }];
			return s;
		case "operation.opened":
			s.operation = { operation_id: event.operation_id, kind: event.kind, idempotency_key: event.idempotency_key, effect_state: "none", started_at: event.at };
			return s;
		case "operation.effect":
			if (s.operation && s.operation.operation_id === event.operation_id) s.operation = { ...s.operation, effect_state: event.effect_state };
			return s;
		case "operation.closed":
			if (s.operation && s.operation.operation_id === event.operation_id) s.operation = null;
			return s;
		case "operation.retried":
			s.budgets = { ...s.budgets, retries: { ...s.budgets.retries, [event.operation_key]: event.count } };
			return s;
		case "integration.prepared":
			s.integration = { destination: event.destination, destination_before: event.destination_before, destination_after: null, candidate_digest: event.candidate_digest, plan_digest: event.plan_digest, authorized_by: event.authorized_by, receipt_digest: null };
			return s;
		case "integration.confirmed":
			if (s.integration) s.integration = { ...s.integration, destination_after: event.destination_after, receipt_digest: event.receipt_digest };
			return s;
		case "integration.destination_advanced":
			if (s.integration) s.integration = { ...s.integration, destination_before: event.destination_before, plan_digest: "", receipt_digest: null };
			return s;
		case "environment.changed":
			s.environment_digest = event.digest;
			return s;
		case "resume_point.saved":
			s.resume_point = { phase: event.phase, status: event.status };
			return s;
		case "preparation.opened":
		case "preparation.closed":
			return s;
		default: {
			const never: never = event;
			throw new Error(`unknown event ${(never as { type: string }).type}`);
		}
	}
}

export function replay(events: readonly ChangeEvent[]): ChangeState {
	let state: ChangeState | null = null;
	for (const e of events) state = apply(state, e);
	if (!state) throw new Error("empty event stream");
	return state;
}

function addCounters(a: { tool_calls: number; duration_ms: number; tokens_known: number; delegations: number }, b: { tool_calls: number; duration_ms: number; tokens_known: number; delegations: number }) {
	return { tool_calls: a.tool_calls + b.tool_calls, duration_ms: a.duration_ms + b.duration_ms, tokens_known: a.tokens_known + b.tokens_known, delegations: a.delegations + b.delegations };
}

function addCountersToAttempt(s: ChangeState, interventionId: string, counters: { tool_calls: number; duration_ms: number; tokens_known: number; delegations: number }): ChangeState {
	const intervention = s.interventions.find((i) => i.intervention_id === interventionId);
	s.budgets = { ...s.budgets, increment_ms_used: s.budgets.increment_ms_used + counters.duration_ms, tool_calls_total: s.budgets.tool_calls_total + counters.tool_calls };
	if (intervention?.attempt_id) {
		s.attempts = s.attempts.map((a) => (a.attempt_id === intervention.attempt_id ? { ...a, counters: addCounters(a.counters, counters) } : a));
	}
	return s;
}
