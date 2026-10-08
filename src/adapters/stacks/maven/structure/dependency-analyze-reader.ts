/**
 * The reader of what `dependency:analyze` of maven-dependency-plugin writes for each module of a reactor, on the
 * output of the build: one finding per gap between the dependencies a module declares and those its compiled
 * classes use, over the whole tree. A use the module does not declare is located at each of its sources that
 * imports a class the analysis names, at the line of the import, else at its POM; a declaration it does not use,
 * at the POM that declares it, the module's or a parent's in the reactor, at the line of its `artifactId`. The
 * lists of ignored dependencies are not gaps. An output that holds no analysis, that cannot be read, or where the
 * analysis of a module was skipped concludes nothing: a build that analysed nothing never reads as POMs that hold.
 */
import { posix } from "node:path";
import { messageOf } from "../../../../domain/errors.ts";
import type { ParsedFinding, ParsedReport, ReportReader, WorkspaceFiles } from "../../../../ports/execution.ts";
import { buildErrors, incidentOf, incidentReport } from "../../../execution/parsers.ts";
import { readDeclarations } from "../project/java-declarations.ts";
import { elementText } from "../project/reactor.ts";
import { DEPENDENCIES_EXECUTION } from "../shared.ts";

const USED_UNDECLARED_RULE = "every module declares the dependencies its code uses";
const UNUSED_DECLARED_RULE = "every module uses the dependencies it declares";

/**
 * The line that opens the analysis of a module by the execution 495 declares, naming its artifact. An execution of
 * the project's own, bound to a phase the build runs, is not the analysis 495 runs.
 */
const ANALYSIS = new RegExp(
	`^\\[INFO\\] --- (?:maven-)?dependency(?:-plugin)?:\\S+:analyze\\S* \\(${DEPENDENCIES_EXECUTION}\\) @ (\\S+) ---$`,
);
/** The prefix of the line that opens any other goal or closes a project, which closes the analysis before it. */
const CLOSING = "[INFO] ---";
/** A heading of a list the analysis writes: the two of gaps, and the others, which are not. */
const LIST = /^\[(?:INFO|WARNING)\] ([A-Z][\w -]*):$/;
const USED_UNDECLARED_LIST = "Used undeclared dependencies found";
const UNUSED_DECLARED_LIST = "Unused declared dependencies found";
/** An entry of a list, and a class the analysis names under an entry of `verbose`. */
const ENTRY = /^\[(?:INFO|WARNING)\] {2,5}(\S+)$/;
const CLASS = /^\[(?:INFO|WARNING)\] {6,}class (\S+)$/;
/** `groupId:artifactId:type[:classifier]:version:scope`, as the plugin writes an artifact. */
const COORDINATES = /^([^:\s]+):([^:\s]+):[^:\s]+(?::[^:\s]+)?:[^:\s]+:[^:\s]+$/;

interface Gap {
	rule: typeof USED_UNDECLARED_RULE | typeof UNUSED_DECLARED_RULE;
	module: string;
	group: string;
	artifact: string;
	classes: string[];
}

interface Analysis {
	gaps: Gap[];
	/** The modules whose analysis was skipped, which therefore measured nothing of them. */
	skipped: string[];
	analysed: number;
}

/** The lines each analysis by the execution 495 declares writes, with the module it names, in the order of the build. */
function analysedModules(output: string): { module: string; lines: string[] }[] {
	const modules: { module: string; lines: string[] }[] = [];
	let open: { module: string; lines: string[] } | null = null;
	for (const line of output.split(/\r?\n/)) {
		const opened = ANALYSIS.exec(line);
		if (opened) {
			open = { module: opened[1]!, lines: [] };
			modules.push(open);
		} else if (line.startsWith(CLOSING)) open = null;
		else open?.lines.push(line);
	}
	return modules;
}

/** The rule whose gaps a list heading opens; null for a list that holds no gap, such as the ignored ones. */
function ruleOf(heading: string): Gap["rule"] | null {
	if (heading === USED_UNDECLARED_LIST) return USED_UNDECLARED_RULE;
	if (heading === UNUSED_DECLARED_LIST) return UNUSED_DECLARED_RULE;
	return null;
}

/** Whether a line says the analysis of its module was skipped; a project of packaging `pom` is skipped by design. */
const skips = (line: string) => /^\[INFO\] Skipping\b/.test(line) && !line.includes("Skipping pom project");

