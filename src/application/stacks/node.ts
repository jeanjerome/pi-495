/**
 * The Node stack (CMP-TGT): the controls a `package.json` offers, detected without executing
 * anything. The suite runs under `node --test` unless `scripts.test` declares vitest, mocha or jest
 * run without an argument, each read through the report it writes. A declared lint script becomes a
 * control of its own, refused rather than guessed when it needs a shell. A `scripts.test` that names
 * a runner 495 cannot read leaves no control at all (D-72). A target that asks its runner for
 * coverage receives a control that judges the lines a change introduces from the LCOV report the
 * runner writes; one that does not is told so instead (QLT-04).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlDefinition } from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import { BASE_ENV, emptyTrigger, type StackAdapter, type StackDetection } from "./stack.ts";

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
	const suite = suiteOf(
		projectPath,
		typeof scripts.test === "string" ? scripts.test : undefined,
		requirementRefs,
		nodeBinary,
	);
	// A runner 495 cannot read leaves no control at all: a protocol frozen on the lint alone would
	// judge nothing of the behaviour the refused runner was there to judge.
	const controls: ControlDefinition[] = suite.control ? [suite.control] : [];
	if (suite.coverage?.control) controls.push(suite.coverage.control);
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
	const measured = suite.coverage?.control && suite.runner ? coverageWitnesses(suite.runner, projectPath) : null;
	return {
		stack: "node",
		facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) },
		controls,
		positive_witness: { ...witnesses.positive, ...measured?.positive },
		witness_tests: measured ? 2 : 1,
		own_negative_witness: measured ? { coverage: measured.uncovered } : {},
		negative_witness: { ...witnesses.negative, "src/495-negative-witness.js": "var forbidden = 1;\n" },
		preparation_paths: ["test/", "tests/"],
		capability_missing: suite.refusal ? [suite.refusal] : (suite.coverage?.missing ?? []),
	};
}

type SuiteRunner = "node-test" | "vitest" | "mocha" | "jest";

// The only forms of `scripts.test` 495 reads: a command that starts the runner directly. Anything
// with shell syntax needs a shell, which the sandbox does not give.
const VITEST_COMMAND = /^\s*vitest(\s+run)?\s*$/;
const MOCHA_COMMAND = /^\s*mocha\s*$/;
const JEST_COMMAND = /^\s*jest\s*$/;
const NODE_TEST_COMMAND = /^\s*node\s+--test(\s|$)/;
const NODE_TEST_COVERAGE = /(^|\s)--experimental-test-coverage(\s|$)/;
const READ_RUNNER = /^(vitest|mocha|jest)\s/;
const SHELL_SYNTAX = /[|&;<>$`()]/;

/** What a target's coverage becomes: a control that judges it, or the reason there is none. */
interface CoverageOutcome {
	control?: ControlDefinition;
	missing?: string[];
}

const COVERAGE_NOT_MEASURED = "the coverage of the introduced lines is not measured on this target";

/**
 * The unit control `scripts.test` declares, or why there is none: a control whose reader is not
 * qualified on the output it reads is worth less than no control, so a runner 495 cannot read is
 * named instead of being run under the wrong reader.
 */
function suiteOf(
	projectPath: string,
	scriptsTest: string | undefined,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
):
	| { runner: SuiteRunner; control: ControlDefinition; coverage?: CoverageOutcome; refusal?: undefined }
	| { runner?: undefined; control?: undefined; coverage?: undefined; refusal: string } {
	if (scriptsTest === undefined || NODE_TEST_COMMAND.test(scriptsTest)) {
		if (scriptsTest !== undefined && NODE_TEST_COVERAGE.test(scriptsTest)) {
			const control = nodeTestCoverageControl(requirementRefs, nodeBinary);
			return {
				runner: "node-test",
				control,
				coverage: { control: coverageControl(control, requirementRefs, nodeBinary, LCOV_REPORT) },
			};
		}
		return {
			runner: "node-test",
			control: nodeTestControl(requirementRefs, nodeBinary),
			coverage: {
				missing: [
					`${COVERAGE_NOT_MEASURED}: scripts.test does not ask node:test for coverage (--experimental-test-coverage)`,
				],
			},
		};
	}
	if (VITEST_COMMAND.test(scriptsTest)) return vitestSuite(projectPath, requirementRefs, nodeBinary);
	if (MOCHA_COMMAND.test(scriptsTest))
		return { runner: "mocha", control: mochaControl(requirementRefs, nodeBinary), coverage: unreadCoverage("mocha") };
	if (JEST_COMMAND.test(scriptsTest))
		return { runner: "jest", control: jestControl(requirementRefs, nodeBinary), coverage: unreadCoverage("jest") };
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
 * Where node:test writes its LCOV report: a file at the root of the copy, which is why the control
 * declares that one file writable and nothing around it. The report goes beside the TAP stream, which
 * stays on the standard output where the node-test reader looks for it.
 */
const LCOV_REPORT = "495-lcov.info";
/** The name under which `unit` provides that report to the controls that require it. */
const LCOV_REPORT_NAME = "lcov-report";

function nodeTestCoverageControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "node:test suite with coverage (command read from scripts.test)",
		command: [
			nodeBinary,
			"--test",
			"--experimental-test-coverage",
			"--test-reporter=tap",
			"--test-reporter-destination=stdout",
			"--test-reporter=lcov",
			`--test-reporter-destination=${LCOV_REPORT}`,
		],
		provides: [LCOV_REPORT_NAME],
		writable_paths: [LCOV_REPORT],
	};
}

