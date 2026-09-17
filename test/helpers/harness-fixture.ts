import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { ScriptedAgent, type AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { UnconfinedSandbox, selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import { GitWorkspace, DEFAULT_WORKSPACE_POLICY } from "../../src/adapters/workspace/git-workspace.ts";
import { Harness, type HarnessDeps } from "../../src/application/harness.ts";
import { fixedSources } from "../../src/application/ids.ts";
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
		objective: "greet(name) must return 'Hello, <name>!'",
		facts: ["greet exists in src/greet.js"],
		assumptions: [],
		questions: [],
		out_of_scope: ["documentation"],
		risks: [],
		requirements: [{ requirement_id: "R1", statement: "greet returns Hello, <name>!", mandatory: true, criterion: "the unit test suite passes", category: "functional" }],
		design: { summary: "change the template literal in src/greet.js", components: ["greet"], interfaces: ["greet(name)"], risks: [] },
		...over,
	};
}

export const GOOD_GREET = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";

type PolicyOverride = Partial<Omit<ActivePolicy, "budgets" | "adoption">> & { budgets?: Partial<ActivePolicy["budgets"]>; adoption?: Partial<ActivePolicy["adoption"]> };

export function makeHarness(options: { policy?: PolicyOverride; scripts?: Record<string, AgentScript>; defaultScript?: AgentScript; sandbox?: "unconfined" | "platform" } = {}): TestHarness {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	const root = mkdtempSync(join(process.cwd(), "test-output", "harness-"));
	const ledger = new SqliteLedger(join(root, "state.sqlite"));
	const objects = new CasObjectStore(join(root, "objects"));
	const workspace = new GitWorkspace(join(root, "workspaces"));
	const sandbox = options.sandbox === "platform" ? selectSandbox({ allow_unconfined: false }) : { backend: new UnconfinedSandbox(), qualification: { ...new UnconfinedSandbox().qualify({ profile_id: "observe", read_paths: [], write_paths: [], network: "denied", env_allowlist: [], env: {} }), qualified: true, reasons: ["test-only: unconfined backend declared qualified for V2"] } };
	const controls = new GenericControlRunner(sandbox.backend, objects);
	const agent = new ScriptedAgent(options.defaultScript ?? { steps: [{ kind: "complete", output: specReport() }] }, options.scripts ?? {});
	const sources = fixedSources();
	const requested: DecisionRequest[] = [];
	const progress: string[] = [];
	const policy: ActivePolicy = { ...DEFAULT_POLICY, ...(options.policy ?? {}), budgets: { ...DEFAULT_POLICY.budgets, ...(options.policy?.budgets ?? {}) }, adoption: { ...DEFAULT_POLICY.adoption, ...(options.policy?.adoption ?? {}) } };
	const deps: HarnessDeps = { ledger, objects, workspace, controls, agent, sandbox, clock: sources.clock, ids: sources.ids, policy, workspacePolicy: DEFAULT_WORKSPACE_POLICY, environment: { environment_id: "env_test", digest: digestValue({ test: true }), profile_id: sandbox.backend.backend }, model: { provider_id: "scripted", model_id: "scripted-1", thinking_level: "off" }, instance_id: "test", denied_read_paths: [root], onDecisionRequested: (r) => requested.push(r), onProgress: (m) => progress.push(m) };
	return { harness: new Harness(deps), ledger, objects, agent, root, requested, progress };
}
