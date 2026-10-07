/**
 * The reader of the JaCoCo XML report `mvn test` writes: the coverage of the lines a candidate introduced,
 * judged on the report the test control already wrote (QLT-04).
 */
import type {
	IntroducedLines,
	ParsedReport,
	ProcessObservation,
	ReportDocument,
	ReportReader,
} from "../../../ports/execution.ts";
import {
	coverageReports,
	decodeXml,
	judgeIntroducedLines,
	MAX_COVERAGE_FINDINGS,
	undecidedCoverage,
	unknownIntroducedLines,
	unmeasuredNote,
	type CoverageMeasurement,
} from "../../execution/parsers.ts";
import { JVM_DECLARATION_ONLY, JVM_TEST_SOURCE, moduleOf, resolveSourcePath } from "./jvm-sources.ts";

/** Compilation units JaCoCo instruments. */
const MEASURABLE_SOURCE = /\.(java|kt|scala|groovy)$/;
/**
 * Introduced paths a coverage report is expected to mention. A path outside this set is not an
 * unmeasured file: a test, a POM or a resource is simply not what JaCoCo instruments.
 */
export function measurableIntroducedPaths(introduced: IntroducedLines): string[] {
	return Object.keys(introduced)
		.filter((path) => MEASURABLE_SOURCE.test(path) && !JVM_DECLARATION_ONLY.test(path) && !JVM_TEST_SOURCE.test(path))
		.sort();
}

function intAttr(attrs: string, name: string): number {
	const m = new RegExp(`\\b${name}="(\\d+)"`).exec(attrs);
	return m ? Number.parseInt(m[1]!, 10) : 0;
}

/** An attribute value, with the five XML entities decoded. */
function strAttr(attrs: string, name: string): string | null {
	const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
	return m ? decodeXml(m[1]!) : null;
}

/**
 * Reads JaCoCo XML reports and keeps what concerns `paths`. Several reports may measure the same
 * file — a reactor writes one per module, and an aggregate may repeat them — so a line executed in
 * any of them counts as executed.
 */
function summarizeJacoco(documents: readonly ReportDocument[], paths: readonly string[]): CoverageMeasurement {
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
	documents: readonly ReportDocument[] | null,
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

/** Reads the coverage report the test control already wrote and judges only the lines the candidate introduced (QLT-04); it executes no measurement of its own. */
export const JACOCO_READER: ReportReader = {
	id: "jacoco-xml",
	version: "1.0.0",
	nature: "coverage",
	differential: true,
	located: false,
	read: async (run) =>
		parseJacoco(run.observation, await coverageReports(run, "application/xml"), run.introduced_lines),
};
