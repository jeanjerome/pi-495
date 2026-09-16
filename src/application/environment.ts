import { execFileSync } from "node:child_process";
import { digestValue } from "../contracts/digest.ts";
import type { EnvironmentRef } from "../contracts/v1/common.ts";

export interface EnvironmentFacts {
	platform: string;
	arch: string;
	node: string;
	pi_version: string;
	sandbox_backend: string;
	tools: Record<string, string>;
}

function version(cmd: string, args: string[]): string {
	try {
		return execFileSync(cmd, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n")[0] ?? "";
	} catch {
		return "absent";
	}
}

/** Environment identity used by qualifications and evidence (RM-018, RM-076). */
export function describeEnvironment(piVersion: string, sandboxBackend: string, probes: Record<string, [string, string[]]> = { git: ["git", ["--version"]], java: ["java", ["-version"]], mvn: ["mvn", ["-v"]] }): { facts: EnvironmentFacts; ref: EnvironmentRef } {
	const tools: Record<string, string> = {};
	for (const [name, [cmd, args]] of Object.entries(probes)) tools[name] = name === "java" ? (() => { try { return execFileSync(cmd, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return String((e as { stderr?: string }).stderr ?? "absent").split("\n")[0] ?? "absent"; } })().trim() : version(cmd, args);
	const facts: EnvironmentFacts = { platform: process.platform, arch: process.arch, node: process.version, pi_version: piVersion, sandbox_backend: sandboxBackend, tools };
	const digest = digestValue(facts);
	return { facts, ref: { environment_id: `env_${digest.slice(7, 19)}`, digest, profile_id: sandboxBackend } };
}
