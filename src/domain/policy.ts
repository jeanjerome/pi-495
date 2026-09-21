/** Active policy: configured before execution, versioned, never modified by a producer. */
import type { BaselinePolicy } from "../contracts/v1/protocol.ts";

/** Bounds applied by the controller, never by a producer (DEC-03). */
export interface Budgets {
	max_attempts: number;
	max_technical_retries: number;
	/**
	 * How many times a producer cut short by `intervention_ms` may resume on its own workspace
	 * before the candidate is frozen as it stands. A continuation is not a new attempt: nothing is
	 * rebuilt from the reference and no attempt budget is consumed.
	 */
	max_continuations: number;
	intervention_ms: number;
	increment_ms: number;
	tool_calls_per_intervention: number;
	feedback_bytes: number;
}

export type AdoptionRule = "kernel" | "human";

/** Where a declared destination sits relative to the machine 495 runs on (SEC-05). */
export const EGRESS_LOCATIONS = ["on_machine", "off_machine"] as const;
export type EgressLocation = (typeof EGRESS_LOCATIONS)[number];

/**
 * A destination excerpts and prompts may be handed to. `location` records what the owner declared
 * about where it sits — not what the harness measured: 495 composes neither address nor headers,
 * and a provider named here could be repointed at a remote host without it noticing. It is the
 * owner's statement of exposure, opposable to them, and no more than that.
 */
export interface DeclaredEgress {
	provider_id: string;
	location: EgressLocation;
}

export interface ActivePolicy {
	policy_id: string;
	revision: number;
	budgets: Budgets;
	adoption: {
		mandate: AdoptionRule;
		requirements: AdoptionRule;
		protocol: "kernel";
		design: AdoptionRule;
	};
	g5_human_acceptance: boolean;
	integration_enabled: boolean;
	/**
	 * Destinations excerpts and prompts may leave for (SEC-05). 495 never calls a model itself: the
	 * worker reaches the provider Pi resolved for it, and is the one process exempt from network
	 * confinement in order to (D-11). That exemption says what is permitted; this list says what goes
	 * out. A provider absent from it is refused before an intervention starts.
	 */
	egress: DeclaredEgress[];
	/** Frozen with the protocol at G2: how the candidate is compared to the reference (VER-08). */
	baseline: BaselinePolicy;
	stagnation_identical_candidates: number;
	required_reviews: string[];
}

export const DEFAULT_POLICY: ActivePolicy = {
	policy_id: "default",
	revision: 1,
	budgets: {
		max_attempts: 3,
		max_technical_retries: 2,
		max_continuations: 3,
		intervention_ms: 20 * 60_000,
		increment_ms: 120 * 60_000,
		tool_calls_per_intervention: 100,
		feedback_bytes: 64 * 1024,
	},
	adoption: { mandate: "kernel", requirements: "kernel", protocol: "kernel", design: "kernel" },
	g5_human_acceptance: false,
	integration_enabled: false,
	// The kernel knows no machine, so it declares no destination. What this installation may reach is
	// a configuration fact, and `extension/config.ts` holds it.
	egress: [],
	baseline: {
		compare_to_reference: true,
		tolerance: "no_aggravation",
		instability: "confirm_then_indeterminate",
		max_confirmations: 1,
	},
	stagnation_identical_candidates: 2,
	required_reviews: [],
};

/**
 * Why a destination may not be handed excerpts and prompts, or `null` when the policy declares it
 * (SEC-05). 495 never calls a model itself: the worker reaches the provider its host resolved, and
 * is the one process exempt from network confinement in order to (D-11). That exemption says what
 * is permitted; this list says what goes out.
 *
 * The comparison is exact — no pattern, no prefix, no wildcard — so it can refuse a destination it
 * does not know but can never admit one by resemblance.
 */
export function undeclaredEgressReason(policy: ActivePolicy, providerId: string): string | null {
	if (policy.egress.some((d) => d.provider_id === providerId)) return null;
	if (policy.egress.length === 0)
		return "no egress destination is declared, so no intervention may hand excerpts or prompts to a model";
	return `${providerId} is not declared in policy.egress; declared destinations: ${policy.egress.map((d) => d.provider_id).join(", ")}`;
}
