/**
 * Installing the package a recommendation describes into a copy of the target: the plan is decided
 * from the files of the reference alone, and what the package manager leaves behind is accepted only
 * when it is what was asked for.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InstalledPackage, PackageInstall, RecommendedComplement } from "../contracts/v1/protocol.ts";
import type { SandboxPort, SandboxProfile, WorkspacePolicy, WorkspacePort } from "../ports/execution.ts";
import { BASE_ENV } from "./stacks/stack.ts";

/** What installing a package comes to: the command to run in the copy, or why it cannot be run. */
export type InstallPlan = { kind: "command"; command: string[] } | { kind: "refused"; reason: string };

/** The lock files of the package managers 495 does not run: a target that holds one is not installed with npm. */
const OTHER_MANAGERS_LOCKS = ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];

/**
 * The npm command that installs `install` as an exact development dependency without running any
 * install script, or the reason it is not run: a target locked by another manager, or by none, is
 * not one npm can extend without choosing the tree of its dependencies itself.
 */
export function planInstall(files: readonly string[], install: PackageInstall): InstallPlan {
	const foreign = OTHER_MANAGERS_LOCKS.find((lock) => files.includes(lock));
	if (foreign !== undefined)
		return { kind: "refused", reason: `${foreign} is the lock of a manager other than npm, and only npm is run` };
	if (!files.includes("package-lock.json"))
		return { kind: "refused", reason: "the target has no package-lock.json, so npm would choose the whole tree" };
	return {
		kind: "command",
		command: [
			install.manager,
			"install",
			"--save-dev",
			"--save-exact",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			`${install.package}@${install.version}`,
		],
	};
}

/** A copy of the target as far as an install can change it: each file by its digest, and the two manifests as text. */
export interface InstallState {
	files: Readonly<Record<string, string>>;
	package_json: string;
	package_lock: string;
}

/** What an install left: the files to keep with the packages that were added, or what keeps it from being accepted. */
export type InstallInspection =
	| { kind: "accepted"; files: string[]; packages: InstalledPackage[] }
	| { kind: "refused"; reason: string };

/** An install that ran in a copy and was not adopted, and why. */
export interface FailedInstall {
	install: PackageInstall;
	reason: string;
}

/**
 * The recommendations as the owner and the report read them, with those whose install can be run. A
 * recommendation whose install cannot be run, or ran and was not adopted, says why in its own text,
 * so that it is not read as one 495 will do.
 */
export function installableRecommendations(
	files: readonly string[],
	recommendations: readonly RecommendedComplement[],
	failed: readonly FailedInstall[] = [],
): { recommendations: RecommendedComplement[]; installable: RecommendedComplement[] } {
	const installable: RecommendedComplement[] = [];
	const described = recommendations.map((r) => {
		if (r.install === undefined) return r;
		const earlier = failed.find(
			(f) => f.install.package === r.install?.package && f.install.version === r.install.version,
		);
		if (earlier !== undefined)
			return { ...r, change: `${r.change}; the install ran in a copy and nothing was adopted: ${earlier.reason}` };
		const plan = planInstall(files, r.install);
		if (plan.kind === "command") {
			installable.push(r);
			return r;
		}
		return { ...r, change: `${r.change}; 495 does not run this install: ${plan.reason}` };
	});
	return { recommendations: described, installable };
}

const NODE_MODULES = "node_modules/";
/** The files an install rewrites by nature: the two manifests, and the copy of the lock npm keeps under `node_modules/`. */
const MANIFESTS = ["package.json", "package-lock.json", `${NODE_MODULES}.package-lock.json`];

/** The first file the install touched that it had no reason to touch, or null. */
function unexpectedFile(before: InstallState, after: InstallState): string | null {
	const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
	for (const path of paths) {
		if (before.files[path] === after.files[path]) continue;
		if (MANIFESTS.includes(path)) continue;
		if (!path.startsWith(NODE_MODULES))
			return `the install wrote ${path}, outside package.json, package-lock.json and node_modules/`;
		if (path in before.files) return `the install changed ${path}, which already existed under node_modules/`;
	}
	return null;
}

