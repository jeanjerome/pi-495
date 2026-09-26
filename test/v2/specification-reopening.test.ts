import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import {
	assertStoppedBeforeG0,
	makeHarness,
	specificationRounds,
	specReport,
	type TestHarness,
} from "../helpers/harness-fixture.ts";
import { initRepo, fixtureTs, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { HumanOrigin } from "../../src/contracts/v1/decision.ts";
import type { RequirementsDocument } from "../../src/contracts/v1/protocol.ts";

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
const origin = (): HumanOrigin => ({
	actor: HUMAN,
	host: "tui",
	session_id: "s1",
	asserted_at: "2026-09-25T12:00:00.000Z",
});

type Requirement = ReturnType<typeof specReport>["requirements"][number];
const requirement = (requirement_id: string, mandatory = true): Requirement => ({
	requirement_id,
	statement: `${requirement_id} tient`,
	mandatory,
	criterion: "le scénario d'acceptation le vérifie",
	category: "interface",
	satisfied_by_reference: true,
});

const Q1 = { id: "q1", question: "400 ou 422, et quel message ?", material: true };
const Q6 = { id: "q6", question: "le corps garde-t-il le champ fautif ?", material: true };
const Q7 = { id: "q7", question: "la mise à jour suit-elle la même règle ?", material: true };
const MESSAGE = requirement("REQ-422-MESSAGE");
const BODY = requirement("REQ-422-BODY-FORMAT");
const UPDATE = requirement("REQ-UPDATE");

/** Answers every question put to the human since the last call, as the owner would through IH-01. */
function answerer(t: TestHarness, changeId: string): () => void {
	let answered = 0;
	return () => {
		for (const req of t.requested.slice(answered)) {
			assert.equal(req.interaction, "IH-01");
			const done = t.harness.answerDecision(
				changeId,
				{
					decision_id: req.decision_id,
					option_id: "answer",
					free_text: `réponse à ${req.question}`,
					reason: null,
					subject_revision: req.subject.revision,
					scope: null,
					expires_at: null,
				},
				origin(),
			);
			assert.equal(done.error, null);
		}
		answered = t.requested.length;
	};
}

// The first two rounds of java-flashnext-L2: Q1 is asked, then bound to a mandatory requirement by
// the report that asks Q6 and Q7.
const ASKS_Q1 = specReport({ questions: [Q1], answers: [], requirements: [MESSAGE, UPDATE] });
const BINDS_Q1 = specReport({
	questions: [Q1, Q6, Q7],
	answers: [{ question_id: Q1.id, observable: true, requirement_ids: [MESSAGE.requirement_id] }],
	requirements: [MESSAGE, UPDATE],
});
// Report 183: the requirement that held Q1 is renamed, Q6 and Q7 are declared, and nothing is asked.
const RENAMES_MESSAGE = specReport({
	questions: [],
	answers: [
		{ question_id: Q6.id, observable: true, requirement_ids: [BODY.requirement_id] },
		{ question_id: Q7.id, observable: true, requirement_ids: [UPDATE.requirement_id] },
	],
	requirements: [BODY, UPDATE],
});
// What report 183 should have been: Q1 bound to the requirement that replaced the one it was bound to.
const BINDS_Q1_TO_BODY = specReport({
	questions: [],
	answers: [{ question_id: Q1.id, observable: true, requirement_ids: [BODY.requirement_id] }],
	requirements: [BODY, UPDATE],
});

/** Starts the change and answers the questions of the first two rounds. */
async function throughTwoRounds(t: TestHarness): Promise<string> {
	const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
	const answerPending = answerer(t, change.change_id);
	assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
	answerPending();
	assert.equal(
		(await t.harness.advance(change.change_id)).stopped_because,
		"decision_required",
		"the report that binds Q1 asks Q6 and Q7",
	);
	answerPending();
	return change.change_id;
}

describe("a specification report is judged against every recorded material answer, the report a reopening produced included (BES-02, RM-010, RM-011)", () => {
	it("reopens a report that renames the requirement an answer was bound to without asking anything, and the answer reaches the requirements adopted at G1 (6a)", async () => {
		const t = track(makeHarness());
		const { objectives, calls } = specificationRounds(t, [ASKS_Q1, BINDS_Q1, RENAMES_MESSAGE, BINDS_Q1_TO_BODY]);
		const changeId = await throughTwoRounds(t);
		const last = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(last.stopped_because, "closed", last.steps.join(" | "));
		assert.equal(calls(), 4, "the report that lost Q1 is written again");
		assert.ok(
			objectives[3]!.includes(`Q ${Q1.id}: ${Q1.question} -> réponse à ${Q1.question} [to declare in \`answers\`]`),
			objectives[3],
		);
		assert.ok(t.progress.includes(`specification reopened by 1 material answer(s): ${Q1.id}`), t.progress.join(" | "));

		const state = t.ledger.loadChange(changeId)!.state;
		const adopted = (await t.harness.artifacts.latest<RequirementsDocument>(state, "requirements"))!;
		assert.deepEqual(
			adopted.content.answers.map((a) => [a.question_id, a.requirement_ids]),
			[
				[Q1.id, [BODY.requirement_id]],
				[Q6.id, [BODY.requirement_id]],
				[Q7.id, [UPDATE.requirement_id]],
			],
		);
	});

	it("does not reopen a report that loses an answer and carries nothing an earlier report did not, and stops the change before G0, naming the lost answer (6b)", async () => {
		const t = track(makeHarness());
		const { calls } = specificationRounds(t, [ASKS_Q1, BINDS_Q1, RENAMES_MESSAGE, RENAMES_MESSAGE]);
		const changeId = await throughTwoRounds(t);
		const last = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 4, "reopened once for Q1, then not again: the second report gained nothing");
		await assertStoppedBeforeG0(t, changeId, [Q1.id]);
	});

	it("stops reopening reports that take one answer back and lose the other in turn, and the change stops before G0 (6c)", async () => {
		const QA = { id: "q-a", question: "A ?", material: true };
		const QB = { id: "q-b", question: "B ?", material: true };
		const RA = requirement("R-A");
		const RB = requirement("R-B");
		const carriesA = specReport({
			questions: [],
			answers: [{ question_id: QA.id, observable: true, requirement_ids: [RA.requirement_id] }],
			requirements: [RA],
		});
		const carriesB = specReport({
			questions: [],
			answers: [{ question_id: QB.id, observable: true, requirement_ids: [RB.requirement_id] }],
			requirements: [RB],
		});
		const t = track(makeHarness());
		const { calls } = specificationRounds(t, [
			specReport({ questions: [QA, QB], answers: [], requirements: [RA, RB] }),
			carriesA,
			carriesB,
			carriesA,
			carriesB,
			carriesA,
		]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerer(t, change.change_id)();
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 4, "the fourth report carries only A, which the second already carried");
		await assertStoppedBeforeG0(t, change.change_id, [QB.id]);
	});

	it("does not count a pause and its resume as a human act: the rewritings after them stay bounded from the latest answer (6c)", async () => {
		const QA = { id: "q-a", question: "A ?", material: true };
		const QB = { id: "q-b", question: "B ?", material: true };
		const RA = requirement("R-A");
		const RB = requirement("R-B");
		const carriesA = specReport({
			questions: [],
			answers: [{ question_id: QA.id, observable: true, requirement_ids: [RA.requirement_id] }],
			requirements: [RA],
		});
		const carriesB = specReport({
			questions: [],
			answers: [{ question_id: QB.id, observable: true, requirement_ids: [RB.requirement_id] }],
			requirements: [RB],
		});
		const t = track(makeHarness());
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		// The fourth run is paused as `/495 pause` does it: the running session is aborted, then the
		// change is paused.
		const start = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role !== "specify" || calls() !== 4) return start(m);
			t.agent.scripts.set("specify", { steps: [{ kind: "hang" }] });
			const handle = await start(m);
			setTimeout(async () => {
				await t.harness.abortCurrent("pause");
				t.harness.pause(change.change_id, HUMAN);
			});
			return handle;
		};
		const { calls } = specificationRounds(t, [
			specReport({ questions: [QA, QB], answers: [], requirements: [RA, RB] }),
			carriesA,
			carriesB,
			// Never written: the fourth run is the one paused.
			carriesB,
			carriesA,
			carriesB,
		]);
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerer(t, change.change_id)();
		const paused = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(paused.stopped_because, "paused", paused.steps.join(" | "));
		assert.equal(t.harness.resume(change.change_id, HUMAN).change?.status, "ready");
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 5, "the report written after the resume carries only A, which the second already carried");
		await assertStoppedBeforeG0(t, change.change_id, [QB.id]);
	});

	it("asks the new material question of a reopened report first, and reopens that report on the answer even when it carries nothing an earlier report did not (6f)", async () => {
		const QA = { id: "q-a", question: "A ?", material: true };
		const QB = { id: "q-b", question: "B ?", material: true };
		const QC = { id: "q-c", question: "C ?", material: true };
		const RA = requirement("R-A");
		const RB = requirement("R-B");
		const RC = requirement("R-C");
		const binds = (...ids: [string, string][]) =>
			ids.map(([question_id, r]) => ({ question_id, observable: true, requirement_ids: [r] }));
		const t = track(makeHarness());
		const { objectives, calls } = specificationRounds(t, [
			specReport({ questions: [QA], answers: [], requirements: [RA] }),
			specReport({ questions: [QB], answers: binds([QA.id, RA.requirement_id]), requirements: [RA, RB] }),
			specReport({ questions: [], answers: binds([QB.id, RB.requirement_id]), requirements: [RB] }),
			// Takes A back, loses B, and asks C: nothing it carries is new to the reports before it.
			specReport({ questions: [QC], answers: binds([QA.id, RA.requirement_id]), requirements: [RA] }),
			specReport({
				questions: [],
				answers: binds([QA.id, RA.requirement_id], [QB.id, RB.requirement_id], [QC.id, RC.requirement_id]),
				requirements: [RA, RB, RC],
			}),
		]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		const answerPending = answerer(t, change.change_id);
		for (const asked of [QA, QB, QC]) {
			assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
			assert.equal(t.requested.at(-1)!.question, asked.question);
			answerPending();
		}
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "closed", last.steps.join(" | "));
		assert.equal(calls(), 5, "the report written before C was answered is written again");
		assert.ok(objectives[4]!.includes(`Q ${QC.id}: ${QC.question} -> réponse à ${QC.question}`), objectives[4]);
		assert.ok(
			t.progress.includes(`specification reopened by 2 material answer(s): ${QB.id}, ${QC.id}`),
			t.progress.join(" | "),
		);
	});

	it("asks no human to adopt the mandate of a report that loses an answer, and stops the change before G0 (6g)", async () => {
		const t = track(makeHarness({ policy: { adoption: { mandate: "human" } } }));
		const renames = Array.from({ length: 6 }, (_, i) => ({ ...RENAMES_MESSAGE, objective: `objectif ${i}` }));
		const { calls } = specificationRounds(t, [ASKS_Q1, BINDS_Q1, ...renames]);
		const changeId = await throughTwoRounds(t);
		const last = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 4, "reopened once for Q1, then not again: the second report gained nothing");
		await assertStoppedBeforeG0(t, changeId, [Q1.id]);
	});

	it("counts what the report the latest answer was given on carries as already carried (6h)", async () => {
		const QA = { id: "q-a", question: "A ?", material: true };
		const QC = { id: "q-c", question: "C ?", material: true };
		const RA = requirement("R-A");
		const bindsA = { question_id: QA.id, observable: true, requirement_ids: [RA.requirement_id] };
		const t = track(makeHarness());
		const { calls } = specificationRounds(t, [
			specReport({ questions: [QA], answers: [], requirements: [RA] }),
			specReport({ questions: [QC], answers: [bindsA], requirements: [RA] }),
			// Carries A, which the report C was answered on already carried, and still loses C.
			specReport({ questions: [], answers: [bindsA], requirements: [RA] }),
		]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		const answerPending = answerer(t, change.change_id);
		for (let round = 0; round < 2; round++) {
			assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
			answerPending();
		}
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 3, "reopened once for C, then not again: A was already carried");
		await assertStoppedBeforeG0(t, change.change_id, [QC.id]);
	});

	it("writes again the report the latest answer was given on when it ignores an answer, even when it is not the first report and carries none (6i)", async () => {
		const QA = { id: "q-a", question: "A ?", material: true };
		const QB = { id: "q-b", question: "B ?", material: true };
		const RA = requirement("R-A");
		const RB = requirement("R-B");
		const t = track(makeHarness());
		const { objectives, calls } = specificationRounds(t, [
			specReport({ questions: [QA], answers: [], requirements: [RA] }),
			// Written again for A, it declares nothing and asks B: B is answered on it.
			specReport({ questions: [QB], answers: [], requirements: [RB] }),
			specReport({
				questions: [],
				answers: [
					{ question_id: QA.id, observable: true, requirement_ids: [RA.requirement_id] },
					{ question_id: QB.id, observable: true, requirement_ids: [RB.requirement_id] },
				],
				requirements: [RA, RB],
			}),
		]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		const answerPending = answerer(t, change.change_id);
		for (const asked of [QA, QB]) {
			assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
			assert.equal(t.requested.at(-1)!.question, asked.question);
			answerPending();
		}
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "closed", last.steps.join(" | "));
		assert.equal(calls(), 3, "the report B was answered on is written again");
		assert.ok(objectives[2]!.includes(`Q ${QB.id}: ${QB.question} -> réponse à ${QB.question}`), objectives[2]);
	});

	it("counts what the report the latest answer was given on inherits from an earlier report as already carried (6j)", async () => {
		const QA = { id: "q-a", question: "A ?", material: true };
		const QB = { id: "q-b", question: "B ?", material: true };
		const QC = { id: "q-c", question: "C ?", material: true };
		const RA = requirement("R-A");
		const RB = requirement("R-B");
		const bindsA = { question_id: QA.id, observable: true, requirement_ids: [RA.requirement_id] };
		const bindsB = { question_id: QB.id, observable: true, requirement_ids: [RB.requirement_id] };
		const t = track(makeHarness());
		const { calls } = specificationRounds(t, [
			specReport({ questions: [QA], answers: [], requirements: [RA] }),
			specReport({ questions: [QB], answers: [bindsA], requirements: [RA] }),
			// Keeps R-A without restating A: it carries A by inheritance, and C is answered on it.
			specReport({ questions: [QC], answers: [bindsB], requirements: [RA, RB] }),
			// Restates A, keeps B, and still loses C.
			specReport({ questions: [], answers: [bindsA], requirements: [RA, RB] }),
		]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		const answerPending = answerer(t, change.change_id);
		for (const asked of [QA, QB, QC]) {
			assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
			assert.equal(t.requested.at(-1)!.question, asked.question);
			answerPending();
		}
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 4, "reopened once for C, then not again: A was already carried");
		await assertStoppedBeforeG0(t, change.change_id, [QC.id]);
	});

	it("does not count an answer the report declares as fixing nothing observable as lost (6e)", async () => {
		const t = track(makeHarness());
		const { calls } = specificationRounds(t, [
			ASKS_Q1,
			specReport({
				questions: [],
				answers: [{ question_id: Q1.id, observable: false, requirement_ids: [] }],
				requirements: [UPDATE],
			}),
		]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerer(t, change.change_id)();
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "closed", last.steps.join(" | "));
		assert.equal(calls(), 2);
	});
});

