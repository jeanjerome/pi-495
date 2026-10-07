/**
 * Bringing the packages a recommendation describes into a copy of the target, with the package manager of
 * the technology that runs it: the plan is decided from the files of the reference alone, the copy is listed
 * before and after the manager runs, and what it left is kept only when the inspection its technology
 * declares accepts it. The network is open for that step alone, and nothing is written in the project.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digestBytes } from "../contracts/digest.ts";
import type { ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { FileEdit, InstalledPackage, PackageInstall, RecommendedComplement } from "../contracts/v1/protocol.ts";
import { messageOf } from "../domain/errors.ts";
import type { SandboxPort, SandboxProfile, WorkspacePolicy, WorkspacePort } from "../ports/execution.ts";
import { editedFile } from "./complement.ts";
import type { InstallCapability, InstallState } from "./stacks/plugin.ts";
import type { Installer } from "./stacks/registry.ts";
import { BASE_ENV } from "./stacks/stack.ts";

/** An install that ran in a copy and was not adopted, and why. */
export interface FailedInstall {
	install: PackageInstall;
	reason: string;
}

/** The files of the reference a copy is made from, which decide the plan. */
export const filesOf = (reference: ReferenceSnapshot): string[] =>
	reference.entries.filter((e) => e.kind === "file").map((e) => e.path);

/**
 * The recommendations as the owner and the report read them, with those whose install can be run. A
 * recommendation whose install cannot be run, or ran and was not adopted, says why in its own text,
 * so that it is not read as one 495 will do. An install whose manager no technology of the list runs is
 * not run, and one whose manager keeps what it writes outside the copy is run only where it said that
 * directory is, which `outside` carries by manager.
 */
export function installableRecommendations(
	files: readonly string[],
	recommendations: readonly RecommendedComplement[],
	failed: readonly FailedInstall[],
	installerOf: (manager: string) => Installer | null,
	outside: Readonly<Record<string, string>>,
): { recommendations: RecommendedComplement[]; installable: RecommendedComplement[] } {
	const installable: RecommendedComplement[] = [];
	const described = recommendations.map((r) => {
		if (r.install === undefined) return r;
		const earlier = failed.find(
			(f) => f.install.package === r.install?.package && f.install.version === r.install.version,
		);
		if (earlier !== undefined)
			return { ...r, change: `${r.change}; the install ran in a copy and nothing was adopted: ${earlier.reason}` };
		const install = installerOf(r.install.manager)?.install;
		if (install === undefined)
			return {
				...r,
				change: `${r.change}; 495 does not run this install: no technology of 495 runs ${r.install.manager}`,
			};
		const kept = install.outside_write?.kept;
		if (kept !== undefined && outside[install.manager] === undefined)
			return { ...r, change: `${r.change}; 495 does not run this install: ${kept.unestablished}` };
		const plan = install.plan(files, [r.install]);
		if (plan.kind === "command") {
			installable.push(r);
			return r;
		}
		return { ...r, change: `${r.change}; 495 does not run this install: ${plan.reason}` };
	});
	return { recommendations: described, installable };
}

/** What running the install command in the copy came to, with what the manager printed when its technology keeps it. */
export type InstallRun = { kind: "installed"; output?: string } | { kind: "failed"; reason: string };

const OUTSIDE_QUERY_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const REASON_TAIL_CHARS = 500;

/**
 * The variables of the session the manager reads: those every control reads, those its technology names, and
 * those that start with a prefix it declares, whatever their case. Nothing else of the session reaches it.
 */
function managerEnv(install: InstallCapability, source: NodeJS.ProcessEnv): string[] {
	const prefixes = (install.env.prefixes ?? []).map((prefix) => prefix.toLowerCase());
	const prefixed = Object.keys(source).filter((name) => prefixes.some((p) => name.toLowerCase().startsWith(p)));
	return [...BASE_ENV, ...install.env.names, ...prefixed];
}

function tail(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes).trim().slice(-REASON_TAIL_CHARS);
}

/** The profile an install step runs under: the copy readable, the network and the writable paths as given. */
function installProfile(
	install: InstallCapability,
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
		env_allowlist: managerEnv(install, source),
		env: {},
	};
}

/**
 * The directory the manager of `install` says it writes outside the copy at `copyPath`, asked offline and
 * with no writable path, or why it said none.
 */
