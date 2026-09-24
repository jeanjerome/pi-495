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
import type { ArtifactKind, AttemptCounters, FrozenProtocol, GateDecisionState, InterventionCost } from "./state.ts";
import type { ModelLocation } from "../policy.ts";

interface Base {
	at: string;
	actor: ActorRef;
}

export type ChangeEvent =
	| (Base & {
			type: "change.created";
			change_id: string;
			program_id: string;
			increment_id: string;
			request: ArtifactRef;
			reference: { reference_id: string; kind: string; digest: string };
			environment_digest: string | null;
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
	| (Base & {
			type: "mandate.recorded";
			allowed_paths: string[];
			integration: "disabled" | "local_branch";
			language: "fr" | "en";
	  })
	| (Base & { type: "requirements.recorded"; requirement_ids: string[]; mandatory_requirement_ids: string[] })
	| (Base & { type: "protocol.frozen"; protocol: FrozenProtocol })
	| (Base & { type: "question.opened"; id: string; question: string; material: boolean; decision_id: string | null })
	| (Base & { type: "question.answered"; id: string; answer: string; human_decision_id: string | null })
	| (Base & { type: "gate.decided"; decision: GateDecisionState })
	| (Base & { type: "gate.invalidated"; gate: GateId; reason: string })
	| (Base & { type: "attempt.opened"; attempt_id: string; index: number })
	| (Base & { type: "attempt.closed"; attempt_id: string; result: "completed" | "failed" | "cancelled" | "superseded" })
	| (Base & {
			type: "intervention.started";
			intervention_id: string;
			role: InterventionRole;
			attempt_id: string | null;
			model: {
				provider_id: string;
				model_id: string;
				thinking_level: string;
				/** Absent from a dossier written before the location was recorded, which is not on this machine. */
				location?: ModelLocation;
			};
			profile_id: string;
	  })
	| (Base & {
			type: "intervention.finished";
			intervention_id: string;
			result: "completed" | "failed" | "cancelled" | "truncated";
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
			conclusion: "approve" | "reject" | "consultative";
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
	  })
	| (Base & { type: "decision.rejected"; decision_id: string; reason: string })
	| (Base & { type: "decision.revoked"; human_decision_id: string; reason: string })
	| (Base & { type: "feedback.produced"; attempt_id: string; digest: string; bytes: number; truncated: boolean })
	| (Base & { type: "operation.opened"; operation_id: string; kind: string; idempotency_key: string })
	| (Base & {
			type: "operation.effect";
			operation_id: string;
			effect_state: "prepared" | "started" | "confirmed" | "failed" | "uncertain" | "reconciled";
			detail: string | null;
	  })
	| (Base & { type: "operation.closed"; operation_id: string })
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
