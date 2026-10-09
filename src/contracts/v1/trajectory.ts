/**
 * Contract v1 — the trajectory document the owner writes to conduct a program of several increments:
 * the increments and their dependencies, the milestones that gather them, and the requirements the
 * program answers for as a whole; and, when it brings a project to standards, the accepted survey it
 * starts from and the gaps of that survey each increment removes; when it migrates an architecture, the
 * accepted survey whose owner chose the target, the rules of its map each step removes and the transition
 * of each step. It is read and kept, never executed.
 */
import { Type, type Static } from "typebox";
import { Closed, contractId, Identifier } from "./common.ts";

const Text = Type.String({ minLength: 1 });

/** A due date, as an exception writes the last day it tolerates its gap. */
const Day = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

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
		/** The rules of the map of the cited migration the step removes; their counts are read in the survey, never here. */
		removes: Type.Optional(Type.Array(Text)),
		/**
		 * How a step of a migration moves from the old path to the new one. A step of a migration that lacks one
		 * of the four texts is refused naming the step and what it lacks.
		 */
		transition: Type.Optional(
			Type.Object(
				{
					/** The interfaces the step preserves. */
					contract: Type.Optional(Text),
					/** Where the old and the new path live side by side. */
					coexistence: Type.Optional(Text),
					compatibility: Type.Optional(Text),
					rollback: Type.Optional(Text),
				},
				{ additionalProperties: false },
			),
		),
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
						due: Type.Optional(Day),
						reason: Text,
					},
					{ additionalProperties: false },
				),
			),
		),
	},
	{ additionalProperties: false },
);

const TrajectoryMigration = Type.Object(
	{
		/** The change whose accepted survey of the architecture, and the alternative its owner chose, the migration starts from. */
		change_id: Identifier,
		/** Each sets a violated rule of the map aside from the migration, for the reason it states. */
		scope_decisions: Type.Optional(
			Type.Array(Type.Object({ rule_id: Text, reason: Text }, { additionalProperties: false })),
		),
		/**
		 * Each tolerates a violated rule of the map until its due date, under the owner it names, for the reason it
		 * states. An exception without its owner or its due date is refused naming its rule.
		 */
		exceptions: Type.Optional(
			Type.Array(
				Type.Object(
					{ rule_id: Text, owner: Type.Optional(Type.String()), due: Type.Optional(Day), reason: Text },
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
		migration: Type.Optional(TrajectoryMigration),
	},
	{ $id: contractId("trajectory"), additionalProperties: false },
);
export type TrajectoryDocument = Static<typeof TrajectoryDocument>;
