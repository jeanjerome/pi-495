import { existsSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutableRequest, ProcessObservation, QualificationResult, SandboxPort, SandboxProfile } from "../../ports/execution.ts";
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

function real(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
}

function sbplString(s: string): string {
	return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** macOS Seatbelt backend: `/usr/bin/sandbox-exec` with a profile generated from the mandate (D-04). */
export class SeatbeltSandbox implements SandboxPort {
	readonly backend = "seatbelt";
	private readonly options: BackendOptions;
	constructor(options: Partial<BackendOptions> = {}) {
		this.options = { denied_read_paths: [...defaultDenied(), ...(options.denied_read_paths ?? [])], temp_paths: options.temp_paths ?? [real(tmpdir()), "/private/tmp"] };
	}
	qualify(profile: SandboxProfile): QualificationResult {
		const reasons: string[] = [];
		if (process.platform !== "darwin") reasons.push("seatbelt requires macOS");
		if (!existsSync("/usr/bin/sandbox-exec")) reasons.push("/usr/bin/sandbox-exec not found");
		for (const p of profile.write_paths) if (!p.startsWith("/")) reasons.push(`write path must be absolute: ${p}`);
		return { backend: this.backend, platform: `${process.platform}-${process.arch}`, qualified: reasons.length === 0, capabilities: { filesystem_confinement: true, network_confinement: true, process_group_termination: true }, reasons };
	}
	profileText(profile: SandboxProfile): string {
		const lines = ["(version 1)", "(deny default)", "(allow process-exec*)", "(allow process-fork)", "(allow signal (target same-sandbox))", "(allow sysctl-read)", "(allow mach-lookup)", "(allow ipc-posix-shm*)", "(allow file-read*)"];
		for (const p of this.options.denied_read_paths) lines.push(`(deny file-read* (subpath ${sbplString(real(p))}))`);
		for (const p of profile.write_paths) lines.push(`(allow file-write* (subpath ${sbplString(real(p))}))`);
		for (const p of this.options.temp_paths) lines.push(`(allow file-write* (subpath ${sbplString(real(p))}))`);
		lines.push('(allow file-write* (literal "/dev/null") (literal "/dev/tty") (regex #"^/dev/ttys[0-9]+$") (literal "/dev/dtracehelper"))');
		lines.push(profile.network === "allowed" ? "(allow network*)" : "(deny network*)");
		return `${lines.join("\n")}\n`;
	}
	run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		const env = buildEnv(profile.env_allowlist, profile.env);
		return runProcess({ command: ["/usr/bin/sandbox-exec", "-p", this.profileText(profile), ...request.command], cwd: request.cwd, env }, request, signal);
	}
}

/** Linux bubblewrap backend. Implemented, not qualified on the reference machine (see STATUS). */
export class BubblewrapSandbox implements SandboxPort {
	readonly backend = "bubblewrap";
	private readonly options: BackendOptions;
	constructor(options: Partial<BackendOptions> = {}) {
		this.options = { denied_read_paths: [...defaultDenied(), ...(options.denied_read_paths ?? [])], temp_paths: options.temp_paths ?? ["/tmp"] };
	}
	qualify(_profile: SandboxProfile): QualificationResult {
		const reasons: string[] = [];
		if (process.platform !== "linux") reasons.push("bubblewrap requires Linux");
		const found = (process.env.PATH ?? "").split(":").some((d) => existsSync(join(d, "bwrap")));
		if (!found) reasons.push("bwrap not found in PATH");
		reasons.push("backend not qualified on the reference machine (Linux x86-64 campaign pending)");
		return { backend: this.backend, platform: `${process.platform}-${process.arch}`, qualified: false, capabilities: { filesystem_confinement: true, network_confinement: true, process_group_termination: true }, reasons };
	}
	run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		const args = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp", "--die-with-parent", "--new-session"];
		for (const p of this.options.denied_read_paths) if (existsSync(p)) args.push("--tmpfs", p);
		for (const p of profile.write_paths) args.push("--bind", p, p);
		if (profile.network === "denied") args.push("--unshare-net");
		const env = buildEnv(profile.env_allowlist, profile.env);
		return runProcess({ command: ["bwrap", ...args, "--chdir", request.cwd, "--", ...request.command], cwd: request.cwd, env }, request, signal);
	}
}

/**
 * No confinement. Only for V0–V2 tests and explicitly opted-in profiles; it never qualifies as a
 * security boundary and reports its capabilities as absent (ADR-013: fail closed elsewhere).
 */
export class UnconfinedSandbox implements SandboxPort {
	readonly backend = "unconfined";
	qualify(_profile: SandboxProfile): QualificationResult {
		return { backend: this.backend, platform: `${process.platform}-${process.arch}`, qualified: false, capabilities: { filesystem_confinement: false, network_confinement: false, process_group_termination: true }, reasons: ["unconfined backend provides no isolation; SEC-02 and SEC-03 cannot be claimed"] };
	}
	run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		return runProcess({ command: request.command, cwd: request.cwd, env: buildEnv(profile.env_allowlist, profile.env) }, request, signal);
	}
}

export interface SandboxSelection {
	backend: SandboxPort;
	qualification: QualificationResult;
}

/**
 * Selects the platform backend. When `allow_unconfined` is set the unconfined backend is returned
 * with an explicit non-qualified result; otherwise an unqualified platform yields a selection whose
 * `qualified` flag is false and the caller must refuse the operation (capability_missing).
 */
export function selectSandbox(options: { allow_unconfined: boolean; denied_read_paths?: string[] }, platform: NodeJS.Platform = process.platform): SandboxSelection {
	const probe: SandboxProfile = { profile_id: "observe", read_paths: [], write_paths: [], network: "denied", env_allowlist: [], env: {} };
	if (options.allow_unconfined) {
		const b = new UnconfinedSandbox();
		return { backend: b, qualification: b.qualify(probe) };
	}
	const b: SandboxPort = platform === "darwin" ? new SeatbeltSandbox({ denied_read_paths: options.denied_read_paths ?? [] }) : new BubblewrapSandbox({ denied_read_paths: options.denied_read_paths ?? [] });
	return { backend: b, qualification: b.qualify(probe) };
}
