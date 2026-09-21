import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

	it("names a few declared destinations and counts the rest, whatever the list holds", () => {
		const many = Array.from({ length: 40 }, (_, i) => ({ provider_id: `p${i}`, location: "on_machine" as const }));
		const reason = undeclaredEgressReason({ ...DEFAULT_POLICY, egress: many }, "anthropic") ?? "";
		assert.ok(reason.length < 300, `a refusal travels to the dossier; it must stay a message: ${reason.length} chars`);
		assert.match(reason, /and 32 more/, "the refusal must say how many it did not name");
	});

	it("admits a declared destination and no other, by exact name", () => {
		const policy = { ...DEFAULT_POLICY, egress: LOCAL };
		assert.equal(undeclaredEgressReason(policy, "omlx"), null);
		for (const near of ["OMLX", "omlx ", "oml", "omlx2", "*", ""])
			assert.match(
				undeclaredEgressReason(policy, near) ?? "",
				/is not declared in policy.egress; declared destinations: omlx/,
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

	it("declares nothing at all when any part of a declaration is malformed", () => {
		const bad = [
			null,
			"omlx",
			{ provider_id: "omlx" },
			["anthropic"],
			[{ location: "on_machine" }],
			[{ provider_id: "" }],
			[{ provider_id: "anthropic", location: "mars" }],
			// The case the whole-list refusal exists for: a good entry before the bad one. Without it,
			// keeping the valid prefix would pass every other fixture here.
			[
				{ provider_id: "omlx", location: "on_machine" },
				{ provider_id: "anthropic", location: "mars" },
			],
			// A name declared twice, contradicting itself about whether data leaves the machine.
			[
				{ provider_id: "omlx", location: "on_machine" },
				{ provider_id: "omlx", location: "off_machine" },
			],
		];
		for (const value of bad) {
			const { config, diagnostics } = loadConfig(configured({ egress: value }));
			// Falling back to the default would restore a destination the owner deleted: a control that
			// says what may leave must never widen itself to recover from a typo.
			assert.deepEqual(config.policy.egress, [], `${JSON.stringify(value)} must declare nothing, not the default`);
			assert.ok(
				diagnostics.some((d) => d.includes("no egress destination is declared")),
				`${JSON.stringify(value)} must be reported, not swallowed`,
			);
		}
	});

	it("says out loud when nothing is declared, and stays quiet when the default changes nothing", () => {
		const absent = loadConfig(configured({ budgets: { max_attempts: 5 } })).diagnostics;
		assert.deepEqual(absent, [], "a default that changes no exposure is not worth a line at every session open");
		const empty = loadConfig(configured({ egress: [] })).diagnostics;
		assert.ok(
			empty.some((d) => d.includes("no egress destination is declared")),
			`a declaration that refuses everything must say so at load: ${empty.join(" | ")}`,
		);
	});

	it("declares nothing when the file itself cannot be read", () => {
		writeFileSync(join(root, "config.json"), "{ not json");
		const { config, diagnostics } = loadConfig(root);
		// A file that cannot be read cannot be trusted to have declared anything: keeping the default
		// would restore a destination the owner may have removed in the very edit that broke it.
		assert.deepEqual(config.policy.egress, [], "an unreadable configuration must not inherit a destination");
		assert.ok(
			diagnostics.some((d) => d.includes("no egress destination is declared")),
			diagnostics.join(" | "),
		);
	});

	it("declares nothing when the file parses but is not a configuration", () => {
		// Valid JSON that is not an object declares nothing in substance, exactly like a file that does
		// not parse. Reading it as an absent configuration would restore what the owner may have removed.
		for (const body of ["[]", '"omlx"', "5", "null"]) {
			writeFileSync(join(root, "config.json"), body);
			const { config, diagnostics } = loadConfig(root);
			assert.deepEqual(config.policy.egress, [], `${body} must declare nothing`);
			assert.ok(
				diagnostics.some((d) => d.includes("no egress destination is declared")),
				`${body}: ${diagnostics}`,
			);
		}
	});

	it("names an oversized provider by its length, instead of echoing it into every channel", () => {
		const { config, diagnostics } = loadConfig(
			configured({ egress: [{ provider_id: "z".repeat(300), location: "on_machine" }] }),
		);
		assert.deepEqual(config.policy.egress, []);
		assert.ok(
			diagnostics.every((d) => d.length < 200),
			`a diagnostic reaches the display, the structured entries and the dossier: ${diagnostics.map((d) => d.length)}`,
		);
		assert.ok(
			diagnostics.some((d) => d.includes("300 characters")),
			diagnostics.join(" | "),
		);
	});

	it("keeps a declaration the owner narrowed, instead of restoring what they removed", () => {
		const narrowed = [{ provider_id: "anthropic", location: "off_machine" }];
		const { config } = loadConfig(configured({ egress: narrowed }));
		assert.deepEqual(config.policy.egress, narrowed);
		assert.equal(
			config.policy.egress.some((d) => d.provider_id === "omlx"),
			false,
			"a destination the owner removed must not come back",
		);
	});

	it("says out loud when a declaration sends excerpts off the machine", () => {
		const { diagnostics } = loadConfig(
			configured({
				egress: [
					{ provider_id: "omlx", location: "on_machine" },
					{ provider_id: "anthropic", location: "off_machine" },
				],
			}),
		);
		assert.ok(
			diagnostics.some((d) => d.includes("off this machine") && d.includes("anthropic")),
			`a destination off the machine must be announced, not only stored: ${diagnostics.join(" | ")}`,
		);
	});

	it("hands out its own array, never the one the next load will read", () => {
		const first = loadConfig(root).config.policy.egress;
		first.push({ provider_id: "injected", location: "off_machine" });
		assert.deepEqual(
			loadConfig(root).config.policy.egress.map((d) => d.provider_id),
			["omlx"],
			"one caller widening its own copy must not widen what the next caller is told",
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
				// PATH and HOME are set unconditionally by the supervisor; only TMPDIR is conditional.
				["HOME", "PATH", ...(process.env.TMPDIR === undefined ? [] : ["TMPDIR"])].sort(),
				"the worker environment is built from a closed list, never from the controller's own",
			);
		} finally {
			delete process.env[leaked];
		}
	});
});

