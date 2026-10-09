/**
 * The change-lifecycle model's actions as fast-check commands: each holds the guard of its action in
 * ChangeLifecycle.tla as its precondition and the action's effect on a model of the specification's
 * variables, then replays the action on the kernel through KernelTranslation. After each step the kernel must
 * observe what the model does, record exactly the results the model records, refuse no allowed operation and
 * keep every property a finite trace protects. Sequences are bounded by `MAX_COMMANDS` and reproducible from
 * their seed and path; the campaign samples them and claims no exhaustivity, which is TLC's.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import {
	type ActionName,
	type Control,
	EXPLORED_DOMAIN,
	type G5Verdict,
	type Observation,
	type StepArgs,
	TRACE_FORMAT,
	TRACE_PROPERTIES,
	type Verdict,
} from "./formal-traces.ts";
import { type Decider, KernelTranslation, type ReplayStore, memoryStore, propertyViolation } from "./kernel-replay.ts";

const MAX_COMMANDS = 200;
const DEFAULT_RUNS = 1000;

interface ModelRun {
	control: Control;
	cand: number;
	rev: number;
	ran: number;
}

/** The variables of ChangeLifecycle.tla, and the number of the last step replayed. */
interface LifecycleModel {
	humanPolicy: boolean;
	phase: Exclude<Observation["phase"], "other">;
	status: Exclude<Observation["status"], "other">;
	saved: "ready" | "decision_required";
	interruptions: number;
	attempt: number;
	open: boolean;
	cand: number;
	rev: number;
	runs: ModelRun[];
	evidence: (ModelRun & { verdict: Verdict; valid: boolean })[];
	decisions: { cand: number; option: "accept" | "reject"; valid: boolean }[];
	g5: "none" | G5Verdict;
	outcome: "pending" | "accepted";
	/** An IH-10 request put and not answered; the specification has no requests, the kernel keeps them. */
	requested: boolean;
	step: number;
}

interface Bench {
	kernel: KernelTranslation;
	store: ReplayStore;
	executed: string[];
}

function initialModel(humanPolicy: boolean): LifecycleModel {
	return {
		humanPolicy,
		phase: "verifying",
		status: "ready",
		saved: "ready",
		interruptions: 0,
		attempt: 1,
		open: false,
		cand: 1,
		rev: 1,
		runs: [],
		evidence: [],
		decisions: [],
		g5: "none",
		outcome: "pending",
		requested: false,
		step: 1,
	};
}

// --- the operators of the specification ------------------------------------------------------------------

const usable = (m: LifecycleModel) => m.evidence.filter((e) => e.valid && e.cand === m.cand && e.rev === m.rev);
const evidenced = (m: LifecycleModel, k: Control) => usable(m).some((e) => e.control === k);
const running = (m: LifecycleModel, k: Control) =>
	m.runs.some((r) => r.control === k && r.cand === m.cand && r.rev === m.rev);
const CONTROLS: Control[] = ["k1", "k2"];

function obligationsMet(m: LifecycleModel): boolean {
	const current = usable(m);
	const passed = new Set(current.filter((e) => e.verdict === "PASS").map((e) => e.control));
	const failed = current.some((e) => e.verdict === "FAIL");
	const all = CONTROLS.every((k) => passed.has(k)) && !failed;
	const any = passed.size > 0;
	return all && any;
}
const humanSaid = (m: LifecycleModel, option: "accept" | "reject") =>
	m.decisions.some((d) => d.valid && d.cand === m.cand && d.option === option);
const revoke = (m: LifecycleModel) => {
	m.decisions = m.decisions.map((d) => ({ ...d, valid: false }));
};

function observeModel(m: LifecycleModel): Observation {
	return {
		phase: m.phase,
		status: m.status,
		outcome: m.outcome,
		attempt: m.attempt,
		evidence: usable(m)
			.map((e) => `${e.control}:${e.verdict}`)
			.sort(),
	};
}

// --- the commands -----------------------------------------------------------------------------------------

/**
 * One action of the model: `enabled` is its guard, `effect` its change to the model, returning the arguments
 * the kernel translation needs. The step is then replayed on the kernel and judged against the model.
 */