/** The gaps the lists of the analysis of `module` give, and whether it was skipped; or why they cannot be read. */
function gapsOf(module: string, lines: readonly string[]): { gaps: Gap[]; skipped: boolean } | { unreadable: string } {
	const gaps: Gap[] = [];
	let skipped = false;
	let rule: Gap["rule"] | null = null;
	for (const line of lines) {
		const heading = LIST.exec(line)?.[1];
		if (heading !== undefined) {
			rule = ruleOf(heading);
			continue;
		}
		const named = CLASS.exec(line)?.[1];
		if (named !== undefined) {
			if (rule !== null) gaps.at(-1)?.classes.push(named);
			continue;
		}
		const entry = ENTRY.exec(line)?.[1];
		if (entry === undefined) {
			rule = null;
			skipped ||= skips(line);
			continue;
		}
		if (rule === null) continue;
		const coordinates = COORDINATES.exec(entry);
		if (!coordinates)
			return { unreadable: `the output of dependency:analyze for ${module} cannot be read: ${entry.slice(0, 200)}` };
		gaps.push({ rule, module, group: coordinates[1]!, artifact: coordinates[2]!, classes: [] });
	}
	return { gaps, skipped };
}

/** The gaps the output lists module by module; or why it cannot be read. */
function analysisOf(output: string): Analysis | { unreadable: string } {
	const analysis: Analysis = { gaps: [], skipped: [], analysed: 0 };
	for (const { module, lines } of analysedModules(output)) {
		const read = gapsOf(module, lines);
		if ("unreadable" in read) return read;
		analysis.analysed++;
		analysis.gaps.push(...read.gaps);
		if (read.skipped) analysis.skipped.push(module);
	}
	return analysis;
}

/** A comment of a POM, which declares nothing. */
const COMMENT = /<!--[\s\S]*?-->/g;
/** The blocks of a POM whose `artifactId` is not the one the POM builds. */
const NOT_ITS_IDENTITY = /<(parent|dependencies|build|profiles)\b[\s\S]*?<\/\1>/g;

/** A POM of the copy, with its path and its text. */
interface PomFile {
	path: string;
	text: string;
}

/** A POM fragment with what is not the project's own declaration blanked, line breaks kept, so offsets keep their line. */
const blanked = (xml: string, pattern: RegExp) => xml.replace(pattern, (m) => m.replace(/[^\n]/g, " "));

/** The line of `xml` the offset `at` falls on, counted from 1. */
const lineAt = (xml: string, at: number) => xml.slice(0, at).split("\n").length;

/** The line of the `artifactId` of the dependency on `group:artifact` the POM declares itself; null when it declares none. */
function declarationLine(xml: string, group: string, artifact: string): number | null {
	let own = blanked(xml, COMMENT);
	for (const block of ["dependencyManagement", "build", "profiles", "reporting"])
		own = blanked(own, new RegExp(`<${block}\\b[\\s\\S]*?<\\/${block}>`, "g"));
	for (const m of own.matchAll(/<dependency\b[^>]*>([\s\S]*?)<\/dependency>/g)) {
		const declared = m[1]!;
		if (elementText(declared, "artifactId") !== artifact || elementText(declared, "groupId") !== group) continue;
		return lineAt(own, m.index + m[0].indexOf("<artifactId"));
	}
	return null;
}

/** The line of the module's own `artifactId`, which names it, outside its parent's coordinates. */
function identityLine(xml: string): number {
	const own = blanked(blanked(xml, COMMENT), NOT_ITS_IDENTITY);
	const at = own.indexOf("<artifactId");
	return at < 0 ? 1 : lineAt(own, at);
}

/** The POMs of the copy by the artifact each one builds. */
async function pomsByArtifact(files: WorkspaceFiles): Promise<Map<string, PomFile>> {
	const poms = new Map<string, PomFile>();
	for (const pom of (await files.tree([""], "pom.xml")).files) {
		if (posix.basename(pom.path) !== "pom.xml") continue;
		const own = pom.text.replace(COMMENT, "").replace(NOT_ITS_IDENTITY, "");
		const artifact = elementText(own, "artifactId");
		if (artifact !== null && !poms.has(artifact)) poms.set(artifact, pom);
	}
	return poms;
}

/** The POM of the parent `pom` names, by its relative path, when the copy holds it; null otherwise. */
async function parentOf(files: WorkspaceFiles, pom: PomFile): Promise<PomFile | null> {
	const parent = /<parent\b[\s\S]*?<\/parent>/.exec(pom.text.replace(COMMENT, ""))?.[0];
	if (parent === undefined) return null;
	const relative = /<relativePath\s*\/>/.test(parent) ? "" : (elementText(parent, "relativePath") ?? "../pom.xml");
	if (relative === "") return null;
	let path = posix.normalize(posix.join(posix.dirname(pom.path), relative));
	if (!path.endsWith(".xml")) path = posix.join(path, "pom.xml");
	if (path.startsWith("../") || path === "..") return null;
	try {
		return { path, text: await files.text(path) };
	} catch {
		// A parent the copy does not hold is resolved by Maven elsewhere, out of the reactor: nothing of it is located.
		return null;
	}
}

/** Where a declaration the module does not use is: the POM of the module or of a parent in the reactor that declares it. */
async function declarationOf(files: WorkspaceFiles, pom: PomFile, gap: Gap): Promise<{ path: string; line: number }> {
	let current: PomFile | null = pom;
	for (let depth = 0; current !== null && depth < 32; depth++) {
		const line = declarationLine(current.text, gap.group, gap.artifact);
		if (line !== null) return { path: current.path, line };
		current = await parentOf(files, current);
	}
	return { path: pom.path, line: identityLine(pom.text) };
}

