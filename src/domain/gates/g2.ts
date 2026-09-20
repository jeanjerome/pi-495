import type { Protocol } from "../../contracts/v1/protocol.ts";
import type { ChangeState } from "../change/state.ts";
import type { ActivePolicy } from "../policy.ts";

export interface G2Result {
	verdict: "PASS" | "FAIL" | "INDETERMINATE";
	reasons: string[];
	uncovered_requirements: string[];
	missing_capabilities: string[];
	next_action: string;
}

/**
 * G2 — verifiability. Every mandatory obligation is covered by a qualified control or an assigned
 * human decision; the protocol environment matches the current environment. The product may still
 * fail the controls: only the sensors are judged here (RM-014, RM-015, PRE-03).
 */
export function evaluateG2(state: ChangeState, protocol: Protocol, policy: ActivePolicy): G2Result {
	const reasons: string[] = [];
	const uncovered: string[] = [];
	const missing: string[] = [];
	const known = new Set(state.requirement_ids);
	const controls = new Map(protocol.controls.map((c) => [c.control_id, c] as const));
	if (state.environment_digest && protocol.environment_digest !== state.environment_digest)
		reasons.push("protocol environment digest differs from the current environment");
	const obligated = new Set<string>();
	for (const o of protocol.obligations) {
		const rid = o.requirement.requirement_id;
		obligated.add(rid);
		if (!known.has(rid)) {
			reasons.push(`obligation references unknown requirement ${rid}`);
			continue;
		}
		if (o.not_applicable_reason) {
			if (!o.not_applicable_reason.trim())
				reasons.push(`requirement ${rid}: empty non-applicability justification (RM-017)`);
			continue;
		}
		if (o.combination === "human_decision" || o.human_interaction) {
			if (o.human_interaction !== "IH-10")
				reasons.push(`requirement ${rid}: human decision assigned without interaction`);
			continue;
		}
		if (o.control_ids.length === 0) {
			uncovered.push(rid);
			reasons.push(`requirement ${rid} has no control and no assigned human decision (RM-011)`);
			continue;
		}
		for (const cid of o.control_ids) {
			const control = controls.get(cid);
			if (!control) {
				reasons.push(`requirement ${rid}: control ${cid} is not defined`);
				missing.push(cid);
				continue;
			}
			const q = protocol.qualifications[cid];
			if (!q) {
				reasons.push(`control ${cid} is not qualified (no positive/negative/incident witness)`);
				missing.push(cid);
				continue;
			}
			if (q.positive !== "PASS") reasons.push(`control ${cid}: positive witness gave ${q.positive}, expected PASS`);
			if (q.negative !== "FAIL") reasons.push(`control ${cid}: negative witness gave ${q.negative}, expected FAIL`);
			if (q.incident !== "INDETERMINATE")
				reasons.push(`control ${cid}: sensor incident gave ${q.incident}, expected INDETERMINATE`);
			if (q.environment_digest !== protocol.environment_digest)
				reasons.push(`control ${cid}: qualified in another environment`);
			if (!q.qualified) reasons.push(`control ${cid}: qualification not adopted`);
			if (control.timeout_ms <= 0) reasons.push(`control ${cid}: timeout is required`);
		}
	}
	for (const rid of state.mandatory_requirement_ids)
		if (!obligated.has(rid)) {
			uncovered.push(rid);
			reasons.push(`mandatory requirement ${rid} has no obligation`);
		}
	for (const review of policy.required_reviews)
		if (!protocol.required_reviews.includes(review))
			reasons.push(`policy requires review ${review} which the protocol does not schedule`);
	if (reasons.length === 0)
		return {
			verdict: "PASS",
			reasons: [],
			uncovered_requirements: [],
			missing_capabilities: [],
			next_action: "design_change",
		};
	const next =
		missing.length > 0 || uncovered.length > 0 ? "prepare_capabilities_or_assign_human_decision" : "revise_protocol";
	return {
		verdict: "FAIL",
		reasons: [...new Set(reasons)],
		uncovered_requirements: [...new Set(uncovered)],
		missing_capabilities: [...new Set(missing)],
		next_action: next,
	};
}
