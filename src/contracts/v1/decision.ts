import { Type, type Static } from "typebox";
import {
	ActorRef,
	Closed,
	HUMAN_INTERACTIONS,
	Identifier,
	IsoDateTime,
	ROLES,
	SubjectRef,
	contractId,
} from "./common.ts";

export const DecisionOption = Type.Object(
	{ id: Identifier, label: Type.String(), effect: Type.String(), risky: Type.Boolean() },
	{ additionalProperties: false },
);
export type DecisionOption = Static<typeof DecisionOption>;

export const DecisionRequest = Type.Object(
	{
		decision_id: Identifier,
		change_id: Identifier,
		interaction: Closed(HUMAN_INTERACTIONS),
		subject: SubjectRef,
		question: Type.String(),
		facts: Type.Array(Type.String()),
		recommendation: Type.Union([Type.String(), Type.Null()]),
		options: Type.Array(DecisionOption, { minItems: 1 }),
		required_authority: Closed(ROLES),
		allow_free_text: Type.Boolean(),
		requested_at: IsoDateTime,
		expires_at: Type.Union([IsoDateTime, Type.Null()]),
		language: Closed(["fr", "en"] as const),
	},
	{ $id: contractId("decision-request"), additionalProperties: false },
);
export type DecisionRequest = Static<typeof DecisionRequest>;

export const DecisionResponse = Type.Object(
	{
		decision_id: Identifier,
		option_id: Type.Union([Identifier, Type.Null()]),
		free_text: Type.Union([Type.String(), Type.Null()]),
		reason: Type.Union([Type.String(), Type.Null()]),
		subject_revision: Type.Integer({ minimum: 1 }),
		scope: Type.Union([Type.String(), Type.Null()]),
		expires_at: Type.Union([IsoDateTime, Type.Null()]),
	},
	{ $id: contractId("decision-response"), additionalProperties: false },
);
export type DecisionResponse = Static<typeof DecisionResponse>;

/** Provided by the host adapter, never by the message content (ADR-014). */
export const HumanOrigin = Type.Object(
	{
		actor: ActorRef,
		host: Closed(["tui", "rpc", "sdk"] as const),
		session_id: Identifier,
		asserted_at: IsoDateTime,
	},
	{ $id: contractId("human-origin"), additionalProperties: false },
);
export type HumanOrigin = Static<typeof HumanOrigin>;

export const HumanDecision = Type.Object(
	{
		human_decision_id: Identifier,
		request: DecisionRequest,
		response: DecisionResponse,
		origin: HumanOrigin,
		recorded_at: IsoDateTime,
		revoked: Type.Boolean(),
	},
	{ $id: contractId("human-decision"), additionalProperties: false },
);
export type HumanDecision = Static<typeof HumanDecision>;
