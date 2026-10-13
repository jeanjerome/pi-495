import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HUMAN } from "../helpers/change-fixture.ts";
import { removedAfterEach } from "../helpers/fixtures.ts";
import { GOOD_GREET, makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";
import type { DesignTask } from "../../src/contracts/v1/protocol.ts";
import type { SpecificationReport } from "../../src/contracts/v1/reports.ts";

removedAfterEach();

/** The task that serves R1 by rewriting greet, writing `paths`. */
function greetTask(paths: string[]): DesignTask {
	return {
		task_id: "T1",
		summary: "rewrite greet",
		responsibility: "greet",
		requirement_ids: ["R1"],
		depends_on: [],
		paths,
		checks: ["node --test"],
	};
}

/** Conducts a change on F-TS whose specification carries `design`, and reads where it stopped. */
async function designed(design: SpecificationReport["design"]) {
	const t = makeHarness({
		defaultScript: { steps: [{ kind: "complete", output: { ...specReport(), design } }] },
		scripts: {
			implement: {
				steps: [
					{ kind: "write", path: "src/greet.js", content: GOOD_GREET },
					{
						kind: "complete",
						output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
					},
				],
			},
		},
	});
	const { change } = await t.harness.start({
		project_path: trackedProject(),
		request_text: "Keep greet behaviour, tidy the implementation",
		actor: HUMAN,
	});
	const result = await t.harness.advance(change.change_id);
	const state = t.ledger.loadChange(change.change_id)!.state;
	const produced = t.agent.started.some((m) => m.role === "implement");
	return { result, state, produced };
}

describe("G3 verifies the plan instead of trusting indicators", () => {
	it("un résumé seul ou un chemin protégé ne fait pas passer G3", async () => {
		const { tasks: _, ...summaryOnly } = specReport().design;
		const alone = await designed(summaryOnly);
		assert.equal(alone.state.gates.G3?.verdict, "FAIL", "a non-empty summary alone does not make the plan executable");
		assert.ok(
			alone.state.gates.G3?.reasons.some((r) => r.includes("R1") && r.includes("task")),
			`G3 names the mandatory requirement no task serves: ${alone.state.gates.G3?.reasons.join(" | ")}`,
		);
		assert.equal(alone.produced, false, "no producer is started on a plan G3 refused");

		const protectedPaths = (await designed(specReport().design)).state.protocol?.protected_paths ?? [];
		assert.ok(protectedPaths.includes("test/"), `the frozen tests are protected: ${protectedPaths}`);
		const writesTheTest = await designed({
			...specReport().design,
			tasks: [greetTask(["src/greet.js", "test/greet.test.js"])],
		});
		assert.equal(
			writesTheTest.state.gates.G3?.verdict,
			"FAIL",
			"a task that writes a protected path is not compatible with the mandate",
		);
		assert.ok(
			writesTheTest.state.gates.G3?.reasons.some((r) => r.includes("T1") && r.includes("test/greet.test.js")),
			`G3 locates the incompatibility on the task and the path: ${writesTheTest.state.gates.G3?.reasons.join(" | ")}`,
		);
		assert.equal(writesTheTest.produced, false, "the incompatibility is located before production starts");

		const compatible = await designed({ ...specReport().design, tasks: [greetTask(["src/greet.js"])] });
		assert.equal(compatible.state.gates.G3?.verdict, "PASS", compatible.state.gates.G3?.reasons.join(" | "));
		assert.equal(compatible.state.outcome, "accepted", compatible.result.steps.join(" | "));
	});
});

/**
 * A change whose specification first carries `bad` as its plan and, once the plan is sent back with G3's reasons,
 * carries `good`. The objective of an intervention that rewrites the plan is the one that says G3 refused it.
 */
async function sentBack(bad: SpecificationReport["design"], good: SpecificationReport["design"]) {
	const script = (design: SpecificationReport["design"]) => ({
		steps: [{ kind: "complete" as const, output: { ...specReport(), design } }],
	});
	const t = makeHarness({
		defaultScript: script(bad),
		scripts: {
			implement: {
				steps: [
					{ kind: "write", path: "src/greet.js", content: GOOD_GREET },
					{
						kind: "complete",
						output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
					},
				],
			},
		},
	});
	const start = t.agent.startIntervention.bind(t.agent);
	t.agent.startIntervention = (mandate) => {
		if (mandate.role === "specify" && mandate.objective.includes("refused at G3"))
			t.agent.scripts.set("specify", script(good));
		return start(mandate);
	};
	const { change } = await t.harness.start({
		project_path: trackedProject(),
		request_text: "Keep greet behaviour, tidy the implementation",
		actor: HUMAN,
	});
	const result = await t.harness.advance(change.change_id);
	const state = t.ledger.loadChange(change.change_id)!.state;
	const rewrites = t.agent.started.filter((m) => m.role === "specify" && m.objective.includes("refused at G3"));
	return { result, state, rewrites };
}

describe("a plan G3 refuses goes back to the model that wrote it", () => {
	it("given a plan whose task writes a protected path, then the plan is written again with G3's reasons and the change goes on with the plan it gets", async () => {
		const bad = { ...specReport().design, tasks: [greetTask(["src/greet.js", "test/greet.test.js"])] };
		const good = { ...specReport().design, tasks: [greetTask(["src/greet.js"])] };

		const { result, state, rewrites } = await sentBack(bad, good);

		assert.equal(rewrites.length, 1, "the plan is sent back once");
		assert.ok(
			rewrites[0]!.objective.includes("T1") && rewrites[0]!.objective.includes("test/greet.test.js"),
			`the model is told which task writes which protected path: ${rewrites[0]?.objective}`,
		);
		assert.equal(state.gates.G3?.verdict, "PASS", state.gates.G3?.reasons.join(" | "));
		assert.equal(state.outcome, "accepted", result.steps.join(" | "));
	});

	it("given a plan G3 refuses every time, then it is written again as many times as the change has attempts and the change then stops on G3's reasons", async () => {
		const bad = { ...specReport().design, tasks: [greetTask(["src/greet.js", "test/greet.test.js"])] };

		const { state, rewrites } = await sentBack(bad, bad);

		assert.equal(
			rewrites.length,
			state.budgets.max_attempts,
			"the plan is sent back once for each attempt the change has",
		);
		assert.equal(state.status, "blocked");
		assert.match(state.stop_detail ?? "", /design rejected at G3.*test\/greet\.test\.js/);
	});
});
