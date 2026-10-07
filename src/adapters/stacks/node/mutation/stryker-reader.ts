/**
 * The reader of the JSON report Stryker writes, the mutation engine of a Node target: its run is scoped to
 * the line ranges the candidate introduced, and the mutants it reports are judged on the lines the
 * candidate wrote, with the comments that silence it on those lines (VER-04).
 */
import { stripVTControlCharacters } from "node:util";
import { hasControlCharacter } from "../../../../application/coverage.ts";
import type {
	IntroducedLines,
	ParsedReport,
	ProcessObservation,
	ReportDocument,
	ReportReader,
} from "../../../../ports/execution.ts";
import {
	SCRIPT_DECLARATION_ONLY,
	SCRIPT_SOURCE,
	SCRIPT_TEST_SOURCE,
	type SilencingRule,
} from "../../../execution/lcov.ts";
import {
	mutationReader,
	type Mutant,
	type MutationEngine,
	type MutationScope,
	type MutationSummary,
} from "../../../execution/mutation.ts";
import { MAX_NAMED_PATHS, MAX_REPORT_BYTES } from "../../../execution/parsers.ts";
import { STRYKER_REPORT_PATH } from "../shared.ts";

/**
 * Stryker drops the mutants of the lines a `Stryker disable` comment covers and reports them Ignored,
 * which the control counts and never opposes: a candidate that wrote one would pass on a line no test
 * protects. The directive may stand alone on a line of a block comment. The word `restore`, or `disabled`
 * in a string, is not the directive.
 */
const STRYKER_SILENCING: SilencingRule = {
	pattern: /(?:\/\/|\/\*)\s*(Stryker\s+disable\b)/,
	blockLine: /^\s*(Stryker\s+disable\b)/,
	rule_id: "mutation:silence-comment-introduced",
	hides: "the mutation report",
};

/** Stryker statuses, named as the statuses this sensor judges: one vocabulary behind both engines. */
const STRYKER_STATUS: Readonly<Record<string, string>> = {
	Killed: "KILLED",
	Timeout: "TIMED_OUT",
	Survived: "SURVIVED",
	NoCoverage: "NO_COVERAGE",
	CompileError: "NON_VIABLE",
	RuntimeError: "RUN_ERROR",
	Ignored: "IGNORED",
};

/**
 * Stryker reads a scope as a glob pattern: a path carrying one of these would mutate another file or
 * none, and a run that mutates nothing looks like a suite that kills everything. A path with a control
 * character is kept by the introduced lines with no range, so it cannot be designated either.
 */
const STRYKER_PATTERN_CHARACTER = /[*?[\]{}()!,]/;

/** `5, 6, 9` as `5-6`, `9-9`: one range per run of consecutive lines. */
function lineRanges(lines: readonly number[]): [number, number][] {
	const ranges: [number, number][] = [];
	for (const line of [...new Set(lines)].sort((a, b) => a - b)) {
		const last = ranges.at(-1);
		if (last && last[1] + 1 === line) last[1] = line;
		else ranges.push([line, line]);
	}
	return ranges;
}

/**
 * The ranges of the introduced lines Stryker is asked to mutate, `file:start-end` each, in the place
 * of the class patterns a scope otherwise carries. The scope comes from the manifest and the
 * introduced lines, never from a file the producer wrote.
 */
export function strykerScopeOf(introduced: IntroducedLines): MutationScope {
	const sources = Object.keys(introduced)
		.filter((path) => SCRIPT_SOURCE.test(path) && !SCRIPT_DECLARATION_ONLY.test(path) && !SCRIPT_TEST_SOURCE.test(path))
		.sort();
	const unaddressable = sources.filter((path) => STRYKER_PATTERN_CHARACTER.test(path) || hasControlCharacter(path));
	const paths = sources.filter((path) => !unaddressable.includes(path));
	const classes = paths.flatMap((path) =>
		lineRanges(introduced[path] ?? []).map(([start, end]) => `${path}:${start}-${end}`),
	);
	return { classes, paths, notes: [], unaddressable };
}

interface StrykerReport {
	files: Record<string, { mutants: StrykerMutant[] }>;
}

interface StrykerMutant {
	mutatorName: string;
	replacement?: string;
	description?: string;
	location: { start: { line: number } };
	status: string;
}