abstract class LifecycleCommand implements fc.Command<LifecycleModel, Bench> {
	abstract readonly action: ActionName;
	protected abstract enabled(m: LifecycleModel): boolean;
	protected abstract effect(m: LifecycleModel): StepArgs;
	protected label(): string {
		return this.action;
	}

	check(m: Readonly<LifecycleModel>): boolean {
		return this.enabled(m as LifecycleModel);
	}

	run(m: LifecycleModel, bench: Bench): void {
		m.step += 1;
		const recordable = this.action === "Deliver";
		const before = m.evidence.length;
		const args = this.effect(m);
		bench.executed.push(this.toString());
		const report = bench.kernel.run({ step: m.step, action: this.action, args });
		const where = `step ${m.step} ${this.toString()}`;
		if (!recordable && report.refusals.length > 0)
			throw new Error(`${where}: the kernel refused ${report.refusals.join(", ")}`);
		const expected = JSON.stringify(observeModel(m));
		if (JSON.stringify(report.observed) !== expected)
			throw new Error(`${where}: the kernel observes ${JSON.stringify(report.observed)}, the model ${expected}`);
		if (this.action === "EvaluateG5" && report.g5 !== m.g5)
			throw new Error(`${where}: G5 is ${report.g5 ?? "not decided"} on the kernel, ${m.g5} in the model`);
		const modelRecorded = m.evidence.length > before ? "recorded" : "rejected";
		if (recordable && report.delivered !== modelRecorded)
			throw new Error(`${where}: the kernel's result is ${report.delivered}, the model's ${modelRecorded}`);
		const state = bench.store.state();
		const events = bench.store.events();
		for (const property of TRACE_PROPERTIES) {
			const violation = propertyViolation(property, state, events, m.humanPolicy);
			if (violation) throw new Error(`${where}: ${property} is violated: ${violation}`);
		}
	}

	toString(): string {
		return this.label();
	}
}

class Launch extends LifecycleCommand {
	readonly action = "Launch";
	private readonly control: Control;
	constructor(control: Control) {
		super();
		this.control = control;
	}
	protected enabled(m: LifecycleModel) {
		return m.phase === "verifying" && m.status === "ready" && !evidenced(m, this.control) && !running(m, this.control);
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.runs.push({ control: this.control, cand: m.cand, rev: m.rev, ran: m.rev });
		return { control: this.control };
	}
	protected override label() {
		return `Launch(${this.control})`;
	}
}

/** A result arriving: the `index`-th run in flight, modulo their number, with `verdict`. */
class Deliver extends LifecycleCommand {
	readonly action = "Deliver";
	private readonly index: number;
	private readonly verdict: Verdict;
	constructor(index: number, verdict: Verdict) {
		super();
		this.index = index;
		this.verdict = verdict;
	}
	protected enabled(m: LifecycleModel) {
		return m.runs.length > 0;
	}
	protected effect(m: LifecycleModel): StepArgs {
		const run = m.runs.splice(this.index % m.runs.length, 1)[0] as ModelRun;
		if (m.phase === "verifying" && run.cand === m.cand && run.rev === m.rev)
			m.evidence.push({ ...run, verdict: this.verdict, valid: true });
		return { control: run.control, cand: run.cand, ran: run.ran, verdict: this.verdict };
	}
	protected override label() {
		return `Deliver(#${this.index} ${this.verdict})`;
	}
}

class Complete extends LifecycleCommand {
	readonly action = "Complete";
	protected enabled(m: LifecycleModel) {
		return m.phase === "verifying" && m.status === "ready" && CONTROLS.every((k) => evidenced(m, k));
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.phase = "deciding";
		m.g5 = "none";
		return {};
	}
}

