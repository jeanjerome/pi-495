/**
 * A mandatory requirement no control can judge, after the preparations 495 may spend on it, is put to
 * the owner instead of stopping the change: prepare once more, or judge the requirement themselves.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	makeHarness,
	reopenHarness,
	specificationRounds,
	specReport,
	type TestHarness,
	trackedProject,
} from "../helpers/harness-fixture.ts";
import {
	fixtureJava,
	fixtureTsWithoutTests,
	fixtureVitestWithoutProvider,
	gitCmd,
	initRepo,
	SHOUT_IMPL,
	tempDir,
	removedAfterEach,
} from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import {
	FakeMavenControls,
	FakeMavenSandbox,
	LOCAL_REPOSITORY,
	RESOLUTION_OUTPUT,
	TAMPERED_FILE,
	EXCLUDED_FILE,
	type MavenMode,
} from "../helpers/fake-maven.ts";
import {
	FakeNpmSandbox,
	FakeVitestControls,
	PROVIDER,
	PROVIDER_FILES,
	PROVIDER_INTEGRITY,
	type NpmMode,
} from "../helpers/fake-npm.ts";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import { buildDecisionRequest } from "../../src/application/decisions.ts";
import { editedFile } from "../../src/application/complement.ts";
import { detectStack } from "../../src/application/target.ts";
import { digestBytes } from "../../src/contracts/digest.ts";
import { arbitrationSubject, requirementsTakenByOwner } from "../../src/application/phases/verification-design.ts";
import type { HumanDecisionEntry } from "../../src/domain/change/state.ts";
import { SCHEMA_VERSION, type ArtifactRef } from "../../src/contracts/v1/common.ts";
import type { Protocol, RequirementsDocument } from "../../src/contracts/v1/protocol.ts";
import type { DecisionRequest, HumanOrigin } from "../../src/contracts/v1/decision.ts";

const cleanups = removedAfterEach();

/** Played on a target without any test: `shout` does not exist, so R1 asks for behaviour no control can detect. */
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
	return makeHarness({
		defaultScript: { steps: [{ kind: "complete", output: spec }] },
		scripts: { prepare: emptyPreparation },
	});
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

/** The G4 decisions recorded on the change. */
const g4Decisions = (t: TestHarness, changeId: string) =>
	t.ledger
		.readChangeEvents(changeId)
		.filter((e) => e.event.type === "gate.decided" && e.event.decision.gate === "G4")
		.map((e) => (e.event as { decision: { verdict: string; reasons: string[] } }).decision);

describe("a requirement no control can judge is arbitrated by the owner", () => {
	it("given two preparation interventions that retained no discriminant test, when the verification design resumes, then an IH-04 decision is pending naming the requirement, the gap and the risk, with the options prepare, assign_review and revise, and the change is not blocked", async () => {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
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
			project_path: trackedProject(fixtureTsWithoutTests),
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
		const t = makeHarness({
			policy: { adoption: { requirements: "human" } },
			scripts: { prepare: emptyPreparation },
		});
		const { objectives } = specificationRounds(t, [spec, revisedSpec]);
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
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
		const t = makeHarness({
			policy: { adoption: { requirements: "human" } },
			scripts: { prepare: emptyPreparation },
		});
		specificationRounds(t, [spec, revisedSpec]);
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
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
		const t = makeHarness({
			policy: { adoption: { requirements: "human" } },
			scripts: { prepare: emptyPreparation },
		});
		const { objectives } = specificationRounds(t, [specWithRequirementSeenLater, revisedSpec]);
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
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
			project_path: trackedProject(fixtureTsWithoutTests),
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
		await t.harness.conducting(loaded.state.change_id, async () =>
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
			),
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
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: specWithRequirementSeenLater }] },
			scripts: { prepare: emptyPreparation },
		});
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
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
	const p = tempDir("495-arbitration-maven-", cleanups);
	fixtureJava(p, complete, complete);
	initRepo(p);
	return p;
}