describe("what the context builder can put in a prompt (SEC-05, CTX-05)", () => {
	it("composes only from what it was handed, carrying no value of the controller's environment", () => {
		const planted = {
			HARNESS495_TEST_TOKEN: "sk-planted-controller-token-0001",
			HARNESS495_TEST_PATHLIKE: "/planted/controller/path/0002",
		};
		Object.assign(process.env, planted);
		try {
			const { system_prompt, prompt, record } = buildContext({
				role: "implement",
				objective: "tidy the greeter",
				language: "fr",
				adopted: [{ kind: "mandate", artifact_id: "art_1", revision: 1, digest: "sha256:x", text: "ADOPTED-MARKER" }],
				untrusted: [{ source: "repo", text: "UNTRUSTED-MARKER" }],
				feedback: "FEEDBACK-MARKER",
				tools: ["read"],
				budget_bytes: 100_000,
			});
			const composed = `${system_prompt}\n${prompt}\n${record}`;
			// Not a tautology: the markers prove the text really is composed from the input, so the
			// absence of the planted values below says something about what was left out.
			for (const marker of ["ADOPTED-MARKER", "UNTRUSTED-MARKER", "FEEDBACK-MARKER"])
				assert.ok(composed.includes(marker), `the composed context dropped ${marker}, so this test proves nothing`);
			for (const [name, value] of Object.entries(planted))
				assert.equal(composed.includes(value), false, `the composed context carries the value of ${name}`);
		} finally {
			for (const name of Object.keys(planted)) delete process.env[name];
		}
	});
});
