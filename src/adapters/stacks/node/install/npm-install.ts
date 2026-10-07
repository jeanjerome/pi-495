/**
 * How the Node technology brings a package into a copy of the target: npm installs it in the copy as an exact
 * development dependency, without running any install script, and what it leaves behind is accepted only when
 * it is what was asked for. npm writes its cache outside the copy, which it is asked for first.
 */
import type { InstalledPackage, PackageInstall } from "../../../../contracts/v1/protocol.ts";
import type {
	InstallCapability,
	InstallInspection,
	InstallPlan,
	InstallState,
} from "../../../../application/stacks/plugin.ts";
import { NPM_PHRASES } from "./npm-phrases.ts";
import { applyScriptsTestEdit } from "./scripts-test-edit.ts";

/** The lock files of the package managers 495 does not run: a target that holds one is not installed with npm. */
const OTHER_MANAGERS_LOCKS = ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"];

/**
 * The command that installs every package of `installs`, in one install, as an exact development dependency
 * without running any install script, or the reason it is not run: a target locked by another manager, or by
 * none, is not one npm can extend without choosing the tree of its dependencies itself.
 */
function planNpmInstall(files: readonly string[], installs: readonly PackageInstall[]): InstallPlan {
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

const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK = "package-lock.json";
const NODE_MODULES = "node_modules/";
/** The files an install rewrites by nature: the two manifests, and the copy of the lock npm keeps under `node_modules/`. */
const MANIFESTS = [PACKAGE_JSON, PACKAGE_LOCK, `${NODE_MODULES}.package-lock.json`];

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

const textOf = (state: InstallState, path: string): string => state.texts[path] ?? "";

/**
 * The first file the install touched that it had no reason to touch, or null. npm prunes what the lock
 * does not name, so a file of a package the lock did not name before the install may be gone after it;
 * a lock that names no package this way lets no file be removed.
 */
function unexpectedFile(before: InstallState, after: InstallState): string | null {
	const locked = lockedPackages(textOf(before, PACKAGE_LOCK));
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
	const previous = JSON.parse(textOf(before, PACKAGE_JSON)) as Record<string, unknown>;
	const current = JSON.parse(textOf(after, PACKAGE_JSON)) as Record<string, unknown>;
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
	const known = lockEntries(textOf(before, PACKAGE_LOCK));
	const packages: InstalledPackage[] = [];
	for (const [path, entry] of Object.entries(lockEntries(textOf(after, PACKAGE_LOCK)))) {
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
export function inspectNpmInstall(
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

export const NPM_INSTALL: InstallCapability = {
	manager: "npm",
	title: "npm",
	form: "install",
	plan: planNpmInstall,
	reads: [PACKAGE_JSON, PACKAGE_LOCK],
	inspect: inspectNpmInstall,
	outside_write: {
		command: ["npm", "config", "get", "cache"],
		read: (stdout) => stdout.trim() || null,
		unsaid: "npm did not say its cache directory",
	},
	// npm also reads every `npm_config_*` variable, whatever its case, as its own configuration.
	env: { names: NPM_ENV_NAMES, prefixes: ["npm_config_"] },
	failure_output: "stderr",
	edit: applyScriptsTestEdit,
	phrases: NPM_PHRASES,
};
