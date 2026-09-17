import type { Verdict } from "../../contracts/v1/common.ts";
import type { Finding } from "../../contracts/v1/evidence.ts";
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

export const PARSER_VERSIONS = { "exit-code": "1.0.0", "node-test": "1.0.0", "junit-xml": "1.0.0", "jacoco-xml": "1.0.0", "java-imports": "1.0.0" } as const;

const MAX_FAILURES = 50;

/** Verdict from the incident dimension only: timeout, spawn error, signal. */
export function incidentOf(obs: ProcessObservation): string | null {
	if (obs.spawn_error) return `spawn error: ${obs.spawn_error}`;
	if (obs.timed_out) return `timeout after ${obs.duration_ms} ms`;
	if (obs.exit_code === null) return `terminated by signal ${obs.signal ?? "unknown"}`;
	return null;
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

/** Contract: exit code 0 means PASS, any other exit code means FAIL, an incident means INDETERMINATE (RM-016). */
export function parseExitCode(obs: ProcessObservation): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return { verdict: "INDETERMINATE", facts: { exit_code: obs.exit_code, incident }, notes: [incident], failures: [] };
	return { verdict: obs.exit_code === 0 ? "PASS" : "FAIL", facts: { exit_code: obs.exit_code }, notes: [], failures: obs.exit_code === 0 ? [] : [`exit code ${obs.exit_code}`] };
}

/** TAP output of `node --test --test-reporter=tap`. Skipped or todo tests never count as PASS (§6.5). */
export function parseNodeTestTap(obs: ProcessObservation, stdout: string): ParsedReport {
	const incident = incidentOf(obs);
	const lines = stdout.split(/\r?\n/);
	let tests: number | null = null;
	let pass: number | null = null;
	let fail: number | null = null;
	let skipped: number | null = null;
	let todo: number | null = null;
	const failures: string[] = [];
	for (const raw of lines) {
		const line = raw.trim();
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
		if (nok && failures.length < MAX_FAILURES) failures.push(nok[1] ?? "unnamed test");
	}
	const facts = { exit_code: obs.exit_code, tests, pass, fail, skipped, todo, stdout_truncated: obs.stdout_truncated };
	if (incident) return { verdict: "INDETERMINATE", facts: { ...facts, incident }, notes: [incident], failures };
	const broke = obs.exit_code !== 0;
	const outside = (note: string): ParsedReport => ({ verdict: "FAIL", facts, notes: [note], failures: failures.length > 0 ? failures : buildErrors(stdout).length > 0 ? buildErrors(stdout) : [`exit code ${obs.exit_code}`] });
	if (tests === null || pass === null || fail === null) {
		// A truncated stream is a reading limit, not a property of the candidate.
		if (obs.stdout_truncated) return { verdict: "INDETERMINATE", facts, notes: ["TAP summary not found in the output (output truncated)"], failures };
		if (broke) return outside(`the runner exited with ${obs.exit_code} without emitting a TAP summary`);
		return { verdict: "INDETERMINATE", facts, notes: ["TAP summary not found in the output"], failures };
	}
	if (tests === 0) {
		if (broke) return outside(`the runner exited with ${obs.exit_code} and executed no test`);
		return { verdict: "INDETERMINATE", facts, notes: ["no test was executed: a suite without assertion proves nothing"], failures };
	}
	if (fail > 0) return { verdict: "FAIL", facts, notes: [], failures };
	if ((skipped ?? 0) > 0 || (todo ?? 0) > 0) return { verdict: "INDETERMINATE", facts, notes: [`${skipped ?? 0} skipped and ${todo ?? 0} todo tests: a skip is not a pass (RM-017)`], failures };
	if (broke) return outside(`every test passed but the runner exited with ${obs.exit_code}: the failure is outside the tests that ran`);
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

/** Minimal JUnit/Surefire XML reader: counts from `<testsuite>` attributes and `<testcase>` children. */
export function summarizeJUnit(documents: string[]): JUnitSummary {
	const s: JUnitSummary = { tests: 0, failures: 0, errors: 0, skipped: 0, failed_cases: [], files: documents.length };
	for (const doc of documents) {
		for (const suite of doc.matchAll(/<testsuite\b([^>]*)>/g)) {
			const attrs = suite[1] ?? "";
			s.tests += intAttr(attrs, "tests");
			s.failures += intAttr(attrs, "failures");
			s.errors += intAttr(attrs, "errors");
			s.skipped += intAttr(attrs, "skipped");
		}
		for (const tc of doc.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
			const body = tc[3] ?? "";
			if (/<(failure|error)\b/.test(body) && s.failed_cases.length < MAX_FAILURES) {
				const name = /name="([^"]*)"/.exec(tc[1] ?? "")?.[1] ?? "unnamed";
				const cls = /classname="([^"]*)"/.exec(tc[1] ?? "")?.[1];
				s.failed_cases.push(cls ? `${cls}.${name}` : name);
			}
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
	if (incident) return { verdict: "INDETERMINATE", facts: { exit_code: obs.exit_code, incident }, notes: [incident], failures: [] };
	const broke = obs.exit_code !== 0;
	const outside = (facts: Record<string, unknown>, note: string): ParsedReport => {
		const errors = buildErrors(output);
		return { verdict: "FAIL", facts, notes: [note], failures: errors.length > 0 ? errors : [`exit code ${obs.exit_code}`] };
	};
	if (!documents || documents.length === 0) {
		const facts = { exit_code: obs.exit_code, reports: 0 };
		if (broke) return outside(facts, `the build exited with ${obs.exit_code} before producing any test report`);
		return { verdict: "INDETERMINATE", facts, notes: ["no JUnit report found at the declared report path"], failures: [] };
	}
	const s = summarizeJUnit(documents);
	const facts = { exit_code: obs.exit_code, ...s };
	if (s.tests === 0) {
		if (broke) return outside(facts, `the build exited with ${obs.exit_code} and the reports contain no test`);
		return { verdict: "INDETERMINATE", facts, notes: ["JUnit reports contain no test"], failures: [] };
	}
	if (s.failures + s.errors > 0) return { verdict: "FAIL", facts, notes: [], failures: s.failed_cases };
	if (s.skipped > 0) return { verdict: "INDETERMINATE", facts, notes: [`${s.skipped} skipped tests: a skip is not a pass (RM-017)`], failures: [] };
	if (broke) return outside(facts, `the reports are green but the build exited with ${obs.exit_code}: the failure is outside the tests that ran`);
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

