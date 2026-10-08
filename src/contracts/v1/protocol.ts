import { Type, type Static } from "typebox";
import { Closed, Digest, Identifier, NonNegativeInt, Verdict, contractId } from "./common.ts";
import { BASELINE_TOLERANCES, INSTABILITY_RULES, RequirementRef } from "./evidence.ts";

/** What a `scope_argument` puts the class patterns of the subject in place of. */
export const SCOPE_PLACEHOLDER = "{classes}";

/** What the runner puts the path of the rule set it writes from a control's frozen rules in place of. */
export const RULESET_PLACEHOLDER = "{ruleset}";

/** What the runner puts the directory that holds that rule set in place of, for an analyser that reads a directory. */
export const RULESET_DIRECTORY_PLACEHOLDER = "{ruleset_directory}";

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

/** What a rule of a quality referential measures. */
export const QUALITY_NATURES = ["complexity", "dead_code", "duplication"] as const;

/**
 * One rule of a quality referential a target adapter offers: what it measures, the rule of the analyser
 * that checks it and the control that runs that analyser (its oracle), the threshold the analyser
 * documents, and where and when those were read. Data of the adapter, never of a model.
 */
export const QualityRule = Type.Object(
	{
		/** The rule as the analyser's report names it. */
		rule_id: Identifier,
		nature: Closed(QUALITY_NATURES),
		/** The control whose analyser checks the rule. */
		control_id: Identifier,
		/** Where the analyser's rule set finds the rule; null for a rule the analyser applies without one. */
		reference: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
		/** The threshold in words, as the owner reads it. */
		threshold: Type.String({ minLength: 1 }),
		/** The properties the analyser is given so that the threshold is the one stated. */
		properties: Type.Record(Type.String(), Type.String()),
		/** The analyser and its version, whose documentation states the threshold. */
		tool: Type.String({ minLength: 1 }),
		/** Where the rule and its threshold are documented, as a host and a path: a reference to read, never an address 495 contacts. */
		source: Type.String({ minLength: 1 }),
		established_on: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
	},
	{ additionalProperties: false },
);
export type QualityRule = Static<typeof QualityRule>;

/**
 * What the analysers of a quality referential read and what they leave aside, as the target adapter
 * declares it from the build files: never from a file of the analysed tree, so nothing there can widen
 * or narrow it.
 */
