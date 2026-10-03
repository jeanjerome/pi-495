import { parseXml, XmlElement, type XmlDocument, type XmlNode } from "@rgrove/parse-xml";
import type { Verdict } from "../../contracts/v1/common.ts";
import type { Finding } from "../../contracts/v1/evidence.ts";
import { messageOf } from "../../domain/errors.ts";
import type { IntroducedLines, ProcessObservation } from "../../ports/execution.ts";

/**
 * A defect a parser names itself, when `${control}:failure` would say the wrong thing about it. The
 * runner still derives the path, the line and the fingerprint from the message, exactly as it does
 * for a failing test.
 */
export interface ParsedFinding {
	rule_id: string;
	category: Finding["category"];
	severity: Finding["severity"];
	message: string;
	symbol: string | null;
}

export interface ParsedReport {
	verdict: Verdict;
	facts: Record<string, unknown>;
	notes: string[];
	/** Failing test names or messages, bounded. */
	failures: string[];
	/** Typed defects replacing `failures` when the parser knows their rule, category and severity. */
	findings?: ParsedFinding[];
}

export const PARSER_VERSIONS = {
	"exit-code": "1.0.0",
	"node-test": "1.0.0",
	"junit-xml": "1.0.0",
	"jest-json": "1.0.0",
	lcov: "1.0.0",
	"jacoco-xml": "1.0.0",
	"java-imports": "1.0.0",
	"pitest-xml": "1.0.0",
	"stryker-json": "1.0.0",
	"pmd-xml": "1.0.0",
	"cpd-xml": "1.0.0",
	"eslint-json": "1.0.0",
	"jscpd-json": "1.0.0",
} as const;

export const MAX_FAILURES = 50;

/** How many findings one report gives; past it, the rest is counted and named in a note. */
const MAX_QUALITY_FINDINGS = 1000;

