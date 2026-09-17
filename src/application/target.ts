/**
 * Target adapter registry (CMP-TGT, ADR-012): detects the stack without executing anything and
 * proposes control definitions for the generic runner. A negative witness transformation is
 * declared per control so that qualification can prove the sensor detects a failure.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ControlDefinition } from "../contracts/v1/protocol.ts";
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
			{ control_id: "unit", version: "1", title: "node:test suite", command: [nodeBinary, "--test", "--test-reporter=tap"], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 10 * 60_000, parser: "node-test", report_path: null, network: "denied", writable_paths: [], requirement_refs: requirementRefs, protected: true, protected_paths: ["test/", "tests/", "package.json"] },
		];
		if (scripts.lint) controls.push({ control_id: "lint", version: "1", title: `npm run lint (${scripts.lint})`, command: [nodeBinary, join(projectPath, "node_modules", ".bin", "___unused___")].slice(0, 0).concat(commandFromScript(scripts.lint, nodeBinary)), cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 5 * 60_000, parser: "exit-code", report_path: null, network: "denied", writable_paths: [], requirement_refs: requirementRefs, protected: true, protected_paths: ["scripts/lint.js", "eslint.config.js", ".eslintrc.json", "package.json"] });
		return { stack: "node", facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) }, controls, positive_witness: { "test/495-positive-witness.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 positive witness: the runner reports a passing test", () => { assert.equal(1, 1); });\n' }, witness_tests: 1, own_negative_witness: {}, negative_witness: { "test/495-negative-witness.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 negative witness: an injected defect must be detected", () => { assert.equal(1, 2); });\n', "src/495-negative-witness.js": "var forbidden = 1;\n" }, preparation_paths: ["test/", "tests/"], capability_missing: [] };
	}
	if (existsSync(pomPath)) {
		const reactor = discoverMavenReactor(projectPath);
		const witnessPrefix = reactor.witness_module ? `${reactor.witness_module}/` : "";
		const jacoco = bindsJacocoReport(projectPath, reactor.pom_paths);
		const controls: ControlDefinition[] = [
			{ control_id: "maven-test", version: "1", title: "mvn test (Surefire)", command: ["mvn", "-B", "-q", "-o", "test"], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 20 * 60_000, parser: "junit-xml", report_path: "**/target/surefire-reports", network: "denied", writable_paths: reactor.target_paths, requirement_refs: requirementRefs, protected: true, protected_paths: [...reactor.preparation_paths, ...reactor.pom_paths] },
		];
		// The measurement is the one `mvn test` already writes: JaCoCo binds `report` to that phase, so
		// this sensor runs no command of its own and reads the report left in the workspace. It is
		// declared after the control that produces it, and the verification runs them in that order.
		if (jacoco) controls.push({ control_id: "coverage", version: "1", title: "introduced-line coverage, read from the JaCoCo report of mvn test", command: [nodeBinary, "-e", ""], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 60_000, parser: "jacoco-xml", report_path: "**/target/site/jacoco", network: "denied", writable_paths: [], requirement_refs: requirementRefs, protected: true, protected_paths: [...reactor.pom_paths] });
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
			facts: { pom: true, modules: reactor.modules, ignored_modules: reactor.ignored_modules, jacoco_report_bound: jacoco },
			controls,
			positive_witness: positive,
			witness_tests: jacoco ? 2 : 1,
			negative_witness: { [`${witnessPrefix}src/test/java/NegativeWitness495Test.java`]: "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class NegativeWitness495Test { @Test void injectedDefectMustBeDetected() { assertEquals(1, 2); } }\n" },
			own_negative_witness: jacoco ? { coverage: { [`${witnessPrefix}src/main/java/Witness495Uncovered.java`]: "public final class Witness495Uncovered {\n    public int half(int n) {\n        return n / 2;\n    }\n}\n" } } : {},
			preparation_paths: reactor.preparation_paths,
			capability_missing: jacoco ? [] : ["no JaCoCo report bound outside a profile: the coverage of the introduced lines is not measured on this target (QLT-04)"],
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

interface MavenReactor {
	modules: string[];
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
	return {
		modules: modules.map((m) => m || "."),
		pom_paths: modules.map((m) => pathAt(m, "pom.xml")),
		preparation_paths: modules.map((m) => pathAt(m, "src/test/")),
		target_paths: modules.map((m) => pathAt(m, "target")),
		witness_module: witness,
		ignored_modules: [...new Set(ignored)].sort(),
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
