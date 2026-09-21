import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_POLICY, type ActivePolicy, type DeclaredEgress, EGRESS_LOCATIONS } from "../domain/policy.ts";

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

/**
 * What this installation may hand excerpts and prompts to (SEC-05). The kernel declares nothing on
 * its own; the one provider configured here answers on the loopback interface, so nothing leaves
 * the machine until a destination off it is written down.
 */
const DEFAULT_EGRESS: DeclaredEgress[] = [{ provider_id: "omlx", location: "on_machine" }];

const DEFAULT_CONFIG: HarnessConfig = {
	policy: { ...DEFAULT_POLICY, egress: DEFAULT_EGRESS },
	isolation: { allow_unconfined: false },
	human_origin: { rpc_actor_env: "HARNESS495_RPC_HUMAN_ACTOR" },
	workspace_exclusions: ["target/", "dist/", ".pi/", "__pycache__/", "build/"],
	language: "fr",
};

/**
 * The declared destinations a configuration carries, or the default when it carries none. A
 * malformed declaration is refused with a diagnostic rather than accepted: it decides whether
 * excerpts and prompts may leave, and a shape nobody checked would fail later as an opaque crash.
 */
function readEgress(raw: unknown, diagnostics: string[]): DeclaredEgress[] {
	if (raw === undefined) return DEFAULT_EGRESS;
	if (!Array.isArray(raw)) {
		diagnostics.push("config.json: policy.egress is not a list of destinations; the default declaration stands");
		return DEFAULT_EGRESS;
	}
	const declared: DeclaredEgress[] = [];
	for (const entry of raw) {
		const { provider_id, location } = (entry ?? {}) as Partial<DeclaredEgress>;
		if (typeof provider_id !== "string" || provider_id === "") {
			diagnostics.push("config.json: a declared destination carries no provider; the default declaration stands");
			return DEFAULT_EGRESS;
		}
		if (location === undefined || !EGRESS_LOCATIONS.includes(location)) {
			diagnostics.push(
				`config.json: destination ${provider_id} does not say where it sits (${EGRESS_LOCATIONS.join(" or ")}); the default declaration stands`,
			);
			return DEFAULT_EGRESS;
		}
		declared.push({ provider_id, location });
	}
	return declared;
}

export function loadConfig(
	dataDir: string,
	env: NodeJS.ProcessEnv = process.env,
): { config: HarnessConfig; diagnostics: string[] } {
	const diagnostics: string[] = [];
	const path = join(dataDir, "config.json");
	let config: HarnessConfig = structuredClone(DEFAULT_CONFIG);
	if (existsSync(path)) {
		try {
			const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<HarnessConfig> & {
				policy?: Partial<ActivePolicy> & {
					budgets?: Partial<ActivePolicy["budgets"]>;
					adoption?: Partial<ActivePolicy["adoption"]>;
				};
			};
			config = {
				policy: {
					...DEFAULT_POLICY,
					...(raw.policy ?? {}),
					egress: readEgress(raw.policy?.egress, diagnostics),
					budgets: { ...DEFAULT_POLICY.budgets, ...(raw.policy?.budgets ?? {}) },
					adoption: { ...DEFAULT_POLICY.adoption, ...(raw.policy?.adoption ?? {}), protocol: "kernel" },
					revision: raw.policy?.revision ?? DEFAULT_POLICY.revision,
					policy_id: raw.policy?.policy_id ?? "config.json",
				},
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
		diagnostics.push(
			"HARNESS495_ALLOW_UNCONFINED=1: the unconfined backend is enabled and SEC-02/SEC-03 cannot be claimed",
		);
	}
	if (env.HARNESS495_INTEGRATION === "1") config.policy = { ...config.policy, integration_enabled: true };
	if (env.HARNESS495_HUMAN_ACCEPTANCE === "1") config.policy = { ...config.policy, g5_human_acceptance: true };
	if (env.HARNESS495_LANGUAGE === "en") config.language = "en";
	return { config, diagnostics };
}
