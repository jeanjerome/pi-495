import { join } from "node:path";
import { PiWorkerAgent } from "../../src/adapters/pi-worker/supervisor.ts";
import type { InterventionEvent, InterventionMandate } from "../../src/ports/execution.ts";

/** Drains an intervention event stream to its end, so a test can assert on what was relayed. */
export async function collect(events: AsyncIterable<InterventionEvent>): Promise<InterventionEvent[]> {
	const out: InterventionEvent[] = [];
	for await (const e of events) out.push(e);
	return out;
}

/** A mandate for a worker that speaks the protocol without Pi nor a model; `over` names what differs. */
export function mandate(objective: string, root: string, over: Partial<InterventionMandate> = {}): InterventionMandate {
	return {
		intervention_id: "int_1",
		change_id: "chg_1",
		role: "implement",
		objective,
		prompt: objective,
		system_prompt: "sys",
		context: {
			role: "implement",
			objective,
			output_schema: "producer-report",
			trusted_instructions: [],
			imposed_layers: [],
			adopted_refs: [],
			untrusted_excerpts: [],
			tools: ["read", "write"],
			exclusions: [],
			input_budget_bytes: 1000,
			output_reserve_tokens: 100,
			truncations: [],
			prompt_digest: null,
		},
		tools: ["read", "write", "edit", "bash"],
		profile: {
			profile_id: "implement",
			read_paths: [root],
			write_paths: [root],
			network: "denied",
			env_allowlist: ["PATH"],
			env: {},
		},
		workspace_path: root,
		model: { provider_id: "fake", model_id: "fake-1", thinking_level: "off" },
		budgets: { duration_ms: 10_000, tool_calls: 5 },
		output_schema: "producer-report",
		...over,
	};
}

/** A worker agent driving `test/helpers/fake-worker.ts`: the real protocol over real stdio. */
export function fakeWorkerAgent(silence_timeout_ms = 700): PiWorkerAgent {
	return new PiWorkerAgent({
		config: {
			pi_package_dir: "/none",
			pi_agent_dir: "/none",
			sandbox_backend: "unconfined",
			denied_read_paths: [],
			heartbeat_ms: 50,
		},
		workerCommand: [process.execPath, join(process.cwd(), "test", "helpers", "fake-worker.ts")],
		silence_timeout_ms,
		grace_ms: 200,
	});
}