const MAX_COVERAGE_FINDINGS = 200;
const MAX_NAMED_PATHS = 10;

/** Compilation units JaCoCo instruments. */
const MEASURABLE_SOURCE = /\.(java|kt|scala|groovy)$/;
/** Declarations without an executable line: no report mentions them, and none should. */
const DECLARATION_ONLY = /(^|\/)(module-info|package-info)\.[a-z]+$/;
/** A test is what measures; it is never what is measured. */
const TEST_SOURCE = /(^|\/)src\/test\//;

/**
 * Introduced paths a coverage report is expected to mention. A path outside this set is not an
 * unmeasured file: a test, a POM or a resource is simply not what JaCoCo instruments.
 */
export function measurableIntroducedPaths(introduced: IntroducedLines): string[] {
	return Object.keys(introduced).filter((path) => MEASURABLE_SOURCE.test(path) && !DECLARATION_ONLY.test(path) && !TEST_SOURCE.test(path)).sort();
}

/** An attribute value, with the five XML entities decoded: JaCoCo writes a constructor `&lt;init&gt;`. */
function strAttr(attrs: string, name: string): string | null {
	const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
	if (!m) return null;
	return m[1]!.replace(/&(lt|gt|quot|apos|amp);/g, (_whole, entity: string) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[entity] ?? _whole);
}

/** The module a report measures: `domain/target/site/jacoco/jacoco.xml` measures `domain`. */
function moduleOf(reportName: string): string {
	const at = reportName.indexOf("/target/");
	return at > 0 ? reportName.slice(0, at) : "";
}

/**
 * The source path a `<package>/<sourcefile>` pair names. JaCoCo states neither the source root nor
 * the repository path, so the answer is looked up among the paths the candidate actually touched:
 * one match is the file, several is an ambiguity that is reported rather than guessed.
 */
function resolveSourcePath(module: string, packageName: string, sourcefile: string, paths: readonly string[]): { path: string | null; ambiguous: boolean } {
	const suffix = packageName ? `${packageName}/${sourcefile}` : sourcefile;
	const matches = paths.filter((path) => (path === suffix || path.endsWith(`/${suffix}`)) && (module === "" || path.startsWith(`${module}/`)));
	return { path: matches.length === 1 ? matches[0]! : null, ambiguous: matches.length > 1 };
}

/**
 * Reads JaCoCo XML reports and keeps what concerns `paths`. Several reports may measure the same
 * file — a reactor writes one per module, and an aggregate may repeat them — so a line executed in
 * any of them counts as executed.
 */
export function summarizeJacoco(documents: readonly JacocoDocument[], paths: readonly string[]): CoverageMeasurement {
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
				if (resolved.ambiguous) { ambiguous.add(packageName ? `${packageName}/${sourcefile}` : sourcefile); continue; }
				if (!resolved.path) continue;
				let lines = measurement.files.get(resolved.path);
				if (!lines) { lines = new Map(); measurement.files.set(resolved.path, lines); }
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
	for (const name of [...ambiguous].sort()) measurement.notes.push(`${name} matches several touched paths: the report cannot be attributed to one of them`);
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
		if (methods.length === 0) { out.push({ line: 1, symbol: name }); continue; }
		for (const method of methods) {
			const line = intAttr(method[1] ?? "", "line");
			out.push({ line: line > 0 ? line : 1, symbol: `${name}.${strAttr(method[1] ?? "", "name") ?? "?"}` });
		}
	}
	return out.sort((a, b) => a.line - b.line);
}

