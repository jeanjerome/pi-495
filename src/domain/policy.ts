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

/** Where a model sits relative to the machine 495 runs on (SEC-05), read from its address. */
export type ModelLocation = "on_machine" | "off_machine";

/**
 * Reads the host of the address Pi holds for a model, without resolving it. Only `localhost`,
 * `127.0.0.0/8` and `::1` are on this machine; an address that is absent or unreadable, or a name
 * that merely looks like loopback, is off it, so a doubt is announced rather than kept silent. The
 * URL parser normalizes IPv4 shorthands such as `127.1` before the host is read.
 */
export function locateModel(baseUrl: string | undefined): ModelLocation {
	let host: string;
	try {
		host = new URL(baseUrl ?? "").hostname;
	} catch {
		return "off_machine";
	}
	return host === "localhost" || host === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(host) ? "on_machine" : "off_machine";
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
	baseline: {
		compare_to_reference: true,
		tolerance: "no_aggravation",
		instability: "confirm_then_indeterminate",
		max_confirmations: 1,
	},
	stagnation_identical_candidates: 2,
	required_reviews: [],
};
