/**
 * A refused preparation has its suite run once more, on a disposable copy of the reference and the prepared files where
 * it may write, and its record keeps what that suite wrote; a retained preparation does not run its suite again.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { makeHarness, specReport, trackedProject, UndeletableCopies } from "../helpers/harness-fixture.ts";
import { darwinOnly, fixtureTsWithoutTests } from "../helpers/fixtures.ts";
import { HUMAN, tuiOrigin } from "../helpers/change-fixture.ts";

/** What the test reads of a preparation record: whether it was retained, and what its suite wrote when surveyed. */
interface SurveyedPreparation {
	qualified: boolean;
	suite_written?: { control_id: string; paths: string[] };
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

/** What the case of the suite writes in its copy before it judges anything. */
const WRITES_TEST_OUTPUT =
	'  try { mkdirSync("test-output/run", { recursive: true }); writeFileSync("test-output/run/a", "1"); } catch {}\n';

/** A suite whose case writes test-output/run/a and passes on the reference: it detects nothing, and is refused. */
const PASSING_TEST = `import { test } from "node:test";\nimport { mkdirSync, writeFileSync } from "node:fs";\n\ntest("R1 shout", () => {\n${WRITES_TEST_OUTPUT}});\n`;

/** A suite whose case writes test-output/run/a and fails by assertion on the reference: it is retained. */
const FAILING_TEST = `import { test } from "node:test";\nimport { strict as assert } from "node:assert";\nimport { mkdirSync, writeFileSync } from "node:fs";\nimport * as greeting from "../src/greet.js";\n\ntest("R1 shout upper-cases the greeting", () => {\n${WRITES_TEST_OUTPUT}  assert.equal(typeof greeting.shout, "function");\n  assert.equal(greeting.shout("x"), "HELLO, X");\n});\n`;

/**
 * A suite whose case closes a directory it wrote, as the code under test may, and passes on the reference: it is
 * refused.
 */
const LOCKING_TEST = `import { test } from "node:test";\nimport { chmodSync, mkdirSync, writeFileSync } from "node:fs";\n\ntest("R1 shout", () => {\n  try { mkdirSync("locked/sub", { recursive: true }); writeFileSync("locked/sub/f", "1"); chmodSync("locked/sub", 0); chmodSync("locked", 0); } catch {}\n});\n`;

/**
 * A suite whose case, run under Seatbelt, tries to keep what it writes from being removed: the immutable and
 * append-only flags, an ACL that denies deletion, a closed mode; it passes on the reference and is refused.
 */
const FLAGGING_TEST = `import { test } from "node:test";\nimport { execFileSync } from "node:child_process";\nimport { chmodSync, mkdirSync, writeFileSync } from "node:fs";\n\ntest("R1 shout", () => {\n  const tries = [\n    () => { mkdirSync("keep/sub", { recursive: true }); writeFileSync("keep/sub/f", "1"); writeFileSync("keep/g", "1"); },\n    () => execFileSync("/bin/chmod", ["+a", "everyone deny delete,delete_child", "keep/sub"]),\n    () => execFileSync("/usr/bin/chflags", ["uchg", "keep/sub/f"]),\n    () => execFileSync("/usr/bin/chflags", ["uappnd", "keep/g"]),\n    () => execFileSync("/usr/bin/chflags", ["uchg", "keep"]),\n    () => chmodSync("keep", 0),\n  ];\n  for (const t of tries) try { t(); } catch {}\n});\n`;

function preparationWriting(content: string) {
	return {
		steps: [
			{ kind: "write" as const, path: "test/shout.test.js", content },
			{
				kind: "complete" as const,
				output: { summary: "done", changed_paths: ["test/shout.test.js"], tests_claimed: false, notes: [] },
			},
		],
	};
}

describe("the survey of a refused preparation's suite", () => {
	it("le relevé de la préparation refusée porte test-output/run/a pour le contrôle unit, et celui de la préparation retenue ne porte aucun chemin écrit", async () => {
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: preparationWriting(PASSING_TEST) },
		});
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
			request_text: "add shout",
			actor: HUMAN,
		});
		const refused = await t.harness.advance(change.change_id, { max_steps: 40 });
		const [asked] = t.harness.pendingDecisions(change.change_id);
		assert.equal(asked?.interaction, "IH-04", refused.steps.join(" | "));
		const answered = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: asked.decision_id,
				option_id: "prepare",
				free_text: null,
				reason: null,
				subject_revision: asked.subject.revision,
				scope: null,
				expires_at: null,
			},
			tuiOrigin(),
		);
		assert.equal(answered.error, null, answered.error?.message);
		t.agent.scripts.set("prepare", preparationWriting(FAILING_TEST));
		const retained = await t.harness.advance(change.change_id, { max_steps: 40 });

		const records = await Promise.all(
			t.ledger
				.listArtifacts(change.change_id, "preparation")
				.filter((a) => a.ref.artifact_id.startsWith("prep_"))
				.map(
					async (a) => JSON.parse(new TextDecoder().decode((await t.objects.get(a.object))!)) as SurveyedPreparation,
				),
		);
		const refusedRecords = records.filter((r) => !r.qualified);
		const retainedRecords = records.filter((r) => r.qualified);
		assert.ok(refusedRecords.length > 0 && retainedRecords.length === 1, retained.steps.join(" | "));
		for (const record of refusedRecords) {
			assert.equal(record.suite_written?.control_id, "unit", JSON.stringify(record));
			assert.ok(record.suite_written.paths.includes("test-output/run/a"), JSON.stringify(record.suite_written));
		}
		assert.equal(retainedRecords[0]!.suite_written, undefined, JSON.stringify(retainedRecords[0]));
	});

	it("le double où la suite d'une préparation refusée est jugée et relevée est supprimé même quand elle y ferme un dossier, et la question IH-04 est posée avec le relevé de cette préparation", async () => {
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: preparationWriting(LOCKING_TEST) },
		});
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
			request_text: "add shout",
			actor: HUMAN,
		});
		const refused = await t.harness.advance(change.change_id, { max_steps: 40 });
		const [asked] = t.harness.pendingDecisions(change.change_id);
		assert.equal(asked?.interaction, "IH-04", refused.steps.join(" | "));
		const records = await Promise.all(
			t.ledger
				.listArtifacts(change.change_id, "preparation")
				.filter((a) => a.ref.artifact_id.startsWith("prep_"))
				.map(
					async (a) => JSON.parse(new TextDecoder().decode((await t.objects.get(a.object))!)) as SurveyedPreparation,
				),
		);
		assert.ok(records.length > 0, refused.steps.join(" | "));
		for (const record of records) assert.ok(record.suite_written?.paths.includes("locked"), JSON.stringify(record));
		assert.deepEqual(readdirSync(join(t.root, "workspaces")), []);
	});

	it("une copie de préparation que le système refuse de supprimer ne fait perdre aucun relevé de préparation, la question IH-04 est posée, et l'échec est dit", async () => {
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: spec }] },
			scripts: { prepare: preparationWriting(PASSING_TEST) },
			workspace: (real) => new UndeletableCopies(real, "test/shout.test.js"),
		});
		const { change } = await t.harness.start({
			project_path: trackedProject(fixtureTsWithoutTests),
			request_text: "add shout",
			actor: HUMAN,
		});
		const refused = await t.harness.advance(change.change_id, { max_steps: 40 });
		const [asked] = t.harness.pendingDecisions(change.change_id);
		assert.equal(asked?.interaction, "IH-04", refused.steps.join(" | "));
		const records = await Promise.all(
			t.ledger
				.listArtifacts(change.change_id, "preparation")
				.filter((a) => a.ref.artifact_id.startsWith("prep_"))
				.map(
					async (a) => JSON.parse(new TextDecoder().decode((await t.objects.get(a.object))!)) as SurveyedPreparation,
				),
		);
		assert.ok(records.length > 0, refused.steps.join(" | "));
		for (const record of records)
			assert.ok(record.suite_written?.paths.includes("test-output/run/a"), JSON.stringify(record));
		assert.ok(
			t.progress.some((m) => m.includes("could not be deleted") && m.includes("EBUSY")),
			t.progress.join(" | "),
		);
	});

	it(
		"sous Seatbelt, le double où la suite d'une préparation refusée est relevée est supprimé sans rien laisser derrière lui, même quand elle tente d'y poser des drapeaux, une ACL ou un mode fermé",
		darwinOnly,
		async () => {
			const t = makeHarness({
				defaultScript: { steps: [{ kind: "complete", output: spec }] },
				scripts: { prepare: preparationWriting(FLAGGING_TEST) },
				sandbox: "platform",
			});
			const { change } = await t.harness.start({
				project_path: trackedProject(fixtureTsWithoutTests),
				request_text: "add shout",
				actor: HUMAN,
			});
			try {
				const refused = await t.harness.advance(change.change_id, { max_steps: 40 });
				const [asked] = t.harness.pendingDecisions(change.change_id);
				assert.equal(asked?.interaction, "IH-04", refused.steps.join(" | "));
				assert.ok(!t.progress.some((m) => m.includes("could not be deleted")), t.progress.join(" | "));
				assert.deepEqual(readdirSync(join(t.root, "workspaces")), []);
			} finally {
				// What a refused suite left is undone so that the test tree can be removed.
				for (const command of [
					["/usr/bin/chflags", "-R", "0", t.root],
					["/bin/chmod", "-R", "-N", t.root],
					["/bin/chmod", "-R", "u+rwx", t.root],
					["/usr/bin/chflags", "-R", "0", t.root],
				])
					spawnSync(command[0] ?? "", command.slice(1), { stdio: "ignore" });
			}
		},
	);
});
