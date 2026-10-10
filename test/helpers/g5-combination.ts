import type { Verdict } from "../../src/contracts/v1/common.ts";
import type { EvidenceEntry, FrozenProtocol } from "../../src/domain/change/state.ts";
import { evaluateG5, type G5Result } from "../../src/domain/gates/g5.ts";
import { Runner, candidate } from "./change-fixture.ts";

/** The rule an obligation combines the verdicts of its controls under, as the Lean reference names it. */
export type CombinationMode = "all" | "any";

/** One obligation of the protocol: its rule, whether it is mandatory, and the verdict each of its controls answered. */
export interface ObligationCase {
	mandatory: boolean;
	mode: CombinationMode;
	verdicts: readonly Verdict[];
}

/** What G5 says of one requirement: kept, failed, or held indeterminate. */
export type RequirementOutcome = "PASS" | "FAIL" | "INDETERMINATE";

const CANDIDATE = candidate("verdict-combination");
const deciding = new Runner().toDeciding(CANDIDATE);
const STATE = deciding.s;
const FROZEN: FrozenProtocol = STATE.protocol!;
/** Every other condition of G5 held satisfied: no acceptance run, no review, no formal package, no human acceptance. */
const POLICY = { ...deciding.policy, g5_human_acceptance: false, formal_control: null };

const requirementId = (index: number): string => `R${index + 1}`;
const controlId = (obligation: number, control: number): string => `o${obligation + 1}k${control + 1}`;

/**
 * Runs G5 on a candidate whose obligations are the given ones and nothing else: a control that answered NOT_RUN
 * has no evidence on the candidate, every other answered with the given verdict and no blocking finding.
 */
export function observeG5(obligations: readonly ObligationCase[], g5: typeof evaluateG5 = evaluateG5): G5Result {
	const evidence: EvidenceEntry[] = [];
	const protocol: FrozenProtocol = {
		...FROZEN,
		obligations: obligations.map((o, j) => ({
			requirement: { requirement_id: requirementId(j), revision: 1 },
			mandatory: o.mandatory,
			control_ids: o.verdicts.map((_, i) => controlId(j, i)),
			combination: o.mode === "any" ? "any_pass" : "all_pass",
			human_interaction: null,
			not_applicable_reason: null,
		})),
		control_ids: obligations.flatMap((o, j) => o.verdicts.map((_, i) => controlId(j, i))),
		required_reviews: [],
		acceptance_recipe_control_id: null,
		formal: null,
	};
	obligations.forEach((o, j) => {
		o.verdicts.forEach((verdict, i) => {
			if (verdict === "NOT_RUN") return;
			evidence.push({
				evidence_id: `evd_${controlId(j, i)}`,
				control_id: controlId(j, i),
				control_version: "1",
				requirement_ids: [requirementId(j)],
				subject_digest: CANDIDATE.manifest_digest,
				protocol_id: FROZEN.ref.protocol_id,
				protocol_revision: FROZEN.ref.revision,
				environment_digest: STATE.environment_digest ?? FROZEN.environment_digest,
				verdict,
				valid: true,
				invalid_reason: null,
				recorded_at: STATE.updated_at,
				findings_blocking: 0,
			});
		});
	});
	return g5({ ...STATE, evidence, reviews: [], human_decisions: [] }, protocol, CANDIDATE, POLICY);
}

/** What G5 said of the requirement of the obligation at `index`. */
export function requirementOutcome(result: G5Result, index: number): RequirementOutcome {
	const rid = requirementId(index);
	if (result.failed_requirements.includes(rid)) return "FAIL";
	if (result.indeterminate_requirements.includes(rid)) return "INDETERMINATE";
	return "PASS";
}

/** What G5 makes of the combination of a mandatory obligation: PASS keeps it, FAIL fails it, anything else holds it. */
export function mandatoryOutcome(combined: Verdict): RequirementOutcome {
	if (combined === "PASS" || combined === "FAIL") return combined;
	return "INDETERMINATE";
}
