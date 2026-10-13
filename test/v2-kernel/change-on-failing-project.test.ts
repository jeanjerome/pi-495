import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTs, fixtureTsWithFailingTest, writeFiles } from "../helpers/fixtures.ts";
import { makeHarness, trackedProject, type TestHarness } from "../helpers/harness-fixture.ts";

/** An implementation that writes `content` to src/greet.js and reports that path changed. */
const writesGreet = (content: string): AgentScript => ({
	steps: [
		{ kind: "write", path: "src/greet.js", content },
		{
			kind: "complete",
			output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
		},
	],
});

/** F-TS with `farewell`, which says « Bye, x » where `test/farewell.test.js` expects « Goodbye, x ». */
function fixtureTsWithFailingFarewell(root: string): void {
	fixtureTs(root);
	writeFiles(root, {
		"src/farewell.js": "export function farewell(name) {\n  return `Bye, ${name}`;\n}\n",
		"test/farewell.test.js":
			'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { farewell } from "../src/farewell.js";\n\ntest("farewell says goodbye", () => {\n  assert.equal(farewell("x"), "Goodbye, x");\n});\n',
	});
}

/** The findings of the last pass of the test control on the candidate, as `baseline_state path` lines. */
function unitFindingsOnCandidate(t: TestHarness, changeId: string): string[] {
	const passes = t.ledger
		.listEvidence(changeId)
		.filter((e) => e.control_id === "unit" && e.subject.kind === "candidate");
	assert.ok(passes.length > 0, "the test control ran on the candidate");
	return passes.at(-1)!.findings.map((f) => `${f.baseline_state} ${f.path}`);
}

