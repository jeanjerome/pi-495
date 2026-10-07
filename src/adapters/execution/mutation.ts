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
 * Each engine is read by the reader its technology brings: PIT, scoped to the classes the candidate
 * modified, and Stryker, scoped to the line ranges it introduced. Both are judged here, by the same rule
 * on the same statuses.
 *
 * Nothing here is declared deterministic by its name. The scope comes from the manifest and the
 * introduced lines, both computed from content-addressed bytes; the run reaches no network beyond
 * loopback, is single-threaded and bounded by a budget of its own; the report path carries no
 * timestamp; and a mutant the engine could not decide is counted as undecided, never as killed. When
 * the budget ends the run before the report is written, the observation is an incident —
 * INDETERMINATE — and the bar this control holds is not lowered to conclude.
 */
import { SCOPE_PLACEHOLDER, type ControlDefinition } from "../../contracts/v1/protocol.ts";
import type {
	IntroducedLines,
	ParsedFinding,
	ParsedReport,
	ProcessObservation,
	ReaderPreparation,
	ReportDocument,
	ReportReader,
	WorkspaceFiles,
} from "../../ports/execution.ts";
import { silencingComments, type SilencingRule } from "./lcov.ts";
import { incidentOf, incidentReport, MAX_NAMED_PATHS } from "./parsers.ts";

export const MUTATION_RULE_SURVIVED = "mutation:introduced-line-mutant-survived";
export const MUTATION_RULE_UNCOVERED = "mutation:introduced-line-mutant-not-exercised";

const MAX_MUTATION_FINDINGS = 200;

/** Statuses that say a test noticed the change, in PIT's words, which every engine is read in. A timeout is a behaviour the suite imposed. */
const DETECTED = new Set(["KILLED", "TIMED_OUT"]);
/** A mutant that never ran: it is not a defect of the candidate, and it is counted as excluded. */
const NOT_VIABLE = new Set(["NON_VIABLE"]);
/** A mutant the target's own configuration asked the engine to skip: counted, never a finding. */
const IGNORED = new Set(["IGNORED"]);

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

export interface MutationSummary {
	mutants: Mutant[];
	/** Mutants naming a class outside the scope, which this control has nothing to say about. */
	out_of_scope: number;
	notes: string[];
}

/**
 * What reading the run of one mutation engine takes: the scope it is given, the reports it leaves, and what
 * the control answers when it left no complete one. Everything else is judged the same way for every
 * engine.
 */
export interface MutationEngine {
	/** The scope a run is restricted to, from what the subject introduced. */
	scopeOf(files: Pick<WorkspaceFiles, "text">, introduced: IntroducedLines): Promise<MutationScope>;
	/** The reports a run left, read by the runner. */
	reports(files: WorkspaceFiles): Promise<ReportDocument[]>;
	/** Whether a document is a report the engine wrote in full. */
	isComplete(text: string): boolean;
	/** The mutants of the complete reports, those naming a source outside `paths` left aside. */
	summarize(documents: readonly ReportDocument[], paths: readonly string[]): MutationSummary;
	/** What the control answers when the run left no complete report. */
	withoutReport(
		obs: ProcessObservation,
		documents: readonly ReportDocument[],
		facts: Record<string, unknown>,
		output: string,
		scope: MutationScope,
	): ParsedReport;
	/**
	 * The comment that silences the engine on the lines under it, which only the introduced sources show;
	 * absent for an engine the source cannot silence.
	 */
	silencing?: { rule: SilencingRule; engine: string };
}

