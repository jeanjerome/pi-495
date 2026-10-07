/**
 * Native structural analysis of a Java source tree (ARC-04, CON-03).
 *
 * The register of references settled the multi-language question: a native analyser per ecosystem
 * behind a common finding envelope, never a universal semantic engine. This is the Java one. It
 * reads the `package` and `import` declarations of the sources under the scopes the frozen rules
 * name — it compiles nothing, resolves no type and runs no build — and states what those
 * declarations say about the boundaries the protocol froze.
 *
 * An adopted architecture that lives only in the producer's context is an instruction, submitted to
 * the same inference as the code it is supposed to constrain. Here it lives in the protocol, where
 * the producer cannot reach it, and a control observes its effects on the tree the producer wrote.
 *
 * What blocks is what the candidate wrote: a violation on an introduced line fails the control,
 * while a violation it did not write is reported at its exact place and left to the comparison
 * against the reference, which names it `preexisting` (VER-08, QLT-04).
 */
import type { StructureRule } from "../../../../contracts/v1/protocol.ts";
import type {
	IntroducedLines,
	ParsedFinding,
	ParsedReport,
	ProcessObservation,
	ReportReader,
	WorkspaceFiles,
} from "../../../../ports/execution.ts";
import { incidentOf, incidentReport } from "../../../execution/parsers.ts";
import { readDeclarations, type JavaSource } from "../project/java-declarations.ts";

const MAX_STRUCTURE_FINDINGS = 200;

export interface SourceRead {
	sources: JavaSource[];
	notes: string[];
}

/** Every `.java` file under the declared scopes of the frozen rules, read once by the runner, sorted by path. */
export async function readJavaSources(files: WorkspaceFiles, scopes: readonly string[]): Promise<SourceRead> {
	const tree = await files.tree(scopes, ".java");
	return { sources: tree.files.map((f) => readDeclarations(f.path, f.text)), notes: tree.notes };
}

/** Whether an imported name falls under a forbidden prefix. A prefix ending in `.` is a family. */
export function underPrefix(name: string, prefix: string): boolean {
	if (prefix.endsWith(".")) return name.startsWith(prefix);
	return name === prefix || name.startsWith(`${prefix}.`);
}

function inScope(path: string, scopes: readonly string[]): boolean {
	return scopes.some((scope) =>
		scope.endsWith("/") ? path.startsWith(scope) : path === scope || path.startsWith(`${scope}/`),
	);
}

/**
 * The declared package an imported name belongs to: the longest package the analysed tree declares
 * and that the name extends. A static import and a nested type both name something below their
 * package, and neither can be told apart from a package by its spelling alone.
 */
export function owningPackage(name: string, declared: readonly string[]): string | null {
	let found: string | null = null;
	for (const candidate of declared) {
		if (name !== candidate && !name.startsWith(`${candidate}.`)) continue;
		if (found === null || candidate.length > found.length) found = candidate;
	}
	return found;
}

export interface PackageEdge {
	from: string;
	to: string;
	path: string;
	line: number;
}

