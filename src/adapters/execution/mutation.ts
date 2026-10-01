/**
 * Mutation of the classes a candidate modified (VER-04).
 *
 * Coverage answers "is this line exercised". It does not answer "would a test notice if this line
 * changed". Mutation is the instrument of the second question, and the only one the coverage of the
 * introduced lines cannot reach: a line executed by a suite that asserts nothing about it is covered
 * and unprotected at once.
 *
 * Two boundaries hold this sensor in place. It is not an integration with a mutation tool: the
 * frozen protocol declares a command the generic runner spawns like any other, and what is native
 * here is the reading of the report that run leaves behind. And it judges nothing it did not scope:
 * the run is restricted to the classes the frozen candidate modified, and what blocks is a mutant
 * sitting on a line the candidate wrote. A survivor elsewhere is inherited debt, named and not
 * opposed to the change (QLT-04).
 *
 * Two engines write the report this reads: PIT, scoped to the classes the candidate modified, and
 * Stryker, scoped to the line ranges it introduced. Both are judged by the same rule on the same
 * statuses.
 *
 * Nothing here is declared deterministic by its name. The scope comes from the manifest and the
 * introduced lines, both computed from content-addressed bytes; the run reaches no network beyond
 * loopback, is single-threaded and bounded by a budget of its own; the report path carries no
 * timestamp; and a mutant the engine could not decide is counted as undecided, never as killed. When
 * the budget ends the run before the report is written, the observation is an incident —
 * INDETERMINATE — and the bar this control holds is not lowered to conclude.
 */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { hasControlCharacter } from "../../application/coverage.ts";
import type { IntroducedLines, ProcessObservation } from "../../ports/execution.ts";
import { SCRIPT_DECLARATION_ONLY, SCRIPT_SOURCE, SCRIPT_TEST_SOURCE } from "./lcov.ts";
import {
	buildErrors,
	decodeXml,
	incidentOf,
	MAX_REPORT_BYTES,
	moduleOf,
	resolveSourcePath,
	type ParsedFinding,
	type ParsedReport,
} from "./parsers.ts";
import { readDeclarations } from "./structure.ts";

export const MUTATION_RULE_SURVIVED = "mutation:introduced-line-mutant-survived";
export const MUTATION_RULE_UNCOVERED = "mutation:introduced-line-mutant-not-exercised";

const MAX_MUTATION_FINDINGS = 200;
const MAX_NAMED_PATHS = 10;

/** Compilation units a JVM mutation engine rewrites. */
const MUTABLE_SOURCE = /\.java$/;
/** Declarations without an executable instruction: no mutant is generated from them, and none should. */
const DECLARATION_ONLY = /(^|\/)(module-info|package-info)\.java$/;
/** A test is what kills a mutant; it is never what is mutated. */
const TEST_SOURCE = /(^|\/)src\/test\//;

/** PITest statuses that say a test noticed the change. A timeout is a behaviour the suite imposed. */
const DETECTED = new Set(["KILLED", "TIMED_OUT"]);
/** A mutant that never ran: it is not a defect of the candidate, and it is counted as excluded. */
const NOT_VIABLE = new Set(["NON_VIABLE"]);
/** A mutant the target's own configuration asked the engine to skip: counted, never a finding. */
const IGNORED = new Set(["IGNORED"]);

/** The reports a mutation control reads, and the engine that writes each. */
export type MutationParser = "pitest-xml" | "stryker-json";

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
 * Introduced paths whose classes a mutation run is scoped to. A test, a POM or a resource is not
 * what an engine mutates, and a declaration without an instruction produces no mutant.
 */
export function mutableIntroducedPaths(introduced: IntroducedLines): string[] {
	return Object.keys(introduced)
		.filter((path) => MUTABLE_SOURCE.test(path) && !DECLARATION_ONLY.test(path) && !TEST_SOURCE.test(path))
		.sort();
}

