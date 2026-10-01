import { strict as assert } from "node:assert";
import { join } from "node:path";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { ScriptedAgent, type AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { UnconfinedSandbox, selectSandbox } from "../../src/adapters/sandbox/backends.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import { GitWorkspace, DEFAULT_WORKSPACE_POLICY } from "../../src/adapters/workspace/git-workspace.ts";
import { type AdvanceResult, Harness, type HarnessDeps } from "../../src/application/harness.ts";
import type {
	ControlExecutionPort,
	ControlInvocation,
	ModelSelection,
	SandboxPort,
} from "../../src/ports/execution.ts";
import { fixedSources, randomIds, type IdSource } from "../../src/application/ids.ts";
import { DEFAULT_POLICY, type ActivePolicy } from "../../src/domain/policy.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { DecisionRequest } from "../../src/contracts/v1/decision.ts";
import type { SpecificationReport } from "../../src/contracts/v1/reports.ts";
import { outputDir, removedAfterEach } from "./fixtures.ts";

/** The roots `makeHarness` allocates, removed after each test. */
const harnessRoots = removedAfterEach();

/**
 * A harness whose `advance` reads the test's model unless the test passes its own reader: most tests
 * are about something else than which model Pi holds as selected.
 */
class HarnessWithModel extends Harness {
	private readonly model: ModelSelection;
	constructor(deps: HarnessDeps, model: ModelSelection) {
		super(deps);
		this.model = model;
	}
	override advance(changeId: string, options: Partial<Parameters<Harness["advance"]>[1]> = {}): Promise<AdvanceResult> {
		return super.advance(changeId, { ...options, readModel: options.readModel ?? (() => this.model) });
	}
}

export interface TestHarness {
	harness: HarnessWithModel;
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

/**
 * Plays one specification report per round, the last one again once they run out, and keeps the
 * objective each one was written from. Every implementation writes GOOD_GREET.
 */
export function specificationRounds(
	t: TestHarness,
	reports: SpecificationReport[],
): { objectives: string[]; calls: () => number } {
	const objectives: string[] = [];
	let calls = 0;
	const original = t.agent.startIntervention.bind(t.agent);
	t.agent.startIntervention = async (m) => {
		if (m.role === "specify") {
			calls++;
			objectives.push(m.objective);
			t.agent.scripts.set("specify", {
				steps: [{ kind: "complete", output: reports[Math.min(calls - 1, reports.length - 1)]! }],
			});
		}
		if (m.role === "implement")
			t.agent.scripts.set("implement", {
				steps: [
					{ kind: "write", path: "src/greet.js", content: GOOD_GREET },
					{
						kind: "complete",
						output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
					},
				],
			});
		return original(m);
	};
	return { objectives, calls: () => calls };
}

/**
 * The change stopped in clarification because its specification loses the given answers and can no
 * longer be reopened: a stagnation a resume lifts, naming each lost answer and both ways out, with no
 * mandate proposed, no gate evaluated and no adoption asked for.
 */
export async function assertStoppedBeforeG0(t: TestHarness, changeId: string, lost: string[]): Promise<void> {
	const state = t.ledger.loadChange(changeId)!.state;
	assert.equal(state.status, "blocked");
	assert.equal(state.phase, "clarifying");
	assert.equal(state.stop_reason, "stagnation", state.stop_detail ?? "");
	assert.equal(state.stop_retryable, true, "a resume lifts the stop");
	for (const id of [...lost, "resume", "close", "cancel"])
		assert.ok(state.stop_detail?.includes(id), `${id} is not named in: ${state.stop_detail}`);
	assert.equal(state.gates.G0, undefined, "G0 is not evaluated");
	assert.equal(state.gates.G1, undefined, "G1 is not evaluated");
	assert.equal(await t.harness.artifacts.latest(state, "mandate"), null, "no mandate is proposed");
	assert.equal(
		t.requested.some((r) => r.interaction === "IH-02"),
		false,
		"no adoption is asked for",
	);
}

export type PolicyOverride = Partial<Omit<ActivePolicy, "budgets" | "adoption">> & {
	budgets?: Partial<ActivePolicy["budgets"]>;
	adoption?: Partial<ActivePolicy["adoption"]>;
};

export interface HarnessOptions {
	policy?: PolicyOverride;
	scripts?: Record<string, AgentScript>;
	defaultScript?: AgentScript;
	/** Replaces the scripted agent built from `scripts` and `defaultScript`, e.g. one that judges the model it is given. */
	agent?: ScriptedAgent;
	sandbox?: "unconfined" | "platform";
	/** Wraps the unconfined backend, e.g. with one that stands for the package repository an install reaches. */
	backend?: (real: SandboxPort) => SandboxPort;
	controls?: (real: ControlExecutionPort) => ControlExecutionPort;
	/** Reopen an existing data directory instead of creating one: a new session on the same ledger. */
	root?: string;
	/** Identities are fresh in a new session; the ledger is what carries the change across it. */
	ids?: IdSource;
	/**
	 * The model `advance` reads unless the test passes its own reader, e.g. to drive a test against a
	 * provider that imposes a layer.
	 */
	model?: Partial<ModelSelection>;
	/** Opens the ledger at the given path, e.g. one whose storage fails where a test needs it to. */
	ledger?: (path: string) => SqliteLedger;
}

/**
 * The real control runner, with `act` written on the change as the first control starts on the
 * candidate — the owner's pause, or what another live session writes. No signal stops a control, so
 * the pass runs on, and its next commit loses to that act.
 */
export class ActsOnFirstCandidateRun implements ControlExecutionPort {
	private readonly real: ControlExecutionPort;
	private readonly act: () => void;
	private acted = false;
	constructor(real: ControlExecutionPort, act: () => void) {
		this.real = real;
		this.act = act;
	}
	runControl(invocation: ControlInvocation, signal?: AbortSignal): ReturnType<ControlExecutionPort["runControl"]> {
		if (invocation.subject.kind === "candidate" && !this.acted) {
			this.acted = true;
			this.act();
		}
		return this.real.runControl(invocation, signal);
	}
}

/**
 * The real control runner, throwing `error` as the first control starts on the candidate. It breaks
 * the port's contract, under which a run always resolves, to stand for a failure between the opening
 * of the verification and its record: a plain error ends the conduct as a session killed while the
 * controls ran would, leaving the verification open, and a domain error fails the step, which blocks
 * the change. No domain error of one session is known to fail that step; the block it stands for comes
 * from a second live session, whose write makes this session's record lose on the revision.
 */
export class ThrowsOnFirstCandidateRun implements ControlExecutionPort {
	private readonly real: ControlExecutionPort;
	private readonly error: Error;
	private thrown = false;
	constructor(real: ControlExecutionPort, error: Error) {
		this.real = real;
		this.error = error;
	}
	runControl(invocation: ControlInvocation, signal?: AbortSignal): ReturnType<ControlExecutionPort["runControl"]> {
		if (invocation.subject.kind === "candidate" && !this.thrown) {
			this.thrown = true;
			return Promise.reject(this.error);
		}
		return this.real.runControl(invocation, signal);
	}
}

/** `controls` wraps the real runner, so a test can make one pass answer differently without rigging a shell script. */
export function makeHarness(options: HarnessOptions = {}): TestHarness {
	const root = options.root ?? outputDir("harness-", harnessRoots);
	const ledger = (options.ledger ?? ((path: string) => new SqliteLedger(path)))(join(root, "state.sqlite"));
	const objects = new CasObjectStore(join(root, "objects"));
	const workspace = new GitWorkspace(join(root, "workspaces"));
	const sandbox =
		options.sandbox === "platform"
			? selectSandbox({ allow_unconfined: false })
			: {
					backend: options.backend ? options.backend(new UnconfinedSandbox()) : new UnconfinedSandbox(),
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
	const agent =
		options.agent ??
		new ScriptedAgent(
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
		instance_id: "test",
		denied_read_paths: [root],
		onDecisionRequested: (r) => requested.push(r),
		onProgress: (m) => progress.push(m),
	};
	const model: ModelSelection = {
		provider_id: "scripted",
		model_id: "scripted-1",
		thinking_level: "off",
		location: "on_machine",
		...(options.model ?? {}),
	};
	return { harness: new HarnessWithModel(deps, model), ledger, objects, agent, root, requested, progress };
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
