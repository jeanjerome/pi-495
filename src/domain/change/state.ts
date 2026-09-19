import type { ActorRef, ArtifactRef, CandidateRef, GateId, Phase, ExecStatus, Outcome, StopReason, ProtocolRef, SubjectRef, Verdict, HumanInteraction, InterventionRole } from "../../contracts/v1/common.ts";
import type { AnsweredQuestion, Obligation } from "../../contracts/v1/protocol.ts";

export type ArtifactKind = "request" | "diagnostic" | "mandate" | "requirements" | "protocol" | "design" | "trajectory" | "preparation" | "feedback" | "review" | "milestone" | "reference" | "candidate" | "context" | "output" | "integration";

export interface AdoptedArtifact {
	kind: ArtifactKind;
	ref: ArtifactRef;
	adopted_at: string;
	gate: GateId | null;
}

export interface OpenQuestion {
	id: string;
	question: string;
	material: boolean;
	answer: string | null;
	/** When the answer was recorded: a specification that ended before it cannot carry it. */
	answered_at: string | null;
	decision_id: string | null;
}

export interface AttemptCounters {
	tool_calls: number;
	duration_ms: number;
	tokens_known: number;
	delegations: number;
}

export type AttemptResult = "open" | "completed" | "failed" | "cancelled" | "superseded";

export interface AttemptState {
	attempt_id: string;
	index: number;
	started_at: string;
	ended_at: string | null;
	interventions: string[];
	candidate: CandidateRef | null;
	counters: AttemptCounters;
	result: AttemptResult;
}

export interface InterventionState {
	intervention_id: string;
	role: InterventionRole;
	attempt_id: string | null;
	model: { provider_id: string; model_id: string; thinking_level: string };
	profile_id: string;
	started_at: string;
	ended_at: string | null;
	result: "running" | "completed" | "failed" | "cancelled" | "truncated";
	counters: AttemptCounters;
}

export interface EvidenceEntry {
	evidence_id: string;
	control_id: string;
	control_version: string;
	requirement_ids: string[];
	subject_digest: string;
	protocol_revision: number;
	environment_digest: string;
	verdict: Verdict;
	valid: boolean;
	invalid_reason: string | null;
	recorded_at: string;
	findings_blocking: number;
}

export interface ReviewEntry {
	review_id: string;
	reviewer_role: string;
	subject_digest: string;
	conclusion: "approve" | "reject" | "consultative";
	blocking_findings: number;
	valid: boolean;
	recorded_at: string;
}

export interface GateDecisionState {
	gate: GateId;
	verdict: "PASS" | "FAIL" | "INDETERMINATE";
	decided_at: string;
	state_revision: number;
	evaluated: Record<string, string>;
	reasons: string[];
	evidence_retained: string[];
	evidence_ignored: string[];
	evidence_missing: string[];
	fail_requirements: string[];
	indeterminate_requirements: string[];
	next_action: string;
}

export interface PendingDecision {
	decision_id: string;
	interaction: HumanInteraction;
	subject: SubjectRef;
	requested_at: string;
	expires_at: string | null;
}

export interface HumanDecisionEntry {
	human_decision_id: string;
	decision_id: string;
	interaction: HumanInteraction;
	option_id: string | null;
	subject: SubjectRef;
	actor_id: string;
	scope: string | null;
	valid: boolean;
	recorded_at: string;
}

export interface OperationState {
	operation_id: string;
	kind: string;
	idempotency_key: string;
	effect_state: "none" | "prepared" | "started" | "confirmed" | "failed" | "uncertain" | "reconciled";
	started_at: string;
}

export interface FrozenProtocol {
	ref: ProtocolRef;
	obligations: Obligation[];
	control_ids: string[];
	protected_paths: string[];
	required_reviews: string[];
	arbitration: "human_decision" | "reject";
	environment_digest: string;
}

export interface IntegrationState {
	destination: string;
	destination_before: string;
	destination_after: string | null;
	candidate_digest: string;
	plan_digest: string;
	authorized_by: string | null;
	receipt_digest: string | null;
}

export interface BudgetState {
	max_attempts: number;
	attempts_used: number;
	retries: Record<string, number>;
	increment_ms_used: number;
	tool_calls_total: number;
	extensions: { amount: number; decision_id: string; at: string }[];
}

