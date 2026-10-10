/**
 * The reader of what TLC prints in its `-tool` mode (CMP-VER), qualified on TLC 2.19 of 08 August 2024
 * (rev 5a47802). The verdict is read from TLC's own messages, each framed by `@!@!@STARTMSG code:class`
 * and `@!@!@ENDMSG code`, whose codes are the constants of `tlc2.output.EC` and whose classes are those of
 * `tlc2.output.MP`; an exit code of 0 says nothing of what was explored. Only an exhaustive search that
 * ended with every property of its configuration activated is `completed`, and its PASS holds for the
 * finite model under its bounds, never for the program the model describes.
 */
import { posix } from "node:path";
import { digestBytes } from "../../contracts/digest.ts";
import type { FormalPackage } from "../../contracts/v1/protocol.ts";
import { messageOf } from "../../domain/errors.ts";
import type { ParsedReport, ProcessObservation, ReaderRun, ReportReader } from "../../ports/execution.ts";
import { incidentOf } from "../execution/parsers.ts";

export type TlcOutcome = "completed" | "counterexample" | "inconclusive" | "error";

interface TlcProperty {
	name: string;
	kind: "invariant" | "temporal";
	/** True only when the exploration that checked it is completed. */
	verified: boolean;
}

interface TlcState {
	step: number;
	/** The action TLC names for the step, `Initial predicate` for the first. */
	action: string;
	state: string;
}

export interface TlcResult {
	outcome: TlcOutcome;
	/** What a PASS covers: the finite model under its bounds, not the program it describes. */
	scope: "model";
	/** Whether TLC ran the breadth-first search of the whole state space, the only mode that can complete. */
	exhaustive: boolean;
	properties: TlcProperty[];
	/** The constants of the configuration, as written there. */
	bounds: Record<string, string>;
	/** What else limits the claim: a state constraint, a symmetry, a deadlock left unchecked. */
	assumptions: string[];
	tool: { name: "TLC"; version: string | null };
	/** The modules TLC processed, standard ones included, in the order it processed them. */
	modules: string[];
	states: { generated: number; distinct: number } | null;
	depth: number | null;
	counterexample: { property: string; trace: TlcState[] } | null;
	/** Why the outcome is not `completed`; empty when it is. */
	reasons: string[];
	duration_ms: number;
}

interface TlcMessage {
	code: number;
	/** The class of `tlc2.output.MP`: 0 none, 1 error, 2 TLC bug, 3 warning, 4 state. */
	severity: number;
	text: string;
}

const VERSION = 2262;
const MODE_EXHAUSTIVE = 2187;
const MODE_SIMULATION = 2188;
const MODE_DEPTH_FIRST = 2271;
const SUCCESS = 2193;
const FINISHED = 2186;
const STATS = 2199;
const SEARCH_DEPTH = 2194;
const TEMPORAL_CHECK_END = 2267;
const STATE_PRINTS = new Set([2216, 2217, 2218]);
const DEADLOCK_REACHED = 2114;
/** Invariant at the initial state, in a behaviour, at a level; action property; deadlock; temporal property. */
const VIOLATIONS = new Set([2107, 2110, 2146, 2112, DEADLOCK_REACHED, 2116]);
/** The error-class messages that frame a counterexample rather than report a failure of the run. */
const TRACE_FRAMES = new Set([2121, 2122, 2264]);
const ERROR_CLASSES = new Set([1, 2]);

const START = /^@!@!@STARTMSG (\d+):(\d+) @!@!@$/;
const END = /^@!@!@ENDMSG \d+ @!@!@$/;

/** TLC's messages, and the lines printed outside of any message, such as the parser's. */
function messagesOf(stdout: string): { messages: TlcMessage[]; loose: string[] } {
	const messages: TlcMessage[] = [];
	const loose: string[] = [];
	let open: { code: number; severity: number; lines: string[] } | null = null;
	for (const line of stdout.split(/\r?\n/)) {
		const start = START.exec(line);
		if (start) {
			open = { code: Number(start[1]), severity: Number(start[2]), lines: [] };
		} else if (END.test(line) && open) {
			messages.push({ code: open.code, severity: open.severity, text: open.lines.join("\n").trim() });
			open = null;
		} else if (open) {
			open.lines.push(line);
		} else {
			loose.push(line);
		}
	}
	return { messages, loose };
}

