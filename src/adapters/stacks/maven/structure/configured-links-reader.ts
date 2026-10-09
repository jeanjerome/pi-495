/**
 * The links a Maven reactor establishes without an import, read against the adopted map (ARC-01): the full name
 * of a class its main sources declare, written in a string of a main Java source — a link by reflection — or in
 * another text file under the `src/main/` of a module — a link by configuration. ArchUnit and `dependency:analyze`
 * read the compiled classes, where such a link leaves a string alone. Nothing is run: the files of the copy are
 * read as data, and the parts and relations are those of the map the control froze, never a file of the tree.
 */
import { basename } from "node:path";
import type { ArchitectureMap } from "../../../../contracts/v1/protocol.ts";
import type { ParsedFinding, ReportReader } from "../../../../ports/execution.ts";
import { incidentOf, incidentReport } from "../../../execution/parsers.ts";
import { readDeclarations } from "../project/java-declarations.ts";
import { stringLiterals } from "../project/java-strings.ts";

type Method = "reflection" | "configuration";

/** A written name that may be a class: identifiers joined by dots, the longest run, so a suffix of a name is never one. */
const QUALIFIED_NAME = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+/g;

/** The directory of the main sources of a module, below the directory of its POM. */
const MAIN = "src/main/";
const RESOURCES = `${MAIN}resources/`;

interface FileText {
	path: string;
	text: string;
}

interface Link {
	from: string;
	to: string;
	path: string;
	line: number;
	name: string;
	method: Method;
}

/**
 * The declared class each name of `text` designates, with the offset it is written at: the name itself, or the
 * longest part of it before a `.` or a `$` that is declared, a nested type or a member being written after its class.
 */
function namedClasses(text: string, declared: ReadonlyMap<string, string | null>): { name: string; at: number }[] {
	const named: { name: string; at: number }[] = [];
	for (const match of text.matchAll(QUALIFIED_NAME)) {
		let candidate = match[0];
		while (candidate.includes(".") && !declared.has(candidate))
			candidate = candidate.slice(0, candidate.search(/[.$][^.$]*$/));
		if (declared.has(candidate)) named.push({ name: candidate, at: match.index });
	}
	return named;
}

/** The line of `text` holding `offset`, `first` being the line `text` starts on. */
const lineAt = (text: string, offset: number, first: number) =>
	first + (text.slice(0, offset).match(/\n/g)?.length ?? 0);

/** The directory of the module a file of the copy sits in: the longest directory of a POM whose `src/main/` holds it. */
function moduleOf(path: string, modules: readonly string[]): string | null {
	let found: string | null = null;
	for (const module of modules)
		if (path.startsWith(`${module}${MAIN}`) && (found === null || module.length > found.length)) found = module;
	return found;
}

/** The part of the map whose roles name `pkg`, or null when no part covers it. */
function partOfPackage(map: ArchitectureMap, pkg: string | null): string | null {
	return map.parts.find((part) => part.roles.some((r) => r.package === pkg))?.name ?? null;
}

/**
 * The part a configuration file belongs to: the only part whose perimeter names its module, or else the only part
 * whose packages hold the directory of the file under the resources of the module; null when no part claims it alone.
 */
function partOfConfiguration(map: ArchitectureMap, path: string, module: string): string | null {
	const directory = module.replace(/\/$/, "") || ".";
	const byModule = map.parts.filter((part) => part.perimeter.includes(directory));
	if (byModule.length === 1) return byModule[0]!.name;
	if (!path.startsWith(`${module}${RESOURCES}`)) return null;
	const pkg = path.slice(`${module}${RESOURCES}`.length).split("/").slice(0, -1).join(".");
	const byPackage = map.parts.filter((part) => part.roles.some((r) => r.package === pkg));
	return byPackage.length === 1 ? byPackage[0]!.name : null;
}

