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
import type { ContestationFindingReport } from "../../contracts/v1/reports.ts";
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
	| "integration"
	| "survey"
	| "architecture_map"
	| "architecture_recommendation";

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
	/**
	 * When the owner declared the question no longer material; null while it is open or answered.
	 * Absent from a dossier written before this field existed — read with `isQuestionClosed`, never
	 * compared to `null` directly, so such a dossier reads as open, not closed.
	 */
	closed_at?: string | null;
	/** Who closed the question. Never a model or an agent (RM-024): closing is a human decision. Absent from a dossier written before this field existed. */
	closed_by?: ActorRef | null;
}

/**
 * Whether the owner has closed a question (RM-024: only the owner closes, and only a record closes
 * it). The one predicate every site reads instead of comparing `closed_at` to `null`: a dossier
 * written before this field existed carries no `closed_at` at all, and `JSON.parse` then hands back
 * `undefined`, which `!== null` would count as closed.
 */
export function isQuestionClosed(q: { closed_at?: string | null }): boolean {
	return typeof q.closed_at === "string";
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

export interface ModelIdentity {
	provider_id: string;
	model_id: string;
	thinking_level: string;
	/** Absent from a dossier written before the location was recorded, and then never read as on this machine. */
	location?: ModelLocation;
}

export type InterventionResult = "completed" | "failed" | "cancelled" | "truncated";

export interface InterventionState {
	intervention_id: string;
	role: InterventionRole;
	attempt_id: string | null;
	model: ModelIdentity;
	profile_id: string;
	started_at: string;
	ended_at: string | null;
	result: "running" | InterventionResult;
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
	/** Absent from evidence recorded before results carried the identity of their protocol. */
	protocol_id?: string;
	protocol_revision: number;
	environment_digest: string;
	verdict: Verdict;
	valid: boolean;
	invalid_reason: string | null;
	recorded_at: string;
	findings_blocking: number;
	/** The cases the control observed passing; absent when its reader names no case. */
	passed_cases?: string[];
}

export type ReviewConclusion = "approve" | "reject" | "consultative";

export interface ReviewEntry {
	review_id: string;
	reviewer_role: string;
	subject_digest: string;
	conclusion: ReviewConclusion;
	blocking_findings: number;
	valid: boolean;
	recorded_at: string;
}

/**
 * What the producer contests of a frozen case: the requirement and the case, the protocol and the
 * candidate it met the case under, what the case asserts against what the change adopted, and the
 * kernel's own run of the frozen control in which the case failed. A contestation is a signal: it
 * grants no right on the protected paths and changes nothing the protocol judges.
 */
export interface ContestationFacts {
	contestation_id: string;
	/** The producer intervention whose report raised it. */
	intervention_id: string;
	requirement_id: string;
	/** The frozen case, as the reader of its control names it. */
	case_name: string;
	protocol: { protocol_id: string; revision: number };
	candidate_digest: string;
	/** What the case asserts, against what the adopted requirement or human answer says. */
	observation: string;
	/** The evidence of the frozen control, run by the kernel on the candidate, in which the case failed. */
	reproduction: { control_id: string; evidence_id: string };
}

/**
 * What the examination of a contestation found: the case contradicts nothing the change adopted, so the
 * code is to be corrected; the case contradicts the requirement as adopted, so the preparation is to be
 * written again; or the case holds the requirement and the requirement is what changes, which is the
 * owner's to decide.
 */
export type ContestationFinding = ContestationFindingReport["finding"];

export interface ContestationEntry extends ContestationFacts {
	filed_at: string;
	/** Null while the contestation is examined. */
	finding: ContestationFinding | null;
	examiner_id: string | null;
	reasons: string | null;
	concluded_at: string | null;
}

/** What a gate decision names as the next step of the change. */
export type NextAction =
	| "answer_material_questions"
	| "revise_mandate"
	| "specify_requirements"
	| "cancel"
	| "design_verification"
	| "design_change"
	| "prepare_capabilities_or_assign_human_decision"
	| "revise_protocol"
	| "revise_design"
	| "produce_candidate"
	| "verify"
	| "correct_or_reject"
	| "integrate"
	| "close_accepted"
	| "correct"
	| "stop:attempts_exhausted"
	| "resolve_incident"
	| "reconcile_integration"
	| "close"
	| `request_decision:${HumanInteraction}`;

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
	next_action: NextAction;
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
	/** What the owner wrote beside the option, kept where a later step reads it: an IH-04 revision says what to write. */
	free_text: string | null;
	valid: boolean;
	recorded_at: string;
}

/** The two works the kernel holds an operation open for: running the frozen controls, and integrating. */
export type OperationKind = "verification" | "integration";

