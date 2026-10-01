import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	ActsOnFirstCandidateRun,
	ThrowsOnFirstCandidateRun,
	makeHarness,
	specificationRounds,
	specReport,
	type TestHarness,
} from "../helpers/harness-fixture.ts";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import {
	initRepo,
	fixtureTs,
	fixtureTsWithoutTests,
	tempDir,
	SHOUT_IMPL,
	SHOUT_TEST,
	removedAfterEach,
} from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import type { ArtifactRef } from "../../src/contracts/v1/common.ts";
import type { DecisionRequest, HumanDecision, HumanOrigin } from "../../src/contracts/v1/decision.ts";
import type { Mandate, Protocol, RequirementsDocument } from "../../src/contracts/v1/protocol.ts";
import type { SpecificationReport } from "../../src/contracts/v1/reports.ts";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { exportChange } from "../../src/export/export-service.ts";

const cleanups = removedAfterEach();

function project(fixture: (root: string) => void = fixtureTs): string {
	const p = tempDir("495-proj-", cleanups);
	fixture(p);
	initRepo(p);
	return p;
}
const origin = (): HumanOrigin => ({
	actor: HUMAN,
	host: "tui",
	session_id: "s1",
	asserted_at: "2026-09-28T12:00:00.000Z",
});

type Requirement = ReturnType<typeof specReport>["requirements"][number];
const requirement = (requirement_id: string): Requirement => ({
	requirement_id,
	statement: `${requirement_id} tient`,
	mandatory: true,
	criterion: "le scénario d'acceptation le vérifie",
	category: "interface",
	satisfied_by_reference: true,
});

const Q1 = { id: "q1", question: "Quel statut pour une saisie invalide ?", material: true };
const REQ_400 = requirement("REQ-400");
const REQ_422 = requirement("REQ-422");

const POSES_Q1 = specReport({ questions: [Q1], answers: [], requirements: [REQ_400] });
const BINDS_Q1_TO_400 = specReport({
	questions: [],
	answers: [{ question_id: Q1.id, observable: true, requirement_ids: [REQ_400.requirement_id] }],
	requirements: [REQ_400],
});
const BINDS_Q1_TO_422 = specReport({
	questions: [],
	answers: [{ question_id: Q1.id, observable: true, requirement_ids: [REQ_422.requirement_id] }],
	requirements: [REQ_422],
});
const SAYS_NOTHING_OF_Q1 = specReport({ questions: [], answers: [], requirements: [REQ_422] });
/** Keeps the requirement written for "400" and no longer says what Q1 binds. */
const KEEPS_400_SILENT_ON_Q1 = specReport({ questions: [], answers: [], requirements: [REQ_400] });

/** The owner resolves the one decision presented, answering it or closing it, and returns the decision recorded. */
function resolvePresented(t: TestHarness, changeId: string, optionId: "answer" | "close", freeText: string | null) {
	const presented = t.harness.pendingDecisions(changeId);
	assert.deepEqual(
		presented.map((d) => d.interaction),
		["IH-01"],
	);
	const asked = presented[0]!;
	const resolved = t.harness.answerDecision(
		changeId,
		{
			decision_id: asked.decision_id,
			option_id: optionId,
			free_text: freeText,
			reason: null,
			subject_revision: asked.subject.revision,
			scope: null,
			expires_at: null,
		},
		origin(),
	);
	assert.equal(resolved.error, null);
	return resolved.decision!;
}

/**
 * The change started under a human acceptance, Q1 answered "400" through IH-01 under the returned
 * human decision, and conducted until IH-10 awaits the owner. The reports are played one per
 * specification round: by default the first poses Q1, the second binds it to REQ-400.
 */
async function awaitingAcceptance(
	t: TestHarness,
	{
		reports = [POSES_Q1, BINDS_Q1_TO_400],
		projectPath = project(),
		language,
	}: { reports?: SpecificationReport[]; projectPath?: string; language?: "fr" | "en" } = {},
): Promise<{ changeId: string; answeredBy: string; rounds: ReturnType<typeof specificationRounds> }> {
	const rounds = specificationRounds(t, reports);
	const { change } = await t.harness.start({
		project_path: projectPath,
		request_text: "x",
		actor: HUMAN,
		...(language ? { language } : {}),
	});
	assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
	const answeredBy = resolvePresented(t, change.change_id, "answer", "400").human_decision_id;
	const conducted = await t.harness.advance(change.change_id, { max_steps: 30 });
	assert.equal(conducted.stopped_because, "decision_required", conducted.steps.join(" | "));
	assert.deepEqual(
		t.harness.pendingDecisions(change.change_id).map((d) => d.interaction),
		["IH-10"],
	);
	return { changeId: change.change_id, answeredBy, rounds };
}

