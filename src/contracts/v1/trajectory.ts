/**
 * Contract v1 — the trajectory document the owner writes to conduct a program of several increments:
 * the increments and their dependencies, the milestones that gather them, and the requirements the
 * program answers for as a whole; and, when it brings a project to standards, the accepted survey it
 * starts from and the gaps of that survey each increment removes. It is read and kept, never executed.
 */
import { Type, type Static } from "typebox";
import { Closed, contractId, Identifier } from "./common.ts";

const Text = Type.String({ minLength: 1 });

/** A gap of the cited survey: a rule of its adopted referential, the module that holds it, and the code it lies in. */
const GapProperties = {
	rule_id: Identifier,
	/** Null for the violations no measured source root holds. */
	module: Type.Union([Text, Type.Null()]),
	/** Proprietary when absent. */
	authorship: Type.Optional(Closed(["proprietary", "generated"] as const)),
};

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
		/** The gaps of the cited survey the increment removes; their counts are read in the survey, never here. */
		gaps: Type.Optional(Type.Array(Type.Object(GapProperties, { additionalProperties: false }))),
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

const TrajectoryBaseline = Type.Object(
	{
		/** The change whose accepted survey the trajectory starts from. */
		change_id: Identifier,
		/** Each sets a gap of that survey aside from the program, for the reason it states. */
		scope_decisions: Type.Optional(
			Type.Array(Type.Object({ ...GapProperties, reason: Text }, { additionalProperties: false })),
		),
		/**
		 * Each tolerates a gap of that survey until its due date, under the owner it names, for the reason it
		 * states. An exception without its owner or its due date is refused naming its gap.
		 */
		exceptions: Type.Optional(
			Type.Array(
				Type.Object(
					{
						...GapProperties,
						owner: Type.Optional(Type.String()),
						/** The last day the exception tolerates its gap. */
						due: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
						reason: Text,
					},
					{ additionalProperties: false },
				),
			),
		),
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
		baseline: Type.Optional(TrajectoryBaseline),
	},
	{ $id: contractId("trajectory"), additionalProperties: false },
);
export type TrajectoryDocument = Static<typeof TrajectoryDocument>;
