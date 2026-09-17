import { Type, type Static } from "typebox";
import { Closed, Digest, Identifier, Verdict, contractId } from "./common.ts";
import { RequirementRef } from "./evidence.ts";

export const PARSER_IDS = ["exit-code", "node-test", "junit-xml"] as const;
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

export const Protocol = Type.Object(
	{
		protocol_id: Identifier,
		change_id: Identifier,
		controls: Type.Array(ControlDefinition),
		qualifications: Type.Record(Type.String(), Qualification),
		obligations: Type.Array(Obligation),
		required_reviews: Type.Array(Type.String()),
		arbitration: Closed(["human_decision", "reject"] as const),
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
