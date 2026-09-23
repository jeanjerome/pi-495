import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { makeHarness, reopenHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { ChangeState } from "../../src/domain/change/state.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

function project(): string {
	const p = tempDir("495-proj-");
	cleanups.push(p);
	fixtureTs(p);
	initRepo(p);
	return p;
}
function track(t: TestHarness): TestHarness {
	cleanups.push(t.root);
	return t;
}

const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: true, notes: [] });
const write = (n: number) => ({ kind: "write" as const, path: `src/w${n}.js`, content: `// session piece ${n}\n` });
const read = { kind: "tool" as const, tool: "read" };
const CONFORMING = "export function greet(name) {\n  return `Hello, ${name}`; // conforming\n}\n";

/** Two calls allowed: the third is the one the kernel refuses. */
const TWO_CALLS = { budgets: { tool_calls_per_intervention: 2 } };

async function startAndAdvance(t: TestHarness, projectPath: string, request: string): Promise<string> {
	const { change } = await t.harness.start({ project_path: projectPath, request_text: request, actor: HUMAN });
	await t.harness.advance(change.change_id, { max_steps: 20 });
	return change.change_id;
}

function stateOf(t: TestHarness, changeId: string): ChangeState {
	return t.ledger.loadChange(changeId)!.state;
}

/** What the ledger says about the last intervention of a role when it ended. */
function finishedDetail(t: TestHarness, changeId: string, role: string): string {
	const ids = new Set(
		stateOf(t, changeId)
			.interventions.filter((i) => i.role === role)
			.map((i) => i.intervention_id),
	);
	const finished = t.ledger
		.readChangeEvents(changeId)
		.map((stored) => stored.event)
		.filter((e) => e.type === "intervention.finished" && ids.has(e.intervention_id));
	const last = finished.at(-1);
	assert.ok(last?.type === "intervention.finished", `no ${role} intervention finished`);
	return last.detail ?? "";
}

/** A role that keeps nothing between two runs is run again from the start, and its end says so. */
function assertRedoneOnResume(t: TestHarness, changeId: string, role: string): void {
	const detail = finishedDetail(t, changeId, role);
	assert.doesNotMatch(detail, /workspace keeps/, `a stopped ${role} keeps no work for a resume: ${detail}`);
	assert.match(detail, new RegExp(`a resume runs the ${role} intervention again`), detail);
}

function assertStoppedOnTheBound(state: ChangeState): void {
	assert.equal(state.status, "blocked", "reaching the bound stops the change");
	assert.equal(state.stop_reason, "budget_exhausted", `stopped as ${state.stop_reason}: ${state.stop_detail}`);
	assert.equal(state.stop_retryable, true, "the owner's resume lifts it");
	assert.match(state.stop_detail ?? "", /tool call budget/, "the stop names the bound");
	assert.match(state.stop_detail ?? "", /\b2\b/, "the stop names the bound's value");
}

