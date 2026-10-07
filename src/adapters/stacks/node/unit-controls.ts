/** The unit control each test runner 495 reads is run as, from the copy's own installation. */
import type { ControlDefinition } from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import { baseControl } from "../../../application/stacks/stack.ts";
import {
	LCOV_REPORT,
	LCOV_REPORT_NAME,
	REPORT_DIRECTORY,
	VITEST_COVERAGE_DIRECTORY,
	VITEST_OWN_PATHS,
	type VitestCoverageProvider,
} from "./shared.ts";

/** `node --test`, read through its TAP stream. */
export function nodeTestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	return {
		...baseControl(requirementRefs),
		control_id: "unit",
		title: "node:test suite",
		command: [nodeBinary, "--test", "--test-reporter=tap"],
		timeout_ms: 10 * 60_000,
		parser: "node-test",
		report_path: null,
		provides: [],
		// `node_modules/` holds code the checks load, and only an adopted complement writes there: any other
		// file added or modified under it is a dependency the producer slipped into the project.
		protected_paths: ["test/", "tests/", "package.json", "node_modules/"],
	};
}

/** `node --test` asked for coverage, which also writes the LCOV report the coverage control reads. */
export function nodeTestCoverageControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
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
 * The vitest the target installed, run from the copy's `node_modules` and never from the host's PATH,
 * so the control judges the version the target declared. The directories vitest writes in,
 * `VITEST_OWN_PATHS`, are writable next to the report. With a coverage provider installed it also
 * writes the LCOV report of the run under `target/coverage`.
 */
export function vitestControl(
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
		writable_paths: [REPORT_DIRECTORY, ...VITEST_OWN_PATHS],
		// A narrowed `include` or an added `exclude` would make the suite green without proving anything.
		protected_paths: [...nodeTest.protected_paths, "vitest.config.*", "vite.config.*"],
	};
}

/**
 * The mocha the target installed, run from the copy's `node_modules` and never from the host's PATH.
 * Mocha's xunit reporter writes the report itself and creates its parent directory, so `target/` is
 * the only place the control may write.
 */
export function mochaControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const report = `${REPORT_DIRECTORY}/mocha-xunit.xml`;
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "mocha suite (command read from scripts.test)",
		command: [nodeBinary, "node_modules/mocha/bin/mocha.js", "--reporter=xunit", `--reporter-option=output=${report}`],
		parser: "junit-xml",
		report_path: report,
		writable_paths: [REPORT_DIRECTORY],
		// A narrowed `spec` or an added reporter would make the suite green without proving anything, as
		// they would for vitest.
		protected_paths: [...nodeTest.protected_paths, ".mocharc.*"],
	};
}

/**
 * Where jest writes its JSON report: a file, not the standard output, where a test or the code it
 * exercises can print before the JSON. It sits at the root of the copy, which is why the control
 * declares that one file writable and nothing around it.
 */
const JEST_REPORT = "495-jest-report.json";

/** The jest the target installed, run from the copy's `node_modules` and never from the host's PATH. */
export function jestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
	const nodeTest = nodeTestControl(requirementRefs, nodeBinary);
	return {
		...nodeTest,
		title: "jest suite (command read from scripts.test)",
		command: [nodeBinary, "node_modules/jest/bin/jest.js", "--json", `--outputFile=${JEST_REPORT}`],
		parser: "jest-json",
		report_path: JEST_REPORT,
		writable_paths: [JEST_REPORT],
		// A restricted `testMatch`, a `reporters` entry or a transformer would make the suite green without
		// proving anything.
		protected_paths: [...nodeTest.protected_paths, "jest.config.*"],
	};
}
