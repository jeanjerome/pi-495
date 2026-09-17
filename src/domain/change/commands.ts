import type { ActorRef, ArtifactRef, CandidateRef, GateId, InterventionRole, Phase, StopReason } from "../../contracts/v1/common.ts";
import type { DecisionRequest, DecisionResponse, HumanOrigin } from "../../contracts/v1/decision.ts";
import type { Design, Mandate, Protocol, RequirementsDocument } from "../../contracts/v1/protocol.ts";
import type { ArtifactKind, AttemptCounters } from "./state.ts";

interface Base {
	at: string;
	actor: ActorRef;
}

export interface EvidenceFact {
	evidence_id: string;
	control_id: string;
	control_version: string;
	requirement_ids: string[];
	subject_digest: string;
	protocol_revision: number;
	environment_digest: string;
	verdict: "PASS" | "FAIL" | "INDETERMINATE" | "NOT_RUN" | "NOT_APPLICABLE";
	findings_blocking: number;
}

export interface RequirementsReport {
	valid: boolean;
	issues: string[];
}

export interface CandidateFacts {
	candidate: CandidateRef;
	entry_count: number;
	changed_paths: string[];
	out_of_scope_paths: string[];
	altered_protected_paths: string[];
	/** Protected paths permitted by the frozen protocol: exact prepared files, new files under protected roots and identical mirrored support resources. */
	allowed_protected_paths: string[];
	complete: boolean;
	limits_notes: string[];
}

export type ChangeCommand =
	| (Base & { type: "change.create"; change_id: string; program_id: string; increment_id: string; request: ArtifactRef; reference: { reference_id: string; kind: string; digest: string }; environment_digest: string | null })
	| (Base & { type: "artifact.propose"; kind: ArtifactKind; ref: ArtifactRef })
	| (Base & { type: "question.open"; id: string; question: string; material: boolean; decision_id: string | null })
	| (Base & { type: "question.answer"; id: string; answer: string; human_decision_id: string | null })
	| (Base & { type: "gate.evaluate"; gate: "G0"; mandate_ref: ArtifactRef; mandate: Mandate })
	| (Base & { type: "gate.evaluate"; gate: "G1"; requirements_ref: ArtifactRef; requirements: RequirementsDocument; report: RequirementsReport })
	| (Base & { type: "gate.evaluate"; gate: "G2"; protocol_ref: ArtifactRef; protocol: Protocol })
	| (Base & { type: "gate.evaluate"; gate: "G3"; design_ref: ArtifactRef; design: Design })
	| (Base & { type: "gate.evaluate"; gate: "G5"; decision_id: string | null })
	| (Base & { type: "gate.evaluate"; gate: "G6"; destination_after: string; applied_digest: string; receipt_digest: string })
	| (Base & { type: "preparation.open"; mandate_ref: ArtifactRef })
	| (Base & { type: "preparation.close"; qualified: boolean; capability_ids: string[]; adopted_ref: ArtifactRef | null })
	| (Base & { type: "intervention.start"; intervention_id: string; role: InterventionRole; attempt_id: string | null; model: { provider_id: string; model_id: string; thinking_level: string }; profile_id: string; profile_qualified: boolean })
	| (Base & { type: "intervention.finish"; intervention_id: string; result: "completed" | "failed" | "cancelled"; counters: AttemptCounters; detail: string | null })
	| (Base & { type: "budget.consume"; intervention_id: string; counters: AttemptCounters })
	| (Base & { type: "candidate.freeze"; attempt_id: string; facts: CandidateFacts })
	| (Base & { type: "verification.start"; operation_id: string; idempotency_key: string })
	| (Base & { type: "verification.record"; evidence: EvidenceFact[] })
	| (Base & { type: "verification.complete"; operation_id: string })
	| (Base & { type: "verification.rerun"; reason: string })
	| (Base & { type: "review.record"; review_id: string; reviewer_role: string; subject_digest: string; conclusion: "approve" | "reject" | "consultative"; blocking_findings: number })
	| (Base & { type: "review.complete" })
	| (Base & { type: "correction.authorize"; attempt_id: string; feedback: { digest: string; bytes: number; truncated: boolean } | null })
	| (Base & { type: "change.reject"; reason: string })
	| (Base & { type: "change.pause" })
	| (Base & { type: "change.resume" })
	| (Base & { type: "change.cancel"; reason: string })
	| (Base & { type: "change.block"; reason: StopReason; detail: string })
	| (Base & { type: "change.unblock" })
	| (Base & { type: "decision.request"; request: DecisionRequest })
	| (Base & { type: "decision.answer"; human_decision_id: string; response: DecisionResponse; origin: HumanOrigin })
	| (Base & { type: "decision.revoke"; human_decision_id: string; reason: string })
	| (Base & { type: "artifact.revise"; kind: ArtifactKind; ref: ArtifactRef; reason: string })
	| (Base & { type: "environment.change"; digest: string })
	| (Base & { type: "evidence.invalidate"; evidence_id: string; reason: string })
	| (Base & { type: "operation.fail"; operation_key: string })
	| (Base & { type: "integration.prepare"; operation_id: string; idempotency_key: string; destination: string; destination_before: string; plan_digest: string })
	| (Base & { type: "integration.effect"; operation_id: string; effect_state: "started" | "confirmed" | "failed" | "uncertain"; detail: string | null; decision_id: string | null })
	| (Base & { type: "integration.reconcile"; operation_id: string; applied: boolean; destination_after: string | null; receipt_digest: string | null })
	| (Base & { type: "integration.destination_advanced"; destination_before: string; combined_changed: boolean })
	| (Base & { type: "resume_point.save" });

export type GateCommand = Extract<ChangeCommand, { type: "gate.evaluate" }>;
export type GateOf<G extends GateId> = Extract<GateCommand, { gate: G }>;
export type CommandOf<T extends ChangeCommand["type"]> = Extract<ChangeCommand, { type: T }>;

export const PHASE_FOR_ROLE: Record<InterventionRole, readonly Phase[]> = {
	observe: ["intake", "clarifying", "specifying", "verification_design", "preparing", "designing", "implementing", "verifying", "reviewing", "deciding", "integrating"],
	specify: ["clarifying", "specifying", "verification_design", "designing"],
	prepare: ["preparing"],
	implement: ["implementing"],
	verify: ["verifying"],
	review: ["reviewing"],
	integrate: ["integrating"],
};
