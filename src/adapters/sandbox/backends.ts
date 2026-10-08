import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, sep } from "node:path";
import type {
	ExecutableRequest,
	ProcessObservation,
	QualificationResult,
	SandboxPort,
	SandboxProfile,
	SandboxSelection,
} from "../../ports/execution.ts";
import { buildEnv, runProcess } from "./process.ts";

export interface BackendOptions {
	/** Paths that must never be readable by a confined process (495 data dir, credentials). */
	denied_read_paths: string[];
	/** Temporary directories a runtime needs (TMPDIR). */
	temp_paths: string[];
}

function defaultDenied(): string[] {
	const home = homedir();
	return [join(home, ".ssh"), join(home, ".aws"), join(home, ".gnupg"), join(home, ".pi", "agent", "auth.json")];
}

/**
 * Seatbelt compares the resolved path of what a command touches, so a grant is written under the
 * resolved path. A path that does not exist yet is resolved through its deepest existing ancestor
 * and keeps its absent segments: the grant stays bounded to that path.
 */
export function realPathOf(p: string): string {
	return resolvedThrough(p, { links: SYMLINK_HOPS });
}

/** As many links as a path resolution follows before the system calls it a loop (`SYMLOOP_MAX`). */
const SYMLINK_HOPS = 40;

/**
 * A dangling link counts for its target, read from the real path of the link's directory, and not
 * for the path that names it, whose `..` would otherwise be taken through the links it is written through:
 * a write through it lands at the target, and creating the path creates the target. The links followed are
 * counted across the whole resolution, as the system counts them, so a tree of links costs at most that many
 * reads.
 */
function resolvedThrough(p: string, budget: { links: number }): string {
	try {
		return realpathSync(p);
	} catch {
		const target = budget.links > 0 ? danglingTargetOf(p) : null;
		if (target !== null) {
			budget.links -= 1;
			return targetFrom(resolvedThrough(dirname(p), budget), target, budget);
		}
		const parent = dirname(p);
		return parent === p ? p : join(resolvedThrough(parent, budget), basename(p));
	}
}

/**
 * A target is walked one segment at a time, as the system walks it: a `..` that follows a link climbs out of
 * the link's target, where reading the target as text would climb back to the directory that holds the link.
 */
function targetFrom(directory: string, target: string, budget: { links: number }): string {
	let reached = isAbsolute(target) ? parse(target).root : directory;
	for (const segment of target.split(sep)) {
		if (segment === "" || segment === ".") continue;
		reached = segment === ".." ? dirname(reached) : resolvedThrough(join(reached, segment), budget);
	}
	return reached;
}

function danglingTargetOf(p: string): string | null {
	try {
		return lstatSync(p).isSymbolicLink() ? readlinkSync(p) : null;
	} catch {
		// The path itself is absent, not a link: the resolution goes on through its parent.
		return null;
	}
}

