/**
 * A verification is a repeat only within the change that ran it.
 *
 * The operations of every change of a dossier share one register. Two changes whose producers write
 * the same file reach the same candidate at the same revision, so a key naming only the candidate and
 * the revision would make the second change's verification a repeat of the first's.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { makeHarness, type TestHarness, trackedProject } from "../helpers/harness-fixture.ts";

const GREET = "export function greet(name) {\n  return `Hello, ${name}`; // tidied\n}\n";
const writesGreet: AgentScript = {
	steps: [
		{ kind: "write", path: "src/greet.js", content: GREET },
		{
			kind: "complete",
			output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
		},
	],
};

/** The verification the change opened: its key, and the operation the register holds under it. */
function verificationOf(t: TestHarness, changeId: string) {
	const opened = t.ledger
		.readChangeEvents(changeId)
		.map((e) => e.event)
		.find(
			(e): e is Extract<ChangeEvent, { type: "operation.opened" }> =>
				e.type === "operation.opened" && e.kind === "verification",
		);
	assert.ok(opened, `${changeId} opened no verification`);
	return { key: opened.idempotency_key, operation: t.ledger.getOperationByKey(opened.idempotency_key) };
}

describe("two changes of one dossier whose candidates are identical (VER-03)", () => {
	it("deux changements d'un dossier dont les candidats sont identiques vérifient chacun le leur : B inscrit ses preuves et se clôt accepté, aucune étape ne nomme OPERATION_ACTIVE, le registre porte une vérification pour A et une pour B, et une seconde ouverture sous la clé de A, dans A, est refusée en nommant l'opération de A", async () => {
		const p = trackedProject();
		const t = makeHarness({ scripts: { implement: writesGreet } });

		const a = (await t.harness.start({ project_path: p, request_text: "Tidy greet", actor: HUMAN })).change;
		const first = await t.harness.advance(a.change_id);
		assert.equal(first.stopped_because, "closed", first.steps.join(" | "));
		assert.equal(first.view.change!.outcome, "accepted");

		const b = (await t.harness.start({ project_path: p, request_text: "Tidy greet", actor: HUMAN })).change;
		const second = await t.harness.advance(b.change_id);
		assert.equal(
			second.steps.some((s) => s.includes("OPERATION_ACTIVE")),
			false,
			`no step of B names OPERATION_ACTIVE: ${second.steps.join(" | ")}`,
		);
		assert.equal(second.stopped_because, "closed", second.steps.join(" | "));
		assert.equal(second.view.change!.outcome, "accepted", "B closes accepted");
		assert.equal(
			t.ledger.loadChange(b.change_id)!.state.candidate!.manifest_digest,
			t.ledger.loadChange(a.change_id)!.state.candidate!.manifest_digest,
			"the two candidates are identical",
		);
		assert.ok(
			t.ledger.listEvidence(b.change_id).some((e) => e.subject.kind === "candidate"),
			"B records the evidence of its own verification",
		);

		const ofA = verificationOf(t, a.change_id);
		const ofB = verificationOf(t, b.change_id);
		assert.equal(ofA.operation?.aggregate_id, a.change_id, "the register holds a verification for A");
		assert.equal(ofB.operation?.aggregate_id, b.change_id, "the register holds a verification for B");

		const loaded = t.ledger.loadChange(a.change_id)!;
		const repeat: ChangeEvent = {
			type: "operation.opened",
			at: "2026-10-03T12:00:00.000Z",
			actor: KERNEL_ACTOR,
			operation_id: "op_repeat",
			kind: "verification",
			idempotency_key: ofA.key,
		};
		assert.throws(
			() => t.ledger.appendChange(a.change_id, loaded.revision, [repeat], { correlation_id: "cor_repeat" }),
			(e: Error) =>
				e.message.includes("already holds the idempotency key") && e.message.includes(ofA.operation!.operation_id),
			"a second verification of A under A's key is refused, naming A's operation",
		);
	});
});