export async function askedOutsideDirectory(
	sandbox: SandboxPort,
	install: InstallCapability,
	copyPath: string,
	source: NodeJS.ProcessEnv = process.env,
): Promise<{ path: string } | { reason: string }> {
	const query = install.outside_write;
	if (query === undefined) return { reason: `${install.title} writes nothing outside the copy` };
	const asked = await sandbox.run(installProfile(install, copyPath, source, "denied", []), {
		command: [...query.command],
		cwd: copyPath,
		timeout_ms: OUTSIDE_QUERY_TIMEOUT_MS,
		max_output_bytes: MAX_OUTPUT_BYTES,
	});
	const outside = asked.exit_code === 0 ? query.read(new TextDecoder().decode(asked.stdout)) : null;
	return outside === null
		? { reason: `${query.unsaid}: ${asked.spawn_error ?? tail(asked.stderr)}` }
		: { path: outside };
}

/**
 * Runs the planned install in the copy at `copyPath`. The directory the manager writes outside the copy, when
 * its technology declares one, is asked of it first, offline, so that its configuration, the machine's and the
 * project's, decides where it is; the install then runs with the network open and no write outside the copy
 * and that directory, which is given as the manager said it. Nothing here chooses a repository, an
 * authentication or a directory: the manager reads them itself. A caller that asked for the directory
 * already, before it changed the copy, hands it over as `known`.
 */
export async function runInstall(
	sandbox: SandboxPort,
	copyPath: string,
	command: readonly string[],
	install: InstallCapability,
	known?: string,
	source: NodeJS.ProcessEnv = process.env,
): Promise<InstallRun> {
	let writable = [copyPath];
	if (install.outside_write !== undefined) {
		const outside =
			known === undefined ? await askedOutsideDirectory(sandbox, install, copyPath, source) : { path: known };
		if ("reason" in outside) return { kind: "failed", reason: outside.reason };
		writable = [copyPath, outside.path];
	}
	const observed = await sandbox.run(installProfile(install, copyPath, source, "allowed", writable), {
		command: [...command],
		cwd: copyPath,
		timeout_ms: INSTALL_TIMEOUT_MS,
		max_output_bytes: MAX_OUTPUT_BYTES,
	});
	if (observed.exit_code === 0)
		return install.keeps_output
			? { kind: "installed", output: new TextDecoder().decode(observed.stdout) }
			: { kind: "installed" };
	const said =
		install.failure_output === "stdout"
			? tail(observed.stdout) || tail(observed.stderr)
			: tail(observed.stderr) || tail(observed.stdout);
	const why = observed.timed_out ? "timed out" : (observed.spawn_error ?? `exited ${observed.exit_code}: ${said}`);
	return { kind: "failed", reason: `${command.join(" ")} ${why}` };
}

/**
 * What bringing the packages left, ready to be kept: each file the inspection accepted, with its digest and its
 * mode, the packages that were added, and what the manager printed when its technology keeps it.
 */
export type BroughtInstall =
	| {
			kind: "brought";
			files: { path: string; digest: string; mode: string }[];
			packages: InstalledPackage[];
			output?: string;
	  }
	| { kind: "failed"; reason: string };

export interface InstallDeps {
	workspace: WorkspacePort;
	workspacePolicy: WorkspacePolicy;
	install: (
		copyPath: string,
		command: readonly string[],
		install: InstallCapability,
		outside?: string,
	) => Promise<InstallRun>;
	/** The directory the manager of `install` says it writes outside a copy, or null when it says none. */
	outsideDirectory: (copyPath: string, install: InstallCapability) => Promise<string | null>;
}

/** The digest of each file of a copy, by path. */
type CopyFiles = Readonly<Record<string, string>>;

/** The mode of each file of a copy, by path, as six octal digits. */
type CopyModes = Readonly<Record<string, string>>;

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

/** The copy as an install can change it, with the mode of each file, or why it cannot be listed in full or read. */
async function stateOf(
	deps: InstallDeps,
	copyPath: string,
	policy: WorkspacePolicy,
	reads: readonly string[],
): Promise<(InstallState & { modes: CopyModes }) | string> {
	const listed = await listedCopy(deps, copyPath, policy);
	if (typeof listed === "string") return listed;
	try {
		return {
			...listed,
			texts: Object.fromEntries(reads.map((path) => [path, readFileSync(join(copyPath, path), "utf8")])),
		};
	} catch (error) {
		return `${reads.join(" or ")} cannot be read: ${messageOf(error)}`;
	}
}