export interface MutationScope {
	/** Class patterns the run is restricted to, ascending: the type of each source, and its nested types. */
	classes: string[];
	/** Workspace-relative sources those patterns stand for, ascending. */
	paths: string[];
	/** Paths left out, with the reason: the control must know what it did not scope. */
	notes: string[];
	/** Paths the engine would read as a pattern: none can be designated to it, and the run is not made. */
	unaddressable: string[];
}

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
function strykerScopeOf(introduced: IntroducedLines): MutationScope {
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

/**
 * The classes a subject introduced, read from the declarations of its own sources. The package of a
 * compilation unit is what the file declares, never what its directory suggests: a source root the
 * target lays out differently would otherwise scope the run onto a class that does not exist, and a
 * run that mutates nothing is indistinguishable from a suite that kills everything.
 */
export async function mutationScopeOf(
	workspacePath: string,
	introduced: IntroducedLines,
	parser: MutationParser = "pitest-xml",
): Promise<MutationScope> {
	if (parser === "stryker-json") return strykerScopeOf(introduced);
	const root = resolve(workspacePath);
	const paths: string[] = [];
	const classes: string[] = [];
	const notes: string[] = [];
	for (const path of mutableIntroducedPaths(introduced)) {
		const absolute = resolve(root, path);
		if (!absolute.startsWith(`${root}/`)) {
			notes.push(`${path} escapes the workspace and was not scoped`);
			continue;
		}
		let text: string;
		try {
			text = await readFile(absolute, "utf8");
		} catch (error) {
			notes.push(`unreadable source ${path}: ${(error as Error).message}; its classes were not mutated`);
			continue;
		}
		const declared = readDeclarations(path, text).package_name;
		const name = basename(path).replace(MUTABLE_SOURCE, "");
		const type = declared ? `${declared}.${name}` : name;
		paths.push(path);
		classes.push(type, `${type}$*`);
	}
	return { classes: [...new Set(classes)].sort(), paths, notes, unaddressable: [] };
}

export interface MutationReportDocument {
	/** Workspace-relative path of the report, which names the module it comes from. */
	name: string;
	text: string;
	/** Size of a report left unread because it passed the read bound: its `text` is then empty. */
	oversized_bytes?: number;
}

export interface Mutant {
	status: string;
	/** Workspace-relative source the mutant sits in; a mutant naming no scoped path is not kept. */
	path: string;
	line: number;
	/** Short name of the operator applied, `MathMutator` rather than its package. */
	mutator: string;
	mutated_class: string;
	mutated_method: string;
	description: string;
}

/** Text of a child element, with the five XML entities decoded. */
function tagText(body: string, name: string): string {
	const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(body);
	return m ? decodeXml(m[1]!).trim() : "";
}

/** An attribute value. The engine quotes its own attributes with apostrophes, the XML header with quotes. */
function attr(attrs: string, name: string): string {
	const m = new RegExp(`\\b${name}=("([^"]*)"|'([^']*)')`).exec(attrs);
	return m ? decodeXml(m[2] ?? m[3] ?? "") : "";
}

/**
 * What the engine prints when the scope it was given holds nothing to mutate. It then writes no
 * report at all, and the two cases that produce none must not be confused: a run that completed and
 * had nothing to say about an interface or a constant holder, and a run whose report is missing.
 */
const NO_MUTANT_GENERATED = /No mutations found/;

/**
 * A document the mutation engine wrote in full. The report is written once the analysis is over, so
 * its closing element is the proof that every mutant of the scope was run — and the difference
 * between a run the target's own threshold ended non-zero and a build that broke before mutating
 * anything.
 */
function isCompleteMutationReport(text: string): boolean {
	return text.includes("<mutations") && text.includes("</mutations>");
}

export interface MutationSummary {
	mutants: Mutant[];
	/** Mutants naming a class outside the scope, which this control has nothing to say about. */
	out_of_scope: number;
	notes: string[];
}

/**
 * Reads the mutation reports and keeps the mutants sitting in `paths`. The source a mutant names is
 * resolved the same way a coverage report is: from the package of the mutated class and the source
 * file it names, looked up among the paths the candidate touched, one match or nothing.
 */
function summarizeMutations(documents: readonly MutationReportDocument[], paths: readonly string[]): MutationSummary {
	const mutants: Mutant[] = [];
	const ambiguous = new Set<string>();
	let outOfScope = 0;
	for (const doc of documents) {
		const module = moduleOf(doc.name);
		for (const element of doc.text.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/g)) {
			const body = element[2] ?? "";
			const mutatedClass = tagText(body, "mutatedClass");
			const sourcefile = tagText(body, "sourceFile");
			// A nested type is declared in the source of the type that holds it: `a.b.C$D` is `a/b/C.java`.
			const outer = mutatedClass.split("$")[0] ?? "";
			const at = outer.lastIndexOf(".");
			const packageName = at > 0 ? outer.slice(0, at).split(".").join("/") : "";
			const resolved = sourcefile
				? resolveSourcePath(module, packageName, sourcefile, paths)
				: { path: null, ambiguous: false };
			if (resolved.ambiguous) {
				ambiguous.add(packageName ? `${packageName}/${sourcefile}` : sourcefile);
				continue;
			}
			if (!resolved.path) {
				outOfScope++;
				continue;
			}
			const mutator = tagText(body, "mutator");
			mutants.push({
				status: attr(element[1] ?? "", "status") || "UNKNOWN",
				path: resolved.path,
				line: Number.parseInt(tagText(body, "lineNumber"), 10) || 0,
				mutator: mutator.slice(mutator.lastIndexOf(".") + 1) || "unnamed operator",
				mutated_class: mutatedClass,
				mutated_method: tagText(body, "mutatedMethod"),
				description: tagText(body, "description"),
			});
		}
	}
	const notes = [...ambiguous]
		.sort()
		.map(
			(name) => `${name} matches several scoped paths: the mutants of that source cannot be attributed to one of them`,
		);
	return { mutants, out_of_scope: outOfScope, notes };
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

const STRYKER_REPORT_PATH = "reports/mutation/mutation.json";

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
function summarizeStryker(documents: readonly MutationReportDocument[]): MutationSummary {
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
function unreadableStrykerReport(doc: MutationReportDocument): string | null {
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
	documents: readonly MutationReportDocument[],
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

/** What the control answers when nobody computed what the subject introduced: nothing is run. */
export function unscopedMutation(): ParsedReport {
	return {
		verdict: "INDETERMINATE",
		facts: { scoped_classes: 0, scoped_files: 0 },
		notes: [
			"no introduced-line set was given: a mutation run nobody could scope would mutate the whole tree on the budget of one change",
		],
		failures: [],
	};
}

/** What the control answers when a path it must mutate cannot be designated to the engine: nothing is run. */
export function unaddressableMutation(scope: MutationScope): ParsedReport {
	return {
		verdict: "INDETERMINATE",
		facts: { scoped_files: scope.paths.length, unaddressable_files: scope.unaddressable.length },
		notes: [
			`${scope.unaddressable.length} introduced path(s) cannot be designated to the engine, which reads a scope as a pattern, and no run was made: ${scope.unaddressable.join(", ")}`,
			...scope.notes,
		],
		failures: [],
	};
}

/**
 * What the control answers when the subject introduces no class to mutate — a reference pass, or a
 * change that touched no compilation unit. Nothing is spawned: the budget of this control is the
 * reason it exists, and a run with an empty scope would spend it to observe nothing.
 */
export function nothingToMutate(scope: MutationScope): ParsedReport {
	return {
		verdict: "PASS",
		facts: { scoped_classes: 0, scoped_files: 0, mutants: 0, reports: 0 },
		notes: ["the subject introduces no class this sensor mutates: no mutation run was spawned", ...scope.notes],
		failures: [],
		findings: [],
	};
}

/**
 * Surviving mutants on the lines the candidate wrote (VER-04).
 *
 * What blocks is a mutant of an introduced line that nothing noticed: the suite executes that line
 * and would keep its verdict if the line changed. A survivor on a line the candidate did not write
 * is debt of the touched class, counted and named, never opposed to the change. A mutant the engine
 * could not decide — it ran out of memory, it crashed — is undecided, and an undecided mutant on an
 * introduced line leaves the control INDETERMINATE rather than granting it a pass.
 *
 * A score is never presented as a defect. What the evidence carries is the operator, the method and
 * the line of each mutant that survived, so that an equivalent mutant can be recognised as such
 * instead of being hidden inside a ratio.
 */
export function analyzeMutation(
	obs: ProcessObservation,
	documents: readonly MutationReportDocument[] | null,
	introduced: IntroducedLines | null,
	scope: MutationScope,
	output = "",
	parser: MutationParser = "pitest-xml",
): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) {
		const budget = obs.timed_out
			? [
					"the mutation budget ended the run before the report was written: the proof this control owes is missing, and no threshold is lowered to conclude without it (VER-04)",
				]
			: [];
		return {
			verdict: "INDETERMINATE",
			facts: {
				exit_code: obs.exit_code,
				incident,
				scoped_classes: scope.classes.length,
				scoped_files: scope.paths.length,
			},
			notes: [incident, ...budget],
			failures: [],
		};
	}
	if (introduced === null) return unscopedMutation();
	if (scope.unaddressable.length > 0) return unaddressableMutation(scope);
	if (scope.paths.length === 0) return nothingToMutate(scope);

	const isComplete =
		parser === "stryker-json" ? (text: string) => "report" in readStrykerReport(text) : isCompleteMutationReport;
	const complete = (documents ?? []).filter((doc) => isComplete(doc.text));
	const facts: Record<string, unknown> = {
		exit_code: obs.exit_code,
		reports: complete.length,
		scoped_classes: scope.classes.length,
		scoped_files: scope.paths.length,
	};
	if (complete.length === 0 && parser === "stryker-json")
		return withoutStrykerReport(obs, documents ?? [], facts, output);
	if (complete.length === 0) {
		// The report is written once the analysis is over. Without one, a non-zero exit is a build that
		// broke on the frozen tree — a reproducible property of the candidate, not an incident.
		if (obs.exit_code !== 0) {
			const errors = buildErrors(output);
			return {
				verdict: "FAIL",
				facts,
				notes: [`the mutation run exited with ${obs.exit_code} before writing a report`],
				failures: errors.length > 0 ? errors : [`exit code ${obs.exit_code}`],
			};
		}
		// A run that completed and states it generated nothing wrote no report because there was nothing
		// to write: an interface, a record or a constant holder carries no instruction to mutate. That is
		// a fact about the scoped classes, and this control has nothing to conclude about them.
		if (NO_MUTANT_GENERATED.test(output))
			return {
				verdict: "PASS",
				facts: { ...facts, mutants: 0, introduced_mutants: 0 },
				notes: [
					`the engine generated no mutant on the ${scope.paths.length} scoped source file(s): this control has nothing to conclude on them`,
					...scope.notes,
				],
				failures: [],
				findings: [],
			};
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [
				`no complete mutation report at the declared report path, for ${scope.paths.length} scoped source file(s): ${scope.paths.slice(0, MAX_NAMED_PATHS).join(", ")}`,
				...scope.notes,
			],
			failures: [],
		};
	}

	const summary = parser === "stryker-json" ? summarizeStryker(complete) : summarizeMutations(complete, scope.paths);
	const written = new Map(Object.entries(introduced).map(([path, lines]) => [path, new Set(lines)] as const));
	const wroteLine = (path: string, line: number) => written.get(path)?.has(line) ?? false;
	const statuses: Record<string, number> = {};
	const findings: ParsedFinding[] = [];
	const undecided: string[] = [];
	let undecidedCount = 0;
	let onIntroduced = 0;
	let killed = 0;
	let excluded = 0;
	let ignored = 0;
	let inherited = 0;
	for (const mutant of summary.mutants) {
		statuses[mutant.status] = (statuses[mutant.status] ?? 0) + 1;
		const method = mutant.mutated_method ? `${mutant.mutated_class}.${mutant.mutated_method}` : mutant.mutated_class;
		if (!wroteLine(mutant.path, mutant.line)) {
			if (!DETECTED.has(mutant.status) && !NOT_VIABLE.has(mutant.status) && !IGNORED.has(mutant.status)) inherited++;
			continue;
		}
		onIntroduced++;
		if (DETECTED.has(mutant.status)) {
			killed++;
			continue;
		}
		if (NOT_VIABLE.has(mutant.status)) {
			excluded++;
			continue;
		}
		if (IGNORED.has(mutant.status)) {
			ignored++;
			continue;
		}
		if (mutant.status === "SURVIVED" || mutant.status === "NO_COVERAGE") {
			const rule = mutant.status === "SURVIVED" ? MUTATION_RULE_SURVIVED : MUTATION_RULE_UNCOVERED;
			const what = mutant.status === "SURVIVED" ? "no test notices" : "no test exercises";
			const described = mutant.description || `${mutant.mutator} applied`;
			if (findings.length < MAX_MUTATION_FINDINGS)
				findings.push({
					rule_id: rule,
					category: "quality",
					severity: "blocker",
					message: `${mutant.path}:${mutant.line} introduced line whose mutation ${what}: ${described} (${mutant.mutator})${method ? ` in ${method}` : ""}`,
					symbol: method || null,
				});
			continue;
		}
		undecidedCount++;
		if (undecided.length < MAX_NAMED_PATHS)
			undecided.push(`${mutant.path}:${mutant.line} ${mutant.status} (${mutant.mutator})`);
	}

	const notes = [...summary.notes, ...scope.notes];
	if (obs.exit_code !== 0)
		notes.push(
			`the mutation run exited with ${obs.exit_code} after writing a complete report: a threshold the target sets over everything it mutated is a ratio, and a ratio is not what is opposed to this candidate (QLT-04)`,
		);
	if (onIntroduced === 0)
		notes.push(
			`the engine generated no mutant on the introduced lines of ${scope.paths.length} scoped source file(s): this control has nothing to conclude on them`,
		);
	if (excluded > 0)
		notes.push(
			`${excluded} mutant(s) of the introduced lines never ran and are excluded: a mutant the engine reports as non-viable is not a defect`,
		);
	if (ignored > 0)
		notes.push(
			`${ignored} mutant(s) of the introduced lines are ignored by the target's own configuration: counted, never a finding`,
		);
	if (inherited > 0)
		notes.push(
			`${inherited} mutant(s) survive on lines of the scoped classes this subject did not write: counted as debt of those classes, never opposed to the candidate (QLT-04)`,
		);
	if (summary.out_of_scope > 0)
		notes.push(`${summary.out_of_scope} mutant(s) name a class outside the scope of this run and were left aside`);
	if (findings.length >= MAX_MUTATION_FINDINGS) notes.push(`findings reduced to the first ${MAX_MUTATION_FINDINGS}`);
	if (undecidedCount > 0)
		notes.push(
			`the engine could not decide ${undecidedCount} mutant(s) of the introduced lines: ${undecided.join(", ")}`,
		);

	const survived = findings.length;
	const allFacts = {
		...facts,
		mutants: summary.mutants.length,
		introduced_mutants: onIntroduced,
		killed_mutants: killed,
		surviving_mutants: survived,
		excluded_mutants: excluded,
		ignored_mutants: ignored,
		undecided_mutants: undecidedCount,
		inherited_survivors: inherited,
		out_of_scope_mutants: summary.out_of_scope,
		statuses,
	};
	if (survived > 0) return { verdict: "FAIL", facts: allFacts, notes, failures: [], findings };
	if (undecidedCount > 0) return { verdict: "INDETERMINATE", facts: allFacts, notes, failures: [], findings };
	return { verdict: "PASS", facts: allFacts, notes, failures: [], findings: [] };
}
