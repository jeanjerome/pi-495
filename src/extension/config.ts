import { lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { HarnessConfigFile } from "../contracts/v1/config.ts";
import { check, type ContractViolation, violations } from "../contracts/validate.ts";
import { DomainError } from "../domain/errors.ts";
import { DEFAULT_POLICY, type ActivePolicy } from "../domain/policy.ts";

/**
 * Harness configuration, read from `<data dir>/config.json`. A project file cannot widen it
 * (§12: a project cannot enlarge a higher policy). Missing file means the default policy; one that
 * cannot be read, or that its contract (`contracts/v1/harness-config.json`) does not accept, refuses.
 */
export interface HarnessConfig {
	policy: ActivePolicy;
	isolation: { allow_unconfined: boolean };
	human_origin: { rpc_actor_env: string };
	workspace_exclusions: string[];
	language: "fr" | "en";
}

const DEFAULT_CONFIG: HarnessConfig = {
	policy: DEFAULT_POLICY,
	isolation: { allow_unconfined: false },
	human_origin: { rpc_actor_env: "HARNESS495_RPC_HUMAN_ACTOR" },
	workspace_exclusions: ["target/", "dist/", ".pi/", "__pycache__/", "build/"],
	language: "fr",
};

/**
 * Choosing the model in Pi is what admits its provider, so a `policy.egress` list left in the file
 * restricts nothing, and whoever wrote one must learn why the file is refused.
 */
const EGRESS_NO_LONGER_READ = "policy.egress is no longer read, since the model selected in Pi is used";

/**
 * A key is written by the owner and its refusal reaches the context of the session's model, so it is
 * cited only when it reads as the name of a setting.
 */
const SHORT_IDENTIFIER = /^[A-Za-z0-9_-]{1,40}$/;

const TYPE_NAMES: Record<string, string> = {
	boolean: "a boolean",
	object: "an object",
	array: "a list",
	string: "a string",
	integer: "a whole number",
	number: "a number",
};

/**
 * A file that cannot be read stops every change instead of giving way to the defaults: a setting it
 * holds may keep a decision for a human, and the defaults hand that decision to the kernel. The
 * reason names what is wrong, never the file's text or where it lies, since the refusal reaches the
 * context of the session's model.
 */
function unreadable(reason: string): DomainError {
	return new DomainError(
		"CONFIGURATION_ERROR",
		`config.json cannot be read: ${reason}; no change runs until it is fixed or removed and Pi is reloaded (/reload) or a new session is started`,
	);
}

/**
 * Whether the file is there to be read. A link whose target is gone is a file that cannot be opened,
 * not an absent one; anything but a regular file — a pipe would hold the session's start until
 * something writes to it — is refused before it is opened.
 */
function present(path: string): boolean {
	try {
		if (!lstatSync(path, { throwIfNoEntry: false })) return false;
		if (statSync(path).isFile()) return true;
	} catch {
		throw unreadable("the file cannot be opened");
	}
	throw unreadable("it is not a regular file");
}

function parseFile(path: string): unknown {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		throw unreadable("the file cannot be opened");
	}
	try {
		return JSON.parse(text);
	} catch {
		throw unreadable("it is not valid JSON");
	}
}

/** `/policy/adoption` reads `policy.adoption`. Its segments are keys the schema names, or list positions. */
function location(pointer: string): string {
	return pointer === "" ? "the file" : pointer.slice(1).replaceAll("/", ".");
}

/** What the schema expects where a value departs from it, read from the schema's own parameters. */
function expectation({ keyword, params }: ContractViolation): string {
	switch (keyword) {
		case "type":
			return TYPE_NAMES[String(params.type)] ?? String(params.type);
		case "enum": {
			const values = (params.allowedValues as string[]).map(String);
			return values.length > 1 ? `${values.slice(0, -1).join(", ")} or ${values.at(-1)}` : String(values[0]);
		}
		case "minimum":
			return `at least ${params.limit}`;
		case "minLength":
			return `at least ${params.limit} character${params.limit === 1 ? "" : "s"} long`;
		case "maxLength":
			return `at most ${params.limit} characters long`;
		default:
			return "as contracts/v1/harness-config.json describes";
	}
}

/** A key the schema does not name, read from its own pointer; one that needs escaping is no identifier. */
function unknownKey(pointer: string): string {
	if (pointer === "/policy/egress") return EGRESS_NO_LONGER_READ;
	const at = pointer.lastIndexOf("/");
	if (!SHORT_IDENTIFIER.test(pointer.slice(at + 1)))
		return `${location(pointer.slice(0, at))} holds a key that is not a known setting`;
	return `${location(pointer)} is not a known setting`;
}

/**
 * Where the file departs from its contract and what is expected there, never the value written: the
 * refusal reaches the context of the session's model. The first three are named, the others counted,
 * as a lower bound once the validator's cap may have cut the list.
 */
function deviations(file: unknown): string {
	const { listed, capped } = violations(HarnessConfigFile, file);
	const found = new Set<string>();
	for (const violation of listed) {
		// A key the schema does not name fails the `false` schema of `additionalProperties` on its own
		// pointer; the object holding it then fails once more for all its keys, and that entry is the
		// first the cap drops, so the key's own entry is the one read.
		if (violation.keyword === "additionalProperties") continue;
		if (violation.keyword === "boolean") found.add(unknownKey(violation.path));
		else found.add(`${location(violation.path)} must be ${expectation(violation)}`);
	}
	const named = [...found].slice(0, 3);
	const others = found.size - named.length;
	if (others > 0) named.push(`and ${capped ? "at least " : ""}${others} more`);
	return named.join("; ");
}

export function loadConfig(
	dataDir: string,
	env: NodeJS.ProcessEnv = process.env,
): { config: HarnessConfig; diagnostics: string[] } {
	const diagnostics: string[] = [];
	const path = join(dataDir, "config.json");
	let config: HarnessConfig = structuredClone(DEFAULT_CONFIG);
	if (present(path)) {
		const file = parseFile(path);
		if (!check(HarnessConfigFile, file)) throw unreadable(deviations(file));
		const { budgets, adoption, baseline, ...policy } = file.policy ?? {};
		config = {
			policy: {
				...DEFAULT_POLICY,
				...policy,
				budgets: { ...DEFAULT_POLICY.budgets, ...budgets },
				adoption: { ...DEFAULT_POLICY.adoption, ...adoption },
				baseline: { ...DEFAULT_POLICY.baseline, ...baseline },
				policy_id: policy.policy_id ?? "config.json",
			},
			isolation: { ...DEFAULT_CONFIG.isolation, ...file.isolation },
			human_origin: { ...DEFAULT_CONFIG.human_origin, ...file.human_origin },
			workspace_exclusions: file.workspace_exclusions ?? DEFAULT_CONFIG.workspace_exclusions,
			language: file.language ?? DEFAULT_CONFIG.language,
		};
	}
	if (env.HARNESS495_ALLOW_UNCONFINED === "1") {
		config.isolation.allow_unconfined = true;
		diagnostics.push(
			"HARNESS495_ALLOW_UNCONFINED=1: the unconfined backend is enabled and SEC-02/SEC-03 cannot be claimed",
		);
	}
	if (env.HARNESS495_INTEGRATION === "1") config.policy = { ...config.policy, integration_enabled: true };
	if (env.HARNESS495_HUMAN_ACCEPTANCE === "1") config.policy = { ...config.policy, g5_human_acceptance: true };
	if (env.HARNESS495_LANGUAGE === "en") config.language = "en";
	return { config, diagnostics };
}