/** The symbol a line belongs to: the last one declared at or before it. */
export function symbolAt(symbols: readonly { line: number; symbol: string }[], line: number): string | null {
	let found: string | null = symbols[0]?.symbol ?? null;
	for (const entry of symbols) {
		if (entry.line > line) break;
		found = entry.symbol;
	}
	return found;
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
export function parseJacoco(obs: ProcessObservation, documents: readonly JacocoDocument[] | null, introduced: IntroducedLines | null): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return { verdict: "INDETERMINATE", facts: { exit_code: obs.exit_code, incident }, notes: [incident], failures: [] };
	const reports = documents?.length ?? 0;
	if (obs.exit_code !== 0) return { verdict: "INDETERMINATE", facts: { exit_code: obs.exit_code, reports }, notes: [`the coverage sensor exited with ${obs.exit_code} without reading a report`], failures: [] };
	if (introduced === null) return { verdict: "INDETERMINATE", facts: { exit_code: obs.exit_code, reports }, notes: ["no introduced-line set was given: a differential control cannot judge a candidate whose new lines are unknown"], failures: [] };
	const wanted = measurableIntroducedPaths(introduced);
	const facts: Record<string, unknown> = {
		exit_code: obs.exit_code,
		reports,
		introduced_files: Object.keys(introduced).length,
		introduced_lines: Object.values(introduced).reduce((total, lines) => total + lines.length, 0),
		measurable_files: wanted.length,
	};
	if (wanted.length === 0) return { verdict: "PASS", facts: { ...facts, measured_lines: 0, uncovered_lines: 0, partially_covered_lines: 0, tolerated_uncovered_lines: 0 }, notes: ["the candidate introduces no line JaCoCo measures"], failures: [], findings: [] };
	if (reports === 0) return { verdict: "INDETERMINATE", facts, notes: [`no JaCoCo report found at the declared report path, for ${wanted.length} introduced source file(s)`], failures: [] };
	const measurement = summarizeJacoco(documents ?? [], wanted);
	const unmeasured = wanted.filter((path) => !measurement.files.has(path));
	if (unmeasured.length > 0) return { verdict: "INDETERMINATE", facts: { ...facts, unmeasured_files: unmeasured.length }, notes: [`no coverage report measures ${unmeasured.length} introduced source file(s): ${unmeasured.slice(0, MAX_NAMED_PATHS).join(", ")}`, ...measurement.notes], failures: [] };

	const findings: ParsedFinding[] = [];
	let measured = 0;
	let uncovered = 0;
	let partial = 0;
	let tolerated = 0;
	for (const path of wanted) {
		const lines = measurement.files.get(path)!;
		const symbols = measurement.symbols.get(path) ?? [];
		const introducedHere = new Set(introduced[path] ?? []);
		for (const nr of [...lines.keys()].sort((a, b) => a - b)) {
			const line = lines.get(nr)!;
			if (!introducedHere.has(nr)) {
				if (!line.covered) tolerated++;
				continue;
			}
			measured++;
			const symbol = symbolAt(symbols, nr);
			const named = symbol ? ` in ${symbol}` : "";
			if (!line.covered) {
				uncovered++;
				if (findings.length < MAX_COVERAGE_FINDINGS) findings.push({ rule_id: COVERAGE_RULE_UNCOVERED, category: "quality", severity: "blocker", message: `${path}:${nr} introduced line never exercised by the suite${named}`, symbol });
			} else if (line.branches_missed > 0) {
				partial++;
				if (findings.length < MAX_COVERAGE_FINDINGS) findings.push({ rule_id: COVERAGE_RULE_PARTIAL, category: "quality", severity: "major", message: `${path}:${nr} introduced line exercised on part of its branches only${named}`, symbol });
			}
		}
	}
	const notes = [...measurement.notes];
	if (tolerated > 0) notes.push(`${tolerated} line(s) of the touched files were already unexercised before this change and are tolerated: the rule is on the introduced lines, not on a ratio (QLT-04)`);
	if (partial > 0) notes.push(`${partial} introduced line(s) are exercised on part of their branches only: reported, not blocking`);
	if (uncovered + partial > MAX_COVERAGE_FINDINGS) notes.push(`${uncovered + partial} findings reduced to the first ${MAX_COVERAGE_FINDINGS}`);
	return {
		verdict: uncovered > 0 ? "FAIL" : "PASS",
		facts: { ...facts, measured_lines: measured, uncovered_lines: uncovered, partially_covered_lines: partial, tolerated_uncovered_lines: tolerated },
		notes,
		failures: [],
		findings,
	};
}
