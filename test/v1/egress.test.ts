import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildContext } from "../../src/application/context.ts";
import { InterventionSupervisor } from "../../src/application/intervention.ts";
import type { DomainError } from "../../src/domain/errors.ts";
import { DEFAULT_POLICY, type DeclaredEgress, undeclaredEgressReason } from "../../src/domain/policy.ts";
import { loadConfig } from "../../src/extension/config.ts";
import type { AgentPort, InterventionEvent, ModelSelection, SandboxProfile } from "../../src/ports/execution.ts";
import { collect, fakeWorkerAgent, mandate } from "../helpers/intervention-fixture.ts";

const LOCAL: DeclaredEgress[] = [{ provider_id: "omlx", location: "on_machine" }];

/**
 * A backend no test here drives. `InterventionSupervisor` reads only the pre-computed qualification
 * and the backend's name, never these methods — so throwing costs nothing and surfaces any
 * accidental use, rather than letting a silent stub stand in for a sandbox that was never run.
 */
class RefusingSandbox {
	readonly backend = "test";
	qualify(): never {
		throw new Error("no test here drives a sandbox");
	}
	run(_profile: SandboxProfile): never {
		throw new Error("no test here drives a sandbox");
	}
}

/**
 * A supervisor whose sandbox is qualified and whose model answers, so the only thing left to refuse
 * is the destination. The agent records what it was asked, because what the refusal prevents is the
 * point, not what it says.
 */
