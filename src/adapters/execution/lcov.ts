import { hasControlCharacter } from "../../application/coverage.ts";
import type {
	IntroducedLines,
	ParsedFinding,
	ParsedReport,
	ProcessObservation,
	ReportReader,
} from "../../ports/execution.ts";
import {
	judgeIntroducedLines,
	MAX_NAMED_PATHS,
	undecidedCoverage,
	unknownIntroducedLines,
	unmeasuredNote,
	type CoverageMeasurement,
	type MeasuredLine,
	coverageReports,
} from "./parsers.ts";

export interface LcovDocument {
	/** Workspace-relative path of the report. */
	name: string;
	text: string;
}

interface FileRecord {
	/** Line number -> how many times the runner executed it. */
	hits: Map<number, number>;
	/** `line:block:branch` -> how many times that branch was taken. */
	branches: Map<string, number>;
}

/** A count field of a record: `-` marks a branch whose block never ran. */
function countOf(field: string | undefined): number {
	const count = Number.parseInt(field ?? "", 10);
	return Number.isNaN(count) ? 0 : count;
}

/**
 * The records of an LCOV report (`SF`, `DA`, `BRDA`). A file may appear in several records, one per
 * process the runner measured: a line executed in any of them counts as executed, and a branch taken in
 * any of them counts as taken.
 */
function readRecords(documents: readonly LcovDocument[]): Map<string, FileRecord> {
	const files = new Map<string, FileRecord>();
	for (const doc of documents) {
		let current: FileRecord | null = null;
		for (const raw of doc.text.split(/\r?\n/)) {
			if (raw.startsWith("SF:")) {
				const path = raw.slice(3);
				current = files.get(path) ?? { hits: new Map(), branches: new Map() };
				files.set(path, current);
			} else if (raw === "end_of_record") current = null;
			else if (current && raw.startsWith("DA:")) {
				const [line, count] = raw.slice(3).split(",");
				const nr = countOf(line);
				current.hits.set(nr, (current.hits.get(nr) ?? 0) + countOf(count));
			} else if (current && raw.startsWith("BRDA:")) {
				const [line, block, branch, taken] = raw.slice(5).split(",");
				const key = `${line}:${block}:${branch}`;
				current.branches.set(key, (current.branches.get(key) ?? 0) + countOf(taken));
			}
		}
	}
	return files;
}

function measurementOf(files: Map<string, FileRecord>): CoverageMeasurement {
	const measurement: CoverageMeasurement = { files: new Map(), symbols: new Map(), notes: [] };
	for (const [path, record] of files) {
		const branchesOf = new Map<number, { missed: number; taken: number }>();
		for (const [key, hits] of record.branches) {
			const nr = Number.parseInt(key, 10);
			const branches = branchesOf.get(nr) ?? { missed: 0, taken: 0 };
			if (hits > 0) branches.taken++;
			else branches.missed++;
			branchesOf.set(nr, branches);
		}
		const lines = new Map<number, MeasuredLine>();
		for (const [nr, count] of record.hits) {
			if (nr < 1) continue;
			const branches = branchesOf.get(nr);
			lines.set(nr, {
				covered: count > 0,
				branches_missed: branches?.missed ?? 0,
				branches_covered: branches?.taken ?? 0,
			});
		}
		measurement.files.set(path, lines);
	}
	return measurement;
}

export const SCRIPT_SOURCE = /\.[cm]?[jt]sx?$/;
/** A declaration file has no executable line, and a runner reports none. */
export const SCRIPT_DECLARATION_ONLY = /\.d\.[cm]?ts$/;
/** A configuration is read by the tools, not run by the suite. */
const CONFIGURATION = /\.config\.[cm]?[jt]sx?$/;
/** A test is what measures; it is never what is measured. */
export const SCRIPT_TEST_SOURCE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * Introduced paths an LCOV report is expected to cite. A path outside this set is not an unmeasured
 * file: a test, a configuration or a declaration file is simply not what a coverage runner reports.
 */
function expectedInLcovReport(introduced: IntroducedLines): string[] {
	return Object.keys(introduced)
		.filter(
			(path) =>
				SCRIPT_SOURCE.test(path) &&
				!SCRIPT_DECLARATION_ONLY.test(path) &&
				!CONFIGURATION.test(path) &&
				!SCRIPT_TEST_SOURCE.test(path),
		)
		.sort();
}

/** A comment that removes the lines under it from a report, and the finding rendered when the change wrote one. */
export interface SilencingRule {
	/** Matches the comment; its first capture group, when it has one, is the text quoted in the finding. */
	pattern: RegExp;
	rule_id: string;
	/** What the comment hides, completing `removes the lines under it from …`. */
	hides: string;
	/**
	 * Matches a line that sits inside a block comment, where the marker is on an earlier line. Without it
	 * the rule only reads a line that carries its own marker.
	 */
	blockLine?: RegExp;
}

const COVERAGE_SILENCING: SilencingRule = {
	pattern: /\b(?:v8|istanbul|c8)\s+ignore\b|\bnode:coverage\s+(?:disable|ignore)\b/,
	rule_id: "coverage:silence-comment-introduced",
	hides: "the coverage report",
};

/**
 * The lines that follow the opening line of a block comment, up to and including its closing line. The
 * extent is read from the text alone, so a block opener inside a string opens one too: over-reading hides
 * nothing, while a block read as code would let a directive through.
 */
