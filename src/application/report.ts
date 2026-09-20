/**
 * Engineering report (IMP-05): the three natures of what a change produced, kept apart because
 * they do not have the same authority. A mechanical observation is what an executed control
 * measured on an identified subject. A judgment is what someone or something concluded from it —
 * the kernel at a gate, a model in a review, a human in a decision. A residual risk is what
 * nothing here establishes: a control that passed observed what it knows how to observe, and that
 * is not the absence of a defect.
 *
 * The report is derived from the ledger alone, so it reads without a model and without Pi.
 */
import type { Outcome, Verdict } from "../contracts/v1/common.ts";
import type { Evidence } from "../contracts/v1/evidence.ts";
import type { Protocol } from "../contracts/v1/protocol.ts";
import type { ChangeState } from "../domain/change/state.ts";

/** Measured: a control ran on a subject and answered. No interpretation is carried here. */
export interface MechanicalObservation {
	evidence_id: string;
	control_id: string;
	control_version: string;
	/** `candidate`, `reference` or `fixture` — what the control was pointed at. */
	subject_kind: string;
	subject_digest: string;
	verdict: Verdict;
	blocking_findings: number;
	/** The control answered, but its answer is no longer usable for this change. */
	valid: boolean;
}

/** Concluded: by whom, with what authority, and whether the outcome depended on it. */
export interface Judgment {
	kind: "gate" | "review" | "human_decision";
	id: string;
	by: string;
	authority: "kernel" | "model" | "human";
	statement: string;
	/** A judgment the outcome rests on, as opposed to one recorded for the reader. */
	binding: boolean;
}

/** Not established: named so a green report is not read as a proof. */
export interface ResidualRisk {
	code: string;
	statement: string;
}

export interface EngineeringReport {
	schema_version: 1;
	change_id: string;
	outcome: Outcome;
	candidate: { candidate_id: string; manifest_digest: string } | null;
	observations: MechanicalObservation[];
	judgments: Judgment[];
	residual_risks: ResidualRisk[];
}

function reviewStatement(conclusion: string, blocking: number, valid: boolean): string {
	const base = `review concluded ${conclusion}${blocking > 0 ? ` with ${blocking} blocking finding(s)` : ""}`;
	return valid ? base : `${base} (invalidated)`;
}

