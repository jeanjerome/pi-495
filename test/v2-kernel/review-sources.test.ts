import { strict as assert } from "node:assert";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import type { ArtifactRef, ObjectRef } from "../../src/contracts/v1/common.ts";
import { findNode, type ChangePage } from "../../src/application/review.ts";
import { makeHarness, type TestHarness, trackedProject } from "../helpers/harness-fixture.ts";
import { HUMAN } from "../helpers/change-fixture.ts";

const REFERENCE_LINE = "  return `Hello, ${name}`;";
const CANDIDATE_LINE = "  return `Hello, ${name}`; // greeted";
const EXTRA = "export const extra = 1;\n";

/** A producer that modifies src/greet.js and, when `extra` holds, adds src/extra.js. */
function producer(extra: boolean) {
	const writes = [
		{ kind: "write" as const, path: "src/greet.js", content: `export function greet(name) {\n${CANDIDATE_LINE}\n}\n` },
		...(extra ? [{ kind: "write" as const, path: "src/extra.js", content: EXTRA }] : []),
	];
	return {
		implement: {
			steps: [
				...writes,
				{
					kind: "complete" as const,
					output: { summary: "done", changed_paths: writes.map((w) => w.path), tests_claimed: true, notes: [] },
				},
			],
		},
	};
}

/** A ledger that records, as the candidate's `files_` index, the index it is handed instead of the one written. */
class LedgerWithCandidateIndex extends SqliteLedger {
	index: ObjectRef | null = null;
	override putArtifact(...args: Parameters<SqliteLedger["putArtifact"]>): ArtifactRef {
		const [kind, changeId, artifactId, object, producerId, at] = args;
		const recorded = artifactId.startsWith("files_") && this.index ? this.index : object;
		return super.putArtifact(kind, changeId, artifactId, recorded, producerId, at);
	}
}

async function frozenChange(t: TestHarness): Promise<string> {
	const { change } = await t.harness.start({
		project_path: trackedProject(),
		request_text: "tidy greet",
		actor: HUMAN,
	});
	await t.harness.advance(change.change_id, { max_steps: 30 });
	return change.change_id;
}

async function changesOf(t: TestHarness, changeId: string, path: string): Promise<ChangePage> {
	const review = await t.harness.openReview(changeId);
	assert.ok(review.snapshot.candidate, "the review opens on a frozen candidate");
	const node = findNode(review.snapshot.root, path);
	assert.ok(node, `${path} is in the review`);
	return review.changes(path, node.status, node.old_path);
}

const linesOf = (page: ChangePage, kind: "old" | "new"): string[] =>
	page.hunks.flatMap((h) => h.segments.flatMap((s) => (s.kind === kind ? s.lines : [])));

describe("the candidate side of a changed file is read from the dossier", () => {
	it("après retrait de la copie de travail, la page de changements de src/greet.js porte ses lignes changées et la page de contenu de src/extra.js côté candidat rend son texte", async () => {
		const t = makeHarness({ scripts: producer(true) });
		const changeId = await frozenChange(t);
		// The attempt's working copy is the only one left under the workspaces once the candidate is frozen.
		const workspaces = join(t.root, "workspaces");
		assert.ok(existsSync(workspaces), "the attempt left a working copy");
		rmSync(workspaces, { recursive: true, force: true });

		const greet = await changesOf(t, changeId, "src/greet.js");
		const extra = await (await t.harness.openReview(changeId)).content("src/extra.js", "new", 1, 100);

		assert.deepEqual(linesOf(greet, "old"), [REFERENCE_LINE], JSON.stringify(greet));
		assert.deepEqual(linesOf(greet, "new"), [CANDIDATE_LINE], JSON.stringify(greet));
		assert.equal(extra.kind, "text", JSON.stringify(extra));
		assert.deepEqual(extra.lines, ["export const extra = 1;"]);
	});

	it("une page de contenu côté candidat d'un fichier changé que files_ ne nomme pas est missing et sa note dit que le dossier n'a pas ses octets", async () => {
		const t = makeHarness({ scripts: producer(false), ledger: (path) => new LedgerWithCandidateIndex(path) });
		assert.ok(t.ledger instanceof LedgerWithCandidateIndex);
		t.ledger.index = await t.objects.putJson({});
		const changeId = await frozenChange(t);

		const page = await (await t.harness.openReview(changeId)).content("src/greet.js", "new", 1, 100);

		assert.equal(page.kind, "missing", JSON.stringify(page));
		assert.equal(page.lines.length, 0);
		assert.match(String(page.metadata.note), /the dossier does not hold the bytes of this file/);
	});
});

describe("the reference side of a changed file is read from the dossier", () => {
	it("après intégration, la page de changements de src/greet.js porte les lignes retirées du texte de la référence et les lignes ajoutées du texte du candidat", async () => {
		const project = trackedProject();
		const t = makeHarness({ scripts: producer(false), policy: { integration_enabled: true }, integration: true });
		const { change } = await t.harness.start({ project_path: project, request_text: "tidy greet", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 30 });
		const request = t.requested.at(-1);
		assert.equal(request?.interaction, "IH-11", "the owner is asked to integrate the accepted candidate");
		const answer = t.harness.answerDecision(
			change.change_id,
			{
				decision_id: request.decision_id,
				option_id: "integrate",
				free_text: null,
				reason: null,
				subject_revision: request.subject.revision,
				scope: null,
				expires_at: null,
			},
			{ actor: HUMAN, host: "tui", session_id: "s1", asserted_at: "2026-10-02T12:00:00.000Z" },
		);
		assert.equal(answer.error, null);
		const done = await t.harness.advance(change.change_id, { max_steps: 10 });
		assert.equal(done.view.change?.outcome, "integrated", done.steps.join(" | "));
		assert.match(readFileSync(join(project, "src/greet.js"), "utf8"), /greeted/, "the project carries the candidate");

		const greet = await changesOf(t, change.change_id, "src/greet.js");

		assert.deepEqual(linesOf(greet, "old"), [REFERENCE_LINE], JSON.stringify(greet));
		assert.deepEqual(linesOf(greet, "new"), [CANDIDATE_LINE], JSON.stringify(greet));
	});
});
