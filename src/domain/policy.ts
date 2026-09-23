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
		// Which of the two per-intervention bounds falls first depends on the tool-call rate, and the rate
		// depends on the model and on the target: the two coincide at 5 calls a minute. Measured on a
		// minimal contract case, `anthropic/claude-sonnet-5` ran 16.0 calls a minute, so its call bound
		// falls first, after 6 min 15 s. `omlx/qwen3.8-27b-oq8e` ran 4.6 over the whole change, so its
		// duration falls first, near 92 calls; but its specification alone ran 5.3, where the call bound
		// falls first. No intervention of that case went past 8 calls or 2 minutes: it says which bound
		// falls first, not which value a long change needs, so neither value moves on it.
		// `scripts/measure-budgets.ts` reads these rates back from a kept dossier.
		//
		// Reached, the duration suspends the intervention, and the producer resumes on its own workspace
		// up to `max_continuations` times without the owner.
		intervention_ms: 20 * 60_000,
		// Reached, the kernel starts no further intervention on the change; it cuts none that is running.
		// Both measured changes used under 5 minutes of it, so the per-intervention bounds fall long
		// before it, and nothing measured bears on its value.
		increment_ms: 120 * 60_000,
		// Reached, whatever the role, the change stops under `budget_exhausted` until its owner resumes
		// it. On a provider billed per token each resume is new spending, so this bound waits for the
		// owner instead of resuming on its own the way the duration does.
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

/** How many declared destinations a refusal names before it counts the rest. */
const NAMED_IN_REFUSAL = 8;

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
	// Naming a few is what makes the refusal actionable; naming all of them would put a whole
	// declaration into a message that travels to the display, the structured entries and the dossier.
	const shown = policy.egress.slice(0, NAMED_IN_REFUSAL).map((d) => d.provider_id);
	const rest = policy.egress.length - shown.length;
	return (
		`${providerId} is not declared in policy.egress; declared destinations: ${shown.join(", ")}` +
		`${rest > 0 ? `, and ${rest} more` : ""}. ` +
		"The declaration is read once at startup, so a new one takes effect in a new session."
	);
}
