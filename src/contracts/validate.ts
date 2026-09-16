import { Value } from "typebox/value";
import type { TSchema, Static } from "typebox";

export interface ContractViolation {
	path: string;
	message: string;
}

export class ContractError extends Error {
	readonly violations: ContractViolation[];
	readonly contract: string;
	constructor(contract: string, violations: ContractViolation[]) {
		super(`contract ${contract} violated: ${violations.map((v) => `${v.path || "/"} ${v.message}`).join("; ")}`);
		this.name = "ContractError";
		this.contract = contract;
		this.violations = violations;
	}
}

/** Validate an untrusted value against a contract. Never mutates the input. */
export function validate<S extends TSchema>(schema: S, value: unknown, contract?: string): Static<S> {
	if (Value.Check(schema, value)) return value as Static<S>;
	const violations: ContractViolation[] = [];
	for (const error of Value.Errors(schema, value)) {
		const e = error as { instancePath?: string; path?: string; message?: string };
		violations.push({ path: String(e.instancePath ?? e.path ?? ""), message: String(e.message ?? "invalid") });
		if (violations.length >= 20) break;
	}
	throw new ContractError(contract ?? String((schema as { $id?: string }).$id ?? "anonymous"), violations);
}

export function check<S extends TSchema>(schema: S, value: unknown): value is Static<S> {
	return Value.Check(schema, value);
}
