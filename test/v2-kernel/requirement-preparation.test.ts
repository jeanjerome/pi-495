import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness, trackedProject } from "../helpers/harness-fixture.ts";
import { fixtureTsWithoutTests, removedAfterEach } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { PreparationRecord } from "../../src/application/preparation.ts";

removedAfterEach();

const spec = specReport({
	objective: "add shout(name) and whisper(name), and greet says hi",
	requirements: [
		{
			requirement_id: "R1",
			statement: "shout(name) returns greet(name) upper-cased",
			mandatory: true,
			criterion: "unit test on shout passes",
			category: "functional",
			satisfied_by_reference: false,
		},
		{
			requirement_id: "R2",
			statement: "whisper(name) returns greet(name) lower-cased",
			mandatory: true,
			criterion: "unit test on whisper passes",
			category: "functional",
			satisfied_by_reference: false,
		},
		{
			requirement_id: "R3",
			statement: "greet(name) returns Hi, <name>",
			mandatory: true,
			criterion: "unit test on greet passes",
			category: "functional",
			satisfied_by_reference: true,
		},
	],
});
const report = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: false, notes: [] });
const head =
	'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport * as greeting from "../src/greet.js";\n';
// The case of R1 fails by assertion where shout is absent; the case of R2 passes on the reference whatever
// whisper does; the characterization of R3 contradicts what the reference does.
const R1_CASE =
	'test("R1 shout upper-cases the greeting", () => {\n  assert.equal(typeof greeting.shout, "function");\n  assert.equal(greeting.shout("x"), "HELLO, X");\n});\n';
const R2_CASE =
	'test("R2 whisper keeps the greeting", () => {\n  assert.equal(greeting.greet("x"), "Hello, x");\n});\n';
const R3_CASE = 'test("R3 greet says hi", () => {\n  assert.equal(greeting.greet("x"), "Hi, x");\n});\n';

const prepared = (content: string) => ({
	steps: [
		{ kind: "write" as const, path: "test/greeting.test.js", content },
		{ kind: "complete" as const, output: report(["test/greeting.test.js"]) },
	],
});

/** Every preparation the change recorded, in the order it recorded them. */
function preparationsOf(t: TestHarness, changeId: string): Promise<PreparationRecord[]> {
	return Promise.all(
		t.ledger
			.listArtifacts(changeId, "preparation")
			.filter((a) => a.ref.artifact_id.startsWith("prep_"))
			.map((a) => t.harness.artifacts.read<PreparationRecord>(a.ref)),
	);
}

