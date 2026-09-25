import type {
	ActorRef,
	ArtifactRef,
	CandidateRef,
	GateId,
	Phase,
	ExecStatus,
	Outcome,
	StopReason,
	ProtocolRef,
	SubjectRef,
	Verdict,
	HumanInteraction,
	InterventionRole,
} from "../../contracts/v1/common.ts";
import type { AnsweredQuestion, Obligation } from "../../contracts/v1/protocol.ts";
import type { ModelLocation } from "../policy.ts";

export type ArtifactKind =
	| "request"
	| "diagnostic"
	| "mandate"
	| "requirements"
	| "protocol"
	| "design"
	| "trajectory"
	| "preparation"
	| "feedback"
	| "review"
	| "milestone"
	| "reference"
	| "candidate"
	| "context"
	| "output"
	| "integration";

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

/**
 * What an intervention cost, as the host totals it for the session at its catalogue's rates
 * (AGT-07). 495 holds no price table and reads no invoice, so an amount is never presented as
 * billed. `usd` is null when the amount is not known, and `unknown_reason` then says why: a zero
 * computed on a rate the catalogue leaves at zero is not a free intervention (NFR-06).
 */
export interface InterventionCost {
	usd: number | null;
	unknown_reason: string | null;
	basis: "host_catalogue";
	/** Whether the host uses the provider through a subscription; null when no session was asked. */
	subscription: boolean | null;
}

