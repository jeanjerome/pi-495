/**
 * V2 — the close of an increment's change is written to its program: the increment's result, then an
 * evaluation of each milestone that holds it, on the integrated project (D-18, PRG-05).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HUMAN } from "../helpers/change-fixture.ts";
import { trackedProject } from "../helpers/harness-fixture.ts";
import { integrated, next, produces, programHarness, programOf, statuses } from "../helpers/program-fixture.ts";
import { increment, threeIncrements } from "../helpers/trajectory.ts";

describe("the close of an increment's change is written to its program", () => {
	it("quand le changement de A est intégré, le programme inscrit A intégré, B et C prêts, et une évaluation du jalon NOT_RUN au digest de l'intégration de A qui nomme B et C restants", async () => {
		const t = programHarness(true);
		const { program, change } = await t.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements(),
			actor: HUMAN,
		});
		const receipt = await integrated(t, change.change_id, "A");
		const after = programOf(t, program.program_id);
		assert.deepEqual(statuses(after), [
			["A", "integrated"],
			["B", "ready"],
			["C", "ready"],
		]);
		const evaluation = after.milestone_evaluations.at(-1);
		assert.equal(evaluation?.milestone_id, "M1");
		assert.equal(evaluation?.verdict, "NOT_RUN");
		assert.deepEqual(evaluation?.remaining, ["increment:B", "increment:C"]);
		assert.equal(evaluation?.integrated_digest, receipt, "the milestone is evaluated on A's integration");
		assert.equal(after.closed, false);
	});

	it("quand le changement de B est annulé, le programme inscrit B bloqué, D reste planifié et l'évaluation nomme B restant", async () => {
		const t = programHarness(true);
		const { program, change } = await t.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements({
				increments: [
					increment("A", "Common base"),
					increment("B", "Export", ["A"], ["R1"]),
					increment("C", "Import", ["A"], ["R1"]),
					increment("D", "Report", ["B"]),
				],
			}),
			actor: HUMAN,
		});
		const receipt = await integrated(t, change.change_id, "A");
		assert.equal(programOf(t, program.program_id).increments[0]?.status, "integrated", "A is integrated");
		const b = await next(t, program.program_id);
		t.harness.cancel(b, HUMAN, "the export is dropped");
		const after = programOf(t, program.program_id);
		assert.deepEqual(statuses(after), [
			["A", "integrated"],
			["B", "blocked"],
			["C", "ready"],
			["D", "planned"],
		]);
		const evaluation = after.milestone_evaluations.at(-1);
		assert.ok(evaluation?.remaining.includes("increment:B"), JSON.stringify(evaluation));
		assert.equal(evaluation?.integrated_digest, receipt, "the latest integration of the program is A's");
	});

	it("A, B et C intégrés, le jalon final est PASS et le programme est clos ; s'il vérifie R3, il est INDETERMINATE et nomme R3 non exécutée", async () => {
		const t = programHarness(true);
		const { program, change } = await t.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements(),
			actor: HUMAN,
		});
		await integrated(t, change.change_id, "A");
		assert.equal(programOf(t, program.program_id).increments[0]?.status, "integrated", "A is integrated");
		await integrated(t, await next(t, program.program_id), "B");
		const last = await integrated(t, await next(t, program.program_id), "C");
		const closed = programOf(t, program.program_id);
		const evaluation = closed.milestone_evaluations.at(-1);
		assert.equal(evaluation?.verdict, "PASS");
		assert.equal(evaluation?.integrated_digest, last, "the milestone is evaluated on the last integration");
		assert.equal(closed.closed, true, "the final milestone passed closes the program");

		const v = programHarness(true);
		const verifying = await v.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements({
				global_requirements: [{ requirement_id: "R1" }, { requirement_id: "R3" }],
				milestone_globals: ["R3"],
			}),
			actor: HUMAN,
		});
		await integrated(v, verifying.change.change_id, "A");
		await integrated(v, await next(v, verifying.program.program_id), "B");
		await integrated(v, await next(v, verifying.program.program_id), "C");
		const open = programOf(v, verifying.program.program_id);
		const unverified = open.milestone_evaluations.at(-1);
		assert.equal(unverified?.verdict, "INDETERMINATE");
		assert.ok(unverified?.indeterminate.includes("global:R3:NOT_RUN"), JSON.stringify(unverified));
		assert.equal(open.closed, false, "a milestone whose global verification did not run does not close the program");
	});

	it("A accepté sans intégration, l'évaluation du jalon est INDETERMINATE et nomme le candidat intégré manquant", async () => {
		const t = programHarness(false);
		const { program, change } = await t.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements(),
			actor: HUMAN,
		});
		produces(t, "A");
		const done = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(done.view.change?.outcome, "accepted", done.steps.join(" | "));
		const after = programOf(t, program.program_id);
		assert.equal(after.increments[0]?.status, "accepted");
		const evaluation = after.milestone_evaluations.at(-1);
		assert.equal(evaluation?.verdict, "INDETERMINATE");
		assert.ok(evaluation?.indeterminate.includes("integrated_candidate:missing"), JSON.stringify(evaluation));
		assert.equal(evaluation?.integrated_digest, null);
	});
});