/**
 * The directory the manager keeps what it writes outside a copy in, asked of the copy at `copyPath` before
 * anything changes it: once the copy declares a package that directory does not hold yet, a manager asked
 * offline may fail before it can say where the directory is. Undefined for a manager whose writes there do
 * not stay, which `runInstall` asks itself.
 */
async function keptDirectory(
	deps: InstallDeps,
	install: InstallCapability,
	copyPath: string,
): Promise<{ path: string | undefined } | { reason: string }> {
	const kept = install.outside_write?.kept;
	if (kept === undefined) return { path: undefined };
	const path = await deps.outsideDirectory(copyPath, install);
	return path === null ? { reason: kept.unestablished } : { path };
}

/**
 * Runs the manager in the copy at `copyPath`, lists the copy before and after, and keeps what the inspection
 * of its technology accepts. `edit` is written into the copy, by the rule of the technology, before the
 * manager runs.
 */
async function runAndInspect(
	deps: InstallDeps,
	install: InstallCapability,
	copyPath: string,
	command: readonly string[],
	installs: readonly PackageInstall[],
	policy: WorkspacePolicy,
	edit?: FileEdit,
): Promise<BroughtInstall> {
	const outside = await keptDirectory(deps, install, copyPath);
	if ("reason" in outside) return { kind: "failed", reason: outside.reason };
	const reads = install.reads ?? [];
	const before = await stateOf(deps, copyPath, policy, reads);
	if (typeof before === "string") return { kind: "failed", reason: before };
	const written: { path: string; digest: string }[] = [];
	if (edit !== undefined) {
		const text = editedFile(copyPath, edit, install.edit);
		if (text === null) return { kind: "failed", reason: `the edit of ${edit.path} no longer applies` };
		writeFileSync(join(copyPath, edit.path), text);
		written.push({ path: edit.path, digest: digestBytes(text) });
	}
	const run = await deps.install(copyPath, command, install, outside.path);
	if (run.kind === "failed") return run;
	const after = await stateOf(deps, copyPath, policy, reads);
	if (typeof after === "string") return { kind: "failed", reason: after };
	const inspected = install.inspect(before, after, installs, written);
	if (inspected.kind === "refused") return { kind: "failed", reason: inspected.reason };
	return {
		kind: "brought",
		files: inspected.files.map((path) => ({ path, digest: after.files[path]!, mode: after.modes[path]! })),
		packages: inspected.packages,
		...(run.output !== undefined ? { output: run.output } : {}),
	};
}

/**
 * Brings `installs` into a copy with the manager of `installer`, in one run, and keeps the result only when
 * its inspection accepts it. A manager that installs does so in the copy at `copyPath`, which is listed with
 * the directory its technology installs dependencies in read whole: the packages it installs may ship files
 * above the size limit. A manager that resolves does so in a copy of its own, made from `reference` and
 * deleted afterwards, after the edit of the recommendation is written there; only that edit is kept, written
 * into the copies of the verification from the object store once the resolution is accepted.
 */
export async function bringInstalls(
	deps: InstallDeps,
	installer: Installer,
	reference: ReferenceSnapshot,
	copyPath: string,
	installs: readonly PackageInstall[],
	edit?: FileEdit,
): Promise<BroughtInstall> {
	const { install } = installer;
	const plan = install.plan(filesOf(reference), installs);
	if (plan.kind === "refused") return { kind: "failed", reason: plan.reason };
	if (install.form === "install")
		return runAndInspect(deps, install, copyPath, plan.command, installs, {
			...deps.workspacePolicy,
			installed_dependencies: [...installer.installed_dependencies],
		});
	if (edit === undefined) return { kind: "failed", reason: "the recommendation carries no file edit to resolve with" };
	const handle = await deps.workspace.createWorkspace(reference, deps.workspacePolicy);
	try {
		// The copy is listed with no exclusion: a file the resolution writes under a directory the policy leaves
		// out of a copy, such as target/, is a change like any other.
		const whole = { ...deps.workspacePolicy, exclusions: [] };
		return await runAndInspect(deps, install, handle.path, plan.command, installs, whole, edit);
	} finally {
		await deps.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
}