describe("a change on a project whose test already fails on the reference", () => {
	it("un changement sur un projet dont test/farewell.test.js échoue déjà passe G2, la preuve du contrôle unit porte un constat preexisting qui nomme test/farewell.test.js, et le changement est clos accepted", async () => {
		const p = trackedProject(fixtureTsWithFailingTest);
		const t = makeHarness({
			scripts: { implement: writesGreet("export function greet(name) {\n  return `Hello, ${name}`; // tidied\n}\n") },
		});
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;

		assert.equal(
			state.gates.G2?.verdict,
			"PASS",
			`G2 qualifies the test sensor by the cases of its witnesses: ${state.gates.G2?.reasons.join("; ")} ${state.stop_detail ?? ""}`,
		);
		const protocol = await t.harness.artifacts.latest<{ qualifications: Record<string, { qualified: boolean }> }>(
			state,
			"protocol",
		);
		assert.equal(protocol?.content.qualifications.unit?.qualified, true, "the control unit is qualified");
		const findings = unitFindingsOnCandidate(t, change.change_id);
		assert.ok(
			findings.includes("preexisting test/farewell.test.js"),
			`the evidence of unit on the candidate carries a preexisting finding naming test/farewell.test.js: ${findings.join(", ")}`,
		);
		assert.equal(state.outcome, "accepted", result.steps.join(" | "));
	});

	it("un contrôle déclaré qui échoue sur la référence comme sur le candidat est FAIL sur le candidat sans note de tolérance, G5 échoue sur declared control own-check: FAIL, et test/farewell.test.js reste un constat preexisting toléré par unit", async () => {
		const p = trackedProject(fixtureTsWithFailingTest);
		const t = makeHarness({
			policy: {
				budgets: { max_attempts: 1 },
				project_controls: [
					{
						control_id: "own-check",
						title: "a check of the project that fails on every tree",
						command: ["node", "-e", "process.exit(1)"],
						timeout_ms: 30_000,
						protected_paths: [],
					},
				],
			},
			scripts: { implement: writesGreet("export function greet(name) {\n  return `Hello, ${name}`; // tidied\n}\n") },
		});
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;

		const onCandidate = t.ledger
			.listEvidence(change.change_id)
			.filter((e) => e.subject.kind === "candidate" && e.facts.run === "candidate");
		const own = onCandidate.findLast((e) => e.control_id === "own-check");
		assert.ok(own, `own-check ran on the candidate: ${result.steps.join(" | ")}`);
		assert.equal(
			own.verdict,
			"FAIL",
			`a failure the reference shares is still a failure: ${JSON.stringify(own.baseline)}`,
		);
		assert.ok(
			!(own.baseline?.notes ?? []).some((n) => n.includes("tolerated")),
			`no tolerance note: ${JSON.stringify(own.baseline?.notes)}`,
		);
		assert.equal(state.gates.G5?.verdict, "FAIL", `G5 is evaluated and refuses: ${result.steps.join(" | ")}`);
		assert.ok(
			state.gates.G5.reasons.includes("declared control own-check: FAIL"),
			`G5 names the declared control: ${state.gates.G5.reasons.join("; ")}`,
		);
		const unit = onCandidate.findLast((e) => e.control_id === "unit");
		assert.equal(unit?.verdict, "PASS", "the detected suite keeps its tolerance");
		assert.ok(
			unitFindingsOnCandidate(t, change.change_id).includes("preexisting test/farewell.test.js"),
			"the detected suite's failure the reference shares stays a preexisting finding",
		);
	});

	it("un candidat qui fait échouer test/greet.test.js sur ce projet est refusé à G5 par requirement R1: FAIL (unit=FAIL), avec un constat new qui nomme test/greet.test.js", async () => {
		const p = trackedProject(fixtureTsWithFailingTest);
		const t = makeHarness({
			policy: { budgets: { max_attempts: 1 } },
			scripts: { implement: writesGreet("export function greet(name) {\n  return `Hi, ${name}`;\n}\n") },
		});
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;

		assert.equal(state.gates.G5?.verdict, "FAIL", `G5 is evaluated and refuses: ${result.steps.join(" | ")}`);
		assert.ok(
			state.gates.G5.reasons.includes("requirement R1: FAIL (unit=FAIL)"),
			`G5 names the requirement the test control fails: ${state.gates.G5.reasons.join("; ")}`,
		);
		const findings = unitFindingsOnCandidate(t, change.change_id);
		assert.ok(
			findings.includes("new test/greet.test.js"),
			`the evidence of unit on the candidate carries a new finding naming test/greet.test.js: ${findings.join(", ")}`,
		);
	});

	it("un candidat qui fait rendre Ciao, x à farewell, dont le test échouait déjà sur Bye, x, est refusé à G5 par requirement R1: FAIL (unit=FAIL), avec un constat new qui nomme test/farewell.test.js", async () => {
		const p = trackedProject(fixtureTsWithFailingFarewell);
		const t = makeHarness({
			policy: { budgets: { max_attempts: 1 } },
			scripts: {
				implement: {
					steps: [
						{
							kind: "write",
							path: "src/farewell.js",
							content: "export function farewell(name) {\n  return `Ciao, ${name}`;\n}\n",
						},
						{
							kind: "complete",
							output: { summary: "done", changed_paths: ["src/farewell.js"], tests_claimed: true, notes: [] },
						},
					],
				},
			},
		});
		const { change } = await t.harness.start({
			project_path: p,
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;

		assert.equal(state.gates.G5?.verdict, "FAIL", `G5 is evaluated and refuses: ${result.steps.join(" | ")}`);
		assert.ok(
			state.gates.G5.reasons.includes("requirement R1: FAIL (unit=FAIL)"),
			`G5 names the requirement the test control fails: ${state.gates.G5.reasons.join("; ")}`,
		);
		const findings = unitFindingsOnCandidate(t, change.change_id);
		assert.ok(
			findings.includes("new test/farewell.test.js"),
			`the evidence of unit on the candidate carries a new finding naming test/farewell.test.js: ${findings.join(", ")}`,
		);
	});
});