function sbplString(s: string): string {
	return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * A confinement tool that cannot start the command writes its own diagnostic and exits before the
 * command runs; its stderr is therefore the only thing on that stream. Read as a verdict, "the
 * namespace could not be created" is attributed to the control of the target and reported as a
 * failing test. It is an incident: the restriction could not be guaranteed, so nothing was
 * measured (RM-016, ADR-013).
 */
export function startupIncident(
	obs: ProcessObservation,
	prefix: string,
	exitCode: number,
	fallback: string,
): ProcessObservation | null {
	if (obs.exit_code !== exitCode) return null;
	const stderr = new TextDecoder().decode(obs.stderr.subarray(0, 400));
	if (!stderr.startsWith(prefix)) return null;
	return { ...obs, exit_code: null, spawn_error: stderr.split("\n")[0] ?? fallback };
}

/** macOS Seatbelt backend: `/usr/bin/sandbox-exec` with a profile generated from the mandate (D-04). */
export class SeatbeltSandbox implements SandboxPort {
	readonly backend = "seatbelt";
	private readonly options: BackendOptions;
	constructor(options: Partial<BackendOptions> = {}) {
		this.options = {
			denied_read_paths: [...defaultDenied(), ...(options.denied_read_paths ?? [])],
			temp_paths: options.temp_paths ?? [realPathOf(tmpdir()), "/private/tmp"],
		};
	}
	qualify(profile: SandboxProfile): QualificationResult {
		const reasons: string[] = [];
		if (process.platform !== "darwin") reasons.push("seatbelt requires macOS");
		if (!existsSync("/usr/bin/sandbox-exec")) reasons.push("/usr/bin/sandbox-exec not found");
		for (const p of profile.write_paths) if (!p.startsWith("/")) reasons.push(`write path must be absolute: ${p}`);
		return {
			backend: this.backend,
			platform: `${process.platform}-${process.arch}`,
			qualified: reasons.length === 0,
			capabilities: { filesystem_confinement: true, network_confinement: true, process_group_termination: true },
			reasons,
		};
	}
	profileText(profile: SandboxProfile): string {
		const lines = [
			"(version 1)",
			"(deny default)",
			"(allow process-exec*)",
			"(allow process-fork)",
			"(allow signal (target same-sandbox))",
			"(allow sysctl-read)",
			"(allow mach-lookup)",
			"(allow ipc-posix-shm*)",
			"(allow file-read*)",
		];
		for (const p of this.options.denied_read_paths)
			lines.push(`(deny file-read* (subpath ${sbplString(realPathOf(p))}))`);
		for (const p of profile.write_paths) lines.push(`(allow file-write* (subpath ${sbplString(realPathOf(p))}))`);
		for (const p of this.options.temp_paths) lines.push(`(allow file-write* (subpath ${sbplString(realPathOf(p))}))`);
		lines.push(
			'(allow file-write* (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/ttys[0-9]+$") (literal "/dev/dtracehelper"))',
		);
		lines.push("(deny network*)");
		if (profile.network === "allowed") lines.push("(allow network*)");
		// A tool that forks workers and talks to them over a socket needs one host: itself. Granting the
		// loopback interface and nothing else keeps the confinement SEC-02 claims — no other host is
		// reachable — while letting such a tool run under the same profile as every other control.
		if (profile.network === "loopback")
			lines.push(
				'(allow network-bind (local ip "localhost:*"))',
				'(allow network-inbound (local ip "localhost:*"))',
				'(allow network-outbound (remote ip "localhost:*"))',
			);
		return `${lines.join("\n")}\n`;
	}
	async run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		const env = buildEnv(profile.env_allowlist, profile.env);
		const obs = await runProcess(
			{
				command: ["/usr/bin/sandbox-exec", "-p", this.profileText(profile), ...request.command],
				cwd: request.cwd,
				env,
			},
			request,
			signal,
		);
		// sandbox-exec exits 71 (EX_OSERR) when the confined command cannot be executed.
		return startupIncident(obs, "sandbox-exec:", 71, "sandbox-exec could not execute the command") ?? obs;
	}
}

/**
 * Linux bubblewrap backend. It qualifies where `bwrap` creates, without privilege, the namespaces it
 * asks for — a user and a mount namespace, and a network namespace of its own — and refuses elsewhere
 * with what `bwrap` said, so that a confined role is refused with `capability_missing` rather than run
 * unconfined (ADR-013, NFR-05).
 */
