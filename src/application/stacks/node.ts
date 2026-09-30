/**
 * The Node stack (CMP-TGT): the controls a `package.json` offers, detected without executing
 * anything. The suite runs under `node --test` unless `scripts.test` declares vitest, mocha or jest
 * run without an argument, each read through the report it writes. A declared lint script becomes a
 * control of its own, refused rather than guessed when it needs a shell. A `scripts.test` that names
 * a runner 495 cannot read leaves no control at all (D-72).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlDefinition } from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import { BASE_ENV, type StackAdapter, type StackDetection } from "./stack.ts";

export const NODE_ADAPTER: StackAdapter = { stack: "node", signal_files: ["package.json"], detect: detectNodeStack };

function detectNodeStack(projectPath: string, requirementRefs: RequirementRef[], nodeBinary: string): StackDetection {
	const pkgPath = join(projectPath, "package.json");
	let pkg: { scripts?: Record<string, string> } = {};
	try {
		pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof pkg;
	} catch {
		/* invalid package.json is a fact, not an error */
	}
	const scripts = pkg.scripts ?? {};
	const suite = suiteOf(typeof scripts.test === "string" ? scripts.test : undefined, requirementRefs, nodeBinary);
	// A runner 495 cannot read leaves no control at all: a protocol frozen on the lint alone would
	// judge nothing of the behaviour the refused runner was there to judge.
	const controls: ControlDefinition[] = suite.control ? [suite.control] : [];
	if (scripts.lint && !suite.refusal)
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
	const witnesses = suite.runner ? witnessesOf(suite.runner, projectPath) : nodeTestWitnesses();
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

type SuiteRunner = "node-test" | "vitest" | "mocha" | "jest";

// The only forms of `scripts.test` 495 reads: a command that starts the runner directly. Anything
// with shell syntax needs a shell, which the sandbox does not give.
const VITEST_COMMAND = /^\s*vitest(\s+run)?\s*$/;
const MOCHA_COMMAND = /^\s*mocha\s*$/;
const JEST_COMMAND = /^\s*jest\s*$/;
const NODE_TEST_COMMAND = /^\s*node\s+--test(\s|$)/;
const READ_RUNNER = /^(vitest|mocha|jest)\s/;
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
	| { runner: SuiteRunner; control: ControlDefinition; refusal?: undefined }
	| { runner?: undefined; control?: undefined; refusal: string } {
	if (scriptsTest === undefined || NODE_TEST_COMMAND.test(scriptsTest))
		return { runner: "node-test", control: nodeTestControl(requirementRefs, nodeBinary) };
	if (VITEST_COMMAND.test(scriptsTest))
		return { runner: "vitest", control: vitestControl(requirementRefs, nodeBinary) };
	if (MOCHA_COMMAND.test(scriptsTest)) return { runner: "mocha", control: mochaControl(requirementRefs, nodeBinary) };
	if (JEST_COMMAND.test(scriptsTest)) return { runner: "jest", control: jestControl(requirementRefs, nodeBinary) };
	const command = scriptsTest.trim();
	if (SHELL_SYNTAX.test(command))
		return { refusal: `scripts.test chains commands through a shell (${command}), which 495 cannot run` };
	const withArguments = READ_RUNNER.exec(command);
	if (withArguments)
		return {
			refusal: `scripts.test runs ${command}, but 495 reads ${withArguments[1]} only when it runs without an argument`,
		};
	return {
		refusal: `scripts.test runs ${command}, whose output 495 cannot read: only node --test, vitest, mocha and jest are read`,
	};
}

/**
 * Where a runner writes its JUnit report. `target/` is excluded from every snapshot by default, so the
 * copy has none: the directory itself is what the control declares writable, because the runner creates
 * the parent of its output file and the sandbox refuses to create a directory it did not open.
 */
const REPORT_DIRECTORY = "target";

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
	const report = `${REPORT_DIRECTORY}/junit.xml`;
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "vitest suite (command read from scripts.test)",
		command: [nodeBinary, "node_modules/vitest/vitest.mjs", "run", "--reporter=junit", `--outputFile=${report}`],
		parser: "junit-xml",
		report_path: report,
		writable_paths: [REPORT_DIRECTORY, "node_modules/.vite-temp"],
		// A narrowed `include` or an added `exclude` would make the suite green without proving anything,
		// and a modified `node_modules/` would change the vitest that judges the candidate.
		protected_paths: [...nodeTest.protected_paths, "vitest.config.*", "vite.config.*", "node_modules/"],
	};
}