/** The owner revokes their resolution of `questionId` from a qualified human origin. */
function revoke(t: TestHarness, changeId: string, questionId: string): void {
	const revoked = t.harness.revokeQuestion(changeId, questionId, origin());
	assert.equal(revoked.error, null);
}

describe("the harness revokes the owner's resolution of a material question (DEC-06)", () => {
	it("presents Q1 again through IH-01 with its three outcomes, in place of the acceptance, and launches no intervention", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId } = await awaitingAcceptance(t);
		const interventions = t.ledger.loadChange(changeId)!.state.interventions.length;

		revoke(t, changeId, Q1.id);

		const presented = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			presented.map((d) => [d.interaction, d.question, d.options.map((o) => o.id)]),
			[["IH-01", Q1.question, ["answer", "close", "abandon"]]],
			"the one decision presented to the owner asks Q1 again",
		);
		assert.equal(
			t.ledger.loadChange(changeId)!.state.interventions.length,
			interventions,
			"the revocation itself launches no intervention",
		);
	});

	it("the report and the exported dossier say revoked the IH-01 decision that answered Q1 (§12)", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId, answeredBy } = await awaitingAcceptance(t);

		revoke(t, changeId, Q1.id);

		const report = await t.harness.report(changeId);
		const judged = report.judgments.find((j) => j.id === answeredBy);
		assert.ok(judged?.statement.endsWith("(revoked)"), judged?.statement);
		const exported = await exportChange(t.ledger, t.objects, {
			change_id: changeId,
			destination: join(t.root, "export"),
			redact: false,
			now: "2026-09-28T12:00:02.000Z",
			producer: "test",
		});
		const index = JSON.parse(
			readFileSync(join(exported.path, "changes", changeId, "decisions", "index.json"), "utf8"),
		) as { recorded: HumanDecision[] };
		assert.equal(
			index.recorded.find((d) => d.human_decision_id === answeredBy)?.revoked,
			true,
			"the exported index says revoked the decision the state holds revoked",
		);
	});

	it("the report lists no requirement and no candidate built on the revoked answer (§14, M5)", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId } = await awaitingAcceptance(t);

		revoke(t, changeId, Q1.id);

		const report = await t.harness.report(changeId);
		assert.deepEqual(
			report.requirements.map((r) => r.requirement_id),
			[],
			"no requirement is adopted once the answer is revoked",
		);
		assert.equal(report.candidate, null, "no candidate is the change's once the answer is revoked");
	});

	it("asks Q1 again on the tree the change was opened on, as clarification first asked it, not on the candidate the revocation withdraws", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId } = await awaitingAcceptance(t);
		const before = t.ledger.loadChange(changeId)!.state;
		const firstAsked = t.ledger.getDecisionRequest(before.open_questions.find((q) => q.id === Q1.id)!.decision_id!)!;

		revoke(t, changeId, Q1.id);

		const [askedAgain] = t.harness.pendingDecisions(changeId);
		assert.equal(firstAsked.subject.digest, before.reference.digest);
		assert.equal(
			askedAgain!.subject.digest,
			firstAsked.subject.digest,
			"the question asked again names no candidate the change no longer has",
		);
	});

	it("asks Q1 again in the language the change was started in", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId } = await awaitingAcceptance(t, { language: "en" });

		revoke(t, changeId, Q1.id);

		assert.deepEqual(
			t.harness.pendingDecisions(changeId).map((d) => [d.interaction, d.language]),
			[["IH-01", "en"]],
		);
	});

	it("a revocation whose question asked again cannot be stored for presentation inscribes nothing, and Q1 stays answered", async () => {
		let ledger: LedgerFailingRequests | null = null;
		const t = makeHarness({
			policy: { g5_human_acceptance: true },
			ledger: (path) => {
				ledger = new LedgerFailingRequests(path);
				return ledger;
			},
		});
		const { changeId } = await awaitingAcceptance(t);
		ledger!.failing = true;

		assert.throws(() => t.harness.revokeQuestion(changeId, Q1.id, origin()), /disk full/);

		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(state.open_questions.find((q) => q.id === Q1.id)?.answer, "400", "Q1 stays answered");
		assert.deepEqual(
			t.harness.pendingDecisions(changeId).map((d) => d.interaction),
			["IH-10"],
			"the acceptance is still presented to the owner",
		);
	});

	it("the owner revokes an answer on a change paused during its verification", async () => {
		let changeId = "";
		const t = makeHarness({
			policy: { g5_human_acceptance: true },
			controls: (real) => new ActsOnFirstCandidateRun(real, () => t.harness.pause(changeId, HUMAN)),
		});
		specificationRounds(t, [POSES_Q1, BINDS_Q1_TO_400]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		changeId = change.change_id;
		assert.equal((await t.harness.advance(changeId)).stopped_because, "decision_required");
		resolvePresented(t, changeId, "answer", "400");
		const conducted = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(conducted.stopped_because, "paused", conducted.steps.join(" | "));

		const revoked = t.harness.revokeQuestion(changeId, Q1.id, origin());

		assert.equal(revoked.error ? `${revoked.error.code} ${revoked.error.message}` : "accepted", "accepted");
		const state = t.ledger.loadChange(changeId)!.state;
		assert.deepEqual([state.phase, state.status], ["clarifying", "paused"], "the owner's pause holds");
		assert.equal(state.operation, null, "no operation is left open");
	});

	it("the owner revokes an answer on a change a step blocked while its controls ran", async () => {
		const t = makeHarness({
			controls: (real) =>
				new ThrowsOnFirstCandidateRun(
					real,
					new DomainError("EVIDENCE_MISSING", "the report the control wrote is gone"),
				),
		});
		specificationRounds(t, [POSES_Q1, BINDS_Q1_TO_400]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		const changeId = change.change_id;
		assert.equal((await t.harness.advance(changeId)).stopped_because, "decision_required");
		resolvePresented(t, changeId, "answer", "400");
		const conducted = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(conducted.stopped_because, "blocked", conducted.steps.join(" | "));

		const revoked = t.harness.revokeQuestion(changeId, Q1.id, origin());

		assert.equal(revoked.error ? `${revoked.error.code} ${revoked.error.message}` : "accepted", "accepted");
		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(state.phase, "clarifying");
		assert.deepEqual(
			t.harness.pendingDecisions(changeId).map((d) => d.interaction),
			["IH-01"],
			"Q1 is asked again",
		);
		assert.equal(state.operation, null, "no operation is left open");
	});

	it("a block written by a session whose record lost to the owner's revocation does not overwrite it", async () => {
		let changeId = "";
		const t = makeHarness({
			controls: (real) =>
				new ActsOnFirstCandidateRun(real, () => {
					// Another live session blocks the change, which closes this session's verification, and the
					// owner revokes Q1 there; this session's controls run on, and its record loses on the revision.
					t.harness.commit(
						t.ledger.loadChange(changeId)!,
						{
							type: "change.block",
							at: new Date().toISOString(),
							actor: KERNEL_ACTOR,
							reason: "execution_error",
							detail: "OPERATION_ACTIVE: another session holds the verification",
						},
						"cor_other_session",
					);
					revoke(t, changeId, Q1.id);
				}),
		});
		specificationRounds(t, [POSES_Q1, BINDS_Q1_TO_400]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		changeId = change.change_id;
		assert.equal((await t.harness.advance(changeId)).stopped_because, "decision_required");
		resolvePresented(t, changeId, "answer", "400");

		const conducted = await t.harness.advance(changeId, { max_steps: 30 });

		const state = t.ledger.loadChange(changeId)!.state;
		assert.deepEqual(
			[state.phase, state.status],
			["clarifying", "decision_required"],
			`the revocation is the latest act on the change: ${conducted.steps.join(" | ")}`,
		);
		assert.deepEqual(
			t.harness.pendingDecisions(changeId).map((d) => d.interaction),
			["IH-01"],
			"Q1 waits for the owner",
		);
		assert.equal(conducted.stopped_because, "decision_required");
	});

	it("a revoked change blocked over its question asked again comes back to that question once its stop is lifted", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId } = await awaitingAcceptance(t);
		revoke(t, changeId, Q1.id);
		// The block a losing conduct wrote over the decision before a harness yielded to it.
		t.harness.commit(
			t.ledger.loadChange(changeId)!,
			{
				type: "change.block",
				at: new Date().toISOString(),
				actor: KERNEL_ACTOR,
				reason: "execution_error",
				detail: "REVISION_CONFLICT: revision 59, expected 48",
			},
			"cor_losing_session",
		);

		t.harness.resume(changeId, HUMAN);
		const result = await t.harness.advance(changeId, { max_steps: 5 });

		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		assert.deepEqual(
			t.harness.pendingDecisions(changeId).map((d) => d.interaction),
			["IH-01"],
			"Q1 is presented again",
		);
		assert.deepEqual(result.steps, [], "no specification runs while Q1 waits for the owner");
	});
});