const CONFIG_KEYWORDS =
	/\b(CONSTANTS?|INIT|NEXT|SPECIFICATION|INVARIANTS?|PROPERTY|PROPERTIES|CHECK_DEADLOCK|SYMMETRY|VIEW|CONSTRAINTS?|ACTION_CONSTRAINTS?|ALIAS|POSTCONDITION)\b/;

/** The sections of a TLC configuration, by keyword, comments removed. */
function sectionsOf(config: string): { keyword: string; body: string }[] {
	const text = config.replace(/\(\*[\s\S]*?\*\)/g, " ").replace(/\\\*.*$/gm, " ");
	const parts = text.split(CONFIG_KEYWORDS);
	const sections: { keyword: string; body: string }[] = [];
	for (let i = 1; i < parts.length; i += 2)
		sections.push({ keyword: parts[i] ?? "", body: (parts[i + 1] ?? "").trim() });
	return sections;
}

function namesIn(body: string): string[] {
	return body.split(/[\s,]+/).filter((name) => name !== "");
}

interface TlcConfiguration {
	properties: Omit<TlcProperty, "verified">[];
	bounds: Record<string, string>;
	assumptions: string[];
}

const DEADLOCK_UNCHECKED = "deadlock is not checked";

/** The properties a section of the configuration activates. */
function propertiesIn(keyword: string, body: string): Omit<TlcProperty, "verified">[] {
	if (keyword.startsWith("INVARIANT")) return namesIn(body).map((name) => ({ name, kind: "invariant" }));
	if (keyword.startsWith("PROPERT")) return namesIn(body).map((name) => ({ name, kind: "temporal" }));
	return [];
}

/** What a section of the configuration adds to the limits of the claim, besides its constants. */
function assumptionsIn(keyword: string, body: string): string[] {
	if (keyword.startsWith("CONSTRAINT") || keyword.startsWith("ACTION_CONSTRAINT"))
		return namesIn(body).map((name) => `the state constraint ${name} bounds the exploration`);
	if (keyword === "SYMMETRY") return [`the exploration is reduced by the symmetry ${body}`];
	if (keyword === "VIEW") return [`states are told apart by the view ${body} only`];
	if (keyword === "CHECK_DEADLOCK" && body === "FALSE") return [DEADLOCK_UNCHECKED];
	return [];
}

function configurationOf(config: string, command: readonly string[]): TlcConfiguration {
	const sections = sectionsOf(config);
	const assumptions = sections.flatMap(({ keyword, body }) => assumptionsIn(keyword, body));
	if (command.includes("-deadlock") && !assumptions.includes(DEADLOCK_UNCHECKED)) assumptions.push(DEADLOCK_UNCHECKED);
	return {
		properties: sections.flatMap(({ keyword, body }) => propertiesIn(keyword, body)),
		bounds: Object.fromEntries(
			sections
				.filter(({ keyword }) => keyword.startsWith("CONSTANT"))
				.flatMap(({ body }) => Object.entries(constantsIn(body))),
		),
		assumptions,
	};
}

/** `Max = 3 Procs <- ProcSet` as `{ Max: "3", Procs: "<- ProcSet" }`. */
function constantsIn(body: string): Record<string, string> {
	const bounds: Record<string, string> = {};
	const assignments = [...body.matchAll(/([A-Za-z_]\w*)\s*(=|<-)\s*/g)];
	assignments.forEach((assignment, i) => {
		const end = assignments[i + 1]?.index ?? body.length;
		const value = body.slice((assignment.index ?? 0) + assignment[0].length, end).trim();
		bounds[assignment[1] ?? ""] = assignment[2] === "<-" ? `<- ${value}` : value;
	});
	return bounds;
}

function countOf(text: string): number {
	return Number(text.replace(/\D/g, ""));
}

function statesOf(messages: readonly TlcMessage[]): TlcResult["states"] {
	const stats = messages.find((m) => m.code === STATS);
	const counts = stats && /^([\d\s,. ]+) states generated, ([\d\s,. ]+) distinct states found/.exec(stats.text);
	return counts ? { generated: countOf(counts[1] ?? ""), distinct: countOf(counts[2] ?? "") } : null;
}

function depthOf(messages: readonly TlcMessage[]): number | null {
	const depth = messages.find((m) => m.code === SEARCH_DEPTH);
	const found = depth && /is (\d+)\./.exec(depth.text);
	return found ? Number(found[1]) : null;
}

function violatedProperty(violation: TlcMessage): string {
	const named = /(?:Invariant|Action property) (\S+) is violated/.exec(violation.text);
	if (named) return named[1] ?? "";
	return violation.code === DEADLOCK_REACHED ? "deadlock" : "temporal properties";
}

