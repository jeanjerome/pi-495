/**
 * Sandbox runner (CMP-SBX): materializes a permission profile as a spawn plan, starts the process
 * under it, bounds its output and reports what it observed. `backends.ts` chooses the backend.
 */
import { spawn } from "node:child_process";
import type { ExecutableRequest, ProcessObservation } from "../../ports/execution.ts";

export interface SpawnPlan {
	command: string[];
	cwd: string;
	env: Record<string, string>;
}

/**
 * Spawns without a shell in its own process group, enforces the timeout with SIGTERM then SIGKILL
 * after a grace period, and bounds captured output (§12.2, §12.3). Always resolves.
 */
export function runProcess(plan: SpawnPlan, request: ExecutableRequest, signal?: AbortSignal, graceMs = 2000): Promise<ProcessObservation> {
	const startedAt = new Date();
	return new Promise((resolve) => {
		const [file, ...args] = plan.command;
		if (!file) {
			resolve(finish(null, null, false, "empty command"));
			return;
		}
		const stdout = new Collector(request.max_output_bytes);
		const stderr = new Collector(request.max_output_bytes);
		let timedOut = false;
		let settled = false;
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(file, args, { cwd: plan.cwd, env: plan.env, stdio: [request.stdin != null ? "pipe" : "ignore", "pipe", "pipe"], detached: process.platform !== "win32", shell: false });
		} catch (error) {
			resolve(finish(null, null, false, (error as Error).message));
			return;
		}
		const killGroup = (sig: NodeJS.Signals) => {
			try {
				if (process.platform !== "win32" && child.pid) process.kill(-child.pid, sig);
				else child.kill(sig);
			} catch {
				/* already gone */
			}
		};
		const timer = setTimeout(() => {
			timedOut = true;
			killGroup("SIGTERM");
			setTimeout(() => killGroup("SIGKILL"), graceMs).unref();
		}, request.timeout_ms);
		const onAbort = () => {
			killGroup("SIGTERM");
			setTimeout(() => killGroup("SIGKILL"), graceMs).unref();
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		child.stdout?.on("data", (d: Buffer) => stdout.push(d));
		child.stderr?.on("data", (d: Buffer) => stderr.push(d));
		if (request.stdin != null && child.stdin) {
			child.stdin.end(request.stdin);
		}
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolve(finish(null, null, timedOut, error.message));
		});
		child.on("close", (code, sig) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			resolve(finish(code, sig, timedOut, null));
		});

		function finish(code: number | null, sig: NodeJS.Signals | null, timeout: boolean, spawnError: string | null): ProcessObservation {
			const endedAt = new Date();
			return { exit_code: code, signal: sig, timed_out: timeout, spawn_error: spawnError, stdout: stdout.bytes(), stderr: stderr.bytes(), stdout_truncated: stdout.truncated, stderr_truncated: stderr.truncated, started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(), duration_ms: endedAt.getTime() - startedAt.getTime() };
		}
	});
}

class Collector {
	private chunks: Buffer[] = [];
	private size = 0;
	truncated = false;
	private readonly max: number;
	constructor(max: number) {
		this.max = max;
	}
	push(d: Buffer): void {
		if (this.size >= this.max) {
			this.truncated = true;
			return;
		}
		const room = this.max - this.size;
		if (d.byteLength > room) {
			this.chunks.push(d.subarray(0, room));
			this.size += room;
			this.truncated = true;
		} else {
			this.chunks.push(d);
			this.size += d.byteLength;
		}
	}
	bytes(): Uint8Array {
		return new Uint8Array(Buffer.concat(this.chunks));
	}
}

export function buildEnv(allowlist: string[], explicit: Record<string, string>, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of allowlist) {
		const v = source[key];
		if (v !== undefined) env[key] = v;
	}
	if (!env.PATH && source.PATH) env.PATH = source.PATH;
	return { ...env, ...explicit };
}
