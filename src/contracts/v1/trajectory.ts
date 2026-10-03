/**
 * Contract v1 — the trajectory document the owner writes to conduct a program of several increments:
 * the increments and their dependencies, the milestones that gather them, and the requirements the
 * program answers for as a whole. It is read and kept, never executed.
 */
import { Type, type Static } from "typebox";
import { Closed, contractId, Identifier } from "./common.ts";

const Text = Type.String({ minLength: 1 });

const TrajectoryIncrement = Type.Object(
	{
		increment_id: Identifier,
		title: Text,
		/** What the increment brings the owner. */
		value: Text,
		/** What must hold for the increment to be done; its change's request carries it. */
		closure_criterion: Text,
		depends_on: Type.Array(Identifier),
		/** The global requirements the increment carries. */
		requirement_ids: Type.Array(Identifier),
		kind: Type.Optional(Closed(["functional", "preparatory", "remediation"] as const)),
	},
	{ additionalProperties: false },
);

const TrajectoryMilestone = Type.Object(
	{
		milestone_id: Identifier,
		title: Text,
		increment_ids: Type.Array(Identifier, { minItems: 1 }),
		/** The global requirements the milestone verifies itself, on the integrated project. */
		global_requirement_ids: Type.Array(Identifier),
		/** The milestone whose passing closes the program. */
		final: Type.Boolean(),
	},
	{ additionalProperties: false },
);

const TrajectoryGlobalRequirement = Type.Object(
	{
		requirement_id: Identifier,
		/** Sets the requirement aside from the program, for the reason it states. */
		scope_decision: Type.Optional(Type.Object({ reason: Text }, { additionalProperties: false })),
	},
	{ additionalProperties: false },
);

export const TrajectoryDocument = Type.Object(
	{
		/** Lets an editor point at the published schema. */
		$schema: Type.Optional(Type.String()),
		title: Text,
		increments: Type.Array(TrajectoryIncrement, { minItems: 1 }),
		milestones: Type.Array(TrajectoryMilestone),
		global_requirements: Type.Array(TrajectoryGlobalRequirement),
	},
	{ $id: contractId("trajectory"), additionalProperties: false },
);
export type TrajectoryDocument = Static<typeof TrajectoryDocument>;
