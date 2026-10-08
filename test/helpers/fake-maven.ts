import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyTrigger } from "../../src/application/stacks/stack.ts";
import type { ArchitectureMap, ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type {
	ControlExecutionPort,
	ExecutableRequest,
	ProcessObservation,
	SandboxPort,
	SandboxProfile,
} from "../../src/ports/execution.ts";

/**
 * `cold-repository` is a Maven whose local repository does not hold the plugin of the POM yet: offline,
 * it announces its local repository and then fails as soon as the POM declares the plugin.
 */
export type MavenMode =
	| "resolves"
	| "fails"
	| "modifies-a-file"
	| "writes-an-excluded-file"
	| "announces-nothing"
	| "cold-repository";

export const LOCAL_REPOSITORY = "/machine/m2/repository";
/** What Maven writes on its standard output when it resolves: the files it downloaded. */
export const RESOLUTION_OUTPUT =
	"[INFO] Downloaded from central: https://repo.example/jacoco-maven-plugin-0.8.15.jar\n";
const FAILURE_OUTPUT =
	"[ERROR] Could not transfer artifact org.jacoco:jacoco-maven-plugin:pom:0.8.15 from/to central: 403 Forbidden\n";
/** The file a resolution that writes where it should not leaves modified. */
export const TAMPERED_FILE = "src/main/java/io/h495/Greeter.java";
/** The file a resolution that writes under a directory the workspace policy leaves out of a copy leaves behind. */
export const EXCLUDED_FILE = "target/out.txt";

function observation(exit_code: number, stdout = "", stderr = ""): ProcessObservation {
	return {
		exit_code,
		signal: null,
		timed_out: false,
		spawn_error: null,
		stdout: new TextEncoder().encode(stdout),
		stderr: new TextEncoder().encode(stderr),
		stdout_truncated: false,
		stderr_truncated: false,
		started_at: "2026-09-30T00:00:00.000Z",
		ended_at: "2026-09-30T00:00:01.000Z",
		duration_ms: 1000,
	};
}

/**
 * Stands for Maven and its repositories: it answers what Maven announces about its local repository,
 * and resolves the plugins of the copy without touching it, or fails like a repository that refuses
 * the plugin, or writes a source file of the copy, or a file under a directory the workspace policy excludes. Every other command runs on the sandbox it wraps.
 * Each command is recorded with the network its profile granted.
 */
export class FakeMavenSandbox implements SandboxPort {
	readonly backend: string;
	readonly runs: { command: string[]; network: SandboxProfile["network"]; write_paths: string[] }[] = [];
	private readonly inner: SandboxPort;
	private readonly mode: MavenMode;
	constructor(inner: SandboxPort, mode: MavenMode) {
		this.inner = inner;
		this.backend = inner.backend;
		this.mode = mode;
	}
	qualify(profile: SandboxProfile): ReturnType<SandboxPort["qualify"]> {
		return this.inner.qualify(profile);
	}
	resolutions(): number {
		return this.runs.filter((r) => r.command.some((part) => part.endsWith(":resolve-plugins"))).length;
	}
	async run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		this.runs.push({ command: request.command, network: profile.network, write_paths: profile.write_paths });
		if (request.command[0] !== "mvn") return this.inner.run(profile, request, signal);
		if (request.command.join(" ") === "mvn -X -o -B validate") {
			if (this.mode === "announces-nothing") return observation(0, "[INFO] BUILD SUCCESS\n");
			const announcement = `[DEBUG] Using local repository at ${LOCAL_REPOSITORY}\n`;
			const declared = readFileSync(join(request.cwd, "pom.xml"), "utf8").includes("jacoco-maven-plugin");
			return this.mode === "cold-repository" && declared
				? observation(1, `${announcement}[ERROR] Plugin org.jacoco:jacoco-maven-plugin:0.8.15 could not be resolved\n`)
				: observation(0, announcement);
		}
		if (this.mode === "fails") return observation(1, FAILURE_OUTPUT);
		if (this.mode === "modifies-a-file") {
			mkdirSync(dirname(join(request.cwd, TAMPERED_FILE)), { recursive: true });
			writeFileSync(
				join(request.cwd, TAMPERED_FILE),
				`${readFileSync(join(request.cwd, TAMPERED_FILE), "utf8")}// tampered\n`,
			);
		}
		if (this.mode === "writes-an-excluded-file") {
			mkdirSync(dirname(join(request.cwd, EXCLUDED_FILE)), { recursive: true });
			writeFileSync(join(request.cwd, EXCLUDED_FILE), "written by the resolution\n");
		}
		return observation(0, RESOLUTION_OUTPUT);
	}
}

