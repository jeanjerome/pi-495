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
 * Nothing here is declared deterministic by its name. The scope comes from the manifest and the
 * introduced lines, both computed from content-addressed bytes; the run is offline, single-threaded
 * and bounded by a budget of its own; the report path carries no timestamp; and a mutant the engine
 * could not decide is counted as undecided, never as killed. When the budget ends the run before the
 * report is written, the observation is an incident — INDETERMINATE — and the bar this control holds
 * is not lowered to conclude.
 */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { IntroducedLines, ProcessObservation } from "../../ports/execution.ts";
import {
	buildErrors,
	decodeXml,
	incidentOf,
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
}

/**
 * The classes a subject introduced, read from the declarations of its own sources. The package of a
 * compilation unit is what the file declares, never what its directory suggests: a source root the
 * target lays out differently would otherwise scope the run onto a class that does not exist, and a
 * run that mutates nothing is indistinguishable from a suite that kills everything.
 */
export async function mutationScopeOf(workspacePath: string, introduced: IntroducedLines): Promise<MutationScope> {
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
	return { classes: [...new Set(classes)].sort(), paths, notes };
}

export interface PitestDocument {
	/** Workspace-relative path of the report, which names the module it comes from. */
	name: string;
	text: string;
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
function summarizeMutations(documents: readonly PitestDocument[], paths: readonly string[]): MutationSummary {
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
	documents: readonly PitestDocument[] | null,
	introduced: IntroducedLines | null,
	scope: MutationScope,
	output = "",
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
	if (scope.paths.length === 0) return nothingToMutate(scope);

	const complete = (documents ?? []).filter((doc) => isCompleteMutationReport(doc.text));
	const facts: Record<string, unknown> = {
		exit_code: obs.exit_code,
		reports: complete.length,
		scoped_classes: scope.classes.length,
		scoped_files: scope.paths.length,
	};
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

	const summary = summarizeMutations(complete, scope.paths);
	const written = new Map(Object.entries(introduced).map(([path, lines]) => [path, new Set(lines)] as const));
	const wroteLine = (path: string, line: number) => written.get(path)?.has(line) ?? false;
	const statuses: Record<string, number> = {};
	const findings: ParsedFinding[] = [];
	const undecided: string[] = [];
	let undecidedCount = 0;
	let onIntroduced = 0;
	let killed = 0;
	let excluded = 0;
	let inherited = 0;
	for (const mutant of summary.mutants) {
		statuses[mutant.status] = (statuses[mutant.status] ?? 0) + 1;
		const method = mutant.mutated_method ? `${mutant.mutated_class}.${mutant.mutated_method}` : mutant.mutated_class;
		if (!wroteLine(mutant.path, mutant.line)) {
			if (!DETECTED.has(mutant.status) && !NOT_VIABLE.has(mutant.status)) inherited++;
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
		if (mutant.status === "SURVIVED" || mutant.status === "NO_COVERAGE") {
			const rule = mutant.status === "SURVIVED" ? MUTATION_RULE_SURVIVED : MUTATION_RULE_UNCOVERED;
			const what = mutant.status === "SURVIVED" ? "no test notices" : "no test exercises";
			const described = mutant.description || `${mutant.mutator} applied`;
			if (findings.length < MAX_MUTATION_FINDINGS)
				findings.push({
					rule_id: rule,
					category: "quality",
					severity: "blocker",
					message: `${mutant.path}:${mutant.line} introduced line whose mutation ${what}: ${described} (${mutant.mutator}) in ${method}`,
					symbol: method,
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
		undecided_mutants: undecidedCount,
		inherited_survivors: inherited,
		out_of_scope_mutants: summary.out_of_scope,
		statuses,
	};
	if (survived > 0) return { verdict: "FAIL", facts: allFacts, notes, failures: [], findings };
	if (undecidedCount > 0) return { verdict: "INDETERMINATE", facts: allFacts, notes, failures: [], findings };
	return { verdict: "PASS", facts: allFacts, notes, failures: [], findings: [] };
}