/** The states printed after the violation, each `n: <action>` followed by the values of the variables. */
function traceAfter(messages: readonly TlcMessage[], violation: TlcMessage): TlcState[] {
	return messages
		.slice(messages.indexOf(violation) + 1)
		.filter((m) => STATE_PRINTS.has(m.code))
		.map((m) => {
			const [head = "", ...values] = m.text.split("\n");
			const step = /^(\d+): <(.*)>$/.exec(head.trim());
			return { step: Number(step?.[1] ?? 0), action: step?.[2] ?? head.trim(), state: values.join("\n").trim() };
		});
}

/** Why the run is not `completed`, or null when it is, with the outcome that reason leads to. */
function shortfallOf(
	observation: ProcessObservation,
	messages: readonly TlcMessage[],
	configuration: TlcConfiguration,
): { outcome: Exclude<TlcOutcome, "counterexample">; reason: string } | null {
	const has = (code: number): boolean => messages.some((m) => m.code === code);
	const failure = messages.find(
		(m) => ERROR_CLASSES.has(m.severity) && !VIOLATIONS.has(m.code) && !TRACE_FRAMES.has(m.code),
	);
	if (failure) return { outcome: "error", reason: `TLC reported error ${failure.code}: ${failure.text}` };
	if (observation.exit_code !== 0)
		return { outcome: "error", reason: `TLC exited ${observation.exit_code} without naming a violation` };
	if (has(MODE_SIMULATION))
		return { outcome: "inconclusive", reason: "a random simulation explores some behaviours, not all" };
	if (has(MODE_DEPTH_FIRST))
		return {
			outcome: "inconclusive",
			reason: "a depth-first search stops at its depth, not at the end of the state space",
		};
	if (!has(MODE_EXHAUSTIVE))
		return { outcome: "inconclusive", reason: "the output names no breadth-first model checking" };
	if (!has(SUCCESS)) return { outcome: "inconclusive", reason: "TLC did not say that model checking completed" };
	if (configuration.properties.length === 0)
		return {
			outcome: "error",
			reason: "the configuration activates no INVARIANT nor PROPERTY: the exploration proves nothing",
		};
	if (configuration.properties.some((p) => p.kind === "temporal") && !has(TEMPORAL_CHECK_END))
		return { outcome: "inconclusive", reason: "a temporal property was asked and its check never finished" };
	return null;
}

/**
 * What the run lacked to start TLC at all, said so the developer knows what to provide: the Java runtime the
 * command names, or TLC on its class path. Java prints the second in the language of the machine; the name of
 * the exception it ends with is the part that is not translated.
 */
function missingCapability(observation: ProcessObservation, stderr: string, command: readonly string[]): string | null {
	if (observation.spawn_error?.includes("ENOENT"))
		return `no Java runtime at ${command[0] ?? ""} (${observation.spawn_error}): install one, or name the java to run`;
	if (!stderr.includes("java.lang.ClassNotFoundException: tlc2.TLC")) return null;
	const option = command.findIndex((arg) => arg === "-cp" || arg === "-classpath" || arg === "--class-path");
	const classPath = option >= 0 ? (command[option + 1] ?? "") : "(none)";
	return `the class path ${classPath} holds no tlc2.TLC: name the tla2tools.jar of TLC 2.19`;
}