/**
 * Stands for a Maven and a JDK that the machine running the suite need not have: the control runner
 * runs for real on a command that does nothing, and the verdict of the qualification witnesses is set
 * from the tree they were given, the negative witnesses being the ones that carry a failing test, a
 * class no test calls, an import across a boundary or a cycle. PMD and CPD write the reports the real
 * readers then read.
 */
export class FakeMavenControls implements ControlExecutionPort {
	private readonly real: ControlExecutionPort;
	get readers(): ControlExecutionPort["readers"] {
		return this.real.readers;
	}
	constructor(real: ControlExecutionPort) {
		this.real = real;
	}
	async runControl(
		invocation: Parameters<ControlExecutionPort["runControl"]>[0],
		signal?: AbortSignal,
	): ReturnType<ControlExecutionPort["runControl"]> {
		if (invocation.control.command.some((part) => part.includes("495-broken-runner")))
			return this.real.runControl(invocation, signal);
		const control = { ...invocation.control, command: emptyTrigger(process.execPath) };
		// PMD and CPD leave a report the real reader reads, written from the sources of the tree.
		if (control.parser === "pmd-xml" || control.parser === "cpd-xml") {
			writeQualityReports(invocation.workspace_path);
			return this.real.runControl({ ...invocation, control }, signal);
		}
		// ArchUnit leaves the Surefire report of the rules of the map, which the real reader reads.
		if (control.parser === "archunit-xml") {
			writeArchitectureReport(invocation.workspace_path, invocation.control);
			return this.real.runControl({ ...invocation, control }, signal);
		}
		// dependency:analyze writes on the output of the build what it finds of each module, which the real reader reads.
		if (control.parser === "dependency-analyze") {
			const output = dependencyAnalysis(invocation.workspace_path);
			const printed = {
				...control,
				command: [process.execPath, "-e", `process.stdout.write(${JSON.stringify(output)})`],
			};
			return this.real.runControl({ ...invocation, control: printed }, signal);
		}
		const out = await this.real.runControl({ ...invocation, control }, signal);
		// A reactor carries the witnesses in its first module, a single project at its root.
		const files = javaFiles(invocation.workspace_path);
		const has = (path: string): boolean => files.some((file) => file === path || file.endsWith(`/${path}`));
		const negative =
			has("src/test/java/witness495/NegativeWitness495Test.java") ||
			has("src/main/java/witness495/Witness495Uncovered.java") ||
			has("witness495/a/Witness495CycleA.java") ||
			has("witness495/Witness495Boundary.java");
		return { ...out, evidence: { ...out.evidence, verdict: negative ? "FAIL" : "PASS" } };
	}
}

/** The Java files of a tree, outside its build directories, by their path relative to it. */
function javaFiles(root: string): string[] {
	const found: string[] = [];
	const walk = (relative: string): void => {
		for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
			const path = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.isDirectory() && entry.name !== "target" && entry.name !== ".git") walk(path);
			else if (entry.isFile() && path.endsWith(".java")) found.push(path);
		}
	};
	walk("");
	return found.sort();
}

/** The Java sources under each `src/main/java` of a tree, by their path relative to it. */
function mainSources(root: string): string[] {
	return javaFiles(root).filter((path) => path.includes("src/main/java/"));
}

/**
 * What the fake PMD reports a line of source for: a rule and the text PMD gives its violation, which
 * does not name the rule, or a block CPD finds in every file that holds it.
 */
