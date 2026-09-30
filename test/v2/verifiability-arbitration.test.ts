/**
 * A mandatory requirement no control can judge, after the preparations 495 may spend on it, is put to
 * the owner instead of stopping the change: prepare once more, or judge the requirement themselves.
 */
import { strict as assert } from "node:assert";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specificationRounds, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureJava, fixtureTsWithoutTests, gitCmd, initRepo, SHOUT_IMPL, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import { buildDecisionRequest } from "../../src/application/decisions.ts";
import { detectStack } from "../../src/application/target.ts";
import { GitIntegrator } from "../../src/adapters/git/integrator.ts";
import { digestBytes } from "../../src/contracts/digest.ts";
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

/** What the owner asked R1 to become: a statement of its own, no more judgeable than the first. */
const revisedSpec = specReport({
	objective: spec.objective,
	requirements: [{ ...spec.requirements[0]!, statement: "shout('Ada') returns 'HELLO, ADA'" }],
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
function answerPending(t: TestHarness, changeId: string, optionId: string, freeText: string | null = null): string {
	const pending = t.ledger.loadChange(changeId)!.state.pending_decisions;
	assert.equal(pending.length, 1, "one decision is pending");
	const answered = t.harness.answerDecision(
		changeId,
		{
			decision_id: pending[0]!.decision_id,
			option_id: optionId,
			free_text: freeText,
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
	it("given two preparation interventions that retained no discriminant test, when the verification design resumes, then an IH-04 decision is pending naming the requirement, the gap and the risk, with the options prepare, assign_review and revise, and the change is not blocked", async () => {
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
			["prepare", "assign_review", "revise", "adopt_complement"],
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

	it("given an IH-04 answered revise with a text, then the change is back in specifying, the specification request carries that text and names the requirement, and the requirements, protocol and preparation adopted before no longer hold", async () => {
		const t = track(
			makeHarness({
				policy: { adoption: { requirements: "human" } },
				scripts: { prepare: emptyPreparation },
			}),
		);
		const { objectives } = specificationRounds(t, [spec, revisedSpec]);
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const asked = t.harness.pendingDecisions(change.change_id);
		assert.deepEqual(
			asked.map((d) => d.interaction),
			["IH-04"],
		);
		const before = t.ledger.loadChange(change.change_id)!.state;
		const adoptedBefore = before.adopted.requirements!.ref;
		assert.equal(before.gates.G1?.verdict, "PASS", "the requirements were adopted");

		const text = "check the greeting against the name 'Ada' and drop the promise about accents";
		answerPending(t, change.change_id, "revise", text);
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });

		assert.equal(objectives.length, 2, `the specification is redone: ${result.steps.join(" | ")}`);
		assert.ok(objectives[1]!.includes(text), "the owner's text is in the specification request");
		assert.match(objectives[1]!, /revise R1,/, "the request names the requirement, which the owner's text does not");
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.phase, "specifying", "the change is back in the specification");
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		assert.notEqual(state.gates.G1?.verdict, "PASS", "the adoption of the requirements no longer holds");
		assert.equal(state.gates.G2, undefined, "no protocol is in force");
		assert.ok(
			state.human_decisions.filter((d) => d.interaction === "IH-04").every((d) => !d.valid),
			"no answer given about the previous requirements holds",
		);
		const adoption = t.harness.pendingDecisions(change.change_id);
		assert.deepEqual(
			adoption.map((d) => d.interaction),
			["IH-02"],
			"the owner adopts the requirements written again, as the first ones",
		);
		assert.notEqual(
			adoption[0]!.subject.digest,
			adoptedBefore.content_digest,
			"they are not the requirements adopted before",
		);
	});

	it("given requirements revised at the owner's request and still not judgeable, then two preparations open before IH-04 is asked again, on the revision of the new requirements", async () => {
		const t = track(
			makeHarness({
				policy: { adoption: { requirements: "human" } },
				scripts: { prepare: emptyPreparation },
			}),
		);
		specificationRounds(t, [spec, revisedSpec]);
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const first = t.requested.filter((r) => r.interaction === "IH-04");
		answerPending(t, change.change_id, "revise", "R1 must be checked against the name 'Ada'");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt");
		const preparationsBefore = t.ledger
			.loadChange(change.change_id)!
			.state.interventions.filter((i) => i.role === "prepare").length;
		assert.equal(preparationsBefore, 2, "two preparations were spent on the first wording");

		const result = await t.harness.advance(change.change_id, { max_steps: 40 });

		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(
			state.interventions.filter((i) => i.role === "prepare").length,
			4,
			`two preparations opened for the new requirements: ${result.steps.join(" | ")}`,
		);
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const asked = t.requested.filter((r) => r.interaction === "IH-04");
		assert.equal(asked.length, first.length + 1, "IH-04 is asked again once, after those preparations");
		assert.deepEqual(
			asked.at(-1)!.subject,
			arbitrationSubject(state.adopted.requirements!.ref, ["R1"]),
			"the decision is about the revision of the new requirements",
		);
		assert.notEqual(asked.at(-1)!.subject.digest, first[0]!.subject.digest, "not about the requirements revised");
	});

	it("given an IH-04 asked once R2 turned out to be unjudged after the suite was observed, when it is answered revise, then the specification is written again naming R1 and R2 with the owner's text", async () => {
		const t = track(
			makeHarness({
				policy: { adoption: { requirements: "human" } },
				scripts: { prepare: emptyPreparation },
			}),
		);
		const { objectives } = specificationRounds(t, [specWithRequirementSeenLater, revisedSpec]);
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "assign_review");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const asked = t.requested.filter((r) => r.interaction === "IH-04");
		assert.match(asked.at(-1)!.question, /R1, R2/, "the question asked after the observation names both requirements");

		const text = "say what both greetings return for the name 'Ada'";
		answerPending(t, change.change_id, "revise", text);
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });

		assert.equal(objectives.length, 2, `the specification is redone: ${result.steps.join(" | ")}`);
		assert.match(objectives[1]!, /revise R1, R2,/, "the request names both requirements");
		assert.ok(objectives[1]!.includes(text), "the owner's text is in the specification request");
		assert.deepEqual(
			t.harness.pendingDecisions(change.change_id).map((d) => d.interaction),
			["IH-02"],
			"the owner adopts the requirements written again",
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

/** A Maven target whose POM binds JaCoCo and PIT (or neither), so the detection recommends nothing (or two complements). */
function mavenProjectWithoutTests(complete: boolean): string {
	const p = tempDir("495-arbitration-maven-");
	cleanups.push(p);
	fixtureJava(p, complete, complete);
	initRepo(p);
	return p;
}

describe("the IH-04 facts present the recommended complements", () => {
	async function askedOn(project: string): Promise<string[]> {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const pending = t.harness.pendingDecisions(change.change_id);
		assert.deepEqual(
			pending.map((d) => d.interaction),
			["IH-04"],
		);
		assert.deepEqual(
			pending[0]!.options.map((o) => o.id),
			["prepare", "assign_review", "revise"],
		);
		return pending[0]!.facts;
	}

	it("given a target with two recommendations and a requirement no control discriminates after two preparations, then the IH-04 facts list each with its tool, version, date and change and the options stay prepare, assign_review and revise, and without a recommendation the facts are unchanged", async () => {
		const recommended = mavenProjectWithoutTests(false);
		const recommendations = detectStack(recommended, []).recommendations;
		assert.equal(recommendations.length, 2, "the target lacks JaCoCo and PIT");
		const facts = await askedOn(recommended);
		for (const r of recommendations)
			assert.ok(
				facts.some(
					(f) => f.includes(r.tool) && f.includes(r.version) && f.includes(r.established_on) && f.includes(r.change),
				),
				`${r.tool} is listed with its version, date and change: ${facts.join(" | ")}`,
			);
		const bare = await askedOn(mavenProjectWithoutTests(true));
		assert.equal(
			bare.some((f) => /recommend/i.test(f) && !/^risk:/.test(f)),
			false,
			`no recommendation to list: ${bare.join(" | ")}`,
		);
		assert.equal(facts.length, bare.length + 2, "each recommendation is one fact and nothing else changes");
	});
});

describe("the IH-04 decision offers to adopt a complement that is a file edit", () => {
	async function optionsAsked(project: string): Promise<{ id: string; label: string; effect: string }[]> {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		return t.harness.pendingDecisions(change.change_id)[0]!.options;
	}

	it("given an IH-04 on a target whose recommendation carries an edit, then the options are prepare, assign_review, revise and adopt_complement naming package.json and saying it does not judge the requirement, and without an adoptable complement the options are those of today", async () => {
		const options = await optionsAsked(projectWithoutTests());
		assert.deepEqual(
			options.map((o) => o.id),
			["prepare", "assign_review", "revise", "adopt_complement"],
		);
		const adopt = options.at(-1)!;
		assert.match(adopt.effect, /package\.json/);
		assert.match(adopt.effect, /ne juge pas|does not judge/);
		for (const language of ["fr", "en"] as const) {
			const request = (adoptable_files: string[]) =>
				buildDecisionRequest({
					decision_id: "dec_1",
					change_id: "chg_1",
					interaction: "IH-04",
					subject: { kind: "artifact", id: "req_0001", revision: 1, digest: "sha256:00" },
					language,
					facts: [],
					recommendation: null,
					arg: "R1",
					requested_at: "2026-09-30T12:00:00.000Z",
					adoptable_files,
				}).options;
			assert.deepEqual(
				request([]).map((o) => o.id),
				["prepare", "assign_review", "revise"],
				`nothing adoptable (${language})`,
			);
			const offered = request(["package.json"]);
			assert.deepEqual(
				offered.map((o) => o.id),
				["prepare", "assign_review", "revise", "adopt_complement"],
				language,
			);
			assert.match(offered.at(-1)!.effect, /package\.json/, language);
			assert.match(offered.at(-1)!.effect, language === "fr" ? /ne juge pas/ : /does not judge/, language);
		}
		const duplicated = projectWithoutTests();
		writeFileSync(
			join(duplicated, "package.json"),
			'{"name":"f-notests","type":"module","scripts":{"test":"node --test","test":"node --test"}}\n',
		);
		gitCmd(duplicated, ["commit", "-qam", "scripts.test written twice"]);
		assert.equal(
			detectStack(duplicated, []).recommendations.filter((r) => r.edit).length,
			1,
			"the recommendation still carries the edit",
		);
		assert.deepEqual(
			(await optionsAsked(duplicated)).map((o) => o.id),
			["prepare", "assign_review", "revise"],
			"an edit that does not apply to the file is not offered for adoption",
		);
		const withoutEdit = await optionsAsked(mavenProjectWithoutTests(false));
		assert.deepEqual(
			withoutEdit.map((o) => o.id),
			["prepare", "assign_review", "revise"],
			"the recommendations of a Maven target are texts",
		);
	});
});

describe("adopting a complement that is a file edit", () => {
	/** The package.json the recommended edit makes of the one the target holds. */
	function editedPackageJson(project: string): string {
		return readFileSync(join(project, "package.json"), "utf8").replace(
			'"node --test"',
			'"node --test --experimental-test-coverage"',
		);
	}

	it("given an IH-04 answered adopt_complement on a node --test target, then the frozen protocol declares the coverage control, carries the adopted complement with the file and its digest, and G2 passes", async () => {
		const t = harnessWithEmptyPreparations();
		const project = projectWithoutTests();
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt_complement");
		const asked = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(asked.stopped_because, "decision_required", asked.steps.join(" | "));
		assert.equal(
			readFileSync(join(project, "package.json"), "utf8").includes("--experimental-test-coverage"),
			false,
			"nothing is written in the project",
		);
		answerPending(t, change.change_id, "assign_review");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const loaded = t.ledger.loadChange(change.change_id)!;
		assert.equal(loaded.state.gates.G2?.verdict, "PASS", loaded.state.gates.G2?.reasons.join("; "));
		const protocol = (await t.harness.artifacts.latest<Protocol>(loaded.state, "protocol"))!.content;
		assert.ok(
			protocol.controls.some((c) => c.control_id === "coverage"),
			`the coverage control is declared: ${protocol.controls.map((c) => c.control_id).join(", ")}`,
		);
		assert.equal(protocol.qualifications.coverage?.qualified, true, protocol.qualifications.coverage?.notes.join("; "));
		assert.deepEqual(protocol.complements, [
			{
				path: "package.json",
				digest: digestBytes(editedPackageJson(project)),
				test_type: "coverage",
				tool: "node --experimental-test-coverage",
			},
		]);
		const report = await t.harness.report(change.change_id);
		assert.ok(
			!report.residual_risks.some((r) => r.code === "recommended_complement_not_adopted"),
			JSON.stringify(report.residual_risks),
		);
	});
});

describe("the candidate that carries an adopted complement", () => {
	/** The change frozen with the complement adopted and R1 assigned to the owner, whose producer writes `files`. */
	async function adoptedAndImplemented(
		files: Record<string, string>,
	): Promise<{ t: TestHarness; project: string; changeId: string }> {
		const project = projectWithoutTests();
		const t = track(
			makeHarness({
				policy: { integration_enabled: true },
				defaultScript: { steps: [{ kind: "complete", output: spec }] },
				scripts: {
					prepare: emptyPreparation,
					implement: {
						steps: [
							...Object.entries(files).map(([path, content]) => ({ kind: "write" as const, path, content })),
							{
								kind: "complete",
								output: { summary: "done", changed_paths: Object.keys(files), tests_claimed: false, notes: [] },
							},
						],
					},
				},
			}),
		);
		t.harness.integrator = new GitIntegrator(t.harness).step;
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt_complement");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "assign_review");
		return { t, project, changeId: change.change_id };
	}

	const g4Decisions = (t: TestHarness, changeId: string) =>
		t.ledger
			.readChangeEvents(changeId)
			.filter((e) => e.event.type === "gate.decided" && e.event.decision.gate === "G4")
			.map((e) => (e.event as { decision: { verdict: string; reasons: string[] } }).decision);

	it("given a candidate keeping the package.json the complement wrote, then G4 passes it, and once the owner accepts it the local commit holds the coverage flag in scripts.test while the project was untouched until then", async () => {
		const { t, project, changeId } = await adoptedAndImplemented({ "src/greet.js": SHOUT_IMPL });
		const before = gitCmd(project, ["rev-parse", "HEAD"]).trim();

		let result = await t.harness.advance(changeId, { max_steps: 40 });

		assert.deepEqual(
			g4Decisions(t, changeId).map((g) => g.verdict),
			["PASS"],
			g4Decisions(t, changeId)
				.flatMap((g) => g.reasons)
				.join("; "),
		);
		assert.equal(
			gitCmd(project, ["rev-parse", "HEAD"]).trim(),
			before,
			"nothing is committed before the owner accepts",
		);
		assert.equal(gitCmd(project, ["status", "--porcelain"]).trim(), "", "nothing is written in the project");
		for (let step = 0; step < 4 && result.stopped_because === "decision_required"; step++) {
			const [asked] = t.harness.pendingDecisions(changeId);
			answerPending(t, changeId, asked!.interaction === "IH-11" ? "integrate" : "accept");
			result = await t.harness.advance(changeId, { max_steps: 40 });
		}
		assert.equal(result.view.change?.outcome, "integrated", result.steps.join(" | "));
		const committed = JSON.parse(gitCmd(project, ["show", "HEAD:package.json"])) as { scripts: { test: string } };
		assert.equal(committed.scripts.test, "node --test --experimental-test-coverage");
		assert.equal(gitCmd(project, ["remote"]).trim(), "", "nothing is pushed");
	});

	it("given a candidate that also modifies another line of package.json, then G4 refuses it naming package.json", async () => {
		const modified = JSON.stringify({
			name: "f-notests",
			version: "1.0.0",
			type: "module",
			scripts: { test: "node --test --experimental-test-coverage", extra: "true" },
		});
		const { t, changeId } = await adoptedAndImplemented({ "src/greet.js": SHOUT_IMPL, "package.json": modified });

		await t.harness.advance(changeId, { max_steps: 40 });

		const refused = g4Decisions(t, changeId);
		assert.ok(refused.length > 0, "the candidate reaches G4");
		assert.ok(
			refused.every((g) => g.verdict === "FAIL" && g.reasons.some((r) => r.includes("package.json"))),
			JSON.stringify(refused),
		);
	});

	it("given a producer that writes back the package.json of the reference, byte for byte, then G4 refuses it with the reason protected path altered by the producer: package.json, and no candidate is accepted", async () => {
		const reference = JSON.stringify({
			name: "f-notests",
			version: "1.0.0",
			type: "module",
			scripts: { test: "node --test" },
		});
		const { t, project, changeId } = await adoptedAndImplemented({
			"src/greet.js": SHOUT_IMPL,
			"package.json": reference,
		});
		const before = gitCmd(project, ["rev-parse", "HEAD"]).trim();

		const result = await t.harness.advance(changeId, { max_steps: 40 });

		const refused = g4Decisions(t, changeId);
		assert.ok(refused.length > 0, "the candidate reaches G4");
		assert.ok(
			refused.every(
				(g) => g.verdict === "FAIL" && g.reasons.includes("protected path altered by the producer: package.json"),
			),
			JSON.stringify(refused),
		);
		assert.notEqual(result.view.change?.outcome, "integrated");
		assert.equal(gitCmd(project, ["rev-parse", "HEAD"]).trim(), before, "no integration commit is produced");
	});
});

describe("what adopting a complement holds for", () => {
	/** The change frozen with the complement adopted, then its requirements rewritten. */
	async function adoptedThenRevised(t: TestHarness): Promise<string> {
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		const changeId = change.change_id;
		await t.harness.advance(changeId, { max_steps: 40 });
		answerPending(t, changeId, "adopt_complement");
		await t.harness.advance(changeId, { max_steps: 40 });
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 1 });
		const loaded = t.ledger.loadChange(changeId)!;
		const frozen = (await t.harness.artifacts.latest<Protocol>(loaded.state, "protocol"))!.content;
		assert.equal(frozen.complements?.length, 1, "the complement is adopted in the first protocol");
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
		return changeId;
	}

	it("given an adopted complement then a revision of the requirements, then the next protocol carries none, the recommendation is presented again and adoption is offered again", async () => {
		const t = harnessWithEmptyPreparations();
		const changeId = await adoptedThenRevised(t);

		const again = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(again.stopped_because, "decision_required", again.steps.join(" | "));
		const [asked] = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			asked!.options.map((o) => o.id),
			["prepare", "assign_review", "revise", "adopt_complement"],
			"adoption is offered again",
		);
		assert.ok(
			asked!.facts.some((f) => f.includes("node --experimental-test-coverage")),
			`the recommendation is presented again: ${asked!.facts.join(" | ")}`,
		);
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 40 });
		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(state.gates.G2?.verdict, "PASS", state.gates.G2?.reasons.join("; "));
		const next = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
		assert.equal(next.complements, undefined, "the next protocol carries no complement");
		assert.equal(
			next.controls.some((c) => c.control_id === "coverage"),
			false,
			"and no coverage control",
		);
		assert.equal(next.capability_diagnosis.recommendations?.length, 1, "the complement is recommended again");
	});

	it("given an adopted complement and a requirement the new sensor does not make judgeable, then IH-04 is asked again with prepare, assign_review and revise only", async () => {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({
			project_path: projectWithoutTests(),
			request_text: "add shout",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const first = t.harness.pendingDecisions(change.change_id)[0]!;
		answerPending(t, change.change_id, "adopt_complement");

		const result = await t.harness.advance(change.change_id, { max_steps: 40 });

		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const [again] = t.harness.pendingDecisions(change.change_id);
		assert.notEqual(again!.decision_id, first.decision_id, "the question is asked again, not left answered");
		assert.match(again!.question, /R1/, "about the requirement the sensor did not make judgeable");
		assert.deepEqual(
			again!.options.map((o) => o.id),
			["prepare", "assign_review", "revise"],
			"the complement is in place: nothing left to adopt",
		);
		assert.equal(
			again!.facts.some((f) => f.includes("node --experimental-test-coverage")),
			false,
			"and nothing left to recommend",
		);
		assert.equal(
			t.ledger.loadChange(change.change_id)!.state.interventions.filter((i) => i.role === "prepare").length,
			2,
			"adopting grants no preparation",
		);
	});
});

describe("the IH-04 request", () => {
	const ask = (language: "fr" | "en") =>
		buildDecisionRequest({
			decision_id: "dec_1",
			change_id: "chg_1",
			interaction: "IH-04",
			subject: { kind: "artifact", id: "req_0001", revision: 1, digest: "sha256:00" },
			language,
			facts: [],
			recommendation: null,
			arg: "R1",
			requested_at: "2026-09-29T12:00:00.000Z",
		});

	it("the IH-04 request offers prepare, assign_review and revise, and accepts a free text for revise", () => {
		for (const language of ["fr", "en"] as const) {
			const request = ask(language);
			assert.deepEqual(
				request.options.map((o) => o.id),
				["prepare", "assign_review", "revise"],
				language,
			);
			assert.ok(
				request.options.every((o) => o.label.length > 0 && o.effect.length > 0),
				`each option says what it is and its effect (${language})`,
			);
			assert.equal(
				request.allow_free_text,
				true,
				`the revise answer takes the text of what the requirement becomes (${language})`,
			);
		}
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
		free_text: null,
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