/** A Maven target whose only plugins are managed, so the declaration of JaCoCo has no place to go without ambiguity. */
function mavenProjectWithManagedPluginsOnly(): string {
	const p = tempDir("495-arbitration-maven-managed-", cleanups);
	fixtureJava(p);
	const pom = join(p, "pom.xml");
	writeFileSync(
		pom,
		readFileSync(pom, "utf8")
			.replace("<build>", "<build><pluginManagement>")
			.replace("</build>", "</pluginManagement></build>"),
	);
	initRepo(p);
	return p;
}

function mavenHarness(
	mode: MavenMode,
	implement?: Record<string, string>,
	sandbox?: "unqualified",
): { t: TestHarness; maven: FakeMavenSandbox } {
	let maven: FakeMavenSandbox | undefined;
	const t = makeHarness({
		...(sandbox === undefined ? {} : { sandbox }),
		defaultScript: { steps: [{ kind: "complete", output: spec }] },
		scripts: {
			prepare: emptyPreparation,
			...(implement === undefined
				? {}
				: {
						implement: {
							steps: [
								...Object.entries(implement).map(([path, content]) => ({ kind: "write" as const, path, content })),
								{
									kind: "complete" as const,
									output: { summary: "done", changed_paths: Object.keys(implement), tests_claimed: false, notes: [] },
								},
							],
						},
					}),
		},
		backend: (real) => {
			maven = new FakeMavenSandbox(real, mode);
			return maven;
		},
		controls: (real) => new FakeMavenControls(real),
	});
	return { t, maven: maven! };
}

describe("the IH-04 facts present the recommended complements", () => {
	async function askedOn(project: string): Promise<string[]> {
		const { t } = mavenHarness("announces-nothing");
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
		const options = await optionsAsked(trackedProject(fixtureTsWithoutTests));
		assert.deepEqual(
			options.map((o) => o.id),
			["prepare", "assign_review", "revise", "adopt_complement"],
		);
		const adopt = options.at(-1)!;
		assert.match(adopt.effect, /package\.json/);
		assert.match(adopt.effect, /ne juge pas|does not judge/);
		for (const language of ["fr", "en"] as const) {
			const request = (files: string[]) =>
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
					adoptable: { files, installs: [] },
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
		const duplicated = trackedProject(fixtureTsWithoutTests);
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
		const managed = await optionsAsked(mavenProjectWithManagedPluginsOnly());
		assert.deepEqual(
			managed.map((o) => o.id),
			["prepare", "assign_review", "revise"],
			"a POM that has no single place for the declaration keeps the recommendation a text",
		);
	});
});