/** The first entry of `package.json` that is not the one asked for, or why the one asked for is not as asked. */
function unexpectedEntry(before: InstallState, after: InstallState, install: PackageInstall): string | null {
	const previous = JSON.parse(before.package_json) as Record<string, unknown>;
	const current = JSON.parse(after.package_json) as Record<string, unknown>;
	const { devDependencies: wanted = {}, ...rest } = current;
	const { devDependencies: had = {}, ...restBefore } = previous;
	for (const key of new Set([...Object.keys(rest), ...Object.keys(restBefore)]))
		if (JSON.stringify(rest[key]) !== JSON.stringify(restBefore[key]))
			return `package.json changed its ${key}, which is not the entry of ${install.package}`;
	const declared = wanted as Record<string, string>;
	const declaredBefore = had as Record<string, string>;
	for (const name of new Set([...Object.keys(declared), ...Object.keys(declaredBefore)]))
		if (name !== install.package && declared[name] !== declaredBefore[name])
			return `package.json changed the devDependencies entry ${name}, which is not ${install.package}`;
	if (declared[install.package] !== install.version)
		return `package.json declares ${install.package} as ${JSON.stringify(declared[install.package])}, not the exact ${install.version}`;
	return null;
}

interface LockEntry {
	version?: string;
	integrity?: string;
}

function lockEntries(text: string): Record<string, LockEntry> {
	return (JSON.parse(text) as { packages?: Record<string, LockEntry> }).packages ?? {};
}

/** The packages the lock names after the install and did not before, each by the name its path ends with. */
function addedPackages(before: InstallState, after: InstallState): InstalledPackage[] | string {
	const known = lockEntries(before.package_lock);
	const packages: InstalledPackage[] = [];
	for (const [path, entry] of Object.entries(lockEntries(after.package_lock))) {
		const at = path.lastIndexOf(NODE_MODULES);
		if (at < 0 || known[path]?.version === entry.version) continue;
		if (entry.version === undefined || entry.integrity === undefined)
			return `package-lock.json names ${path} without ${entry.version === undefined ? "a version" : "an integrity"}`;
		packages.push({ name: path.slice(at + NODE_MODULES.length), version: entry.version, integrity: entry.integrity });
	}
	return packages;
}

/**
 * Accepts an install only when it touched `package.json`, `package-lock.json`, npm's own copy of the lock
 * under `node_modules/` and files that did not exist there, and `package.json` gained the entry of the package asked for at its
 * exact version. Where the packages come from is not judged: that is npm's and its repositories'.
 */
export function inspectInstall(before: InstallState, after: InstallState, install: PackageInstall): InstallInspection {
	const file = unexpectedFile(before, after);
	if (file !== null) return { kind: "refused", reason: file };
	let entry: string | null;
	let packages: InstalledPackage[] | string;
	try {
		entry = unexpectedEntry(before, after, install);
		packages = addedPackages(before, after);
	} catch {
		return { kind: "refused", reason: "package.json or package-lock.json is not readable JSON after the install" };
	}
	if (entry !== null) return { kind: "refused", reason: entry };
	if (typeof packages === "string") return { kind: "refused", reason: packages };
	const files = Object.keys(after.files).filter((path) => after.files[path] !== before.files[path]);
	return { kind: "accepted", files, packages };
}

/** What running the install command in the copy came to. */
export type InstallRun = { kind: "installed" } | { kind: "failed"; reason: string };

const CACHE_QUERY_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const REASON_TAIL_CHARS = 500;

/** The variables npm reads its configuration, its proxy and its authentication from; nothing else of the session reaches it. */
const NPM_ENV_NAMES = [
	"NODE_AUTH_TOKEN",
	"NPM_TOKEN",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"no_proxy",
	"NODE_EXTRA_CA_CERTS",
	"SSL_CERT_FILE",
];

function npmEnvAllowlist(source: NodeJS.ProcessEnv): string[] {
	const configured = Object.keys(source).filter((name) => /^npm_config_/i.test(name));
	return [...BASE_ENV, ...NPM_ENV_NAMES, ...configured];
}

function tail(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes).trim().slice(-REASON_TAIL_CHARS);
}

/**
 * Runs the planned install in the copy at `copyPath`. The cache directory is asked of npm first, offline,
 * so that its configuration, the machine's and the project's, decides where it is; the install then runs
 * with the network open and no write outside the copy and that directory, which is given as npm said it.
 * Nothing here chooses a repository, an authentication or a cache: npm reads them itself.
 */