/** The report Stryker wrote, or the reason the text is not one that can be checked complete. */
function readStrykerReport(text: string): { report: StrykerReport } | { unreadable: string } {
	let parsed: { files?: unknown } | null;
	try {
		parsed = JSON.parse(text) as { files?: unknown } | null;
	} catch {
		return { unreadable: "the Stryker report is not valid JSON: it was truncated or is unreadable" };
	}
	const files = parsed?.files;
	if (typeof files !== "object" || files === null || Array.isArray(files))
		return {
			unreadable:
				"the Stryker report has no files entry: a run that mutated nothing is not a run that killed everything",
		};
	return { report: parsed as StrykerReport };
}

/**
 * Reads the mutants of a Stryker report. Stryker lays a report out by file, relative to where it ran,
 * which is the workspace: no path has to be resolved, and a mutant sits on the line it starts on.
 */
function summarizeStryker(documents: readonly ReportDocument[]): MutationSummary {
	const mutants: Mutant[] = [];
	for (const doc of documents) {
		const read = readStrykerReport(doc.text);
		if ("unreadable" in read) continue;
		for (const [path, file] of Object.entries(read.report.files))
			for (const mutant of file.mutants) {
				const replacement = mutant.replacement?.replace(/\s+/g, " ").slice(0, 80);
				mutants.push({
					status: STRYKER_STATUS[mutant.status] ?? mutant.status,
					path,
					line: mutant.location.start.line,
					mutator: mutant.mutatorName || "unnamed operator",
					mutated_class: "",
					mutated_method: "",
					description: mutant.description ?? (replacement ? `replaced by ${replacement}` : ""),
				});
			}
	}
	return { mutants, out_of_scope: 0, notes: [] };
}

/** Why a document present at the report path cannot be checked complete, or null when it can. */
function unreadableStrykerReport(doc: ReportDocument): string | null {
	if (doc.oversized_bytes !== undefined)
		return `the Stryker report is ${doc.oversized_bytes} bytes, past the read bound of ${MAX_REPORT_BYTES}: it was not read`;
	const read = readStrykerReport(doc.text);
	return "unreadable" in read ? read.unreadable : null;
}

/**
 * What the control answers when Stryker left no report it could read. A report that is there and
 * cannot be checked complete is undecided whatever the exit code says. Without any, a non-zero exit is
 * a suite that fails on the frozen copy — Stryker runs it once unmutated before anything else — and a
 * zero exit is a run whose proof is missing.
 */
function withoutStrykerReport(
	obs: ProcessObservation,
	documents: readonly ReportDocument[],
	facts: Record<string, unknown>,
	output: string,
): ParsedReport {
	const unreadable = documents.map(unreadableStrykerReport).filter((reason) => reason !== null);
	if (unreadable.length > 0) return { verdict: "INDETERMINATE", facts, notes: unreadable, failures: [] };
	if (obs.exit_code === 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [
				`no Stryker report at ${STRYKER_REPORT_PATH}: the run that would prove the suite kills the mutants is missing`,
			],
			failures: [],
		};
	// Stryker colors its log and stamps each line with the time and its process number: none of that
	// belongs to a message that two runs of the same tree must word alike.
	const errors = stripVTControlCharacters(output)
		.split(/\r?\n/)
		.filter((line) => /\bERROR\b/.test(line))
		.map((line) => line.replace(/^\s*\d{2}:\d{2}:\d{2} \(\d+\) /, "").trim());
	return {
		verdict: "FAIL",
		facts,
		notes: [
			`Stryker exited with ${obs.exit_code} before writing a report: the initial test run fails in the frozen copy`,
		],
		failures: errors.length > 0 ? errors.slice(0, MAX_NAMED_PATHS) : [`exit code ${obs.exit_code}`],
	};
}

/**
 * Stryker, run once unmutated and then on the introduced line ranges only. What is read back is the report
 * of its JSON reporter at the path the target declares, bounded in size: the report is an output of the
 * project judged. The introduced sources are read too: a comment that silences Stryker leaves a complete
 * report whose mutants are Ignored, which only the source shows.
 */
export const STRYKER_ENGINE: MutationEngine = {
	scopeOf: async (_files, introduced) => strykerScopeOf(introduced),
	reports: (files) => files.reports("application/json", { oversized_unread: true, single_file: true }),
	isComplete: (text) => "report" in readStrykerReport(text),
	summarize: (documents) => summarizeStryker(documents),
	withoutReport: (obs, documents, facts, output) => withoutStrykerReport(obs, documents, facts, output),
	silencing: { rule: STRYKER_SILENCING, engine: "Stryker" },
};

/** Judges the mutants sitting on the lines the candidate wrote, as the PIT reader does (VER-04). */
export const STRYKER_READER: ReportReader = mutationReader("stryker-json", STRYKER_ENGINE);