/** Whether the import of `name` brings the class `type`: the class itself, its package, its outer class, or a member of it. */
const imports = (name: string, type: string) =>
	name === type || type.startsWith(`${name}.`) || name.startsWith(`${type}.`);

/** Where a use the module does not declare is: each of its sources that imports a class the analysis names, at that import. */
async function usesOf(files: WorkspaceFiles, pom: PomFile, gap: Gap): Promise<{ path: string; line: number }[]> {
	const types = gap.classes.map((c) => c.replaceAll("$", "."));
	const moduleRoot = posix.dirname(pom.path) === "." ? "" : posix.dirname(pom.path);
	const sources = (await files.tree([moduleRoot], ".java")).files;
	const at = sources.flatMap((file) => {
		const imported = readDeclarations(file.path, file.text).imports.find((i) => types.some((t) => imports(i.name, t)));
		return imported === undefined ? [] : [{ path: file.path, line: imported.line }];
	});
	return at.length > 0 ? at : [{ path: pom.path, line: identityLine(pom.text) }];
}

/** What a gap says of its module and its dependency, with the classes a use is about. */
function saidOf(gap: Gap): string {
	const dependency = `${gap.group}:${gap.artifact}`;
	if (gap.rule === UNUSED_DECLARED_RULE) return `${gap.module} declares ${dependency} without using it`;
	const classes = gap.classes.length > 0 ? ` (${gap.classes.map((c) => `class ${c}`).join(", ")})` : "";
	return `${gap.module} uses ${dependency} without declaring it${classes}`;
}

/** One finding per place each gap is located at in the copy; or the module of a gap no POM of the copy builds. */
async function locatedFindings(
	files: WorkspaceFiles,
	gaps: readonly Gap[],
): Promise<{ findings: ParsedFinding[] } | { unreadable: string }> {
	const poms = await pomsByArtifact(files);
	const findings: ParsedFinding[] = [];
	for (const gap of gaps) {
		const pom = poms.get(gap.module);
		if (pom === undefined) return { unreadable: `no POM of the copy builds the module ${gap.module}` };
		const located =
			gap.rule === USED_UNDECLARED_RULE ? await usesOf(files, pom, gap) : [await declarationOf(files, pom, gap)];
		for (const at of located)
			findings.push({
				rule_id: gap.rule,
				category: "structure",
				severity: "major",
				message: `${at.path}:${at.line}: ${gap.rule}: ${saidOf(gap)}`,
				symbol: `${gap.group}:${gap.artifact}`,
			});
	}
	return { findings };
}

/** A report that concludes nothing about the dependencies, with why. */
const concludesNothing = (facts: Record<string, unknown>, note: string): ParsedReport => ({
	verdict: "INDETERMINATE",
	facts,
	notes: [note],
	failures: [],
});

/** The gaps between the dependencies the POMs of the reactor declare and those its code uses, over the whole tree. */
export const DEPENDENCY_ANALYZE_READER: ReportReader = {
	id: "dependency-analyze",
	version: "1.0.0",
	nature: "structure",
	differential: false,
	located: true,
	async read(run) {
		const incident = incidentOf(run.observation);
		if (incident) return incidentReport(run.observation, incident);
		const facts: Record<string, unknown> = { exit_code: run.observation.exit_code };
		if (run.observation.exit_code !== 0)
			return concludesNothing(
				facts,
				`the build exited with ${run.observation.exit_code}: ${buildErrors(`${run.stdout}\n${run.stderr}`, 3).join("; ") || "no error was named"}`,
			);
		if (run.observation.stdout_truncated)
			return concludesNothing(
				facts,
				"the output of dependency:analyze was truncated: the modules after the cut are not read",
			);
		const analysis = analysisOf(run.stdout);
		if ("unreadable" in analysis) return concludesNothing(facts, analysis.unreadable);
		if (analysis.analysed === 0) return concludesNothing(facts, "no output of dependency:analyze found in the build");
		if (analysis.skipped.length > 0)
			return concludesNothing(facts, `the analysis of ${analysis.skipped.join(", ")} was skipped`);
		let located: { findings: ParsedFinding[] } | { unreadable: string };
		try {
			located = await locatedFindings(run, analysis.gaps);
		} catch (error) {
			return concludesNothing(facts, `the copy cannot be read to locate the gaps: ${messageOf(error).split("\n")[0]}`);
		}
		if ("unreadable" in located) return concludesNothing(facts, located.unreadable);
		const { findings } = located;
		return {
			verdict: findings.length > 0 ? "FAIL" : "PASS",
			facts: { ...facts, modules: analysis.analysed, findings: findings.length },
			notes: [],
			failures: [],
			findings,
		};
	},
};
