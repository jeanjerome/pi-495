import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { findNode } from "../../src/application/review.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTs, initRepo, removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { makeHarness, type TestHarness } from "../helpers/harness-fixture.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-special-complete-", cleanups);
});

/** A tested project whose reference carries `a.txt` and the named pipe `pipe.fifo`, with its candidate past G4. */
async function judgedWithPipe(): Promise<{ t: TestHarness; changeId: string }> {
	const project = join(root, "project");
	fixtureTs(project);
	writeFiles(project, { "a.txt": "a\n" });
	execFileSync("mkfifo", [join(project, "pipe.fifo")]);
	initRepo(project);
	const t = makeHarness({
		policy: { budgets: { max_attempts: 1 } },
		scripts: {
			implement: {
				steps: [
					{ kind: "write", path: "a.txt", content: "changed\n" },
					{
						kind: "complete",
						output: { summary: "done", changed_paths: ["a.txt"], tests_claimed: true, notes: [] },
					},
				],
			},
		},
	});
	const { change } = await t.harness.start({ project_path: project, request_text: "tidy", actor: HUMAN });
	await t.harness.advance(change.change_id, { max_steps: 40 });
	return { t, changeId: change.change_id };
}

describe("a special file leaves the observation of a candidate complete (§9.1, UX-10)", () => {
	it("un projet portant un tube nommé, dont l'agent ne modifie que a.txt, passe G4 sans raison qui dise l'observation incomplète", async () => {
		const { t, changeId } = await judgedWithPipe();

		const events = t.ledger.readChangeEvents(changeId).map((e) => e.event);
		const g4 = events.flatMap((e) => (e.type === "gate.decided" && e.decision.gate === "G4" ? [e.decision] : []));
		assert.equal(
			g4.some((d) => d.reasons.some((r) => r.includes("observation incomplete"))),
			false,
			JSON.stringify(g4),
		);
		assert.deepEqual(
			g4.map((d) => d.verdict),
			["PASS"],
			JSON.stringify(g4),
		);
		assert.ok(
			events.some((e) => e.type === "operation.opened" && e.kind === "verification"),
			"the change goes on to verification",
		);
	});
	it("la revue du candidat d'un projet portant un tube nommé ne se dit pas incomplète, et la page de pipe.fifo n'a pas de texte et ses métadonnées disent special", async () => {
		const { t, changeId } = await judgedWithPipe();

		const review = await t.harness.openReview(changeId);

		assert.ok(review.snapshot.candidate, "the review opens on a frozen candidate");
		assert.equal(review.snapshot.complete, true, JSON.stringify(review.snapshot.limits));
		assert.equal(findNode(review.snapshot.root, "pipe.fifo")?.status, "special");
		const page = await review.content("pipe.fifo", "new", 1, 100);
		assert.notEqual(page.kind, "text");
		assert.deepEqual(page.lines, []);
		assert.equal(page.metadata.kind, "special", JSON.stringify(page));
	});
});
