/**
 * A mandatory requirement no control can judge, after the preparations 495 may spend on it, is put to
 * the owner instead of stopping the change: prepare once more, or judge the requirement themselves.
 */
import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTsWithoutTests, initRepo, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import { arbitrationSubject, requirementsTakenByOwner } from "../../src/application/phases/verification-design.ts";
import type { HumanDecisionEntry } from "../../src/domain/change/state.ts";
import { SCHEMA_VERSION, type ArtifactRef } from "../../src/contracts/v1/common.ts";
import type { Protocol, RequirementsDocument } from "../../src/contracts/v1/protocol.ts";
import type { HumanOrigin } from "../../src/contracts/v1/decision.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});
function track(t: TestHarness): TestHarness {
	cleanups.push(t.root);
	return t;
}

/** A target without any test: `shout` does not exist, so R1 asks for behaviour no control can detect. */
function projectWithoutTests(): string {
	const p = tempDir("495-arbitration-");
	cleanups.push(p);
	fixtureTsWithoutTests(p);
	initRepo(p);
	return p;
}

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
	design: { summary: "add shout next to greet", components: ["greet"], interfaces: ["shout(name)"], risks: [] },
});

/**
 * R2 is satisfied by the reference, so nothing shows it is unjudged until the suite has been observed:
 * the question is first asked about R1 alone, and R2 only becomes unjudged after the answer.
 */
const specWithRequirementSeenLater = specReport({
	objective: "add shout(name) returning the greeting in upper case, and keep greet as it is",
	requirements: [
		...spec.requirements,
		{
			requirement_id: "R2",
			statement: "greet(name) still returns Hello, name",
			mandatory: true,
			criterion: "the existing greet behaviour is unchanged",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
	design: spec.design,
});

/** A preparation that writes nothing under the test roots: no discriminant test is retained. */
const emptyPreparation = {
	steps: [
		{
			kind: "complete" as const,
			output: { summary: "nothing to add", changed_paths: [], tests_claimed: false, notes: [] },
		},
	],
};

function harnessWithEmptyPreparations(): TestHarness {
	return track(
		makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: emptyPreparation },
		}),
	);
}

const origin = (): HumanOrigin => ({
	actor: HUMAN,
	host: "tui",
	session_id: "s1",
	asserted_at: "2026-09-16T12:00:00.000Z",
});

/** The owner's answer to the one decision pending on the change. */
function answerPending(t: TestHarness, changeId: string, optionId: string): string {
	const pending = t.ledger.loadChange(changeId)!.state.pending_decisions;
	assert.equal(pending.length, 1, "one decision is pending");
	const answered = t.harness.answerDecision(
		changeId,
		{
			decision_id: pending[0]!.decision_id,
			option_id: optionId,
			free_text: null,
			reason: null,
			subject_revision: pending[0]!.subject.revision,
			scope: null,
			expires_at: null,
		},
		origin(),
	);
	assert.equal(answered.error, null);
	return pending[0]!.decision_id;
}

