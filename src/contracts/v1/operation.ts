import { Type, type Static } from "typebox";
import { CanonicalError, Closed, Digest, EFFECT_STATES, Identifier, IsoDateTime, OPERATION_STATUSES, ObjectRef, SubjectRef, contractId } from "./common.ts";
import { Limits } from "./evidence.ts";

export const OperationRequest = Type.Object(
	{
		operation_id: Identifier,
		idempotency_key: Identifier,
		operation_type: Identifier,
		subject: SubjectRef,
		expected_revision: Type.Integer({ minimum: 0 }),
		mandate_ref: Type.Union([Identifier, Type.Null()]),
		deadline: Type.Union([IsoDateTime, Type.Null()]),
		inputs: Type.Record(Type.String(), Type.Unknown()),
		inputs_digest: Digest,
	},
	{ $id: contractId("operation-request"), additionalProperties: false },
);
export type OperationRequest = Static<typeof OperationRequest>;

export const OperationResult = Type.Object(
	{
		operation_id: Identifier,
		idempotency_key: Identifier,
		correlation_id: Identifier,
		status: Closed(OPERATION_STATUSES),
		effect_state: Closed(EFFECT_STATES),
		output_refs: Type.Array(ObjectRef),
		event_refs: Type.Array(Identifier),
		error: Type.Union([CanonicalError, Type.Null()]),
		limits: Limits,
	},
	{ $id: contractId("operation-result"), additionalProperties: false },
);
export type OperationResult = Static<typeof OperationResult>;
