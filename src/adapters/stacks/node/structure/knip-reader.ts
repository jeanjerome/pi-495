/**
 * The reader of the JSON output of Knip 6.40.0 (`--reporter json`, on its standard output) for the rule that the
 * package declares in `package.json` the dependencies its code uses, and uses those it declares: one finding per
 * gap, over the whole tree. A use the manifest does not declare is located at the file and the line Knip gives; a
 * declaration no source uses, among `dependencies`, `devDependencies` or the optional peer dependencies, at its
 * line of `package.json`, which Knip gives only when the declaration has a line of its own and which is otherwise
 * found in the manifest. An output that is absent or cannot be read concludes nothing: Knip stops without one on a
 * configuration it refuses, and that never reads as a package that declares what it uses.
 */
import { messageOf } from "../../../../domain/errors.ts";
import type { ParsedFinding, ParsedReport, ReportReader, WorkspaceFiles } from "../../../../ports/execution.ts";
import { incidentOf, incidentReport } from "../../../execution/parsers.ts";
import { escapedForPattern } from "../shared.ts";
import { knipConfiguration } from "./knip-configuration.ts";

const USED_UNDECLARED_RULE = "the package declares in package.json the dependencies its code uses";
const UNUSED_DECLARED_RULE = "the package uses the dependencies it declares in package.json";

/** The types of gap Knip reports that are declarations no source uses, with the section of the manifest each is in. */
const UNUSED_DECLARATIONS = {
	dependencies: "dependencies",
	devDependencies: "devDependencies",
	optionalPeerDependencies: "peerDependencies",
} as const;

interface Gap {
	rule: typeof USED_UNDECLARED_RULE | typeof UNUSED_DECLARED_RULE;
	file: string;
	name: string;
	line: number | null;
	/** The section of the manifest a declaration is in; null for a use. */
	section: string | null;
}

/** An entry Knip gives for a dependency, with the line it is at when it gives one. */
function entryOf(value: unknown): { name: string; line: number | null } {
	const { name, line } = (value ?? {}) as { name?: unknown; line?: unknown };
	if (typeof name !== "string") throw new Error("a gap names no dependency");
	return { name, line: typeof line === "number" && Number.isInteger(line) && line > 0 ? line : null };
}

/** The gaps the output lists, file by file; throws on an output of another shape. */
function gapsOf(output: unknown): Gap[] {
	const { issues } = (output ?? {}) as { issues?: unknown };
	if (!Array.isArray(issues)) throw new Error("it lists no issues");
	const gaps: Gap[] = [];
	for (const row of issues as Record<string, unknown>[]) {
		const file = row?.file;
		if (typeof file !== "string") throw new Error("an issue names no file");
		for (const [type, section] of Object.entries(UNUSED_DECLARATIONS))
			for (const entry of (row[type] ?? []) as unknown[])
				gaps.push({ rule: UNUSED_DECLARED_RULE, file, section, ...entryOf(entry) });
		for (const entry of (row.unlisted ?? []) as unknown[])
			gaps.push({ rule: USED_UNDECLARED_RULE, file, section: null, ...entryOf(entry) });
	}
	return gaps;
}

/** The line of the manifest `path` that declares `name` in `section`; null when it cannot be found. */
async function declarationLine(
	files: WorkspaceFiles,
	path: string,
	section: string,
	name: string,
): Promise<number | null> {
	let text: string;
	try {
		text = await files.text(path);
	} catch {
		return null; // a manifest the copy does not hold has no line to give
	}
	const opened = new RegExp(`"${section}"\\s*:\\s*\\{`).exec(text);
	if (opened === null) return null;
	const declared = new RegExp(`"${escapedForPattern(name)}"\\s*:`).exec(text.slice(opened.index + opened[0].length));
	if (declared === null) return null;
	return text.slice(0, opened.index + opened[0].length + declared.index).split("\n").length;
}

/** What a gap says of the dependency it is about. */
const saidOf = (gap: Gap) =>
	gap.rule === UNUSED_DECLARED_RULE
		? `the package declares ${gap.name} without using it`
		: `the package uses ${gap.name} without declaring it`;

/** A finding per gap, each at its file and, when it is known or found, at its line. */
async function findingsOf(files: WorkspaceFiles, gaps: readonly Gap[]): Promise<ParsedFinding[]> {
	const findings: ParsedFinding[] = [];
	for (const gap of gaps) {
		const line =
			gap.line ?? (gap.section === null ? null : await declarationLine(files, gap.file, gap.section, gap.name));
		findings.push({
			rule_id: gap.rule,
			category: "structure",
			severity: "major",
			message: `${gap.file}${line === null ? "" : `:${line}`}: ${gap.rule}: ${saidOf(gap)}`,
			symbol: gap.name,
		});
	}
	return findings;
}

/** An output that concludes nothing about the dependencies, with why. */
const concludesNothing = (facts: Record<string, unknown>, note: string): ParsedReport => ({
	verdict: "INDETERMINATE",
	facts,
	notes: [note],
	failures: [],
});

/** The gaps between the dependencies `package.json` declares and those the code uses, over the whole tree. */
export const KNIP_READER: ReportReader = {
	id: "knip-json",
	version: "1.0.0",
	nature: "structure",
	differential: false,
	located: true,
	async read(run) {
		const incident = incidentOf(run.observation);
		if (incident) return incidentReport(run.observation, incident);
		const facts: Record<string, unknown> = { exit_code: run.observation.exit_code };
		if (run.stdout.trim() === "")
			return concludesNothing(
				facts,
				`no output of Knip: it exited with ${run.observation.exit_code}: ${run.stderr.trim().split("\n")[0]?.slice(0, 300) || "no error was named"}`,
			);
		if (run.observation.stdout_truncated)
			return concludesNothing(facts, "the output of Knip was truncated: the gaps after the cut are not read");
		let gaps: Gap[];
		try {
			gaps = gapsOf(JSON.parse(run.stdout));
		} catch (error) {
			return concludesNothing(
				facts,
				`the output of Knip cannot be read: ${messageOf(error).split("\n")[0]?.slice(0, 200)}`,
			);
		}
		const findings = await findingsOf(run, gaps);
		return {
			verdict: findings.length > 0 ? "FAIL" : "PASS",
			facts: { ...facts, findings: findings.length },
			notes: [],
			failures: [],
			findings,
		};
	},
	// The configuration is written outside the copy and named on the command line.
	ruleset: () => ({ name: "495-knip.json", text: knipConfiguration() }),
};