describe("an intervention that reaches its tool-call bound stops the change until its owner resumes it (NFR-04)", () => {
	it("an implementation past its bound stops under budget_exhausted, and nothing starts before a resume", async () => {
		const p = project();
		const t = track(
			makeHarness({
				policy: TWO_CALLS,
				scripts: { implement: { steps: [write(1), write(2), write(3), { kind: "complete", output: report([]) }] } },
			}),
		);
		const changeId = await startAndAdvance(t, p, "Keep greet behaviour, tidy the implementation");
		const state = stateOf(t, changeId);
		assertStoppedOnTheBound(state);
		const implement = state.interventions.filter((i) => i.role === "implement");
		assert.equal(implement.length, 1);
		assert.notEqual(implement[0]!.result, "truncated", "a call bound is not the duration bound");
		assert.match(finishedDetail(t, changeId, "implement"), /the workspace keeps the unfinished work/);
		const again = await t.harness.advance(changeId, { max_steps: 10 });
		assert.deepEqual(again.steps, [], "a change stopped on its bound does nothing until a resume");
		assert.equal(stateOf(t, changeId).interventions.length, state.interventions.length);
	});

	it("the producer resumed by its owner goes on in the same attempt, on the same workspace, and is told so", async () => {
		const p = project();
		const first = track(
			makeHarness({
				policy: TWO_CALLS,
				scripts: { implement: { steps: [write(1), write(2), write(3), { kind: "complete", output: report([]) }] } },
			}),
		);
		const changeId = await startAndAdvance(first, p, "Keep greet behaviour, tidy the implementation");
		assertStoppedOnTheBound(stateOf(first, changeId));
		// The owner raises the bound, which a new session reads, then resumes.
		const t = reopenHarness(first, {
			policy: { budgets: { tool_calls_per_intervention: 100 } },
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: CONFORMING },
						{ kind: "complete", output: report(["src/greet.js"]) },
					],
				},
			},
		});
		t.harness.resume(changeId, HUMAN);
		await t.harness.advance(changeId, { max_steps: 6 });
		const state = stateOf(t, changeId);
		const implement = state.interventions.filter((i) => i.role === "implement");
		assert.ok(implement.length >= 2, `the producer must be resumed, got ${implement.length} intervention(s)`);
		assert.equal(implement[0]!.attempt_id, implement[1]!.attempt_id, "the resume stays inside the same attempt");
		assert.equal(state.attempts.length, 1, "a resume consumes no attempt");
		const workspaces = t.ledger.listArtifacts(changeId, "candidate").filter((a) => a.ref.artifact_id.startsWith("ws_"));
		assert.equal(workspaces.length, 1, "the producer keeps its workspace across the stop");
		assert.ok(state.candidate, "the resumed producer's work is frozen");
		const manifestArt = t.ledger
			.listArtifacts(changeId, "candidate")
			.find((a) => a.ref.artifact_id === state.candidate!.candidate_id)!;
		const manifest = JSON.parse(new TextDecoder().decode((await t.objects.get(manifestArt.object))!)) as {
			entries: { path: string }[];
		};
		assert.ok(
			manifest.entries.some((e) => e.path === "src/w1.js"),
			"what the first session wrote is still there after the resume",
		);
		const resumed = t.agent.started.filter((m) => m.role === "implement").at(0);
		assert.match(resumed?.prompt ?? "", /Interrupted work to finish/, "the resumed producer is told it resumes");
	});

	it("a resume that leaves the bound where it was stops again as soon as the bound is reached", async () => {
		const p = project();
		const t = track(
			makeHarness({
				policy: TWO_CALLS,
				scripts: { implement: { steps: [write(1), write(2), write(3), { kind: "complete", output: report([]) }] } },
			}),
		);
		const changeId = await startAndAdvance(t, p, "Keep greet behaviour, tidy the implementation");
		t.harness.resume(changeId, HUMAN);
		await t.harness.advance(changeId, { max_steps: 6 });
		const state = stateOf(t, changeId);
		assertStoppedOnTheBound(state);
		assert.equal(state.interventions.filter((i) => i.role === "implement").length, 2);
	});

	it("a specification past its bound stops under budget_exhausted, not as a configuration error", async () => {
		const p = project();
		const t = track(
			makeHarness({
				policy: TWO_CALLS,
				scripts: { specify: { steps: [read, read, read, { kind: "complete", output: specReport() }] } },
			}),
		);
		const changeId = await startAndAdvance(t, p, "Keep greet behaviour, tidy the implementation");
		assertStoppedOnTheBound(stateOf(t, changeId));
		assertRedoneOnResume(t, changeId, "specify");
	});

	it("the resume that lifts the stop is recorded under the owner who gave it", async () => {
		const p = project();
		const t = track(
			makeHarness({
				policy: TWO_CALLS,
				scripts: { specify: { steps: [read, read, read, { kind: "complete", output: specReport() }] } },
			}),
		);
		const changeId = await startAndAdvance(t, p, "Keep greet behaviour, tidy the implementation");
		assertStoppedOnTheBound(stateOf(t, changeId));
		t.harness.resume(changeId, HUMAN);
		const lifted = t.ledger
			.readChangeEvents(changeId)
			.map((stored) => stored.event)
			.filter((e) => e.type === "status.changed")
			.at(-1);
		assert.ok(lifted?.type === "status.changed" && lifted.status === "ready", "the resume lifts the stop");
		assert.deepEqual(lifted.actor, HUMAN, "the spending after the stop is the owner's to answer for");
	});

	it("a preparation past its bound stops the change instead of judging a partial suite", async () => {
		const p = tempDir("495-notests-");
		cleanups.push(p);
		writeFiles(p, {
			"package.json": JSON.stringify({
				name: "f-notests",
				version: "1.0.0",
				type: "module",
				scripts: { test: "node --test" },
			}),
			"src/greet.js": "export function greet(name) {\n  return `Hello, ${name}`;\n}\n",
		});
		initRepo(p);
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
		});
		const t = track(
			makeHarness({
				policy: TWO_CALLS,
				defaultScript: { steps: [{ kind: "complete", output: spec }] },
				scripts: {
					prepare: {
						steps: [
							{ kind: "write", path: "test/shout.test.js", content: "// half a suite\n" },
							read,
							read,
							{ kind: "complete", output: report(["test/shout.test.js"]) },
						],
					},
				},
			}),
		);
		const changeId = await startAndAdvance(t, p, "add shout");
		const state = stateOf(t, changeId);
		assertStoppedOnTheBound(state);
		assert.equal(state.interventions.filter((i) => i.role === "prepare").length, 1, "the preparation did run");
		const judged = t.ledger.listArtifacts(changeId, "preparation").filter((a) => a.ref.artifact_id.startsWith("prep_"));
		assert.equal(judged.length, 0, "a preparation stopped on its bound is not judged");
		assertRedoneOnResume(t, changeId, "prepare");
	});

	it("a review past its bound stops the change instead of recording an invalid review", async () => {
		const p = project();
		const t = track(
			makeHarness({
				policy: { ...TWO_CALLS, required_reviews: ["security"] },
				scripts: {
					implement: {
						steps: [
							{ kind: "write", path: "src/greet.js", content: CONFORMING },
							{ kind: "complete", output: report(["src/greet.js"]) },
						],
					},
					review: { steps: [read, read, read, { kind: "complete", output: { verdict: "PASS" } }] },
				},
			}),
		);
		const changeId = await startAndAdvance(t, p, "Keep greet behaviour, tidy the implementation");
		const state = stateOf(t, changeId);
		assert.equal(state.interventions.filter((i) => i.role === "review").length, 1, "the review did run");
		assertStoppedOnTheBound(state);
		assert.equal(t.ledger.listArtifacts(changeId, "review").length, 0, "no review is recorded for a stopped reviewer");
		assertRedoneOnResume(t, changeId, "review");
	});
});
