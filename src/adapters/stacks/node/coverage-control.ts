/**
 * The coverage sensor of a Node target: the control that judges the introduced lines from the LCOV report
 * its runner writes, or why there is none and what would give one (QLT-04).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlDefinition, RecommendedComplement } from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import { emptyTrigger } from "../../../application/stacks/stack.ts";
import {
	CATALOGUE_DATE,
	LCOV_REPORT_NAME,
	VITEST_COVERAGE_DIRECTORY,
	VITEST_COVERAGE_PROVIDERS,
	type SensorOutcome,
	type VitestCoverageProvider,
} from "./shared.ts";

/** The flag makes `node --test` write the lines it executed; it needs nothing installed. */
const NODE_TEST_COVERAGE_RECOMMENDATION: RecommendedComplement = {
	test_type: "coverage",
	tool: "node --experimental-test-coverage",
	version: "24.21.0",
	established_on: CATALOGUE_DATE,
	source: "nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage",
	change: "in package.json, add --experimental-test-coverage to scripts.test",
};

const COVERAGE_NOT_MEASURED = "the coverage of the introduced lines is not measured on this target";

/**
 * The control that judges the lines a change introduces from the LCOV report `unit` wrote. It runs
 * nothing of its own and protects what `unit` protects: a configuration that excludes files from the
 * report would make lines disappear from it.
 */
export function coverageControl(
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
function installedVitestVersion(projectPath: string): string | null {
	try {
		const manifest = JSON.parse(readFileSync(join(projectPath, "node_modules", "vitest", "package.json"), "utf8")) as {
			version?: unknown;
		};
		return typeof manifest.version === "string" ? manifest.version : null;
	} catch {
		return null; // an absent or unreadable vitest manifest leaves the version unread
	}
}

/** The provider the target installed: vitest measures nothing without one, and 495 installs none. */
export function installedVitestProvider(projectPath: string): VitestCoverageProvider | null {
	return (
		VITEST_COVERAGE_PROVIDERS.find((provider) =>
			existsSync(join(projectPath, "node_modules", "@vitest", `coverage-${provider}`)),
		) ?? null
	);
}

/** A runner whose coverage is declared where 495 does not look, or wrapped by a tool it does not run. */
export function unreadCoverage(runner: "mocha" | "jest"): SensorOutcome {
	return { missing: [`${COVERAGE_NOT_MEASURED}: 495 does not read the coverage of ${runner}`] };
}

/** What a `node --test` that does not ask for coverage is told, with the edit of `scripts.test` that would. */
export function nodeTestCoverageMissing(scriptsTest: string | undefined): SensorOutcome {
	return {
		missing: [
			`${COVERAGE_NOT_MEASURED}: scripts.test does not ask node:test for coverage (--experimental-test-coverage)`,
		],
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

/**
 * The coverage of a vitest suite: the control that reads the LCOV report the installed provider writes,
 * or, without a provider, the one that matches the installed vitest.
 */
export function vitestCoverage(
	projectPath: string,
	provider: VitestCoverageProvider | null,
	unit: ControlDefinition,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
): SensorOutcome {
	if (provider !== null)
		return { control: coverageControl(unit, requirementRefs, nodeBinary, `${VITEST_COVERAGE_DIRECTORY}/lcov.info`) };
	const version = installedVitestVersion(projectPath);
	return {
		missing: [
			`${COVERAGE_NOT_MEASURED}: vitest is installed without a coverage provider, and @vitest/coverage-v8 would make it measurable`,
		],
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
