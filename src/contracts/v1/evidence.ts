import { Type, type Static } from "typebox";
import { ActorRef, Closed, Digest, EnvironmentRef, Identifier, IsoDateTime, NonNegativeInt, ObjectRef, ProtocolRef, SubjectRef, Verdict, contractId } from "./common.ts";

export const RequirementRef = Type.Object(
	{ requirement_id: Identifier, revision: Type.Integer({ minimum: 1 }) },
	{ additionalProperties: false },
);
export type RequirementRef = Static<typeof RequirementRef>;

export const Limits = Type.Object(
	{
		truncated: Type.Boolean(),
		bytes_read: NonNegativeInt,
		bytes_total: Type.Union([NonNegativeInt, Type.Null()]),
		exclusions: Type.Array(Type.String()),
		unstable: Type.Boolean(),
		notes: Type.Array(Type.String()),
	},
	{ additionalProperties: false },
);
export type Limits = Static<typeof Limits>;

export const EMPTY_LIMITS: Limits = { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] };

export const Integrity = Type.Object(
	{ content_digest: Digest, chained_to: Type.Union([Identifier, Type.Null()]) },
	{ additionalProperties: false },
);

export const FINDING_CATEGORIES = ["assertion", "structure", "quality", "security", "performance", "scope", "protocol", "review", "incident"] as const;
export const SEVERITIES = ["blocker", "major", "minor", "info"] as const;
export const BASELINE_STATES = ["new", "preexisting", "removed", "unknown"] as const;

export const Region = Type.Object(
	{ start_line: Type.Integer({ minimum: 1 }), end_line: Type.Integer({ minimum: 1 }), start_col: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]), end_col: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]) },
	{ additionalProperties: false },
);

export const Finding = Type.Object(
	{
		rule_id: Identifier,
		category: Closed(FINDING_CATEGORIES),
		severity: Closed(SEVERITIES),
		message: Type.String(),
		path: Type.Union([Type.String(), Type.Null()]),
		region: Type.Union([Region, Type.Null()]),
		symbol: Type.Union([Type.String(), Type.Null()]),
		requirement_refs: Type.Array(RequirementRef),
		baseline_state: Closed(BASELINE_STATES),
		fingerprint: Digest,
		tool: Identifier,
		tool_version: Type.String(),
		confidence: Type.Number({ minimum: 0, maximum: 1 }),
		raw_evidence_ref: Type.Union([ObjectRef, Type.Null()]),
	},
	{ $id: contractId("finding"), additionalProperties: false },
);
export type Finding = Static<typeof Finding>;

export const Evidence = Type.Object(
	{
		evidence_id: Identifier,
		requirement_refs: Type.Array(RequirementRef),
		control_id: Identifier,
		control_version: Type.String(),
		subject: SubjectRef,
		protocol_revision: ProtocolRef,
		environment_digest: Digest,
		inputs_digest: Digest,
		started_at: IsoDateTime,
		ended_at: IsoDateTime,
		verdict: Verdict,
		facts: Type.Record(Type.String(), Type.Unknown()),
		findings: Type.Array(Finding),
		artifacts: Type.Array(Type.Object({ name: Type.String(), ref: ObjectRef }, { additionalProperties: false })),
		limits: Limits,
		producer: ActorRef,
		integrity: Integrity,
	},
	{ $id: contractId("evidence"), additionalProperties: false },
);
export type Evidence = Static<typeof Evidence>;

/** Produced by an adapter, validated by the coordinator, then written by the ledger. */
export const EvidenceCandidate = Type.Object(
	{
		control_id: Identifier,
		control_version: Type.String(),
		requirement_refs: Type.Array(RequirementRef),
		subject: SubjectRef,
		protocol_revision: ProtocolRef,
		environment: EnvironmentRef,
		inputs_digest: Digest,
		started_at: IsoDateTime,
		ended_at: IsoDateTime,
		verdict: Verdict,
		facts: Type.Record(Type.String(), Type.Unknown()),
		findings: Type.Array(Finding),
		artifacts: Type.Array(Type.Object({ name: Type.String(), ref: ObjectRef }, { additionalProperties: false })),
		limits: Limits,
		producer: ActorRef,
	},
	{ $id: contractId("evidence-candidate"), additionalProperties: false },
);
export type EvidenceCandidate = Static<typeof EvidenceCandidate>;
