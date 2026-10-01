import { strict as assert } from "node:assert";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import type { ArtifactRef } from "../../src/contracts/v1/common.ts";
import { makeHarness, specificationRounds, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

function project(): string {
	const p = tempDir("495-proj-");
	cleanups.push(p);
	fixtureTs(p);
	initRepo(p);
	return p;
}
function track(t: TestHarness): TestHarness {
	cleanups.push(t.root);
	return t;
}

const IMPLEMENTS_GREET = {
	implement: {
		steps: [
			{
				kind: "write" as const,
				path: "src/greet.js",
				content: "export function greet(name) {\n  return `Hello, ${name}`; // tidied\n}\n",
			},
			{
				kind: "complete" as const,
				output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
			},
		],
	},
};

/** A ledger that never records the index of the candidate's files: the reader finds no such artifact. */
class LedgerWithoutCandidateFiles extends SqliteLedger {
	override putArtifact(...args: Parameters<SqliteLedger["putArtifact"]>): ArtifactRef {
		const [, , artifactId, object] = args;
		if (!artifactId.startsWith("files_")) return super.putArtifact(...args);
		return { artifact_id: artifactId, revision: 1, content_digest: object.digest, schema_version: 1 };
	}
}

/** Answers every question put to the owner since the last call. */
function answerer(t: TestHarness, changeId: string): () => void {
	let answered = 0;
	return () => {
		for (const req of t.requested.slice(answered)) {
			const done = t.harness.answerDecision(
				changeId,
				{
					decision_id: req.decision_id,
					option_id: "answer",
					free_text: `réponse à ${req.question}`,
					reason: null,
					subject_revision: req.subject.revision,
					scope: null,
					expires_at: null,
				},
				{ actor: HUMAN, host: "tui", session_id: "s1", asserted_at: "2026-10-01T12:00:00.000Z" },
			);
			assert.equal(done.error, null);
		}
		answered = t.requested.length;
	};
}

/** Advances one step at a time until the frozen candidate waits for its verification. */
async function untilVerifying(t: TestHarness, changeId: string): Promise<void> {
	for (let i = 0; i < 40; i++) {
		const state = t.ledger.loadChange(changeId)!.state;
		if (state.phase === "verifying") return;
		const result = await t.harness.advance(changeId, { max_steps: 1 });
		assert.notEqual(result.stopped_because, "blocked", result.steps.join(" | "));
	}
	assert.fail("the change never reached the verification");
}

/** Overwrites the bytes the store holds for this artifact, keeping the address the ledger records. */
function alter(t: TestHarness, artifactId: string): string {
	const stored = t.ledger.getArtifact({ artifact_id: artifactId, revision: 1 });
	assert.ok(stored, `${artifactId} is recorded`);
	const path = t.objects.pathFor(stored.object.digest);
	writeFileSync(path, `${readFileSync(path, "utf8")} `);
	return stored.object.digest;
}

describe("an altered piece of evidence a decision reads stops the change instead of being read as absent (RM-070)", () => {
	it("un changement dont l'objet de `files_<candidat>` est altéré est arrêté, et le détail de l'arrêt nomme EVIDENCE_STALE et l'empreinte de l'objet", async () => {
		const t = track(makeHarness({ scripts: IMPLEMENTS_GREET }));
		const { change } = await t.harness.start({ project_path: project(), request_text: "tidy greet", actor: HUMAN });
		await untilVerifying(t, change.change_id);
		const candidateId = t.ledger.loadChange(change.change_id)!.state.candidate!.candidate_id;
		const digest = alter(t, `files_${candidateId}`);

		const result = await t.harness.advance(change.change_id, { max_steps: 30 });

		assert.equal(result.stopped_because, "blocked", result.steps.join(" | "));
		const detail = t.ledger.loadChange(change.change_id)!.state.stop_detail ?? "";
		assert.ok(detail.includes("EVIDENCE_STALE"), detail);
		assert.ok(detail.includes(digest), detail);
	});

	it("un changement dont `files_<candidat>` n'existe pas n'est pas arrêté par le calcul des lignes introduites", async () => {
		const introduced: Record<string, readonly number[]>[] = [];
		const t = track(
			makeHarness({
				scripts: IMPLEMENTS_GREET,
				ledger: (path) => new LedgerWithoutCandidateFiles(path),
				controls: (real) => ({
					runControl: async (invocation, signal) => {
						if (invocation.subject.kind === "candidate" && invocation.introduced_lines)
							introduced.push(invocation.introduced_lines);
						return real.runControl(invocation, signal);
					},
				}),
			}),
		);
		const { change } = await t.harness.start({ project_path: project(), request_text: "tidy greet", actor: HUMAN });

		const result = await t.harness.advance(change.change_id, { max_steps: 40 });

		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change!.outcome, "accepted");
		assert.ok(introduced.length > 0, "the candidate was judged with introduced lines");
		for (const lines of introduced)
			assert.equal(lines["src/greet.js"], undefined, "the modified file has no introduced line without its bytes");
	});

	it("un changement dont l'objet d'un rapport de spécification antérieur est altéré est arrêté à la relecture des rapports, et le détail de l'arrêt nomme EVIDENCE_STALE", async () => {
		const first = { id: "q1", question: "400 ou 422 ?", material: true };
		const second = { id: "q2", question: "quel message ?", material: true };
		const bound = (id: string) => ({ question_id: id, observable: true, requirement_ids: ["R1"] });
		const t = track(makeHarness());
		specificationRounds(t, [
			specReport({ questions: [first] }),
			specReport({ questions: [first, second], answers: [bound(first.id)] }),
			specReport({ answers: [bound(first.id), bound(second.id)] }),
		]);
		const { change } = await t.harness.start({ project_path: project(), request_text: "x", actor: HUMAN });
		const answerPending = answerer(t, change.change_id);
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerPending();
		assert.equal((await t.harness.advance(change.change_id)).stopped_because, "decision_required");
		answerPending();
		const prior = t.ledger.loadChange(change.change_id)!.state.proposals.diagnostic![0]!;
		const digest = alter(t, prior.artifact_id);

		const result = await t.harness.advance(change.change_id, { max_steps: 30 });

		assert.equal(result.stopped_because, "blocked", result.steps.join(" | "));
		const state = t.ledger.loadChange(change.change_id)!.state;
		assert.equal(state.phase, "clarifying", "the change stops where the specification reports are reread");
		const detail = state.stop_detail ?? "";
		assert.ok(detail.includes("EVIDENCE_STALE"), detail);
		assert.ok(detail.includes(digest), detail);
	});
});
