/**
 * The traces of specs/formal/change-lifecycle in a versioned format of abstract actions and of what is
 * observed after each, and the closed mapping of every abstract action to the kernel commands that carry it
 * out. A trace is refused as soon as one of its actions has no translation: it is never replayed in part.
 *
 * What is observed, on the model as on the kernel, after each step: the phase, the status, whether the
 * change is accepted, the attempts consumed and the evidence G5 would retain (valid, of the frozen
 * candidate, under the frozen revision), as `control:verdict`. An EvaluateG5 step also observes the G5
 * verdict. The rest is abstracted: the kernel's `running` status while a verification is open and its
 * `completed` status once closed read as `ready`, as the model keeps its status through both; the design
 * phase Requalify crosses, the interventions and the verification operation are internal steps of the
 * actions that issue them.
 */
import type { ChangeCommand } from "../../src/domain/change/commands.ts";
import type { ChangeState } from "../../src/domain/change/state.ts";

export const TRACE_FORMAT = 1;

/** The bounds of the adopted exploration, ChangeLifecycle.cfg; the kernel's attempt budget is set to the model's. */
export const EXPLORED_DOMAIN = { maxAttempts: 2, maxRevisions: 2, maxInterruptions: 1 } as const;

/** The model's controls, carried on the kernel by the fixture protocol's two controls. */
export const CONTROL_IDS = { k1: "unit", k2: "lint" } as const;
export type Control = keyof typeof CONTROL_IDS;
export type Verdict = "PASS" | "FAIL";
export type G5Verdict = Verdict | "INDETERMINATE";

/** The properties a finite trace can protect, which the replay checks on the kernel; liveness is not one. */
export const TRACE_PROPERTIES = [
	"FreshAcceptance",
	"AcceptanceNeedsObligations",
	"HumanAcceptance",
	"HumanProvenance",
	"StopIsFinal",
] as const;
export type TraceProperty = (typeof TRACE_PROPERTIES)[number];

export interface Observation {
	phase: "qualification" | "implementation" | "verifying" | "deciding" | "closed" | "other";
	status: "ready" | "paused" | "decision_required" | "blocked" | "other";
	outcome: "pending" | "accepted";
	attempt: number;
	evidence: string[];
}

/**
 * What an action needs beyond its name: the control launched or delivered, the candidate identity frozen or
 * a result was produced on, the protocol revision a result really ran under, its verdict, a human option.
 */
export interface StepArgs {
	control?: Control;
	cand?: number;
	ran?: number;
	verdict?: Verdict;
	option?: "accept" | "reject";
}

export interface TraceStep {
	/** TLC's numbering: step 1 is the initial state, the first action is step 2. */
	step: number;
	action: ActionName;
	args: StepArgs;
	/** What the model observes after the step; null once an adverse step has run, the kernel then diverging. */
	expect: (Observation & { g5?: G5Verdict }) | null;
}

export interface FormalTrace {
	format: typeof TRACE_FORMAT;
	name: string;
	kind: "valid" | "adverse";
	property: TraceProperty;
	source: string;
	human_acceptance: boolean;
	steps: TraceStep[];
}

interface ActionMapping {
	commands: readonly ChangeCommand["type"][];
	/** A faulty transition of a mutant: the adversary's attempt, which the kernel must refuse or neutralise. */
	adverse: boolean;
}

/**
 * Every abstract action and the kernel commands it issues, in order. The adopted actions are those of
 * manifest.json; the adverse ones are the faulty transitions of the mutants under mutants/.
 */
export const ACTION_MAPPING = {
	Launch: { commands: ["verification.start"], adverse: false },
	Deliver: { commands: ["verification.record"], adverse: false },
	Complete: { commands: ["verification.complete"], adverse: false },
	EvaluateG5: { commands: ["gate.evaluate", "decision.request"], adverse: false },
	HumanAnswer: { commands: ["decision.answer"], adverse: false },
	Correct: { commands: ["correction.authorize"], adverse: false },
	ExhaustOnCorrection: { commands: ["correction.authorize"], adverse: false },
	StartAttempt: { commands: ["intervention.start", "intervention.finish"], adverse: false },
	ExhaustOnStart: { commands: ["intervention.start"], adverse: false },
	Freeze: { commands: ["candidate.freeze"], adverse: false },
	ReviseProtocol: { commands: ["artifact.revise"], adverse: false },
	Requalify: { commands: ["gate.evaluate"], adverse: false },
	Pause: { commands: ["change.pause"], adverse: false },
	Resume: { commands: ["change.resume"], adverse: false },
	// The kernel has no command that restamps a result in flight: a resume is all the adversary can issue,
	// and the late results keep the revision they ran under.
	ResumeAdoptingRuns: { commands: ["change.resume"], adverse: true },
	// The resume, then the kernel's own answer to the pending acceptance.
	ResumeRecordingAcceptance: { commands: ["change.resume", "decision.answer"], adverse: true },
	// The correction the exhausted budget stops, then G5 asked to close the change all the same.
	AcceptWhenExhausted: { commands: ["correction.authorize", "gate.evaluate"], adverse: true },
} as const satisfies Record<string, ActionMapping>;
export type ActionName = keyof typeof ACTION_MAPPING;