/** The result of one TLC run, from its observation, its output and the configuration it was given. */
function tlcResultOf(
	observation: ProcessObservation,
	{ stdout, stderr }: { stdout: string; stderr: string },
	config: string,
	command: readonly string[],
): TlcResult {
	const { messages, loose } = messagesOf(stdout);
	const configuration = configurationOf(config, command);
	const version = messages.find((m) => m.code === VERSION)?.text.replace(/^TLC2 Version /, "") ?? null;
	const result = (
		outcome: TlcOutcome,
		reasons: string[],
		counterexample: TlcResult["counterexample"] = null,
	): TlcResult => ({
		outcome,
		scope: "model",
		exhaustive: messages.some((m) => m.code === MODE_EXHAUSTIVE),
		properties: configuration.properties.map((p) => ({ ...p, verified: outcome === "completed" })),
		bounds: configuration.bounds,
		assumptions: configuration.assumptions,
		tool: { name: "TLC", version },
		modules: loose.flatMap((line) => /^Semantic processing of module (\S+)/.exec(line)?.[1] ?? []),
		states: statesOf(messages),
		depth: depthOf(messages),
		counterexample,
		reasons,
		duration_ms: observation.duration_ms,
	});
	const missing = missingCapability(observation, stderr, command);
	if (missing !== null) return result("error", [`capability missing: ${missing}`]);
	if (observation.spawn_error !== null) return result("error", [`TLC could not start: ${observation.spawn_error}`]);
	const incident = incidentOf(observation);
	if (incident !== null) return result("inconclusive", [`the run was interrupted: ${incident}`]);
	if (observation.stdout_truncated) return result("inconclusive", ["the output was cut at its bound"]);
	if (version === null)
		return result("error", ["the output holds no TLC message: it is not read as TLC's -tool output"]);
	if (!messages.some((m) => m.code === FINISHED))
		return result("inconclusive", ["the output ends before TLC said it finished"]);
	const violation = messages.find((m) => VIOLATIONS.has(m.code));
	if (violation) {
		const trace = traceAfter(messages, violation);
		const property = violatedProperty(violation);
		return trace.length > 0
			? result("counterexample", [`${property} is violated`], { property, trace })
			: result("inconclusive", [`${property} is violated, and TLC printed no state leading to it`]);
	}
	const shortfall = shortfallOf(observation, messages, configuration);
	return shortfall ? result(shortfall.outcome, [shortfall.reason]) : result("completed", []);
}

const VERDICT_OF: Record<TlcOutcome, ParsedReport["verdict"]> = {
	completed: "PASS",
	counterexample: "FAIL",
	inconclusive: "INDETERMINATE",
	error: "INDETERMINATE",
};

/** The configuration a TLC command names by `-config`, or the one TLC reads beside the specification. */
function configPathOf(command: readonly string[], cwd: string): string {
	const option = command.indexOf("-config");
	const named = option >= 0 ? command[option + 1] : undefined;
	const spec = command.at(-1) ?? "";
	return posix.join(cwd, named ?? `${spec.replace(/\.tla$/, "")}.cfg`);
}

/**
 * Why a completed exploration is not the PASS of the adopted package, one sentence each: a file of the copy that is
 * not the one the package pins, another TLC than the approved one, a required property the run did not check. A
 * producer who edits the model or reduces its configuration gets no proof; a counterexample stays a failure whatever
 * model it was found on.
 */
async function unapprovedExploration(run: ReaderRun, pkg: FormalPackage, tlc: TlcResult): Promise<string[]> {
	const read = await run.sources(Object.keys(pkg.files));
	const reasons = Object.entries(pkg.files).flatMap(([file, approved]) => {
		const text = read.get(file);
		if (text === undefined) return [`${file} is absent, the package approves ${approved}`];
		const actual = digestBytes(text);
		return actual === approved ? [] : [`${file} is ${actual}, the package approves ${approved}`];
	});
	if (tlc.tool.version !== pkg.tool.version)
		reasons.push(`TLC ${tlc.tool.version ?? "of no known version"} ran, the package approves TLC ${pkg.tool.version}`);
	const unchecked = pkg.required_properties.filter(
		(name) => !tlc.properties.some((p) => p.name === name && p.verified),
	);
	if (unchecked.length > 0) reasons.push(`the exploration did not check the required ${unchecked.join(", ")}`);
	return reasons.map((reason) => `not the exploration of the adopted package: ${reason}`);
}

async function readTlc(run: ReaderRun): Promise<ParsedReport> {
	const path = configPathOf(run.control.command, run.control.cwd);
	let config: string;
	try {
		config = await run.text(path);
	} catch (error) {
		return {
			verdict: "INDETERMINATE",
			facts: { exit_code: run.observation.exit_code },
			notes: [`the TLC configuration ${path} cannot be read: ${messageOf(error)}`],
			failures: [],
		};
	}
	const tlc = tlcResultOf(run.observation, run, config, run.control.command);
	const verdict = VERDICT_OF[tlc.outcome];
	const pkg = run.control.formal_package;
	const unapproved = pkg && verdict === "PASS" ? await unapprovedExploration(run, pkg, tlc) : [];
	return {
		verdict: unapproved.length > 0 ? "INDETERMINATE" : verdict,
		facts: { exit_code: run.observation.exit_code, tlc },
		notes: [...tlc.reasons, ...unapproved],
		failures: tlc.counterexample
			? [`${tlc.counterexample.property} is violated after ${tlc.counterexample.trace.length} states`]
			: [],
	};
}

export const TLC_READER: ReportReader = {
	id: "tlc",
	version: "1.0.0",
	nature: null,
	differential: false,
	located: false,
	read: readTlc,
};
