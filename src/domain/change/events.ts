import type {
	ActorRef,
	ArtifactRef,
	CandidateRef,
	GateId,
	Phase,
	ExecStatus,
	Outcome,
	StopReason,
	SubjectRef,
	HumanInteraction,
	Verdict,
	InterventionRole,
} from "../../contracts/v1/common.ts";
import type { ImposedLayersRecord } from "../imposed-layers.ts";
import type {
	ArtifactKind,
	AttemptCounters,
	FrozenProtocol,
	GateDecisionState,
	InterventionCost,
	InterventionResult,
	MandateTerms,
	ModelIdentity,
	OperationKind,
	ReviewConclusion,
} from "./state.ts";

interface Base {
	at: string;
	actor: ActorRef;
}

export type ChangeEvent =
	// `max_attempts` is absent from changes created before the kernel recorded it, so it is read as
	// the default bound rather than required of a replayed ledger.
	| (Base & {
			type: "change.created";
			change_id: string;
			program_id: string;
			increment_id: string;
			request: ArtifactRef;
			reference: { reference_id: string; kind: string; digest: string };
			environment_digest: string | null;
			max_attempts?: number;
			/** Absent from a change created before the deliverable was recorded, which delivers a candidate. */
			deliverable?: "state";
	  })
	| (Base & { type: "phase.entered"; phase: Phase; status: ExecStatus; reason: string })
	// `retryable` is absent from every status change but a block, and from blocks written before the
	// kernel recorded it, so it is read as false rather than required of a replayed ledger.
	| (Base & {
			type: "status.changed";
			status: ExecStatus;
			stop_reason: StopReason | null;
			detail: string | null;
			retryable?: boolean;
	  })
	| (Base & { type: "outcome.set"; outcome: Outcome })
	| (Base & { type: "artifact.proposed"; kind: ArtifactKind; ref: ArtifactRef })
	| (Base & { type: "artifact.adopted"; kind: ArtifactKind; ref: ArtifactRef; gate: GateId | null })
	| (Base & {
			type: "artifact.revised";
			kind: ArtifactKind;
			ref: ArtifactRef;
			rollback_phase: Phase;
			invalidated_gates: GateId[];
			reason: string;
	  })
	| (Base & MandateTerms & { type: "mandate.recorded" })
	| (Base & { type: "requirements.recorded"; requirement_ids: string[]; mandatory_requirement_ids: string[] })
	| (Base & { type: "protocol.frozen"; protocol: FrozenProtocol })
	| (Base & { type: "question.opened"; id: string; question: string; material: boolean; decision_id: string | null })
	| (Base & { type: "question.answered"; id: string; answer: string; human_decision_id: string | null })
	| (Base & { type: "question.closed"; id: string; human_decision_id: string | null })
	/**
	 * The owner revoked the resolution of a material question, under the actor who gave the
	 * revocation: `human_decision_id` is the IH-01 decision it revokes, null for a close given without
	 * one, and `decision_id` the IH-01 request that asks the question again.
	 */
	| (Base & { type: "question.revoked"; id: string; human_decision_id: string | null; decision_id: string })
	| (Base & { type: "gate.decided"; decision: GateDecisionState })
	| (Base & { type: "gate.invalidated"; gate: GateId; reason: string })
	| (Base & { type: "attempt.opened"; attempt_id: string; index: number })
	| (Base & { type: "attempt.closed"; attempt_id: string; result: "completed" | "failed" | "cancelled" | "superseded" })
	| (Base & {
			type: "intervention.started";
			intervention_id: string;
			role: InterventionRole;
			attempt_id: string | null;
			model: ModelIdentity;
			profile_id: string;
	  })
	| (Base & {
			type: "intervention.finished";
			intervention_id: string;
			result: InterventionResult;
			counters: AttemptCounters;
			detail: string | null;
			/** Absent from a dossier written before the cost was recorded, which is not a zero. */
			cost?: InterventionCost;
			/**
			 * What the session's requests showed around the harness instructions, each held against the
			 * manifest's expectation. Absent from a dossier written before requests were observed.
			 */
			imposed_layers?: readonly ImposedLayersRecord[];
	  })
	| (Base & { type: "budget.consumed"; intervention_id: string; counters: AttemptCounters })
	| (Base & { type: "budget.extended"; amount: number; decision_id: string; new_max_attempts: number })
	| (Base & { type: "candidate.frozen"; candidate: CandidateRef; attempt_id: string; entry_count: number })
	| (Base & {
			type: "evidence.recorded";
			evidence_id: string;
			control_id: string;
			control_version: string;
			requirement_ids: string[];
			subject_digest: string;
			protocol_revision: number;
			environment_digest: string;
			verdict: Verdict;
			findings_blocking: number;
	  })
	| (Base & { type: "evidence.rejected"; evidence_id: string; control_id: string; reason: string })
	| (Base & { type: "evidence.invalidated"; evidence_id: string; reason: string })
	| (Base & {
			type: "review.recorded";
			review_id: string;
			reviewer_role: string;
			subject_digest: string;
			conclusion: ReviewConclusion;
			blocking_findings: number;
	  })
	| (Base & { type: "review.invalidated"; review_id: string; reason: string })
	| (Base & {
			type: "decision.requested";
			decision_id: string;
			interaction: HumanInteraction;
			subject: SubjectRef;
			expires_at: string | null;
	  })
	| (Base & {
			type: "decision.recorded";
			human_decision_id: string;
			decision_id: string;
			interaction: HumanInteraction;
			option_id: string | null;
			subject: SubjectRef;
			actor_id: string;
			scope: string | null;
			free_text: string | null;
	  })
	| (Base & { type: "decision.revoked"; human_decision_id: string; reason: string })
	| (Base & { type: "decision.withdrawn"; decision_id: string; reason: string })
	| (Base & { type: "feedback.produced"; attempt_id: string; digest: string; bytes: number; truncated: boolean })
	| (Base & { type: "operation.opened"; operation_id: string; kind: OperationKind; idempotency_key: string })
	| (Base & {
			type: "operation.effect";
			operation_id: string;
			effect_state: "prepared" | "started" | "confirmed" | "failed" | "uncertain" | "reconciled";
			detail: string | null;
	  })
	/** `interrupted`: the operation was stopped before its outcome was recorded; absent from a journal written before it. */
	| (Base & { type: "operation.closed"; operation_id: string; interrupted?: true })
	| (Base & { type: "operation.retried"; operation_key: string; count: number })
	| (Base & {
			type: "integration.prepared";
			destination: string;
			destination_before: string;
			candidate_digest: string;
			plan_digest: string;
			authorized_by: string;
	  })
	| (Base & { type: "integration.confirmed"; destination_after: string; receipt_digest: string })
	| (Base & { type: "integration.destination_advanced"; destination_before: string; combined_changed: boolean })
	| (Base & { type: "environment.changed"; digest: string })
	| (Base & { type: "resume_point.saved"; phase: Phase; status: ExecStatus })
	| (Base & { type: "preparation.opened"; mandate_ref: ArtifactRef })
	| (Base & { type: "preparation.closed"; qualified: boolean; capability_ids: string[] });

export type ChangeEventType = ChangeEvent["type"];