describe("a requirement no control can judge is arbitrated by the owner", () => {
	it("given two preparation interventions that retained no discriminant test, when the verification design resumes, then an IH-04 decision is pending naming the requirement, the gap and the risk, with the options prepare and assign_review, and the change is not blocked", async () => {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.interventions.filter((i) => i.role === "prepare").length, 2, "two preparations were spent");
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		assert.equal(state.status, "decision_required");
		assert.notEqual(state.stop_reason, "capability_missing");
		const pending = t.harness.pendingDecisions(change.change_id);
		assert.deepEqual(
			pending.map((d) => d.interaction),
			["IH-04"],
		);
		const request = pending[0]!;
		assert.match(request.question, /R1/, "the question names the requirement");
		assert.ok(
			request.facts.some((f) => f.includes("R1 asks for behaviour the reference does not have")),
			`the gap read in the diagnosis: ${request.facts.join(" | ")}`,
		);
		assert.ok(
			request.facts.some((f) => /risk/i.test(f)),
			`the risk of leaving the requirement without a control: ${request.facts.join(" | ")}`,
		);
		assert.deepEqual(
			request.options.map((o) => o.id),
			["prepare", "assign_review"],
		);
		assert.ok(
			request.options.every((o) => o.effect.length > 0),
			"each option says its effect",
		);
		assert.equal(state.protocol, null, "no protocol is frozen, so no obligation is assigned to a human decision");
	});

	it("given an IH-04 answered prepare, then a third preparation opens, and when it retains no discriminant test either, then IH-04 is asked again instead of a fourth preparation", async () => {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const first = answerPending(t, change.change_id, "prepare");
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(
			state.interventions.filter((i) => i.role === "prepare").length,
			3,
			`a third preparation opened: ${result.steps.join(" | ")}`,
		);
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const asked = t.requested.filter((r) => r.interaction === "IH-04");
		assert.equal(asked.length, 2, "IH-04 is asked a second time");
		assert.notEqual(asked[1]!.decision_id, first, "a new decision, not the answered one");
		assert.deepEqual(
			state.pending_decisions.map((d) => d.decision_id),
			[asked[1]!.decision_id],
		);
		answerPending(t, change.change_id, "prepare");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(
			t.ledger.loadChange(change.change_id)!.state.interventions.filter((i) => i.role === "prepare").length,
			4,
			"each answer grants one preparation, not a standing licence",
		);
	});

	it("given an IH-04 answered assign_review, then the frozen protocol holds a human_decision obligation on IH-10 for that requirement, G2 passes and the report lists requirement_decided_by_a_human, and a revision of the requirements asks IH-04 again", async () => {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "assign_review");
		await t.harness.advance(change.change_id, { max_steps: 1 });
		const loaded = t.ledger.loadChange(change.change_id)!;
		assert.equal(loaded.state.gates.G2?.verdict, "PASS", loaded.state.gates.G2?.reasons.join("; "));
		const protocol = (await t.harness.artifacts.latest<Protocol>(loaded.state, "protocol"))!.content;
		const obligation = protocol.obligations.find((o) => o.requirement.requirement_id === "R1")!;
		assert.deepEqual(
			[obligation.combination, obligation.human_interaction, obligation.control_ids],
			["human_decision", "IH-10", []],
		);
		const report = await t.harness.report(change.change_id);
		assert.ok(
			report.residual_risks.some((r) => r.code === "requirement_decided_by_a_human" && r.statement.includes("R1")),
			JSON.stringify(report.residual_risks),
		);
		assert.ok(
			!report.residual_risks.some((r) => r.code === "requirement_without_control"),
			"the requirement the owner took on is not also listed as carried by no control",
		);
		const requirements = (await t.harness.artifacts.latest<RequirementsDocument>(loaded.state, "requirements"))!;
		t.harness.commit(
			loaded,
			{
				type: "artifact.revise",
				at: t.harness.now(),
				actor: KERNEL_ACTOR,
				kind: "requirements",
				ref: requirements.ref,
				reason: "the requirements were rewritten",
			},
			t.harness.id("cor"),
		);
		const again = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(again.stopped_because, "decision_required", again.steps.join(" | "));
		assert.deepEqual(
			t.harness.pendingDecisions(change.change_id).map((d) => d.interaction),
			["IH-04"],
			"the answer no longer holds: IH-04 is asked again",
		);
		assert.equal(
			t.ledger.loadChange(change.change_id)!.state.interventions.filter((i) => i.role === "prepare").length,
			2,
			"no preparation is opened without an answer that grants it",
		);
	});

	it("given an IH-04 answered assign_review for R1, when R2 turns out to be unjudged as well, then the answer does not hold for R2 and IH-04 is asked again naming both", async () => {
		const t = track(
			makeHarness({
				defaultScript: { steps: [{ kind: "complete", output: specWithRequirementSeenLater }] },
				scripts: { prepare: emptyPreparation },
			}),
		);
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const first = t.harness.pendingDecisions(change.change_id)[0]!;
		assert.match(first.question, /R1/);
		assert.doesNotMatch(first.question, /R2/, "R2 is not unjudged yet: the owner is not asked about it");
		answerPending(t, change.change_id, "assign_review");
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		assert.equal(state.protocol, null, "no protocol is frozen with R2 assigned to a human nobody asked");
		const asked = t.requested.filter((r) => r.interaction === "IH-04");
		assert.equal(asked.length, 2, "IH-04 is asked again");
		assert.match(asked[1]!.question, /R1, R2/, "the new question names both requirements");
		assert.equal(
			state.interventions.filter((i) => i.role === "prepare").length,
			2,
			"an answer of assign_review grants no preparation",
		);
		answerPending(t, change.change_id, "assign_review");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const loaded = t.ledger.loadChange(change.change_id)!;
		assert.equal(loaded.state.gates.G2?.verdict, "PASS", loaded.state.gates.G2?.reasons.join("; "));
		const protocol = (await t.harness.artifacts.latest<Protocol>(loaded.state, "protocol"))!.content;
		assert.deepEqual(
			protocol.obligations.map((o) => [o.requirement.requirement_id, o.combination, o.human_interaction]),
			[
				["R1", "human_decision", "IH-10"],
				["R2", "human_decision", "IH-10"],
			],
		);
	});
});

