/**
 * What the readers of every technology share — the incident of a process, the build errors of its output,
 * the bounded parsing of a report, the judgement of the introduced lines a coverage report measures — and
 * the readers of two formats several technologies write: an exit code and JUnit XML.
 */
import { parseXml, XmlElement, type XmlDocument, type XmlNode } from "@rgrove/parse-xml";
import type { ObservedCase } from "../../contracts/v1/protocol.ts";
import { messageOf } from "../../domain/errors.ts";
import type {
	IntroducedLines,
	ParsedFinding,
	ParsedReport,
	ProcessObservation,
	ReaderRun,
	ReportDocument,
	ReportReader,
} from "../../ports/execution.ts";

export const MAX_FAILURES = 50;

/** How many findings one report gives; past it, the rest is counted and named in a note. */
const MAX_QUALITY_FINDINGS = 1000;

/**
 * What the findings of a quality analyser come to: FAIL on any of them, bounded and counted past the
 * bound, PASS on none. A finding `introduced` names is kept past the bound: what the run itself wrote
 * is judged on the whole report, however many findings the tree already carries before it.
 */
export function judgedQualityFindings(
	facts: Record<string, unknown>,
	findings: readonly ParsedFinding[],
	introduced: (finding: ParsedFinding) => boolean = () => false,
): ParsedReport {
	return {
		verdict: findings.length > 0 ? "FAIL" : "PASS",
		facts: { ...facts, findings: findings.length },
		notes:
			findings.length > MAX_QUALITY_FINDINGS
				? [`${findings.length} findings reduced to the first ${MAX_QUALITY_FINDINGS}`]
				: [],
		failures: [],
		findings: [...findings.slice(0, MAX_QUALITY_FINDINGS), ...findings.slice(MAX_QUALITY_FINDINGS).filter(introduced)],
	};
}

/** Verdict from the incident dimension only: timeout, spawn error, signal. */
export function incidentOf(obs: ProcessObservation): string | null {
	if (obs.spawn_error) return `spawn error: ${obs.spawn_error}`;
	if (obs.timed_out) return `timeout after ${obs.duration_ms} ms`;
	if (obs.exit_code === null) return `terminated by signal ${obs.signal ?? "unknown"}`;
	return null;
}

/** The INDETERMINATE report of a process `incidentOf` named: its exit code, the incident, and nothing read. */
export function incidentReport(
	obs: ProcessObservation,
	incident: string,
	extraFacts: Record<string, unknown> = {},
	extraNotes: readonly string[] = [],
): ParsedReport {
	return {
		verdict: "INDETERMINATE",
		facts: { exit_code: obs.exit_code, incident, ...extraFacts },
		notes: [incident, ...extraNotes],
		failures: [],
	};
}

const BUILD_ERROR_LINE = /^\s*(?:\[ERROR\]|\[FATAL\]|error:|ERROR:)\s*(.+)$/;

/**
 * Lines naming a build failure, used as findings when the runner exited non-zero without a test
 * failure to point at (compilation error, plugin failure, a module the reactor never reached).
 */
export function buildErrors(output: string, max = 10): string[] {
	const out: string[] = [];
	for (const raw of output.split(/\r?\n/)) {
		const m = BUILD_ERROR_LINE.exec(raw);
		if (!m) continue;
		const message = m[1]!.trim();
		if (!message || out.includes(message)) continue;
		out.push(message);
		if (out.length >= max) break;
	}
	return out;
}

/**
 * The FAIL of a runner that exited non-zero with no failing test to explain it. What it points at is
 * the failures already read, else the build errors of its output, else its exit code.
 */
export function exitedOutsideTests(
	obs: ProcessObservation,
	facts: Record<string, unknown>,
	note: string,
	output = "",
	failures: string[] = [],
): ParsedReport {
	const errors = failures.length > 0 ? failures : buildErrors(output);
	return {
		verdict: "FAIL",
		facts,
		notes: [note],
		failures: errors.length > 0 ? errors : [`exit code ${obs.exit_code}`],
	};
}

/** Contract: exit code 0 means PASS, any other exit code means FAIL, an incident means INDETERMINATE (RM-016). */
export function parseExitCode(obs: ProcessObservation): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return incidentReport(obs, incident);
	return {
		verdict: obs.exit_code === 0 ? "PASS" : "FAIL",
		facts: { exit_code: obs.exit_code },
		notes: [],
		failures: obs.exit_code === 0 ? [] : [`exit code ${obs.exit_code}`],
	};
}