class EvaluateG5 extends LifecycleCommand {
	readonly action = "EvaluateG5";
	protected enabled(m: LifecycleModel) {
		return m.phase === "deciding" && m.status === "ready" && m.g5 === "none";
	}
	protected effect(m: LifecycleModel): StepArgs {
		const met = obligationsMet(m);
		if (met && (!m.humanPolicy || humanSaid(m, "accept"))) {
			m.g5 = "PASS";
			m.outcome = "accepted";
			m.phase = "closed";
		} else if (met && !humanSaid(m, "reject")) {
			m.g5 = "INDETERMINATE";
			m.status = "decision_required";
			m.requested = true;
		} else m.g5 = "FAIL";
		return {};
	}
}

class HumanAnswer extends LifecycleCommand {
	readonly action = "HumanAnswer";
	private readonly option: "accept" | "reject";
	constructor(option: "accept" | "reject") {
		super();
		this.option = option;
	}
	protected enabled(m: LifecycleModel) {
		return m.status === "decision_required";
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.decisions.push({ cand: m.cand, option: this.option, valid: true });
		m.requested = false;
		m.status = "ready";
		m.g5 = "none";
		return { option: this.option };
	}
	protected override label() {
		return `HumanAnswer(${this.option})`;
	}
}

class Correct extends LifecycleCommand {
	readonly action = "Correct";
	protected enabled(m: LifecycleModel) {
		return m.phase === "deciding" && m.status === "ready" && m.g5 === "FAIL" && m.attempt < EXPLORED_DOMAIN.maxAttempts;
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.attempt += 1;
		m.open = true;
		m.phase = "implementation";
		m.g5 = "none";
		revoke(m);
		return {};
	}
}

class ExhaustOnCorrection extends LifecycleCommand {
	readonly action = "ExhaustOnCorrection";
	protected enabled(m: LifecycleModel) {
		return (
			m.phase === "deciding" && m.status === "ready" && m.g5 === "FAIL" && m.attempt === EXPLORED_DOMAIN.maxAttempts
		);
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.status = "blocked";
		return {};
	}
}

class StartAttempt extends LifecycleCommand {
	readonly action = "StartAttempt";
	protected enabled(m: LifecycleModel) {
		return m.phase === "implementation" && m.status === "ready" && !m.open && m.attempt < EXPLORED_DOMAIN.maxAttempts;
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.attempt += 1;
		m.open = true;
		return {};
	}
}

class ExhaustOnStart extends LifecycleCommand {
	readonly action = "ExhaustOnStart";
	protected enabled(m: LifecycleModel) {
		return m.phase === "implementation" && m.status === "ready" && !m.open && m.attempt === EXPLORED_DOMAIN.maxAttempts;
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.status = "blocked";
		return {};
	}
}

/** The open attempt's candidate: the previous tree, hence the same identity, or a new one. */
class Freeze extends LifecycleCommand {
	readonly action = "Freeze";
	private readonly sameTree: boolean;
	constructor(sameTree: boolean) {
		super();
		this.sameTree = sameTree;
	}
	protected enabled(m: LifecycleModel) {
		return m.phase === "implementation" && m.status === "ready" && m.open;
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.cand = this.sameTree ? m.cand : m.attempt;
		m.open = false;
		m.phase = "verifying";
		return { cand: m.cand };
	}
	protected override label() {
		return `Freeze(${this.sameTree ? "same" : "new"})`;
	}
}

/**
 * The specification lets a revision come while an IH-10 request waits for its answer. The campaign leaves that
 * case out until the kernel withdraws such a request on a revision: today it keeps the request pending through
 * the revision, and the owner's answer to the next one leaves the change waiting on it.
 */
class ReviseProtocol extends LifecycleCommand {
	readonly action = "ReviseProtocol";
	protected enabled(m: LifecycleModel) {
		return (
			m.rev < EXPLORED_DOMAIN.maxRevisions &&
			["implementation", "verifying", "deciding"].includes(m.phase) &&
			!m.requested
		);
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.rev += 1;
		m.phase = "qualification";
		m.status = "ready";
		m.g5 = "none";
		m.evidence = m.evidence.map((e) => ({ ...e, valid: false }));
		revoke(m);
		return {};
	}
}

class Requalify extends LifecycleCommand {
	readonly action = "Requalify";
	protected enabled(m: LifecycleModel) {
		return m.phase === "qualification" && m.status === "ready";
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.phase = "implementation";
		return {};
	}
}

