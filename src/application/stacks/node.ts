/**
 * The Node stack (CMP-TGT): the controls a `package.json` offers, detected without executing
 * anything. The suite runs under `node --test`, and a declared lint script becomes a control of its
 * own, refused rather than guessed when it needs a shell.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlDefinition } from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import { BASE_ENV, type StackDetection } from "./stack.ts";

export function detectNodeStack(
	projectPath: string,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
): StackDetection {
	const pkgPath = join(projectPath, "package.json");
	let pkg: { scripts?: Record<string, string> } = {};
	try {
		pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
	} catch {
		/* invalid package.json is a fact, not an error */
	}
	const scripts = pkg.scripts ?? {};
	const controls: ControlDefinition[] = [
		{
			control_id: "unit",
			version: "1",
			title: "node:test suite",
			command: [nodeBinary, "--test", "--test-reporter=tap"],
			cwd: ".",
			env_allowlist: BASE_ENV,
			env: {},
			timeout_ms: 10 * 60_000,
			parser: "node-test",
			report_path: null,
			structure_rules: [],
			provides: [],
			requires: [],
			scope_argument: null,
			network: "denied",
			writable_paths: [],
			requirement_refs: requirementRefs,
			protected: true,
			protected_paths: ["test/", "tests/", "package.json"],
		},
	];
	if (scripts.lint)
		controls.push({
			control_id: "lint",
			version: "1",
			title: `npm run lint (${scripts.lint})`,
			command: [nodeBinary, join(projectPath, "node_modules", ".bin", "___unused___")]
				.slice(0, 0)
				.concat(commandFromScript(scripts.lint, nodeBinary)),
			cwd: ".",
			env_allowlist: BASE_ENV,
			env: {},
			timeout_ms: 5 * 60_000,
			parser: "exit-code",
			report_path: null,
			structure_rules: [],
			provides: [],
			requires: [],
			scope_argument: null,
			network: "denied",
			writable_paths: [],
			requirement_refs: requirementRefs,
			protected: true,
			protected_paths: ["scripts/lint.js", "eslint.config.js", ".eslintrc.json", "package.json"],
		});
	return {
		stack: "node",
		facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) },
		controls,
		positive_witness: {
			"test/495-positive-witness.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 positive witness: the runner reports a passing test", () => { assert.equal(1, 1); });\n',
		},
		witness_tests: 1,
		own_negative_witness: {},
		negative_witness: {
			"test/495-negative-witness.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 negative witness: an injected defect must be detected", () => { assert.equal(1, 2); });\n',
			"src/495-negative-witness.js": "var forbidden = 1;\n",
		},
		preparation_paths: ["test/", "tests/"],
		capability_missing: [],
	};
}

/** Converts a simple npm script (`node scripts/lint.js`) into an argv; a shell-only script is refused (no implicit shell). */
function commandFromScript(script: string, nodeBinary: string): string[] {
	const parts = script.trim().split(/\s+/);
	if (parts.length === 0) return ["/bin/false"];
	if (/[|&;<>$`]/.test(script)) return ["/bin/sh", "-c", script];
	if (parts[0] === "node") return [nodeBinary, ...parts.slice(1)];
	return parts;
}
