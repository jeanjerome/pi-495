import { digestValue } from "../../src/contracts/digest.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ControlInvocation, ProcessObservation } from "../../src/ports/execution.ts";
import { EXECUTOR, ENV } from "./change-fixture.ts";

/** A process that exited 0 with nothing on its outputs, with the fields a test sets laid over it. */
export function observation(over: Partial<ProcessObservation> = {}): ProcessObservation {
	return {
		exit_code: 0,
		signal: null,
		timed_out: false,
		spawn_error: null,
		stdout: new Uint8Array(),
		stderr: new Uint8Array(),
		stdout_truncated: false,
		stderr_truncated: false,
		started_at: "t",
		ended_at: "t",
		duration_ms: 1,
		...over,
	};
}

/** A protected control that runs nothing and reads its exit code, with the fields a test sets laid over it. */
export function controlOf(over: Partial<ControlDefinition> = {}): ControlDefinition {
	return {
		control_id: "c1",
		version: "1",
		title: "a control",
		command: [process.execPath, "-e", ""],
		cwd: ".",
		env_allowlist: ["PATH", "HOME", "TMPDIR"],
		env: {},
		timeout_ms: 30000,
		parser: "exit-code",
		report_path: null,
		structure_rules: [],
		provides: [],
		requires: [],
		scope_argument: null,
		network: "denied",
		writable_paths: [],
		requirement_refs: [{ requirement_id: "R1", revision: 1 }],
		protected: true,
		protected_paths: [],
		...over,
	};
}

export function invocationBase(): Omit<ControlInvocation, "control" | "workspace_path"> {
	return {
		protocol: { protocol_id: "p", revision: 1, content_digest: digestValue("p") },
		candidate: {
			candidate_id: "c",
			manifest_digest: digestValue("c"),
			base_digest: digestValue("b"),
			workspace_id: "w",
		},
		subject: { kind: "candidate", id: "c", revision: 1, digest: digestValue("c") },
		environment: { environment_id: "env", digest: ENV, profile_id: "verify" },
		requirement_refs: [{ requirement_id: "R1", revision: 1 }],
		producer: EXECUTOR,
	};
}
