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
const DEFAULT_EGRESS: readonly DeclaredEgress[] = Object.freeze([
	Object.freeze({ provider_id: "omlx", location: "on_machine" }) as DeclaredEgress,
]);

const DEFAULT_CONFIG: HarnessConfig = {
	policy: { ...DEFAULT_POLICY, egress: [...DEFAULT_EGRESS] },
	isolation: { allow_unconfined: false },
	human_origin: { rpc_actor_env: "HARNESS495_RPC_HUMAN_ACTOR" },
	workspace_exclusions: ["target/", "dist/", ".pi/", "__pycache__/", "build/"],
	language: "fr",
};

/**
 * The declared destinations a configuration carries, or the default when it carries none.
 *
 * A malformed declaration declares nothing rather than falling back: the owner who wrote it meant
 * to narrow what may be reached, and restoring a destination they deleted would widen it behind a
 * diagnostic. Every outcome is announced — the default in force, an empty declaration, and any
 * destination off the machine — because what may leave should be said at session open rather than
 * discovered at the first refusal.
 */
function readEgress(raw: unknown, diagnostics: string[]): DeclaredEgress[] {
	const announce = (declared: DeclaredEgress[]): DeclaredEgress[] => {
		const away = declared.filter((d) => d.location === "off_machine").map((d) => d.provider_id);
		if (declared.length === 0)
			diagnostics.push("config.json: no egress destination is declared, so every intervention is refused");
		else if (away.length > 0)
			diagnostics.push(
				`config.json: ${declared.length} declared destination(s), ${away.length} off this machine (${away.join(", ")})`,
			);
		return declared;
	};
	const refuse = (why: string): DeclaredEgress[] => {
		diagnostics.push(`config.json: ${why}`);
		return announce([]);
	};
	/** An owner-supplied value, named for a diagnostic without spilling an arbitrary payload into it. */
	const show = (value: unknown): string => {
		const text = JSON.stringify(value) ?? String(value);
		return text.length > 60 ? `${text.slice(0, 60)}…` : text;
	};

	if (raw === undefined) {
		diagnostics.push(
			`config.json: policy.egress is absent; the default declaration stands (${DEFAULT_EGRESS.map((d) => d.provider_id).join(", ")})`,
		);
		return [...DEFAULT_EGRESS];
	}
	if (!Array.isArray(raw)) return refuse(`policy.egress is ${show(raw)}, not a list of destinations`);
	const declared: DeclaredEgress[] = [];
	for (const [index, entry] of raw.entries()) {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry))
			return refuse(`destination ${index} is ${show(entry)}, not an object with provider_id and location`);
		const { provider_id, location } = entry as Partial<DeclaredEgress>;
		if (typeof provider_id !== "string" || provider_id === "")
			return refuse(`destination ${index} carries no provider_id`);
		if (location === undefined || !EGRESS_LOCATIONS.includes(location))
			return refuse(`destination ${provider_id} does not say where it sits (${EGRESS_LOCATIONS.join(" or ")})`);
		// A name declared twice, once on the machine and once off it, contradicts itself about the one
		// thing the field records. Loading it quietly would leave the contradiction to be discovered.
		const twin = declared.find((d) => d.provider_id === provider_id);
		if (twin && twin.location !== location)
			return refuse(`destination ${provider_id} is declared both ${twin.location} and ${location}`);
		if (!twin) declared.push({ provider_id, location });
	}
	return announce(declared);
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
			// A file that cannot be read cannot be trusted to have declared anything. Keeping the default
			// here would restore a destination the owner may have removed in the very edit that broke it.
			diagnostics.push(`config.json ignored: ${(error as Error).message}`);
			diagnostics.push("config.json: no egress destination is declared, so every intervention is refused");
			config.policy = { ...config.policy, egress: [] };
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
