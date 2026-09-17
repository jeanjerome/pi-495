import { Type, type Static } from "typebox";
import { Closed, Digest, Identifier, NonNegativeInt, Verdict, contractId } from "./common.ts";
import { BASELINE_TOLERANCES, INSTABILITY_RULES, RequirementRef } from "./evidence.ts";

/**
 * Sensors the generic runner knows how to read. `jacoco-xml` reads the coverage report the test
 * control already wrote and judges only the lines the candidate introduced (QLT-04); it executes
 * no measurement of its own.
 */
export const PARSER_IDS = ["exit-code", "node-test", "junit-xml", "jacoco-xml"] as const;
export type ParserId = (typeof PARSER_IDS)[number];

export const ControlDefinition = Type.Object(
	{
		control_id: Identifier,
		version: Type.String({ minLength: 1 }),
		title: Type.String(),
		command: Type.Array(Type.String(), { minItems: 1 }),
		cwd: Type.String({ description: "relative to the workspace root" }),
		env_allowlist: Type.Array(Type.String()),
		env: Type.Record(Type.String(), Type.String()),
		timeout_ms: Type.Integer({ minimum: 1 }),
		parser: Closed(PARSER_IDS),
		report_path: Type.Union([Type.String(), Type.Null()]),
		network: Closed(["denied", "allowed"] as const),
		writable_paths: Type.Array(Type.String()),
		requirement_refs: Type.Array(RequirementRef),
		protected: Type.Boolean({ description: "the control definition files may not be modified by a producer" }),
		protected_paths: Type.Array(Type.String()),
	},
	{ $id: contractId("control-definition"), additionalProperties: false },
);
export type ControlDefinition = Static<typeof ControlDefinition>;

export const Qualification = Type.Object(
	{
		positive: Verdict,
		negative: Verdict,
		incident: Verdict,
		qualified: Type.Boolean(),
		environment_digest: Digest,
		notes: Type.Array(Type.String()),
		evidence_ids: Type.Optional(Type.Object(
			{ positive: Identifier, negative: Identifier, incident: Identifier },
			{ additionalProperties: false },
		)),
	},
	{ additionalProperties: false },
);
export type Qualification = Static<typeof Qualification>;

export const COMBINATIONS = ["all_pass", "any_pass", "human_decision"] as const;

export const Obligation = Type.Object(
	{
		requirement: RequirementRef,
		mandatory: Type.Boolean(),
		control_ids: Type.Array(Identifier),
		combination: Closed(COMBINATIONS),
		human_interaction: Type.Union([Type.Literal("IH-10"), Type.Null()]),
		not_applicable_reason: Type.Union([Type.String(), Type.Null()]),
	},
	{ additionalProperties: false },
);
export type Obligation = Static<typeof Obligation>;

/**
 * Ordered scale of what the controls already present on a target can decide (PRE-01): a file named
 * like a test, a case the target's own command discovers, a case it actually executes, and a control
 * able to detect the defect a requirement targets. Only the last level proves anything about a
 * requirement; the three below it are insufficiencies to report, not coverage.
 */
export const CAPABILITY_LEVELS = ["none", "file_present", "discoverable", "executed", "discriminating"] as const;
export type CapabilityLevel = (typeof CAPABILITY_LEVELS)[number];

export const ControlCapabilityDiagnosis = Type.Object(
	{
		stack: Type.String(),
		level: Closed(CAPABILITY_LEVELS),
		/** Files named like a test under the declared test roots of the reference. */
		test_files: NonNegativeInt,
		/** Cases the target's own command reports for the reference, qualification witnesses excluded; null while unobserved. */
		discovered: Type.Union([NonNegativeInt, Type.Null()]),
		/** Of those, the ones that ran instead of being skipped or left todo. */
		executed: Type.Union([NonNegativeInt, Type.Null()]),
		/** Mandatory requirements whose targeted defect no existing control detects. */
		undiscriminated_requirements: Type.Array(Identifier),
		/** Mandatory requirements whose oracle has not been observed yet. */
		unobserved_requirements: Type.Array(Identifier),
		notes: Type.Array(Type.String()),
	},
	{ additionalProperties: false },
);
export type ControlCapabilityDiagnosis = Static<typeof ControlCapabilityDiagnosis>;