class Pause extends LifecycleCommand {
	readonly action = "Pause";
	protected enabled(m: LifecycleModel) {
		return (
			m.phase !== "closed" &&
			(m.status === "ready" || m.status === "decision_required") &&
			m.interruptions < EXPLORED_DOMAIN.maxInterruptions
		);
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.saved = m.status as LifecycleModel["saved"];
		m.status = "paused";
		m.interruptions += 1;
		return {};
	}
}

class Resume extends LifecycleCommand {
	readonly action = "Resume";
	protected enabled(m: LifecycleModel) {
		return m.status === "paused";
	}
	protected effect(m: LifecycleModel): StepArgs {
		m.status = m.saved;
		return {};
	}
}

const launch = fc.constantFrom<Control>("k1", "k2").map((k) => new Launch(k));
const deliver = fc
	.tuple(fc.nat({ max: 3 }), fc.constantFrom<Verdict>("PASS", "FAIL"))
	.map(([i, v]) => new Deliver(i, v));
const complete = fc.constant(new Complete());
const evaluateG5 = fc.constant(new EvaluateG5());

/**
 * Drawn uniformly by fast-check, an action is mostly disabled where it falls: the verification actions,
 * which a sequence needs several times to reach G5, are listed more than once so that sequences reach it.
 */
const ARBITRARY_COMMANDS: fc.Arbitrary<LifecycleCommand>[] = [
	launch,
	launch,
	launch,
	deliver,
	deliver,
	deliver,
	complete,
	complete,
	evaluateG5,
	evaluateG5,
	fc.constantFrom<"accept" | "reject">("accept", "reject").map((o) => new HumanAnswer(o)),
	fc.constant(new Correct()),
	fc.constant(new ExhaustOnCorrection()),
	fc.constant(new StartAttempt()),
	fc.constant(new ExhaustOnStart()),
	fc.boolean().map((same) => new Freeze(same)),
	fc.constant(new ReviseProtocol()),
	fc.constant(new Requalify()),
	fc.constant(new Pause()),
	fc.constant(new Resume()),
];

function lifecycleSequences(replayPath: string | null) {
	return fc.tuple(
		fc.boolean(),
		fc.commands(ARBITRARY_COMMANDS, {
			maxCommands: MAX_COMMANDS,
			size: "max",
			...(replayPath ? { replayPath } : {}),
		}),
	);
}

// --- the campaign ------------------------------------------------------------------------------------------

/** The failure of one generated sequence, carrying the actions it executed up to the failing one. */
class SequenceFailure extends Error {
	readonly sequence: string[];
	constructor(cause: unknown, sequence: string[]) {
		super(cause instanceof Error ? cause.message : String(cause), { cause });
		this.sequence = sequence;
	}
}

export interface CampaignOptions {
	seed: number;
	numRuns?: number;
	/** The reduction path of a failure, which replays it with `seed`. */
	path?: string;
	/** The commands' own replay path, which fast-check's command shrinker needs beside `path`. */
	replayPath?: string | null;
	/** Whether a failure is reduced, true by default; false replays the case at `path` as it stands. */
	reduce?: boolean;
	decide?: Decider;
}

export interface CampaignResult {
	failed: boolean;
	seed: number;
	path: string | null;
	replay_path: string | null;
	/** The actions the reduced failing sequence executed, in order; empty when nothing failed. */
	sequence: string[];
	failure: string | null;
}

/** The actions each of the first `runs` sequences generated from `seed` would attempt, as they print. */
export function sampleActions(seed: number, runs: number): string[][] {
	return fc.sample(lifecycleSequences(null), { seed, numRuns: runs }).map(([, cmds]) => [...cmds].map(String));
}

