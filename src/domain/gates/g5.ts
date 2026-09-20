import type { Verdict } from "../../contracts/v1/common.ts";
import type { ChangeState, EvidenceEntry } from "../change/state.ts";
import type { ActivePolicy } from "../policy.ts";

export interface G5Result {
	verdict: "PASS" | "FAIL" | "INDETERMINATE";
	reasons: string[];
	retained: string[];
	ignored: string[];
	missing: string[];
	failed_requirements: string[];
	indeterminate_requirements: string[];
	next_action: string;
}

/**
 * G5 — acceptance. Deterministic combination of valid evidence, required reviews and human
 * decisions against the frozen protocol. FAIL and INDETERMINATE are both blocking and both kept
 * (RM-036, SA-032). No model is called (DEC-01).
 */
export function evaluateG5(state: ChangeState, policy: ActivePolicy): G5Result {
	const protocol = state.protocol!;
	const candidate = state.candidate!;
	const reasons: string[] = [];
	const retained: string[] = [];
	const ignored: string[] = [];
	const missing: string[] = [];
	const failed = new Set<string>();
	const indeterminate = new Set<string>();

	const usable: EvidenceEntry[] = [];
	for (const e of state.evidence) {
		const why = e.valid
			? e.subject_digest !== candidate.manifest_digest
				? "other candidate"
				: e.protocol_revision !== protocol.ref.revision
					? "other protocol revision"
					: state.environment_digest && e.environment_digest !== state.environment_digest
						? "other environment"
						: null
			: (e.invalid_reason ?? "invalidated");
		if (why) ignored.push(`${e.evidence_id}:${why}`);
		else usable.push(e);
	}
	const latestByControl = new Map<string, EvidenceEntry>();
	for (const e of usable) latestByControl.set(e.control_id, e);

	for (const o of protocol.obligations) {
		const rid = o.requirement.requirement_id;
		if (o.not_applicable_reason) continue;
		if (o.combination === "human_decision") {
			const d = state.human_decisions.find(
				(h) => h.valid && h.interaction === "IH-10" && h.subject.digest === candidate.manifest_digest,
			);
			if (!d) {
				missing.push(`human:${rid}`);
				reasons.push(`requirement ${rid}: human decision IH-10 pending`);
				indeterminate.add(rid);
			} else if (d.option_id !== "accept") {
				failed.add(rid);
				reasons.push(`requirement ${rid}: human decision ${d.option_id}`);
			} else retained.push(d.human_decision_id);
			continue;
		}
		const verdicts: Verdict[] = [];
		for (const cid of o.control_ids) {
			const e = latestByControl.get(cid);
			if (!e) {
				verdicts.push("NOT_RUN");
				missing.push(`${cid}:${rid}`);
				continue;
			}
			retained.push(e.evidence_id);
			verdicts.push(e.findings_blocking > 0 && e.verdict === "PASS" ? "FAIL" : e.verdict);
		}
		const outcome = combine(verdicts, o.combination === "any_pass" ? "any" : "all");
		if (outcome === "PASS") continue;
		if (!o.mandatory) {
			reasons.push(`optional requirement ${rid}: ${outcome}`);
			continue;
		}
		if (outcome === "FAIL") {
			failed.add(rid);
			reasons.push(`requirement ${rid}: FAIL (${describe(o.control_ids, latestByControl)})`);
		} else {
			indeterminate.add(rid);
			reasons.push(`requirement ${rid}: ${outcome} (${describe(o.control_ids, latestByControl)})`);
		}
	}

	for (const role of protocol.required_reviews) {
		const reviews = state.reviews.filter(
			(r) => r.valid && r.reviewer_role === role && r.subject_digest === candidate.manifest_digest,
		);
		if (reviews.length === 0) {
			missing.push(`review:${role}`);
			reasons.push(`required review ${role} missing`);
			indeterminate.add(`review:${role}`);
			continue;
		}
		const last = reviews[reviews.length - 1]!;
		retained.push(last.review_id);
		if (last.conclusion === "reject" || last.blocking_findings > 0) {
			failed.add(`review:${role}`);
			reasons.push(`review ${role} rejects the candidate (${last.blocking_findings} blocking findings)`);
		}
	}
	const validReviews = state.reviews.filter(
		(r) =>
			r.valid && r.subject_digest === candidate.manifest_digest && protocol.required_reviews.includes(r.reviewer_role),
	);
	const hasApprove = validReviews.some((r) => r.conclusion === "approve");
	const hasReject = validReviews.some((r) => r.conclusion === "reject");
	if (hasApprove && hasReject) {
		reasons.push(`contradictory required reviews: arbitration rule '${protocol.arbitration}' applies (RM-038)`);
		if (protocol.arbitration === "human_decision") {
			const arbitration = state.human_decisions.find(
				(h) => h.valid && h.interaction === "IH-08" && h.subject.digest === candidate.manifest_digest,
			);
			if (!arbitration) {
				missing.push("human:IH-08");
				indeterminate.add("reviews");
			} else if (arbitration.option_id === "accept") {
				for (const k of [...failed]) if (k.startsWith("review:")) failed.delete(k);
				retained.push(arbitration.human_decision_id);
			}
		}
	}

	if (policy.g5_human_acceptance) {
		const acceptance = state.human_decisions.find(
			(h) => h.valid && h.interaction === "IH-10" && h.subject.digest === candidate.manifest_digest,
		);
		if (!acceptance) {
			missing.push("human:IH-10");
			reasons.push("policy requires human acceptance (IH-10)");
			indeterminate.add("acceptance");
		} else if (acceptance.option_id !== "accept") {
			failed.add("acceptance");
			reasons.push(`human acceptance: ${acceptance.option_id}`);
		} else retained.push(acceptance.human_decision_id);
	}

	const failedList = [...failed];
	const indeterminateList = [...indeterminate];
	if (failedList.length === 0 && indeterminateList.length === 0)
		return {
			verdict: "PASS",
			reasons: [],
			retained: dedupe(retained),
			ignored,
			missing,
			failed_requirements: [],
			indeterminate_requirements: [],
			next_action:
				state.mandate?.integration === "local_branch" && policy.integration_enabled ? "integrate" : "close_accepted",
		};
	const humanPending = missing.some((m) => m.startsWith("human:"));
	let next: string;
	if (failedList.length > 0)
		next = state.budgets.attempts_used < state.budgets.max_attempts ? "correct" : "stop:attempts_exhausted";
	else if (humanPending) next = missing.includes("human:IH-08") ? "request_decision:IH-08" : "request_decision:IH-10";
	else next = "resolve_incident";
	return {
		verdict: failedList.length > 0 ? "FAIL" : "INDETERMINATE",
		reasons,
		retained: dedupe(retained),
		ignored,
		missing,
		failed_requirements: failedList,
		indeterminate_requirements: indeterminateList,
		next_action: next,
	};
}

