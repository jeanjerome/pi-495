import { resumeLiftsStop, type ChangeState } from "../domain/change/state.ts";
import {
	sameGap,
	setAside,
	type BaselineGap,
	type ControlledPerimeter,
	type ExceptionStanding,
	type GapException,
	type JudgedGap,
	type IncrementStatus,
	type ProgramState,
} from "../domain/program/program.ts";

/** A gap of the cited survey as the status names it: its rule, module and code, and its count at the survey. */
export type StatusGap = Pick<BaselineGap, "rule_id" | "module" | "authorship" | "violations">;

/**
 * The survey of the integrated project a milestone was judged on, each gap it judged, and the perimeter
 * its analysers controlled once the milestone passed on it.
 */
export interface StatusMeasure {
	change_id: string;
	gaps: JudgedGap[];
	perimeter: ControlledPerimeter | null;
}

/** Canonical status projection shared by every Pi entry (AT-07, UX-03). */
export interface StatusView {
	schema_version: 1;
	program: {
		program_id: string;
		title: string;
		project_path: string;
		/** The survey the program starts from, and the tree it measured; null when it cites none. */
		baseline: { change_id: string; reference_digest: string } | null;
		/** Each increment with the gaps of the survey it removes. */
		increments: { increment_id: string; title: string; status: IncrementStatus; gaps: StatusGap[] }[];
		/** The gaps of the survey a scope decision sets aside, with its reason. */
		set_aside: (StatusGap & { reason: string })[];
		/**
		 * The gaps of the survey an exception tolerates, each with its exception and the standing the latest
		 * measure that judged it gave it: null before any did.
		 */
		exceptions: (StatusGap & GapException & { standing: ExceptionStanding | null })[];
		/** Each milestone with its latest evaluation, or null before the program evaluated it. */
		milestones: {
			milestone_id: string;
			title: string;
			final: boolean;
			evaluation: {
				verdict: string;
				satisfied: string[];
				remaining: string[];
				indeterminate: string[];
				integrated_digest: string | null;
				/** Null for an evaluation taken without a measure. */
				measure: StatusMeasure | null;
			} | null;
		}[];
		closed: boolean;
	} | null;
	change: {
		change_id: string;
		increment_id: string;
		revision: number;
		phase: string;
		status: string;
		outcome: string;
		stop_reason: string | null;
		stop_detail: string | null;
		/** Whether a resume lifts the stop the change is blocked on. */
		resume_lifts_stop: boolean;
		gates: { gate: string; verdict: string; reasons: string[]; next_action: string }[];
		attempts: { used: number; max: number };
		candidate: { candidate_id: string; manifest_digest: string } | null;
		/** Every piece of evidence of the change, each saying whether it judges the candidate the change now carries. */
		evidence: {
			evidence_id: string;
			control_id: string;
			verdict: string;
			valid: boolean;
			current_candidate: boolean;
		}[];
		pending_decisions: { decision_id: string; interaction: string }[];
		last_intervention: { role: string; result: string; tool_calls: number; duration_ms: number } | null;
		/** Interventions of the open attempt stopped by the duration budget and resumed since. */
		continuations: number;
		consumption: Consumption;
		next_action: string;
		updated_at: string;
	} | null;
	limits: string[];
}

/**
 * What the change's interventions have used: the tokens the host reported, and the sum of the amounts
 * it put on them at its catalogue's rates. `usd` is null when it put none; it is never an invoice.
 */
export interface Consumption {
	tokens: number;
	usd: number | null;
	subscription: boolean;
}

function consumptionOf(s: ChangeState): Consumption {
	const priced = s.interventions.flatMap((i) => (i.cost?.usd != null ? [i.cost] : []));
	return {
		tokens: s.interventions.reduce((sum, i) => sum + i.counters.tokens_known, 0),
		usd: priced.length ? priced.reduce((sum, c) => sum + c.usd!, 0) : null,
		subscription: s.interventions.some((i) => i.cost?.subscription === true),
	};
}

function nextActionOf(s: ChangeState): string {
	if (s.phase === "closed")
		return s.outcome === "integrated"
			? "done: integrated"
			: s.outcome === "accepted"
				? "done: accepted (export available)"
				: `done: ${s.outcome}`;
	if (s.status === "decision_required") return `decide: ${s.pending_decisions.map((d) => d.interaction).join(", ")}`;
	if (s.status === "blocked")
		return `blocked: ${s.stop_reason ?? "unknown"} — ${s.stop_detail ?? ""}${s.stop_retryable ? " — resume retries it" : ""}`;
	if (s.status === "paused") return "resume";
	if (s.status === "running") return "wait: intervention or verification running";
	switch (s.phase) {
		case "scoping":
			return "clarify: specification intervention then G0";
		case "specification":
			return "G1: adopt requirements";
		case "qualification":
			return "G2: build and qualify the protocol";
		case "preparing":
			return "preparation: build the missing capability";
		case "design":
			return "G3: adopt design";
		case "implementation":
			return "produce a candidate";
		case "verifying":
			return "run the frozen controls";
		case "reviewing":
			return "run required reviews";
		case "deciding":
			return "G5: evaluate acceptance";
		case "integration":
			return "integrate locally (G6)";
		default:
			return "resume";
	}
}

