import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { PiWorkerAgent } from "../../src/adapters/pi-worker/supervisor.ts";
import { buildContext } from "../../src/application/context.ts";
import { InterventionSupervisor } from "../../src/application/intervention.ts";
import type { DomainError } from "../../src/domain/errors.ts";
import { DEFAULT_POLICY, type DeclaredEgress } from "../../src/domain/policy.ts";
import { loadConfig } from "../../src/extension/config.ts";
import type {
	AgentPort,
	InterventionEvent,
	InterventionMandate,
	ModelSelection,
	SandboxPort,
} from "../../src/ports/execution.ts";

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "egress-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function configured(policy: unknown): string {
	writeFileSync(join(root, "config.json"), JSON.stringify({ policy }));
	return root;
}

describe("declared egress to the model provider (SEC-05, D-11, D-46)", () => {
	it("declares by default only destinations that sit on the machine, so nothing leaves it unasked", () => {
		assert.ok(DEFAULT_POLICY.egress.length > 0, "an empty declaration would refuse every intervention");
		assert.deepEqual(
			DEFAULT_POLICY.egress.filter((d) => d.location === "off_machine"),
			[],
			"a destination off the machine is a decision, never a default",
		);
		assert.deepEqual(
			DEFAULT_POLICY.egress.map((d) => d.provider_id),
			["omlx"],
			"the one provider this machine has configured today",
		);
	});
});

describe("the declared egress a configuration carries (SEC-05)", () => {
	it("keeps the declaration when a configuration names the policy without naming it", () => {
		const { config } = loadConfig(configured({ budgets: { max_attempts: 5 } }));
		assert.deepEqual(
			config.policy.egress,
			DEFAULT_POLICY.egress,
			"an unrelated setting must not empty the declaration, which would refuse every intervention",
		);
		assert.equal(config.policy.budgets.max_attempts, 5, "the setting it did name still applies");
	});

	it("replaces the declaration entirely when a configuration names it", () => {
		const declared = [
			{ provider_id: "omlx", location: "on_machine" },
			{ provider_id: "anthropic", location: "off_machine" },
		];
		const { config } = loadConfig(configured({ egress: declared }));
		assert.deepEqual(config.policy.egress, declared, "a declaration is written whole, never merged entry by entry");
	});
});

/**
 * A supervisor whose sandbox is qualified and whose model answers, so that the only thing left to
 * refuse is the destination. The agent records what it was asked, because the point of the refusal
 * is what it prevents rather than what it says.
 */
function supervisorFor(model: ModelSelection, egress: DeclaredEgress[] = DEFAULT_POLICY.egress) {
	const probed: ModelSelection[] = [];
	const started: InterventionMandate[] = [];
	const agent: AgentPort = {
		async describeCapabilities(m) {
			probed.push(m);
			return { provider_id: m.provider_id, model_id: m.model_id, available: true, reasons: [] };
		},
		async startIntervention(mandate) {
			started.push(mandate);
			throw new Error("this test never drives a session");
		},
	};
	const supervisor = new InterventionSupervisor({
		agent,
		sandbox: {
			backend: { backend: "test" } as unknown as SandboxPort,
			qualification: {
				backend: "test",
				platform: "test",
				qualified: true,
				capabilities: { filesystem_confinement: true, network_confinement: true, process_group_termination: true },
				reasons: [],
			},
		},
		model,
		policy: { ...DEFAULT_POLICY, egress },
		now: () => "2026-09-21T00:00:00Z",
		progress: () => {},
	});
	return { supervisor, probed, started };
}

describe("an intervention toward an undeclared destination (SEC-05, D-46)", () => {
	it("is refused before the provider is reached and before any worker is started", async () => {
		const { supervisor, probed, started } = supervisorFor({
			provider_id: "anthropic",
			model_id: "claude-opus",
			thinking_level: "off",
		});
		await assert.rejects(
			() => supervisor.requireCapable("implement"),
			(error: DomainError) => {
				assert.equal(
					error.code,
					"POLICY_DENIED",
					"an undeclared destination is a policy refusal, not a missing capability",
				);
				assert.match(error.message, /anthropic/, "the refusal names the destination it refused");
				return true;
			},
		);
		assert.deepEqual(probed, [], "the refusal precedes the provider: an undeclared destination is not even asked");
		assert.deepEqual(started, [], "no worker process was started");
	});

	it("names the empty declaration rather than an empty list, when nothing is declared at all", async () => {
		const { supervisor, probed } = supervisorFor(
			{ provider_id: "omlx", model_id: "qwen3.8-27b-oq8e", thinking_level: "off" },
			[],
		);
		await assert.rejects(
			() => supervisor.requireCapable("implement"),
			(error: DomainError) => {
				assert.equal(error.code, "POLICY_DENIED");
				assert.match(
					error.message,
					/no egress destination is declared/,
					"an empty declaration refuses everything on purpose, and says so rather than listing nothing",
				);
				return true;
			},
		);
		assert.deepEqual(probed, [], "nothing is declared, so nothing is reached");
	});

	it("carries a declared destination through to the capability check that already existed", async () => {
		const { supervisor, probed, started } = supervisorFor({
			provider_id: "omlx",
			model_id: "qwen3.8-27b-oq8e",
			thinking_level: "off",
		});
		await supervisor.requireCapable("implement");
		assert.deepEqual(
			probed.map((m) => m.provider_id),
			["omlx"],
			"a declared destination is reached: the declaration bounds what may leave, it does not refuse everything",
		);
		assert.deepEqual(started, [], "requiring capability starts no worker on its own");
	});
});

