/**
 * The unconfined backend under a qualification a kernel test declares: qualified, so that the commands of a
 * technology run without nesting a sandbox, or not, with the reason a platform would give. It keeps every
 * command it is handed, so a test reads whether anything ran.
 */
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import type {
	ExecutableRequest,
	ProcessObservation,
	SandboxProfile,
	SandboxSelection,
} from "../../src/ports/execution.ts";

class RecordingSandbox extends UnconfinedSandbox {
	readonly commands: string[][] = [];
	override run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		this.commands.push([...request.command]);
		return super.run(profile, request, signal);
	}
}

export function declaredSandbox(
	qualified: boolean,
	reason = "test-only: unconfined backend declared qualified for V2",
): SandboxSelection & { backend: RecordingSandbox } {
	const backend = new RecordingSandbox();
	const probe = backend.qualify({
		profile_id: "verify",
		read_paths: [],
		write_paths: [],
		network: "denied",
		env_allowlist: [],
		env: {},
	});
	return { backend, qualification: { ...probe, qualified, reasons: [reason] } };
}
