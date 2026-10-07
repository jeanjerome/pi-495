/**
 * The reader of PIT's XML report, the mutation engine of a Maven target: its run is scoped to the classes
 * the candidate modified, read from the declarations of their sources, and the mutants it reports are
 * judged on the lines the candidate wrote (VER-04).
 */
import { basename } from "node:path";
import { messageOf } from "../../../domain/errors.ts";
import type {
	IntroducedLines,
	ParsedReport,
	ProcessObservation,
	ReportDocument,
	ReportReader,
	WorkspaceFiles,
} from "../../../ports/execution.ts";
import {
	mutationReader,
	type Mutant,
	type MutationEngine,
	type MutationScope,
	type MutationSummary,
} from "../../execution/mutation.ts";
import { buildErrors, decodeXml, MAX_NAMED_PATHS } from "../../execution/parsers.ts";
import { readDeclarations } from "./java-declarations.ts";
import { JVM_DECLARATION_ONLY, JVM_TEST_SOURCE, moduleOf, resolveSourcePath } from "./jvm-sources.ts";

/** Compilation units a JVM mutation engine rewrites. */
const MUTABLE_SOURCE = /\.java$/;

/**
 * Introduced paths whose classes a mutation run is scoped to. A test, a POM or a resource is not
 * what an engine mutates, and a declaration without an instruction produces no mutant.
 */
export function mutableIntroducedPaths(introduced: IntroducedLines): string[] {
	return Object.keys(introduced)
		.filter((path) => MUTABLE_SOURCE.test(path) && !JVM_DECLARATION_ONLY.test(path) && !JVM_TEST_SOURCE.test(path))
		.sort();
}

/**
 * The classes a subject introduced, read from the declarations of its own sources. The package of a
 * compilation unit is what the file declares, never what its directory suggests: a source root the
 * target lays out differently would otherwise scope the run onto a class that does not exist, and a
 * run that mutates nothing is indistinguishable from a suite that kills everything.
 */
export async function pitestScopeOf(
	files: Pick<WorkspaceFiles, "text">,
	introduced: IntroducedLines,
): Promise<MutationScope> {
	const paths: string[] = [];
	const classes: string[] = [];
	const notes: string[] = [];
	for (const path of mutableIntroducedPaths(introduced)) {
		let text: string;
		try {
			text = await files.text(path);
		} catch (error) {
			notes.push(`unreadable source ${path}: ${messageOf(error)}; its classes were not mutated`);
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

/**
 * Reads the mutation reports and keeps the mutants sitting in `paths`. The source a mutant names is
 * resolved the same way a coverage report is: from the package of the mutated class and the source
 * file it names, looked up among the paths the candidate touched, one match or nothing.
 */
function summarizeMutations(documents: readonly ReportDocument[], paths: readonly string[]): MutationSummary {
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

/**
 * What the control answers when PIT left no complete report. The report is written once the analysis is
 * over: without one, a non-zero exit is a build that broke on the frozen tree — a reproducible property of
 * the candidate, not an incident.
 */
function withoutPitestReport(
	obs: ProcessObservation,
	_documents: readonly ReportDocument[],
	facts: Record<string, unknown>,
	output: string,
	scope: MutationScope,
): ParsedReport {
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

/**
 * PIT, scoped to the classes of the frozen candidate: the run mutates those and nothing else, and what is
 * read back is the report it left at the stable path the target declares.
 */
export const PITEST_ENGINE: MutationEngine = {
	scopeOf: pitestScopeOf,
	reports: (files) => files.reports("application/xml"),
	isComplete: isCompleteMutationReport,
	summarize: summarizeMutations,
	withoutReport: withoutPitestReport,
};

/** Judges the mutants sitting on the lines the candidate wrote (VER-04). */
export const PITEST_READER: ReportReader = mutationReader("pitest-xml", PITEST_ENGINE);
