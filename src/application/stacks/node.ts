/**
 * The Node stack (CMP-TGT): the controls a `package.json` offers, detected without executing
 * anything. The suite runs under `node --test` unless `scripts.test` declares vitest, and a declared
 * lint script becomes a control of its own, refused rather than guessed when it needs a shell.
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
	const suite = suiteOf(typeof scripts.test === "string" ? scripts.test : undefined, requirementRefs, nodeBinary);
	const controls: ControlDefinition[] = suite.control ? [suite.control] : [];
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
	const witnesses = suite.runner === "vitest" ? vitestWitnesses(projectPath) : nodeTestWitnesses();
	return {
		stack: "node",
		facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) },
		controls,
		positive_witness: witnesses.positive,
		witness_tests: 1,
		own_negative_witness: {},
		negative_witness: { ...witnesses.negative, "src/495-negative-witness.js": "var forbidden = 1;\n" },
		preparation_paths: ["test/", "tests/"],
		capability_missing: suite.refusal ? [suite.refusal] : [],
	};
}

// The only forms of `scripts.test` 495 reads: a command that starts the runner directly. Anything
// with shell syntax needs a shell, which the sandbox does not give.
const VITEST_COMMAND = /^\s*vitest(\s+run)?\s*$/;
const NODE_TEST_COMMAND = /^\s*node\s+--test(\s|$)/;
const SHELL_SYNTAX = /[|&;<>$`()]/;

/**
 * The unit control `scripts.test` declares, or why there is none: a control whose reader is not
 * qualified on the output it reads is worth less than no control, so a runner 495 cannot read is
 * named instead of being run under the wrong reader.
 */
function suiteOf(
	scriptsTest: string | undefined,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
):
	| { runner: "node-test" | "vitest"; control: ControlDefinition; refusal?: undefined }
	| { runner?: undefined; control?: undefined; refusal: string } {
	if (scriptsTest === undefined || NODE_TEST_COMMAND.test(scriptsTest))
		return { runner: "node-test", control: nodeTestControl(requirementRefs, nodeBinary) };
	if (VITEST_COMMAND.test(scriptsTest))
		return { runner: "vitest", control: vitestControl(requirementRefs, nodeBinary) };
	const command = scriptsTest.trim();
	if (SHELL_SYNTAX.test(command))
		return { refusal: `scripts.test chains commands through a shell (${command}), which 495 cannot run` };
	return {
		refusal: `scripts.test runs ${command}, whose output 495 cannot read: only node --test and vitest [run] are read`,
	};
}

/**
 * Where vitest writes its JUnit report. `target/` is excluded from every snapshot by default, so the
 * copy has none: the directory itself is what the control declares writable, because vitest creates
 * the parent of its output file and the sandbox refuses to create a directory it did not open.
 */
const VITEST_REPORT_DIRECTORY = "target";

function nodeTestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	return {
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
	};
}

/**
 * The vitest the target installed, run from the copy's `node_modules` and never from the host's PATH,
 * so the control judges the version the target declared. Vite bundles its configuration under
 * `node_modules/.vite-temp`, which is why that directory is writable next to the report.
 */
function vitestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const report = `${VITEST_REPORT_DIRECTORY}/junit.xml`;
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "vitest suite (command read from scripts.test)",
		command: [nodeBinary, "node_modules/vitest/vitest.mjs", "run", "--reporter=junit", `--outputFile=${report}`],
		parser: "junit-xml",
		report_path: report,
		writable_paths: [VITEST_REPORT_DIRECTORY, "node_modules/.vite-temp"],
		// A narrowed `include` or an added `exclude` would make the suite green without proving anything,
		// and a modified `node_modules/` would change the vitest that judges the candidate.
		protected_paths: [...nodeTest.protected_paths, "vitest.config.*", "vite.config.*", "node_modules/"],
	};
}

function nodeTestWitnesses(): { positive: Record<string, string>; negative: Record<string, string> } {
	return {
		positive: {
			"test/495-positive-witness.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 positive witness: the runner reports a passing test", () => { assert.equal(1, 1); });\n',
		},
		negative: {
			"test/495-negative-witness.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 negative witness: an injected defect must be detected", () => { assert.equal(1, 2); });\n',
		},
	};
}

/** Vitest tests, placed where the target keeps its tests: its `include` is what decides whether they run. */
function vitestWitnesses(projectPath: string): { positive: Record<string, string>; negative: Record<string, string> } {
	const directory = existsSync(join(projectPath, "tests")) ? "tests" : "test";
	return {
		positive: {
			[`${directory}/495-positive-witness.test.ts`]:
				'import { expect, it } from "vitest";\nit("495 positive witness: the runner reports a passing test", () => { expect(1).toBe(1); });\n',
		},
		negative: {
			[`${directory}/495-negative-witness.test.ts`]:
				'import { expect, it } from "vitest";\nit("495 negative witness: an injected defect must be detected", () => { expect(1).toBe(2); });\n',
		},
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