/** What the findings of a quality analyser come to: FAIL on any of them, bounded and counted past the bound, PASS on none. */
export function judgedQualityFindings(
	facts: Record<string, unknown>,
	findings: readonly ParsedFinding[],
): ParsedReport {
	return {
		verdict: findings.length > 0 ? "FAIL" : "PASS",
		facts: { ...facts, findings: findings.length },
		notes:
			findings.length > MAX_QUALITY_FINDINGS
				? [`${findings.length} findings reduced to the first ${MAX_QUALITY_FINDINGS}`]
				: [],
		failures: [],
		findings: findings.slice(0, MAX_QUALITY_FINDINGS),
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

/**
 * TAP output of `node --test --test-reporter=tap`. Skipped or todo tests never count as PASS (§6.5).
 * A failing test is followed by the file its diagnostics locate it in, without line or column: a
 * finding whose test name carries no path then points at the file of the test, and one whose name
 * carries a path keeps pointing at that path. A passing test carries no location, so it is reported by
 * its name alone, in `passing_cases`; a suite is not a case. The message the failing test reports
 * closes the line: a test that keeps failing for another reason is then another finding, and one that
 * fails the same way on both passes is the same.
 *
 * node:test reports a test file that declares no case as one passing top-level test named after the
 * file. Such an entry runs code without asserting anything, so it is not counted as a test.
 */
export function parseNodeTestTap(obs: ProcessObservation, stdout: string): ParsedReport {
	const incident = incidentOf(obs);
	const lines = stdout.split(/\r?\n/);
	let tests: number | null = null;
	let pass: number | null = null;
	let fail: number | null = null;
	let skipped: number | null = null;
	let todo: number | null = null;
	const failures: string[] = [];
	// Whether the diagnostics being read belong to the failure last named, which they then locate and describe.
	let locating = false;
	let describing = false;
	// The name of the passing test whose diagnostics are being read, kept once they say it is a test.
	let passingName: string | null = null;
	const passingCases: string[] = [];
	// The lines of a block `error` field being read, and the indentation of its key.
	let message: { indent: number; lines: string[] } | null = null;
	const describeLastFailure = (text: string) => {
		failures[failures.length - 1] = `${failures.at(-1)}: ${text.replace(/\s+/g, " ").trim()}`;
	};
	let caseless = 0;
	for (const raw of lines) {
		if (message !== null) {
			if (raw.trim() === "" || raw.length - raw.trimStart().length > message.indent) {
				message.lines.push(raw);
				continue;
			}
			describeLastFailure(message.lines.join(" "));
			message = null;
		}
		const fileWithoutCases = /^ok\s+\d+\s*-\s*\S+\.[cm]?[jt]sx?\s*$/.test(raw);
		if (fileWithoutCases) caseless++;
		const line = raw.trim();
		if (passingName !== null && /^type:\s*'(test|suite)'$/.test(line)) {
			if (line.endsWith("'test'")) passingCases.push(passingName);
			passingName = null;
			continue;
		}
		const location = /^location:\s*'(.+?)(?::\d+){0,2}'$/.exec(line);
		if (location && locating && failures.length > 0) {
			failures[failures.length - 1] = `${failures.at(-1)} (${location[1]})`;
			locating = false;
			continue;
		}
		const error = /^(\s*)error:\s*(.*)$/.exec(raw);
		if (error && describing) {
			describing = false;
			if (/^[|>][-+]?$/.test(error[2]!)) message = { indent: error[1]!.length, lines: [] };
			else describeLastFailure(error[2]!.replace(/^'(.*)'$/, "$1").replaceAll("''", "'"));
			continue;
		}
		if (/^(not )?ok\s+\d+/.test(line)) {
			locating = false;
			describing = false;
			const ok = /^ok\s+\d+\s*-?\s*(.*)$/.exec(line);
			passingName = ok && !fileWithoutCases && !/#\s*(SKIP|TODO)\b/i.test(ok[1]!) ? ok[1]! : null;
		}
		const m = /^#\s+(tests|pass|fail|skipped|todo)\s+(\d+)$/.exec(line);
		if (m) {
			const n = Number.parseInt(m[2]!, 10);
			if (m[1] === "tests") tests = n;
			else if (m[1] === "pass") pass = n;
			else if (m[1] === "fail") fail = n;
			else if (m[1] === "skipped") skipped = n;
			else todo = n;
			continue;
		}
		const nok = /^not ok\s+\d+\s*-?\s*(.*)$/.exec(line);
		if (nok && failures.length < MAX_FAILURES) {
			failures.push(nok[1] ?? "unnamed test");
			locating = true;
			describing = true;
		}
	}
	if (message !== null) describeLastFailure(message.lines.join(" "));
	if (tests !== null) tests -= caseless;
	if (pass !== null) pass -= caseless;
	const facts = {
		exit_code: obs.exit_code,
		tests,
		pass,
		fail,
		skipped,
		todo,
		files_without_cases: caseless,
		passing_cases: passingCases,
		stdout_truncated: obs.stdout_truncated,
	};
	if (incident) return { verdict: "INDETERMINATE", facts: { ...facts, incident }, notes: [incident], failures };
	const broke = obs.exit_code !== 0;
	const outside = (note: string): ParsedReport => exitedOutsideTests(obs, facts, note, stdout, failures);
	if (tests === null || pass === null || fail === null) {
		// A truncated stream is a reading limit, not a property of the candidate.
		if (obs.stdout_truncated)
			return {
				verdict: "INDETERMINATE",
				facts,
				notes: ["TAP summary not found in the output (output truncated)"],
				failures,
			};
		if (broke) return outside(`the runner exited with ${obs.exit_code} without emitting a TAP summary`);
		return { verdict: "INDETERMINATE", facts, notes: ["TAP summary not found in the output"], failures };
	}
	if (tests === 0) {
		if (broke) return outside(`the runner exited with ${obs.exit_code} and executed no test`);
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: ["no test was executed: a suite without assertion proves nothing"],
			failures,
		};
	}
	if (fail > 0) return { verdict: "FAIL", facts, notes: [], failures };
	if ((skipped ?? 0) > 0 || (todo ?? 0) > 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`${skipped ?? 0} skipped and ${todo ?? 0} todo tests: a skip is not a pass (RM-017)`],
			failures,
		};
	if (broke)
		return outside(
			`every test passed but the runner exited with ${obs.exit_code}: the failure is outside the tests that ran`,
		);
	return { verdict: "PASS", facts, notes: [], failures: [] };
}