function isAction(name: unknown): name is ActionName {
	return typeof name === "string" && Object.hasOwn(ACTION_MAPPING, name);
}

function untranslatable(trace: string, step: unknown, action: unknown): Error {
	return new Error(
		`trace ${trace} step ${String(step)}: action ${String(action)} has no translation to kernel commands; ` +
			`the mapping knows ${Object.keys(ACTION_MAPPING).join(", ")}`,
	);
}

/** Validates a trace of the current format, refusing it whole on the first fault found. */
export function loadTrace(raw: unknown): FormalTrace {
	const t = raw as Partial<Record<keyof FormalTrace, unknown>>;
	const name = typeof t.name === "string" ? t.name : "(unnamed)";
	if (t.format !== TRACE_FORMAT)
		throw new Error(`trace ${name} has format ${String(t.format)}; this replay reads format ${TRACE_FORMAT}`);
	if (typeof t.property !== "string" || !(TRACE_PROPERTIES as readonly string[]).includes(t.property))
		throw new Error(
			`trace ${name} names property ${String(t.property)}; a trace protects one of ${TRACE_PROPERTIES.join(", ")}`,
		);
	if (t.kind !== "valid" && t.kind !== "adverse") throw new Error(`trace ${name} has kind ${String(t.kind)}`);
	if (!Array.isArray(t.steps) || t.steps.length === 0) throw new Error(`trace ${name} has no step`);
	for (const [i, s] of (t.steps as { step?: unknown; action?: unknown }[]).entries()) {
		if (s.step !== i + 2) throw new Error(`trace ${name} numbers its step ${i + 2} as ${String(s.step)}`);
		if (!isAction(s.action)) throw untranslatable(name, s.step, s.action);
		if (t.kind === "valid" && ACTION_MAPPING[s.action].adverse)
			throw new Error(`trace ${name} is valid but its step ${s.step} runs ${s.action}, an adverse action`);
	}
	if (t.kind === "adverse" && !(t.steps as TraceStep[]).some((s) => ACTION_MAPPING[s.action].adverse))
		throw new Error(`trace ${name} is adverse but runs no adverse action`);
	return raw as FormalTrace;
}

// --- reading a counterexample archived by TLC ------------------------------------------------------------

type TlcState = Record<string, string>;
type TlcRecord = Record<string, string>;

/** The variables of one TLC state, `/\ name = value`, each value as TLC printed it. */
function parseTlcState(text: string): TlcState {
	const vars: TlcState = {};
	for (const part of `\n${text}`.split("\n/\\ ").slice(1)) {
		const eq = part.indexOf(" = ");
		vars[part.slice(0, eq).trim()] = part.slice(eq + 3).trim();
	}
	return vars;
}

/** The records of a TLC set of records, `{[a |-> 1, b |-> k1], ...}`, field values unquoted. */
function parseRecords(value: string | undefined): TlcRecord[] {
	return [...(value ?? "").matchAll(/\[([^\]]*)\]/g)].map((m) =>
		Object.fromEntries(
			(m[1] ?? "").split(",").map((field) => {
				const [k, v] = field.split("|->").map((x) => x.trim().replace(/^"|"$/g, ""));
				return [k ?? "", v ?? ""];
			}),
		),
	);
}

const unquote = (v: string | undefined): string => (v ?? "").replace(/^"|"$/g, "");
const sameRecord = (a: TlcRecord, b: TlcRecord): boolean =>
	Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
const added = (before: TlcRecord[], after: TlcRecord[]): TlcRecord[] =>
	after.filter((r) => !before.some((b) => sameRecord(b, r)));