describe("a change stopped because its specification no longer progresses is resumed into a rewriting, or abandoned (BES-02, RM-010, RM-011)", () => {
	/** Takes the change of 6b to its stop: Q1 is lost by a reopened report and by the one after it. */
	async function stopped(t: TestHarness, calls: () => number): Promise<string> {
		const changeId = await throughTwoRounds(t);
		const last = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 4);
		await assertStoppedBeforeG0(t, changeId, [Q1.id]);
		return changeId;
	}

	it("writes the specification again on resume, asks it to declare the lost answer, and a report that declares it takes the change past G1", async () => {
		const t = track(makeHarness());
		const { objectives, calls } = specificationRounds(t, [
			ASKS_Q1,
			BINDS_Q1,
			RENAMES_MESSAGE,
			RENAMES_MESSAGE,
			BINDS_Q1_TO_BODY,
		]);
		const changeId = await stopped(t, calls);
		assert.equal(t.harness.resume(changeId, HUMAN).change?.status, "ready");
		const last = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(last.stopped_because, "closed", last.steps.join(" | "));
		assert.equal(calls(), 5, "the resume obtains one rewriting of the report that lost Q1");
		assert.ok(
			objectives[4]!.includes(`Q ${Q1.id}: ${Q1.question} -> réponse à ${Q1.question} [to declare in \`answers\`]`),
			objectives[4],
		);
		const state = t.ledger.loadChange(changeId)!.state;
		const adopted = (await t.harness.artifacts.latest<RequirementsDocument>(state, "requirements"))!;
		assert.deepEqual(adopted.content.answers.find((a) => a.question_id === Q1.id)?.requirement_ids, [
			BODY.requirement_id,
		]);
	});

	it("stops the change again after a single rewriting when the report a resume obtained gains nothing, at each resume (6a)", async () => {
		const t = track(makeHarness());
		const { calls } = specificationRounds(t, [ASKS_Q1, BINDS_Q1, RENAMES_MESSAGE]);
		const changeId = await stopped(t, calls);
		for (const expected of [5, 6]) {
			assert.equal(t.harness.resume(changeId, HUMAN).change?.status, "ready");
			const last = await t.harness.advance(changeId, { max_steps: 30 });
			assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
			assert.equal(calls(), expected, "one specification intervention per resume");
			await assertStoppedBeforeG0(t, changeId, [Q1.id]);
		}
	});

	it("refuses to pause a stopped change, whose stop a resume still lifts into a rewriting (6a)", async () => {
		const t = track(makeHarness());
		const { calls } = specificationRounds(t, [ASKS_Q1, BINDS_Q1, RENAMES_MESSAGE]);
		const changeId = await stopped(t, calls);
		assert.throws(
			() => t.harness.pause(changeId, HUMAN),
			(e: { code?: string }) => e.code === "PRECONDITION_FAILED",
		);
		await assertStoppedBeforeG0(t, changeId, [Q1.id]);
		assert.equal(t.harness.resume(changeId, HUMAN).change?.status, "ready");
		const last = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 5, "the resume obtains one rewriting of the report that lost Q1");
	});

	it("closes a stopped change as abandoned on cancel, without any intervention (6b)", async () => {
		const t = track(makeHarness());
		const { calls } = specificationRounds(t, [ASKS_Q1, BINDS_Q1, RENAMES_MESSAGE]);
		const changeId = await stopped(t, calls);
		const view = t.harness.cancel(changeId, HUMAN, "la spécification perd la réponse à q1");
		assert.equal(view.change?.outcome, "abandoned");
		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(state.status, "cancelled");
		assert.equal(state.phase, "closed");
		await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(calls(), 4, "no specification is written after the change is abandoned");
	});
});

