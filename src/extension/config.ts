import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DomainError } from "../domain/errors.ts";
import { DEFAULT_POLICY, type ActivePolicy } from "../domain/policy.ts";

/**
 * Harness configuration, read from `<data dir>/config.json`. A project file cannot widen it
 * (§12: a project cannot enlarge a higher policy). Missing file means the default policy; an
 * unreadable one refuses.
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
 * restricts nothing, and whoever wrote one must learn so. The announcement does not reproduce the
 * list: a diagnostic reaches the display, the structured entries and the context of the session's
 * model.
 */
const EGRESS_NO_LONGER_READ = "config.json: policy.egress is no longer read; the model selected in Pi is used";

/**
 * A file that cannot be read stops every change instead of giving way to the defaults: a setting it
 * holds may keep a decision for a human, and the defaults hand that decision to the kernel. The
 * reason names what is wrong, never the file's text or where it lies, since the refusal reaches the
 * context of the session's model.
 */
function unreadable(reason: string): DomainError {
	return new DomainError(
		"CONFIGURATION_ERROR",
		`config.json cannot be read: ${reason}; no change runs until it is fixed or removed`,
	);
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

/** A section is spread over its defaults, so anything but an object would put stray keys in them. */
function section<T extends object>(value: unknown, name: string): Partial<T> {
	if (value === undefined) return {};
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		const read = value === null ? "null" : Array.isArray(value) ? "a list" : typeof value;
		throw unreadable(`${name} is ${read}, not an object`);
	}
	return value as Partial<T>;
}

export function loadConfig(
	dataDir: string,
	env: NodeJS.ProcessEnv = process.env,
): { config: HarnessConfig; diagnostics: string[] } {
	const diagnostics: string[] = [];
	const path = join(dataDir, "config.json");
	let config: HarnessConfig = structuredClone(DEFAULT_CONFIG);
	if (existsSync(path)) {
		const raw = section<Omit<HarnessConfig, "policy"> & { policy: unknown }>(parseFile(path), "the file");
		const { egress, budgets, adoption, ...policy } = section<
			Omit<ActivePolicy, "budgets" | "adoption"> & { egress: unknown; budgets: unknown; adoption: unknown }
		>(raw.policy, "policy");
		if (egress !== undefined) diagnostics.push(EGRESS_NO_LONGER_READ);
		config = {
			policy: {
				...DEFAULT_POLICY,
				...policy,
				budgets: { ...DEFAULT_POLICY.budgets, ...section<ActivePolicy["budgets"]>(budgets, "policy.budgets") },
				adoption: {
					...DEFAULT_POLICY.adoption,
					...section<ActivePolicy["adoption"]>(adoption, "policy.adoption"),
					protocol: "kernel",
				},
				revision: policy.revision ?? DEFAULT_POLICY.revision,
				policy_id: policy.policy_id ?? "config.json",
			},
			isolation: { ...DEFAULT_CONFIG.isolation, ...section<HarnessConfig["isolation"]>(raw.isolation, "isolation") },
			human_origin: {
				...DEFAULT_CONFIG.human_origin,
				...section<HarnessConfig["human_origin"]>(raw.human_origin, "human_origin"),
			},
			workspace_exclusions: raw.workspace_exclusions ?? DEFAULT_CONFIG.workspace_exclusions,
			language: raw.language === "en" ? "en" : "fr",
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