function describe(controlIds: string[], latest: Map<string, EvidenceEntry>): string {
	return controlIds.map((c) => `${c}=${latest.get(c)?.verdict ?? "NOT_RUN"}`).join(", ");
}

/** all: every verdict must PASS; any: one PASS suffices. NOT_APPLICABLE is excluded from the calculation. */
export function combine(verdicts: Verdict[], mode: "all" | "any"): Verdict {
	const v = verdicts.filter((x) => x !== "NOT_APPLICABLE");
	if (v.length === 0) return verdicts.length === 0 ? "NOT_RUN" : "NOT_APPLICABLE";
	if (mode === "any") {
		if (v.includes("PASS")) return "PASS";
		if (v.includes("FAIL") && !v.some((x) => x === "INDETERMINATE" || x === "NOT_RUN")) return "FAIL";
		return v.includes("FAIL") ? "FAIL" : v.includes("INDETERMINATE") ? "INDETERMINATE" : "NOT_RUN";
	}
	if (v.includes("FAIL")) return "FAIL";
	if (v.includes("INDETERMINATE")) return "INDETERMINATE";
	if (v.includes("NOT_RUN")) return "NOT_RUN";
	return "PASS";
}

function dedupe(a: string[]): string[] {
	return [...new Set(a)];
}