describe("the requirements the owner took on", () => {
	const requirements: ArtifactRef = {
		artifact_id: "req_0001",
		revision: 1,
		content_digest: "sha256:029cb5ff738fdead35b502ce943f3398c3fae23b93c45e81253a6bad4d996678",
		schema_version: SCHEMA_VERSION,
	};
	const answer = (
		asked: readonly string[],
		overrides: Partial<Pick<HumanDecisionEntry, "valid" | "option_id" | "interaction">> = {},
	): HumanDecisionEntry => ({
		human_decision_id: "hd_1",
		decision_id: "dec_1",
		interaction: "IH-04",
		option_id: "assign_review",
		subject: arbitrationSubject(requirements, asked),
		actor_id: "owner",
		scope: null,
		valid: true,
		recorded_at: "2026-09-16T12:00:00.000Z",
		...overrides,
	});

	it("is empty without any answer, whatever the requirements no control can judge", () => {
		assert.deepEqual(requirementsTakenByOwner([], requirements, ["R1"]), []);
	});

	it("is the requirements the answer was asked about", () => {
		assert.deepEqual(requirementsTakenByOwner([answer(["R1", "R2"])], requirements, ["R1", "R2"]), ["R1", "R2"]);
	});

	it("is empty when a requirement was not among those asked about, or was, and the answer was about more", () => {
		assert.deepEqual(requirementsTakenByOwner([answer(["R1"])], requirements, ["R1", "R2"]), []);
		assert.deepEqual(requirementsTakenByOwner([answer(["R1", "R2"])], requirements, ["R1"]), []);
	});

	it("is empty for an answer that is not an assign_review, is revoked, or was given to another question", () => {
		assert.deepEqual(requirementsTakenByOwner([answer(["R1"], { option_id: "prepare" })], requirements, ["R1"]), []);
		assert.deepEqual(requirementsTakenByOwner([answer(["R1"], { valid: false })], requirements, ["R1"]), []);
		assert.deepEqual(requirementsTakenByOwner([answer(["R1"], { interaction: "IH-02" })], requirements, ["R1"]), []);
	});

	it("does not depend on the order the requirements are named in", () => {
		assert.deepEqual(requirementsTakenByOwner([answer(["R2", "R1"])], requirements, ["R1", "R2"]), ["R1", "R2"]);
	});
});
