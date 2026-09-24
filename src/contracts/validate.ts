import { Value } from "typebox/value";
import { Type, type TSchema, type Static } from "typebox";

export interface ContractViolation {
	path: string;
	message: string;
	/** The schema keyword the value breaks, and the parameters the validator reports with it. */
	keyword: string;
	params: Record<string, unknown>;
}

/**
 * How many violations the validator lists before it stops. The cap is a setting of the copy of
 * TypeBox that runs — Pi hands an extension its own, and aliases no entry that publishes the setting —
 * so it is measured on a value that breaks a schema more often than a cap reaches.
 */
const LISTED_AT_MOST = Value.Errors(Type.Array(Type.Never()), new Array(1024).fill(0)).length;

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
	throw new ContractError(
		contract ?? String((schema as { $id?: string }).$id ?? "anonymous"),
		violations(schema, value).listed,
	);
}

/**
 * The ways a value departs from a contract, in the order the schema is walked; none for a valid one.
 * The validator stops at a cap it applies to every caller, so `capped` says the list may be cut short.
 */
export function violations<S extends TSchema>(
	schema: S,
	value: unknown,
): { listed: ContractViolation[]; capped: boolean } {
	const listed = Value.Errors(schema, value).map((error) => {
		const e = error as { instancePath?: string; path?: string; message?: string; keyword?: string; params?: object };
		return {
			path: String(e.instancePath ?? e.path ?? ""),
			message: String(e.message ?? "invalid"),
			keyword: String(e.keyword ?? ""),
			params: { ...e.params },
		};
	});
	return { listed, capped: listed.length >= LISTED_AT_MOST };
}

export function check<S extends TSchema>(schema: S, value: unknown): value is Static<S> {
	return Value.Check(schema, value);
}
