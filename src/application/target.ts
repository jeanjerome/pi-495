/**
 * Target adapter registry (CMP-TGT, ADR-012): detects the stack without executing anything and
 * proposes control definitions for the generic runner. A negative witness transformation is
 * declared per control so that qualification can prove the sensor detects a failure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ControlDefinition, StructureRule } from "../contracts/v1/protocol.ts";
import type { RequirementRef } from "../contracts/v1/evidence.ts";

export interface StackDetection {
	stack: "node" | "maven" | "unknown";
	facts: Record<string, unknown>;
	controls: ControlDefinition[];
	/** Files written into a copy of the reference to build the positive witness (a passing test exercising the runner). */
	positive_witness: Record<string, string>;
	/** Test cases the positive witness adds to the suite; they say nothing about what the reference itself covers. */
	witness_tests: number;
	/** Files written into a copy of the positive workspace to build the negative witness. */
	negative_witness: Record<string, string>;
	/**
	 * Negative witness of one control when the shared one does not exhibit the defect it claims to
	 * detect. A test control is proved by a failing test; a coverage control cannot be — a failing
	 * suite stops the build before the measurement is written, and an unexercised line is not a
	 * failure. Such a control gets its own witness workspace, built on the positive one.
	 */
	own_negative_witness: Record<string, Record<string, string>>;
	/** Explicit directories in which a preparation intervention may add tests and test resources. */
	preparation_paths: string[];
	capability_missing: string[];
}

const BASE_ENV = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "JAVA_HOME", "MAVEN_OPTS"];

