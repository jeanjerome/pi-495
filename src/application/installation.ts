/**
 * Installing the package a recommendation describes into a copy of the target, or resolving its Maven
 * plugin there: the plan is decided from the files of the reference alone, and what the package manager
 * leaves behind is accepted only when it is what was asked for.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digestBytes } from "../contracts/digest.ts";
import type { ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { FileEdit, InstalledPackage, PackageInstall, RecommendedComplement } from "../contracts/v1/protocol.ts";
import { messageOf } from "../domain/errors.ts";
import type { SandboxPort, SandboxProfile, WorkspacePolicy, WorkspacePort } from "../ports/execution.ts";
import { editedFile } from "./complement.ts";
import { MAVEN_DEPENDENCY_PLUGIN_VERSION } from "./stacks/maven.ts";
import { BASE_ENV } from "./stacks/stack.ts";

/** What installing a package comes to: the command to run in the copy, or why it cannot be run. */
export type InstallPlan = { kind: "command"; command: string[] } | { kind: "refused"; reason: string };

/** The lock files of the package managers 495 does not run: a target that holds one is not installed with npm. */
const OTHER_MANAGERS_LOCKS = ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];

/**
 * The command that installs `installs`. For Maven, the plugins of the copy are resolved with the
 * dependency plugin the catalogue pins, which runs no goal of any plugin it resolves. For npm, it
 * installs every package of `installs`, in one install, as an exact development dependency without
 * running any install script, or gives the reason it is not run: a target locked by another manager, or
 * by none, is not one npm can extend without choosing the tree of its dependencies itself.
 */
