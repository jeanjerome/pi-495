/**
 * The execution behind the agent's `bash` tool: each command runs under the intervention's sandbox
 * profile, confined to the workspace (CMP-INT, D-05).
 */
import type { SandboxPort, SandboxProfile } from "../../ports/execution.ts";

/** What Pi's bash tool calls to run a command (`BashOperations` of `pi-coding-agent`). */
export interface SandboxedBashOperations {
	exec: (
		command: string,
		cwd: string,
		/** `timeout` is in seconds. */
		options: { onData: (d: Buffer) => void; signal?: AbortSignal; timeout?: number },
	) => Promise<{ exitCode: number | null }>;
}

export function sandboxedBashOperations(
	sandbox: SandboxPort,
	profile: SandboxProfile,
	workspace: string,
	inside: (path: string) => Promise<string>,
): SandboxedBashOperations {
	return {
		exec: async (command, cwd, options) => {
			const safeCwd = await inside(cwd);
			const obs = await sandbox.run(
				{
					...profile,
					write_paths: profile.write_paths.length > 0 ? profile.write_paths : [workspace],
				},
				{
					command: ["/bin/bash", "-c", command],
					cwd: safeCwd,
					// Pi's bash tool passes the model's timeout in seconds.
					timeout_ms: Math.min((options.timeout ?? 300) * 1000, 300_000),
					max_output_bytes: 512 * 1024,
				},
				options.signal,
			);
			if (obs.stdout.byteLength > 0) options.onData(Buffer.from(obs.stdout));
			if (obs.stderr.byteLength > 0) options.onData(Buffer.from(obs.stderr));
			if (obs.spawn_error) options.onData(Buffer.from(`\n[495] ${obs.spawn_error}\n`));
			return { exitCode: obs.timed_out ? null : obs.exit_code };
		},
	};
}