export async function runInstall(
	sandbox: SandboxPort,
	copyPath: string,
	command: readonly string[],
	source: NodeJS.ProcessEnv = process.env,
): Promise<InstallRun> {
	const profile = (network: SandboxProfile["network"], writable: string[]): SandboxProfile => ({
		profile_id: "install",
		read_paths: [copyPath],
		write_paths: writable,
		network,
		env_allowlist: npmEnvAllowlist(source),
		env: {},
	});
	const asked = await sandbox.run(profile("denied", []), {
		command: ["npm", "config", "get", "cache"],
		cwd: copyPath,
		timeout_ms: CACHE_QUERY_TIMEOUT_MS,
		max_output_bytes: MAX_OUTPUT_BYTES,
	});
	const cache = new TextDecoder().decode(asked.stdout).trim();
	if (asked.exit_code !== 0 || cache === "")
		return {
			kind: "failed",
			reason: `npm did not say its cache directory: ${asked.spawn_error ?? tail(asked.stderr)}`,
		};
	const observed = await sandbox.run(profile("allowed", [copyPath, cache]), {
		command: [...command],
		cwd: copyPath,
		timeout_ms: INSTALL_TIMEOUT_MS,
		max_output_bytes: MAX_OUTPUT_BYTES,
	});
	if (observed.exit_code === 0) return { kind: "installed" };
	const why = observed.timed_out
		? "timed out"
		: (observed.spawn_error ?? `exited ${observed.exit_code}: ${tail(observed.stderr)}`);
	return { kind: "failed", reason: `${command.join(" ")} ${why}` };
}

/** What the install left in the copy, ready to be kept: each file with its digest, and the packages that were added. */
export type InstalledCopy =
	| { kind: "installed"; files: { path: string; digest: string }[]; packages: InstalledPackage[] }
	| { kind: "failed"; reason: string };

export interface InstallDeps {
	workspace: WorkspacePort;
	workspacePolicy: WorkspacePolicy;
	install: (copyPath: string, command: readonly string[]) => Promise<InstallRun>;
}

/** The copy as an install can change it, or why it cannot be listed in full. */
async function stateOf(deps: InstallDeps, copyPath: string): Promise<InstallState | string> {
	const snapshot = await deps.workspace.captureReference(copyPath, deps.workspacePolicy);
	if (snapshot.limits.truncated)
		return `the copy could not be listed in full: ${snapshot.limits.notes.join("; ") || "a limit was reached"}`;
	const files: Record<string, string> = {};
	// A link carries no bytes to keep: the tree that is kept holds regular files only.
	for (const entry of snapshot.entries)
		if (entry.kind === "file" && entry.content_digest !== null) files[entry.path] = entry.content_digest;
	try {
		return {
			files,
			package_json: readFileSync(join(copyPath, "package.json"), "utf8"),
			package_lock: readFileSync(join(copyPath, "package-lock.json"), "utf8"),
		};
	} catch (error) {
		return `package.json or package-lock.json cannot be read: ${(error as Error).message}`;
	}
}

/**
 * Installs the package in the copy at `copyPath` and keeps the result only when the inspection accepts
 * it. `referenceFiles` are the files of the reference the copy was made from, which decide the plan.
 */
export async function installInCopy(
	deps: InstallDeps,
	copyPath: string,
	install: PackageInstall,
	referenceFiles: readonly string[],
): Promise<InstalledCopy> {
	const plan = planInstall(referenceFiles, install);
	if (plan.kind === "refused") return { kind: "failed", reason: plan.reason };
	const before = await stateOf(deps, copyPath);
	if (typeof before === "string") return { kind: "failed", reason: before };
	const run = await deps.install(copyPath, plan.command);
	if (run.kind === "failed") return run;
	const after = await stateOf(deps, copyPath);
	if (typeof after === "string") return { kind: "failed", reason: after };
	const inspected = inspectInstall(before, after, install);
	if (inspected.kind === "refused") return { kind: "failed", reason: inspected.reason };
	return {
		kind: "installed",
		files: inspected.files.map((path) => ({ path, digest: after.files[path]! })),
		packages: inspected.packages,
	};
}
