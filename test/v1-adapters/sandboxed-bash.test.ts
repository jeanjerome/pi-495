import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { sandboxedBashOperations } from "../../src/adapters/pi-worker/sandboxed-bash.ts";
import type { ExecutableRequest, SandboxPort, SandboxProfile } from "../../src/ports/execution.ts";

const profile: SandboxProfile = {
	profile_id: "implement",
	read_paths: ["/ws"],
	write_paths: ["/ws"],
	network: "denied",
	env_allowlist: ["PATH"],
	env: {},
};

/** A sandbox that answers every command at once and keeps the request it was given. */
function recordingSandbox(requests: ExecutableRequest[]): SandboxPort {
	return {
		backend: "recording",
		qualify: () => {
			throw new Error("not used");
		},
		run: async (_profile, request) => {
			requests.push(request);
			const at = new Date().toISOString();
			return {
				exit_code: 0,
				signal: null,
				timed_out: false,
				spawn_error: null,
				stdout: Buffer.from("ok\n"),
				stderr: new Uint8Array(),
				stdout_truncated: false,
				stderr_truncated: false,
				started_at: at,
				ended_at: at,
				duration_ms: 0,
			};
		},
	};
}

async function runBash(args: { command: string; timeout?: number }): Promise<ExecutableRequest> {
	const requests: ExecutableRequest[] = [];
	const tool = createBashToolDefinition("/ws", {
		exposeSessionEnvironment: false,
		operations: sandboxedBashOperations(recordingSandbox(requests), profile, "/ws", async (p) => p),
	});
	await tool.execute("call_1", args, undefined, undefined, { cwd: "/ws" } as never);
	assert.equal(requests.length, 1);
	return requests[0]!;
}

describe("the agent's bash tool runs under the sandbox (CMP-INT)", () => {
	it("a command the model gives 120 seconds is given 120 seconds in the sandbox, not 120 milliseconds", async () => {
		const request = await runBash({ command: "npx vitest run", timeout: 120 });
		assert.equal(request.timeout_ms, 120_000);
	});

	it("a command without a timeout, or with more than five minutes, is bounded at five minutes", async () => {
		assert.equal((await runBash({ command: "npm test" })).timeout_ms, 300_000);
		assert.equal((await runBash({ command: "npm test", timeout: 3600 })).timeout_ms, 300_000);
	});
});
