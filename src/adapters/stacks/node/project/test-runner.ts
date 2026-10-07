/**
 * The test runner a `package.json` declares in `scripts.test`, read without executing anything, or why 495
 * cannot read it: a control whose reader is not qualified on the output it reads is worth less than no
 * control, so a runner 495 cannot read is named instead of being run under the wrong reader.
 */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { SHELL_SYNTAX, VITEST_COVERAGE_PROVIDERS, type VitestCoverageProvider } from "../shared.ts";

// The only forms of `scripts.test` 495 reads: a command that starts the runner directly. Anything
// with shell syntax needs a shell, which the sandbox does not give.
const VITEST_COMMAND = /^\s*vitest(\s+run)?\s*$/;
const MOCHA_COMMAND = /^\s*mocha\s*$/;
const JEST_COMMAND = /^\s*jest\s*$/;
const NODE_TEST_COMMAND = /^\s*node\s+--test(\s|$)/;
const NODE_TEST_COVERAGE = /(^|\s)--experimental-test-coverage(\s|$)/;
const READ_RUNNER = /^(vitest|mocha|jest)\s/;

/**
 * The suite of a project as 495 reads it: `node --test`, which writes an LCOV report when asked for
 * coverage; vitest, which writes one with the coverage provider the target installed; mocha or jest; or
 * the refusal of a runner 495 cannot read.
 */
export type NodeSuite =
	| { runner: "node-test"; coverage: boolean }
	| { runner: "vitest"; provider: VitestCoverageProvider | null }
	| { runner: "mocha" | "jest" }
	| { runner: null; refusal: string };

/** A suite 495 reads. */
export type ReadSuite = Exclude<NodeSuite, { runner: null }>;

/** The suite `scripts.test` declares; none runs `node --test`. */
export function suiteOf(view: ProjectView, scriptsTest: string | undefined): NodeSuite {
	if (scriptsTest === undefined || NODE_TEST_COMMAND.test(scriptsTest))
		return { runner: "node-test", coverage: scriptsTest !== undefined && NODE_TEST_COVERAGE.test(scriptsTest) };
	if (VITEST_COMMAND.test(scriptsTest)) return { runner: "vitest", provider: installedVitestProvider(view) };
	if (MOCHA_COMMAND.test(scriptsTest)) return { runner: "mocha" };
	if (JEST_COMMAND.test(scriptsTest)) return { runner: "jest" };
	const command = scriptsTest.trim();
	if (SHELL_SYNTAX.test(command))
		return { runner: null, refusal: `scripts.test chains commands through a shell (${command}), which 495 cannot run` };
	const withArguments = READ_RUNNER.exec(command);
	if (withArguments)
		return {
			runner: null,
			refusal: `scripts.test runs ${command}, but 495 reads ${withArguments[1]} only when it runs without an argument`,
		};
	return {
		runner: null,
		refusal: `scripts.test runs ${command}, whose output 495 cannot read: only node --test, vitest, mocha and jest are read`,
	};
}

/** The provider the target installed: vitest measures nothing without one, and 495 installs none. */
function installedVitestProvider(view: ProjectView): VitestCoverageProvider | null {
	return VITEST_COVERAGE_PROVIDERS.find((provider) => view.exists(`node_modules/@vitest/coverage-${provider}`)) ?? null;
}
