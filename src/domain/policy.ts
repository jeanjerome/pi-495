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
export type EgressLocation = "on_machine" | "off_machine";

/**
 * A destination excerpts and prompts may be handed to. `location` is what tells a prompt that stays
 * on this machine from one handed to a third party, which is the exposure SEC-05 asks to reduce:
 * without it the list says who, never whether anything left.
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
	// The one provider this machine has configured, answering on 127.0.0.1: nothing leaves the machine
	// by default. A destination off the machine is written by configuration, never inherited.
	egress: [{ provider_id: "omlx", location: "on_machine" }],
	baseline: {
		compare_to_reference: true,
		tolerance: "no_aggravation",
		instability: "confirm_then_indeterminate",
		max_confirmations: 1,
	},
	stagnation_identical_candidates: 2,
	required_reviews: [],
};