describe("a declaration carries an answer only when it holds in the requirements of the report that makes it (BES-02, RM-011)", () => {
	const OPTIONAL = requirement("REQ-OPTIONAL", false);
	const binds = (question_id: string, ...requirement_ids: string[]) => ({
		question_id,
		observable: true,
		requirement_ids,
	});

	/** Answers Q1 on the first report, then Q6 on the second, and advances to wherever the change stops. */
	async function throughQ1AndQ6(t: TestHarness): Promise<{ changeId: string; stoppedBecause: string }> {
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		const answerPending = answerer(t, change.change_id);
		for (const asked of [Q1, Q6]) {
			assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
			assert.equal(t.requested.at(-1)!.question, asked.question);
			answerPending();
		}
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		return { changeId: change.change_id, stoppedBecause: last.stopped_because };
	}

	it("reopens a report whose declaration names a requirement it does not carry, and stops the change before G0 when the next one gains nothing (6e)", async () => {
		const t = track(makeHarness());
		const toAbsent = binds(Q1.id, "REQ-ABSENT");
		const { objectives, calls } = specificationRounds(t, [
			ASKS_Q1,
			specReport({ questions: [Q1, Q6], answers: [toAbsent], requirements: [MESSAGE, UPDATE] }),
			specReport({
				questions: [],
				answers: [toAbsent, binds(Q6.id, MESSAGE.requirement_id)],
				requirements: [MESSAGE, UPDATE],
			}),
		]);
		const { changeId, stoppedBecause } = await throughQ1AndQ6(t);
		assert.equal(stoppedBecause, "blocked");
		assert.ok(
			t.progress.includes(`specification reopened by 2 material answer(s): ${Q1.id}, ${Q6.id}`),
			t.progress.join(" | "),
		);
		assert.ok(
			objectives[2]!.includes(`Q ${Q1.id}: ${Q1.question} -> réponse à ${Q1.question} [to declare in \`answers\`]`),
			objectives[2],
		);
		assert.equal(calls(), 4, "the third report carries Q6, the fourth nothing new");
		await assertStoppedBeforeG0(t, changeId, [Q1.id]);
	});

	it("reopens a report whose own declaration names a requirement it does not carry, although an earlier report bound the answer to one it keeps, and stops the change before G0 when the next one gains nothing (6e)", async () => {
		const t = track(makeHarness());
		const rebindsToAbsent = specReport({
			questions: [],
			answers: [binds(Q1.id, "REQ-ABSENT"), binds(Q6.id, MESSAGE.requirement_id)],
			requirements: [MESSAGE, UPDATE],
		});
		const { objectives, calls } = specificationRounds(t, [
			ASKS_Q1,
			specReport({
				questions: [Q1, Q6],
				answers: [binds(Q1.id, MESSAGE.requirement_id)],
				requirements: [MESSAGE, UPDATE],
			}),
			rebindsToAbsent,
			rebindsToAbsent,
		]);
		const { changeId, stoppedBecause } = await throughQ1AndQ6(t);
		assert.equal(stoppedBecause, "blocked");
		assert.ok(
			objectives[3]!.includes(`Q ${Q1.id}: ${Q1.question} -> réponse à ${Q1.question} [to declare in \`answers\`]`),
			objectives[3],
		);
		assert.equal(calls(), 4, "the binding the third report inherits does not stand against its own");
		await assertStoppedBeforeG0(t, changeId, [Q1.id]);
	});

	it("reopens a report whose declaration names only a non-mandatory requirement, and a report that binds the answer to a mandatory one takes the change past G1 (6e)", async () => {
		const t = track(makeHarness());
		const { objectives, calls } = specificationRounds(t, [
			ASKS_Q1,
			specReport({
				questions: [Q1, Q6],
				answers: [binds(Q1.id, OPTIONAL.requirement_id)],
				requirements: [MESSAGE, OPTIONAL],
			}),
			specReport({
				questions: [],
				answers: [binds(Q1.id, MESSAGE.requirement_id, OPTIONAL.requirement_id), binds(Q6.id, MESSAGE.requirement_id)],
				requirements: [MESSAGE, OPTIONAL],
			}),
		]);
		const { stoppedBecause } = await throughQ1AndQ6(t);
		assert.equal(stoppedBecause, "closed");
		assert.ok(
			t.progress.includes(`specification reopened by 2 material answer(s): ${Q1.id}, ${Q6.id}`),
			t.progress.join(" | "),
		);
		assert.ok(
			objectives[2]!.includes(`Q ${Q1.id}: ${Q1.question} -> réponse à ${Q1.question} [to declare in \`answers\`]`),
			objectives[2],
		);
		assert.equal(calls(), 3);
	});
});

describe("a refusal at G1 names the only way out a command holds once the mandate is adopted (BES-02)", () => {
	it("names cancel, and nowhere revise_requirements, when G1 refuses a report that carries every answer and repeats a requirement id (6f)", async () => {
		const t = track(makeHarness());
		specificationRounds(t, [
			ASKS_Q1,
			specReport({
				questions: [],
				answers: [{ question_id: Q1.id, observable: true, requirement_ids: [MESSAGE.requirement_id] }],
				requirements: [MESSAGE, MESSAGE, UPDATE],
			}),
		]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerer(t, change.change_id)();
		const last = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.gates.G1?.verdict, "FAIL");
		assert.ok(
			state.gates.G1!.reasons.some((r) => r.includes(`duplicate requirement id ${MESSAGE.requirement_id}`)),
			state.gates.G1!.reasons.join(" | "),
		);
		assert.equal(state.gates.G1!.next_action, "cancel");
		assert.ok(state.stop_detail?.includes("cancel"), state.stop_detail ?? "");
		const shown = [state.gates.G1!.next_action, state.stop_detail, last.view.change?.next_action, ...last.steps];
		assert.equal(
			shown.some((s) => s?.includes("revise_requirements")),
			false,
			shown.join(" | "),
		);
	});
});