export function planInstall(files: readonly string[], installs: readonly PackageInstall[]): InstallPlan {
	if (installs.some((install) => install.manager === "maven"))
		return {
			kind: "command",
			command: [
				"mvn",
				"-B",
				`org.apache.maven.plugins:maven-dependency-plugin:${MAVEN_DEPENDENCY_PLUGIN_VERSION}:resolve-plugins`,
			],
		};
	const foreign = OTHER_MANAGERS_LOCKS.find((lock) => files.includes(lock));
	if (foreign !== undefined)
		return { kind: "refused", reason: `${foreign} is the lock of a manager other than npm, and only npm is run` };
	if (!files.includes("package-lock.json"))
		return { kind: "refused", reason: "the target has no package-lock.json, so npm would choose the whole tree" };
	return {
		kind: "command",
		command: [
			"npm",
			"install",
			"--save-dev",
			"--save-exact",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			...installs.map((install) => `${install.package}@${install.version}`),
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
 * so that it is not read as one 495 will do. A Maven install is run only where Maven announced its
 * local repository, which `localRepository` carries.
 */
export function installableRecommendations(
	files: readonly string[],
	recommendations: readonly RecommendedComplement[],
	failed: readonly FailedInstall[],
	localRepository: string | null,
): { recommendations: RecommendedComplement[]; installable: RecommendedComplement[] } {
	const installable: RecommendedComplement[] = [];
	const described = recommendations.map((r) => {
		if (r.install === undefined) return r;
		const earlier = failed.find(
			(f) => f.install.package === r.install?.package && f.install.version === r.install.version,
		);
		if (earlier !== undefined)
			return { ...r, change: `${r.change}; the install ran in a copy and nothing was adopted: ${earlier.reason}` };
		const plan = planInstall(files, [r.install]);
		if (r.install.manager === "maven" && localRepository === null)
			return {
				...r,
				change: `${r.change}; 495 does not run this install: Maven's local repository could not be established`,
			};
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

/** The directory of the package a file under `node_modules/` belongs to, as the lock names packages. */
function packageOf(path: string): string {
	const at = path.lastIndexOf(NODE_MODULES) + NODE_MODULES.length;
	const [name = "", scoped] = path.slice(at).split("/");
	return path.slice(0, at) + (name.startsWith("@") && scoped !== undefined ? `${name}/${scoped}` : name);
}

/** A lockfileVersion 1 entry: its own dependencies sit under its `node_modules/`. */
interface LegacyLockEntry {
	dependencies?: Record<string, LegacyLockEntry>;
}

/** The directory of each package under `dependencies`, nested ones under the `node_modules/` of the one that holds them. */
function legacyPaths(dependencies: Record<string, LegacyLockEntry>, prefix: string): string[] {
	return Object.entries(dependencies).flatMap(([name, entry]) => {
		const path = `${prefix}${NODE_MODULES}${name}`;
		return [path, ...legacyPaths(entry.dependencies ?? {}, `${path}/`)];
	});
}

/**
 * The directory of each package the lock names, under `packages` from lockfileVersion 2 and under
 * `dependencies` in lockfileVersion 1, or null when it carries neither and so names nothing that can be told apart.
 */
function lockedPackages(text: string): Set<string> | null {
	const lock = JSON.parse(text) as {
		packages?: Record<string, unknown>;
		dependencies?: Record<string, LegacyLockEntry>;
	};
	if (lock.packages !== undefined) return new Set(Object.keys(lock.packages));
	if (lock.dependencies !== undefined) return new Set(legacyPaths(lock.dependencies, ""));
	return null;
}

/**
 * The first file the install touched that it had no reason to touch, or null. npm prunes what the lock
 * does not name, so a file of a package the lock did not name before the install may be gone after it;
 * a lock that names no package this way lets no file be removed.
 */
function unexpectedFile(before: InstallState, after: InstallState): string | null {
	const locked = lockedPackages(before.package_lock);
	const paths = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();
	for (const path of paths) {
		if (before.files[path] === after.files[path]) continue;
		if (MANIFESTS.includes(path)) continue;
		if (!path.startsWith(NODE_MODULES))
			return `the install wrote ${path}, outside package.json, package-lock.json and node_modules/`;
		if (!(path in before.files)) continue;
		if (!(path in after.files) && locked !== null && !locked.has(packageOf(path))) continue;
		return `the install changed ${path}, which already existed under node_modules/`;
	}
	return null;
}

/** The first entry of `package.json` that is not one asked for, or why one asked for is not as asked. */
function unexpectedEntry(
	before: InstallState,
	after: InstallState,
	installs: readonly PackageInstall[],
): string | null {
	const previous = JSON.parse(before.package_json) as Record<string, unknown>;
	const current = JSON.parse(after.package_json) as Record<string, unknown>;
	const { devDependencies: wanted = {}, ...rest } = current;
	const { devDependencies: had = {}, ...restBefore } = previous;
	const asked = installs.map((install) => install.package);
	for (const key of new Set([...Object.keys(rest), ...Object.keys(restBefore)]))
		if (JSON.stringify(rest[key]) !== JSON.stringify(restBefore[key]))
			return `package.json changed its ${key}, which is not the entry of ${asked.join(", ")}`;
	const declared = wanted as Record<string, string>;
	const declaredBefore = had as Record<string, string>;
	for (const name of new Set([...Object.keys(declared), ...Object.keys(declaredBefore)]))
		if (!asked.includes(name) && declared[name] !== declaredBefore[name])
			return `package.json changed the devDependencies entry ${name}, which is not ${asked.join(", ")}`;
	for (const install of installs)
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
 * under `node_modules/`, files that did not exist there and the files it pruned of packages the lock did
 * not name, and `package.json` gained the entry of each package asked for at its exact version. Where the
 * packages come from is not judged: that is npm's and its repositories'.
 */
export function inspectInstall(
	before: InstallState,
	after: InstallState,
	installs: readonly PackageInstall[],
): InstallInspection {
	let entry: string | null;
	let packages: InstalledPackage[] | string;
	try {
		const file = unexpectedFile(before, after);
		if (file !== null) return { kind: "refused", reason: file };
		entry = unexpectedEntry(before, after, installs);
		packages = addedPackages(before, after);
	} catch {
		return { kind: "refused", reason: "package.json or package-lock.json is not readable JSON after the install" };
	}
	if (entry !== null) return { kind: "refused", reason: entry };
	if (typeof packages === "string") return { kind: "refused", reason: packages };
	const files = Object.keys(after.files).filter((path) => after.files[path] !== before.files[path]);
	return { kind: "accepted", files, packages };
}

/** What running the install command in the copy came to; Maven's output is kept, for the dossier to show what it downloaded. */
export type InstallRun = { kind: "installed"; output?: string } | { kind: "failed"; reason: string };

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

/** The variables Maven reads its own options and its installation from, besides the ones every control receives. */
const MAVEN_ENV_NAMES = ["MAVEN_ARGS", "MAVEN_HOME", "M2_HOME"];

function npmEnvAllowlist(source: NodeJS.ProcessEnv): string[] {
	const configured = Object.keys(source).filter((name) => /^npm_config_/i.test(name));
	return [...BASE_ENV, ...NPM_ENV_NAMES, ...configured];
}

function tail(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes).trim().slice(-REASON_TAIL_CHARS);
}

/**
 * What a package manager is asked offline before its step runs, so that the one directory it writes
 * outside the copy is the one it says, configuration of the machine and of the project applied.
 */
interface OutsideWriteQuery {
	command: string[];
	/** The directory the answer names, or null when it names none. */
	read: (stdout: string) => string | null;
	unsaid: string;
	env: (source: NodeJS.ProcessEnv) => string[];
}

const NPM_CACHE_QUERY: OutsideWriteQuery = {
	command: ["npm", "config", "get", "cache"],
	read: (stdout) => stdout.trim() || null,
	unsaid: "npm did not say its cache directory",
	env: npmEnvAllowlist,
};

const MAVEN_LOCAL_REPOSITORY_QUERY: OutsideWriteQuery = {
	command: ["mvn", "-X", "-o", "-B", "validate"],
	read: readLocalRepository,
	unsaid: "Maven did not announce its local repository",
	env: () => [...BASE_ENV, ...MAVEN_ENV_NAMES],
};

const OUTSIDE_WRITE_QUERIES: Record<string, OutsideWriteQuery> = {
	npm: NPM_CACHE_QUERY,
	mvn: MAVEN_LOCAL_REPOSITORY_QUERY,
};

/** The profile an install step runs under: the copy readable, the network and the writable paths as given. */
function installProfile(
	query: OutsideWriteQuery,
	copyPath: string,
	source: NodeJS.ProcessEnv,
	network: SandboxProfile["network"],
	writable: string[],
): SandboxProfile {
	return {
		profile_id: "install",
		read_paths: [copyPath],
		write_paths: writable,
		network,
		env_allowlist: query.env(source),
		env: {},
	};
}

/** The directory the manager says it writes outside the copy, or why it said none. */
async function askedOutsideWrite(
	sandbox: SandboxPort,
	query: OutsideWriteQuery,
	copyPath: string,
	source: NodeJS.ProcessEnv,
): Promise<{ path: string } | { reason: string }> {
	const asked = await sandbox.run(installProfile(query, copyPath, source, "denied", []), {
		command: query.command,
		cwd: copyPath,
		timeout_ms: CACHE_QUERY_TIMEOUT_MS,
		max_output_bytes: MAX_OUTPUT_BYTES,
	});
	const outside = asked.exit_code === 0 ? query.read(new TextDecoder().decode(asked.stdout)) : null;
	return outside === null
		? { reason: `${query.unsaid}: ${asked.spawn_error ?? tail(asked.stderr)}` }
		: { path: outside };
}

/** The local repository Maven announces for the copy at `copyPath`, or the reason it announces none. */
export async function askedLocalRepository(
	sandbox: SandboxPort,
	copyPath: string,
	source: NodeJS.ProcessEnv = process.env,
): Promise<{ path: string } | { reason: string }> {
	return askedOutsideWrite(sandbox, MAVEN_LOCAL_REPOSITORY_QUERY, copyPath, source);
}

/**
 * Runs the planned install in the copy at `copyPath`. The directory the manager writes outside the
 * copy, its cache for npm and its local repository for Maven, is asked of it first, offline, so that its
 * configuration, the machine's and the project's, decides where it is; the install then runs with the
 * network open and no write outside the copy and that directory, which is given as the manager said it.
 * Nothing here chooses a repository, an authentication or a directory: the manager reads them itself.
 * A caller that asked for the directory already, before it changed the copy, hands it over as `known`.
 */
export async function runInstall(
	sandbox: SandboxPort,
	copyPath: string,
	command: readonly string[],
	known?: string,
	source: NodeJS.ProcessEnv = process.env,
): Promise<InstallRun> {
	const query = OUTSIDE_WRITE_QUERIES[command[0] ?? ""];
	if (query === undefined) return { kind: "failed", reason: `${command[0]} is not a package manager 495 runs` };
	const outside = known === undefined ? await askedOutsideWrite(sandbox, query, copyPath, source) : { path: known };
	if ("reason" in outside) return { kind: "failed", reason: outside.reason };
	const observed = await sandbox.run(installProfile(query, copyPath, source, "allowed", [copyPath, outside.path]), {
		command: [...command],
		cwd: copyPath,
		timeout_ms: INSTALL_TIMEOUT_MS,
		max_output_bytes: MAX_OUTPUT_BYTES,
	});
	const maven = command[0] === "mvn";
	if (observed.exit_code === 0)
		return maven ? { kind: "installed", output: new TextDecoder().decode(observed.stdout) } : { kind: "installed" };
	// Maven says the cause on its standard output and leaves its error output to the JVM's warnings; npm says it on its error output.
	const said = maven ? tail(observed.stdout) || tail(observed.stderr) : tail(observed.stderr) || tail(observed.stdout);
	const why = observed.timed_out ? "timed out" : (observed.spawn_error ?? `exited ${observed.exit_code}: ${said}`);
	return { kind: "failed", reason: `${command.join(" ")} ${why}` };
}

/** What the install left in the copy, ready to be kept: each file with its digest and its mode, and the packages that were added. */
export type InstalledCopy =
	| { kind: "installed"; files: { path: string; digest: string; mode: string }[]; packages: InstalledPackage[] }
	| { kind: "failed"; reason: string };

export interface InstallDeps {
	workspace: WorkspacePort;
	workspacePolicy: WorkspacePolicy;
	install: (copyPath: string, command: readonly string[], outside?: string) => Promise<InstallRun>;
	/** The local repository Maven announces for a copy, or null when it announces none. */
	localRepository: (copyPath: string) => Promise<string | null>;
}

/** Each regular file of the copy under `policy`, by its digest and by its mode, or why the copy cannot be listed in full. */
async function listedCopy(
	deps: InstallDeps,
	copyPath: string,
	policy: WorkspacePolicy,
): Promise<{ files: CopyFiles; modes: CopyModes } | string> {
	const snapshot = await deps.workspace.captureReference(copyPath, policy);
	if (snapshot.limits.truncated)
		return `the copy could not be listed in full: ${snapshot.limits.notes.join("; ") || "a limit was reached"}`;
	const files: Record<string, string> = {};
	const modes: Record<string, string> = {};
	// A link carries no bytes to keep: the tree that is kept holds regular files only.
	for (const entry of snapshot.entries)
		if (entry.kind === "file" && entry.content_digest !== null) {
			files[entry.path] = entry.content_digest;
			modes[entry.path] = entry.mode;
		}
	return { files, modes };
}

/** The copy as an install can change it, with the mode of each file, or why it cannot be listed in full. */
async function stateOf(deps: InstallDeps, copyPath: string): Promise<(InstallState & { modes: CopyModes }) | string> {
	const listed = await listedCopy(deps, copyPath, deps.workspacePolicy);
	if (typeof listed === "string") return listed;
	try {
		return {
			...listed,
			package_json: readFileSync(join(copyPath, "package.json"), "utf8"),
			package_lock: readFileSync(join(copyPath, "package-lock.json"), "utf8"),
		};
	} catch (error) {
		return `package.json or package-lock.json cannot be read: ${messageOf(error)}`;
	}
}

/**
 * Installs the packages in the copy at `copyPath`, in one install, and keeps the result only when the
 * inspection accepts it. `referenceFiles` are the files of the reference the copy was made from, which
 * decide the plan.
 */
export async function installInCopy(
	deps: InstallDeps,
	copyPath: string,
	installs: readonly PackageInstall[],
	referenceFiles: readonly string[],
): Promise<InstalledCopy> {
	const plan = planInstall(referenceFiles, installs);
	if (plan.kind === "refused") return { kind: "failed", reason: plan.reason };
	const before = await stateOf(deps, copyPath);
	if (typeof before === "string") return { kind: "failed", reason: before };
	const run = await deps.install(copyPath, plan.command);
	if (run.kind === "failed") return run;
	const after = await stateOf(deps, copyPath);
	if (typeof after === "string") return { kind: "failed", reason: after };
	const inspected = inspectInstall(before, after, installs);
	if (inspected.kind === "refused") return { kind: "failed", reason: inspected.reason };
	return {
		kind: "installed",
		files: inspected.files.map((path) => ({ path, digest: after.files[path]!, mode: after.modes[path]! })),
		packages: inspected.packages,
	};
}

/** The line a debug run of Maven announces its local repository with, configuration of the machine and of the project applied. */
const LOCAL_REPOSITORY_LINE = /^\[DEBUG\] Using local repository at ([^\r\n]+)/m;

/** The local repository Maven announces in the output of a debug run, as announced, or null when it announces none. */
export function readLocalRepository(output: string): string | null {
	return LOCAL_REPOSITORY_LINE.exec(output)?.[1] ?? null;
}

/** What a Maven resolution left in the copy: accepted, or what keeps it from being accepted. */
export type ResolutionInspection = { kind: "accepted" } | { kind: "refused"; reason: string };

/** The digest of each file of a copy, by path. */
export type CopyFiles = Readonly<Record<string, string>>;

/** The mode of each file of a copy, by path, as six octal digits. */
type CopyModes = Readonly<Record<string, string>>;

/**
 * Accepts a resolution only when the copy holds what 495 wrote into it and nothing else changed: each
 * file in `written` is as written, and every other file is as it was, none added and none removed.
 * The resolution writes the local repository of Maven, which is outside the copy.
 */
export function inspectResolution(
	before: CopyFiles,
	after: CopyFiles,
	written: readonly { path: string; digest: string }[],
): ResolutionInspection {
	const expected = new Map(written.map((w) => [w.path, w.digest] as const));
	const paths = [...new Set([...Object.keys(before), ...Object.keys(after), ...expected.keys()])].sort();
	for (const path of paths) {
		if (after[path] === (expected.get(path) ?? before[path])) continue;
		return {
			kind: "refused",
			reason: `the resolution left ${path} ${expected.has(path) ? "other than 495 wrote it" : "changed, and only the local repository of Maven is written outside pom.xml"}`,
		};
	}
	return { kind: "accepted" };
}

/** What resolving the plugin of a recommendation in a copy came to: Maven's output, or why nothing is adopted. */
export type ResolvedPlugin = { kind: "resolved"; output: string } | { kind: "failed"; reason: string };

/**
 * Declares the plugin in a copy of the reference, resolves it there with Maven and keeps the result only
 * when the inspection accepts it. The copy is one of its own and is deleted: `pom.xml` is written into the
 * copies of the verification from the object store, once the resolution is accepted.
 */
export async function resolveInCopy(
	deps: InstallDeps,
	reference: ReferenceSnapshot,
	install: PackageInstall,
	edit: FileEdit | undefined,
): Promise<ResolvedPlugin> {
	if (edit === undefined) return { kind: "failed", reason: "the recommendation carries no edit of pom.xml to resolve" };
	const plan = planInstall([], [install]);
	if (plan.kind === "refused") return { kind: "failed", reason: plan.reason };
	const handle = await deps.workspace.createWorkspace(reference, deps.workspacePolicy);
	try {
		// Asked of the copy as the reference has it: once the POM declares a plugin the local repository does
		// not hold yet, an offline Maven fails before it can say where that repository is.
		const repository = await deps.localRepository(handle.path);
		if (repository === null) return { kind: "failed", reason: "Maven's local repository could not be established" };
		// The copy is listed with no exclusion: a file the resolution writes under a directory the policy leaves
		// out of a copy, such as target/, is a change like any other.
		const whole = { ...deps.workspacePolicy, exclusions: [] };
		const before = await listedCopy(deps, handle.path, whole);
		if (typeof before === "string") return { kind: "failed", reason: before };
		const text = editedFile(handle.path, edit);
		if (text === null) return { kind: "failed", reason: `the edit of ${edit.path} no longer applies` };
		writeFileSync(join(handle.path, edit.path), text);
		const run = await deps.install(handle.path, plan.command, repository);
		if (run.kind === "failed") return run;
		const after = await listedCopy(deps, handle.path, whole);
		if (typeof after === "string") return { kind: "failed", reason: after };
		const inspected = inspectResolution(before.files, after.files, [{ path: edit.path, digest: digestBytes(text) }]);
		return inspected.kind === "refused"
			? { kind: "failed", reason: inspected.reason }
			: { kind: "resolved", output: run.output ?? "" };
	} finally {
		await deps.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
}
