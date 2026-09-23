import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { ScriptedAgent, type AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { UnconfinedSandbox, selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import { GitWorkspace, DEFAULT_WORKSPACE_POLICY } from "../../src/adapters/workspace/git-workspace.ts";
import { Harness, type HarnessDeps } from "../../src/application/harness.ts";
import type { ControlExecutionPort, ModelSelection } from "../../src/ports/execution.ts";
import { fixedSources, randomIds, type IdSource } from "../../src/application/ids.ts";
import { DEFAULT_POLICY, type ActivePolicy } from "../../src/domain/policy.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { DecisionRequest } from "../../src/contracts/v1/decision.ts";
import type { SpecificationReport } from "../../src/contracts/v1/reports.ts";

export interface TestHarness {
	harness: Harness;
	ledger: SqliteLedger;
	objects: CasObjectStore;
	agent: ScriptedAgent;
	root: string;
	requested: DecisionRequest[];
	progress: string[];
}

export function specReport(over: Partial<SpecificationReport> = {}): SpecificationReport {
	return {
		objective: "greet(name) must keep returning 'Hello, <name>'",
		facts: ["greet exists in src/greet.js"],
		assumptions: [],
		questions: [],
		answers: [],
		out_of_scope: ["documentation"],
		risks: [],
		requirements: [
			{
				requirement_id: "R1",
				statement: "greet returns Hello, <name>",
				mandatory: true,
				criterion: "the unit test suite passes",
				category: "functional",
				satisfied_by_reference: true,
			},
		],
		design: {
			summary: "change the template literal in src/greet.js",
			components: ["greet"],
			interfaces: ["greet(name)"],
			risks: [],
		},
		...over,
	};
}

export const GOOD_GREET = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";

export type PolicyOverride = Partial<Omit<ActivePolicy, "budgets" | "adoption">> & {
	budgets?: Partial<ActivePolicy["budgets"]>;
	adoption?: Partial<ActivePolicy["adoption"]>;
};

export interface HarnessOptions {
	policy?: PolicyOverride;
	scripts?: Record<string, AgentScript>;
	defaultScript?: AgentScript;
	sandbox?: "unconfined" | "platform";
	controls?: (real: ControlExecutionPort) => ControlExecutionPort;
	/** Reopen an existing data directory instead of creating one: a new session on the same ledger. */
	root?: string;
	/** Identities are fresh in a new session; the ledger is what carries the change across it. */
	ids?: IdSource;
	/** Overrides the scripted default, e.g. to drive a test against a provider that imposes a layer. */
	model?: Partial<ModelSelection>;
}

/** `controls` wraps the real runner, so a test can make one pass answer differently without rigging a shell script. */
export function makeHarness(options: HarnessOptions = {}): TestHarness {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	const root = options.root ?? mkdtempSync(join(process.cwd(), "test-output", "harness-"));
	const ledger = new SqliteLedger(join(root, "state.sqlite"));
	const objects = new CasObjectStore(join(root, "objects"));
	const workspace = new GitWorkspace(join(root, "workspaces"));
	const sandbox =
		options.sandbox === "platform"
			? selectSandbox({ allow_unconfined: false })
			: {
					backend: new UnconfinedSandbox(),
					qualification: {
						...new UnconfinedSandbox().qualify({
							profile_id: "observe",
							read_paths: [],
							write_paths: [],
							network: "denied",
							env_allowlist: [],
							env: {},
						}),
						qualified: true,
						reasons: ["test-only: unconfined backend declared qualified for V2"],
					},
				};
	const real = new GenericControlRunner(sandbox.backend, objects);
	const controls = options.controls ? options.controls(real) : real;
	const agent = new ScriptedAgent(
		options.defaultScript ?? { steps: [{ kind: "complete", output: specReport() }] },
		options.scripts ?? {},
	);
	const sources = fixedSources();
	const ids = options.ids ?? sources.ids;
	const requested: DecisionRequest[] = [];
	const progress: string[] = [];
	const policy: ActivePolicy = {
		...DEFAULT_POLICY,
		...(options.policy ?? {}),
		budgets: { ...DEFAULT_POLICY.budgets, ...(options.policy?.budgets ?? {}) },
		adoption: { ...DEFAULT_POLICY.adoption, ...(options.policy?.adoption ?? {}) },
	};
	const deps: HarnessDeps = {
		ledger,
		objects,
		workspace,
		controls,
		agent,
		sandbox,
		clock: sources.clock,
		ids,
		policy,
		workspacePolicy: DEFAULT_WORKSPACE_POLICY,
		environment: {
			environment_id: "env_test",
			digest: digestValue({ test: true }),
			profile_id: sandbox.backend.backend,
		},
		model: { provider_id: "scripted", model_id: "scripted-1", thinking_level: "off", ...(options.model ?? {}) },
		instance_id: "test",
		denied_read_paths: [root],
		onDecisionRequested: (r) => requested.push(r),
		onProgress: (m) => progress.push(m),
	};
	return { harness: new Harness(deps), ledger, objects, agent, root, requested, progress };
}

/**
 * Closes a session and opens another one on the same data directory: a Pi session ended and
 * reopened, or the extension reloaded. Nothing is carried over in memory — the agent is new and
 * remembers nothing — so whatever the new session knows, it read back from the ledger.
 */
export function reopenHarness(previous: TestHarness, options: Omit<HarnessOptions, "root" | "ids"> = {}): TestHarness {
	previous.ledger.close();
	return makeHarness({ ...options, root: previous.root, ids: randomIds });
}