function statusGap(g: BaselineGap): StatusGap {
	return { rule_id: g.rule_id, module: g.module, authorship: g.authorship, violations: g.violations };
}

function latestEvaluation(
	program: ProgramState,
	milestoneId: string,
): NonNullable<StatusView["program"]>["milestones"][number]["evaluation"] {
	const e = program.milestone_evaluations.findLast((x) => x.milestone_id === milestoneId);
	return e
		? {
				verdict: e.verdict,
				satisfied: e.satisfied,
				remaining: e.remaining,
				indeterminate: e.indeterminate,
				integrated_digest: e.integrated_digest,
				measure: e.measure
					? {
							change_id: e.measure.change_id,
							gaps: e.measure.gaps,
							perimeter: e.verdict === "PASS" ? e.measure.perimeter : null,
						}
					: null,
			}
		: null;
}

/** The standing of the exception on `gap` the latest measure that judged it gave, or null before any did. */
function standingOf(program: ProgramState, gap: BaselineGap): ExceptionStanding | null {
	const judged = program.milestone_evaluations
		.flatMap((e) => e.measure?.gaps ?? [])
		.findLast((g) => g.exception && sameGap(g, gap));
	return judged?.exception?.standing ?? null;
}

export function statusView(
	program: ProgramState | null,
	change: ChangeState | null,
	limits: string[] = [],
): StatusView {
	const last = change?.interventions[change.interventions.length - 1] ?? null;
	return {
		schema_version: 1,
		program: program
			? {
					program_id: program.program_id,
					title: program.title,
					project_path: program.project_path,
					baseline: program.baseline
						? { change_id: program.baseline.change_id, reference_digest: program.baseline.reference_digest }
						: null,
					increments: program.increments.map((i) => ({
						increment_id: i.increment_id,
						title: i.title,
						status: i.status,
						gaps: i.gaps.flatMap((g) => {
							const surveyed = program.baseline?.gaps.find((b) => sameGap(b, g));
							return surveyed ? [statusGap(surveyed)] : [];
						}),
					})),
					set_aside: (program.baseline?.gaps ?? []).flatMap((g) =>
						setAside(g) ? [{ ...statusGap(g), reason: g.scope_decision.reason }] : [],
					),
					exceptions: (program.baseline?.gaps ?? []).flatMap((g) =>
						g.exception ? [{ ...statusGap(g), ...g.exception, standing: standingOf(program, g) }] : [],
					),
					milestones: program.milestones.map((m) => ({
						milestone_id: m.milestone_id,
						title: m.title,
						final: m.final,
						evaluation: latestEvaluation(program, m.milestone_id),
					})),
					closed: program.closed,
				}
			: null,
		change: change
			? {
					change_id: change.change_id,
					increment_id: change.increment_id,
					revision: change.revision,
					phase: change.phase,
					status: change.status,
					outcome: change.outcome,
					stop_reason: change.stop_reason,
					stop_detail: change.stop_detail,
					resume_lifts_stop: resumeLiftsStop(change),
					gates: (["G0", "G1", "G2", "G3", "G4", "G5", "G6"] as const).flatMap((g) => {
						const decision = change.gates[g];
						return decision
							? [{ gate: g, verdict: decision.verdict, reasons: decision.reasons, next_action: decision.next_action }]
							: [];
					}),
					attempts: { used: change.budgets.attempts_used, max: change.budgets.max_attempts },
					candidate: change.candidate
						? { candidate_id: change.candidate.candidate_id, manifest_digest: change.candidate.manifest_digest }
						: null,
					evidence: change.evidence.map((e) => ({
						evidence_id: e.evidence_id,
						control_id: e.control_id,
						verdict: e.verdict,
						valid: e.valid,
						current_candidate: e.subject_digest === change.candidate?.manifest_digest,
					})),
					pending_decisions: change.pending_decisions.map((d) => ({
						decision_id: d.decision_id,
						interaction: d.interaction,
					})),
					last_intervention: last
						? {
								role: last.role,
								result: last.result,
								tool_calls: last.counters.tool_calls,
								duration_ms: last.counters.duration_ms,
							}
						: null,
					continuations: last?.attempt_id
						? change.interventions.filter((i) => i.attempt_id === last.attempt_id && i.result === "truncated").length
						: 0,
					consumption: consumptionOf(change),
					next_action: nextActionOf(change),
					updated_at: change.updated_at,
				}
			: null,
		limits,
	};
}
