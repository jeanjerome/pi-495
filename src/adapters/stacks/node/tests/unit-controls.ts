/** The suite of a Node target: the unit control each test runner 495 reads is run as, from the copy's own installation. */
import type { ControlDefinition } from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { TestCapability } from "../../../../application/stacks/plugin.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import type { NodeProject } from "../project/node-project.ts";
import type { ReadSuite } from "../project/test-runner.ts";
import {
	LCOV_REPORT,
	LCOV_REPORT_NAME,
	REPORT_DIRECTORY,
	VITEST_COVERAGE_DIRECTORY,
	VITEST_OWN_PATHS,
	type VitestCoverageProvider,
} from "../shared.ts";
import { LINT_NEGATIVE_WITNESS, measuredCodeWitness, witnessesOf } from "./witnesses.ts";

/** `node --test`, read through its TAP stream. */
function nodeTestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
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
 * The vitest the target installed, run from the copy's `node_modules` and never from the host's PATH,
 * so the control judges the version the target declared. The directories vitest writes in,
 * `VITEST_OWN_PATHS`, are writable next to the report. With a coverage provider installed it also
 * writes the LCOV report of the run under `target/coverage`.
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
function jestControl(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition {
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

/** The unit control a suite 495 reads is run as. */
export function unitControl(
	suite: ReadSuite,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
): ControlDefinition {
	switch (suite.runner) {
		case "node-test":
			return suite.coverage
				? nodeTestCoverageControl(requirementRefs, nodeBinary)
				: nodeTestControl(requirementRefs, nodeBinary);
		case "vitest":
			return vitestControl(requirementRefs, nodeBinary, suite.provider);
		case "mocha":
			return mochaControl(requirementRefs, nodeBinary);
		case "jest":
			return jestControl(requirementRefs, nodeBinary);
	}
}

/** A JavaScript or TypeScript source named as a test. */
const TEST_FILE_NAME = /\.(test|spec)\.[cm]?[jt]s$|_test\.[jt]s$/;

/** The suite of the project, or why a refused one leaves the project without any control. */
export const NODE_TESTS: TestCapability<NodeProject> = {
	offer: ({ model, requirement_refs, node_binary }) =>
		model.suite.runner === null
			? { kind: "refused", reason: model.suite.refusal }
			: { kind: "available", controls: [unitControl(model.suite, requirement_refs, node_binary)] },
	positiveWitness: ({ model, view }) => witnessesOf(model.suite.runner ?? "node-test", view).positive,
	negativeWitness: ({ model, view }) => ({
		...witnessesOf(model.suite.runner ?? "node-test", view).negative,
		...LINT_NEGATIVE_WITNESS,
	}),
	measuredCodeWitness: ({ model, view }) => measuredCodeWitness(model.suite.runner ?? "node-test", view),
	preparationPaths: () => ["test/", "tests/"],
	isTestFile: (path) => TEST_FILE_NAME.test(path),
};