/**
 * Pre-registered comparison to the reference (VER-08). What a preexisting defect is worth, and what
 * a control whose two passes diverge is worth, are frozen with the protocol: both are decided before
 * any control runs, never once a verdict is known and found inconvenient.
 */
export const BaselinePolicy = Type.Object(
	{
		/** Each control is run on the reference as well as on the candidate, in the same environment. */
		compare_to_reference: Type.Boolean(),
		tolerance: Closed(BASELINE_TOLERANCES),
		instability: Closed(INSTABILITY_RULES),
		/** Confirmation passes a divergence may cost. A bound, never a licence to run until green. */
		max_confirmations: NonNegativeInt,
	},
	{ $id: contractId("baseline-policy"), additionalProperties: false },
);
export type BaselinePolicy = Static<typeof BaselinePolicy>;

export const Protocol = Type.Object(
	{
		protocol_id: Identifier,
		change_id: Identifier,
		controls: Type.Array(ControlDefinition),
		qualifications: Type.Record(Type.String(), Qualification),
		capability_diagnosis: ControlCapabilityDiagnosis,
		obligations: Type.Array(Obligation),
		required_reviews: Type.Array(Type.String()),
		arbitration: Closed(["human_decision", "reject"] as const),
		baseline: BaselinePolicy,
		environment_digest: Digest,
	},
	{ $id: contractId("protocol"), additionalProperties: false },
);
export type Protocol = Static<typeof Protocol>;

export const Requirement = Type.Object(
	{
		requirement_id: Identifier,
		statement: Type.String({ minLength: 1 }),
		category: Type.String(),
		mandatory: Type.Boolean(),
		criterion: Type.String({ minLength: 1 }),
		source: Type.String(),
		contract_family: Type.Union([Type.String(), Type.Null()]),
		satisfied_by_reference: Type.Boolean({ description: "the reference already exhibits this behaviour, so a suite that stays green proves it; false means the requirement needs a control that fails on the reference" }),
	},
	{ additionalProperties: false },
);
export type Requirement = Static<typeof Requirement>;

export const RequirementsDocument = Type.Object(
	{
		change_id: Identifier,
		requirements: Type.Array(Requirement),
		assumptions: Type.Array(Type.String()),
		contract_families: Type.Record(Type.String(), Closed(["covered", "not_applicable", "to_instruct"] as const)),
	},
	{ $id: contractId("requirements"), additionalProperties: false },
);
export type RequirementsDocument = Static<typeof RequirementsDocument>;

export const Mandate = Type.Object(
	{
		change_id: Identifier,
		objective: Type.String({ minLength: 1 }),
		scope: Type.Array(Type.String()),
		out_of_scope: Type.Array(Type.String()),
		assumptions: Type.Array(Type.String()),
		open_questions: Type.Array(Type.Object({ id: Identifier, question: Type.String(), material: Type.Boolean(), answer: Type.Union([Type.String(), Type.Null()]) }, { additionalProperties: false })),
		allowed_paths: Type.Array(Type.String()),
		integration: Closed(["disabled", "local_branch"] as const),
		language: Closed(["fr", "en"] as const),
	},
	{ $id: contractId("mandate"), additionalProperties: false },
);
export type Mandate = Static<typeof Mandate>;

export const Design = Type.Object(
	{
		change_id: Identifier,
		summary: Type.String({ minLength: 1 }),
		components: Type.Array(Type.String()),
		interfaces: Type.Array(Type.String()),
		alternatives: Type.Array(Type.String()),
		risks: Type.Array(Type.String()),
		requirement_ids: Type.Array(Identifier),
		compatible_with_mandate: Type.Boolean(),
		executable: Type.Boolean(),
	},
	{ $id: contractId("design"), additionalProperties: false },
);
export type Design = Static<typeof Design>;