export interface JUnitSummary {
	tests: number;
	failures: number;
	errors: number;
	skipped: number;
	failed_cases: string[];
	/** Every executed case with its outcome: a `failure` whose error is an assertion, else a failure otherwise. */
	cases: ObservedCase[];
	files: number;
}

/** Every `<testcase>` of a document, in document order, however deep the suites that hold it nest. */
function testCasesOf(document: XmlDocument): XmlElement[] {
	const found: XmlElement[] = [];
	const pending: XmlNode[] = [...document.children].reverse();
	for (let node = pending.pop(); node; node = pending.pop()) {
		if (!(node instanceof XmlElement)) continue;
		if (node.name === "testcase") found.push(node);
		for (let i = node.children.length - 1; i >= 0; i -= 1) pending.push(node.children[i]!);
	}
	return found;
}

/**
 * An error class an assertion library throws: `AssertionError`, `AssertionFailedError`, JUnit 4's
 * `ComparisonFailure`, opentest4j's `MultipleFailuresError`. A class this misses is read as a failure
 * otherwise, which proves less, never more.
 */
const ASSERTION_CLASS = /(?:^|[.$])\w*(?:Assert\w*|ComparisonFailure|MultipleFailuresError)$/;

/**
 * Whether a `<failure>` reports an assertion. Surefire keeps `<failure>` for one, but vitest and mocha
 * write every failing case there, a throw before the assertion and a file that does not load included,
 * so the error class decides: its `type`, else, as mocha's xunit reporter writes no type, the name
 * opening the stack it appends to the message.
 */
function failedOnAssertion(failure: XmlElement): boolean {
	const declared = failure.attributes.type;
	if (declared !== undefined) return ASSERTION_CLASS.test(declared);
	const body = failure.text;
	const message = (body.split("\n", 1)[0] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const opening = new RegExp(`^([\\w$.]+)(?: \\[\\w+\\])?: ${message}$`, "m").exec(body);
	return opening !== null && ASSERTION_CLASS.test(opening[1]!);
}

/** A report is the output of the process the judged project ran: it is bounded before it is analysed. */
export const MAX_REPORT_BYTES = 16 * 1024 * 1024;

export function parseReport(document: string): XmlDocument {
	if (Buffer.byteLength(document, "utf8") > MAX_REPORT_BYTES)
		throw new Error(`the report exceeds ${MAX_REPORT_BYTES} bytes`);
	return parseXml(document);
}

/** A report left unread because it passed the read bound: its workspace-relative path and its size in bytes. */
export interface UnreadReport {
	path: string;
	bytes: number;
}

/**
 * JUnit/Surefire reader: every `<testcase>` is one test, failed on a `failure` or `error` child and
 * skipped on a `skipped` child; it failed on an assertion only when its `failure` names one. The counts
 * of the enclosing `<testsuite>` elements are not read: a nested suite repeats the tests of its parent,
 * and an emitter may omit or fill an attribute as it likes.
 * Throws when a document is over the bound, was left unread, or is not XML the parser reads, deep
 * nesting included.
 */
export function summarizeJUnit(documents: readonly (string | UnreadReport)[]): JUnitSummary {
	const s: JUnitSummary = {
		tests: 0,
		failures: 0,
		errors: 0,
		skipped: 0,
		failed_cases: [],
		cases: [],
		files: documents.length,
	};
	for (const doc of documents) {
		if (typeof doc !== "string")
			throw new Error(
				`${doc.bytes} bytes, past the read bound of ${MAX_REPORT_BYTES}, at ${doc.path}: it was not read`,
			);
		for (const testcase of testCasesOf(parseReport(doc))) {
			s.tests += 1;
			const children = testcase.children.filter((child) => child instanceof XmlElement);
			const outcomes = children.map((child) => child.name);
			const failure = children.find((child) => child.name === "failure");
			const name = testcase.attributes.name ?? "unnamed";
			const cls = testcase.attributes.classname;
			const qualified = cls ? `${cls}.${name}` : name;
			if (failure) {
				s.failures += 1;
				s.cases.push({
					name: qualified,
					outcome: failedOnAssertion(failure) ? "failed_assertion" : "failed_otherwise",
				});
			} else if (outcomes.includes("error")) {
				s.errors += 1;
				s.cases.push({ name: qualified, outcome: "failed_otherwise" });
			} else {
				if (outcomes.includes("skipped")) s.skipped += 1;
				else s.cases.push({ name: qualified, outcome: "passed" });
				continue;
			}
			if (s.failed_cases.length < MAX_FAILURES) s.failed_cases.push(qualified);
		}
	}
	return s;
}

/**
 * A non-zero exit that no test failure explains is a verdict on the candidate, not an incident: a
 * compilation error, a plugin failure or a module the reactor never reached are all reproducible
 * properties of the frozen tree. Only `incidentOf` — spawn error, timeout, signal — is INDETERMINATE,
 * because only those can give a different answer on an identical re-run.
 */
export function parseJUnit(
	obs: ProcessObservation,
	documents: readonly (string | UnreadReport)[] | null,
	output = "",
): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return incidentReport(obs, incident);
	const broke = obs.exit_code !== 0;
	const outside = (facts: Record<string, unknown>, note: string): ParsedReport =>
		exitedOutsideTests(obs, facts, note, output);
	if (!documents || documents.length === 0) {
		const facts = { exit_code: obs.exit_code, reports: 0 };
		if (broke) return outside(facts, `the runner exited with ${obs.exit_code} before producing any test report`);
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: ["no JUnit report found at the declared report path"],
			failures: [],
		};
	}
	let s: JUnitSummary;
	try {
		s = summarizeJUnit(documents);
	} catch (error) {
		// A document the parser refuses is a report that was not written: an unreadable one is never a success.
		const facts = { exit_code: obs.exit_code, reports: documents.length };
		const note = `a JUnit report is not readable: ${messageOf(error).split("\n")[0]?.slice(0, 200)}`;
		if (broke) return outside(facts, note);
		return { verdict: "INDETERMINATE", facts, notes: [note], failures: [] };
	}
	const facts = { exit_code: obs.exit_code, ...s };
	if (s.tests === 0) {
		if (broke) return outside(facts, `the runner exited with ${obs.exit_code} and the reports contain no test`);
		return { verdict: "INDETERMINATE", facts, notes: ["JUnit reports contain no test"], failures: [] };
	}
	if (s.failures + s.errors > 0) return { verdict: "FAIL", facts, notes: [], failures: s.failed_cases };
	if (s.skipped > 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`${s.skipped} skipped tests: a skip is not a pass (RM-017)`],
			failures: [],
		};
	if (broke)
		return outside(
			facts,
			`the reports are green but the runner exited with ${obs.exit_code}: the failure is outside the tests that ran`,
		);
	return { verdict: "PASS", facts, notes: [], failures: [] };
}