const PMD_RULES: readonly [RegExp, string, string][] = [
	[/\bint grade\(/, "CyclomaticComplexity", "The method 'grade' has a cyclomatic complexity of 11."],
	[/\bprivate static int never\(/, "UnusedPrivateMethod", "Avoid unused private methods such as 'never()'."],
];
const CPD_BLOCKS: readonly RegExp[] = [/\bcompute\(int\[\] values\)/, /\bwitness495Checksum\(/];

/**
 * Stands for PMD and CPD as `maven-pmd-plugin` runs them: the reports they write in the build directory,
 * naming each file by its absolute path, a violation where a method of complexity 11 or a private method
 * nothing calls sits, and a duplication of each block two files repeat.
 */
function writeQualityReports(workspace: string): void {
	const base = realpathSync(workspace);
	const violations: string[] = [];
	const blocks = CPD_BLOCKS.map(() => [] as string[]);
	for (const path of mainSources(base)) {
		const lines = readFileSync(join(base, path), "utf8").split("\n");
		const own: string[] = [];
		lines.forEach((line, index) => {
			for (const [pattern, rule, text] of PMD_RULES)
				if (pattern.test(line))
					own.push(
						`<violation beginline="${index + 1}" endline="${index + 1}" rule="${rule}" ruleset="Design" priority="3">\n${text}\n</violation>\n`,
					);
			CPD_BLOCKS.forEach((pattern, b) => {
				if (pattern.test(line)) blocks[b]!.push(`<file line="${index + 1}" path="${base}/${path}"/>`);
			});
		});
		if (own.length > 0) violations.push(`<file name="${base}/${path}">\n${own.join("")}</file>\n`);
	}
	const duplications = blocks
		.filter((places) => places.length > 1)
		.map((places) => `<duplication lines="18" tokens="106">\n${places.join("\n")}\n</duplication>\n`);
	mkdirSync(join(base, "target"), { recursive: true });
	writeFileSync(
		join(base, "target/pmd.xml"),
		`<?xml version="1.0" encoding="UTF-8"?>\n<pmd version="7.17.0">\n${violations.join("")}</pmd>\n`,
	);
	writeFileSync(
		join(base, "target/cpd.xml"),
		`<?xml version="1.0" encoding="UTF-8"?>\n<pmd-cpd pmdVersion="7.17.0">\n${duplications.join("")}</pmd-cpd>\n`,
	);
}

/** The ring of a role of a part in onion, from the centre outwards; the adapters, each named, are the outer ring. */
function ringOf(role: string): { rank: number; adapter: string | null } {
	const inner = ["domain model", "domain services", "application services"].indexOf(role);
	return inner >= 0 ? { rank: inner, adapter: null } : { rank: 3, adapter: role };
}

/** The rule of `map` a dependency from the package `from` to the package `to` breaks, or null when the map permits it. */
function brokenRule(map: ArchitectureMap, from: string, to: string): string | null {
	const partOf = (pkg: string) => map.parts.find((p) => p.roles.some((r) => r.package === pkg));
	const source = partOf(from);
	const target = partOf(to);
	if (!source || !target) return null;
	if (source !== target)
		return map.relations.some((r) => r.from === source.name && r.to === target.name)
			? null
			: `part ${source.name} may not depend on part ${target.name}`;
	const roleOf = (pkg: string) => source.roles.find((r) => r.package === pkg)!;
	if (source.style === "onion") {
		const a = ringOf(roleOf(from).role);
		const b = ringOf(roleOf(to).role);
		const kept = a.rank > b.rank || (a.rank === b.rank && a.adapter === b.adapter);
		return kept ? null : `part ${source.name} keeps the rings of its onion`;
	}
	if (source.style === "layered") {
		const layer = roleOf(from).role;
		const called = source.roles.filter((r) => r.role === roleOf(to).role);
		const kept = layer === roleOf(to).role || called.some((r) => (r.called_by ?? []).includes(layer));
		return kept ? null : `part ${source.name} keeps the calls between its layers`;
	}
	return null;
}

const xmlText = (text: string) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("'", "&apos;")
		.replaceAll("\n", "&#10;");

/**
 * Stands for ArchUnit as the architecture control runs it: the Surefire report of the rules of the frozen map,
 * at the report path of the control, written from the main sources of the tree. A line that names a class of
 * another package is a dependency on that package; it breaks the rule the map gives it, and two packages that
 * depend on each other are a cycle; a source whose package no part covers belongs to no part.
 */
function writeArchitectureReport(workspace: string, control: ControlDefinition): void {
	const map = control.architecture_map!;
	const mapped = new Set(map.parts.flatMap((p) => p.roles.map((r) => r.package)));
	const sources = mainSources(workspace).map((path) => {
		const text = readFileSync(join(workspace, path), "utf8");
		const name = path.slice(path.lastIndexOf("/") + 1, -".java".length);
		return { name, pkg: /^package ([\w.]+);/m.exec(text)?.[1] ?? "", lines: text.split("\n") };
	});
	const violations = new Map<string, string[]>();
	const violate = (rule: string, line: string) => violations.set(rule, [...(violations.get(rule) ?? []), line]);
	const edges: { from: string; to: string; line: string }[] = [];
	for (const source of sources) {
		const origin = `${source.pkg}.${source.name}`;
		if (!mapped.has(source.pkg) && !source.pkg.startsWith("witness495"))
			violate(
				"every main source belongs to a part",
				`Class <${origin}> does not reside in any package in (${source.name}.java:0)`,
			);
		source.lines.forEach((text, index) => {
			if (/^\s*(package|import) /.test(text)) return;
			for (const other of sources) {
				if (other.pkg === source.pkg || !new RegExp(`\\b${other.name}\\b`).test(text)) continue;
				const line = `Class <${origin}> depends on <${other.pkg}.${other.name}> in (${source.name}.java:${index + 1})`;
				edges.push({ from: source.pkg, to: other.pkg, line });
				const rule = brokenRule(map, source.pkg, other.pkg);
				if (rule !== null) violate(rule, line);
			}
		});
	}
	for (const edge of edges)
		if (mapped.has(edge.from) && mapped.has(edge.to) && edges.some((e) => e.from === edge.to && e.to === edge.from))
			violate("no cycle between the packages of the map", edge.line);
	const cases = [...violations].map(([rule, lines], i) => {
		const message = `Architecture Violation [Priority: MEDIUM] - Rule '${rule}' was violated (${lines.length} times):\n${lines.join("\n")}`;
		return `  <testcase name="rule${i + 1}" classname="Architecture495Test"><failure message="${xmlText(message)}" type="java.lang.AssertionError"/></testcase>\n`;
	});
	const directory = join(workspace, control.report_path!);
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, "TEST-Architecture495Test.xml"),
		`<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Architecture495Test" tests="${cases.length}">\n${cases.join("")}</testsuite>\n`,
	);
}

/** The dependencies a POM declares outside its parent, plugins and managed versions, with their scope. */
function declaredDependencies(pom: string): { group: string; artifact: string; scope: string }[] {
	const own = pom.replace(/<(parent|dependencyManagement|build|profiles)\b[\s\S]*?<\/\1>/g, "");
	return [...own.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)].map((m) => ({
		group: /<groupId>([^<]*)<\/groupId>/.exec(m[1]!)?.[1] ?? "",
		artifact: /<artifactId>([^<]*)<\/artifactId>/.exec(m[1]!)?.[1] ?? "",
		scope: /<scope>([^<]*)<\/scope>/.exec(m[1]!)?.[1] ?? "compile",
	}));
}

