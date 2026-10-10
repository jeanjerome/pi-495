import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HUMAN } from "../helpers/change-fixture.ts";
import { ScriptedAgent, type AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import type { InterventionHandle, InterventionMandate } from "../../src/ports/execution.ts";
import { fixtureTsWithoutTests, removedAfterEach, SHOUT_IMPL, SHOUT_TEST } from "../helpers/fixtures.ts";
import { makeHarness, specReport, type TestHarness, trackedProject } from "../helpers/harness-fixture.ts";
import type { DesignTask } from "../../src/contracts/v1/protocol.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";

removedAfterEach();

const PLAN: DesignTask[] = [
	{
		task_id: "T1",
		summary: "rewrite the greeting",
		responsibility: "greet",
		requirement_ids: ["R1"],
		depends_on: [],
		paths: ["src/greet.js"],
		checks: ["node --test test/greet.test.js"],
	},
	{
		task_id: "T2",
		summary: "export a farewell beside greet",
		responsibility: "greet",
		requirement_ids: [],
		depends_on: ["T1"],
		paths: ["src/farewell.js"],
		checks: ["node --test"],
	},
];

/**
 * What the producer declares: both tasks done, and T9 the plan does not hold, every local check passed, a
 * self-review. It does not declare NOTES.md among the paths it changed: the kernel reads it on the diff.
 */
const DECLARED = {
	summary: "greet rewritten, farewell added",
	changed_paths: ["src/greet.js", "src/farewell.js"],
	tests_claimed: true,
	notes: [],
	tasks: [
		{
			task_id: "T1",
			status: "done",
			local_checks: [{ command: "node --test test/greet.test.js", outcome: "passed" }],
			deviations: [],
		},
		{
			task_id: "T2",
			status: "done",
			local_checks: [{ command: "node --test", outcome: "passed" }],
			deviations: ["the farewell reuses the greeting template"],
		},
		{ task_id: "T9", status: "done", local_checks: [], deviations: [] },
	],
	self_review: [
		{ aspect: "scope", finding: "src/greet.js and src/farewell.js, as planned" },
		{ aspect: "responsibilities", finding: "greet and farewell each own one text" },
		{ aspect: "types", finding: "plain strings in and out" },
		{ aspect: "complexity", finding: "one expression each" },
		{ aspect: "dead_code", finding: "none" },
	],
};

/** A greeting the frozen test of greet refuses, whatever the producer says of its local run. */
const BROKEN_GREET = "export function greet(name) {\n  return `Bye, ${name}`;\n}\n";

const PLANNED: AgentScript = {
	steps: [{ kind: "complete", output: { ...specReport(), design: { ...specReport().design, tasks: PLAN } } }],
};

/** Writes the same candidate at every production, and declares a self-review that names the production. */
function producing(production: number): AgentScript {
	return {
		steps: [
			{ kind: "write", path: "src/greet.js", content: BROKEN_GREET },
			{
				kind: "complete",
				output: {
					...DECLARED,
					changed_paths: ["src/greet.js"],
					self_review: [{ aspect: "scope", finding: `production ${production}` }],
				},
			},
		],
	};
}

/** A scripted agent whose every implement intervention is a new production, counted across changes. */
class CountingProducer extends ScriptedAgent {
	productions = 0;
	constructor() {
		super(PLANNED);
	}
	override async startIntervention(mandate: InterventionMandate): Promise<InterventionHandle> {
		if (mandate.role === "implement") this.scripts.set("implement", producing(++this.productions));
		return super.startIntervention(mandate);
	}
}

/** Shout as the producer of the rewritten test delivers it: lower-cased, which the prepared case of R1 refuses. */
const LOWER_SHOUT =
	"export function greet(name) {\n  return `Hello, ${name}`;\n}\nexport function shout(name) {\n  return greet(name).toLowerCase();\n}\n";

/** The prepared test of shout, rewritten under the same case names so that the lower-cased shout passes it. */
const WEAKENED_SHOUT_TEST = SHOUT_TEST.replace(
	'assert.equal(greeting.shout("x"), "HELLO, X");',
	'assert.equal(typeof greeting.shout("x"), "string");',
);

const SHOUT_SPEC = specReport({
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

const finished = (paths: string[]) => ({ summary: "done", changed_paths: paths, tests_claimed: true, notes: [] });

/** The line of the report that names what the kernel read changed outside every task of the plan, if any. */
async function unplannedLine(t: TestHarness, changeId: string): Promise<string | undefined> {
	const text = formatReport(await t.harness.report(changeId), "fr");
	return text.split("\n").find((l) => l.includes("modifié hors de toute tâche du plan, relevé par le noyau"));
}

/** A change on a project without tests, whose preparation writes `test/shout.test.js` and whose producer runs `implement`. */
async function shoutChange(implement: AgentScript) {
	const t = makeHarness({
		policy: { budgets: { max_attempts: 1 } },
		defaultScript: { steps: [{ kind: "complete", output: SHOUT_SPEC }] },
		scripts: {
			prepare: {
				steps: [
					{ kind: "write", path: "test/shout.test.js", content: SHOUT_TEST },
					{ kind: "complete", output: finished(["test/shout.test.js"]) },
				],
			},
			implement,
		},
	});
	const { change } = await t.harness.start({
		project_path: trackedProject(fixtureTsWithoutTests),
		request_text: "add shout",
		actor: HUMAN,
	});
	const result = await t.harness.advance(change.change_id, { max_steps: 40 });
	return { t, change, result, state: t.ledger.loadChange(change.change_id)!.state };
}

describe("the producer conducts the adopted plan and reviews its own diff", () => {
	it("une déclaration locale de succès ne remplace pas l’exécution du contrôle d’acceptation", async () => {
		const t = makeHarness({
			policy: { budgets: { max_attempts: 1 } },
			defaultScript: {
				steps: [{ kind: "complete", output: { ...specReport(), design: { ...specReport().design, tasks: PLAN } } }],
			},
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: BROKEN_GREET },
						{ kind: "write", path: "src/farewell.js", content: "export const farewell = (n) => `Bye, ${n}`;\n" },
						{ kind: "write", path: "NOTES.md", content: "notes\n" },
						{ kind: "complete", output: DECLARED },
					],
				},
			},
		});
		const { change } = await t.harness.start({
			project_path: trackedProject(),
			request_text: "Keep greet behaviour, add a farewell",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id);
		const state = t.ledger.loadChange(change.change_id)!.state;
		const candidate = state.candidate!;

		assert.equal(state.gates.G3?.verdict, "PASS", state.gates.G3?.reasons.join(" | "));
		const unit = state.evidence.filter((e) => e.subject_digest === candidate.manifest_digest && e.verdict === "FAIL");
		assert.ok(unit.length > 0, "the frozen control ran on the candidate and refused it");
		assert.notEqual(state.gates.G5?.verdict, "PASS", "the declared local success does not pass G5");
		assert.notEqual(state.outcome, "accepted", result.steps.join(" | "));

		const report = await t.harness.report(change.change_id);
		const declared = report.implementation;
		assert.ok(declared, "the report links the tasks, the local checks and the self-review to the candidate");
		assert.equal(declared.candidate_digest, candidate.manifest_digest, "on the exact candidate");
		assert.equal(declared.design_digest, state.adopted.design?.ref.content_digest, "under the adopted plan");
		assert.equal(declared.authority, "producer_declaration", "a declaration, never the G5 verdict");
		assert.deepEqual(
			declared.tasks.map((k) => [k.task_id, k.declared_status, k.local_checks.map((c) => `${c.command}=${c.outcome}`)]),
			[
				["T1", "done", ["node --test test/greet.test.js=passed"]],
				["T2", "done", ["node --test=passed"]],
			],
		);
		assert.deepEqual(declared.tasks[1]?.deviations, ["the farewell reuses the greeting template"]);
		assert.deepEqual(declared.unplanned_tasks, ["T9"], "the task the plan does not hold is named");
		assert.deepEqual(
			declared.self_review.map((f) => f.aspect),
			["scope", "responsibilities", "types", "complexity", "dead_code"],
		);
		assert.deepEqual(declared.self_review_missing, ["dependencies"], "the aspect the self-review left out is named");
		assert.deepEqual(declared.unplanned_paths, ["NOTES.md"], "the kernel names the change no task planned");
		assert.equal(
			report.judgments.some((j) => j.authority === "model" && j.kind === "gate"),
			false,
			"nothing the producer declared stands as a gate",
		);
		const text = formatReport(report, "en");
		const declaredAt = text.indexOf("What the producer declared, which is no verdict");
		assert.ok(declaredAt > text.indexOf("What was concluded"), `the declaration has its own section:\n${text}`);
		assert.ok(text.includes("  T1 done — node --test test/greet.test.js: passed"), text);
		assert.ok(text.includes("    declared deviation: the farewell reuses the greeting template"), text);
		assert.ok(text.includes("tasks declared outside the plan: T9"), text);
		assert.ok(text.includes("  self-review, types: plain strings in and out"), text);
		assert.ok(text.includes("self-review silent on: dependencies"), text);
		assert.ok(text.includes("changed outside every task of the plan, as the kernel reads it: NOTES.md"), text);
	});

	it("la déclaration présentée est celle de la production qui a figé le candidat, jamais celle d’une autre production du même candidat", async () => {
		const agent = new CountingProducer();
		const t = makeHarness({ policy: { budgets: { max_attempts: 2 } }, agent });
		const first = await t.harness.start({
			project_path: trackedProject(),
			request_text: "Keep greet behaviour, add a farewell",
			actor: HUMAN,
		});
		await t.harness.advance(first.change.change_id);
		const retried = t.ledger.loadChange(first.change.change_id)!.state;
		assert.equal(agent.productions, 2, "the first change produced twice");
		const [a1, a2] = retried.attempts.map((a) => a.candidate?.candidate_id);
		assert.ok(a1 && a1 === a2, "both productions froze the same candidate");
		assert.deepEqual(
			(await t.harness.report(first.change.change_id)).implementation?.self_review.map((f) => f.finding),
			["production 2"],
			"the retry that froze the candidate, not the first production",
		);

		const second = await t.harness.start({
			project_path: trackedProject(),
			request_text: "Keep greet behaviour and nothing else",
			actor: HUMAN,
		});
		await t.harness.advance(second.change.change_id);
		const other = t.ledger.loadChange(second.change.change_id)!.state;
		assert.equal(other.candidate?.candidate_id, a1, "the other change froze the same candidate");
		const declared = (await t.harness.report(second.change.change_id)).implementation;
		assert.equal(declared?.design_digest, other.adopted.design?.ref.content_digest, "under its own plan");
		assert.notEqual(declared?.design_digest, retried.adopted.design?.ref.content_digest);
		assert.deepEqual(
			declared?.self_review.map((f) => f.finding),
			["production 4"],
			"from its own producer",
		);
	});
	it("un test préparé que le producteur réécrit en gardant le nom de son cas est refusé à G4, qui nomme son chemin, et le changement n’est pas accepté", async () => {
		const { state, result } = await shoutChange({
			steps: [
				{ kind: "write", path: "src/greet.js", content: LOWER_SHOUT },
				{ kind: "write", path: "test/shout.test.js", content: WEAKENED_SHOUT_TEST },
				{ kind: "complete", output: finished(["src/greet.js", "test/shout.test.js"]) },
			],
		});
		assert.ok(state.protocol?.protected_paths.includes("test/"), "the frozen protocol protects test/");
		assert.equal(state.gates.G4?.verdict, "FAIL", result.steps.join(" | "));
		assert.ok(
			state.gates.G4?.reasons.includes("protected path altered by the producer: test/shout.test.js"),
			state.gates.G4?.reasons.join(" | "),
		);
		assert.notEqual(state.outcome, "accepted", result.steps.join(" | "));
	});
	it("un test préparé que le producteur n’a pas touché n’est pas cité comme modifié hors du plan, et le même test réécrit l’est", async () => {
		const kept = await shoutChange({
			steps: [
				{ kind: "write", path: "src/greet.js", content: SHOUT_IMPL },
				{ kind: "complete", output: finished(["src/greet.js"]) },
			],
		});
		const carried = kept.state.candidate!;
		assert.ok(
			kept.state.attempts.some((a) => a.candidate?.candidate_id === carried.candidate_id),
			"the candidate was frozen",
		);
		const keptDeclared = (await kept.t.harness.report(kept.change.change_id)).implementation;
		assert.ok(keptDeclared, "the report carries what the kernel read of the plan");
		assert.deepEqual(
			keptDeclared.unplanned_paths,
			[],
			"the prepared test the candidate carries as the preparation wrote it is not the producer's",
		);
		const keptLine = await unplannedLine(kept.t, kept.change.change_id);
		assert.ok(!keptLine?.includes("test/shout.test.js"), keptLine);

		const rewritten = await shoutChange({
			steps: [
				{ kind: "write", path: "src/greet.js", content: LOWER_SHOUT },
				{ kind: "write", path: "test/shout.test.js", content: WEAKENED_SHOUT_TEST },
				{ kind: "complete", output: finished(["src/greet.js"]) },
			],
		});
		const rewrittenDeclared = (await rewritten.t.harness.report(rewritten.change.change_id)).implementation;
		assert.deepEqual(rewrittenDeclared?.unplanned_paths, ["test/shout.test.js"], "the producer rewrote it");
		const rewrittenLine = await unplannedLine(rewritten.t, rewritten.change.change_id);
		assert.ok(rewrittenLine?.includes("test/shout.test.js"), rewrittenLine);
	});
});