export function engineeringReport(
	state: ChangeState,
	evidence: readonly Evidence[],
	protocol: Protocol | null,
): EngineeringReport {
	const entryOf = new Map(state.evidence.map((e) => [e.evidence_id, e]));
	const observations: MechanicalObservation[] = evidence.map((e) => ({
		evidence_id: e.evidence_id,
		control_id: e.control_id,
		control_version: e.control_version,
		subject_kind: e.subject.kind,
		subject_digest: e.subject.digest,
		verdict: e.verdict,
		blocking_findings: e.baseline?.blocking_findings ?? e.findings.filter((f) => f.severity === "blocker").length,
		valid: entryOf.get(e.evidence_id)?.valid ?? true,
	}));

	const judgments: Judgment[] = [];
	for (const gate of Object.values(state.gates)) {
		judgments.push({
			kind: "gate",
			id: gate.gate,
			by: "495 kernel",
			authority: "kernel",
			statement: `${gate.gate} ${gate.verdict}${gate.reasons.length ? `: ${gate.reasons.join("; ")}` : ""}`,
			binding: true,
		});
	}
	for (const review of state.reviews) {
		// A review is produced by a model reading the candidate. Required or not, it is an opinion on
		// a text, never a measurement; only its blocking findings bear on the outcome.
		judgments.push({
			kind: "review",
			id: review.review_id,
			by: review.reviewer_role,
			authority: "model",
			statement: reviewStatement(review.conclusion, review.blocking_findings, review.valid),
			binding: review.valid && review.blocking_findings > 0,
		});
	}
	for (const decision of state.human_decisions) {
		judgments.push({
			kind: "human_decision",
			id: decision.human_decision_id,
			by: decision.actor_id,
			authority: "human",
			statement: `${decision.interaction} ${decision.option_id ?? "answered"} on ${decision.subject.kind} ${decision.subject.id}${decision.valid ? "" : " (revoked)"}`,
			binding: decision.valid,
		});
	}

	const risks: ResidualRisk[] = [];
	const add = (code: string, statement: string) => {
		if (!risks.some((r) => r.code === code && r.statement === statement)) risks.push({ code, statement });
	};

	const onCandidate = observations.filter((o) => o.subject_kind === "candidate");
	if (onCandidate.length > 0) {
		add(
			"controls_are_not_a_proof",
			`${onCandidate.length} control run(s) observed the candidate under the frozen protocol; they establish what those controls detect, not the absence of defects.`,
		);
	}
	if (state.reviews.some((r) => r.valid && r.conclusion === "approve")) {
		add(
			"review_is_not_a_demonstration",
			"a review concluded approve: it is a model reading the candidate, and it demonstrates nothing by itself.",
		);
	}
	for (const obligation of protocol?.obligations ?? []) {
		if (obligation.control_ids.length === 0 && !obligation.not_applicable_reason) {
			add(
				"requirement_without_control",
				`requirement ${obligation.requirement.requirement_id} is carried by no control.`,
			);
		}
		if (obligation.not_applicable_reason) {
			add(
				"requirement_declared_not_applicable",
				`requirement ${obligation.requirement.requirement_id} was set aside: ${obligation.not_applicable_reason}.`,
			);
		}
		if (obligation.human_interaction) {
			add(
				"requirement_decided_by_a_human",
				`requirement ${obligation.requirement.requirement_id} is settled by ${obligation.human_interaction}, not by a measurement.`,
			);
		}
	}
	for (const [controlId, qualification] of Object.entries(protocol?.qualifications ?? {})) {
		if (!qualification.qualified)
			add(
				"control_not_qualified",
				`control ${controlId} is not qualified: ${qualification.notes.join("; ") || "witnesses did not answer as required"}.`,
			);
	}
	for (const e of evidence) {
		if (e.verdict === "INDETERMINATE")
			add(
				"indeterminate_control",
				`control ${e.control_id} answered INDETERMINATE on ${e.subject.kind} ${e.subject.id}; nothing is concluded from it.`,
			);
		if (e.limits.unstable)
			add("unstable_control", `control ${e.control_id} answered differently on two passes of the same subject.`);
		if (e.limits.truncated)
			add(
				"truncated_output",
				`the output of control ${e.control_id} was truncated at ${e.limits.bytes_read} bytes; what it did not say was not read.`,
			);
		for (const exclusion of e.limits.exclusions)
			add("excluded_from_measure", `control ${e.control_id} excluded ${exclusion} from what it measured.`);
		for (const note of e.limits.notes) add("control_limit", `control ${e.control_id}: ${note}`);
		if ((e.baseline?.preexisting_findings ?? 0) > 0)
			add(
				"preexisting_findings_tolerated",
				`control ${e.control_id} reports ${e.baseline!.preexisting_findings} finding(s) the reference already carried; the tolerance let them stand.`,
			);
	}
	for (const entry of state.evidence) {
		if (!entry.valid)
			add(
				"invalidated_evidence",
				`evidence ${entry.evidence_id} (${entry.control_id}) no longer applies: ${entry.invalid_reason ?? "invalidated"}.`,
			);
	}
	if (state.stop_reason)
		add(
			"stopped_before_the_end",
			`the change stopped on ${state.stop_reason}${state.stop_detail ? `: ${state.stop_detail}` : ""}.`,
		);

	return {
		schema_version: 1,
		change_id: state.change_id,
		outcome: state.outcome,
		candidate: state.candidate
			? { candidate_id: state.candidate.candidate_id, manifest_digest: state.candidate.manifest_digest }
			: null,
		observations,
		judgments,
		residual_risks: risks,
	};
}