export function detectStack(projectPath: string, requirementRefs: RequirementRef[], nodeBinary = process.execPath): StackDetection {
	const pkgPath = join(projectPath, "package.json");
	const pomPath = join(projectPath, "pom.xml");
	if (existsSync(pkgPath)) {
		let pkg: { scripts?: Record<string, string> } = {};
		try {
			pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
		} catch {
			/* invalid package.json is a fact, not an error */
		}
		const scripts = pkg.scripts ?? {};
		const controls: ControlDefinition[] = [
			{ control_id: "unit", version: "1", title: "node:test suite", command: [nodeBinary, "--test", "--test-reporter=tap"], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 10 * 60_000, parser: "node-test", report_path: null, structure_rules: [], network: "denied", writable_paths: [], requirement_refs: requirementRefs, protected: true, protected_paths: ["test/", "tests/", "package.json"] },
		];
		if (scripts.lint) controls.push({ control_id: "lint", version: "1", title: `npm run lint (${scripts.lint})`, command: [nodeBinary, join(projectPath, "node_modules", ".bin", "___unused___")].slice(0, 0).concat(commandFromScript(scripts.lint, nodeBinary)), cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 5 * 60_000, parser: "exit-code", report_path: null, structure_rules: [], network: "denied", writable_paths: [], requirement_refs: requirementRefs, protected: true, protected_paths: ["scripts/lint.js", "eslint.config.js", ".eslintrc.json", "package.json"] });
		return { stack: "node", facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) }, controls, positive_witness: { "test/495-positive-witness.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 positive witness: the runner reports a passing test", () => { assert.equal(1, 1); });\n' }, witness_tests: 1, own_negative_witness: {}, negative_witness: { "test/495-negative-witness.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 negative witness: an injected defect must be detected", () => { assert.equal(1, 2); });\n', "src/495-negative-witness.js": "var forbidden = 1;\n" }, preparation_paths: ["test/", "tests/"], capability_missing: [] };
	}
	if (existsSync(pomPath)) {
		const reactor = discoverMavenReactor(projectPath);
		const witnessPrefix = reactor.witness_module ? `${reactor.witness_module}/` : "";
		const jacoco = bindsJacocoReport(projectPath, reactor.pom_paths);
		const rules = structureRules(reactor);
		const controls: ControlDefinition[] = [
			{ control_id: "maven-test", version: "1", title: "mvn test (Surefire)", command: ["mvn", "-B", "-q", "-o", "test"], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 20 * 60_000, parser: "junit-xml", report_path: "**/target/surefire-reports", structure_rules: [], network: "denied", writable_paths: reactor.target_paths, requirement_refs: requirementRefs, protected: true, protected_paths: [...reactor.preparation_paths, ...reactor.pom_paths] },
		];
		// The measurement is the one `mvn test` already writes: JaCoCo binds `report` to that phase, so
		// this sensor runs no command of its own and reads the report left in the workspace. It is
		// declared after the control that produces it, and the verification runs them in that order.
		if (jacoco) controls.push({ control_id: "coverage", version: "1", title: "introduced-line coverage, read from the JaCoCo report of mvn test", command: [nodeBinary, "-e", ""], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 60_000, parser: "jacoco-xml", report_path: "**/target/site/jacoco", structure_rules: [], network: "denied", writable_paths: [], requirement_refs: requirementRefs, protected: true, protected_paths: [...reactor.pom_paths] });
		// The architecture is read from what the target itself declares — the reactor, the dependency
		// direction of its POMs, the package root each module lays out — and frozen here. The producer
		// receives the boundaries in its context and never the rules: a boundary it could edit in the
		// tree would be a suggestion, and ARC-04 asks for the opposite.
		if (rules.length > 0) controls.push({ control_id: "structure", version: "1", title: "frozen architecture boundaries, read from the Java declarations", command: [nodeBinary, "-e", ""], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 120_000, parser: "java-imports", report_path: null, structure_rules: rules, network: "denied", writable_paths: [], requirement_refs: requirementRefs, protected: true, protected_paths: [...reactor.pom_paths] });
		const positive: Record<string, string> = {
			[`${witnessPrefix}src/test/java/PositiveWitness495Test.java`]: jacoco
				? "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class PositiveWitness495Test {\n    @Test void runnerReportsAPassingTest() { assertEquals(1, 1); }\n    @Test void introducedCodeIsExercised() { assertEquals(4, new Witness495Covered().twice(2)); }\n}\n"
				: "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class PositiveWitness495Test { @Test void runnerReportsAPassingTest() { assertEquals(1, 1); } }\n",
		};
		// The coverage witnesses are introduced production code, not tests: one class the suite calls,
		// one it never calls. The defect this control claims to detect is the second, and a failing test
		// would not exhibit it — it would stop the build before the measurement is written.
		if (jacoco) positive[`${witnessPrefix}src/main/java/Witness495Covered.java`] = "public final class Witness495Covered {\n    public int twice(int n) {\n        return n * 2;\n    }\n}\n";
		return {
			stack: "maven",
			facts: { pom: true, modules: reactor.modules, ignored_modules: reactor.ignored_modules, jacoco_report_bound: jacoco, architecture_rules: rules.map((rule) => rule.rule_id) },
			controls,
			positive_witness: positive,
			witness_tests: jacoco ? 2 : 1,
			negative_witness: { [`${witnessPrefix}src/test/java/NegativeWitness495Test.java`]: "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class NegativeWitness495Test { @Test void injectedDefectMustBeDetected() { assertEquals(1, 2); } }\n" },
			own_negative_witness: {
				...(jacoco ? { coverage: { [`${witnessPrefix}src/main/java/Witness495Uncovered.java`]: "public final class Witness495Uncovered {\n    public int half(int n) {\n        return n / 2;\n    }\n}\n" } } : {}),
				// A failing test proves nothing about a boundary: the tree that carries this defect is one
				// where a module imports what it declares no dependency on, and it compiles nowhere.
				...(rules.length > 0 ? { structure: structureNegativeWitness(rules) } : {}),
			},
			preparation_paths: reactor.preparation_paths,
			capability_missing: [
				...(jacoco ? [] : ["no JaCoCo report bound outside a profile: the coverage of the introduced lines is not measured on this target (QLT-04)"]),
				...(rules.some((rule) => rule.kind === "forbidden_dependency") ? [] : ["no two modules of this reactor lay out package roots that could be opposed to each other: no dependency direction between modules is checked on this target (CON-03)"]),
			],
		};
	}
	return { stack: "unknown", facts: {}, controls: [], positive_witness: {}, witness_tests: 0, negative_witness: {}, own_negative_witness: {}, preparation_paths: [], capability_missing: ["no qualified target adapter for this project (package.json or pom.xml expected)"] };
}

