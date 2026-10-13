import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { qualifyControlDetailed } from "../../src/application/qualification.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import type { ControlExecutionPort, ControlInvocation } from "../../src/ports/execution.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";

const SUITE = controlOf({ control_id: "unit", command: ["node", "--test", "test/*.test.js"] });
const SENSOR = controlOf({ control_id: "coverage", command: ["node", "-e", ""] });
const COVERED = "test/495-covered-witness.test.mjs";
const UNCOVERED = "test/495-uncovered-witness.test.mjs";
const MODULE = "src/witness495/covered.mjs";

/** A runner that answers every control with a verdict and records the command each one was given, per workspace. */
function recordingRunner(): { runner: ControlExecutionPort; runs: { id: string; path: string; command: string[] }[] } {
	const runs: { id: string; path: string; command: string[] }[] = [];
	const runner: ControlExecutionPort = {
		readers: [],
		async runControl(invocation: ControlInvocation) {
			runs.push({
				id: invocation.control.control_id,
				path: invocation.workspace_path,
				command: invocation.control.command,
			});
			return {
				evidence: { verdict: "PASS", findings: [], limits: { notes: [] }, facts: {} },
				observation: null,
			} as unknown as Awaited<ReturnType<ControlExecutionPort["runControl"]>>;
		},
	};
	return { runner, runs };
}

async function qualify(
	control: ControlDefinition,
	prerequisites: ControlDefinition[],
	bounded: { control_id: string; tests: string[] } | undefined,
) {
	const { runner, runs } = recordingRunner();
	await qualifyControlDetailed(
		runner,
		control,
		{
			positive_path: "/positive",
			negative_path: "/negative",
			positive_files: { [COVERED]: "", [MODULE]: "" },
			negative_files: { [COVERED]: "", [MODULE]: "", [UNCOVERED]: "" },
			...(bounded ? { bounded_suite: bounded } : {}),
		},
		invocationBase(),
		prerequisites,
	);
	return runs;
}

describe("the owner's bound on the suite never hides the witnesses that qualify a control", () => {
	const bounded = { control_id: "unit", tests: [COVERED, UNCOVERED] };

	it("gives the suite that produces a report the witness test files of the workspace it runs on, and no other", async () => {
		const runs = await qualify(SENSOR, [SUITE], bounded);
		const suite = (path: string) => runs.filter((r) => r.id === "unit" && r.path === path).map((r) => r.command);
		assert.deepEqual(suite("/positive"), [["node", "--test", "test/*.test.js", COVERED]]);
		assert.deepEqual(suite("/negative"), [["node", "--test", "test/*.test.js", COVERED, UNCOVERED]]);
	});

	it("gives the suite the witness test files when it is the control that is qualified, broken runner included", async () => {
		const runs = await qualify(SUITE, [], bounded);
		assert.deepEqual(
			runs.map((r) => [r.path, r.command]),
			[
				["/positive", ["node", "--test", "test/*.test.js", COVERED]],
				["/negative", ["node", "--test", "test/*.test.js", COVERED, UNCOVERED]],
				["/positive", ["/nonexistent/495-broken-runner", "--test", "test/*.test.js", COVERED]],
			],
		);
	});

	it("leaves the command of every other control as it is", async () => {
		const runs = await qualify(SENSOR, [SUITE], bounded);
		assert.deepEqual(
			runs.filter((r) => r.id === "coverage").map((r) => r.command),
			[SENSOR.command, SENSOR.command, ["/nonexistent/495-broken-runner", "-e", ""]],
		);
	});

	it("leaves the suite as it is where no bound narrows it", async () => {
		const runs = await qualify(SENSOR, [SUITE], undefined);
		assert.deepEqual(
			runs.filter((r) => r.id === "unit").map((r) => r.command),
			[SUITE.command, SUITE.command],
		);
	});

	it("adds nothing for a witness test the workspace does not hold", async () => {
		const runs = await qualify(SENSOR, [SUITE], { control_id: "unit", tests: ["test/495-absent-witness.test.mjs"] });
		assert.deepEqual(
			runs.filter((r) => r.id === "unit").map((r) => r.command),
			[SUITE.command, SUITE.command],
		);
	});
});
