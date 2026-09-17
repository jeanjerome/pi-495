/**
 * Contract v1 — common references and closed vocabularies.
 *
 * Every persisted, interprocess or exported structure is described here with TypeBox so that the
 * JSON Schema 2020-12 documents under `contracts/v1/` are generated from a single source and
 * validated at runtime in both directions (AT-11).
 */
import { Type, type Static } from "typebox";

export const SCHEMA_VERSION = 1 as const;

export function contractId(name: string): string {
	return `urn:495:contract:${name}:${SCHEMA_VERSION}`;
}

/** Closed string set. Uses `anyOf` of constants so that the emitted schema is provider neutral. */
export function Closed<const T extends readonly string[]>(values: T, options?: Record<string, unknown>) {
	return Type.Unsafe<T[number]>({ type: "string", enum: [...values], ...(options ?? {}) });
}

export const Digest = Type.String({ pattern: "^sha256:[0-9a-f]{64}$", description: "SHA-256 digest, hex, prefixed" });
export const Identifier = Type.String({ minLength: 1, maxLength: 200 });
export const IsoDateTime = Type.String({ format: "date-time" });
export const Revision = Type.Integer({ minimum: 1 });
export const NonNegativeInt = Type.Integer({ minimum: 0 });

export const ARTIFACT_KINDS = ["request", "diagnostic", "mandate", "requirements", "protocol", "design", "trajectory", "preparation", "feedback", "review", "milestone", "reference", "candidate", "context", "output", "integration"] as const;
export const ArtifactKind = Closed(ARTIFACT_KINDS);

export const ArtifactRef = Type.Object(
	{
		artifact_id: Identifier,
		revision: Revision,
		content_digest: Digest,
		schema_version: Type.Literal(SCHEMA_VERSION),
	},
	{ $id: contractId("artifact-ref"), additionalProperties: false },
);
export type ArtifactRef = Static<typeof ArtifactRef>;

/** `fixture` is a tree fabricated for a witness; `reference` is the initial tree the change starts from. */
export const SUBJECT_KINDS = ["program", "increment", "change", "attempt", "candidate", "artifact", "protocol", "control", "component", "fixture", "reference", "build", "environment", "integration"] as const;
export const SubjectRef = Type.Object(
	{
		kind: Closed(SUBJECT_KINDS),
		id: Identifier,
		revision: Revision,
		digest: Digest,
	},
	{ $id: contractId("subject-ref"), additionalProperties: false },
);
export type SubjectRef = Static<typeof SubjectRef>;

export const CandidateRef = Type.Object(
	{
		candidate_id: Identifier,
		manifest_digest: Digest,
		base_digest: Digest,
		workspace_id: Identifier,
	},
	{ $id: contractId("candidate-ref"), additionalProperties: false },
);
export type CandidateRef = Static<typeof CandidateRef>;

export const ProtocolRef = Type.Object(
	{ protocol_id: Identifier, revision: Revision, content_digest: Digest },
	{ $id: contractId("protocol-ref"), additionalProperties: false },
);
export type ProtocolRef = Static<typeof ProtocolRef>;

export const EnvironmentRef = Type.Object(
	{ environment_id: Identifier, digest: Digest, profile_id: Identifier },
	{ $id: contractId("environment-ref"), additionalProperties: false },
);
export type EnvironmentRef = Static<typeof EnvironmentRef>;

export const ACTOR_TYPES = ["human", "kernel", "agent", "executor", "integrator", "extension", "system"] as const;
export const ACTOR_ORIGINS = ["tui_session", "rpc_qualified", "sdk_qualified", "json", "print", "model_output", "tool_call", "kernel", "executor", "system"] as const;
export const AUTHENTICATION_LEVELS = ["none", "session", "host_qualified"] as const;
export const ActorRef = Type.Object(
	{
		actor_id: Identifier,
		actor_type: Closed(ACTOR_TYPES),
		role: Identifier,
		origin: Closed(ACTOR_ORIGINS),
		authentication_level: Closed(AUTHENTICATION_LEVELS),
	},
	{ $id: contractId("actor-ref"), additionalProperties: false },
);
export type ActorRef = Static<typeof ActorRef>;