export interface JUnitSummary {
	tests: number;
	failures: number;
	errors: number;
	skipped: number;
	failed_cases: string[];
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

/** A report is the output of the process the judged project ran: it is bounded before it is analysed. */
export const MAX_REPORT_BYTES = 16 * 1024 * 1024;

export function parseReport(document: string): XmlDocument {
	if (Buffer.byteLength(document, "utf8") > MAX_REPORT_BYTES)
		throw new Error(`the report exceeds ${MAX_REPORT_BYTES} bytes`);
	return parseXml(document);
}

/**
 * JUnit/Surefire reader: every `<testcase>` is one test, failed on a `failure` or `error` child and
 * skipped on a `skipped` child. The counts of the enclosing `<testsuite>` elements are not read: a
 * nested suite repeats the tests of its parent, and an emitter may omit or fill an attribute as it likes.
 * Throws when a document is over the bound or is not XML the parser reads, deep nesting included.
 */
export function summarizeJUnit(documents: string[]): JUnitSummary {
	const s: JUnitSummary = { tests: 0, failures: 0, errors: 0, skipped: 0, failed_cases: [], files: documents.length };
	for (const doc of documents) {
		for (const testcase of testCasesOf(parseReport(doc))) {
			s.tests += 1;
			const outcomes = testcase.children.flatMap((child) => (child instanceof XmlElement ? [child.name] : []));
			if (outcomes.includes("failure")) s.failures += 1;
			else if (outcomes.includes("error")) s.errors += 1;
			else if (outcomes.includes("skipped")) s.skipped += 1;
			if (!outcomes.some((name) => name === "failure" || name === "error")) continue;
			if (s.failed_cases.length >= MAX_FAILURES) continue;
			const name = testcase.attributes.name ?? "unnamed";
			const cls = testcase.attributes.classname;
			s.failed_cases.push(cls ? `${cls}.${name}` : name);
		}
	}
	return s;
}

function intAttr(attrs: string, name: string): number {
	const m = new RegExp(`\\b${name}="(\\d+)"`).exec(attrs);
	return m ? Number.parseInt(m[1]!, 10) : 0;
}

/**
 * A non-zero exit that no test failure explains is a verdict on the candidate, not an incident: a
 * compilation error, a plugin failure or a module the reactor never reached are all reproducible
 * properties of the frozen tree. Only `incidentOf` — spawn error, timeout, signal — is INDETERMINATE,
 * because only those can give a different answer on an identical re-run.
 */
export function parseJUnit(obs: ProcessObservation, documents: string[] | null, output = ""): ParsedReport {
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

export interface JacocoDocument {
	/** Workspace-relative path of the report, which names the module it measures. */
	name: string;
	text: string;
}

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

/** Compilation units JaCoCo instruments. */
const MEASURABLE_SOURCE = /\.(java|kt|scala|groovy)$/;
/** Declarations without an executable line: no report mentions them, and none should. */
export const JVM_DECLARATION_ONLY = /(^|\/)(module-info|package-info)\.[a-z]+$/;
/** A test is what measures; it is never what is measured. */
export const JVM_TEST_SOURCE = /(^|\/)src\/test\//;

/**
 * Introduced paths a coverage report is expected to mention. A path outside this set is not an
 * unmeasured file: a test, a POM or a resource is simply not what JaCoCo instruments.
 */
export function measurableIntroducedPaths(introduced: IntroducedLines): string[] {
	return Object.keys(introduced)
		.filter((path) => MEASURABLE_SOURCE.test(path) && !JVM_DECLARATION_ONLY.test(path) && !JVM_TEST_SOURCE.test(path))
		.sort();
}

/** The five XML entities, decoded: JaCoCo writes a constructor `&lt;init&gt;`. */
export function decodeXml(text: string): string {
	return text.replace(
		/&(lt|gt|quot|apos|amp);/g,
		(whole, entity: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[entity] ?? whole,
	);
}

/** An attribute value, with the five XML entities decoded. */
function strAttr(attrs: string, name: string): string | null {
	const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
	return m ? decodeXml(m[1]!) : null;
}

/** The module a report measures: `domain/target/site/jacoco/jacoco.xml` measures `domain`. */
export function moduleOf(reportName: string): string {
	const at = reportName.indexOf("/target/");
	return at > 0 ? reportName.slice(0, at) : "";
}

/**
 * The source path a package and a source file name. A report states neither the source root nor the
 * repository path, so the answer is looked up among the paths the candidate actually touched: one
 * match is the file, several is an ambiguity that is reported rather than guessed.
 */
export function resolveSourcePath(
	module: string,
	packageName: string,
	sourcefile: string,
	paths: readonly string[],
): { path: string | null; ambiguous: boolean } {
	const suffix = packageName ? `${packageName}/${sourcefile}` : sourcefile;
	const matches = paths.filter(
		(path) => (path === suffix || path.endsWith(`/${suffix}`)) && (module === "" || path.startsWith(`${module}/`)),
	);
	return { path: matches.length === 1 ? matches[0]! : null, ambiguous: matches.length > 1 };
}

/**
 * Reads JaCoCo XML reports and keeps what concerns `paths`. Several reports may measure the same
 * file — a reactor writes one per module, and an aggregate may repeat them — so a line executed in
 * any of them counts as executed.
 */
function summarizeJacoco(documents: readonly JacocoDocument[], paths: readonly string[]): CoverageMeasurement {
	const measurement: CoverageMeasurement = { files: new Map(), symbols: new Map(), notes: [] };
	const ambiguous = new Set<string>();
	for (const doc of documents) {
		const module = moduleOf(doc.name);
		for (const pkg of doc.text.matchAll(/<package\b([^>]*)>([\s\S]*?)<\/package>/g)) {
			const packageName = strAttr(pkg[1] ?? "", "name") ?? "";
			const body = pkg[2] ?? "";
			for (const source of body.matchAll(/<sourcefile\b([^>]*)>([\s\S]*?)<\/sourcefile>/g)) {
				const sourcefile = strAttr(source[1] ?? "", "name");
				if (!sourcefile) continue;
				const resolved = resolveSourcePath(module, packageName, sourcefile, paths);
				if (resolved.ambiguous) {
					ambiguous.add(packageName ? `${packageName}/${sourcefile}` : sourcefile);
					continue;
				}
				if (!resolved.path) continue;
				let lines = measurement.files.get(resolved.path);
				if (!lines) {
					lines = new Map();
					measurement.files.set(resolved.path, lines);
				}
				for (const line of (source[2] ?? "").matchAll(/<line\b([^>]*)>/g)) {
					const attrs = line[1] ?? "";
					const nr = intAttr(attrs, "nr");
					if (nr < 1) continue;
					const missedBranches = intAttr(attrs, "mb");
					const coveredBranches = intAttr(attrs, "cb");
					const previous = lines.get(nr);
					lines.set(nr, {
						covered: intAttr(attrs, "ci") > 0 || Boolean(previous?.covered),
						branches_missed: previous ? Math.min(previous.branches_missed, missedBranches) : missedBranches,
						branches_covered: Math.max(previous?.branches_covered ?? 0, coveredBranches),
					});
				}
				const symbols = symbolsOf(body, sourcefile);
				if (symbols.length > 0) measurement.symbols.set(resolved.path, symbols);
			}
		}
	}
	for (const name of [...ambiguous].sort())
		measurement.notes.push(`${name} matches several touched paths: the report cannot be attributed to one of them`);
	return measurement;
}

/** Where each symbol of a source file starts, ascending, from the `<class>` blocks of its package. */
function symbolsOf(packageBody: string, sourcefile: string): { line: number; symbol: string }[] {
	const out: { line: number; symbol: string }[] = [];
	for (const klass of packageBody.matchAll(/<class\b([^>]*?)(?:\/>|>([\s\S]*?)<\/class>)/g)) {
		const attrs = klass[1] ?? "";
		if (strAttr(attrs, "sourcefilename") !== sourcefile) continue;
		const name = (strAttr(attrs, "name") ?? "").split("/").join(".");
		const methods = [...(klass[2] ?? "").matchAll(/<method\b([^>]*)>/g)];
		if (methods.length === 0) {
			out.push({ line: 1, symbol: name });
			continue;
		}
		for (const method of methods) {
			const line = intAttr(method[1] ?? "", "line");
			out.push({ line: line > 0 ? line : 1, symbol: `${name}.${strAttr(method[1] ?? "", "name") ?? "?"}` });
		}
	}
	return out.sort((a, b) => a.line - b.line);
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

const MAX_COVERAGE_FINDINGS = 200;

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
 * Coverage of the introduced lines (QLT-04).
 *
 * The sensor executes nothing: it reads the report the frozen test control already wrote, and judges
 * only the lines the candidate introduced. A line it never exercised blocks; a line it exercised on
 * one branch out of two is reported without blocking; a line the candidate did not write is outside
 * its jurisdiction, counted as inherited debt and named as such. No report, a report that does not
 * mention an introduced source file, or no introduced-line set at all are all INDETERMINATE: an
 * absent measurement has never been proof of coverage.
 */
export function parseJacoco(
	obs: ProcessObservation,
	documents: readonly JacocoDocument[] | null,
	introduced: IntroducedLines | null,
): ParsedReport {
	const reports = documents?.length ?? 0;
	const undecided = undecidedCoverage(obs, reports);
	if (undecided) return undecided;
	if (introduced === null) return unknownIntroducedLines(obs, reports);
	const wanted = measurableIntroducedPaths(introduced);
	const facts: Record<string, unknown> = {
		exit_code: obs.exit_code,
		reports,
		introduced_files: Object.keys(introduced).length,
		introduced_lines: Object.values(introduced).reduce((total, lines) => total + lines.length, 0),
		measurable_files: wanted.length,
	};
	if (wanted.length === 0)
		return {
			verdict: "PASS",
			facts: {
				...facts,
				measured_lines: 0,
				uncovered_lines: 0,
				partially_covered_lines: 0,
				tolerated_uncovered_lines: 0,
			},
			notes: ["the candidate introduces no line JaCoCo measures"],
			failures: [],
			findings: [],
		};
	if (reports === 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`no JaCoCo report found at the declared report path, for ${wanted.length} introduced source file(s)`],
			failures: [],
		};
	const measurement = summarizeJacoco(documents ?? [], wanted);
	const unmeasured = wanted.filter((path) => !measurement.files.has(path));
	if (unmeasured.length > 0)
		return {
			verdict: "INDETERMINATE",
			facts: { ...facts, unmeasured_files: unmeasured.length },
			notes: [unmeasuredNote(unmeasured), ...measurement.notes],
			failures: [],
		};

	const { findings, measured, uncovered, partial, tolerated } = judgeIntroducedLines(measurement, wanted, introduced);
	const notes = [...measurement.notes];
	if (tolerated.length > 0)
		notes.push(
			`${tolerated.length} line(s) of the touched files were already unexercised before this change and are tolerated: the rule is on the introduced lines, not on a ratio (QLT-04)`,
		);
	if (partial > 0)
		notes.push(`${partial} introduced line(s) are exercised on part of their branches only: reported, not blocking`);
	if (uncovered + partial > MAX_COVERAGE_FINDINGS)
		notes.push(`${uncovered + partial} findings reduced to the first ${MAX_COVERAGE_FINDINGS}`);
	return {
		verdict: uncovered > 0 ? "FAIL" : "PASS",
		facts: {
			...facts,
			measured_lines: measured,
			uncovered_lines: uncovered,
			partially_covered_lines: partial,
			tolerated_uncovered_lines: tolerated.length,
		},
		notes,
		failures: [],
		findings,
	};
}