export class BubblewrapSandbox implements SandboxPort {
	readonly backend = "bubblewrap";
	private readonly options: BackendOptions;
	constructor(options: Partial<BackendOptions> = {}) {
		this.options = {
			denied_read_paths: [...defaultDenied(), ...(options.denied_read_paths ?? [])],
			temp_paths: options.temp_paths ?? [...new Set([tmpdir(), "/tmp"])],
		};
	}
	qualify(_profile: SandboxProfile): QualificationResult {
		const result = (reasons: string[]): QualificationResult => ({
			backend: this.backend,
			platform: `${process.platform}-${process.arch}`,
			qualified: reasons.length === 0,
			capabilities: { filesystem_confinement: true, network_confinement: true, process_group_termination: true },
			reasons,
		});
		if (process.platform !== "linux") return result(["bubblewrap requires Linux"]);
		// The probe runs a null command under the confinement a role gets, so that a kernel or a container
		// that forbids unprivileged namespaces is found here and not at the first control.
		const probe = spawnSync("bwrap", [...this.confinement({ write_paths: [], network: "denied" }), "--", "true"], {
			encoding: "utf8",
			timeout: 10_000,
		});
		if ((probe.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT")
			return result(["bwrap not found in PATH"]);
		if (probe.status === 0) return result([]);
		// A spawn error other than ENOENT, such as a bwrap that cannot be executed, leaves stderr undefined
		// whatever its type says.
		const said = probe.stderr?.trim().split("\n")[0] || probe.error?.message || `exit ${probe.status ?? probe.signal}`;
		return result([`bwrap cannot confine a command on this machine: ${said}`]);
	}
	/**
	 * The mounts and namespaces of a confined command: the root read-only, the temporary and write paths
	 * bound read-write, the denied paths masked.
	 */
	private confinement(profile: Pick<SandboxProfile, "write_paths" | "network">): string[] {
		const args = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--die-with-parent", "--new-session"];
		// The temporary directories stay shared and writable, as under Seatbelt: what 495 writes there for a
		// command, a ruleset, is read by it.
		for (const p of this.options.temp_paths) if (existsSync(p)) args.push("--bind", p, p);
		for (const p of profile.write_paths) args.push("--bind", p, p);
		// Masked after the write paths are bound, so a grant never uncovers one. A directory is hidden by an
		// empty one; a file, which a tmpfs cannot be mounted on, by `/dev/null`, which a confined command
		// cannot open (`EACCES`).
		for (const p of this.options.denied_read_paths) {
			if (!existsSync(p)) continue;
			if (statSync(p).isDirectory()) args.push("--tmpfs", p);
			else args.push("--ro-bind", "/dev/null", p);
		}
		// A network namespace of its own holds a loopback interface and no route anywhere else, so it is
		// what both `denied` and `loopback` ask for on this platform.
		if (profile.network !== "allowed") args.push("--unshare-net");
		return args;
	}
	async run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		// A bind needs a source, where Seatbelt grants a path before it exists: a write path the command is
		// to create is made here, empty, as the file the profile says it is or as a directory, and nothing
		// above it is granted.
		const madeFiles: string[] = [];
		for (const p of profile.write_paths) {
			if (existsSync(p)) continue;
			if (profile.write_files?.includes(p)) {
				writeFileSync(p, "");
				madeFiles.push(p);
			} else mkdirSync(p, { recursive: true });
		}
		const env = buildEnv(profile.env_allowlist, profile.env);
		let obs: ProcessObservation;
		try {
			obs = await runProcess(
				{
					command: ["bwrap", ...this.confinement(profile), "--chdir", request.cwd, "--", ...request.command],
					cwd: request.cwd,
					env,
				},
				request,
				signal,
			);
		} finally {
			// A file made only to be bound and left empty is removed: where the command wrote no report, its
			// reader finds none, as under Seatbelt.
			for (const p of madeFiles) if (statSync(p, { throwIfNoEntry: false })?.size === 0) rmSync(p);
		}
		// bwrap exits 1 after writing `bwrap: <reason>` when it cannot set up the namespaces it was
		// asked for — a container that forbids user namespaces, a kernel without them.
		return startupIncident(obs, "bwrap: ", 1, "bwrap could not confine the command") ?? obs;
	}
}

/**
 * No confinement. Only for V0–V2 tests and explicitly opted-in profiles; it never qualifies as a
 * security boundary and reports its capabilities as absent (ADR-013: fail closed elsewhere).
 */
export class UnconfinedSandbox implements SandboxPort {
	readonly backend = "unconfined";
	qualify(_profile: SandboxProfile): QualificationResult {
		return {
			backend: this.backend,
			platform: `${process.platform}-${process.arch}`,
			qualified: false,
			capabilities: { filesystem_confinement: false, network_confinement: false, process_group_termination: true },
			reasons: ["unconfined backend provides no isolation; SEC-02 and SEC-03 cannot be claimed"],
		};
	}
	run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		return runProcess(
			{ command: request.command, cwd: request.cwd, env: buildEnv(profile.env_allowlist, profile.env) },
			request,
			signal,
		);
	}
}

/**
 * Selects the platform backend. When `allow_unconfined` is set the unconfined backend is returned
 * with an explicit non-qualified result; otherwise an unqualified platform yields a selection whose
 * `qualified` flag is false and the caller must refuse the operation (capability_missing).
 */
export function selectSandbox(
	options: { allow_unconfined: boolean; denied_read_paths?: string[] },
	platform: NodeJS.Platform = process.platform,
): SandboxSelection {
	const probe: SandboxProfile = {
		profile_id: "observe",
		read_paths: [],
		write_paths: [],
		network: "denied",
		env_allowlist: [],
		env: {},
	};
	if (options.allow_unconfined) {
		const b = new UnconfinedSandbox();
		return { backend: b, qualification: b.qualify(probe) };
	}
	const b: SandboxPort =
		platform === "darwin"
			? new SeatbeltSandbox({ denied_read_paths: options.denied_read_paths ?? [] })
			: new BubblewrapSandbox({ denied_read_paths: options.denied_read_paths ?? [] });
	return { backend: b, qualification: b.qualify(probe) };
}