export const ObjectRef = Type.Object(
	{
		algorithm: Type.Literal("sha256"),
		digest: Digest,
		size_bytes: NonNegativeInt,
		media_type: Type.String({ minLength: 1 }),
	},
	{ $id: contractId("object-ref"), additionalProperties: false },
);
export type ObjectRef = Static<typeof ObjectRef>;

export const VERDICTS = ["PASS", "FAIL", "INDETERMINATE", "NOT_RUN", "NOT_APPLICABLE"] as const;
export const Verdict = Closed(VERDICTS);
export type Verdict = (typeof VERDICTS)[number];

export const PHASES = ["intake", "clarifying", "specifying", "verification_design", "preparing", "designing", "implementing", "verifying", "reviewing", "deciding", "integrating", "closed"] as const;
export type Phase = (typeof PHASES)[number];
export const EXEC_STATUSES = ["ready", "running", "paused", "decision_required", "blocked", "completed", "cancelled"] as const;
export type ExecStatus = (typeof EXEC_STATUSES)[number];
export const OUTCOMES = ["pending", "accepted", "rejected", "integrated", "abandoned"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const STOP_REASONS = ["user_cancelled", "budget_exhausted", "attempts_exhausted", "stagnation", "configuration_error", "capability_missing", "execution_error", "evidence_missing", "policy_denied", "integration_conflict", "decision_pending"] as const;
export type StopReason = (typeof STOP_REASONS)[number];
export const GATES = ["G0", "G1", "G2", "G3", "G4", "G5", "G6"] as const;
export type GateId = (typeof GATES)[number];

export const EFFECT_STATES = ["none", "prepared", "started", "confirmed", "failed", "uncertain", "reconciled"] as const;
export type EffectState = (typeof EFFECT_STATES)[number];
export const OPERATION_STATUSES = ["accepted", "running", "succeeded", "failed", "indeterminate", "cancelled"] as const;
export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const ERROR_CATEGORIES = ["request", "configuration", "capability", "provider", "execution", "verification", "candidate", "policy", "evidence", "git", "storage", "interface"] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const CanonicalError = Type.Object(
	{
		code: Type.String({ pattern: "^[A-Z][A-Z0-9_]+$" }),
		category: Closed(ERROR_CATEGORIES),
		summary: Type.String(),
		subject: Type.Union([SubjectRef, Type.Null()]),
		phase: Type.Union([Closed(PHASES), Type.Null()]),
		retryable: Type.Boolean(),
		effect_state: Closed(EFFECT_STATES),
		next_actions: Type.Array(Type.String()),
		details_ref: Type.Union([ObjectRef, Type.Null()]),
	},
	{ $id: contractId("canonical-error"), additionalProperties: false },
);
export type CanonicalError = Static<typeof CanonicalError>;

export const Producer = Type.Object(
	{ component: Identifier, version: Type.String(), instance_id: Identifier },
	{ additionalProperties: false },
);
export type Producer = Static<typeof Producer>;

/** Envelope shared by every interprocess message. */
export const Envelope = Type.Object(
	{
		schema_version: Type.Literal(SCHEMA_VERSION),
		message_id: Identifier,
		operation_id: Identifier,
		correlation_id: Identifier,
		causation_id: Type.Union([Identifier, Type.Null()]),
		occurred_at: IsoDateTime,
		producer: Producer,
		payload: Type.Unknown(),
	},
	{ $id: contractId("envelope"), additionalProperties: false },
);
export type Envelope = Static<typeof Envelope>;

export const HUMAN_INTERACTIONS = ["IH-01", "IH-02", "IH-03", "IH-04", "IH-05", "IH-06", "IH-07", "IH-08", "IH-09", "IH-10", "IH-11", "IH-12"] as const;
export type HumanInteraction = (typeof HUMAN_INTERACTIONS)[number];

export const ROLES = ["requester", "change_owner", "program_owner", "maintainer", "discipline_referent", "producer_agent", "reviewer_agent", "kernel", "executor", "integrator"] as const;
export type Role = (typeof ROLES)[number];

export const INTERVENTION_ROLES = ["observe", "specify", "prepare", "implement", "verify", "review", "integrate"] as const;
export type InterventionRole = (typeof INTERVENTION_ROLES)[number];