/**
 * Whether `mvn test` leaves a coverage report behind: the JaCoCo plugin with its `report` goal bound
 * outside any profile. Inside a profile, the report exists only when that profile is activated, which
 * the control cannot assume — and a sensor that silently finds no measurement is worth nothing.
 */
export function bindsJacocoReport(projectPath: string, pomPaths: readonly string[]): boolean {
	for (const rel of pomPaths) {
		let xml = "";
		try { xml = readFileSync(join(projectPath, rel), "utf8"); } catch { continue; }
		const outsideProfiles = xml.replace(/<profiles\b[\s\S]*?<\/profiles>/g, "");
		if (/jacoco-maven-plugin/.test(outsideProfiles) && /<goal>\s*report\s*<\/goal>/.test(outsideProfiles)) return true;
	}
	return false;
}

export interface MavenModule {
	/** Module directory relative to the reactor root; empty for the root module. */
	path: string;
	artifact_id: string | null;
	/** Artifact ids of the reactor modules this POM declares as dependencies, outside any profile. */
	depends_on: string[];
	/** The package root the module's own layout declares, when its sources share one. */
	package_root: string | null;
	/** Workspace-relative main source root, when the module has one. */
	source_root: string | null;
}

interface MavenReactor {
	modules: string[];
	module_info: MavenModule[];
	pom_paths: string[];
	preparation_paths: string[];
	target_paths: string[];
	witness_module: string;
	ignored_modules: string[];
}

/** Discovers the root project and every reachable `<module>` without executing Maven. */
export function discoverMavenReactor(projectPath: string): MavenReactor {
	const root = resolve(projectPath);
	const queue = [""];
	const seen = new Set<string>();
	const children = new Map<string, string[]>();
	const identities = new Map<string, { artifact_id: string | null; dependencies: string[] }>();
	const ignored: string[] = [];
	while (queue.length > 0) {
		const module = queue.shift()!;
		if (seen.has(module)) continue;
		const pom = join(root, module, "pom.xml");
		if (!existsSync(pom)) {
			ignored.push(module || ".");
			continue;
		}
		seen.add(module);
		let xml = "";
		try { xml = readFileSync(pom, "utf8"); } catch { ignored.push(module || "."); continue; }
		identities.set(module, pomIdentity(xml));
		const nested: string[] = [];
		for (const block of xml.matchAll(/<modules\b[^>]*>([\s\S]*?)<\/modules>/g)) {
			for (const match of (block[1] ?? "").matchAll(/<module\b[^>]*>([\s\S]*?)<\/module>/g)) {
				const raw = (match[1] ?? "").trim();
				if (!raw || raw.includes("${")) { if (raw) ignored.push(raw); continue; }
				const absolute = resolve(root, module, raw);
				const rel = relative(root, absolute);
				if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) { ignored.push(raw); continue; }
				const normal = rel.split(sep).join("/");
				if (!existsSync(join(root, normal, "pom.xml"))) { ignored.push(normal); continue; }
				nested.push(normal);
			}
		}
		const unique = [...new Set(nested)].sort();
		children.set(module, unique);
		queue.push(...unique);
	}
	const modules = [...seen].sort((a, b) => a === "" ? -1 : b === "" ? 1 : a.localeCompare(b));
	const pathAt = (module: string, suffix: string) => module ? `${module}/${suffix}` : suffix;
	const leaves = modules.filter((m) => (children.get(m)?.length ?? 0) === 0);
	const witness = leaves.find((m) => m !== "") ?? "";
	const reactorArtifacts = new Set([...identities.values()].map((identity) => identity.artifact_id).filter((id): id is string => id !== null));
	return {
		modules: modules.map((m) => m || "."),
		module_info: modules.map((m) => {
			const identity = identities.get(m) ?? { artifact_id: null, dependencies: [] };
			const sourceRoot = pathAt(m, "src/main/java");
			const hasSources = existsSync(join(root, sourceRoot));
			return {
				path: m,
				artifact_id: identity.artifact_id,
				depends_on: identity.dependencies.filter((id) => reactorArtifacts.has(id)).sort(),
				package_root: hasSources ? packageRootOf(join(root, sourceRoot)) : null,
				source_root: hasSources ? `${sourceRoot}/` : null,
			};
		}),
		pom_paths: modules.map((m) => pathAt(m, "pom.xml")),
		preparation_paths: modules.map((m) => pathAt(m, "src/test/")),
		target_paths: modules.map((m) => pathAt(m, "target")),
		witness_module: witness,
		ignored_modules: [...new Set(ignored)].sort(),
	};
}

