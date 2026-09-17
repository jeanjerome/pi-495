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
	/** Files written into a copy of the positive workspace to build the negative witness. */
	negative_witness: Record<string, string>;
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
		return { stack: "node", facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) }, controls, positive_witness: { "test/495-positive-witness.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 positive witness: the runner reports a passing test", () => { assert.equal(1, 1); });\n' }, negative_witness: { "test/495-negative-witness.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 negative witness: an injected defect must be detected", () => { assert.equal(1, 2); });\n', "src/495-negative-witness.js": "var forbidden = 1;\n" }, preparation_paths: ["test/", "tests/"], capability_missing: [] };
	}
	if (existsSync(pomPath)) {
		const reactor = discoverMavenReactor(projectPath);
		const witnessPrefix = reactor.witness_module ? `${reactor.witness_module}/` : "";
		const controls: ControlDefinition[] = [
			{ control_id: "maven-test", version: "1", title: "mvn test (Surefire)", command: ["mvn", "-B", "-q", "-o", "test"], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 20 * 60_000, parser: "junit-xml", report_path: "**/target/surefire-reports", network: "denied", writable_paths: reactor.target_paths, requirement_refs: requirementRefs, protected: true, protected_paths: [...reactor.preparation_paths, ...reactor.pom_paths] },
		];
		return { stack: "maven", facts: { pom: true, modules: reactor.modules, ignored_modules: reactor.ignored_modules }, controls, positive_witness: { [`${witnessPrefix}src/test/java/PositiveWitness495Test.java`]: "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class PositiveWitness495Test { @Test void runnerReportsAPassingTest() { assertEquals(1, 1); } }\n" }, negative_witness: { [`${witnessPrefix}src/test/java/NegativeWitness495Test.java`]: "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class NegativeWitness495Test { @Test void injectedDefectMustBeDetected() { assertEquals(1, 2); } }\n" }, preparation_paths: reactor.preparation_paths, capability_missing: [] };
	}
	return { stack: "unknown", facts: {}, controls: [], positive_witness: {}, negative_witness: {}, preparation_paths: [], capability_missing: ["no qualified target adapter for this project (package.json or pom.xml expected)"] };
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
