/**
 * The reader of the JSON output of dependency-cruiser 18.5.0 for the rules of an adopted architecture map: one
 * finding per violation, whatever severity dependency-cruiser gives it, named by the rule of the map it breaks,
 * the file it starts from and the line of the import, over the whole tree. The output names the importing file and the path it writes (`unresolvedTo`),
 * never the line: the line is the first one of that file that writes the path between quotes. A cycle is given
 * at the file of the cycle it is reported from, a source no part covers at its file. An output that is absent,
 * that cannot be read, or where dependency-cruiser read no source concludes nothing: a pass that read nothing
 * never reads as an architecture kept.
 */
import { messageOf } from "../../../../domain/errors.ts";
import type { ParsedFinding, ParsedReport, ReportReader, WorkspaceFiles } from "../../../../ports/execution.ts";
import { incidentOf, incidentReport } from "../../../execution/parsers.ts";
import { escapedForPattern } from "../shared.ts";
import { dependencyCruiserRules } from "./dependency-cruiser-rules.ts";

interface Violation {
	type?: string;
	from: string;
	to: string;
	unresolvedTo?: string;
	rule: { name: string };
	cycle?: { name: string }[];
}

/** What a run of dependency-cruiser read: the sources it parsed, and the violations of the rules it was given. */
interface Cruise {
	sources: number;
	violations: Violation[];
}

/** The sources and violations of an output; throws on an output of another shape. */
function cruiseOf(output: unknown): Cruise {
	const { modules, summary } = (output ?? {}) as { modules?: unknown; summary?: { violations?: unknown } };
	if (!Array.isArray(modules)) throw new Error("it lists no modules");
	if (!Array.isArray(summary?.violations)) throw new Error("its summary lists no violations");
	const violations = summary.violations as Partial<Violation>[];
	if (violations.some((v) => typeof v?.from !== "string" || typeof v.rule?.name !== "string"))
		throw new Error("a violation names no module or no rule");
	// A built-in module, an import it could not resolve and an installed package are no source it read.
	const sources = (modules as { source?: unknown; coreModule?: unknown; couldNotResolve?: unknown }[]).filter(
		(m) =>
			typeof m?.source === "string" &&
			m.coreModule !== true &&
			m.couldNotResolve !== true &&
			!m.source.split("/").includes("node_modules"),
	);
	return { sources: sources.length, violations: violations as Violation[] };
}

/**
 * The line of `path` that imports `written`: the first that writes it between quotes after `from`, `import` or
 * `require(`, or else the first that writes it between quotes at all, as a multi-line statement may; null when
 * none does.
 */
async function importLine(files: WorkspaceFiles, path: string, written: string): Promise<number | null> {
	let text: string;
	try {
		text = await files.text(path);
	} catch {
		return null; // a file the copy does not hold has no line to give
	}
	const quoted = `(["'\`])${escapedForPattern(written)}\\1`;
	const imports = new RegExp(`(?:\\bfrom|\\bimport|\\brequire\\s*\\()\\s*\\(?\\s*${quoted}`);
	const mentions = new RegExp(quoted);
	const lines = text.split("\n");
	const index = lines.findIndex((line) => imports.test(line));
	const at = index >= 0 ? index : lines.findIndex((line) => mentions.test(line));
	return at < 0 ? null : at + 1;
}

/** What a violation says beside its rule: the module it imports, or the cycle it closes. */
function violationText(v: Violation): string {
	if (v.type === "module") return `${v.from} belongs to no part of the map`;
	if (v.cycle !== undefined && v.cycle.length > 0) return [v.from, ...v.cycle.map((c) => c.name)].join(" -> ");
	return `imports ${v.to}${v.unresolvedTo === undefined ? "" : ` as "${v.unresolvedTo}"`}`;
}

/** A finding per violation, each at the file it starts from and, when it is an import, at its line. */
async function findingsOf(files: WorkspaceFiles, violations: readonly Violation[]): Promise<ParsedFinding[]> {
	const findings: ParsedFinding[] = [];
	for (const v of violations) {
		const line =
			v.type === "module" || v.unresolvedTo === undefined ? null : await importLine(files, v.from, v.unresolvedTo);
		findings.push({
			rule_id: v.rule.name,
			category: "structure",
			severity: "major",
			message: `${v.from}${line === null ? "" : `:${line}`}: ${v.rule.name}: ${violationText(v)}`,
			symbol: null,
		});
	}
	return findings;
}

/** An output that concludes nothing about the architecture, with why. */
const concludesNothing = (facts: Record<string, unknown>, note: string): ParsedReport => ({
	verdict: "INDETERMINATE",
	facts,
	notes: [note],
	failures: [],
});

/** The violations of the rules of the adopted map, over the whole tree. */
export const DEPENDENCY_CRUISER_READER: ReportReader = {
	id: "dependency-cruiser-json",
	version: "1.0.0",
	nature: "structure",
	differential: false,
	located: true,
	async read(run) {
		const incident = incidentOf(run.observation);
		if (incident) return incidentReport(run.observation, incident);
		const [document] = await run.reports("application/json", { single_file: true });
		const facts = { exit_code: run.observation.exit_code, reports: document === undefined ? 0 : 1 };
		// dependency-cruiser writes its JSON and exits 0 whatever it finds; without the output, the failure is its own.
		if (document === undefined)
			return concludesNothing(
				facts,
				`no output of dependency-cruiser found at the declared report path${run.observation.exit_code === 0 ? "" : `: it exited with ${run.observation.exit_code}: ${run.stderr.trim().split("\n")[0]?.slice(0, 300) || "no error was named"}`}`,
			);
		let cruise: Cruise;
		try {
			cruise = cruiseOf(JSON.parse(document.text));
		} catch (error) {
			return concludesNothing(
				facts,
				`the output of dependency-cruiser ${document.name} cannot be read: ${messageOf(error).split("\n")[0]?.slice(0, 200)}`,
			);
		}
		if (cruise.sources === 0)
			return concludesNothing(
				{ ...facts, sources: 0 },
				"dependency-cruiser read no source: no file of the copy is one its parser reads",
			);
		const findings = await findingsOf(run, cruise.violations);
		return {
			verdict: findings.length > 0 ? "FAIL" : "PASS",
			facts: { ...facts, sources: cruise.sources, findings: findings.length },
			notes: [],
			failures: [],
			findings,
		};
	},
	// The rules are written from the map the control froze, outside the copy, and named on the command line.
	ruleset: (control) => ({
		name: "495-dependency-cruiser.json",
		text: dependencyCruiserRules(control.architecture_map ?? { parts: [], relations: [] }),
	}),
};