function supervisorFor(model: ModelSelection, egress: DeclaredEgress[] = LOCAL) {
	const probed: ModelSelection[] = [];
	const started: string[] = [];
	const agent: AgentPort = {
		async describeCapabilities(m) {
			probed.push(m);
			return {
				provider_id: m.provider_id,
				model_id: m.model_id,
				available: Boolean(m.provider_id && m.model_id),
				reasons: ["model / unavailable"],
			};
		},
		async startIntervention(m) {
			started.push(m.intervention_id);
			throw new Error("this test never drives a session");
		},
	};
	const supervisor = new InterventionSupervisor({
		agent,
		sandbox: {
			backend: new RefusingSandbox(),
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

const omlx: ModelSelection = { provider_id: "omlx", model_id: "qwen3.8-27b-oq8e", thinking_level: "off" };

describe("the rule that says what may leave (SEC-05, D-11, D-46)", () => {
	it("declares nothing of its own: the kernel knows no machine", () => {
		assert.deepEqual(DEFAULT_POLICY.egress, [], "a machine-specific destination does not belong to the kernel");
	});

	it("names an empty declaration as the cause, rather than listing nothing", () => {
		assert.match(
			undeclaredEgressReason({ ...DEFAULT_POLICY, egress: [] }, "omlx") ?? "",
			/no egress destination is declared/,
			"an empty declaration refuses everything on purpose, and says so",
		);
	});

	it("admits a declared destination and no other, by exact name", () => {
		const policy = { ...DEFAULT_POLICY, egress: LOCAL };
		assert.equal(undeclaredEgressReason(policy, "omlx"), null);
		for (const near of ["OMLX", "omlx ", "oml", "omlx2", "*", ""])
			assert.match(
				undeclaredEgressReason(policy, near) ?? "",
				/is not a declared egress destination: omlx/,
				`${JSON.stringify(near)} must not be admitted by resemblance`,
			);
	});
});

describe("the declaration a configuration carries (SEC-05)", () => {
	let root: string;
	beforeEach(() => {
		mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
		root = mkdtempSync(join(process.cwd(), "test-output", "egress-"));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const configured = (policy: unknown): string => {
		writeFileSync(join(root, "config.json"), JSON.stringify({ policy }));
		return root;
	};

	it("declares the provider this installation reaches, which sits on the machine", () => {
		const { config } = loadConfig(root);
		assert.deepEqual(
			config.policy.egress,
			LOCAL,
			"an installation with no configuration still reaches its local model",
		);
		assert.deepEqual(
			config.policy.egress.filter((d) => d.location === "off_machine"),
			[],
			"a destination off the machine is written down, never inherited",
		);
	});

	it("keeps the declaration when a configuration names the policy without naming it", () => {
		const { config } = loadConfig(configured({ budgets: { max_attempts: 5 } }));
		assert.deepEqual(config.policy.egress, LOCAL, "an unrelated setting must not empty the declaration");
		assert.equal(config.policy.budgets.max_attempts, 5, "the setting it did name still applies");
	});

	it("replaces the declaration entirely when a configuration names it", () => {
		const declared = [...LOCAL, { provider_id: "anthropic", location: "off_machine" }];
		const { config } = loadConfig(configured({ egress: declared }));
		assert.deepEqual(config.policy.egress, declared, "a declaration is written whole, never merged entry by entry");
	});

	it("refuses a malformed declaration with a diagnostic, instead of crashing where it is read", () => {
		for (const bad of [null, "omlx", { provider_id: "omlx" }, [{ location: "on_machine" }], [{ provider_id: "" }]]) {
			const { config, diagnostics } = loadConfig(configured({ egress: bad }));
			assert.deepEqual(config.policy.egress, LOCAL, `${JSON.stringify(bad)} must leave the default standing`);
			assert.ok(
				diagnostics.some((d) => d.includes("egress") || d.includes("destination")),
				`${JSON.stringify(bad)} must be reported, not swallowed`,
			);
		}
	});

	it("refuses a destination that does not say where it sits", () => {
		const { config, diagnostics } = loadConfig(
			configured({ egress: [{ provider_id: "anthropic", location: "mars" }] }),
		);
		assert.deepEqual(config.policy.egress, LOCAL);
		assert.ok(
			diagnostics.some((d) => d.includes("where it sits")),
			diagnostics.join(" | "),
		);
	});
});

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

	it("is refused again where the bytes would leave, not only where the caller remembered to ask", async () => {
		const { supervisor, started } = supervisorFor({
			provider_id: "anthropic",
			model_id: "claude-opus",
			thinking_level: "off",
		});
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
			(error: DomainError) => error.code === "POLICY_DENIED",
		);
		assert.deepEqual(started, [], "run() does not rest on a caller having asked first");
	});

	it("carries a declared destination through to the capability check that already existed", async () => {
		const { supervisor, probed, started } = supervisorFor(omlx);
		await supervisor.requireCapable("implement");
		assert.deepEqual(
			probed.map((m) => m.provider_id),
			["omlx"],
			"a declared destination is reached: the declaration bounds what may leave, it does not refuse everything",
		);
		assert.deepEqual(started, [], "requiring capability starts no worker on its own");
	});

	it("leaves a model that was never configured to the check that names it (RM-022)", async () => {
		const { supervisor, started } = supervisorFor({ provider_id: "", model_id: "", thinking_level: "off" });
		await assert.rejects(
			() => supervisor.requireCapable("implement"),
			(error: DomainError) => {
				assert.equal(
					error.code,
					"CAPABILITY_MISSING",
					"an absent model selection is a configuration that was never made, not a destination that was refused",
				);
				assert.doesNotMatch(error.message, /egress/, "naming a policy refusal here would hide the real cause");
				return true;
			},
		);
		assert.deepEqual(started, []);
	});
});

describe("what the worker process receives from the controller's own environment (SEC-05, D-11)", () => {
	it("hands it a closed set of variables, carrying no secret of the controller", async () => {
		const leaked = "HARNESS495_TEST_SENTINEL";
		process.env[leaked] = "sk-controller-secret-do-not-leak";
		try {
			const handle = await fakeWorkerAgent(2000).startIntervention(mandate("echo-env", process.cwd()));
			const events = await collect(handle.events);
			const completed = events.find(
				(e): e is Extract<InterventionEvent, { type: "completed" }> => e.type === "completed",
			);
			assert.ok(completed, `the worker never completed: ${JSON.stringify(events)}`);
			const env = (completed.output as { env?: Record<string, string> }).env;
			assert.ok(env, "the fake worker did not report an environment to inspect");
			assert.equal(env[leaked], undefined, "a secret set in the controller's environment reached the worker");
			// The whole key set, not just the sentinel: the failure this guards against is any controller
			// variable riding along, not one named in advance. macOS injects __CF_USER_TEXT_ENCODING into
			// every child below the spawn call — the harness does not carry it, and naming it here says so
			// rather than letting a loose assertion hide whatever else might arrive.
			const injectedByPlatform = ["__CF_USER_TEXT_ENCODING"];
			assert.deepEqual(
				Object.keys(env)
					.filter((k) => !injectedByPlatform.includes(k))
					.sort(),
				["HOME", "PATH", "TMPDIR"].filter((k) => process.env[k] !== undefined).sort(),
				"the worker environment is built from a closed list, never from the controller's own",
			);
		} finally {
			delete process.env[leaked];
		}
	});
});

describe("what the context builder can put in a prompt (SEC-05, CTX-05)", () => {
	it("reads no environment at all, so nothing it composes can carry a controller secret", () => {
		const source = readFileSync(join(process.cwd(), "src", "application", "context.ts"), "utf8");
		assert.deepEqual(
			source.match(/process\s*\.\s*env|process\s*\[\s*["'`]env/g) ?? [],
			[],
			"buildContext must stay a pure function of its input, never of the environment",
		);
		// And no value of the environment reaches the text it composes, whatever its name.
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
		const composed = `${system_prompt}\n${prompt}\n${record}`;
		for (const [name, value] of Object.entries(process.env))
			if (value && value.length > 12)
				assert.equal(composed.includes(value), false, `the composed context carries the value of ${name}`);
	});
});