// --- differential coverage (QLT-04) --------------------------------------------------------------

export interface MeasuredLine {
	covered: boolean;
	branches_missed: number;
	branches_covered: number;
}

export interface CoverageMeasurement {
	/** Workspace-relative source path -> line number -> what the reports say about that line. */
	files: Map<string, Map<number, MeasuredLine>>;
	/** Workspace-relative source path -> ascending starts of the symbols declared in it. */
	symbols: Map<string, { line: number; symbol: string }[]>;
	notes: string[];
}

export const COVERAGE_RULE_UNCOVERED = "coverage:introduced-line-not-exercised";
export const COVERAGE_RULE_PARTIAL = "coverage:introduced-branch-not-taken";

export const MAX_NAMED_PATHS = 10;

/** The five XML entities, decoded: JaCoCo writes a constructor `&lt;init&gt;`. */
export function decodeXml(text: string): string {
	return text.replace(
		/&(lt|gt|quot|apos|amp);/g,
		(whole, entity: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[entity] ?? whole,
	);
}

/** The symbol a line belongs to: the last one declared at or before it. */
function symbolAt(symbols: readonly { line: number; symbol: string }[], line: number): string | null {
	let found: string | null = symbols[0]?.symbol ?? null;
	for (const entry of symbols) {
		if (entry.line > line) break;
		found = entry.symbol;
	}
	return found;
}

export const MAX_COVERAGE_FINDINGS = 200;

interface IntroducedJudgement {
	findings: ParsedFinding[];
	measured: number;
	uncovered: number;
	partial: number;
	/** Lines of the touched files that no test exercised and that this change did not write, per file. */
	tolerated: { path: string; line: number }[];
}

/**
 * The verdict rule shared by every coverage reader: an introduced line no test exercised blocks, one
 * exercised on part of its branches is reported without blocking, and a line the change did not write is
 * outside its jurisdiction (QLT-04). `wanted` are the files the measurement is known to hold.
 */
export function judgeIntroducedLines(
	measurement: CoverageMeasurement,
	wanted: readonly string[],
	introduced: IntroducedLines,
): IntroducedJudgement {
	const judgement: IntroducedJudgement = { findings: [], measured: 0, uncovered: 0, partial: 0, tolerated: [] };
	for (const path of wanted) {
		const lines = measurement.files.get(path)!;
		const symbols = measurement.symbols.get(path) ?? [];
		const introducedHere = new Set(introduced[path] ?? []);
		for (const nr of [...lines.keys()].sort((a, b) => a - b)) {
			const line = lines.get(nr)!;
			if (!introducedHere.has(nr)) {
				if (!line.covered) judgement.tolerated.push({ path, line: nr });
				continue;
			}
			judgement.measured++;
			const symbol = symbolAt(symbols, nr);
			const named = symbol ? ` in ${symbol}` : "";
			if (!line.covered) {
				judgement.uncovered++;
				if (judgement.findings.length < MAX_COVERAGE_FINDINGS)
					judgement.findings.push({
						rule_id: COVERAGE_RULE_UNCOVERED,
						category: "quality",
						severity: "blocker",
						message: `${path}:${nr} introduced line never exercised by the suite${named}`,
						symbol,
					});
			} else if (line.branches_missed > 0) {
				judgement.partial++;
				if (judgement.findings.length < MAX_COVERAGE_FINDINGS)
					judgement.findings.push({
						rule_id: COVERAGE_RULE_PARTIAL,
						category: "quality",
						severity: "major",
						message: `${path}:${nr} introduced line exercised on part of its branches only${named}`,
						symbol,
					});
			}
		}
	}
	return judgement;
}

/**
 * What stops a coverage reader before it opens a report: a process that did not end normally, or one
 * that exited non-zero. Both are INDETERMINATE: an absent measurement has never been proof of coverage.
 */
export function undecidedCoverage(obs: ProcessObservation, reports: number): ParsedReport | null {
	const incident = incidentOf(obs);
	if (incident) return incidentReport(obs, incident);
	if (obs.exit_code !== 0)
		return {
			verdict: "INDETERMINATE",
			facts: { exit_code: obs.exit_code, reports },
			notes: [`the coverage sensor exited with ${obs.exit_code} without reading a report`],
			failures: [],
		};
	return null;
}

/** A candidate whose introduced lines nobody established cannot be judged: its new lines are unknown. */
export function unknownIntroducedLines(obs: ProcessObservation, reports: number): ParsedReport {
	return {
		verdict: "INDETERMINATE",
		facts: { exit_code: obs.exit_code, reports },
		notes: [
			"no introduced-line set was given: a differential control cannot judge a candidate whose new lines are unknown",
		],
		failures: [],
	};
}

/** The note naming introduced source files no coverage report measures, bounded. */
export function unmeasuredNote(unmeasured: readonly string[]): string {
	return `no coverage report measures ${unmeasured.length} introduced source file(s): ${unmeasured.slice(0, MAX_NAMED_PATHS).join(", ")}`;
}

/**
 * The coverage report a differential control reads. A subject that introduces nothing — the reference
 * pass — is decided without looking for a report the control would not read, and keeps none as evidence.
 */
export async function coverageReports(run: ReaderRun, mediaType: string): Promise<ReportDocument[]> {
	const introduced = run.introduced_lines;
	if (introduced !== null && Object.keys(introduced).length === 0) return [];
	return run.reports(mediaType);
}

/** The exit code says nothing of what its command checks. */
export const EXIT_CODE_READER: ReportReader = {
	id: "exit-code",
	version: "1.0.0",
	nature: null,
	differential: false,
	located: false,
	read: async (run) => parseExitCode(run.observation),
};

export const JUNIT_READER: ReportReader = {
	id: "junit-xml",
	version: "1.0.0",
	nature: "behaviour",
	differential: false,
	located: false,
	async read(run) {
		const docs = await run.reports("application/xml", { oversized_unread: true });
		// Build tools name a compilation failure on stdout; the parser needs it to point at a file.
		return parseJUnit(
			run.observation,
			docs.map((d) => (d.oversized_bytes === undefined ? d.text : { path: d.name, bytes: d.oversized_bytes })),
			`${run.stdout}\n${run.stderr}`,
		);
	},
};