/**
 * What a POM declares about itself: its own artifact and the artifacts it depends on. The blocks a
 * dependency may hide in without `mvn test` resolving it — the parent coordinates, managed versions,
 * plugin dependencies and profiles — are removed first: a dependency that exists only under an
 * activated profile is not one the reactor guarantees, the same reading `bindsJacocoReport` applies.
 */
export function pomIdentity(xml: string): { artifact_id: string | null; dependencies: string[] } {
	const own = xml
		.replace(/<parent\b[\s\S]*?<\/parent>/g, "")
		.replace(/<dependencyManagement\b[\s\S]*?<\/dependencyManagement>/g, "")
		.replace(/<build\b[\s\S]*?<\/build>/g, "")
		.replace(/<profiles\b[\s\S]*?<\/profiles>/g, "")
		.replace(/<reporting\b[\s\S]*?<\/reporting>/g, "");
	const dependencies: string[] = [];
	for (const block of own.matchAll(/<dependencies\b[^>]*>([\s\S]*?)<\/dependencies>/g)) {
		for (const match of (block[1] ?? "").matchAll(/<artifactId\b[^>]*>([\s\S]*?)<\/artifactId>/g)) {
			const id = (match[1] ?? "").trim();
			if (id && !id.includes("${")) dependencies.push(id);
		}
	}
	const withoutDependencies = own.replace(/<dependencies\b[\s\S]*?<\/dependencies>/g, "");
	const artifact = /<artifactId\b[^>]*>([\s\S]*?)<\/artifactId>/.exec(withoutDependencies)?.[1]?.trim() ?? null;
	return { artifact_id: artifact && !artifact.includes("${") ? artifact : null, dependencies: [...new Set(dependencies)] };
}

/**
 * The package root a source tree lays out: the directory chain below the source root that holds no
 * source of its own and branches nowhere. `src/main/java/io/scalastic/demo/domain` with two
 * subdirectories under it declares `io.scalastic.demo.domain`; a tree whose sources sit in the
 * default package declares nothing, and nothing is what this returns.
 */
export function packageRootOf(sourceRoot: string): string | null {
	const segments: string[] = [];
	let current = sourceRoot;
	for (let depth = 0; depth < 32; depth++) {
		let entries: string[];
		try { entries = readdirSync(current).filter((name) => !name.startsWith(".")); } catch { break; }
		const directories = entries.filter((name) => { try { return statSync(join(current, name)).isDirectory(); } catch { return false; } });
		if (directories.length !== 1 || directories.length !== entries.length) break;
		segments.push(directories[0]!);
		current = join(current, directories[0]!);
	}
	return segments.length > 0 ? segments.join(".") : null;
}

/**
 * Package families a module shares with everything that depends on it: a container, an ORM, a web
 * framework. Their absence from a core module is what makes it testable and portable on its own;
 * their presence is not a defect of this analyser's making, and a module that already carries one
 * keeps it as a named preexisting finding.
 */
export const FRAMEWORK_PACKAGES = ["org.springframework", "jakarta.", "javax.", "org.hibernate", "io.cucumber", "com.fasterxml.jackson", "io.quarkus", "io.micronaut"];

/**
 * The architecture rules a Maven reactor opposes to its own code (ARC-01, ARC-04, CON-03).
 *
 * Nothing here is a style preference. Each rule restates a declaration the target already made: the
 * dependency direction its POMs fix, the package root each module lays out, and the elementary
 * property that two packages importing each other are one package. A reactor that declares nothing
 * gets no rule, and the insufficiency is recorded rather than replaced by a convention.
 */