/** Every dependency between two packages the tree declares, with the import that establishes it. */
export function packageEdges(sources: readonly JavaSource[]): PackageEdge[] {
	const declared = [...new Set(sources.map((s) => s.package_name).filter((p): p is string => p !== null))];
	const edges: PackageEdge[] = [];
	for (const source of sources) {
		if (source.package_name === null) continue;
		for (const imported of source.imports) {
			const to = owningPackage(imported.name, declared);
			if (to === null || to === source.package_name) continue;
			edges.push({ from: source.package_name, to, path: source.path, line: imported.line });
		}
	}
	return edges.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

/**
 * Strongly connected components of more than one node, each sorted, the list sorted. Kosaraju, run
 * iteratively: a package graph is small but its depth is not something this analyser gets to assume. Its two
 * passes share the graphs and the finishing order the first one builds, which is why they stay in one function.
 */
export function stronglyConnectedComponents(edges: readonly PackageEdge[]): string[][] {
	const forward = new Map<string, Set<string>>();
	const backward = new Map<string, Set<string>>();
	const add = (graph: Map<string, Set<string>>, from: string, to: string) => {
		if (!graph.has(from)) graph.set(from, new Set());
		if (!graph.has(to)) graph.set(to, new Set());
		graph.get(from)!.add(to);
	};
	for (const edge of edges) {
		add(forward, edge.from, edge.to);
		add(backward, edge.to, edge.from);
	}
	const nodes = [...forward.keys()].sort();
	const order: string[] = [];
	const seen = new Set<string>();
	for (const start of nodes) {
		if (seen.has(start)) continue;
		const stack: { node: string; expanded: boolean }[] = [{ node: start, expanded: false }];
		while (stack.length > 0) {
			const frame = stack.pop()!;
			if (frame.expanded) {
				order.push(frame.node);
				continue;
			}
			if (seen.has(frame.node)) continue;
			seen.add(frame.node);
			stack.push({ node: frame.node, expanded: true });
			for (const next of [...(forward.get(frame.node) ?? [])].sort().reverse())
				if (!seen.has(next)) stack.push({ node: next, expanded: false });
		}
	}
	const assigned = new Set<string>();
	const components: string[][] = [];
	for (let i = order.length - 1; i >= 0; i--) {
		const start = order[i]!;
		if (assigned.has(start)) continue;
		const component: string[] = [];
		const stack = [start];
		assigned.add(start);
		while (stack.length > 0) {
			const node = stack.pop()!;
			component.push(node);
			for (const previous of backward.get(node) ?? [])
				if (!assigned.has(previous)) {
					assigned.add(previous);
					stack.push(previous);
				}
		}
		if (component.length > 1) components.push(component.sort());
	}
	return components.sort((a, b) => a[0]!.localeCompare(b[0]!));
}

/** The lines this subject wrote, as a membership test. */
function introducedIndex(introduced: IntroducedLines): Map<string, Set<number>> {
	const index = new Map<string, Set<number>>();
	for (const [path, lines] of Object.entries(introduced)) index.set(path, new Set(lines));
	return index;
}

/**
 * Structural findings of a Java tree against the frozen rules (ARC-04, CON-03).
 *
 * Every violation is a blocking finding wherever it sits, because the comparison to the reference is
 * what tells an inherited one from an introduced one, and it needs both sides to say the same thing
 * about the same defect. What the scope of the introduced lines decides is the verdict of this pass:
 * a tree whose only violations were already there is not this candidate's failure, and a control
 * that answered otherwise could never be qualified on a target that carries any debt. The early returns are the
 * INDETERMINATE cases, and the loop applies each kind of frozen rule to the same scoped sources and lines.
 */
export function analyzeJavaStructure(
	obs: ProcessObservation,
	sources: readonly JavaSource[],
	rules: readonly StructureRule[],
	introduced: IntroducedLines | null,
	readNotes: readonly string[] = [],
): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return incidentReport(obs, incident);
	const facts: Record<string, unknown> = { exit_code: obs.exit_code, rules: rules.length, sources: sources.length };
	if (obs.exit_code !== 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`the structural sensor exited with ${obs.exit_code} without reading the sources`],
			failures: [],
		};
	if (rules.length === 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: ["no architecture rule is frozen for this target: a structural control without a rule proves nothing"],
			failures: [],
		};
	if (introduced === null)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [
				"no introduced-line set was given: a differential control cannot judge a candidate whose new lines are unknown",
			],
			failures: [],
		};
	if (sources.length === 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`no Java source under the declared scopes, for ${rules.length} frozen rule(s)`, ...readNotes],
			failures: [],
		};

	const written = introducedIndex(introduced);
	const wroteLine = (path: string, line: number) => written.get(path)?.has(line) ?? false;
	const violations: { introduced: boolean; finding: ParsedFinding }[] = [];
	const notes = [...readNotes];
	let cycles = 0;

	for (const rule of rules) {
		if (rule.kind === "forbidden_dependency") {
			for (const source of sources) {
				if (!inScope(source.path, rule.scope)) continue;
				for (const imported of source.imports) {
					const crossed = rule.forbidden.find((prefix) => underPrefix(imported.name, prefix));
					if (crossed === undefined) continue;
					violations.push({
						introduced: wroteLine(source.path, imported.line),
						finding: {
							rule_id: rule.rule_id,
							category: "structure",
							severity: "blocker",
							message: `${source.path}:${imported.line} forbidden import ${imported.name}, ${rule.statement}`,
							symbol: source.package_name,
						},
					});
				}
			}
			continue;
		}
		const scoped = sources.filter((source) => inScope(source.path, rule.scope));
		const edges = packageEdges(scoped);
		for (const component of stronglyConnectedComponents(edges)) {
			cycles++;
			const members = new Set(component);
			const internal = edges.filter((edge) => members.has(edge.from) && members.has(edge.to));
			// The cycle is named where the candidate closed it when it did, and at its first import
			// otherwise: two passes over an untouched cycle must point at the same place to be paired.
			const at = internal.find((edge) => wroteLine(edge.path, edge.line)) ?? internal[0]!;
			violations.push({
				introduced: wroteLine(at.path, at.line),
				finding: {
					rule_id: rule.rule_id,
					category: "structure",
					severity: "blocker",
					message: `${at.path}:${at.line} import ${at.to} closes a dependency cycle between ${component.length} packages (${component.join(", ")}), ${rule.statement}`,
					symbol: at.from,
				},
			});
		}
	}

	const introducedViolations = violations.filter((v) => v.introduced).length;
	const inherited = violations.length - introducedViolations;
	if (inherited > 0)
		notes.push(
			`${inherited} violation(s) sit on lines this subject did not write: reported at their exact place for the comparison to the reference, never opposed to the candidate (QLT-04)`,
		);
	if (violations.length > MAX_STRUCTURE_FINDINGS)
		notes.push(`${violations.length} findings reduced to the first ${MAX_STRUCTURE_FINDINGS}`);
	return {
		verdict: introducedViolations > 0 ? "FAIL" : "PASS",
		facts: {
			...facts,
			packages: new Set(sources.map((s) => s.package_name).filter((p) => p !== null)).size,
			violations: violations.length,
			introduced_violations: introducedViolations,
			inherited_violations: inherited,
			cycles,
		},
		notes,
		failures: [],
		findings: violations.slice(0, MAX_STRUCTURE_FINDINGS).map((v) => v.finding),
	};
}

/** Judges the package and import declarations of the Java sources against the frozen architecture rules (ARC-04, CON-03); it compiles nothing. */
export const JAVA_IMPORTS_READER: ReportReader = {
	id: "java-imports",
	version: "1.0.0",
	nature: "structure",
	differential: true,
	located: false,
	// The architecture rules are the ones the protocol froze, never a file of the tree the producer could
	// edit. The sensor runs no analysis of its own beyond reading the package and import declarations of
	// the sources those rules scope (ARC-04, CON-03).
	async read(run) {
		const rules = run.control.structure_rules;
		const read = await readJavaSources(
			run,
			rules.flatMap((rule) => rule.scope),
		);
		return analyzeJavaStructure(run.observation, read.sources, rules, run.introduced_lines, read.notes);
	},
};
