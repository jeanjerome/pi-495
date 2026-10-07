import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { digestValue } from "../contracts/digest.ts";
import type { EnvironmentRef } from "../contracts/v1/common.ts";
import type { ToolProbe } from "./stacks/plugin.ts";

export interface EnvironmentFacts {
	platform: string;
	arch: string;
	node: string;
	pi_version: string;
	sandbox_backend: string;
	/** Identity of the running 495 build: upgrading it invalidates qualifications and evidence. */
	harness: { version: string; build_digest: string };
	tools: Record<string, string>;
}

/** Walks up from a module until the directory holding its `package.json`. */
function packageRoot(from: string): string | null {
	let dir = resolve(from);
	for (;;) {
		if (existsSync(join(dir, "package.json"))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** The version `package.json` declares, the one place it is written; "unknown" when no manifest reads. */
export function harnessVersion(): string {
	const root = packageRoot(dirname(fileURLToPath(import.meta.url)));
	if (!root) return "unknown";
	try {
		return String(
			(JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: string }).version ?? "unknown",
		);
	} catch {
		return "unknown"; // an unreadable manifest leaves the version unknown, never fails the session
	}
}

/**
 * Digest of the executable harness itself — `dist/` once installed, `src/` when run from sources.
 * Without it a mid-change upgrade keeps the environment identity untouched, so a frozen protocol
 * stays "qualified" for code that no longer exists and evidence from two builds compares as one.
 */
function buildIdentity(): { version: string; build_digest: string } {
	const root = packageRoot(dirname(fileURLToPath(import.meta.url)));
	if (!root) return { version: "unknown", build_digest: "sha256:unknown" };
	const version = harnessVersion();
	const tree = ["dist", "src"].map((d) => join(root, d)).find((d) => existsSync(d));
	if (!tree) return { version, build_digest: "sha256:unknown" };
	const hash = createHash("sha256");
	const stack = [tree];
	const files: string[] = [];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let names: string[];
		try {
			names = readdirSync(dir).sort();
		} catch {
			continue; // an unreadable directory does not contribute to the build digest
		}
		for (const name of names) {
			const abs = join(dir, name);
			let st: ReturnType<typeof statSync>;
			try {
				st = statSync(abs);
			} catch {
				continue; // an entry that disappeared mid-scan does not contribute either
			}
			if (st.isDirectory()) stack.push(abs);
			else if (/\.(js|mjs|cjs|ts|json)$/.test(name)) files.push(abs);
		}
	}
	for (const file of files.sort()) {
		try {
			hash.update(file.slice(tree.length).split(sep).join("/"));
			hash.update(readFileSync(file));
		} catch {
			/* a file that disappeared mid-scan simply does not contribute */
		}
	}
	return { version, build_digest: `sha256:${hash.digest("hex")}` };
}

let cachedBuild: { version: string; build_digest: string } | null = null;

function harnessBuild(): { version: string; build_digest: string } {
	cachedBuild ??= buildIdentity();
	return cachedBuild;
}

function version(cmd: string, args: readonly string[]): string {
	try {
		return (
			execFileSync(cmd, args, { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] })
				.trim()
				.split("\n")[0] ?? ""
		);
	} catch {
		return "absent";
	}
}

/**
 * Environment identity used by qualifications and evidence (RM-018, RM-076): the platform, the host, the build
 * of 495, and the version each of `probes` prints.
 */
export function describeEnvironment(
	piVersion: string,
	sandboxBackend: string,
	probes: Readonly<Record<string, ToolProbe>>,
): { facts: EnvironmentFacts; ref: EnvironmentRef } {
	const tools: Record<string, string> = {};
	for (const [name, [cmd, args]] of Object.entries(probes)) tools[name] = version(cmd, args);
	const facts: EnvironmentFacts = {
		platform: process.platform,
		arch: process.arch,
		node: process.version,
		pi_version: piVersion,
		sandbox_backend: sandboxBackend,
		harness: harnessBuild(),
		tools,
	};
	const digest = digestValue(facts);
	return { facts, ref: { environment_id: `env_${digest.slice(7, 19)}`, digest, profile_id: sandboxBackend } };
}