/**
 * The mocha the target installed, run from the copy's `node_modules` and never from the host's PATH.
 * Mocha's xunit reporter writes the report itself and creates its parent directory, so `target/` is
 * the only place the control may write.
 */
function mochaControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const report = `${REPORT_DIRECTORY}/mocha-xunit.xml`;
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "mocha suite (command read from scripts.test)",
		command: [nodeBinary, "node_modules/mocha/bin/mocha.js", "--reporter=xunit", `--reporter-option=output=${report}`],
		parser: "junit-xml",
		report_path: report,
		writable_paths: [REPORT_DIRECTORY],
		// A narrowed `spec`, an added reporter or a modified `node_modules/` would make the suite green
		// without proving anything, as they would for vitest.
		protected_paths: [...nodeTest.protected_paths, ".mocharc.*", "node_modules/"],
	};
}

/**
 * Where jest writes its JSON report: a file, not the standard output, where a test or the code it
 * exercises can print before the JSON. It sits at the root of the copy, which is why the control
 * declares that one file writable and nothing around it.
 */
const JEST_REPORT = "495-jest-report.json";

/** The jest the target installed, run from the copy's `node_modules` and never from the host's PATH. */
function jestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "jest suite (command read from scripts.test)",
		command: [nodeBinary, "node_modules/jest/bin/jest.js", "--json", `--outputFile=${JEST_REPORT}`],
		parser: "jest-json",
		report_path: JEST_REPORT,
		writable_paths: [JEST_REPORT],
		// A restricted `testMatch`, a `reporters` entry or a transformer, or a modified `node_modules/`, would
		// make the suite green without proving anything.
		protected_paths: [...nodeTest.protected_paths, "jest.config.*", "node_modules/"],
	};
}

function nodeTestWitnesses(): Witnesses {
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

type Witnesses = { positive: Record<string, string>; negative: Record<string, string> };

/**
 * Witness tests placed where the target keeps its tests: the runner's own discovery decides whether
 * they run. Mocha lends a test file no assertion, so its witnesses pass or fail by throwing; jest
 * and vitest lend `expect`, which vitest has to import.
 */
function testDirectoryWitnesses(
	projectPath: string,
	extension: "js" | "ts",
	sources: { positive: string; negative: string },
): Witnesses {
	const directory = existsSync(join(projectPath, "tests")) ? "tests" : "test";
	return {
		positive: { [`${directory}/495-positive-witness.test.${extension}`]: sources.positive },
		negative: { [`${directory}/495-negative-witness.test.${extension}`]: sources.negative },
	};
}

const POSITIVE_TITLE = "495 positive witness: the runner reports a passing test";
const NEGATIVE_TITLE = "495 negative witness: an injected defect must be detected";

const WITNESS_SOURCES = {
	vitest: {
		extension: "ts",
		positive: `import { expect, it } from "vitest";\nit("${POSITIVE_TITLE}", () => { expect(1).toBe(1); });\n`,
		negative: `import { expect, it } from "vitest";\nit("${NEGATIVE_TITLE}", () => { expect(1).toBe(2); });\n`,
	},
	mocha: {
		extension: "js",
		positive: `it("${POSITIVE_TITLE}", () => { if (1 !== 1) throw new Error("1 is not 1"); });\n`,
		negative: `it("${NEGATIVE_TITLE}", () => { if (1 !== 2) throw new Error("1 is not 2"); });\n`,
	},
	jest: {
		extension: "js",
		positive: `test("${POSITIVE_TITLE}", () => { expect(1).toBe(1); });\n`,
		negative: `test("${NEGATIVE_TITLE}", () => { expect(1).toBe(2); });\n`,
	},
} as const;

function witnessesOf(runner: SuiteRunner, projectPath: string): Witnesses {
	if (runner === "node-test") return nodeTestWitnesses();
	const { extension, ...sources } = WITNESS_SOURCES[runner];
	return testDirectoryWitnesses(projectPath, extension, sources);
}

/** Converts a simple npm script (`node scripts/lint.js`) into an argv; a shell-only script is refused (no implicit shell). */
function commandFromScript(script: string, nodeBinary: string): string[] {
	const parts = script.trim().split(/\s+/);
	if (parts.length === 0) return ["/bin/false"];
	if (/[|&;<>$`]/.test(script)) return ["/bin/sh", "-c", script];
	if (parts[0] === "node") return [nodeBinary, ...parts.slice(1)];
	return parts;
}