export const QualityPerimeter = Type.Object(
	{
		/** The source roots the analysers read, workspace-relative, each with the module it belongs to. */
		measured: Type.Array(
			Type.Object(
				{ module: Type.String({ minLength: 1 }), root: Type.String({ minLength: 1 }) },
				{ additionalProperties: false },
			),
		),
		/** The annotations, fully qualified, whose presence on a top-level type marks its file as generated code. */
		generated_annotations: Type.Array(Type.String({ minLength: 1 })),
		/** What no analyser of the referential reads, each with the reason. */
		unmeasured: Type.Array(
			Type.Object(
				{ subject: Type.String({ minLength: 1 }), reason: Type.String({ minLength: 1 }) },
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);
export type QualityPerimeter = Static<typeof QualityPerimeter>;

/** The styles a part of an architecture map is organised in (`specs/adr/D-87`). */
export const ARCHITECTURE_STYLES = ["layered", "onion", "simple", "other"] as const;

/** A place in the reference that supports an element of an architecture map: a file, a line of it, and what it shows. */
export const ArchitectureHint = Type.Object(
	{
		path: Type.String({ minLength: 1 }),
		line: Type.Integer({ minimum: 1 }),
		says: Type.String(),
	},
	{ additionalProperties: false },
);
export type ArchitectureHint = Static<typeof ArchitectureHint>;

/** A statement of the reading of the model, with the places in the reference that support it. */
export const ReadingStatement = Type.Object(
	{ statement: Type.String({ minLength: 1 }), hints: Type.Array(ArchitectureHint, { minItems: 1 }) },
	{ additionalProperties: false },
);
export type ReadingStatement = Static<typeof ReadingStatement>;

/** The concerns the reading of the model says something of. */
export const READING_CONCERNS = ["data", "cross_cutting", "deployment"] as const;

/**
 * What a model reads of the data, the cross-cutting concerns and the deployment of a target beside its map,
 * each statement with its hints: a reading, never a finding, which no control checks and no verdict depends
 * on (`specs/adr/D-74`, `D-87`).
 */
export const ModelReading = Type.Object(
	{
		data: Type.Array(ReadingStatement),
		cross_cutting: Type.Array(ReadingStatement),
		deployment: Type.Array(ReadingStatement),
	},
	{ additionalProperties: false },
);
export type ModelReading = Static<typeof ModelReading>;

/**
 * The architecture of a target as a model proposes it: parts, each a set of modules or package branches
 * with its style and the role of each of its packages, and the parts each part may depend on, with the reading
 * of the model beside them. Every element carries the places in the reference that support it. A proposal,
 * never a finding.
 */
export const ArchitectureMap = Type.Object(
	{
		parts: Type.Array(
			Type.Object(
				{
					name: Type.String({ minLength: 1 }),
					/** The modules, by directory, or the package branches the part covers. */
					perimeter: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
					style: Closed(ARCHITECTURE_STYLES),
					roles: Type.Array(
						Type.Object(
							{
								package: Type.String({ minLength: 1 }),
								/**
								 * In a part in onion, its ring: "domain model", "domain services", "application services" or
								 * "adapter <name>"; in a part in layers, the name of its layer.
								 */
								role: Type.String({ minLength: 1 }),
								/** In a part in layers, the layers of the part that may call the layer of this package; empty for none. */
								called_by: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
								hints: Type.Array(ArchitectureHint),
							},
							{ additionalProperties: false },
						),
					),
					hints: Type.Array(ArchitectureHint),
				},
				{ additionalProperties: false },
			),
			{ minItems: 1 },
		),
		/** Each part `from` may depend on the part `to`; a dependency between parts no relation names is not permitted. */
		relations: Type.Array(
			Type.Object(
				{ from: Type.String({ minLength: 1 }), to: Type.String({ minLength: 1 }), hints: Type.Array(ArchitectureHint) },
				{ additionalProperties: false },
			),
		),
		reading: Type.Optional(ModelReading),
	},
	{ $id: "urn:495:contract:architecture-map:1", additionalProperties: false },
);
export type ArchitectureMap = Static<typeof ArchitectureMap>;

/** What an observation of a pattern review says of the code: a pattern in use, or an anti-pattern. */
export const REVIEW_KINDS = ["pattern", "anti_pattern"] as const;

/** An observation of the pattern review a model makes of a target, with the places in the reference that show it. */
export const PatternObservation = Type.Object(
	{
		kind: Closed(REVIEW_KINDS),
		name: Type.String({ minLength: 1 }),
		hints: Type.Array(ArchitectureHint, { minItems: 1 }),
	},
	{ additionalProperties: false },
);
export type PatternObservation = Static<typeof PatternObservation>;

/** What an alternative of an architecture recommendation does to the architecture as it stands. */
export const RECOMMENDATION_NATURES = ["keep", "adjust", "transform"] as const;

/**
 * What a model recommends doing with the architecture of a target once its map is adopted and measured: alternatives,
 * each with its benefits, its cost in complexity and in migration, its risks and the constraints it cites, a
 * requirement or a question the owner answered, by its identifier; then the alternative it recommends, with its
 * conclusion and the constraints that conclusion cites; and the review of the patterns and the anti-patterns of the
 * code it rests on. A proposal the owner chooses from, never a finding.
 */
export const ArchitectureRecommendation = Type.Object(
	{
		alternatives: Type.Array(
			Type.Object(
				{
					alternative_id: Type.String({ minLength: 1 }),
					nature: Closed(RECOMMENDATION_NATURES),
					description: Type.String({ minLength: 1 }),
					benefits: Type.Array(Type.String()),
					cost: Type.Object({ complexity: Type.String(), migration: Type.String() }, { additionalProperties: false }),
					risks: Type.Array(Type.String()),
					constraints: Type.Array(Type.String()),
				},
				{ additionalProperties: false },
			),
		),
		recommended: Type.Object(
			{
				alternative_id: Type.String({ minLength: 1 }),
				conclusion: Type.String({ minLength: 1 }),
				constraints: Type.Array(Type.String()),
			},
			{ additionalProperties: false },
		),
		/** Absent when the model gave no review: a reading, never a finding, which no verdict depends on (`D-74`). */
		review: Type.Optional(Type.Array(PatternObservation)),
	},
	{ $id: "urn:495:contract:architecture-recommendation:1", additionalProperties: false },
);
export type ArchitectureRecommendation = Static<typeof ArchitectureRecommendation>;

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
		/**
		 * The report reader that turns the command's observation into the evidence, by its identifier. The
		 * list is open: a technology brings its readers, and a reader no loaded technology brings yields
		 * `INDETERMINATE`, never `PASS`.
		 */
		parser: Type.String({ minLength: 1 }),
		report_path: Type.Union([Type.String(), Type.Null()]),
		/** Architecture rules a structural sensor applies; empty for every other sensor. */
		structure_rules: Type.Array(StructureRule),
		/**
		 * Quality rules a quality sensor applies, written into the analyser's rule set from this frozen
		 * definition at each run; absent for every other sensor.
		 */
		quality_rules: Type.Optional(Type.Array(QualityRule)),
		/**
		 * The architecture map the owner adopted, from which an architecture sensor writes the rules its analyser
		 * applies at each run; absent for every other sensor.
		 */
		architecture_map: Type.Optional(ArchitectureMap),
		/**
		 * Reports this control leaves in the workspace, named so that another one may read them: the
		 * Surefire reports and the JaCoCo report a single `mvn test` writes are two of them.
		 */
		provides: Type.Array(Type.String()),
		/**
		 * Reports this control reads without producing any measurement of its own. The order of the
		 * controls — of their qualification as of their verification — is derived from these two
		 * declarations, so the frozen protocol carries it instead of the order of the `controls` array
		 * (VER-05, QLT-04). A report no control of the protocol writes is already in the tree or absent,
		 * and the sensor says so itself.
		 */
		requires: Type.Array(Type.String()),
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
		evidence_ids: Type.Optional(
			Type.Object(
				{ positive: Identifier, negative: Identifier, incident: Identifier },
				{ additionalProperties: false },
			),
		),
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

/**
 * The replacement of one exact value in a file of the target: the file is left byte for byte as it was
 * except for that value, which is why the value it currently holds is part of the edit.
 */
export const FileEdit = Type.Object(
	{
		path: Type.String({ minLength: 1 }),
		current: Type.String(),
		wanted: Type.String(),
	},
	{ additionalProperties: false },
);
export type FileEdit = Static<typeof FileEdit>;

/** The install of one package of a package manager, which the owner may have run in a copy of the target. */
export const PackageInstall = Type.Object(
	{
		package: Type.String({ minLength: 1 }),
		version: Type.String({ minLength: 1 }),
		manager: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);
export type PackageInstall = Static<typeof PackageInstall>;

/**
 * A test complement an adapter recommends when a sensor it can read is missing on the target. The
 * tool and its version are data of the adapter, checked against `source` on `established_on`; nothing
 * here is a model output, and recommending installs or writes nothing.
 */
export const RecommendedComplement = Type.Object(
	{
		test_type: Type.String({ minLength: 1 }),
		tool: Type.String({ minLength: 1 }),
		version: Type.String({ minLength: 1 }),
		established_on: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
		/** Where the version was read, as a host and a path: a reference to read, never an address 495 contacts. */
		source: Type.String({ minLength: 1 }),
		/** What the target must change for the complement to take effect. */
		change: Type.String({ minLength: 1 }),
		/** Present when `change` is nothing more than a replacement in one file, which the owner may have applied. */
		edit: Type.Optional(FileEdit),
		/** Present when `change` is the install of one package, which the owner may have run. */
		install: Type.Optional(PackageInstall),
	},
	{ additionalProperties: false },
);
export type RecommendedComplement = Static<typeof RecommendedComplement>;

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
		/** Absent from a protocol frozen before complements were recommended. */
		recommendations: Type.Optional(Type.Array(RecommendedComplement)),
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

/**
 * A recommended complement the owner had applied: the file as it was written, by its digest, so that
 * the candidate may keep it and change nothing else in it.
 */
export const AdoptedComplement = Type.Object(
	{
		path: Type.String({ minLength: 1 }),
		digest: Digest,
		/**
		 * The mode an install gave the file, written with it into every copy a control runs in. Absent from a
		 * file an edit wrote, or from a complement frozen before modes were kept: it is written with the default mode.
		 */
		mode: Type.Optional(Type.String({ pattern: "^[0-7]{6}$" })),
		test_type: Type.String({ minLength: 1 }),
		tool: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);
export type AdoptedComplement = Static<typeof AdoptedComplement>;

/** A package an adopted install added to the target, as its lock file names it. */
export const InstalledPackage = Type.Object(
	{
		name: Type.String({ minLength: 1 }),
		version: Type.String({ minLength: 1 }),
		integrity: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);
export type InstalledPackage = Static<typeof InstalledPackage>;

/**
 * A quality referential the owner adopted: the rules as the adapter offered them, each with its oracle,
 * its threshold and its source, and the date of the decision that adopted them. Frozen with the protocol
 * and never read from the analysed tree.
 */
export const AdoptedQualityReferential = Type.Object(
	{
		adopted_on: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
		/** The owner's decision that adopted it. */
		decision_id: Identifier,
		rules: Type.Array(QualityRule, { minItems: 1 }),
		/** What its analysers read and leave aside; absent from a referential adopted before the adapter declared it. */
		perimeter: Type.Optional(QualityPerimeter),
	},
	{ additionalProperties: false },
);
export type AdoptedQualityReferential = Static<typeof AdoptedQualityReferential>;

/** What the verification of an adopted map does not see, with the reason, as the technology says it in each language. */
export const UnseenByVerification = Type.Object(
	{ en: Type.String({ minLength: 1 }), fr: Type.String({ minLength: 1 }) },
	{ additionalProperties: false },
);
export type UnseenByVerification = Static<typeof UnseenByVerification>;

/**
 * An architecture map the owner adopted: the parts and the relations of the map as it was proposed, the packages
 * of the main sources no part covers, the date of the decision that adopted it, what its verification does not see
 * and the reading of the model that went with it. Frozen with the protocol as the architecture the project
 * declares, and never read from the analysed tree (`specs/adr/D-25`, `D-87`).
 */
export const AdoptedArchitectureMap = Type.Object(
	{
		adopted_on: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
		/** The owner's decision that adopted it. */
		decision_id: Identifier,
		map: ArchitectureMap,
		unassigned_packages: Type.Array(Type.String()),
		/** Absent from a map adopted before it was said, or that no control verifies. */
		unseen: Type.Optional(Type.Array(UnseenByVerification)),
		/**
		 * The reading of the model that goes with the map, without the statements set aside, and each of those with
		 * the hint that designates no line of the reference. Absent when the model gave none.
		 */
		reading: Type.Optional(
			Type.Object(
				{
					kept: ModelReading,
					set_aside: Type.Array(
						Type.Object(
							{
								concern: Closed(READING_CONCERNS),
								statement: Type.String({ minLength: 1 }),
								hint: Type.String({ minLength: 1 }),
							},
							{ additionalProperties: false },
						),
					),
				},
				{ additionalProperties: false },
			),
		),
	},
	{ additionalProperties: false },
);
export type AdoptedArchitectureMap = Static<typeof AdoptedArchitectureMap>;

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
		/** Absent from a protocol frozen before complements could be adopted. */
		complements: Type.Optional(Type.Array(AdoptedComplement)),
		/** Absent from a protocol frozen before an install could be adopted. */
		installed_packages: Type.Optional(Type.Array(InstalledPackage)),
		/** Present when the owner adopted the quality referential the target adapter offered. */
		quality_referential: Type.Optional(AdoptedQualityReferential),
		/** Present when the owner adopted the architecture map a model proposed for the target. */
		architecture_map: Type.Optional(AdoptedArchitectureMap),
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
		satisfied_by_reference: Type.Boolean({
			description:
				"the reference already exhibits this behaviour, so a suite that stays green proves it; false means the requirement needs a control that fails on the reference",
		}),
	},
	{ additionalProperties: false },
);
export type Requirement = Static<typeof Requirement>;

/**
 * A material question, the answer a human recorded for it, and the requirements that carry it. The
 * question and the answer are copied from the ledger, never from a model; the binding to the
 * requirements comes from the specification, but `observable` comes from the question's closure
 * state alone — true while it is open, false once the owner closes it — never from what the
 * specification declares.
 */
export const AnsweredQuestion = Type.Object(
	{
		question_id: Identifier,
		question: Type.String({ minLength: 1 }),
		answer: Type.String({ minLength: 1 }),
		observable: Type.Boolean({
			description: "the answer fixes something a control can observe — a status, a message, a bound",
		}),
		requirement_ids: Type.Array(Identifier),
	},
	{ additionalProperties: false },
);
export type AnsweredQuestion = Static<typeof AnsweredQuestion>;

export const RequirementsDocument = Type.Object(
	{
		change_id: Identifier,
		requirements: Type.Array(Requirement),
		answers: Type.Array(AnsweredQuestion),
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
		open_questions: Type.Array(
			Type.Object(
				{
					id: Identifier,
					question: Type.String(),
					material: Type.Boolean(),
					answer: Type.Union([Type.String(), Type.Null()]),
					/** The actor who closed the question; absent unless the owner closed it, and then never null (BES-02, RM-024). */
					closed_by: Type.Optional(Type.String()),
				},
				{ additionalProperties: false },
			),
		),
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
