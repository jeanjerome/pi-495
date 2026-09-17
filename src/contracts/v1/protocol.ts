import { Type, type Static } from "typebox";
import { Closed, Digest, Identifier, NonNegativeInt, Verdict, contractId } from "./common.ts";
import { BASELINE_TOLERANCES, INSTABILITY_RULES, RequirementRef } from "./evidence.ts";

/**
 * Sensors the generic runner knows how to read. `jacoco-xml` reads the coverage report the test
 * control already wrote and judges only the lines the candidate introduced (QLT-04); it executes
 * no measurement of its own. `java-imports` reads the package and import declarations of the Java
 * sources and judges them against the frozen architecture rules (ARC-04, CON-03); it compiles
 * nothing. `pitest-xml` reads the mutation report of a run scoped to the classes the candidate
 * modified and judges the mutants sitting on the lines it wrote (VER-04). Each is native to its
 * ecosystem, behind the one finding envelope.
 */
export const PARSER_IDS = ["exit-code", "node-test", "junit-xml", "jacoco-xml", "java-imports", "pitest-xml"] as const;
export type ParserId = (typeof PARSER_IDS)[number];

/**
 * Sensors that judge what the subject introduced instead of the state of the whole tree. A question
 * every requirement asks, whatever its category: a requirement whose lines no test exercises is not
 * demonstrated by a suite that stayed green, a responsibility placed in a forbidden module is not
 * demonstrated either, and neither is a line whose mutation no test notices. An improvement
 * elsewhere never compensates for any of the three (QLT-04, ARC-04, VER-04).
 */
export const DIFFERENTIAL_PARSER_IDS = ["jacoco-xml", "java-imports", "pitest-xml"] as const;

export function isDifferentialParser(parser: ParserId): boolean {
	return (DIFFERENTIAL_PARSER_IDS as readonly string[]).includes(parser);
}

/** What a `scope_argument` puts the class patterns of the subject in place of. */
export const SCOPE_PLACEHOLDER = "{classes}";

export const STRUCTURE_RULE_KINDS = ["forbidden_dependency", "no_cycle"] as const;
export type StructureRuleKind = (typeof STRUCTURE_RULE_KINDS)[number];

/**
 * An architecture rule a structural sensor applies (ARC-04, CON-03): what it forbids, where it
 * applies, and the explanation it is opposable by. It is frozen with the protocol rather than kept
 * in the tree or in the producer's context: a boundary the producer can edit is not a boundary, and
 * moving one deliberately means adopting another protocol revision.
 */
export const StructureRule = Type.Object(
	{
		rule_id: Identifier,
		kind: Closed(STRUCTURE_RULE_KINDS),
		/** Why this boundary holds, stated from the target's own declarations. */
		statement: Type.String({ minLength: 1 }),
		/** Workspace-relative source roots the rule applies to. */
		scope: Type.Array(Type.String()),
		/** Package prefixes a source in scope must not import; a trailing `.` names a family. */
		forbidden: Type.Array(Type.String()),
	},
	{ $id: contractId("structure-rule"), additionalProperties: false },
);
export type StructureRule = Static<typeof StructureRule>;

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
		/** Architecture rules a structural sensor applies; empty for every other sensor. */
		structure_rules: Type.Array(StructureRule),
		/**
		 * Argument that scopes an expensive control to what the subject introduced, `{classes}`
		 * replaced by the class patterns derived from the frozen candidate. Null for a control that
		 * judges the whole tree. A subject with nothing to scope is not run at all: a mutation
		 * analysis nobody could scope would spend the budget of one change on the whole tree.
		 */
		scope_argument: Type.Union([Type.String(), Type.Null()]),
		/** `loopback` is the process reaching itself: a forked worker talking back, never another host. */
		network: Closed(["denied", "loopback", "allowed"] as const),
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
