/**
 * The traces of specs/formal/change-lifecycle replayed on the kernel: the real decider, its events kept in a
 * SQLite ledger under a temporary directory, observed after each step as the model is. A valid trace must be
 * followed step by step; an adverse one, a mutant's counterexample, must be refused once its fault runs, and
 * the property it violates in the mutant must hold on the kernel.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { type FormalTrace, fromCounterexample, loadTrace } from "../support/formal-traces.ts";
import { type ReplayReport, ledgerStore, replayTrace } from "../support/kernel-replay.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const COUNTEREXAMPLES = "specs/formal/change-lifecycle/counterexamples";
const VALID = "test/fixtures/formal-traces";
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const adverse = (name: string): FormalTrace =>
	fromCounterexample(readJson(`${COUNTEREXAMPLES}/${name}.json`), `${name}.json`);
const valid = (name: string): FormalTrace => loadTrace(readJson(`${VALID}/${name}.json`));

const cleanups = removedAfterEach();
let dir: string;
beforeEach(() => {
	dir = tempDir("495-formal-traces-", cleanups);
});

function replay(trace: FormalTrace): ReplayReport {
	return replayTrace(trace, ledgerStore(join(dir, "state.sqlite")));
}

function at(report: ReplayReport, step: number) {
	const found = report.steps.find((s) => s.step === step);
	assert.ok(found, `${report.trace}: step ${step} is replayed`);
	return found;
}

/** Every step is replayed, under its own number, and the kernel observes what the model expects of it. */
function assertFollowsTheModel(trace: FormalTrace, report: ReplayReport): void {
	assert.deepEqual(
		report.steps.map((s) => `${s.step} ${s.action}`),
		trace.steps.map((s) => `${s.step} ${s.action}`),
		`${trace.name}: every step of the trace is replayed`,
	);
	assert.deepEqual(report.divergences, [], `${trace.name}: the kernel observes what the model expects`);
}

describe("formal traces replayed on the kernel", () => {
	it("P1 reçu après reprise ne satisfait pas une obligation sous P2, tandis que P2 valide permet la poursuite", () => {
		const trace = valid("late-evidence-after-resume");
		const report = replay(trace);
		assertFollowsTheModel(trace, report);
		for (const step of [10, 11])
			assert.equal(at(report, step).delivered, "rejected", `step ${step}: a P1 result received after the resume`);
		for (const step of [14, 15])
			assert.equal(at(report, step).delivered, "recorded", `step ${step}: a P2 result on the same candidate`);
		assert.equal(at(report, 17).observed.outcome, "accepted", "the P2 results let the change go on to acceptance");
		assert.equal(report.violation, null, `FreshAcceptance: ${report.violation}`);
	});

	it("refuses an acceptance resting on the P1 results of the stale-proof sequence, protecting FreshAcceptance", () => {
		const trace = adverse("stale-proof");
		assert.equal(trace.property, "FreshAcceptance");
		const report = replay(trace);
		assert.deepEqual(report.divergences, [], "up to the resume, the kernel observes what the model expects");
		for (const step of [10, 11])
			assert.equal(at(report, step).delivered, "rejected", `step ${step}: a result that ran under P1`);
		const g5 = at(report, 13);
		assert.notEqual(g5.observed.outcome, "accepted", "FreshAcceptance: no acceptance rests on P1 results");
		assert.notEqual(g5.g5, "PASS", "FreshAcceptance: G5 does not pass on P1 results");
		assert.equal(report.violation, null, `FreshAcceptance: ${report.violation}`);
	});

	it("refuses to record the kernel's own answer to a pending acceptance at the resume, protecting HumanProvenance", () => {
		const trace = adverse("forged-acceptance");
		const report = replay(trace);
		assert.deepEqual(report.divergences, []);
		const fault = at(report, 9);
		assert.deepEqual(fault.refusals, ["decision.answer: INVALID_PROVENANCE"]);
		assert.equal(fault.observed.status, "decision_required", "the acceptance stays the human's to give");
		assert.equal(report.violation, null, `HumanProvenance: ${report.violation}`);
	});

	it("refuses to close accepted a change whose budget is exhausted, protecting AcceptanceNeedsObligations", () => {
		const trace = adverse("accept-exhausted");
		const report = replay(trace);
		assert.deepEqual(report.divergences, []);
		const fault = at(report, 12);
		assert.deepEqual(fault.refusals, ["gate.evaluate: PRECONDITION_FAILED"]);
		assert.equal(fault.observed.status, "blocked");
		assert.equal(fault.observed.outcome, "pending");
		assert.equal(report.violation, null, `AcceptanceNeedsObligations: ${report.violation}`);
	});

	it("follows a resume from a human wait, then the human acceptance, step by step (HumanAcceptance)", () => {
		const trace = valid("resume-awaiting-human-acceptance");
		const report = replay(trace);
		assertFollowsTheModel(trace, report);
		assert.equal(at(report, 11).g5, "PASS");
		assert.equal(report.violation, null, `HumanAcceptance: ${report.violation}`);
	});

	it("follows a correction that freezes a new candidate, step by step (AcceptanceNeedsObligations)", () => {
		const trace = valid("correction-to-new-candidate");
		const report = replay(trace);
		assertFollowsTheModel(trace, report);
		assert.equal(at(report, 7).g5, "FAIL");
		assert.equal(at(report, 15).g5, "PASS");
		assert.equal(report.violation, null, `AcceptanceNeedsObligations: ${report.violation}`);
	});

	it("names the first step at which a trace whose resume is omitted stops following the model", () => {
		const trace = valid("late-evidence-after-resume");
		const kept = trace.steps.filter((s) => s.action !== "Resume");
		const omitted = loadTrace({ ...trace, steps: kept.map((s, i) => ({ ...s, step: i + 2 })) });
		const report = replay(omitted);
		assert.match(report.divergences[0] ?? "", /^step 9 Deliver: /, "the omission is detected where it bites");
	});
});