describe("the IH-04 decision offers to adopt a complement that is the declaration of a Maven plugin", () => {
	async function asked(project: string, mode: MavenMode): Promise<DecisionRequest> {
		const { t } = mavenHarness(mode);
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		return t.harness.pendingDecisions(change.change_id)[0]!;
	}

	it("given a Maven target whose recommendation carries an applicable edit, then the decision offers to adopt the complement, its effect naming pom.xml, the plugin and version, the network and the local repository, and given a target whose edit does not apply or whose maven announces no local repository, then the options are today's and the report gives the reason", async () => {
		const offered = await asked(mavenProjectWithoutTests(false), "resolves");
		assert.deepEqual(
			offered.options.map((o) => o.id),
			["prepare", "assign_review", "revise", "adopt_complement"],
		);
		const adopt = offered.options.at(-1)!;
		const text = `${adopt.label} ${adopt.effect}`;
		assert.match(text, /pom\.xml/);
		assert.match(text, /jacoco-maven-plugin/);
		assert.match(text, /0\.8\.15/);
		assert.match(
			adopt.label,
			/pour cette seule étape|for that step alone/,
			"the option says the network opens for one step",
		);
		assert.match(adopt.effect, /réseau|network/);
		assert.match(adopt.effect, /dépôt local|local repository/);
		assert.ok(adopt.effect.includes(LOCAL_REPOSITORY), "the effect names the directory Maven announced");
		assert.match(adopt.effect, /dès l'adoption|from the adoption/, "the files are written before the integration");
		assert.match(adopt.effect, /y restent|stay there/, "and stay if the integration is refused");

		const silent = await asked(mavenProjectWithoutTests(false), "announces-nothing");
		assert.deepEqual(
			silent.options.map((o) => o.id),
			["prepare", "assign_review", "revise"],
		);
		assert.ok(
			silent.facts.some((f) => f.includes("jacoco-maven-plugin") && /local repository/.test(f)),
			silent.facts.join(" | "),
		);

		const managed = await asked(mavenProjectWithManagedPluginsOnly(), "resolves");
		assert.deepEqual(
			managed.options.map((o) => o.id),
			["prepare", "assign_review", "revise"],
		);
	});
});

describe("a Maven target on a sandbox backend that is not qualified", () => {
	it("given a sandbox backend that is not qualified, then Maven is not asked for its local repository, and no Maven command reaches the backend", async () => {
		const { t, maven } = mavenHarness("resolves", undefined, "unqualified");
		const { change } = await t.harness.start({
			project_path: mavenProjectWithoutTests(false),
			request_text: "add shout",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.ok(
			result.steps.some((step) => step.includes("backend not qualified")),
			result.steps.join(" | "),
		);
		assert.equal(maven.runs.length, 0, "no command reaches an unqualified backend");
	});
});

describe("the option to adopt the declaration of a Maven plugin says what it writes on the machine in both languages", () => {
	it("given an adoptable POM edit and the local repository Maven announced, then the option names pom.xml, the plugin and its version, the network for that step alone and the local repository written from the adoption and kept if the integration is refused, in french and in english", () => {
		const promises = {
			fr: [
				/pom\.xml/,
				/jacoco-maven-plugin 0\.8\.15/,
				/réseau pour cette seule étape/,
				/dès l'adoption/,
				/y restent si l'intégration est refusée/,
			],
			en: [
				/pom\.xml/,
				/jacoco-maven-plugin 0\.8\.15/,
				/network for that step alone/,
				/from the adoption/,
				/stay there if the integration is refused/,
			],
		};
		for (const language of ["fr", "en"] as const) {
			const options = buildDecisionRequest({
				decision_id: "dec_1",
				change_id: "chg_1",
				interaction: "IH-04",
				subject: { kind: "artifact", id: "req_0001", revision: 1, digest: "sha256:00" },
				language,
				facts: [],
				recommendation: null,
				arg: "R1",
				requested_at: "2026-09-30T12:00:00.000Z",
				adoptable: {
					files: ["pom.xml"],
					installs: [{ package: "org.jacoco:jacoco-maven-plugin", version: "0.8.15", manager: "maven" }],
					local_repository: LOCAL_REPOSITORY,
				},
			}).options;
			const adopt = options.at(-1)!;
			assert.equal(adopt.id, "adopt_complement", language);
			const text = `${adopt.label} ${adopt.effect}`;
			for (const promise of promises[language]) assert.match(text, promise, `${language}: ${promise}`);
			assert.ok(adopt.effect.includes(LOCAL_REPOSITORY), `${language}: the directory Maven announced`);
		}
	});
});

function vitestProjectWithoutProvider(lock: string | null): string {
	const p = tempDir("495-arbitration-vitest-", cleanups);
	fixtureVitestWithoutProvider(p, lock);
	return p;
}

describe("the IH-04 decision offers to adopt a complement that is an install", () => {
	async function asked(project: string): Promise<DecisionRequest> {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		return t.harness.pendingDecisions(change.change_id)[0]!;
	}

	it("given three vitest targets, one with package-lock.json, one with only pnpm-lock.yaml and one with no lock, then only the first offers to adopt the complement, naming the package, its version and the network, and the report gives the reason for the other two", async () => {
		const locked = await asked(vitestProjectWithoutProvider("package-lock.json"));
		assert.deepEqual(
			locked.options.map((o) => o.id),
			["prepare", "assign_review", "revise", "adopt_complement"],
		);
		const adopt = locked.options.at(-1)!;
		assert.match(`${adopt.label} ${adopt.effect}`, /@vitest\/coverage-v8/);
		assert.match(`${adopt.label} ${adopt.effect}`, /3\.2\.4/);
		assert.match(`${adopt.label} ${adopt.effect}`, /réseau|network/);
		assert.match(
			adopt.label,
			/pour cette seule étape|for that step alone/,
			"the option says the network opens for one step",
		);
		assert.match(adopt.effect, /pour cette seule étape|for that step alone/, "and so does its effect");

		const pnpm = await asked(vitestProjectWithoutProvider("pnpm-lock.yaml"));
		assert.deepEqual(
			pnpm.options.map((o) => o.id),
			["prepare", "assign_review", "revise"],
		);
		assert.ok(
			pnpm.facts.some((f) => f.includes("@vitest/coverage-v8") && f.includes("pnpm-lock.yaml")),
			pnpm.facts.join(" | "),
		);

		const unlocked = await asked(vitestProjectWithoutProvider(null));
		assert.deepEqual(
			unlocked.options.map((o) => o.id),
			["prepare", "assign_review", "revise"],
		);
		assert.ok(
			unlocked.facts.some((f) => f.includes("@vitest/coverage-v8") && f.includes("package-lock.json")),
			unlocked.facts.join(" | "),
		);
	});
});

describe("adopting a complement that is an install", () => {
	function vitestHarness(mode: NpmMode): { t: TestHarness; npm: FakeNpmSandbox } {
		let npm: FakeNpmSandbox | undefined;
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: emptyPreparation },
			backend: (real) => {
				npm = new FakeNpmSandbox(real, mode);
				return npm;
			},
			controls: (real) => new FakeVitestControls(real),
		});
		return { t, npm: npm! };
	}

	/** A new session on the same data directory and the same fake npm, whose sandbox backend is not qualified. */
	function reopenedUnqualified(previous: TestHarness, npm: FakeNpmSandbox): TestHarness {
		return reopenHarness(previous, {
			sandbox: "unqualified",
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: emptyPreparation },
			backend: () => npm,
			controls: (real) => new FakeVitestControls(real),
		});
	}

	async function askedAdoption(mode: NpmMode) {
		const { t, npm } = vitestHarness(mode);
		const project = vitestProjectWithoutProvider("package-lock.json");
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt_complement");
		const again = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(again.stopped_because, "decision_required", again.steps.join(" | "));
		return { t, npm, project, changeId: change.change_id };
	}

	it("given a sandbox backend that is not qualified, then the adopted install does not run, nothing is adopted and the reason names the backend", async () => {
		const { t: qualified, npm } = vitestHarness("installs");
		const project = vitestProjectWithoutProvider("package-lock.json");
		const { change } = await qualified.harness.start({
			project_path: project,
			request_text: "add shout",
			actor: HUMAN,
		});
		await qualified.harness.advance(change.change_id, { max_steps: 40 });
		const t = reopenedUnqualified(qualified, npm);
		answerPending(t, change.change_id, "adopt_complement");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(npm.installs(), 0, "no install command reaches an unqualified backend");
		assert.ok(npm.runs.every((r) => r.network === "denied"));
		const pending = t.harness.pendingDecisions(change.change_id);
		assert.ok(
			pending[0]?.facts.some((f) => f.includes("not qualified") && f.includes("backend not qualified")),
			pending[0]?.facts.join(" | "),
		);
	});

	const untouched = (project: string): void => {
		assert.equal(readFileSync(join(project, "package.json"), "utf8").includes("coverage-v8"), false);
		assert.equal(existsSync(join(project, "node_modules", "@vitest")), false, "nothing is written in the project");
	};

	it("given the answer adopt the complement on a vitest target, then the protocol carries package.json, package-lock.json and the added node_modules files as complements with the installed packages and declares the coverage control qualified, and given a failing install or a refused inspection, then nothing is adopted, the record gives the reason and the decision is asked again without the adoption", async () => {
		const { t, npm, project, changeId } = await askedAdoption("installs");
		untouched(project);
		const install = npm.runs.filter((r) => r.command[0] === "npm" && r.command[1] === "install");
		assert.equal(install.length, 1);
		assert.equal(install[0]!.network, "allowed");
		assert.ok(install[0]!.command.includes(`${PROVIDER}@3.2.4`));
		assert.ok(install[0]!.command.includes("--ignore-scripts"));
		assert.deepEqual(install[0]!.write_paths.at(-1), "/machine/npm-cache");
		assert.deepEqual(
			npm.runs.filter((r) => r.network !== "denied").map((r) => r.command.slice(0, 2)),
			[["npm", "install"]],
			"the network is open for the install and for nothing else",
		);
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 40 });
		const loaded = t.ledger.loadChange(changeId)!;
		assert.equal(loaded.state.gates.G2?.verdict, "PASS", loaded.state.gates.G2?.reasons.join("; "));
		const protocol = (await t.harness.artifacts.latest<Protocol>(loaded.state, "protocol"))!.content;
		assert.deepEqual(
			(protocol.complements ?? []).map((c) => c.path).sort(),
			["package-lock.json", "package.json", ...Object.keys(PROVIDER_FILES)].sort(),
		);
		for (const [path, text] of Object.entries(PROVIDER_FILES))
			assert.equal(protocol.complements?.find((c) => c.path === path)?.digest, digestBytes(text), path);
		assert.deepEqual(protocol.installed_packages, [
			{ name: PROVIDER, version: "3.2.4", integrity: PROVIDER_INTEGRITY },
		]);
		assert.ok(protocol.controls.some((c) => c.control_id === "coverage"));
		assert.equal(protocol.qualifications.coverage?.qualified, true, protocol.qualifications.coverage?.notes.join("; "));
		const report = await t.harness.report(changeId);
		assert.ok(
			report.residual_risks.some((r) => r.code === "installed_packages" && r.statement.includes(PROVIDER_INTEGRITY)),
			JSON.stringify(report.residual_risks),
		);
		assert.ok(
			!report.residual_risks.some(
				(r) => r.code === "recommended_complement_not_adopted" && r.statement.includes("coverage complement"),
			),
		);

		for (const [mode, reason] of [
			["fails", "404"],
			["modifies-an-existing-file", "node_modules/vitest/package.json"],
		] as const) {
			const failed = await askedAdoption(mode);
			untouched(failed.project);
			const pending = failed.t.harness.pendingDecisions(failed.changeId);
			assert.deepEqual(
				pending[0]!.options.map((o) => o.id),
				["prepare", "assign_review", "revise"],
				mode,
			);
			assert.ok(
				pending[0]!.facts.some((f) => f.includes(PROVIDER) && f.includes(reason)),
				`${mode}: ${pending[0]!.facts.join(" | ")}`,
			);
			const state = failed.t.ledger.loadChange(failed.changeId)!.state;
			assert.equal(state.protocol, null, "nothing is frozen on an adoption that failed");
			const recorded = await Promise.all(
				(state.proposals.output ?? [])
					.filter((ref) => ref.artifact_id.startsWith("install_"))
					.map((ref) => failed.t.harness.artifacts.read<{ reason: string }>(ref)),
			);
			assert.equal(recorded.length, 1, mode);
			assert.match(recorded[0]!.reason, new RegExp(reason.replace(/[./]/g, "\\$&")), mode);
			answerPending(failed.t, failed.changeId, "assign_review");
			await failed.t.harness.advance(failed.changeId, { max_steps: 40 });
			assert.equal(failed.npm.installs(), 1, `${mode}: the install is not run again`);
			const settled = failed.t.ledger.loadChange(failed.changeId)!;
			assert.equal(settled.state.gates.G2?.verdict, "PASS", settled.state.gates.G2?.reasons.join("; "));
			const frozen = (await failed.t.harness.artifacts.latest<Protocol>(settled.state, "protocol"))!.content;
			assert.equal(frozen.complements, undefined, mode);
			assert.equal(frozen.installed_packages, undefined, mode);
			assert.ok(
				(await failed.t.harness.report(failed.changeId)).residual_risks.some(
					(r) => r.code === "recommended_complement_not_adopted" && r.statement.includes(reason),
				),
				mode,
			);
			untouched(failed.project);
		}
	});

	it("given an installed complement adopted then a revision of the requirements, then the next protocol carries no complement and no installed package, the recommendation is presented again and adoption is offered again", async () => {
		const { t, changeId } = await askedAdoption("installs");
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 1 });
		const loaded = t.ledger.loadChange(changeId)!;
		const frozen = (await t.harness.artifacts.latest<Protocol>(loaded.state, "protocol"))!.content;
		assert.equal(frozen.installed_packages?.length, 1, "the install is adopted in the first protocol");
		const requirements = (await t.harness.artifacts.latest<RequirementsDocument>(loaded.state, "requirements"))!;
		await t.harness.conducting(loaded.state.change_id, async () =>
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
			),
		);

		const again = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(again.stopped_because, "decision_required", again.steps.join(" | "));
		const [asked] = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			asked!.options.map((o) => o.id),
			["prepare", "assign_review", "revise", "adopt_complement"],
			"adoption is offered again",
		);
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 40 });
		const state = t.ledger.loadChange(changeId)!.state;
		assert.equal(state.gates.G2?.verdict, "PASS", state.gates.G2?.reasons.join("; "));
		const next = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
		assert.equal(next.complements, undefined, "the next protocol carries no complement");
		assert.equal(next.installed_packages, undefined, "and no installed package");
		assert.equal(
			next.capability_diagnosis.recommendations?.filter((r) => r.test_type === "coverage").length,
			1,
			"the install is recommended again",
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
		const project = trackedProject(fixtureTsWithoutTests);
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
			!report.residual_risks.some(
				(r) => r.code === "recommended_complement_not_adopted" && r.statement.includes("coverage complement"),
			),
			JSON.stringify(report.residual_risks),
		);
	});
});

