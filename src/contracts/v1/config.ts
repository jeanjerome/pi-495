/**
 * Contract v1 — the harness configuration file, `<data dir>/config.json`.
 *
 * Closed at every level: a key the schema does not name is refused rather than ignored, so a
 * misspelt setting is never mistaken for one that was applied. Every key is optional, since an
 * absent one takes its default; `baseline` is therefore partial, merged over the default policy.
 */
import { Type, type Static } from "typebox";
import { Closed, contractId, Identifier, NonNegativeInt, Revision } from "./common.ts";
import { BaselinePolicy } from "./protocol.ts";

/** A bound that allows nothing at 0. */
const PositiveInt = Type.Integer({ minimum: 1 });
const AdoptionRule = Closed(["kernel", "human"] as const);

const Budgets = Type.Object(
	{
		max_attempts: Type.Optional(PositiveInt),
		max_technical_retries: Type.Optional(NonNegativeInt),
		max_continuations: Type.Optional(NonNegativeInt),
		intervention_ms: Type.Optional(PositiveInt),
		increment_ms: Type.Optional(PositiveInt),
		tool_calls_per_intervention: Type.Optional(PositiveInt),
		feedback_bytes: Type.Optional(NonNegativeInt),
	},
	{ additionalProperties: false },
);

const Adoption = Type.Object(
	{
		mandate: Type.Optional(AdoptionRule),
		requirements: Type.Optional(AdoptionRule),
		/** The kernel always adopts the protocol; `human` is refused rather than silently replaced. */
		protocol: Type.Optional(Closed(["kernel"] as const)),
		design: Type.Optional(AdoptionRule),
	},
	{ additionalProperties: false },
);

const Policy = Type.Object(
	{
		policy_id: Type.Optional(Identifier),
		revision: Type.Optional(Revision),
		budgets: Type.Optional(Budgets),
		adoption: Type.Optional(Adoption),
		g5_human_acceptance: Type.Optional(Type.Boolean()),
		integration_enabled: Type.Optional(Type.Boolean()),
		baseline: Type.Optional(Type.Partial(BaselinePolicy, { additionalProperties: false })),
		/** 0 turns stagnation detection off. */
		stagnation_identical_candidates: Type.Optional(NonNegativeInt),
		required_reviews: Type.Optional(Type.Array(Type.String())),
	},
	{ additionalProperties: false },
);

export const HarnessConfigFile = Type.Object(
	{
		/** Lets an editor point at the published schema. */
		$schema: Type.Optional(Type.String()),
		policy: Type.Optional(Policy),
		isolation: Type.Optional(
			Type.Object({ allow_unconfined: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
		),
		human_origin: Type.Optional(
			Type.Object({ rpc_actor_env: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false }),
		),
		workspace_exclusions: Type.Optional(Type.Array(Type.String())),
		language: Type.Optional(Closed(["fr", "en"] as const)),
	},
	{ $id: contractId("harness-config"), additionalProperties: false },
);
export type HarnessConfigFile = Static<typeof HarnessConfigFile>;
