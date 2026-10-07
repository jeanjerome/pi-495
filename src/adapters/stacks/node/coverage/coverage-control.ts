/**
 * The coverage of a Node target: the control that judges the introduced lines from the LCOV report its runner
 * writes and the witness that proves it, or why there is none and what would give one (QLT-04).
 */
import type { CapabilityQuestion, CoverageCapability, Offer } from "../../../../application/stacks/plugin.ts";
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import type { ControlDefinition, RecommendedComplement } from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import { emptyTrigger } from "../../../../application/stacks/stack.ts";
import type { NodeProject } from "../project/node-project.ts";
import type { ReadSuite } from "../project/test-runner.ts";
import { witnessTestLayout } from "../project/witness-layout.ts";
import { lcovReader } from "../../../execution/lcov.ts";
import {
	CATALOGUE_DATE,
	isScriptUnderTest,
	LCOV_REPORT,
	LCOV_REPORT_NAME,
	VITEST_COVERAGE_DIRECTORY,
} from "../shared.ts";
import { unitControl } from "../tests/unit-controls.ts";

/** A configuration is read by the tools, not run by the suite. */
const CONFIGURATION = /\.config\.[cm]?[jt]sx?$/;

/**
 * The reader of the LCOV report of a Node suite: it expects the report to cite every introduced source the
 * suite runs, a configuration aside, and refuses an introduced comment that hides lines from the coverage
 * runners Node uses.
 */
export const NODE_LCOV_READER = lcovReader({
	expected: (path) => isScriptUnderTest(path) && !CONFIGURATION.test(path),
	silencing: {
		pattern: /\b(?:v8|istanbul|c8)\s+ignore\b|\bnode:coverage\s+(?:disable|ignore)\b/,
		rule_id: "coverage:silence-comment-introduced",
		hides: "the coverage report",
	},
});

/** The flag makes `node --test` write the lines it executed; it needs nothing installed. */
const NODE_TEST_COVERAGE_RECOMMENDATION: RecommendedComplement = {
	test_type: "coverage",
	tool: "node --experimental-test-coverage",
	version: "24.21.0",
	established_on: CATALOGUE_DATE,
	source: "nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage",
	change: "in package.json, add --experimental-test-coverage to scripts.test",
};

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

/** The version of the vitest the target installed, which a coverage provider has to match; null when it cannot be read. */
function installedVitestVersion(view: ProjectView): string | null {
	const text = view.read("node_modules/vitest/package.json");
	if (text === null) return null;
	try {
		const manifest = JSON.parse(text) as { version?: unknown } | null;
		return typeof manifest?.version === "string" ? manifest.version : null;
	} catch {
		return null; // an unreadable vitest manifest leaves the version unread
	}
}

/** What a `node --test` that does not ask for coverage is told, with the edit of `scripts.test` that would. */
function nodeTestCoverageMissing(scriptsTest: string | undefined): Offer {
	return {
		kind: "missing",
		reason: "scripts.test does not ask node:test for coverage (--experimental-test-coverage)",
		recommendation:
			scriptsTest === undefined
				? NODE_TEST_COVERAGE_RECOMMENDATION
				: {
						...NODE_TEST_COVERAGE_RECOMMENDATION,
						edit: {
							path: "package.json",
							current: scriptsTest,
							wanted: `${scriptsTest} --experimental-test-coverage`,
						},
					},
	};
}

/** A vitest without a coverage provider, and the provider that matches the installed vitest. */
function vitestCoverageMissing(view: ProjectView): Offer {
	const version = installedVitestVersion(view);
	return {
		kind: "missing",
		reason: "vitest is installed without a coverage provider, and @vitest/coverage-v8 would make it measurable",
		...(version === null
			? {}
			: {
					recommendation: {
						test_type: "coverage",
						tool: "@vitest/coverage-v8",
						version,
						established_on: CATALOGUE_DATE,
						source: "vitest.dev/guide/coverage.html",
						change: `install @vitest/coverage-v8@${version} as a devDependency, the version of the installed vitest`,
						install: { package: "@vitest/coverage-v8", version, manager: "npm" },
					},
				}),
	};
}

const UNCOVERED_MODULE = "src/witness495/uncovered.mjs";

/**
 * The tree that carries the defect the coverage control claims to detect: a module its test loads and leaves
 * a function of uncalled, which a failing test cannot show — a suite that fails stops before the report
 * exists, and a line nothing executes is not a failure.
 */
function uncoveredWitness(suite: ReadSuite, view: ProjectView): Record<string, string> {
	const { directory, extension, header, equal } = witnessTestLayout(suite.runner, view);
	return {
		[UNCOVERED_MODULE]:
			"export function called(n) {\n  return n + 1;\n}\n\nexport function neverCalled(n) {\n  return n - 1;\n}\n",
		[`${directory}/495-uncovered-witness.test.${extension}`]: `${header}import { called } from "../${UNCOVERED_MODULE}";\n\nit("495 coverage witness: the module is loaded and one function is called", () => {\n  ${equal("called(1)", 2)};\n});\n`,
	};
}

/** The coverage control that reads the LCOV report at `report`, with the witness that proves it. */
function measuredAt(suite: ReadSuite, question: CapabilityQuestion<NodeProject>, report: string): Offer {
	const unit = unitControl(suite, question.requirement_refs, question.node_binary);
	return {
		kind: "available",
		controls: [coverageControl(unit, question.requirement_refs, question.node_binary, report)],
		own_negative_witness: { coverage: uncoveredWitness(suite, question.view) },
	};
}

export const NODE_COVERAGE: CoverageCapability<NodeProject> = {
	offer(question) {
		const { suite, scripts_test } = question.model;
		switch (suite.runner) {
			case null:
				return { kind: "refused", reason: suite.refusal };
			case "node-test":
				return suite.coverage ? measuredAt(suite, question, LCOV_REPORT) : nodeTestCoverageMissing(scripts_test);
			case "vitest":
				return suite.provider === null
					? vitestCoverageMissing(question.view)
					: measuredAt(suite, question, `${VITEST_COVERAGE_DIRECTORY}/lcov.info`);
			case "mocha":
			case "jest":
				// Their coverage is declared where 495 does not look, or wrapped by a tool it does not run.
				return { kind: "missing", reason: `495 does not read the coverage of ${suite.runner}` };
		}
	},
};