export interface ChangeState {
	schema_version: 1;
	change_id: string;
	program_id: string;
	increment_id: string;
	revision: number;
	created_at: string;
	updated_at: string;
	phase: Phase;
	status: ExecStatus;
	outcome: Outcome;
	stop_reason: StopReason | null;
	stop_detail: string | null;
	request: ArtifactRef;
	reference: { reference_id: string; kind: string; digest: string };
	proposals: Partial<Record<ArtifactKind, ArtifactRef[]>>;
	adopted: Partial<Record<ArtifactKind, AdoptedArtifact>>;
	protocol: FrozenProtocol | null;
	mandate: { allowed_paths: string[]; integration: "disabled" | "local_branch"; language: "fr" | "en" } | null;
	requirement_ids: string[];
	mandatory_requirement_ids: string[];
	open_questions: OpenQuestion[];
	gates: Partial<Record<GateId, GateDecisionState>>;
	attempts: AttemptState[];
	interventions: InterventionState[];
	candidate: CandidateRef | null;
	candidate_history: string[];
	evidence: EvidenceEntry[];
	reviews: ReviewEntry[];
	pending_decisions: PendingDecision[];
	human_decisions: HumanDecisionEntry[];
	operation: OperationState | null;
	budgets: BudgetState;
	integration: IntegrationState | null;
	environment_digest: string | null;
	resume_point: { phase: Phase; status: ExecStatus } | null;
	acceptance_decision_id: string | null;
	integration_authorization_id: string | null;
	last_actor: ActorRef | null;
	feedback: { attempt_id: string; digest: string; bytes: number }[];
}

export const ACTIVE_PHASES: readonly Phase[] = ["intake", "clarifying", "specifying", "verification_design", "preparing", "designing", "implementing", "verifying", "reviewing", "deciding", "integrating"];

export function isActive(state: ChangeState): boolean {
	return state.phase !== "closed" && state.status !== "cancelled" && state.status !== "completed";
}

export function currentAttempt(state: ChangeState): AttemptState | null {
	for (let i = state.attempts.length - 1; i >= 0; i--) {
		const a = state.attempts[i]!;
		if (a.result === "open" || a.result === "completed") return a;
	}
	return null;
}

export function openAttempt(state: ChangeState): AttemptState | null {
	const last = state.attempts[state.attempts.length - 1];
	return last && last.result === "open" ? last : null;
}

export function runningIntervention(state: ChangeState): InterventionState | null {
	return state.interventions.find((i) => i.result === "running") ?? null;
}

/**
 * The material answers a specification report was written without. A report that asked the question
 * and declares nothing about its answer is the report of before the decision, whatever its text
 * says; a report that declares the answer — even to say it fixes nothing observable — carries it.
 */
export function answersTheReportIgnores(state: ChangeState, report: { questions: { id: string }[]; answers: { question_id: string }[] }): OpenQuestion[] {
	const asked = new Set(report.questions.map((q) => q.id));
	const carried = new Set(report.answers.map((a) => a.question_id));
	return state.open_questions.filter((q) => q.material && q.answer !== null && asked.has(q.id) && !carried.has(q.id));
}

/**
 * The answered material questions a specification report accounts for. Used to tell a reopening
 * that took an answer into account from one that gave the same report back.
 */
export function answersTheReportCarries(state: ChangeState, report: { answers: { question_id: string }[] }): string[] {
	const answered = new Set(state.open_questions.filter((q) => q.material && q.answer !== null).map((q) => q.id));
	return report.answers.map((a) => a.question_id).filter((id) => answered.has(id));
}

/**
 * The recorded material answers, as the requirements document carries them: question and answer are
 * copied from the ledger, the binding to the requirements comes from the report. An answer the
 * report says nothing about is held observable and carried by nothing, so silence is refused at G1
 * instead of passing for a declaration that the answer fixes nothing (ADR-013, fail closed).
 */
export function answersOf(state: ChangeState, report: { answers: { question_id: string; observable: boolean; requirement_ids: string[] }[] }): AnsweredQuestion[] {
	const declared = new Map(report.answers.map((a) => [a.question_id, a] as const));
	return state.open_questions
		.filter((q) => q.material && q.answer !== null)
		.map((q) => {
			const d = declared.get(q.id);
			return { question_id: q.id, question: q.question, answer: q.answer as string, observable: d?.observable ?? true, requirement_ids: d?.requirement_ids ?? [] };
		});
}

export function subjectOfChange(state: ChangeState): SubjectRef {
	return { kind: "change", id: state.change_id, revision: Math.max(1, state.revision), digest: state.candidate?.manifest_digest ?? state.reference.digest };
}

export function subjectOfCandidate(state: ChangeState): SubjectRef | null {
	if (!state.candidate) return null;
	return { kind: "candidate", id: state.candidate.candidate_id, revision: 1, digest: state.candidate.manifest_digest };
}
