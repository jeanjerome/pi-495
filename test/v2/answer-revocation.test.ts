import { strict as assert } from "node:assert";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specificationRounds, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { initRepo, fixtureTs, fixtureTsWithoutTests, tempDir, SHOUT_IMPL, SHOUT_TEST } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import type { DecisionRequest, HumanDecision, HumanOrigin } from "../../src/contracts/v1/decision.ts";
import type { Mandate, Protocol, RequirementsDocument } from "../../src/contracts/v1/protocol.ts";
import type { SpecificationReport } from "../../src/contracts/v1/reports.ts";
import { exportChange } from "../../src/export/export-service.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

function project(fixture: (root: string) => void = fixtureTs): string {
	const p = tempDir("495-proj-");
	cleanups.push(p);
	fixture(p);
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
		const { changeId } = await awaitingAcceptance(t, { language: "en" });

		revoke(t, changeId, Q1.id);

		assert.deepEqual(
			t.harness.pendingDecisions(changeId).map((d) => [d.interaction, d.language]),
			[["IH-01", "en"]],
		);
	});

	it("a revocation whose question asked again cannot be stored for presentation inscribes nothing, and Q1 stays answered", async () => {
		let ledger: LedgerFailingRequests | null = null;
		const t = track(
			makeHarness({
				policy: { g5_human_acceptance: true },
				ledger: (path) => {
					ledger = new LedgerFailingRequests(path);
					return ledger;
				},
			}),
		);
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(makeHarness({ policy: { g5_human_acceptance: true }, scripts: { prepare: PREPARES_SHOUT } }));
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
			assert.doesNotMatch(
				preparation.system_prompt,
				/The kernel will judge your work by running/,
				`the preparation of the change rebuilt on ${answer} is judged by no control frozen before the revocation`,
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
		const t = track(makeHarness({ scripts: { prepare: PREPARES_SHOUT } }));
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

	it("a qualification taken up by the rebuilt change notes the prepared suite of the rebuilt change alone", async () => {
		const t = track(makeHarness({ policy: { g5_human_acceptance: true }, scripts: { prepare: PREPARES_SHOUT } }));
		implementWith(t, SHOUT_IMPL);
		const { changeId } = await awaitingAcceptance(t, {
			reports: [POSES_Q1_ON_SHOUT, BINDS_Q1_TO_SHOUT],
			projectPath: project(fixtureTsWithoutTests),
		});
		assertPreparedSuiteNoted(await preparedSuiteNotes(t, changeId), 1, "qualified afresh beside the suite prepared");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const rebuilt = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(rebuilt.stopped_because, "decision_required", rebuilt.steps.join(" | "));
		assertPreparedSuiteNoted(await preparedSuiteNotes(t, changeId), 1, "taken up beside the suite prepared again");
	});

	it("a qualification taken up by a change rebuilt without a preparation notes no prepared suite, though its first build had one", async () => {
		const t = track(makeHarness({ policy: { g5_human_acceptance: true }, scripts: { prepare: PREPARES_SHOUT } }));
		implementWith(t, SHOUT_IMPL);
		const { changeId } = await awaitingAcceptance(t, {
			reports: [POSES_Q1_ON_SHOUT, BINDS_Q1_TO_SHOUT, BINDS_Q1_TO_422],
		});
		assertPreparedSuiteNoted(await preparedSuiteNotes(t, changeId), 1, "qualified afresh beside the suite prepared");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const rebuilt = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(rebuilt.stopped_because, "decision_required", rebuilt.steps.join(" | "));
		assert.equal(t.agent.started.filter((m) => m.role === "prepare").length, 1, "the rebuilt change prepares nothing");
		assertPreparedSuiteNoted(await preparedSuiteNotes(t, changeId), 0, "taken up with no suite prepared");
	});

	it("a qualification taken up by a change rebuilt with a preparation notes its prepared suite, though its first build had none", async () => {
		const t = track(makeHarness({ policy: { g5_human_acceptance: true }, scripts: { prepare: PREPARES_SHOUT } }));
		implementWith(t, SHOUT_IMPL);
		const { changeId } = await awaitingAcceptance(t, { reports: [POSES_Q1, BINDS_Q1_TO_400, BINDS_Q1_TO_SHOUT] });
		assertPreparedSuiteNoted(await preparedSuiteNotes(t, changeId), 0, "qualified afresh with no suite prepared");

		revoke(t, changeId, Q1.id);
		resolvePresented(t, changeId, "answer", "422");
		const rebuilt = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(rebuilt.stopped_because, "decision_required", rebuilt.steps.join(" | "));
		assert.equal(
			t.agent.started.filter((m) => m.role === "prepare").length,
			1,
			"the rebuilt change prepares its tests",
		);
		assertPreparedSuiteNoted(await preparedSuiteNotes(t, changeId), 1, "taken up beside the suite prepared");
	});
});

/** The notes of the prepared suite on each control of the protocol the change holds frozen, by control. */
async function preparedSuiteNotes(t: TestHarness, changeId: string): Promise<Record<string, string[]>> {
	const state = t.ledger.loadChange(changeId)!.state;
	const frozen = await t.harness.artifacts.read<Protocol>(state.adopted.protocol!.ref);
	return Object.fromEntries(
		Object.entries(frozen.qualifications).map(([controlId, q]) => [
			controlId,
			q.notes.filter((note) => note.startsWith("prepared suite on the bare reference")),
		]),
	);
}

function assertPreparedSuiteNoted(notes: Record<string, string[]>, expected: number, qualification: string): void {
	assert.ok(Object.keys(notes).length > 0, "the protocol qualifies at least one control");
	for (const [controlId, noted] of Object.entries(notes))
		assert.equal(noted.length, expected, `${controlId}, ${qualification}: ${noted.join(" | ")}`);
}

describe("the change rebuilt after a revocation spends on the same attempt budget, and asks its owner once it is spent (DEC-06, §18)", () => {
	it("a change rebuilt with no attempt left asks its owner for a budget extension (IH-07), then implements once it is granted", async () => {
		const t = track(makeHarness({ policy: { g5_human_acceptance: true } }));
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
		const t = track(
			makeHarness({ policy: { g5_human_acceptance: true, budgets: { tool_calls_per_intervention: 2 } } }),
		);
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
