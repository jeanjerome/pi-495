import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";
import { fixtureTs, fixtureTsWithoutTests, SHOUT_TEST, writeFiles } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { formatStatus } from "../../src/presentation/structured/text.ts";

const spec = specReport({
	objective: "add shout(name) returning the greeting in upper case",
	requirements: [
		{
			requirement_id: "R1",
			statement: "shout(name) returns greet(name) upper-cased",
			mandatory: true,
			criterion: "unit test on shout passes",
			category: "functional",
			satisfied_by_reference: false,
		},
	],
	design: { summary: "add shout next to greet", components: ["greet"], interfaces: ["shout(name)"], risks: [] },
});

const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: true, notes: [] });

/** Falls back to the whole status, so a status without that line shows in the failed assertion. */
const nextAction = (status: string): string => status.match(/^ {2}Next {4}(.*)$/m)?.[1] ?? status;

describe("the stops no resume lifts name the cancel as their only way out in /495 status", () => {
	it("a project whose scripts.test is tsc && node --test stops capability_missing, and /495 status says on its verdict line that scripts.test chains commands through a shell, then gives /495 cancel as its next line", async () => {
		const project = trackedProject((root) => {
			fixtureTs(root);
			writeFiles(root, {
				"package.json": JSON.stringify(
					{ name: "f-ts", version: "1.0.0", type: "module", scripts: { test: "tsc && node --test" } },
					null,
					2,
				),
			});
		});
		const t = makeHarness({ defaultScript: { steps: [{ kind: "complete", output: spec }] } });
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });

		const stopped = await t.harness.advance(change.change_id, { max_steps: 40 });

		assert.equal(stopped.stopped_because, "capability_missing", stopped.steps.join(" | "));
		const status = formatStatus(stopped.view, "en");
		assert.match(
			status.split("\n")[1] ?? "",
			/^✘ Blocked.* — scripts\.test chains commands through a shell \(tsc && node --test\), which 495 cannot run$/,
			status,
		);
		assert.equal(nextAction(status), "/495 cancel");
	});

	it("a protocol whose unit control is not qualified stops capability_missing, and /495 status gives /495 cancel as its next line", async () => {
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: {
				prepare: {
					steps: [
						{ kind: "write", path: "test/shout.test.js", content: SHOUT_TEST },
						{ kind: "complete", output: report(["test/shout.test.js"]) },
					],
				},
			},
			// Every qualification witness of the unit control answers FAIL, so G2 does not freeze the protocol.
			controls: (real) => ({
				readers: real.readers,
				runControl: async (invocation, signal) => {
					const run = await real.runControl(invocation, signal);
					if (invocation.protocol.protocol_id !== "qualification" || invocation.control.control_id !== "unit")
						return run;
					return { ...run, evidence: { ...run.evidence, verdict: "FAIL" as const } };
				},
			}),
		});
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
			request_text: "add shout",
			actor: HUMAN,
		});

		const stopped = await t.harness.advance(change.change_id, { max_steps: 40 });

		assert.equal(stopped.stopped_because, "capability_missing", stopped.steps.join(" | "));
		assert.equal(nextAction(formatStatus(stopped.view, "en")), "/495 cancel");
	});
});