/** What the control answers when nobody computed what the subject introduced: nothing is run. */
function unscopedMutation(): ParsedReport {
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
function unaddressableMutation(scope: MutationScope): ParsedReport {
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
function nothingToMutate(scope: MutationScope): ParsedReport {
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
	documents: readonly ReportDocument[] | null,
	introduced: IntroducedLines | null,
	scope: MutationScope,
	output: string,
	engine: MutationEngine,
	sources: ReadonlyMap<string, string> = new Map(),
): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) {
		const budget = obs.timed_out
			? [
					"the mutation budget ended the run before the report was written: the proof this control owes is missing, and no threshold is lowered to conclude without it (VER-04)",
				]
			: [];
		return incidentReport(
			obs,
			incident,
			{ scoped_classes: scope.classes.length, scoped_files: scope.paths.length },
			budget,
		);
	}
	if (introduced === null) return unscopedMutation();
	if (scope.unaddressable.length > 0) return unaddressableMutation(scope);
	if (scope.paths.length === 0) return nothingToMutate(scope);

	const complete = (documents ?? []).filter((doc) => engine.isComplete(doc.text));
	const facts: Record<string, unknown> = {
		exit_code: obs.exit_code,
		reports: complete.length,
		scoped_classes: scope.classes.length,
		scoped_files: scope.paths.length,
	};
	if (complete.length === 0) return engine.withoutReport(obs, documents ?? [], facts, output, scope);

	const summary = engine.summarize(complete, scope.paths);
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

	const silenced = engine.silencing
		? silencingComments(scope.paths, introduced, sources, engine.silencing.rule)
		: { findings: [], earlier: [] };

	const notes = [...summary.notes, ...scope.notes];
	if (silenced.earlier.length > 0)
		notes.push(
			`comments that silence ${engine.silencing?.engine} were already there before this change and are tolerated: ${silenced.earlier.slice(0, MAX_NAMED_PATHS).join(", ")}`,
		);
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
		silencing_comments: silenced.findings.length,
		statuses,
	};
	if (survived + silenced.findings.length > 0)
		return { verdict: "FAIL", facts: allFacts, notes, failures: [], findings: [...findings, ...silenced.findings] };
	if (undecidedCount > 0) return { verdict: "INDETERMINATE", facts: allFacts, notes, failures: [], findings };
	return { verdict: "PASS", facts: allFacts, notes, failures: [], findings: [] };
}

/**
 * An expensive control is scoped to what the subject introduced before anything is spawned. The two cases
 * that decide themselves without a run are the reason the scope is computed first: a subject that
 * introduces no class has nothing to mutate, and a subject whose lines nobody established would be
 * mutated whole, on the budget of one change (VER-04).
 */
async function prepareMutation(
	control: ControlDefinition,
	introduced: IntroducedLines | null,
	files: WorkspaceFiles,
	engine: MutationEngine,
): Promise<ReaderPreparation> {
	if (introduced === null) return { decided: unscopedMutation() };
	const scope = await engine.scopeOf(files, introduced);
	if (scope.unaddressable.length > 0) return { decided: unaddressableMutation(scope) };
	if (scope.paths.length === 0) return { decided: nothingToMutate(scope) };
	if (control.scope_argument === null) return { arguments: [] };
	return { arguments: [control.scope_argument.split(SCOPE_PLACEHOLDER).join(scope.classes.join(","))] };
}

/**
 * The reader of an engine's report: the run is scoped before it is spawned, and what it left is judged on
 * the lines the candidate wrote. The scope is computed again from the same introduced lines when the
 * report is read: a run that was spawned had them, since the preparation decides every subject without.
 */
export function mutationReader(id: string, engine: MutationEngine): ReportReader {
	return {
		id,
		version: "1.0.0",
		nature: "mutation",
		differential: true,
		located: false,
		prepare: (control, introduced, files) => prepareMutation(control, introduced, files, engine),
		async read(run) {
			if (run.introduced_lines === null) return unscopedMutation();
			const scope = await engine.scopeOf(run, run.introduced_lines);
			const docs = await engine.reports(run);
			return analyzeMutation(
				run.observation,
				docs,
				run.introduced_lines,
				scope,
				`${run.stdout}\n${run.stderr}`,
				engine,
				engine.silencing ? await run.sources(scope.paths) : new Map(),
			);
		},
	};
}
