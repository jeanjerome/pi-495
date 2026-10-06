/**
 * The residual risks of a report bear on the candidate: a qualification witness judges the control,
 * so what it answers is not a doubt about the change, while a control that was not qualified is one.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HUMAN } from "../helpers/change-fixture.ts";
import { makeHarness, trackedProject } from "../helpers/harness-fixture.ts";

const RIGHT = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";

describe("the residual risks of a report", () => {
	it("un changement accepté dont les contrôles ont été qualifiés par un témoin cassé qui a répondu INDETERMINATE avec la note spawn error a un rapport dont aucun risque résiduel ne nomme fixture, INDETERMINATE ni /nonexistent/495-broken-runner, et un changement dont un contrôle n'est pas qualifié garde le risque control_not_qualified qui le nomme", async () => {
		const t = makeHarness({
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: RIGHT },
						{
							kind: "complete",
							output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
						},
					],
				},
			},
		});
		const { change } = await t.harness.start({ project_path: trackedProject(), request_text: "greet", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.view.change?.outcome, "accepted", result.steps.join(" | "));

		const report = await t.harness.report(change.change_id);
		const broken = report.observations.filter((o) => o.subject_kind === "fixture" && o.verdict === "INDETERMINATE");
		assert.ok(broken.length > 0, "a broken witness answered INDETERMINATE while qualifying the controls");
		const risks = report.residual_risks.map((r) => `${r.code}: ${r.statement}`);
		for (const named of ["fixture", "INDETERMINATE", "/nonexistent/495-broken-runner"])
			assert.ok(!risks.some((r) => r.includes(named)), `no residual risk names ${named}:\n${risks.join("\n")}`);
		assert.ok(
			report.residual_risks.some((r) => r.code === "control_not_qualified" && r.statement.includes("control lint")),
			risks.join("\n"),
		);
	});
});