/**
 * A worker driven by the fake process of `test/helpers/fake-worker.ts`, which speaks the real
 * supervisor protocol over real stdio without Pi nor a model (agent-port.test.ts's own fixture).
 */
function realWorker(env: Record<string, string> = {}) {
	return new PiWorkerAgent({
		config: {
			pi_package_dir: "/none",
			pi_agent_dir: "/none",
			sandbox_backend: "unconfined",
			denied_read_paths: [],
			heartbeat_ms: 50,
		},
		workerCommand: [process.execPath, join(process.cwd(), "test", "helpers", "fake-worker.ts")],
		silence_timeout_ms: 2000,
		grace_ms: 200,
		env,
	});
}

function minimalMandate(objective: string): InterventionMandate {
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
			adopted_refs: [],
			untrusted_excerpts: [],
			tools: [],
			exclusions: [],
			input_budget_bytes: 1000,
			output_reserve_tokens: 100,
			truncations: [],
			prompt_digest: null,
		},
		tools: [],
		profile: {
			profile_id: "implement",
			read_paths: [process.cwd()],
			write_paths: [process.cwd()],
			network: "denied",
			env_allowlist: ["PATH"],
			env: {},
		},
		workspace_path: process.cwd(),
		model: { provider_id: "omlx", model_id: "qwen3.8-27b-oq8e", thinking_level: "off" },
		budgets: { duration_ms: 5000, tool_calls: 5 },
		output_schema: "producer-report",
	};
}

async function collect(events: AsyncIterable<InterventionEvent>): Promise<InterventionEvent[]> {
	const out: InterventionEvent[] = [];
	for await (const e of events) out.push(e);
	return out;
}

describe("what the worker process receives from the controller's own environment (SEC-05, D-11)", () => {
	it("does not hand a sentinel secret in the controller's environment to the worker process", async () => {
		const SENTINEL = "HARNESS495_TEST_SENTINEL";
		process.env[SENTINEL] = "sk-controller-secret-do-not-leak";
		try {
			const handle = await realWorker().startIntervention(minimalMandate("echo-env"));
			const events = await collect(handle.events);
			const completed = events.find((e) => e.type === "completed");
			assert.ok(completed, `the worker never completed: ${JSON.stringify(events)}`);
			const output = (completed as { output: { env?: Record<string, string> } }).output;
			assert.ok(output.env, "the fake worker did not report an environment to inspect");
			assert.equal(
				output.env[SENTINEL],
				undefined,
				"a sentinel set in the controller's own environment reached the spawned worker process",
			);
		} finally {
			delete process.env[SENTINEL];
		}
	});
});

describe("what the context builder can put in a prompt (SEC-05, CTX-05)", () => {
	it("reads no environment at all: nothing it composes can carry a controller secret", () => {
		const source = readFileSync(join(process.cwd(), "src", "application", "context.ts"), "utf8");
		const found = source.match(/process\.env/g) ?? [];
		assert.deepEqual(found, [], "buildContext must stay a pure function of its input, never of the environment");
	});

	it("never places a controller-environment sentinel in the text handed to the model", () => {
		const SENTINEL = "sk-controller-secret-do-not-leak";
		process.env.HARNESS495_TEST_SENTINEL = SENTINEL;
		try {
			const { system_prompt, prompt, record } = buildContext({
				role: "implement",
				objective: "do work",
				language: "fr",
				adopted: [],
				untrusted: [],
				feedback: null,
				tools: [],
				budget_bytes: 10000,
			});
			for (const text of [system_prompt, prompt, record])
				assert.equal(text.includes(SENTINEL), false, "the composed context carries a controller secret");
		} finally {
			delete process.env.HARNESS495_TEST_SENTINEL;
		}
	});
});
