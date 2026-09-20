import type { CanonicalError, EffectState, ErrorCategory, Phase, SubjectRef } from "../contracts/v1/common.ts";

export type DomainErrorCode =
	| "INVALID_TRANSITION"
	| "PRECONDITION_FAILED"
	| "REVISION_CONFLICT"
	| "IDEMPOTENCY_CONFLICT"
	| "DECISION_REQUIRED"
	| "MATERIAL_QUESTION_OPEN"
	| "ATTEMPTS_EXHAUSTED"
	| "BUDGET_EXHAUSTED"
	| "STAGNATION"
	| "CAPABILITY_MISSING"
	| "POLICY_DENIED"
	| "EVIDENCE_MISSING"
	| "EVIDENCE_STALE"
	| "PROTOCOL_NOT_FROZEN"
	| "PROTECTED_PATH_ALTERED"
	| "OUT_OF_SCOPE"
	| "INVALID_PROVENANCE"
	| "INSUFFICIENT_AUTHORITY"
	| "DECISION_EXPIRED"
	| "DECISION_NOT_APPLICABLE"
	| "INTEGRATION_CONFLICT"
	| "EFFECT_UNCERTAIN"
	| "CYCLE_DETECTED"
	| "UNKNOWN_REFERENCE"
	| "OPERATION_ACTIVE"
	| "CONFIGURATION_ERROR";

const CATEGORY: Record<DomainErrorCode, ErrorCategory> = {
	INVALID_TRANSITION: "request",
	PRECONDITION_FAILED: "request",
	REVISION_CONFLICT: "storage",
	IDEMPOTENCY_CONFLICT: "request",
	DECISION_REQUIRED: "interface",
	MATERIAL_QUESTION_OPEN: "request",
	ATTEMPTS_EXHAUSTED: "policy",
	BUDGET_EXHAUSTED: "policy",
	STAGNATION: "policy",
	CAPABILITY_MISSING: "capability",
	POLICY_DENIED: "policy",
	EVIDENCE_MISSING: "evidence",
	EVIDENCE_STALE: "evidence",
	PROTOCOL_NOT_FROZEN: "verification",
	PROTECTED_PATH_ALTERED: "candidate",
	OUT_OF_SCOPE: "candidate",
	INVALID_PROVENANCE: "interface",
	INSUFFICIENT_AUTHORITY: "policy",
	DECISION_EXPIRED: "interface",
	DECISION_NOT_APPLICABLE: "interface",
	INTEGRATION_CONFLICT: "git",
	EFFECT_UNCERTAIN: "git",
	CYCLE_DETECTED: "request",
	UNKNOWN_REFERENCE: "request",
	OPERATION_ACTIVE: "execution",
	CONFIGURATION_ERROR: "configuration",
};

export class DomainError extends Error {
	readonly code: DomainErrorCode;
	readonly category: ErrorCategory;
	readonly subject: SubjectRef | null;
	readonly phase: Phase | null;
	readonly retryable: boolean;
	readonly effectState: EffectState;
	readonly nextActions: string[];
	constructor(
		code: DomainErrorCode,
		summary: string,
		options: {
			subject?: SubjectRef | null;
			phase?: Phase | null;
			retryable?: boolean;
			effectState?: EffectState;
			nextActions?: string[];
		} = {},
	) {
		super(summary);
		this.name = "DomainError";
		this.code = code;
		this.category = CATEGORY[code];
		this.subject = options.subject ?? null;
		this.phase = options.phase ?? null;
		this.retryable = options.retryable ?? false;
		this.effectState = options.effectState ?? "none";
		this.nextActions = options.nextActions ?? [];
	}
	toCanonical(): CanonicalError {
		return {
			code: this.code,
			category: this.category,
			summary: this.message,
			subject: this.subject,
			phase: this.phase,
			retryable: this.retryable,
			effect_state: this.effectState,
			next_actions: this.nextActions,
			details_ref: null,
		};
	}
}

export function isDomainError(value: unknown): value is DomainError {
	return value instanceof DomainError;
}
