import { strict as assert } from "node:assert";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { InterventionSupervisor } from "../../src/application/intervention.ts";
import type { DomainError } from "../../src/domain/errors.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import { loadConfig } from "../../src/extension/config.ts";
import type {
	AgentCapabilities,
	AgentPort,
	InterventionMandate,
	ModelSelection,
	SandboxProfile,
} from "../../src/ports/execution.ts";
import { describedAs } from "../helpers/capabilities.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { mandate } from "../helpers/intervention-fixture.ts";
import { makeHarness, type TestHarness } from "../helpers/harness-fixture.ts";

/** A provider nothing in the harness names, the way a first user's model is named nowhere in 495. */
const CHOSEN: ModelSelection = { provider_id: "anthropic", model_id: "claude-x", thinking_level: "off" };

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Drives a fresh change until its first intervention, and returns the providers the journal started. */
async function firstInterventionUnder(t: TestHarness): Promise<{ started: unknown[]; stopReason: unknown }> {
	cleanups.push(t.root);
	const project = tempDir("495-admitted-");
	cleanups.push(project);
	fixtureTs(project);
	initRepo(project);
	const { change } = await t.harness.start({ project_path: project, request_text: "x", actor: HUMAN });
	await t.harness.advance(change.change_id, { max_steps: 5 });
	const started = t.ledger
		.readChangeEvents(change.change_id)
		.filter((e) => e.type === "intervention.started")
		.map((e) => (e.event as { model?: ModelSelection }).model?.provider_id);
	return { started, stopReason: t.ledger.loadChange(change.change_id)?.state.stop_reason ?? null };
}

describe("the provider of the model chosen in Pi, reached with no configuration (SEC-05)", () => {
	it("starts the first intervention and journals that provider at its start", async () => {
		const { started, stopReason } = await firstInterventionUnder(makeHarness({ model: CHOSEN }));
		assert.notEqual(stopReason, "policy_denied", "choosing the model in Pi is what admits its provider");
		assert.ok(started.length > 0, `no intervention was started (stopped on ${String(stopReason)})`);
		assert.deepEqual([...new Set(started)], ["anthropic"], "the dossier says which provider the excerpts went to");
	});

	it("starts it under a configuration whose leftover list names only omlx, and announces the list", async () => {
		const dataDir = tempDir("495-config-");
		cleanups.push(dataDir);
		writeFileSync(
			join(dataDir, "config.json"),
			JSON.stringify({ policy: { egress: [{ provider_id: "omlx", location: "on_machine" }] } }),
		);
		const { config, diagnostics } = loadConfig(dataDir);
		assert.ok(
			diagnostics.some((d) => d.includes("policy.egress") && d.includes("no longer read")),
			diagnostics.join(" | "),
		);
		const { started, stopReason } = await firstInterventionUnder(makeHarness({ model: CHOSEN, policy: config.policy }));
		assert.notEqual(stopReason, "policy_denied", "a list naming only another provider restricts nothing");
		assert.deepEqual([...new Set(started)], ["anthropic"]);
	});
});

/**
 * A backend no test here drives. `InterventionSupervisor` reads only the pre-computed qualification
 * and the backend's name, never these methods — so throwing costs nothing and surfaces any
 * accidental use, rather than letting a silent stub stand in for a sandbox that was never run.
 */
class UndrivenSandbox {
	readonly backend = "test";
	qualify(): never {
		throw new Error("no test here drives a sandbox");
	}
	run(_profile: SandboxProfile): never {
		throw new Error("no test here drives a sandbox");
	}
}

/** An agent that records what it was asked to probe and start, and never drives a session. */
class RecordingAgent implements AgentPort {
	readonly probed: ModelSelection[] = [];
	readonly started: string[] = [];
	async describeCapabilities(model: ModelSelection): Promise<AgentCapabilities> {
		this.probed.push(model);
		return describedAs(model);
	}
	async startIntervention(mandate: InterventionMandate): Promise<never> {
		this.started.push(mandate.intervention_id);
		throw new Error("this test never drives a session");
	}
}

/** A supervisor whose sandbox is qualified, driven by a recording agent. */
function supervisorFor(model: ModelSelection) {
	const agent = new RecordingAgent();
	const supervisor = new InterventionSupervisor({
		agent,
		sandbox: {
			backend: new UndrivenSandbox(),
			qualification: {
				backend: "test",
				platform: "test",
				qualified: true,
				capabilities: { filesystem_confinement: true, network_confinement: true, process_group_termination: true },
				reasons: [],
			},
		},
		model,
		policy: DEFAULT_POLICY,
		now: () => "2026-09-23T00:00:00Z",
		progress: () => {},
	});
	return { supervisor, probed: agent.probed, started: agent.started };
}

describe("what the supervisor still judges before an intervention (SEC-05)", () => {
	it("hands a chosen provider to the worker, instead of refusing it for its destination", async () => {
		const { supervisor, probed, started } = supervisorFor(CHOSEN);
		await supervisor.requireCapable("implement");
		assert.deepEqual(
			probed.map((m) => m.provider_id),
			["anthropic"],
		);
		await assert.rejects(
			() =>
				supervisor.run(
					{
						intervention_id: "int_1",
						change_id: "chg_1",
						role: "implement",
						objective: "o",
						workspace_path: process.cwd(),
						prompt: "p",
						system_prompt: "s",
						context: mandate("o", process.cwd()).context,
					},
					() => null,
				),
			(error: Error) => error.message === "this test never drives a session",
		);
		assert.deepEqual(started, ["int_1"], "the worker is reached: nothing stands between the choice and the provider");
	});

	it("leaves a model with no provider to the capability check, which names it unconfigured", async () => {
		const { supervisor, started } = supervisorFor({ provider_id: "", model_id: "", thinking_level: "off" });
		await assert.rejects(
			() => supervisor.requireCapable("implement"),
			(error: DomainError) => {
				assert.equal(error.code, "CAPABILITY_MISSING", "a model never configured is not a policy refusal");
				return true;
			},
		);
		assert.deepEqual(started, []);
	});
});