/** A ledger whose store of decision requests fails once `failing` is set, as a full disk would. */
class LedgerFailingRequests extends SqliteLedger {
	failing = false;
	override putDecisionRequest(request: DecisionRequest): void {
		if (this.failing) throw new Error("disk full");
		super.putDecisionRequest(request);
	}
}

describe("after a revocation the specification is written again, on the owner's new resolution alone (DEC-06)", () => {
	it("a new answer to Q1 is declared by a rewritten report, and reaches the requirements adopted at G1 and the protocol frozen at G2 (step 6)", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId, rounds } = await awaitingAcceptance(t, { reports: [POSES_Q1, BINDS_Q1_TO_400, BINDS_Q1_TO_422] });
		assert.equal(rounds.calls(), 2);

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const conducted = await t.harness.advance(changeId, { max_steps: 30 });

		assert.equal(rounds.calls(), 3, "the specification is written again after the new answer");
		const asked = rounds.objectives[2]!;
		assert.ok(asked.includes(`Q ${Q1.id}: ${Q1.question} -> 422 [to declare in \`answers\`]`), asked);
		assert.equal(conducted.stopped_because, "decision_required", conducted.steps.join(" | "));
		const state = t.ledger.loadChange(changeId)!.state;
		const adopted = (await t.harness.artifacts.latest<RequirementsDocument>(state, "requirements"))!;
		assert.equal(adopted.ref.artifact_id, state.adopted.requirements?.ref.artifact_id, "G1 adopted them again");
		assert.deepEqual(
			adopted.content.answers.map((a) => [a.question_id, a.answer, a.requirement_ids]),
			[[Q1.id, "422", [REQ_422.requirement_id]]],
			"the requirements adopted at G1 bind 422 to the requirement written after it",
		);
		assert.deepEqual(
			adopted.content.requirements.map((r) => r.requirement_id),
			[REQ_422.requirement_id],
		);
		assert.deepEqual(
			state.protocol?.obligations.map((o) => o.requirement.requirement_id).sort(),
			[REQ_422.requirement_id],
			"the protocol frozen again at G2 holds the obligation of REQ-422, not that of REQ-400",
		);
	});

	it("closing Q1 once asked again rewrites the specification, whose request says Q1 closed, and the mandate carries it closed with the owner (6b)", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId, rounds } = await awaitingAcceptance(t, {
			reports: [POSES_Q1, BINDS_Q1_TO_400, SAYS_NOTHING_OF_Q1],
		});

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "close", null);
		const conducted = await t.harness.advance(changeId, { max_steps: 30 });

		assert.equal(rounds.calls(), 3, "the specification is written again after the close");
		const asked = rounds.objectives[2]!;
		assert.ok(
			asked.includes(`Q ${Q1.id}: ${Q1.question} -> closed by the owner: no longer material, nothing to declare`),
			asked,
		);
		assert.equal(conducted.stopped_because, "decision_required", conducted.steps.join(" | "));
		const state = t.ledger.loadChange(changeId)!.state;
		const mandate = (await t.harness.artifacts.latest<Mandate>(state, "mandate"))!;
		assert.deepEqual(
			mandate.content.open_questions.filter((q) => q.id === Q1.id).map((q) => q.closed_by),
			[HUMAN.actor_id],
		);
	});

	it("a report rewritten after the revocation that no longer declares Q1 inherits no binding from the reports written before it (step 6, §14)", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId } = await awaitingAcceptance(t, { reports: [POSES_Q1, BINDS_Q1_TO_400, KEEPS_400_SILENT_ON_Q1] });

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		await t.harness.advance(changeId, { max_steps: 30 });

		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(state.gates.G1, undefined, "422 is not bound to the requirement written for 400");
		assert.equal(state.stop_reason, "stagnation", `the specification loses the answer: ${state.stop_detail}`);
		assert.ok(state.stop_detail?.includes(Q1.id), state.stop_detail ?? "");
	});
});