function observeTlcState(s: TlcState): Observation & { g5?: G5Verdict } {
	const cand = s.cand;
	const rev = s.rev;
	const evidence = parseRecords(s.evidence)
		.filter((e) => e.valid === "TRUE" && e.cand === cand && e.rev === rev)
		.map((e) => `${e.control}:${e.verdict}`)
		.sort();
	return {
		phase: unquote(s.phase) as Observation["phase"],
		status: unquote(s.status) as Observation["status"],
		outcome: unquote(s.outcome) === "accepted" ? "accepted" : "pending",
		attempt: Number(s.attempt),
		evidence,
	};
}

function argsOf(action: ActionName, before: TlcState, after: TlcState): StepArgs {
	switch (action) {
		case "Launch": {
			const [run] = added(parseRecords(before.runs), parseRecords(after.runs));
			return { control: run?.control as Control };
		}
		case "Deliver": {
			const [run] = added(parseRecords(after.runs), parseRecords(before.runs));
			const [recorded] = added(parseRecords(before.evidence), parseRecords(after.evidence));
			const verdict = (recorded?.verdict ?? "PASS") as Verdict;
			return { control: run?.control as Control, cand: Number(run?.cand), ran: Number(run?.ran), verdict };
		}
		case "Freeze":
			return { cand: Number(after.cand) };
		case "HumanAnswer":
		case "ResumeRecordingAcceptance": {
			const [decision] = added(parseRecords(before.decisions), parseRecords(after.decisions));
			return { option: (decision?.option ?? "accept") as "accept" | "reject" };
		}
		default:
			return {};
	}
}

/**
 * Reads a counterexample archived under counterexamples/ into a trace: each TLC step becomes an action with
 * the arguments its state change carries and, up to the first adverse action, what the model observes.
 */
export function fromCounterexample(raw: unknown, source: string): FormalTrace {
	const tlc = raw as { property?: unknown; trace?: { step: number; action: string; state: string }[] };
	const [initial, ...rest] = tlc.trace ?? [];
	if (!initial) throw new Error(`counterexample ${source} has no trace`);
	let before = parseTlcState(initial.state);
	let diverged = false;
	const steps: TraceStep[] = [];
	for (const s of rest) {
		const step = s.step;
		if (!isAction(s.action)) throw untranslatable(source, step, s.action);
		const after = parseTlcState(s.state);
		diverged ||= ACTION_MAPPING[s.action].adverse;
		const observed = observeTlcState(after);
		const expect = s.action === "EvaluateG5" ? { ...observed, g5: unquote(after.g5) as G5Verdict } : observed;
		steps.push({ step, action: s.action, args: argsOf(s.action, before, after), expect: diverged ? null : expect });
		before = after;
	}
	return loadTrace({
		format: TRACE_FORMAT,
		name: source.replace(/\.json$/, ""),
		kind: steps.some((s) => ACTION_MAPPING[s.action].adverse) ? "adverse" : "valid",
		property: tlc.property,
		source,
		human_acceptance: parseTlcState(initial.state).humanPolicy === "TRUE",
		steps,
	});
}

// --- observing the kernel ----------------------------------------------------------------------------------

const MODEL_PHASES: readonly string[] = ["qualification", "implementation", "verifying", "deciding", "closed"];
const MODEL_STATUSES: readonly string[] = ["ready", "paused", "decision_required", "blocked"];
const CONTROL_OF: Record<string, Control> = { unit: "k1", lint: "k2" };

/** What the model observes, read off the kernel's public state. */
export function observeKernel(state: ChangeState): Observation {
	const status = state.status === "running" || state.status === "completed" ? "ready" : state.status;
	const digest = state.candidate?.manifest_digest;
	const revision = state.protocol?.ref.revision;
	const evidence = state.evidence
		.filter((e) => e.valid && e.subject_digest === digest && e.protocol_revision === revision)
		.map((e) => `${CONTROL_OF[e.control_id] ?? e.control_id}:${e.verdict}`)
		.sort();
	return {
		phase: (MODEL_PHASES.includes(state.phase) ? state.phase : "other") as Observation["phase"],
		status: (MODEL_STATUSES.includes(status) ? status : "other") as Observation["status"],
		outcome: state.outcome === "accepted" ? "accepted" : "pending",
		attempt: state.budgets.attempts_used,
		evidence,
	};
}
