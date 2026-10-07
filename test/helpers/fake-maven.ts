import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emptyTrigger } from "../../src/application/stacks/stack.ts";
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
 * from the tree they were given, the negative witnesses being the ones that carry a failing test or a
 * class no test calls. PMD and CPD write the reports the real readers then read.
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
		const out = await this.real.runControl({ ...invocation, control }, signal);
		// A reactor carries the witnesses in its first module, a single project at its root.
		const files = javaFiles(invocation.workspace_path);
		const has = (path: string): boolean => files.some((file) => file === path || file.endsWith(`/${path}`));
		const negative =
			has("src/test/java/witness495/NegativeWitness495Test.java") ||
			has("src/main/java/witness495/Witness495Uncovered.java") ||
			has("witness495/a/Witness495CycleA.java");
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