function linesInsideBlockComments(source: string): Set<number> {
	const inside = new Set<number>();
	for (const block of source.matchAll(/\/\*[\s\S]*?(?:\*\/|$)/g)) {
		const first = source.slice(0, block.index).split("\n").length;
		const following = block[0].split("\n").length - 1;
		for (let line = first + 1; line <= first + following; line++) inside.add(line);
	}
	return inside;
}

/**
 * The comments of `wanted` files that remove the lines under them from a report. One the change wrote
 * blocks, since it would hide the code the change did not test; one already there is tolerated.
 */
export function silencingComments(
	wanted: readonly string[],
	introduced: IntroducedLines,
	sources: ReadonlyMap<string, string>,
	rule: SilencingRule = COVERAGE_SILENCING,
): { findings: ParsedFinding[]; earlier: string[] } {
	const findings: ParsedFinding[] = [];
	const earlier: string[] = [];
	for (const path of wanted) {
		const introducedHere = new Set(introduced[path] ?? []);
		const source = sources.get(path) ?? "";
		const inBlock = rule.blockLine ? linesInsideBlockComments(source) : new Set<number>();
		source.split(/\r?\n/).forEach((text, index) => {
			const comment = rule.pattern.exec(text) ?? (inBlock.has(index + 1) ? rule.blockLine?.exec(text) : null);
			if (!comment) return;
			if (!introducedHere.has(index + 1)) earlier.push(`${path}:${index + 1}`);
			else
				findings.push({
					rule_id: rule.rule_id,
					category: "quality",
					severity: "blocker",
					message: `${path}:${index + 1} introduced comment "${comment[1] ?? comment[0]}" removes the lines under it from ${rule.hides}`,
					symbol: null,
				});
		});
	}
	return { findings, earlier };
}

/**
 * Coverage of the introduced lines from an LCOV report (QLT-04). It executes nothing: it reads the
 * report the frozen test control wrote and judges only the lines the candidate introduced, by the rule
 * every coverage reader shares. A source file the report does not cite, an absent report and an unknown
 * introduced set are INDETERMINATE: a file the suite never loaded is absent from the report, and absence
 * is not coverage.
 */
function parseLcov(
	obs: ProcessObservation,
	documents: readonly LcovDocument[],
	introduced: IntroducedLines | null,
	sources: ReadonlyMap<string, string>,
): ParsedReport {
	const undecided = undecidedCoverage(obs, documents.length);
	if (undecided) return undecided;
	if (introduced === null) return unknownIntroducedLines(obs, documents.length);
	const forged = Object.keys(introduced).filter(hasControlCharacter);
	if (forged.length > 0)
		return {
			verdict: "INDETERMINATE",
			facts: { exit_code: obs.exit_code, reports: documents.length },
			notes: [
				`an introduced path carries a control character, so the LCOV report cannot be attributed to the files it names: ${forged
					.slice(0, MAX_NAMED_PATHS)
					.map((path) => JSON.stringify(path))
					.join(", ")}`,
			],
			failures: [],
		};
	const wanted = expectedInLcovReport(introduced);
	const facts: Record<string, unknown> = {
		exit_code: obs.exit_code,
		reports: documents.length,
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
			notes: ["the candidate introduces no line an LCOV report is expected to cover"],
			failures: [],
			findings: [],
		};
	if (documents.length === 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`no LCOV report found at the declared report path, for ${wanted.length} introduced source file(s)`],
			failures: [],
		};
	const measurement = measurementOf(readRecords(documents));
	const unmeasured = wanted.filter((path) => !measurement.files.has(path));
	if (unmeasured.length > 0)
		return {
			verdict: "INDETERMINATE",
			facts: { ...facts, unmeasured_files: unmeasured.length },
			notes: [unmeasuredNote(unmeasured)],
			failures: [],
		};
	const judgement = judgeIntroducedLines(measurement, wanted, introduced);
	const silenced = silencingComments(wanted, introduced, sources);
	const notes: string[] = [];
	if (silenced.earlier.length > 0)
		notes.push(
			`comments that silence coverage were already there before this change and are tolerated: ${silenced.earlier.slice(0, MAX_NAMED_PATHS).join(", ")}`,
		);
	for (const path of new Set(judgement.tolerated.map((line) => line.path))) {
		const lines = judgement.tolerated.filter((line) => line.path === path).map((line) => line.line);
		notes.push(
			`${path}: lines ${lines.join(", ")} were unexecuted before this change and are tolerated: the rule is on the introduced lines, not on a ratio (QLT-04)`,
		);
	}
	return {
		verdict: judgement.uncovered + silenced.findings.length > 0 ? "FAIL" : "PASS",
		facts: {
			...facts,
			measured_lines: judgement.measured,
			uncovered_lines: judgement.uncovered,
			partially_covered_lines: judgement.partial,
			tolerated_uncovered_lines: judgement.tolerated.length,
			silencing_comments: silenced.findings.length,
		},
		notes,
		failures: [],
		findings: [...judgement.findings, ...silenced.findings],
	};
}

/** Judges only the lines the candidate introduced, as the JaCoCo reader does (QLT-04). */
export const LCOV_READER: ReportReader = {
	id: "lcov",
	version: "1.0.0",
	nature: "coverage",
	differential: true,
	located: false,
	async read(run) {
		const docs = await coverageReports(run, "text/plain; charset=utf-8");
		const introduced = run.introduced_lines;
		const sources = await run.sources(introduced === null ? [] : expectedInLcovReport(introduced));
		return parseLcov(run.observation, docs, introduced, sources);
	},
};
