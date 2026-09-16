import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_POLICY, type ActivePolicy } from "../domain/policy.ts";

/**
 * Harness configuration, read from `<data dir>/config.json`. A project file cannot widen it
 * (§12: a project cannot enlarge a higher policy). Missing file means the default policy.
 */
export interface HarnessConfig {
	policy: ActivePolicy;
	isolation: { allow_unconfined: boolean };
	human_origin: { rpc_actor_env: string };
	workspace_exclusions: string[];
	language: "fr" | "en";
}

export const DEFAULT_CONFIG: HarnessConfig = {
	policy: DEFAULT_POLICY,
	isolation: { allow_unconfined: false },
	human_origin: { rpc_actor_env: "HARNESS495_RPC_HUMAN_ACTOR" },
	workspace_exclusions: ["node_modules/", "target/", "dist/", ".pi/", "__pycache__/", ".venv/", "build/"],
	language: "fr",
};

export function loadConfig(dataDir: string, env: NodeJS.ProcessEnv = process.env): { config: HarnessConfig; diagnostics: string[] } {
	const diagnostics: string[] = [];
	const path = join(dataDir, "config.json");
	let config: HarnessConfig = structuredClone(DEFAULT_CONFIG);
	if (existsSync(path)) {
		try {
			const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<HarnessConfig> & { policy?: Partial<ActivePolicy> & { budgets?: Partial<ActivePolicy["budgets"]>; adoption?: Partial<ActivePolicy["adoption"]> } };
			config = {
				policy: { ...DEFAULT_POLICY, ...(raw.policy ?? {}), budgets: { ...DEFAULT_POLICY.budgets, ...(raw.policy?.budgets ?? {}) }, adoption: { ...DEFAULT_POLICY.adoption, ...(raw.policy?.adoption ?? {}), protocol: "kernel" }, revision: (raw.policy?.revision ?? DEFAULT_POLICY.revision), policy_id: raw.policy?.policy_id ?? "config.json" },
				isolation: { ...DEFAULT_CONFIG.isolation, ...(raw.isolation ?? {}) },
				human_origin: { ...DEFAULT_CONFIG.human_origin, ...(raw.human_origin ?? {}) },
				workspace_exclusions: raw.workspace_exclusions ?? DEFAULT_CONFIG.workspace_exclusions,
				language: raw.language === "en" ? "en" : "fr",
			};
		} catch (error) {
			diagnostics.push(`config.json ignored: ${(error as Error).message}`);
		}
	}
	if (env.HARNESS495_ALLOW_UNCONFINED === "1") {
		config.isolation.allow_unconfined = true;
		diagnostics.push("HARNESS495_ALLOW_UNCONFINED=1: the unconfined backend is enabled and SEC-02/SEC-03 cannot be claimed");
	}
	if (env.HARNESS495_INTEGRATION === "1") config.policy = { ...config.policy, integration_enabled: true };
	if (env.HARNESS495_HUMAN_ACCEPTANCE === "1") config.policy = { ...config.policy, g5_human_acceptance: true };
	if (env.HARNESS495_LANGUAGE === "en") config.language = "en";
	return { config, diagnostics };
}
