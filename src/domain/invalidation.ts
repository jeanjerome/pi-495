import { GATES, type GateId, type Phase } from "../contracts/v1/common.ts";
import type { ArtifactKind, ChangeState } from "./change/state.ts";

export type InvalidationCause =
	| { kind: "artifact_revised"; artifact: ArtifactKind }
	| { kind: "candidate_replaced" }
	| { kind: "environment_changed" }
	| { kind: "destination_advanced"; combined_changed: boolean }
	| { kind: "evidence_lost"; evidence_id: string }
	| { kind: "resolution_revoked"; question_id: string };

export interface InvalidationPlan {
	reason: string;
	gates: GateId[];
	evidence: string[];
	reviews: string[];
	human_decisions: string[];
	rollback_phase: Phase | null;
}

function from(gate: GateId): GateId[] {
	return GATES.slice(GATES.indexOf(gate));
}

/**
 * Conservative invalidation (spec §6.4): without a proof of independence, everything downstream of
 * the changed element is invalidated. Historical events are never rewritten; only the current
 * validity is changed.
 */
export function invalidationFor(state: ChangeState, cause: InvalidationCause): InvalidationPlan {
	const allEvidence = state.evidence.filter((e) => e.valid).map((e) => e.evidence_id);
	const allReviews = state.reviews.filter((r) => r.valid).map((r) => r.review_id);
	const candidateDecisions = state.human_decisions
		.filter((d) => d.valid && (d.interaction === "IH-10" || d.interaction === "IH-11" || d.interaction === "IH-08"))
		.map((d) => d.human_decision_id);
	// What the owner answered about a requirement no control can judge holds for those requirements
	// only: the requirements revised, it is asked again.
	const verifiabilityDecisions = state.human_decisions
		.filter((d) => d.valid && d.interaction === "IH-04")
		.map((d) => d.human_decision_id);
	// Everything from G0 on, and every human decision but the answers to the questions, the budget
	// extensions and the reconciliations of a Git effect: an extension raises the attempt budget, which
	// the change spends whatever its mandate, and a reconciliation records whether an effect was applied,
	// which an integration fallback leaves standing. Revoking either would say revoked a decision whose
	// effect holds.
	const fromMandate = (reason: string): InvalidationPlan => ({
		reason,
		gates: from("G0"),
		evidence: allEvidence,
		reviews: allReviews,
		human_decisions: state.human_decisions
			.filter((d) => d.valid && d.interaction !== "IH-01" && d.interaction !== "IH-07" && d.interaction !== "IH-12")
			.map((d) => d.human_decision_id),
		rollback_phase: "scoping",
	});
	switch (cause.kind) {
		case "artifact_revised":
			switch (cause.artifact) {
				case "mandate":
					return fromMandate("mandate revised");
				case "requirements":
					return {
						reason: "requirements revised (RM-010, SA-034)",
						gates: from("G1"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: [...candidateDecisions, ...verifiabilityDecisions],
						rollback_phase: "specification",
					};
				// The preparation froze the tests the protocol judges by: written again, it is qualified and
				// frozen again, as a revised protocol is.
				case "preparation":
					return {
						reason: "preparation revised",
						gates: from("G2"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: candidateDecisions,
						rollback_phase: "qualification",
					};
				case "protocol":
					return {
						reason: "protocol revised",
						gates: from("G2"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: candidateDecisions,
						rollback_phase: "qualification",
					};
				case "design":
					return {
						reason: "design revised",
						gates: from("G3"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: candidateDecisions,
						rollback_phase: "design",
					};
				default:
					return {
						reason: `${cause.artifact} revised`,
						gates: [],
						evidence: [],
						reviews: [],
						human_decisions: [],
						rollback_phase: null,
					};
			}
		case "candidate_replaced":
			return {
				reason: "candidate replaced by a new attempt",
				gates: from("G4"),
				evidence: [],
				reviews: [],
				human_decisions: candidateDecisions,
				rollback_phase: "implementation",
			};
		case "environment_changed":
			return {
				reason: "verification environment changed (RM-076)",
				gates: from("G2"),
				evidence: allEvidence,
				reviews: [],
				human_decisions: [],
				rollback_phase: "qualification",
			};
		case "destination_advanced":
			return cause.combined_changed
				? {
						reason: "destination advanced and combined tree differs (RM-054)",
						gates: from("G4"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: candidateDecisions,
						rollback_phase: "verifying",
					}
				: {
						reason: "destination advanced, same combined tree",
						gates: ["G6"],
						evidence: [],
						reviews: [],
						human_decisions: [],
						rollback_phase: "integration",
					};
		case "evidence_lost": {
			const consuming = GATES.filter((g) => state.gates[g]?.evidence_retained.includes(cause.evidence_id));
			const first = consuming[0];
			return {
				reason: `evidence ${cause.evidence_id} lost or corrupted (RM-070)`,
				gates: first ? from(first) : [],
				evidence: [],
				reviews: [],
				human_decisions: first ? candidateDecisions : [],
				rollback_phase: null,
			};
		}
		// A resolution revoked undoes what G0 adopted on its faith, as a mandate revised does (DEC-06).
		case "resolution_revoked":
			return fromMandate(`resolution of question ${cause.question_id} revoked`);
		default: {
			const never: never = cause;
			throw new Error(`unknown cause ${JSON.stringify(never)}`);
		}
	}
}