/** Every link a main Java source or a configuration file of the copy writes to a declared class, from its part. */
function linksOf(
	map: ArchitectureMap,
	files: readonly FileText[],
	modules: readonly string[],
	declared: ReadonlyMap<string, string | null>,
): Link[] {
	const links: Link[] = [];
	const add = (from: string | null, path: string, line: number, name: string, method: Method) => {
		const to = declared.get(name) ?? null;
		if (from !== null && to !== null) links.push({ from, to, path, line, name, method });
	};
	for (const file of files) {
		if (file.path.endsWith(".java")) {
			const from = partOfPackage(map, readDeclarations(file.path, file.text).package_name);
			for (const literal of stringLiterals(file.text))
				for (const { name, at } of namedClasses(literal.text, declared))
					add(from, file.path, lineAt(literal.text, at, literal.line), name, "reflection");
			continue;
		}
		const module = moduleOf(file.path, modules);
		const from = module === null ? null : partOfConfiguration(map, file.path, module);
		for (const { name, at } of namedClasses(file.text, declared))
			add(from, file.path, lineAt(file.text, at, 1), name, "configuration");
	}
	return links;
}

/** Judges the links established by configuration or by reflection against the parts and relations of the frozen map. */
export const CONFIGURED_LINKS_READER: ReportReader = {
	id: "configured-links",
	version: "1.0.0",
	nature: "structure",
	differential: false,
	located: true,
	async read(run) {
		const incident = incidentOf(run.observation);
		if (incident) return incidentReport(run.observation, incident);
		const map = run.control.architecture_map;
		if (map === undefined)
			return {
				verdict: "INDETERMINATE",
				facts: {},
				notes: ["no architecture map is frozen for this control: a link has no part to be judged against"],
				failures: [],
			};
		const poms = await run.tree([""], "pom.xml");
		const modules = poms.files
			.filter((f) => basename(f.path) === "pom.xml")
			.map((f) => f.path.slice(0, -"pom.xml".length));
		const tree = await run.tree(
			modules.map((m) => `${m}${MAIN}`),
			"",
		);
		// A binary file holds no name a reader of the project could write; reading it as text would invent some.
		// It is named in the notes, so the content of a file of the project never silences its links unseen.
		const binary = tree.files.filter((f) => f.text.includes("\u0000"));
		const files = tree.files.filter((f) => !f.text.includes("\u0000"));
		const notes = [
			...poms.notes,
			...tree.notes,
			...binary.map((f) => `${f.path} was not read because it holds a NUL byte: its links were not read`),
		];
		const declared = new Map<string, string | null>();
		for (const file of files) {
			if (!file.path.endsWith(".java")) continue;
			const pkg = readDeclarations(file.path, file.text).package_name;
			if (pkg !== null) declared.set(`${pkg}.${basename(file.path, ".java")}`, partOfPackage(map, pkg));
		}
		const facts = { files: files.length, binary_files: tree.files.length - files.length, classes: declared.size };
		if (declared.size === 0)
			return {
				verdict: "INDETERMINATE",
				facts,
				notes: ["no main Java source of the reactor declares a class: no link to a part can be named", ...notes],
				failures: [],
			};
		const permitted = (from: string, to: string) =>
			from === to || map.relations.some((r) => r.from === from && r.to === to);
		const seen = new Set<string>();
		const findings: ParsedFinding[] = [];
		for (const link of linksOf(map, files, modules, declared)) {
			const key = `${link.path}:${link.line}:${link.name}`;
			if (permitted(link.from, link.to) || seen.has(key)) continue;
			seen.add(key);
			findings.push({
				rule_id: `part ${link.from} may not depend on part ${link.to}`,
				category: "structure",
				severity: "major",
				message: `${link.path}:${link.line}: part ${link.from} depends on part ${link.to} by ${link.method}, naming ${link.name}, which the map does not permit`,
				symbol: link.name,
			});
		}
		return {
			verdict: findings.length > 0 ? "FAIL" : "PASS",
			facts: { ...facts, findings: findings.length },
			notes,
			failures: [],
			findings,
		};
	},
};
