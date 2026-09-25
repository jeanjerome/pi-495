import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
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
const RIGHT = "export function greet(name) {\n  return `Hello, ${name}`;\n}\n";
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: true, notes: [] });

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

/** Plays one specification report per round and keeps the objective each one was written from. */
function rounds(
	t: TestHarness,
	reports: ReturnType<typeof specReport>[],
): { objectives: string[]; calls: () => number } {
	const objectives: string[] = [];
	let calls = 0;
	const original = t.agent.startIntervention.bind(t.agent);
	t.agent.startIntervention = async (m) => {
		if (m.role === "specify") {
			calls++;
			objectives.push(m.objective);
			t.agent.scripts.set("specify", {
				steps: [{ kind: "complete", output: reports[Math.min(calls - 1, reports.length - 1)]! }],
			});
		}
		if (m.role === "implement")
			t.agent.scripts.set("implement", {
				steps: [
					{ kind: "write", path: "src/greet.js", content: RIGHT },
					{ kind: "complete", output: report(["src/greet.js"]) },
				],
			});
		return original(m);
	};
	return { objectives, calls: () => calls };
}

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
		const { objectives, calls } = rounds(t, [
			ASKS_Q1,
			BINDS_Q1,
			RENAMES_MESSAGE,
			specReport({
				questions: [],
				answers: [{ question_id: Q1.id, observable: true, requirement_ids: [BODY.requirement_id] }],
				requirements: [BODY, UPDATE],
			}),
		]);
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

	it("does not reopen a report that loses an answer and carries nothing an earlier report did not, and G1 refuses the lost answer (6b)", async () => {
		const t = track(makeHarness());
		const { calls } = rounds(t, [ASKS_Q1, BINDS_Q1, RENAMES_MESSAGE, RENAMES_MESSAGE]);
		const changeId = await throughTwoRounds(t);
		const last = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(last.stopped_because, "blocked", last.steps.join(" | "));
		assert.equal(calls(), 4, "reopened once for Q1, then not again: the second report gained nothing");
		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(state.gates.G1?.verdict, "FAIL");
		assert.ok(
			state.gates.G1!.reasons.some((r) => r.includes(Q1.id) && r.includes("no requirement carries")),
			state.gates.G1!.reasons.join(" | "),
		);
		assert.equal(state.adopted.requirements, undefined, "nothing is adopted at G1");
	});

	it("stops reopening reports that take one answer back and lose the other in turn, and the change stops at G1 (6c)", async () => {
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
		const { calls } = rounds(t, [
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
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.gates.G1?.verdict, "FAIL");
		assert.ok(
			state.gates.G1!.reasons.some((r) => r.includes(QB.id)),
			state.gates.G1!.reasons.join(" | "),
		);
	});

	it("does not count an answer the report declares as fixing nothing observable as lost (6e)", async () => {
		const t = track(makeHarness());
		const { calls } = rounds(t, [
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