export function unknownCost(reason: string, subscription: boolean | null = null): InterventionCost {
	return { usd: null, unknown_reason: reason, basis: "host_catalogue", subscription };
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
	model: {
		provider_id: string;
		model_id: string;
		thinking_level: string;
		/** Absent from a dossier written before the location was recorded, and then never read as on this machine. */
		location?: ModelLocation;
	};
	profile_id: string;
	started_at: string;
	ended_at: string | null;
	result: "running" | "completed" | "failed" | "cancelled" | "truncated";
	counters: AttemptCounters;
	/** What the host put on the intervention once it finished; absent while it runs and in an older dossier. */
	cost?: InterventionCost;
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
	/** The kernel declared the cause of this block retryable, so `resume` has something to lift. */
	stop_retryable: boolean;
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

/** The language the change was started in, as its opening recorded it before any mandate exists. */
export function requestedLanguage(state: ChangeState): "fr" | "en" | null {
	const asked = state.open_questions.find((q) => q.id === "language")?.question.split(":")[1];
	return asked === "fr" || asked === "en" ? asked : null;
}

/** What a specification report says it did with one material answer: the binding, not the text. */
export interface AnswerDeclaration {
	question_id: string;
	observable: boolean;
	requirement_ids: string[];
}

interface DeclaringReport {
	requirements: { requirement_id: string; mandatory: boolean }[];
	answers: AnswerDeclaration[];
}

/**
 * Whether a declaration still binds in a given set of requirements: an observable answer is carried
 * by requirements the document holds, one of them mandatory at least, since G2 freezes an obligation
 * only for those. A declaration that fixes nothing observable binds nothing and always holds.
 */
function declarationHolds(
	a: AnswerDeclaration,
	requirements: { requirement_id: string; mandatory: boolean }[],
): boolean {
	if (!a.observable) return true;
	const named = a.requirement_ids.map((rid) => requirements.find((r) => r.requirement_id === rid));
	return named.length > 0 && named.every((r) => r !== undefined) && named.some((r) => r?.mandatory);
}

/**
 * What a report says about each answered material question — its own declarations, over the ones it
 * inherits from the reports written before it on the same change. Every reopening would otherwise
 * make the report redeclare the whole history of the decisions taken, which is what grows it at each
 * round until its output is refused (`chantiers/F`); the kernel recorded those answers and read those
 * declarations, so it carries them itself and asks the next report only for what it has not already
 * said. An inherited declaration is dropped as soon as the report stops carrying the requirements it
 * names: it would then bind nothing, and the answer counts as undeclared again.
 */
export function declarationsOfReport(
	priors: DeclaringReport[],
	report: DeclaringReport,
): Map<string, AnswerDeclaration> {
	const declared = new Map<string, AnswerDeclaration>();
	for (const prior of priors) {
		for (const a of prior.answers) {
			if (declarationHolds(a, report.requirements)) declared.set(a.question_id, a);
			else declared.delete(a.question_id);
		}
	}
	for (const a of report.answers) declared.set(a.question_id, a);
	return declared;
}

/**
 * The material answers a specification report was written without: the ones it declares nothing
 * about, neither itself nor by what it inherits, whether it asked the question or not. These are the
 * answers G1 refuses, so a report that renamed the requirement an earlier one bound an answer to is
 * judged here as it will be there. A report that declares the answer, even to say it fixes nothing
 * observable, carries it.
 */
function answersTheReportIgnores(state: ChangeState, declared: Map<string, AnswerDeclaration>): OpenQuestion[] {
	return state.open_questions.filter((q) => q.material && q.answer !== null && !declared.has(q.id));
}

/**
 * The answered material questions a specification report accounts for. Used to tell a reopening
 * that took an answer into account from one that gave the same report back.
 */
function answersTheReportCarries(state: ChangeState, declared: Map<string, AnswerDeclaration>): string[] {
	const answered = new Set(state.open_questions.filter((q) => q.material && q.answer !== null).map((q) => q.id));
	return [...declared.keys()].filter((id) => answered.has(id));
}

/**
 * The recorded material answers, as the requirements document carries them: question and answer are
 * copied from the ledger, the binding to the requirements comes from the report. An answer no report
 * of this change says anything about is held observable and carried by nothing, so silence is refused
 * at G1 instead of passing for a declaration that the answer fixes nothing (ADR-013, fail closed).
 */
export function answersOf(state: ChangeState, declared: Map<string, AnswerDeclaration>): AnsweredQuestion[] {
	return state.open_questions
		.filter((q) => q.material && q.answer !== null)
		.map((q) => {
			const d = declared.get(q.id);
			return {
				question_id: q.id,
				question: q.question,
				answer: q.answer as string,
				observable: d?.observable ?? true,
				requirement_ids: d?.requirement_ids ?? [],
			};
		});
}

export function subjectOfChange(state: ChangeState): SubjectRef {
	return {
		kind: "change",
		id: state.change_id,
		revision: Math.max(1, state.revision),
		digest: state.candidate?.manifest_digest ?? state.reference.digest,
	};
}

/** What the reopening rule reads of a specification report. */
export interface SpecificationReportView {
	requirements: { requirement_id: string; mandatory: boolean }[];
	answers: AnswerDeclaration[];
}

export interface SpecificationStanding {
	/** What the report says about each answered material question, the inherited ones included. */
	declared: Map<string, AnswerDeclaration>;
	/** The recorded material answers the report says nothing about. */
	ignored: OpenQuestion[];
	/** The report must be written again: it ignores an answer and carries one no report since the resumption carried. */
	reopen: boolean;
	/** Every material question is answered and the report accounts for it: this report stands. */
	settled: boolean;
}

/**
 * Where a specification stands against the answers given since it was written.
 *
 * A report written before a material answer cannot carry it, and reusing it is how a recorded human
 * decision reaches nothing: the answer is put back into the request and the specification is redone.
 * What bounds the reopening is progress, not a count — the report a reopening produced must account
 * for an answer no report since the clarification resumed did. `resumedOn` is the number of priors
 * written before the report the clarification resumed on: that report was written before the answer
 * that resumed it and is judged on the answers alone, and the reports after it are the reopenings
 * without a human answer between them. Measured against the previous report alone, reports that
 * take one answer back and lose another in turn would each count as progress and be reopened without
 * end; measured against every report since the resumption, the reopenings number at most the
 * recorded answers. Measured against every report of the change, an answer given after a report that
 * gained nothing would reach no rewriting. A report that gives the same ground back is G1's business,
 * and a change is never held by a specification that will not say what it did with an answer.
 */
export function specificationStanding(
	state: ChangeState,
	report: SpecificationReportView | null,
	priors: SpecificationReportView[],
	resumedOn: number,
): SpecificationStanding {
	if (!report) return { declared: new Map(), ignored: [], reopen: false, settled: false };
	const declared = declarationsOfReport(priors, report);
	const ignored = answersTheReportIgnores(state, declared);
	const before = new Set(
		priors.flatMap((prior, i) =>
			i < resumedOn ? [] : answersTheReportCarries(state, declarationsOfReport(priors.slice(0, i), prior)),
		),
	);
	const reopen =
		ignored.length > 0 &&
		(priors.length <= resumedOn || answersTheReportCarries(state, declared).some((id) => !before.has(id)));
	return {
		declared,
		ignored,
		reopen,
		settled: !reopen && state.open_questions.every((q) => !q.material || q.answer !== null),
	};
}