describe("the candidate that carries an adopted complement", () => {
	/** The change frozen with the complement adopted and R1 assigned to the owner, whose producer writes `files`. */
	async function adoptedAndImplemented(
		files: Record<string, string>,
	): Promise<{ t: TestHarness; project: string; changeId: string }> {
		const project = trackedProject(fixtureTsWithoutTests);
		const t = makeHarness({
			policy: { integration_enabled: true },
			integration: true,
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
		});
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt_complement");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "assign_review");
		return { t, project, changeId: change.change_id };
	}

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
			project_path: trackedProject(fixtureTsWithoutTests),
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
		await t.harness.conducting(loaded.state.change_id, async () =>
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
			),
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
		assert.equal(
			next.capability_diagnosis.recommendations?.filter((r) => r.test_type === "coverage").length,
			1,
			"the complement is recommended again",
		);
	});

	it("given an adopted complement and a requirement the new sensor does not make judgeable, then IH-04 is asked again with prepare, assign_review and revise only", async () => {
		const t = harnessWithEmptyPreparations();
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
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

	it("given a change without a complement, then one with a complement adopted whose requirements the owner asks to revise, then the specification is written each time on the reference as the project holds it", async () => {
		const t = harnessWithEmptyPreparations();
		const scriptsTestOf = (workspacePath: string): string =>
			(JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf8")) as { scripts: { test: string } }).scripts
				.test;
		const specified: string[] = [];
		const startIntervention = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = (mandate) => {
			if (mandate.role === "specify") specified.push(scriptsTestOf(mandate.workspace_path));
			return startIntervention(mandate);
		};
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
			request_text: "add shout",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.deepEqual(specified, ["node --test"], "the specification of a change without a complement");
		answerPending(t, change.change_id, "adopt_complement");
		await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.deepEqual(
			t.harness.pendingDecisions(change.change_id).map((d) => d.options.map((o) => o.id)),
			[["prepare", "assign_review", "revise"]],
			"the complement is adopted",
		);

		answerPending(t, change.change_id, "revise", "R1 must be checked against the name 'Ada'");
		await t.harness.advance(change.change_id, { max_steps: 40 });

		assert.deepEqual(
			specified,
			["node --test", "node --test"],
			"the specification written again, the complement adopted",
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

describe("adopting a complement that is the declaration of a Maven plugin", () => {
	async function askedAdoption(mode: MavenMode, implement?: (project: string) => Record<string, string>) {
		const project = mavenProjectWithoutTests(false);
		const { t, maven } = mavenHarness(mode, implement?.(project));
		const { change } = await t.harness.start({ project_path: project, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		answerPending(t, change.change_id, "adopt_complement");
		const again = await t.harness.advance(change.change_id, { max_steps: 40 });
		assert.equal(again.stopped_because, "decision_required", again.steps.join(" | "));
		return { t, maven, project, changeId: change.change_id };
	}

	const untouched = (project: string): void =>
		assert.equal(
			readFileSync(join(project, "pom.xml"), "utf8").includes("jacoco"),
			false,
			"the project is not written",
		);

	const outputsOf = async (t: TestHarness, changeId: string): Promise<string[]> =>
		Promise.all(
			(t.ledger.loadChange(changeId)!.state.proposals.output ?? []).map(async (ref) =>
				JSON.stringify(await t.harness.artifacts.read<unknown>(ref)),
			),
		);

	it("given the answer adopt the complement on a Maven target, then the protocol carries pom.xml as an adopted complement, the record keeps maven's output and the JaCoCo control is declared qualified, and given a failing resolution or a refused inspection, then nothing is adopted, the record gives the reason and the decision is asked again without the adoption", async () => {
		const { t, maven, project, changeId } = await askedAdoption("resolves");
		untouched(project);
		const resolution = maven.runs.filter((r) => r.command.some((part) => part.endsWith(":resolve-plugins")));
		assert.equal(resolution.length, 1);
		assert.equal(resolution[0]!.network, "allowed");
		assert.equal(resolution[0]!.write_paths.at(-1), LOCAL_REPOSITORY);
		assert.ok(
			resolution[0]!.command.every((part) => !part.includes("jacoco")),
			"no goal of the adopted plugin",
		);
		assert.deepEqual(
			maven.runs.filter((r) => r.network !== "denied").map((r) => r.command.at(-1)),
			resolution.map((r) => r.command.at(-1)),
			"the network is open for the resolution and for nothing else",
		);
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 40 });
		const loaded = t.ledger.loadChange(changeId)!;
		assert.equal(loaded.state.gates.G2?.verdict, "PASS", loaded.state.gates.G2?.reasons.join("; "));
		const protocol = (await t.harness.artifacts.latest<Protocol>(loaded.state, "protocol"))!.content;
		const edit = detectStack(project, []).recommendations.find((r) => r.tool.includes("jacoco"))!.edit!;
		assert.deepEqual(
			protocol.complements?.map((c) => [c.path, c.digest]),
			[["pom.xml", digestBytes(editedFile(project, edit)!)]],
		);
		assert.equal(protocol.installed_packages, undefined, "a Maven resolution installs no package of the target");
		assert.ok(
			(await outputsOf(t, changeId)).some((o) => o.includes(RESOLUTION_OUTPUT.trim())),
			"the dossier keeps what Maven printed",
		);
		assert.ok(protocol.controls.some((c) => c.control_id === "coverage"));
		assert.equal(protocol.qualifications.coverage?.qualified, true, protocol.qualifications.coverage?.notes.join("; "));
		assert.ok(
			!(await t.harness.report(changeId)).residual_risks.some(
				(r) => r.code === "recommended_complement_not_adopted" && r.statement.includes("jacoco-maven-plugin"),
			),
		);

		for (const [mode, reason] of [
			["fails", "403 Forbidden"],
			["modifies-a-file", TAMPERED_FILE],
			["writes-an-excluded-file", EXCLUDED_FILE],
		] as const) {
			const failed = await askedAdoption(mode);
			untouched(failed.project);
			const pending = failed.t.harness.pendingDecisions(failed.changeId);
			assert.deepEqual(
				pending[0]!.options.map((o) => o.id),
				["prepare", "assign_review", "revise"],
				mode,
			);
			assert.ok(
				pending[0]!.facts.some((f) => f.includes("jacoco-maven-plugin") && f.includes(reason)),
				`${mode}: ${pending[0]!.facts.join(" | ")}`,
			);
			assert.equal(failed.t.ledger.loadChange(failed.changeId)!.state.protocol, null, mode);
			assert.ok(
				(await outputsOf(failed.t, failed.changeId)).some((o) => o.includes(reason)),
				`${mode}: the record gives the reason`,
			);
			answerPending(failed.t, failed.changeId, "assign_review");
			await failed.t.harness.advance(failed.changeId, { max_steps: 40 });
			assert.equal(failed.maven.resolutions(), 1, `${mode}: the resolution is not run again`);
			const settled = failed.t.ledger.loadChange(failed.changeId)!;
			assert.equal(settled.state.gates.G2?.verdict, "PASS", settled.state.gates.G2?.reasons.join("; "));
			const frozen = (await failed.t.harness.artifacts.latest<Protocol>(settled.state, "protocol"))!.content;
			assert.equal(frozen.complements, undefined, mode);
			assert.equal(
				frozen.controls.some((c) => c.control_id === "coverage"),
				false,
				mode,
			);
			assert.ok(
				(await failed.t.harness.report(failed.changeId)).residual_risks.some(
					(r) => r.code === "recommended_complement_not_adopted" && r.statement.includes(reason),
				),
				mode,
			);
			untouched(failed.project);
		}
	});

	it("given a local repository that does not hold the plugin yet, then adopting the complement still resolves it, the local repository being asked of Maven before the POM declares the plugin", async () => {
		const { t, maven, changeId } = await askedAdoption("cold-repository");
		const resolution = maven.runs.filter((r) => r.command.some((part) => part.endsWith(":resolve-plugins")));
		assert.equal(resolution.length, 1, "the plugin is resolved");
		assert.equal(resolution[0]!.write_paths.at(-1), LOCAL_REPOSITORY);
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 40 });
		const state = t.ledger.loadChange(changeId)!.state;
		const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
		assert.deepEqual(
			protocol.complements?.map((c) => c.path),
			["pom.xml"],
		);
	});

	it("given a Maven plugin adopted and a producer that writes back the pom.xml of the reference, byte for byte, then G4 refuses the candidate with the reason protected path altered by the producer: pom.xml", async () => {
		const { t, changeId } = await askedAdoption("resolves", (project) => ({
			"pom.xml": readFileSync(join(project, "pom.xml"), "utf8"),
			[TAMPERED_FILE]: readFileSync(join(project, TAMPERED_FILE), "utf8").replace("Hello, ", "HELLO, "),
		}));
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 40 });

		const refused = g4Decisions(t, changeId);
		assert.ok(refused.length > 0, "the candidate reaches G4");
		assert.ok(
			refused.every(
				(g) => g.verdict === "FAIL" && g.reasons.includes("protected path altered by the producer: pom.xml"),
			),
			JSON.stringify(refused),
		);
	});

	it("given a Maven plugin adopted then a revision of the requirements, then the next protocol carries no complement, the recommendation is presented again and the adoption is offered again, and the local repository Maven designates is the only path written outside the copy", async () => {
		const { t, maven, changeId } = await askedAdoption("resolves");
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 1 });
		const loaded = t.ledger.loadChange(changeId)!;
		const frozen = (await t.harness.artifacts.latest<Protocol>(loaded.state, "protocol"))!.content;
		assert.equal(frozen.complements?.length, 1, "pom.xml is adopted in the first protocol");
		const requirements = (await t.harness.artifacts.latest<RequirementsDocument>(loaded.state, "requirements"))!;
		await t.harness.conducting(loaded.state.change_id, async () =>
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
			),
		);

		const again = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(again.stopped_because, "decision_required", again.steps.join(" | "));
		const [asked] = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			asked!.options.map((o) => o.id),
			["prepare", "assign_review", "revise", "adopt_complement"],
			"adoption is offered again",
		);
		answerPending(t, changeId, "assign_review");
		await t.harness.advance(changeId, { max_steps: 40 });
		const state = t.ledger.loadChange(changeId)!.state;
		const next = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))!.content;
		assert.equal(next.complements, undefined, "the next protocol carries no complement");
		assert.ok(
			next.capability_diagnosis.recommendations?.some((r) => r.tool.includes("jacoco")),
			"the plugin is recommended again",
		);
		assert.ok(
			maven.runs
				.filter((r) => r.command[0] === "mvn")
				.every((r) => r.write_paths.length === 0 || r.write_paths.at(-1) === LOCAL_REPOSITORY),
			"the only path written outside the copy is the local repository",
		);
	});
});