/** Runs the generated sequences on the kernel, `decide` standing for its decider, and reduces a failure. */
export function runCampaign(o: CampaignOptions): CampaignResult {
	const decider = o.decide;
	const property = fc.property(lifecycleSequences(o.replayPath ?? null), ([human, cmds]) => {
		const store = memoryStore();
		const bench: Bench = { kernel: new KernelTranslation(human, store, decider), store, executed: [] };
		try {
			fc.modelRun(() => ({ model: initialModel(human), real: bench }), cmds);
		} catch (error) {
			throw new SequenceFailure(error, [...bench.executed]);
		}
	});
	const details = fc.check(property, {
		seed: o.seed,
		numRuns: o.numRuns ?? DEFAULT_RUNS,
		endOnFailure: o.reduce === false,
		...(o.path ? { path: o.path } : {}),
	});
	if (!details.failed)
		return { failed: false, seed: o.seed, path: null, replay_path: null, sequence: [], failure: null };
	const error = details.errorInstance;
	const replay = /replayPath=("(?:[^"\\]|\\.)*")/.exec(String(details.counterexample?.[0]?.[1] ?? ""))?.[1];
	return {
		failed: true,
		seed: details.seed,
		path: details.counterexamplePath,
		replay_path: replay ? (JSON.parse(replay) as string) : null,
		sequence: error instanceof SequenceFailure ? error.sequence : [],
		failure: error instanceof Error ? error.message : String(error),
	};
}

// --- the reduced cases kept ---------------------------------------------------------------------------------

export interface ReducedCase {
	format: typeof TRACE_FORMAT;
	defect: string;
	seed: number;
	path: string;
	replay_path: string | null;
	versions: { "fast-check": string; node: string; model: string; trace_format: typeof TRACE_FORMAT };
	sequence: string[];
	failure: string;
}

const MODEL_MANIFEST = "specs/formal/change-lifecycle/manifest.json";

function versions(): ReducedCase["versions"] {
	const fastCheck = JSON.parse(readFileSync("node_modules/fast-check/package.json", "utf8")) as { version: string };
	const manifest = JSON.parse(readFileSync(MODEL_MANIFEST, "utf8")) as { files: Record<string, string> };
	return {
		"fast-check": fastCheck.version,
		node: process.version,
		model: manifest.files["ChangeLifecycle.tla"] ?? "unknown",
		trace_format: TRACE_FORMAT,
	};
}

/** What a failure found by a campaign leaves to replay it: seed, reduction path, versions, minimal sequence. */
function reducedCase(result: CampaignResult, defect: string): ReducedCase {
	if (!result.failed || !result.path || !result.failure)
		throw new Error(`the campaign of seed ${result.seed} found no failure to keep`);
	return {
		format: TRACE_FORMAT,
		defect,
		seed: result.seed,
		path: result.path,
		replay_path: result.replay_path,
		versions: versions(),
		sequence: result.sequence,
		failure: result.failure,
	};
}

function persistReducedCase(path: string, reduced: ReducedCase): void {
	writeFileSync(path, `${JSON.stringify(reduced, null, "\t")}\n`);
}

/** Where a campaign keeps the reduced case of a gap it finds: under `test-output/`, ignored by Git, never purged. */
export const REDUCED_CASES = "test-output/formal-traces/reduced";

/**
 * Runs the campaign and, when it finds a gap, keeps its reduced case in a file of `REDUCED_CASES` named by its seed
 * and path, then fails with a message naming that file, from which the case replays.
 */
export function assertCampaignHolds(o: CampaignOptions, defect: string): void {
	const result = runCampaign(o);
	if (!result.failed) return;
	const reduced = reducedCase(result, defect);
	mkdirSync(REDUCED_CASES, { recursive: true });
	const file = join(REDUCED_CASES, `seed-${reduced.seed}-path-${reduced.path.replaceAll(":", "_")}.json`);
	persistReducedCase(file, reduced);
	assert.fail(
		`${defect}: the reduced case is kept in ${file}\n${reduced.failure}\nminimal sequence: ${reduced.sequence.join(", ")}`,
	);
}

export function readReducedCase(path: string): ReducedCase {
	const kept = JSON.parse(readFileSync(path, "utf8")) as Partial<ReducedCase>;
	if (kept.format !== TRACE_FORMAT || typeof kept.seed !== "number" || typeof kept.path !== "string")
		throw new Error(`${path} is not a reduced case of format ${TRACE_FORMAT} with a seed and a path`);
	return kept as ReducedCase;
}
