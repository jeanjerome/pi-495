/**
 * The detection of the test runner a `package.json` declares in `scripts.test`, and so of the unit control
 * and the coverage sensor the target gets, or why it gets none.
 */
import type { ControlDefinition } from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import {
	coverageControl,
	installedVitestProvider,
	nodeTestCoverageMissing,
	unreadCoverage,
	vitestCoverage,
} from "./coverage-control.ts";
import { LCOV_REPORT, SHELL_SYNTAX, type SensorOutcome, type SuiteRunner } from "./shared.ts";
import { jestControl, mochaControl, nodeTestControl, nodeTestCoverageControl, vitestControl } from "./unit-controls.ts";

// The only forms of `scripts.test` 495 reads: a command that starts the runner directly. Anything
// with shell syntax needs a shell, which the sandbox does not give.
const VITEST_COMMAND = /^\s*vitest(\s+run)?\s*$/;
const MOCHA_COMMAND = /^\s*mocha\s*$/;
const JEST_COMMAND = /^\s*jest\s*$/;
const NODE_TEST_COMMAND = /^\s*node\s+--test(\s|$)/;
const NODE_TEST_COVERAGE = /(^|\s)--experimental-test-coverage(\s|$)/;
const READ_RUNNER = /^(vitest|mocha|jest)\s/;

/**
 * The unit control `scripts.test` declares, or why there is none: a control whose reader is not
 * qualified on the output it reads is worth less than no control, so a runner 495 cannot read is
 * named instead of being run under the wrong reader.
 */
export function suiteOf(
	projectPath: string,
	scriptsTest: string | undefined,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
):
	| { runner: SuiteRunner; control: ControlDefinition; coverage?: SensorOutcome; refusal?: undefined }
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
			coverage: nodeTestCoverageMissing(scriptsTest),
		};
	}
	if (VITEST_COMMAND.test(scriptsTest)) {
		const provider = installedVitestProvider(projectPath);
		const control = vitestControl(requirementRefs, nodeBinary, provider);
		return {
			runner: "vitest",
			control,
			coverage: vitestCoverage(projectPath, provider, control, requirementRefs, nodeBinary),
		};
	}
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