/**
 * Stands for `dependency:analyze` as the dependencies control runs it on each module of the reactor: a module
 * that imports a package of another module's main sources without declaring that module uses it undeclared, as
 * does a test that imports the exception of opentest4j, or the API of JUnit Jupiter in a module that does not
 * declare `junit-jupiter-api`; a dependency of the compile scope from outside the reactor that no source of the
 * module imports a package of its group from is unused, and so is the aggregate `junit-jupiter`.
 */
function dependencyAnalysis(workspace: string): string {
	const root = readFileSync(join(workspace, "pom.xml"), "utf8");
	const modules = [...root.matchAll(/<module>([^<]+)<\/module>/g)].map((m) => m[1]!);
	const sources = javaFiles(workspace).map((path) => ({ path, text: readFileSync(join(workspace, path), "utf8") }));
	const packagesOf = (module: string) =>
		new Set(
			sources
				.filter((s) => s.path.startsWith(`${module}/src/main/java/`))
				.map((s) => /^package ([\w.]+);/m.exec(s.text)?.[1] ?? ""),
		);
	const lines = ["[INFO] Scanning for projects..."];
	for (const module of modules) {
		const declared = declaredDependencies(readFileSync(join(workspace, module, "pom.xml"), "utf8"));
		const own = sources.filter((s) => s.path.startsWith(`${module}/`));
		const imports = own.flatMap((s) =>
			[...s.text.matchAll(/^import (?:static )?([\w.]+?)(?:\.\*)?;/gm)].map((m) => m[1]!),
		);
		const used: string[] = [];
		for (const other of modules) {
			if (other === module || declared.some((d) => d.artifact === other)) continue;
			const packages = packagesOf(other);
			const classes = imports.filter((name) => packages.has(name.slice(0, name.lastIndexOf("."))));
			if (classes.length > 0)
				used.push(
					`[WARNING]    io.demo:${other}:jar:1.0.0:compile`,
					...classes.map((c) => `[WARNING]       class ${c}`),
				);
		}
		const jupiter = imports.filter((name) => name.startsWith("org.junit.jupiter.api."));
		if (jupiter.length > 0 && !declared.some((d) => d.artifact === "junit-jupiter-api"))
			used.push(
				"[WARNING]    org.junit.jupiter:junit-jupiter-api:jar:5.10.2:test",
				...[...new Set(jupiter)].map((c) => `[WARNING]       class ${c}`),
			);
		if (imports.includes("org.opentest4j.AssertionFailedError"))
			used.push(
				"[WARNING]    org.opentest4j:opentest4j:jar:1.3.0:test",
				"[WARNING]       class org.opentest4j.AssertionFailedError",
			);
		const unused = declared
			.filter(
				(d) =>
					(d.scope === "compile" &&
						!modules.includes(d.artifact) &&
						!imports.some((n) => n.startsWith(`${d.group}.`))) ||
					d.artifact === "junit-jupiter",
			)
			.map((d) => `[WARNING]    ${d.group}:${d.artifact}:jar:1.0:${d.scope}`);
		lines.push(
			`[INFO] --- dependency:3.11.0:analyze (analyze495) @ ${module} ---`,
			...(used.length > 0 ? ["[WARNING] Used undeclared dependencies found:", ...used] : []),
			...(unused.length > 0 ? ["[WARNING] Unused declared dependencies found:", ...unused] : []),
			...(used.length + unused.length === 0 ? ["[INFO] No dependency problems found"] : []),
			"[INFO] ",
		);
	}
	return `${[...lines, "[INFO] BUILD SUCCESS"].join("\n")}\n`;
}
