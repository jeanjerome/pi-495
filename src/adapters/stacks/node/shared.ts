/** What several responsibilities of the Node technology share. */

/** The date the versions this technology recommends were checked against the sources they cite. */
export const CATALOGUE_DATE = "2026-09-30";

/**
 * Where a runner writes its JUnit report, and an analyser its own. `target/` is excluded from every
 * snapshot by default, so the copy has none: the directory itself is what the control declares writable,
 * because the runner creates the parent of its output file and the sandbox refuses to create a directory
 * it did not open.
 */
export const REPORT_DIRECTORY = "target";

/**
 * What the tools of a Node project write into a copy each time they run. `target/` holds the reports 495 has
 * its runners and analysers write. `node_modules/.vite/` (vitest's duration cache), `node_modules/.vite-temp/`
 * (the compiled configuration) and `node_modules/.vitest/` (vitest's API token) are outputs of the tool, not
 * installed dependencies, and observing them would report a modified protected path for a candidate that only
 * ran its tests. The same holds for what Stryker leaves in the copy: its report under `reports/mutation/` and
 * the instrumented sources it runs the tests on under `.stryker-tmp/`.
 */
export const NODE_OUTPUTS = [
	"target/",
	"dist/",
	"build/",
	"node_modules/.vite/",
	"node_modules/.vite-temp/",
	"node_modules/.vitest/",
	"reports/mutation/",
	".stryker-tmp/",
];

/** The test runners 495 reads. */
export type SuiteRunner = "node-test" | "vitest" | "mocha" | "jest";

// A command with shell syntax needs a shell, which the sandbox does not give.
export const SHELL_SYNTAX = /[|&;<>$`()]/;

/** The name under which `unit` provides the LCOV report to the controls that require it. */
export const LCOV_REPORT_NAME = "lcov-report";

/**
 * What vitest writes in the copy besides its report: Vite bundles the configuration under
 * `node_modules/.vite-temp`, and vitest 5 creates its API token under `node_modules/.vitest` when the
 * user data directory, which the sandbox keeps read-only, holds none yet.
 */
export const VITEST_OWN_PATHS = ["node_modules/.vite-temp", "node_modules/.vitest"];

/**
 * Where node:test writes its LCOV report: a file at the root of the copy, which is why the control
 * declares that one file writable and nothing around it. The report goes beside the TAP stream, which
 * stays on the standard output where the node-test reader looks for it.
 */
export const LCOV_REPORT = "495-lcov.info";

/** Where the JSON reporter of Stryker writes the report the mutation control reads. */
export const STRYKER_REPORT_PATH = "reports/mutation/mutation.json";

/** The coverage providers vitest loads from `node_modules`, in the order the control prefers them. */
export const VITEST_COVERAGE_PROVIDERS = ["v8", "istanbul"] as const;
export type VitestCoverageProvider = (typeof VITEST_COVERAGE_PROVIDERS)[number];

/** Where vitest writes the LCOV report of its coverage run, under the directory the sandbox lets it create. */
export const VITEST_COVERAGE_DIRECTORY = `${REPORT_DIRECTORY}/coverage`;

/** A JavaScript or TypeScript source the suite runs: neither a declaration file nor a test. */
export function isScriptUnderTest(path: string): boolean {
	return SCRIPT_SOURCE.test(path) && !SCRIPT_DECLARATION_ONLY.test(path) && !SCRIPT_TEST_SOURCE.test(path);
}

export const SCRIPT_SOURCE = /\.[cm]?[jt]sx?$/;
/** A declaration file has no executable line, and a runner reports none. */
export const SCRIPT_DECLARATION_ONLY = /\.d\.[cm]?ts$/;
/** A test is what measures; it is never what is measured. */
export const SCRIPT_TEST_SOURCE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

/** `text` as a regular expression that matches it literally. */
export const escapedForPattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