export interface OperationState {
	operation_id: string;
	kind: OperationKind;
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

export interface MandateTerms {
	allowed_paths: string[];
	integration: "disabled" | "local_branch";
	language: "fr" | "en";
}

/**
 * What a change delivers: a candidate an agent writes, or the state of the project as the frozen
 * controls measure it on the reference, with no candidate and nothing written into the project.
 */
export type Deliverable = "candidate" | "state";

export interface ChangeState {
	schema_version: 1;
	change_id: string;
	program_id: string;
	increment_id: string;
	/** Absent from a dossier written before this field existed — read with `surveysTheProject`. */
	deliverable?: Deliverable;
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
	mandate: MandateTerms | null;
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
	/** Absent from a dossier written before contestations were recorded, which holds none. */
	contestations?: ContestationEntry[];
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

/**
 * Whether a result ran under the frozen protocol: the same protocol, at the same revision. A result recorded
 * before it carried the identity of its protocol is judged by its revision alone, as it was when recorded.
 */
export function ranUnderProtocol(
	e: { protocol_id?: string; protocol_revision: number },
	frozen: Pick<ProtocolRef, "protocol_id" | "revision">,
): boolean {
	return (
		(e.protocol_id === undefined || e.protocol_id === frozen.protocol_id) && e.protocol_revision === frozen.revision
	);
}

/** Whether the change delivers the state of the project; a dossier written before the field delivers a candidate. */
export function surveysTheProject(state: Pick<ChangeState, "deliverable">): boolean {
	return state.deliverable === "state";
}

export function isActive(state: ChangeState): boolean {
	return state.phase !== "closed" && state.status !== "cancelled" && state.status !== "completed";
}

/** A resume lifts an execution error and any stop whose cause the kernel declared retryable. */
export function resumeLiftsStop(state: ChangeState): boolean {
	return state.status === "blocked" && (state.stop_reason === "execution_error" || state.stop_retryable);
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
interface AnswerDeclaration {
	question_id: string;
	observable: boolean;
	requirement_ids: string[];
}

/**
 * Whether a declaration still binds in a given set of requirements: an observable answer is carried
 * by requirements the document holds, one of them mandatory at least, since G2 freezes an obligation
 * only for those. A declaration that fixes nothing observable is a proposal, not a decision (BES-02),
 * and never holds on its own: `answersOf` and `answersTheReportIgnores` read a closed question's
 * resolution directly off `isQuestionClosed`, not off this map, so a proposal binds nothing here
 * whether the question is open or closed — for an open one, the reopening rule below then treats it
 * as a lost answer until the specification binds it again or the owner closes the question.
 */
function declarationHolds(
	a: AnswerDeclaration,
	requirements: { requirement_id: string; mandatory: boolean }[],
): boolean {
	if (!a.observable) return false;
	const named = a.requirement_ids.map((rid) => requirements.find((r) => r.requirement_id === rid));
	return named.length > 0 && named.every((r) => r !== undefined) && named.some((r) => r?.mandatory);
}

/**
 * What a report says about each answered material question — its own declarations, over the ones it
 * inherits from the reports written before it on the same change. Every reopening would otherwise
 * make the report redeclare the whole history of the decisions taken, which is what grows it at each
 * round until its output is refused; the kernel recorded those answers and read those
 * declarations, so it carries them itself and asks the next report only for what it has not already
 * said. A declaration, inherited or the report's own, counts only while it holds in the requirements
 * of the report, as G1 judges it: one that names a requirement the report does not carry, or no
 * mandatory one, binds nothing, and the answer counts as undeclared again; so does one that declares
 * the answer fixes nothing observable.
 */
export function declarationsOfReport(
	priors: SpecificationReportView[],
	report: SpecificationReportView,
): Map<string, string[]> {
	const declared = new Map<string, string[]>();
	for (const r of [...priors, report]) {
		for (const a of r.answers) {
			if (declarationHolds(a, report.requirements)) declared.set(a.question_id, a.requirement_ids);
			else declared.delete(a.question_id);
		}
	}
	return declared;
}

/**
 * The material answers a specification report was written without: the ones it declares nothing
 * about, neither itself nor by what it inherits, whether it asked the question or not. These are the
 * answers G1 refuses, so a report that renamed the requirement an earlier one bound an answer to is
 * judged here as it will be there. A report carries an answer only when its declaration holds in its
 * requirements (`declarationHolds`); one that instead declares the answer fixes nothing observable
 * never holds, so it never carries the answer either — the question stays here, ignored, until the
 * owner closes it. A question the owner closes is owed nothing further: closing it after its answer
 * is lost is as final as declaring the answer (BES-02).
 */
function answersTheReportIgnores(state: ChangeState, declared: Map<string, string[]>): OpenQuestion[] {
	return state.open_questions.filter(
		(q) => q.material && q.answer !== null && !isQuestionClosed(q) && !declared.has(q.id),
	);
}

/**
 * The answered material questions a specification report accounts for. Used to tell a reopening
 * that took an answer into account from one that gave the same report back. A question the owner has
 * since closed is excluded: it was resolved once, by the close, so a report that still declares it
 * (its own declaration, or one inherited from before the close) carries no fresh progress for it. A
 * report that still loses another answer is judged on that other answer alone, and stalls rather than
 * being reopened once more for a question that needs no further rewriting (BES-02).
 */
function answersTheReportCarries(state: ChangeState, declared: Map<string, string[]>): string[] {
	const answered = new Set(
		state.open_questions.filter((q) => q.material && q.answer !== null && !isQuestionClosed(q)).map((q) => q.id),
	);
	return [...declared.keys()].filter((id) => answered.has(id));
}

/**
 * The recorded material answers, as the requirements document carries them: question and answer are
 * copied from the ledger, the binding to the requirements comes from the report. An answer no report
 * of this change says anything about is held observable and carried by nothing, so silence is refused
 * at G1 instead of passing for a declaration that the answer fixes nothing (ADR-013, fail closed). A
 * question the owner has closed is copied as fixing nothing observable and bound to no requirement,
 * whatever a report still declares of it: closing is what the confirmation of BES-02 tells the owner
 * it does ("its answer will bind no requirement any more"), and only the owner may dispense an answer.
 */
export function answersOf(state: ChangeState, declared: Map<string, string[]>): AnsweredQuestion[] {
	return state.open_questions
		.filter((q) => q.material && q.answer !== null)
		.map((q) => {
			if (isQuestionClosed(q)) {
				return {
					question_id: q.id,
					question: q.question,
					answer: q.answer as string,
					observable: false,
					requirement_ids: [],
				};
			}
			// `declared` only ever names requirement ids for a binding `declarationHolds` accepted, which
			// is always observable by construction; silence (no entry for `q.id`) is held observable too,
			// per this function's own fail-closed rule above.
			return {
				question_id: q.id,
				question: q.question,
				answer: q.answer as string,
				observable: true,
				requirement_ids: declared.get(q.id) ?? [],
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

/**
 * The specification reports of a change but the current one, oldest first, split at the latest human
 * act: a material answer recorded, or a stop lifted by a resume. `sinceLastHumanAct` opens on the
 * report that act was given on, and holds after it the reports written without a human act between
 * them; it is empty when the current report is the one the act was given on. `earlier` holds the
 * reports superseded before it. Both are read for what a report inherits.
 */
export interface SpecificationHistory {
	earlier: SpecificationReportView[];
	sinceLastHumanAct: SpecificationReportView[];
}

export interface SpecificationStanding {
	/** The requirement ids bound to each answered material question, the inherited bindings included. */
	declared: Map<string, string[]>;
	/** The recorded material answers the report says nothing about. */
	ignored: OpenQuestion[];
	/** The report must be written again: it ignores an answer and carries one no report since the latest human act carried. */
	reopen: boolean;
	/** Every material question is resolved (answered or closed) and the report carries every answer: this report stands. */
	settled: boolean;
	/** Every material question is resolved, the report loses an answer and may not be written again: the change stops. */
	stalled: boolean;
}

/**
 * Where a specification stands against the answers given since it was written.
 *
 * A report written before a material answer cannot carry it, and reusing it is how a recorded human
 * decision reaches nothing: the answer is put back into the request and the specification is redone.
 * The report the latest human act was given on is therefore written again as soon as it ignores one.
 * What bounds the rewritings after it is progress, not a count — each must account for an answer no
 * report since the latest human act did, that report included. Measured against the previous report
 * alone, reports that take one answer back and lose another in turn would each count as progress and
 * be reopened without end; measured against every report since the latest human act, the rewritings
 * without a human act between them number at most one more than the recorded answers. Measured
 * against every report of the change, an answer given after a report that gained nothing would reach
 * no rewriting; measured from the moment the clarification is entered, adopting a mandate or failing
 * G0 would reopen the same report again. A report that gives the same ground back stalls: no mandate
 * built on it is proposed, since G1 would refuse the answer it lost and, past G0, no phase goes back
 * to the specification. A resume that lifts the stop counts as a human act like an answer: the
 * report the change stopped on is written again once, and the bound applies from there. A question
 * the owner closes needs no answer to be resolved: only the owner can close a question (RM-024), so
 * closing it is as final as answering it, and no rewriting is owed for it.
 */
export function specificationStanding(
	state: ChangeState,
	report: SpecificationReportView | null,
	history: SpecificationHistory,
): SpecificationStanding {
	if (!report) return { declared: new Map(), ignored: [], reopen: false, settled: false, stalled: false };
	const priors = [...history.earlier, ...history.sinceLastHumanAct];
	const declared = declarationsOfReport(priors, report);
	const ignored = answersTheReportIgnores(state, declared);
	const before = new Set(
		history.sinceLastHumanAct.flatMap((prior, i) =>
			answersTheReportCarries(state, declarationsOfReport(priors.slice(0, history.earlier.length + i), prior)),
		),
	);
	const reopen =
		ignored.length > 0 &&
		(history.sinceLastHumanAct.length === 0 || answersTheReportCarries(state, declared).some((id) => !before.has(id)));
	const final = !reopen && state.open_questions.every((q) => !q.material || q.answer !== null || isQuestionClosed(q));
	return {
		declared,
		ignored,
		reopen,
		settled: final && ignored.length === 0,
		stalled: final && ignored.length > 0,
	};
}
