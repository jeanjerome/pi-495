import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Runner, design } from "../helpers/change-fixture.ts";
import type { Design, DesignTask } from "../../src/contracts/v1/protocol.ts";

/** A task of the plan serving `requirementIds`, writing under `src/`, checked by the unit tests. */
function task(taskId: string, requirementIds: string[], dependsOn: string[] = []): DesignTask {
	return {
		task_id: taskId,
		summary: `do ${taskId}`,
		responsibility: "greet",
		requirement_ids: requirementIds,
		depends_on: dependsOn,
		paths: ["src/greet.ts"],
		checks: ["node --test test/greet.test.ts"],
	};
}

/** The fixture design, R1 and R2 mandatory, carrying `tasks` as its plan. */
function planned(tasks: DesignTask[]): Design {
	return design({ tasks });
}

/** The G3 verdict and its reasons once the change at design examines `plan`. */
function examined(plan: Design) {
	const r = new Runner().create().g0().g1().g2();
	r.g3(plan);
	return { verdict: r.s.gates.G3?.verdict, reasons: r.s.gates.G3?.reasons ?? [], phase: r.s.phase };
}

describe("the plan of tasks G3 examines", () => {
	it("une dépendance inconnue, un cycle et une exigence non servie sont nommés", () => {
		const g3 = examined(planned([task("T1", ["R1"], ["T9"]), task("T2", ["R1"], ["T3"]), task("T3", ["R1"], ["T2"])]));
		assert.equal(g3.verdict, "FAIL", "a plan with an unknown dependency, a cycle and an unserved requirement fails");
		assert.ok(
			g3.reasons.some((r) => r.includes("T1") && r.includes("T9")),
			`the unknown dependency is named with its task: ${g3.reasons.join(" | ")}`,
		);
		assert.ok(
			g3.reasons.some((r) => r.includes("cycle") && r.includes("T2") && r.includes("T3")),
			`the cycle is named with its tasks: ${g3.reasons.join(" | ")}`,
		);
		assert.ok(
			g3.reasons.some((r) => r.includes("R2") && r.includes("task")),
			`the mandatory requirement no task serves is named: ${g3.reasons.join(" | ")}`,
		);
		assert.equal(g3.phase, "design", "the plan is not adopted");
	});

	it("un résumé sans tâche ne sert aucune exigence obligatoire", () => {
		const g3 = examined(planned([]));
		assert.equal(g3.verdict, "FAIL");
		for (const id of ["R1", "R2"])
			assert.ok(
				g3.reasons.some((r) => r.includes(id) && r.includes("task")),
				`${id} is named as served by no task: ${g3.reasons.join(" | ")}`,
			);
	});

	it("une tâche qui sert une exigence inconnue ou réutilise un identifiant est nommée", () => {
		const g3 = examined(planned([task("T1", ["R1", "R2"]), task("T1", ["R7"])]));
		assert.equal(g3.verdict, "FAIL");
		assert.ok(
			g3.reasons.some((r) => r.includes("R7")),
			`the unknown requirement is named: ${g3.reasons.join(" | ")}`,
		);
		assert.ok(
			g3.reasons.some((r) => r.includes("T1") && r.includes("twice")),
			`the reused task id is named: ${g3.reasons.join(" | ")}`,
		);
	});

	it("une tâche qui écrit hors du mandat ou sous un chemin protégé est localisée", () => {
		const outside = { ...task("T1", ["R1", "R2"]), paths: ["src/greet.ts", "docs/greet.md"] };
		const tests = { ...task("T2", ["R1"], ["T1"]), paths: ["test/"] };
		const g3 = examined(planned([outside, tests]));
		assert.equal(g3.verdict, "FAIL");
		assert.ok(
			g3.reasons.some((r) => r.includes("T1") && r.includes("docs/greet.md") && r.includes("mandate")),
			`the path outside the mandate is named with its task: ${g3.reasons.join(" | ")}`,
		);
		assert.ok(
			g3.reasons.some((r) => r.includes("T2") && r.includes("test/") && r.includes("protect")),
			`the protected path is named with its task: ${g3.reasons.join(" | ")}`,
		);
	});

	it("une seule tâche courte qui sert toutes les exigences suffit à un choix local", () => {
		const g3 = examined(planned([task("T1", ["R1", "R2"])]));
		assert.deepEqual([g3.verdict, g3.reasons], ["PASS", []]);
		assert.equal(g3.phase, "implementation");
	});

	it("deux tâches dont l'une attend l'autre forment un plan valide", () => {
		const g3 = examined(planned([task("T1", ["R1"]), task("T2", ["R2"], ["T1"])]));
		assert.deepEqual([g3.verdict, g3.reasons], ["PASS", []]);
	});
});
