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

export function loadConfig(
	dataDir: string,
	env: NodeJS.ProcessEnv = process.env,
): { config: HarnessConfig; diagnostics: string[] } {
	const diagnostics: string[] = [];
	const path = join(dataDir, "config.json");
	let config: HarnessConfig = structuredClone(DEFAULT_CONFIG);
	if (existsSync(path)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
				throw new Error(`expected an object, read ${Array.isArray(parsed) ? "a list" : typeof parsed}`);
			const raw = parsed as Partial<Omit<HarnessConfig, "policy">> & {
				policy?: Partial<ActivePolicy> & {
					egress?: unknown;
					budgets?: Partial<ActivePolicy["budgets"]>;
					adoption?: Partial<ActivePolicy["adoption"]>;
				};
			};
			const { egress, budgets, adoption, ...policy }: NonNullable<typeof raw.policy> = raw.policy ?? {};
			if (egress !== undefined) diagnostics.push(EGRESS_NO_LONGER_READ);
			config = {
				policy: {
					...DEFAULT_POLICY,
					...policy,
					budgets: { ...DEFAULT_POLICY.budgets, ...budgets },
					adoption: { ...DEFAULT_POLICY.adoption, ...adoption, protocol: "kernel" },
					revision: policy.revision ?? DEFAULT_POLICY.revision,
					policy_id: policy.policy_id ?? "config.json",
				},
				isolation: { ...DEFAULT_CONFIG.isolation, ...(raw.isolation ?? {}) },
				human_origin: { ...DEFAULT_CONFIG.human_origin, ...(raw.human_origin ?? {}) },
				workspace_exclusions: raw.workspace_exclusions ?? DEFAULT_CONFIG.workspace_exclusions,
				language: raw.language === "en" ? "en" : "fr",
			};
		} catch (error) {
			// V8 quotes an excerpt of the source in a JSON syntax error, and the diagnostic is sent to the model.
			const reason = error instanceof SyntaxError ? "it is not valid JSON" : (error as Error).message;
			diagnostics.push(`config.json ignored: ${reason}`);
		}
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
