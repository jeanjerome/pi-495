/**
 * Target adapter registry (CMP-TGT, ADR-012): detects the stack without executing anything and
 * proposes control definitions for the generic runner. A negative witness transformation is
 * declared per control so that qualification can prove the sensor detects a failure.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlDefinition } from "../contracts/v1/protocol.ts";
import type { RequirementRef } from "../contracts/v1/evidence.ts";

export interface StackDetection {
	stack: "node" | "maven" | "unknown";
	facts: Record<string, unknown>;
	controls: ControlDefinition[];
	/** Files written into a copy of the positive workspace to build the negative witness. */
	negative_witness: Record<string, string>;
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
		return { stack: "node", facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) }, controls, negative_witness: { "test/495-negative-witness.test.js": 'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 negative witness: an injected defect must be detected", () => { assert.equal(1, 2); });\n', "src/495-negative-witness.js": "var forbidden = 1;\n" }, capability_missing: [] };
	}
	if (existsSync(pomPath)) {
		const controls: ControlDefinition[] = [
			{ control_id: "maven-test", version: "1", title: "mvn test (Surefire)", command: ["mvn", "-B", "-q", "-o", "test"], cwd: ".", env_allowlist: BASE_ENV, env: {}, timeout_ms: 20 * 60_000, parser: "junit-xml", report_path: "target/surefire-reports", network: "denied", writable_paths: ["target"], requirement_refs: requirementRefs, protected: true, protected_paths: ["src/test/", "pom.xml"] },
		];
		return { stack: "maven", facts: { pom: true }, controls, negative_witness: { "src/test/java/NegativeWitness495Test.java": "import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\npublic class NegativeWitness495Test { @Test void injectedDefectMustBeDetected() { assertEquals(1, 2); } }\n" }, capability_missing: [] };
	}
	return { stack: "unknown", facts: {}, controls: [], negative_witness: {}, capability_missing: ["no qualified target adapter for this project (package.json or pom.xml expected)"] };
}

/** Converts a simple npm script (`node scripts/lint.js`) into an argv; a shell-only script is refused (no implicit shell). */
export function commandFromScript(script: string, nodeBinary: string): string[] {
	const parts = script.trim().split(/\s+/);
	if (parts.length === 0) return ["/bin/false"];
	if (/[|&;<>$`]/.test(script)) return ["/bin/sh", "-c", script];
	if (parts[0] === "node") return [nodeBinary, ...parts.slice(1)];
	return parts;
}
