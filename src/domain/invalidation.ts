import type { GateId, HumanInteraction, Phase } from "../contracts/v1/common.ts";
import type { ArtifactKind, ChangeState } from "./change/state.ts";

export type InvalidationCause =
	| { kind: "artifact_revised"; artifact: ArtifactKind }
	| { kind: "candidate_replaced" }
	| { kind: "environment_changed" }
	| { kind: "destination_advanced"; combined_changed: boolean }
	| { kind: "evidence_lost"; evidence_id: string }
	| { kind: "authorization_revoked"; human_decision_id: string; interaction: HumanInteraction };

export interface InvalidationPlan {
	reason: string;
	gates: GateId[];
	evidence: string[];
	reviews: string[];
	human_decisions: string[];
	rollback_phase: Phase | null;
}

const ORDER: GateId[] = ["G0", "G1", "G2", "G3", "G4", "G5", "G6"];

function from(gate: GateId): GateId[] {
	return ORDER.slice(ORDER.indexOf(gate));
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
	switch (cause.kind) {
		case "artifact_revised":
			switch (cause.artifact) {
				case "mandate":
					return {
						reason: "mandate revised",
						gates: from("G0"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: state.human_decisions
							.filter((d) => d.valid && d.interaction !== "IH-01")
							.map((d) => d.human_decision_id),
						rollback_phase: "clarifying",
					};
				case "requirements":
					return {
						reason: "requirements revised (RM-010, SA-034)",
						gates: from("G1"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: candidateDecisions,
						rollback_phase: "specifying",
					};
				case "protocol":
					return {
						reason: "protocol revised",
						gates: from("G2"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: candidateDecisions,
						rollback_phase: "verification_design",
					};
				case "design":
					return {
						reason: "design revised",
						gates: from("G3"),
						evidence: allEvidence,
						reviews: allReviews,
						human_decisions: candidateDecisions,
						rollback_phase: "designing",
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
				rollback_phase: "implementing",
			};
		case "environment_changed":
			return {
				reason: "verification environment changed (RM-076)",
				gates: from("G2"),
				evidence: allEvidence,
				reviews: [],
				human_decisions: [],
				rollback_phase: "verification_design",
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
						rollback_phase: "integrating",
					};
		case "evidence_lost": {
			const consuming = ORDER.filter((g) => state.gates[g]?.evidence_retained.includes(cause.evidence_id));
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
		case "authorization_revoked":
			return {
				reason: `authorization ${cause.human_decision_id} revoked`,
				gates:
					cause.interaction === "IH-11"
						? ["G6"]
						: cause.interaction === "IH-10" || cause.interaction === "IH-08"
							? from("G5")
							: [],
				evidence: [],
				reviews: [],
				human_decisions: [],
				rollback_phase: null,
			};
		default: {
			const never: never = cause;
			throw new Error(`unknown cause ${JSON.stringify(never)}`);
		}
	}
}