export function structureRules(reactor: MavenReactor): StructureRule[] {
	const modules = reactor.module_info.filter((m) => m.artifact_id !== null && m.package_root !== null && m.source_root !== null);
	const rules: StructureRule[] = [];
	for (const module of modules) {
		for (const other of modules) {
			if (other.path === module.path || other.package_root === module.package_root) continue;
			if (module.depends_on.includes(other.artifact_id!)) continue;
			// Nested package roots cannot be told apart by an import: `io.x.domain.spi` is under
			// `io.x.domain`, so forbidding the second would forbid the first module's own sources.
			if (module.package_root!.startsWith(`${other.package_root}.`) || other.package_root!.startsWith(`${module.package_root}.`)) continue;
			rules.push({
				rule_id: `structure:module-boundary:${module.path || "."}->${other.path || "."}`,
				kind: "forbidden_dependency",
				statement: `module ${module.artifact_id} declares no dependency on module ${other.artifact_id}, whose sources are laid out under ${other.package_root}`,
				scope: [module.source_root!],
				forbidden: [other.package_root!],
			});
		}
	}
	// The module that depends on no other and that others build on is the one every dependent module
	// inherits from: a framework imported there is a framework they all carry.
	const core = modules.find((m) => m.depends_on.length === 0 && modules.some((other) => other.path !== m.path && other.depends_on.includes(m.artifact_id!)));
	if (core) rules.push({ rule_id: `structure:framework-independence:${core.path || "."}`, kind: "forbidden_dependency", statement: `module ${core.artifact_id} declares no dependency on another module of the reactor and the others build on it, so a framework or container imported there is one they all carry`, scope: [core.source_root!], forbidden: [...FRAMEWORK_PACKAGES] });
	// A cycle needs no second module to exist, and no declaration to be read as one: two packages that
	// import each other are a fact of the tree, whatever the reactor looks like.
	const scopes = reactor.module_info.map((m) => m.source_root).filter((root): root is string => root !== null);
	if (scopes.length > 0) rules.push({ rule_id: "structure:package-cycle", kind: "no_cycle", statement: "two packages that import each other are one unit, which cannot be changed, tested, replaced or extracted apart", scope: scopes, forbidden: [] });
	return rules;
}

/**
 * The tree that carries the defect the structural control claims to detect (VER-05). The shared
 * negative witness of a Maven target is a failing test, which says nothing about a boundary: this
 * one is a source of a module importing exactly what that module declares no dependency on. It is
 * never compiled — a boundary is read in the declarations, not in a build.
 */
export function structureNegativeWitness(rules: readonly StructureRule[]): Record<string, string> {
	const boundary = rules.find((rule) => rule.kind === "forbidden_dependency" && rule.scope.length > 0 && rule.forbidden.length > 0);
	if (boundary) {
		const forbidden = `${boundary.forbidden[0]!.replace(/\.$/, "")}.Witness495Forbidden`;
		return { [`${boundary.scope[0]}witness495/Witness495Boundary.java`]: `package witness495;\n\nimport ${forbidden};\n\npublic final class Witness495Boundary {\n    private Witness495Boundary() {}\n}\n` };
	}
	const cycle = rules.find((rule) => rule.kind === "no_cycle" && rule.scope.length > 0);
	if (!cycle) return {};
	return {
		[`${cycle.scope[0]}witness495/a/Witness495CycleA.java`]: "package witness495.a;\n\nimport witness495.b.Witness495CycleB;\n\npublic final class Witness495CycleA {\n    private Witness495CycleA() {}\n}\n",
		[`${cycle.scope[0]}witness495/b/Witness495CycleB.java`]: "package witness495.b;\n\nimport witness495.a.Witness495CycleA;\n\npublic final class Witness495CycleB {\n    private Witness495CycleB() {}\n}\n",
	};
}

/** Converts a simple npm script (`node scripts/lint.js`) into an argv; a shell-only script is refused (no implicit shell). */
export function commandFromScript(script: string, nodeBinary: string): string[] {
	const parts = script.trim().split(/\s+/);
	if (parts.length === 0) return ["/bin/false"];
	if (/[|&;<>$`]/.test(script)) return ["/bin/sh", "-c", script];
	if (parts[0] === "node") return [nodeBinary, ...parts.slice(1)];
	return parts;
}