/** The producer's report on a change to `src/greet.js`. */
const WROTE_GREET = { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] };

/** A producer that writes `content` to `src/greet.js`. */
const writesGreet = (content: string): AgentScript => ({
	steps: [
		{ kind: "write", path: "src/greet.js", content },
		{ kind: "complete", output: WROTE_GREET },
	],
});

/** The n-th producer runs the script `scriptOf(n)` gives, or the rounds' own when it gives none. */
function producersRun(t: TestHarness, scriptOf: (n: number) => AgentScript | undefined): void {
	let implementations = 0;
	const start = t.agent.startIntervention.bind(t.agent);
	t.agent.startIntervention = async (m) => {
		const script = m.role === "implement" ? scriptOf(++implementations) : undefined;
		if (script) t.agent.scripts.set("implement", script);
		return start(m);
	};
}

/** Every producer writes `content`, the first `firstOnly` times only when given. */
function implementWith(t: TestHarness, content: string, firstOnly = Number.POSITIVE_INFINITY): void {
	producersRun(t, (n) => (n <= firstOnly ? writesGreet(content) : undefined));
}

/** A greet the unit test of the fixture refuses. */
const WRONG_GREET = "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n";

const SHOUT: Requirement = {
	requirement_id: "R-SHOUT",
	statement: "shout(name) returns greet(name) upper-cased",
	mandatory: true,
	criterion: "unit test on shout passes",
	category: "functional",
	satisfied_by_reference: false,
};
const POSES_Q1_ON_SHOUT = specReport({ questions: [Q1], answers: [], requirements: [SHOUT] });
const BINDS_Q1_TO_SHOUT = specReport({
	questions: [],
	answers: [{ question_id: Q1.id, observable: true, requirement_ids: [SHOUT.requirement_id] }],
	requirements: [SHOUT],
});
/** A preparation that writes the discriminant test of shout, qualified on the bare reference. */
const PREPARES_SHOUT = {
	steps: [
		{ kind: "write" as const, path: "test/shout.test.js", content: SHOUT_TEST },
		{
			kind: "complete" as const,
			output: { summary: "done", changed_paths: ["test/shout.test.js"], tests_claimed: false, notes: [] },
		},
	],
};

