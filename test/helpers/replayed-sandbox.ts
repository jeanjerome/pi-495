/**
 * A sandbox that spawns nothing and answers every command with the observation a test gives it: the
 * output a real tool printed once, kept under `test/fixtures/`, replayed with the incident the test
 * sets (a timeout, a signal, a truncated output).
 */
import type {
	ExecutableRequest,
	ProcessObservation,
	QualificationResult,
	SandboxPort,
	SandboxProfile,
} from "../../src/ports/execution.ts";
import { observation } from "./execution-fixture.ts";

export class ReplayedSandbox implements SandboxPort {
	readonly backend = "replayed";
	private readonly replayed: ProcessObservation;

	constructor(stdout: string, over: Partial<ProcessObservation> = {}) {
		this.replayed = observation({ stdout: new TextEncoder().encode(stdout), ...over });
	}

	qualify(_profile: SandboxProfile): QualificationResult {
		return {
			backend: this.backend,
			platform: `${process.platform}-${process.arch}`,
			qualified: false,
			capabilities: { filesystem_confinement: false, network_confinement: false, process_group_termination: false },
			reasons: ["replayed output: nothing runs"],
		};
	}

	async run(_profile: SandboxProfile, _request: ExecutableRequest): Promise<ProcessObservation> {
		return this.replayed;
	}
}