/**
 * The control that judges the lines a change introduces from the LCOV report `unit` wrote. It runs
 * nothing of its own and protects what `unit` protects: a configuration that excludes files from the
 * report would make lines disappear from it.
 */
function coverageControl(
	unit: ControlDefinition,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
	report: string,
): ControlDefinition {
	return {
		...unit,
		control_id: "coverage",
		title: "introduced-line coverage, read from the LCOV report of the test run",
		command: emptyTrigger(nodeBinary),
		timeout_ms: 60_000,
		parser: "lcov",
		report_path: report,
		provides: [],
		requires: [LCOV_REPORT_NAME],
		writable_paths: [],
		requirement_refs: requirementRefs,
	};
}

/** The coverage providers vitest loads from `node_modules`, in the order the control prefers them. */
const VITEST_COVERAGE_PROVIDERS = ["v8", "istanbul"] as const;
type VitestCoverageProvider = (typeof VITEST_COVERAGE_PROVIDERS)[number];

/** Where vitest writes the LCOV report of its coverage run, under the directory the sandbox lets it create. */
const VITEST_COVERAGE_DIRECTORY = `${REPORT_DIRECTORY}/coverage`;

/** The provider the target installed: vitest measures nothing without one, and 495 installs none. */
function installedVitestProvider(projectPath: string): VitestCoverageProvider | null {
	return (
		VITEST_COVERAGE_PROVIDERS.find((provider) =>
			existsSync(join(projectPath, "node_modules", "@vitest", `coverage-${provider}`)),
		) ?? null
	);
}

function vitestSuite(
	projectPath: string,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
): { runner: SuiteRunner; control: ControlDefinition; coverage: CoverageOutcome } {
	const provider = installedVitestProvider(projectPath);
	const control = vitestControl(requirementRefs, nodeBinary, provider);
	if (provider === null)
		return {
			runner: "vitest",
			control,
			coverage: {
				missing: [
					`${COVERAGE_NOT_MEASURED}: vitest is installed without a coverage provider, and @vitest/coverage-v8 would make it measurable`,
				],
			},
		};
	return {
		runner: "vitest",
		control,
		coverage: {
			control: coverageControl(control, requirementRefs, nodeBinary, `${VITEST_COVERAGE_DIRECTORY}/lcov.info`),
		},
	};
}

/** A runner whose coverage is declared where 495 does not look, or wrapped by a tool it does not run. */
function unreadCoverage(runner: "mocha" | "jest"): CoverageOutcome {
	return { missing: [`${COVERAGE_NOT_MEASURED}: 495 does not read the coverage of ${runner}`] };
}

/**
 * The vitest the target installed, run from the copy's `node_modules` and never from the host's PATH,
 * so the control judges the version the target declared. Vite bundles its configuration under
 * `node_modules/.vite-temp`, which is why that directory is writable next to the report. With a
 * coverage provider installed it also writes the LCOV report of the run under `target/coverage`.
 */
function vitestControl(
	requirementRefs: RequirementRef[],
	nodeBinary: string,
	provider: VitestCoverageProvider | null,
): ControlDefinition {
	const report = `${REPORT_DIRECTORY}/junit.xml`;
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "vitest suite (command read from scripts.test)",
		command: [
			nodeBinary,
			"node_modules/vitest/vitest.mjs",
			"run",
			"--reporter=junit",
			`--outputFile=${report}`,
			...(provider === null
				? []
				: [
						"--coverage.enabled",
						`--coverage.provider=${provider}`,
						"--coverage.reporter=lcov",
						`--coverage.reportsDirectory=${VITEST_COVERAGE_DIRECTORY}`,
					]),
		],
		provides: provider === null ? [] : [LCOV_REPORT_NAME],
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

const COVERED_MODULE = "src/witness495/covered.mjs";
const UNCOVERED_MODULE = "src/witness495/uncovered.mjs";

/**
 * What a coverage sensor is qualified on. The positive witness adds a module its test calls in full;
 * the sensor's own negative witness adds one its test loads and leaves a function of uncalled, which
 * a failing test cannot show: a suite that fails stops before the report exists, and a line nothing
 * executes is not a failure.
 */
function coverageWitnesses(
	runner: SuiteRunner,
	projectPath: string,
): { positive: Record<string, string>; uncovered: Record<string, string> } {
	const directory = runner === "vitest" && existsSync(join(projectPath, "tests")) ? "tests" : "test";
	const header =
		runner === "vitest"
			? 'import { expect, it } from "vitest";\n'
			: 'import { test as it } from "node:test";\nimport { strict as assert } from "node:assert";\n';
	const equal = (actual: string, expected: number): string =>
		runner === "vitest" ? `expect(${actual}).toBe(${expected})` : `assert.equal(${actual}, ${expected})`;
	return {
		positive: {
			[COVERED_MODULE]:
				"export function twice(n) {\n  return n * 2;\n}\n\nexport function thrice(n) {\n  return n * 3;\n}\n",
			[`${directory}/495-covered-witness.test.mjs`]: `${header}import { thrice, twice } from "../${COVERED_MODULE}";\n\nit("495 coverage witness: every function of the module is called", () => {\n  ${equal("twice(2)", 4)};\n  ${equal("thrice(2)", 6)};\n});\n`,
		},
		uncovered: {
			[UNCOVERED_MODULE]:
				"export function called(n) {\n  return n + 1;\n}\n\nexport function neverCalled(n) {\n  return n - 1;\n}\n",
			[`${directory}/495-uncovered-witness.test.mjs`]: `${header}import { called } from "../${UNCOVERED_MODULE}";\n\nit("495 coverage witness: the module is loaded and one function is called", () => {\n  ${equal("called(1)", 2)};\n});\n`,
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