describe("the preparation observes the oracle of each requirement on the reference", () => {
	it("le rouge de R1 ne couvre pas R2 et une caractérisation fausse est signalée avant gel", async () => {
		const p = trackedProject(fixtureTsWithoutTests);
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: prepared(head + R1_CASE + R2_CASE + R3_CASE) },
		});
		// The second preparation drops the characterization that failed: the producer does not choose which failures go.
		let preparations = 0;
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "prepare" && ++preparations === 2)
				t.agent.scripts.set("prepare", prepared(head + R1_CASE + R2_CASE));
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const records = await preparationsOf(t, change.change_id);
		assert.deepEqual(
			records[0]?.requirements?.map((o) => [
				o.requirement_id,
				o.category,
				o.cases.map((c) => `${c.name}: ${c.outcome}`),
				o.qualification,
			]),
			[
				["R1", "new_behaviour", ["R1 shout upper-cases the greeting: failed_assertion"], "proved"],
				["R2", "new_behaviour", ["R2 whisper keeps the greeting: passed"], "contradicted"],
				["R3", "characterization", ["R3 greet says hi: failed_assertion"], "contradicted"],
			],
			"the red of R1 proves R1 alone, and the characterization of R3 is contradicted on the reference",
		);
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.gates.G2, undefined, "no protocol is frozen while R2 and R3 have no oracle of their own");
		const pending = t.harness.pendingDecisions(change.change_id);
		assert.deepEqual(
			pending.map((d) => d.interaction),
			["IH-04"],
		);
		const facts = pending[0]!.facts.join(" | ");
		assert.match(facts, /R2 asks for behaviour the reference does not have, and its cases pass there/, facts);
		assert.match(
			facts,
			/R3 is declared satisfied by the reference, and its characterization contradicts it there: "R3 greet says hi"/,
			"the contradiction stays named once a later preparation drops the case that showed it",
		);
	});

	it("une caractérisation contredite reste nommée à G2 et n’est pas gelée comme couverte quand une préparation suivante la réécrit pour qu’elle passe", async () => {
		const p = trackedProject(fixtureTsWithoutTests);
		const greets = specReport({
			objective: "add shout(name), and greet says hi",
			requirements: [
				{
					requirement_id: "R1",
					statement: "shout(name) returns greet(name) upper-cased",
					mandatory: true,
					criterion: "unit test on shout passes",
					category: "functional",
					satisfied_by_reference: false,
				},
				{
					requirement_id: "R2",
					statement: "greet(name) returns Hi, <name>",
					mandatory: true,
					criterion: "unit test on greet passes",
					category: "functional",
					satisfied_by_reference: true,
				},
			],
		});
		const says = (word: string, text: string) =>
			`test("R2 greet says ${word}", () => {\n  assert.equal(greeting.greet("x"), "${text}");\n});\n`;
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: greets }] },
			scripts: { prepare: prepared(head + R1_CASE + says("hi", "Hi, x")) },
		});
		// The second preparation rewrites the contradicted characterization into one the reference passes.
		let preparations = 0;
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "prepare" && ++preparations === 2)
				t.agent.scripts.set("prepare", prepared(head + R1_CASE + says("hello", "Hello, x")));
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const records = await preparationsOf(t, change.change_id);
		assert.deepEqual(
			records.slice(0, 2).map((r) => r.requirements?.find((o) => o.requirement_id === "R2")?.cases[0]?.name),
			["R2 greet says hi", "R2 greet says hello"],
			"the later preparation rewrote the characterization",
		);
		assert.equal(records[1]?.requirements?.find((o) => o.requirement_id === "R2")?.qualification, "proved");
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.gates.G2, undefined, "no protocol is frozen with R2 covered by the rewritten case");
		const pending = t.harness.pendingDecisions(change.change_id);
		assert.deepEqual(
			pending.map((d) => d.interaction),
			["IH-04"],
		);
		assert.match(
			pending[0]!.facts.join(" | "),
			/R2 is declared satisfied by the reference, and its characterization contradicts it there: "R2 greet says hi"/,
			"the contradiction stays named once a later preparation rewrites the case to pass",
		);
	});

	it("une caractérisation contredite reste nommée à G2 à côté de l’incident quand une préparation suivante la réécrit en un cas qui échoue sans assertion", async () => {
		const p = trackedProject(fixtureTsWithoutTests);
		const greets = specReport({
			objective: "add shout(name), and greet says hi",
			requirements: [
				{
					requirement_id: "R1",
					statement: "shout(name) returns greet(name) upper-cased",
					mandatory: true,
					criterion: "unit test on shout passes",
					category: "functional",
					satisfied_by_reference: false,
				},
				{
					requirement_id: "R2",
					statement: "greet(name) returns Hi, <name>",
					mandatory: true,
					criterion: "unit test on greet passes",
					category: "functional",
					satisfied_by_reference: true,
				},
			],
		});
		const saysHi = 'test("R2 greet says hi", () => {\n  assert.equal(greeting.greet("x"), "Hi, x");\n});\n';
		// salute is absent from the reference: calling it throws before the assertion runs.
		const saysHello = 'test("R2 greet says hello", () => {\n  assert.equal(greeting.salute("x"), "Hello, x");\n});\n';
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: greets }] },
			scripts: { prepare: prepared(head + R1_CASE + saysHi) },
		});
		// The second preparation rewrites the contradicted characterization into a case failing without an assertion.
		let preparations = 0;
		const original = t.agent.startIntervention.bind(t.agent);
		t.agent.startIntervention = async (m) => {
			if (m.role === "prepare" && ++preparations === 2)
				t.agent.scripts.set("prepare", prepared(head + R1_CASE + saysHello));
			return original(m);
		};
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 40 });
		const records = await preparationsOf(t, change.change_id);
		assert.deepEqual(
			records.slice(0, 2).map((r) => {
				const r2 = r.requirements?.find((o) => o.requirement_id === "R2");
				return [r2?.cases[0]?.name, r2?.qualification];
			}),
			[
				["R2 greet says hi", "contradicted"],
				["R2 greet says hello", "incident"],
			],
			"the later preparation rewrote the characterization into a case failing without an assertion",
		);
		assert.equal(records[1]?.qualified, true, "the later preparation is adopted on the red of R1");
		assert.equal(result.stopped_because, "decision_required", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.gates.G2, undefined, "no protocol is frozen");
		const pending = t.harness.pendingDecisions(change.change_id);
		assert.deepEqual(
			pending.map((d) => d.interaction),
			["IH-04"],
		);
		const facts = pending[0]!.facts.join(" | ");
		assert.match(
			facts,
			/R2 is declared satisfied by the reference, and its characterization contradicts it there: "R2 greet says hi"/,
			"the IH-04 decision names the contradiction of R2 by the case a later preparation rewrote",
		);
		assert.match(
			facts,
			/R2: its cases fail on the reference without an assertion, which proves nothing about it: "R2 greet says hello"/,
			"the same decision names the incident of the rewritten case",
		);
	});

	it("a case named as a method, its hyphens written as underscores, proves the hyphenated requirement and its preparation is adopted", async () => {
		const p = trackedProject(fixtureTsWithoutTests);
		const hyphenated = specReport({
			objective: "add shout(name)",
			requirements: [
				{
					requirement_id: "r-update-refuse-nom-pris",
					statement: "shout(name) returns greet(name) upper-cased",
					mandatory: true,
					criterion: "unit test on shout passes",
					category: "functional",
					satisfied_by_reference: false,
				},
			],
		});
		// The name a JUnit method carries: a Java identifier cannot hold the hyphen of the requirement id.
		const methodNamed =
			'test("r_update_refuse_nom_pris_rejectsNameHeldByAnotherUser", () => {\n  assert.equal(typeof greeting.shout, "function");\n});\n';
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: hyphenated }] },
			scripts: { prepare: prepared(head + methodNamed) },
		});
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const records = await preparationsOf(t, change.change_id);
		assert.deepEqual(
			records[0]?.requirements?.map((o) => [
				o.requirement_id,
				o.cases.map((c) => `${c.name}: ${c.outcome}`),
				o.qualification,
			]),
			[
				[
					"r-update-refuse-nom-pris",
					["r_update_refuse_nom_pris_rejectsNameHeldByAnotherUser: failed_assertion"],
					"proved",
				],
			],
		);
		assert.equal(records[0]?.qualified, true, records[0]?.notes.join(" | "));
		assert.equal(
			t.ledger.loadChange(change.change_id)!.state.adopted.preparation?.ref.artifact_id,
			records[0]?.preparation_id,
			"the preparation is adopted rather than left without a case",
		);
	});

	it("a preparation whose every case fails before its assertion proves no requirement and is not adopted", async () => {
		const p = trackedProject(fixtureTsWithoutTests);
		// shout and whisper are absent from the reference: calling them throws before any assertion runs.
		const throwing =
			'test("R1 shout upper-cases the greeting", () => {\n  assert.equal(greeting.shout("x"), "HELLO, X");\n});\n' +
			'test("R2 whisper lower-cases the greeting", () => {\n  assert.equal(greeting.whisper("x"), "hello, x");\n});\n';
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: prepared(head + throwing) },
		});
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const records = await preparationsOf(t, change.change_id);
		assert.deepEqual(
			records[0]?.requirements?.map((o) => [o.requirement_id, o.qualification]),
			[
				["R1", "incident"],
				["R2", "incident"],
				["R3", "no_case"],
			],
		);
		assert.equal(records[0]?.on_reference, "FAIL");
		assert.deepEqual(
			records.map((r) => r.qualified),
			records.map(() => false),
			"a suite red on the reference as a whole proves no requirement, so no preparation is adopted",
		);
		assert.deepEqual(
			records.map((r) => r.discriminant),
			records.map(() => false),
			"a suite whose cases all fail before their assertion is not recorded as discriminant",
		);
	});

	it("a reader that names no case leaves every requirement of the preparation unlocatable rather than without a case", async () => {
		const p = trackedProject(fixtureTsWithoutTests);
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: prepared(head + R1_CASE + R2_CASE + R3_CASE) },
			// The reader of the preparation's control reports a verdict and a count, and no case.
			controls: (real) => ({
				get readers() {
					return real.readers;
				},
				async runControl(invocation, signal) {
					const run = await real.runControl(invocation, signal);
					if (invocation.subject.kind !== "fixture") return run;
					const { cases: _named, ...facts } = run.evidence.facts;
					return { ...run, evidence: { ...run.evidence, facts } };
				},
			}),
		});
		const { change } = await t.harness.start({ project_path: p, request_text: "add shout", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const records = await preparationsOf(t, change.change_id);
		assert.deepEqual(
			records[0]?.requirements?.map((o) => [o.requirement_id, o.qualification]),
			[
				["R1", "unlocatable"],
				["R2", "unlocatable"],
				["R3", "unlocatable"],
			],
		);
		assert.match(records[0]!.notes.join(" | "), /R3: the reader of \S+ names no case/);
	});
});