describe("after a revocation the change is rebuilt from the owner's new resolution, not from what was built on the revoked one (DEC-06)", () => {
	it("the producer of the rebuilt change is not handed the feedback measured under the revoked answer", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		implementWith(t, WRONG_GREET, 1);
		const { changeId } = await awaitingAcceptance(t, { reports: [POSES_Q1, BINDS_Q1_TO_400, BINDS_Q1_TO_422] });
		assert.equal(t.ledger.loadChange(changeId)!.state.feedback.length, 1, "the first candidate was corrected");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const conducted = await t.harness.advance(changeId, { max_steps: 30 });

		assert.equal(conducted.stopped_because, "decision_required", conducted.steps.join(" | "));
		const producers = t.agent.started.filter((m) => m.role === "implement").map((m) => m.prompt);
		assert.equal(producers.length, 3);
		assert.match(producers[1]!, /Feedback from the previous attempt/, "a correction is fed back what was measured");
		assert.doesNotMatch(
			producers[2]!,
			/Feedback from the previous attempt/,
			"the producer of the rebuilt change is not handed what was measured under the revoked answer",
		);
	});

	it("the preparation of the rebuilt change starts afresh: it is told of no refusal, and a change revoked twice still prepares its tests", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true }, scripts: { prepare: PREPARES_SHOUT } });
		implementWith(t, SHOUT_IMPL);
		const { changeId } = await awaitingAcceptance(t, {
			reports: [POSES_Q1_ON_SHOUT, BINDS_Q1_TO_SHOUT],
			projectPath: project(fixtureTsWithoutTests),
		});

		for (const answer of ["422", "418"]) {
			revoke(t, changeId, Q1.id);
			resolvePresented(t, changeId, "answer", answer);
			const conducted = await t.harness.advance(changeId, { max_steps: 40 });

			const preparation = t.agent.started.filter((m) => m.role === "prepare").at(-1)!;
			assert.doesNotMatch(
				preparation.prompt,
				/previous preparation was refused/,
				`the preparation of the change rebuilt on ${answer} is told of no refusal`,
			);
			// The rebuilt change is told what its own detection produced, as a first preparation is; the
			// protocol frozen before the revocation is not read for it.
			assert.match(
				preparation.system_prompt,
				/The kernel will judge your work by running, without you: `[^`]* --test --test-reporter=tap` in the workspace root \(unit\)/,
				`the preparation of the change rebuilt on ${answer} is told the controls detected on its target`,
			);
			assert.equal(
				conducted.stopped_because,
				"decision_required",
				`the change rebuilt on ${answer} prepares its tests and awaits its acceptance again: ${conducted.steps.join(" | ")}`,
			);
		}
		assert.equal(t.agent.started.filter((m) => m.role === "prepare").length, 3, "each build prepares its tests once");
	});

	it("a workspace whose producer never started is taken up while its preparation is adopted, and not by the change rebuilt on a preparation of its own", async () => {
		const t = makeHarness({ scripts: { prepare: PREPARES_SHOUT } });
		implementWith(t, SHOUT_IMPL);
		specificationRounds(t, [POSES_Q1_ON_SHOUT, BINDS_Q1_TO_SHOUT]);
		const { change } = await t.harness.start({
			project_path: project(fixtureTsWithoutTests),
			request_text: "x",
			actor: HUMAN,
		});
		const changeId = change.change_id;
		// The model is refused once the change implements, after its workspace is prepared and before its producer starts.
		let refusing = true;
		const describe = t.agent.describeCapabilities.bind(t.agent);
		t.agent.describeCapabilities = async (model) => {
			const described = await describe(model);
			const implementing = t.ledger.loadChange(changeId)!.state.phase === "implementing";
			return refusing && implementing
				? { ...described, available: false, reasons: ["refused by the test"] }
				: described;
		};
		assert.equal((await t.harness.advance(changeId)).stopped_because, "decision_required");
		resolvePresented(t, changeId, "answer", "400");
		const refused = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(refused.stopped_because, "capability_missing", refused.steps.join(" | "));
		const workspaces = () =>
			t.ledger.listArtifacts(changeId, "candidate").filter((a) => a.ref.artifact_id.startsWith("ws_"));
		assert.equal(workspaces().length, 1, "a workspace was prepared for the producer refused its model");
		t.harness.resume(changeId, HUMAN);
		const resumed = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(resumed.stopped_because, "capability_missing", resumed.steps.join(" | "));
		assert.equal(
			workspaces().length,
			1,
			"resumed on the same preparation, the producer is given the workspace prepared for it",
		);
		const before = await t.harness.artifacts.read<{ path: string }>(workspaces()[0]!.ref);

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		refusing = false;
		const rebuilt = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(rebuilt.stopped_because, "closed", rebuilt.steps.join(" | "));
		const producers = t.agent.started.filter((m) => m.role === "implement");
		assert.equal(producers.length, 1);
		assert.notEqual(
			producers[0]!.workspace_path,
			before.path,
			"the producer of the rebuilt change works in a workspace prepared with the preparation adopted after the revocation",
		);
	});

	it("a qualification taken up by the rebuilt change notes no prepared suite, and the rebuilt change holds the preparation it made", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true }, scripts: { prepare: PREPARES_SHOUT } });
		implementWith(t, SHOUT_IMPL);
		const { changeId } = await awaitingAcceptance(t, {
			reports: [POSES_Q1_ON_SHOUT, BINDS_Q1_TO_SHOUT],
			projectPath: project(fixtureTsWithoutTests),
		});
		assert.deepEqual(await preparedSuiteNotes(t, changeId), [], "qualified afresh beside the suite prepared");
		const firstPreparation = adoptedPreparationRef(t, changeId);
		assert.ok(firstPreparation, "the first build adopted a preparation");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const rebuilt = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(rebuilt.stopped_because, "decision_required", rebuilt.steps.join(" | "));
		assert.deepEqual(await preparedSuiteNotes(t, changeId), [], "taken up beside the suite prepared again");
		const rebuiltPreparation = adoptedPreparationRef(t, changeId);
		assert.ok(rebuiltPreparation, "the rebuilt change adopted a preparation");
		assert.notDeepEqual(rebuiltPreparation, firstPreparation, "the rebuilt change holds the preparation it made");
	});

	it("a qualification taken up by a change rebuilt without a preparation notes no prepared suite, and the rebuilt change holds none, though its first build had one", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true }, scripts: { prepare: PREPARES_SHOUT } });
		implementWith(t, SHOUT_IMPL);
		const { changeId } = await awaitingAcceptance(t, {
			reports: [POSES_Q1_ON_SHOUT, BINDS_Q1_TO_SHOUT, BINDS_Q1_TO_422],
		});
		assert.deepEqual(await preparedSuiteNotes(t, changeId), [], "qualified afresh beside the suite prepared");
		assert.ok(adoptedPreparationRef(t, changeId), "the first build adopted a preparation");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const rebuilt = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(rebuilt.stopped_because, "decision_required", rebuilt.steps.join(" | "));
		assert.equal(t.agent.started.filter((m) => m.role === "prepare").length, 1, "the rebuilt change prepares nothing");
		assert.deepEqual(await preparedSuiteNotes(t, changeId), [], "taken up with no suite prepared");
		assert.equal(adoptedPreparationRef(t, changeId), null, "the rebuilt change holds no preparation");
	});

	it("a qualification taken up by a change rebuilt with a preparation notes no prepared suite, and the rebuilt change holds the preparation it made, though its first build had none", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true }, scripts: { prepare: PREPARES_SHOUT } });
		implementWith(t, SHOUT_IMPL);
		const { changeId } = await awaitingAcceptance(t, { reports: [POSES_Q1, BINDS_Q1_TO_400, BINDS_Q1_TO_SHOUT] });
		assert.deepEqual(await preparedSuiteNotes(t, changeId), [], "qualified afresh with no suite prepared");
		assert.equal(adoptedPreparationRef(t, changeId), null, "the first build adopted no preparation");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const rebuilt = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(rebuilt.stopped_because, "decision_required", rebuilt.steps.join(" | "));
		assert.equal(
			t.agent.started.filter((m) => m.role === "prepare").length,
			1,
			"the rebuilt change prepares its tests",
		);
		assert.deepEqual(await preparedSuiteNotes(t, changeId), [], "taken up beside the suite prepared");
		assert.ok(adoptedPreparationRef(t, changeId), "the rebuilt change holds the preparation it made");
	});
});

/**
 * Every note of the frozen protocol's qualifications that speaks of a prepared suite: the preparation
 * records the suite, and a qualification says only what its witnesses answered.
 */
async function preparedSuiteNotes(t: TestHarness, changeId: string): Promise<string[]> {
	const state = t.ledger.loadChange(changeId)!.state;
	const frozen = await t.harness.artifacts.read<Protocol>(state.adopted.protocol!.ref);
	assert.ok(Object.keys(frozen.qualifications).length > 0, "the protocol qualifies at least one control");
	return Object.entries(frozen.qualifications).flatMap(([controlId, q]) =>
		q.notes.filter((note) => note.includes("prepared suite")).map((note) => `${controlId}: ${note}`),
	);
}

/** The reference of the preparation the change holds adopted, or null. */
function adoptedPreparationRef(t: TestHarness, changeId: string): ArtifactRef | null {
	return t.ledger.loadChange(changeId)!.state.adopted.preparation?.ref ?? null;
}

describe("the change rebuilt after a revocation spends on the same attempt budget, and asks its owner once it is spent (DEC-06, §18)", () => {
	it("a change rebuilt with no attempt left asks its owner for a budget extension (IH-07), then implements once it is granted", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true } });
		const { changeId } = await awaitingAcceptance(t, {
			reports: [POSES_Q1, BINDS_Q1_TO_400, BINDS_Q1_TO_422],
			language: "en",
		});
		for (const answer of ["422", "418"]) {
			revoke(t, changeId, Q1.id);
			resolvePresented(t, changeId, "answer", answer);
			const rebuilt = await t.harness.advance(changeId, { max_steps: 30 });
			assert.equal(rebuilt.stopped_because, "decision_required", rebuilt.steps.join(" | "));
		}
		const { budgets } = t.ledger.loadChange(changeId)!.state;
		assert.equal(budgets.attempts_used, budgets.max_attempts, "each build spent an attempt of the same budget");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "451");
		const spent = await t.harness.advance(changeId, { max_steps: 30 });

		assert.equal(spent.stopped_because, "decision_required", spent.steps.join(" | "));
		const asked = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			asked.map((d) => [d.interaction, d.question, d.facts, d.recommendation, d.language]),
			[["IH-07", "The attempt budget is exhausted (3/3). Extend it?", ["3/3 attempts consumed"], "stop", "en"]],
			"the owner is asked for a budget extension before the rebuilt change's first attempt, told why, in the change's language",
		);
		const extended = t.harness.answerDecision(
			changeId,
			{
				decision_id: asked[0]!.decision_id,
				option_id: "extend",
				free_text: "1",
				reason: null,
				subject_revision: asked[0]!.subject.revision,
				scope: null,
				expires_at: null,
			},
			origin(),
		);
		assert.equal(extended.error, null);
		const implemented = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(implemented.stopped_because, "decision_required", implemented.steps.join(" | "));
		assert.deepEqual(
			t.harness.pendingDecisions(changeId).map((d) => d.interaction),
			["IH-10"],
			"the rebuilt change implements in the extended budget and awaits its acceptance",
		);
		assert.equal(t.agent.started.filter((m) => m.role === "implement").length, 4);
	});

	it("the producer of the rebuilt change, resumed on its own attempt, is handed no feedback measured before the revocation", async () => {
		const t = makeHarness({ policy: { g5_human_acceptance: true, budgets: { tool_calls_per_intervention: 2 } } });
		const PAST_ITS_BOUND: AgentScript = {
			steps: [
				...[1, 2, 3].map((n) => ({ kind: "write" as const, path: `src/w${n}.js`, content: `// piece ${n}\n` })),
				{ kind: "complete", output: WROTE_GREET },
			],
		};
		producersRun(t, (n) => (n === 1 ? writesGreet(WRONG_GREET) : n === 3 ? PAST_ITS_BOUND : undefined));
		const { changeId } = await awaitingAcceptance(t, { reports: [POSES_Q1, BINDS_Q1_TO_400, BINDS_Q1_TO_422] });
		assert.equal(t.ledger.loadChange(changeId)!.state.feedback.length, 1, "the first candidate was corrected");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const bounded = await t.harness.advance(changeId, { max_steps: 30 });
		assert.equal(bounded.view.change?.stop_reason, "budget_exhausted", bounded.steps.join(" | "));
		t.harness.resume(changeId, HUMAN);
		const resumed = await t.harness.advance(changeId, { max_steps: 30 });

		assert.equal(resumed.stopped_because, "decision_required", resumed.steps.join(" | "));
		const producers = t.agent.started.filter((m) => m.role === "implement").map((m) => m.prompt);
		assert.equal(producers.length, 4);
		assert.match(
			producers[3]!,
			/Interrupted work to finish/,
			"the fourth producer resumes the rebuilt change's attempt",
		);
		const [corrected] = t.ledger.loadChange(changeId)!.state.feedback;
		const measured = await t.harness.artifacts.read<string>({
			artifact_id: `fb_${corrected!.attempt_id}`,
			revision: 1,
		});
		assert.ok(producers[1]!.includes(measured), "the correction was fed back what was measured");
		assert.ok(
			!producers[3]!.includes(measured),
			"the resumed producer is not handed what was measured under the revoked answer",
		);
	});
});
