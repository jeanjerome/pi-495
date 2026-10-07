/**
 * V2 — a change writes the phase identifiers that carry the name of the step, and a journal written by
 * a version that still wrote `clarifying`, `specifying`, `verification_design`… reads and resumes under
 * the new ones, without a byte of it rewritten.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { KERNEL_ACTOR } from "../../src/application/actors.ts";
import { canonicalize } from "../../src/contracts/canonical.ts";
import { replay } from "../../src/domain/change/apply.ts";
import { decide } from "../../src/domain/change/decide.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import { HUMAN, KERNEL, design, ref, tick } from "../helpers/change-fixture.ts";
import { makeHarness, reopenHarness, trackedProject, type TestHarness } from "../helpers/harness-fixture.ts";
import { type EventRow, OLD_IDS, storedRows, writtenBeforeTheRename } from "../helpers/journal-before-rename.ts";

function phasesEntered(t: TestHarness, changeId: string): string[] {
	return t.ledger
		.readChangeEvents(changeId)
		.map((e) => e.event)
		.flatMap((e) => (e.type === "phase.entered" ? [e.phase] : []));
}

/** Revises `kind` as the kernel does when the owner asks for it, which rolls the change back. */
async function revise(t: TestHarness, changeId: string, kind: "protocol" | "requirements"): Promise<void> {
	const loaded = t.ledger.loadChange(changeId)!;
	const latest = (await t.harness.artifacts.latest(loaded.state, kind))!;
	await t.harness.conducting(changeId, async () =>
		t.harness.commit(
			loaded,
			{ type: "artifact.revise", at: t.harness.now(), actor: KERNEL_ACTOR, kind, ref: latest.ref, reason: "revised" },
			t.harness.id("cor"),
		),
	);
}

/**
 * A change written by a version before the rename: conducted to its design, its protocol revised back
 * to `verification_design`, its requirements revised back to `specifying`, then paused there.
 */
async function pausedInSpecificationBeforeTheRename(): Promise<{ t: TestHarness; changeId: string; rows: EventRow[] }> {
	const p = trackedProject();
	const t = makeHarness();
	const { change } = await t.harness.start({ project_path: p, request_text: "Keep greet behaviour", actor: HUMAN });
	await t.harness.advance(change.change_id, { max_steps: 3 });
	await revise(t, change.change_id, "protocol");
	await revise(t, change.change_id, "requirements");
	t.harness.pause(change.change_id, HUMAN);
	const rows = writtenBeforeTheRename(t.root, change.change_id);
	return { t: reopenHarness(t), changeId: change.change_id, rows };
}

describe("phase identifiers carry the name of the step, and a journal written before reads under them", () => {
	it("a change conducted to its acceptance by a scripted agent enters scoping, specification, qualification, design, implementation, verifying, deciding, closed, and writes no old identifier", async () => {
		const p = trackedProject();
		const t = makeHarness();
		const { change } = await t.harness.start({ project_path: p, request_text: "Keep greet behaviour", actor: HUMAN });
		const result = await t.harness.advance(change.change_id);
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change?.outcome, "accepted");
		assert.deepEqual(phasesEntered(t, change.change_id), [
			"scoping",
			"specification",
			"qualification",
			"design",
			"implementation",
			"verifying",
			"deciding",
			"closed",
		]);
		for (const { event } of t.ledger.readChangeEvents(change.change_id)) {
			const written = canonicalize(event);
			for (const id of OLD_IDS) assert.equal(written.includes(`"${id}"`), false, `${id} in ${written}`);
		}
	});

	it("a revision of the protocol, then of the requirements, stores the return to qualification, then to specification, and no old identifier", async () => {
		const p = trackedProject();
		const t = makeHarness();
		const { change } = await t.harness.start({ project_path: p, request_text: "Keep greet behaviour", actor: HUMAN });
		await t.harness.advance(change.change_id, { max_steps: 3 });
		await revise(t, change.change_id, "protocol");
		await revise(t, change.change_id, "requirements");
		const stored = storedRows(t.root, change.change_id).map((r) => r.payload);
		const returns = stored.flatMap((payload) => {
			const event = JSON.parse(payload) as { type: string; rollback_phase?: string };
			return event.type === "artifact.revised" ? [event.rollback_phase] : [];
		});
		assert.deepEqual(returns, ["qualification", "specification"]);
		for (const payload of stored)
			for (const id of OLD_IDS) assert.equal(payload.includes(`"${id}"`), false, `${id} in ${payload}`);
	});

	it("a journal written before, paused in specifying after a revision back to verification_design, loads and lists in specification with a return to qualification, resumes to its acceptance, and keeps its bytes", async () => {
		const { t, changeId, rows } = await pausedInSpecificationBeforeTheRename();
		assert.ok(
			rows.some((r) => r.payload.includes('"phase":"specifying"')),
			"the journal carries the old identifiers",
		);
		const loaded = t.ledger.loadChange(changeId)!.state;
		assert.equal(loaded.phase, "specification");
		assert.equal(loaded.resume_point?.phase, "specification");
		assert.equal(t.harness.status(changeId).change?.phase, "specification");
		assert.equal(t.ledger.listChanges().find((c) => c.change_id === changeId)?.phase, "specification");
		const events = t.ledger.readChangeEvents(changeId).map((e) => e.event);
		const revision = events.findIndex((e) => e.type === "artifact.revised" && e.kind === "protocol");
		assert.equal(replay(events.slice(0, revision)).phase, "design", "the change had entered design");
		assert.equal(
			replay(events.slice(0, revision + 1)).phase,
			"qualification",
			"the revision returned to qualification",
		);

		t.harness.resume(changeId, HUMAN);
		const result = await t.harness.advance(changeId);
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change?.outcome, "accepted");
		const integrity = await t.ledger.verifyIntegrity((d) => t.objects.verify(d));
		assert.deepEqual(integrity.problems, []);
		assert.deepEqual(
			storedRows(t.root, changeId).slice(0, rows.length),
			rows,
			"the events written before keep their bytes",
		);
	});

	it("a design command applied to a change in specification is refused for the phase specification, allowed in design", async () => {
		const { t, changeId } = await pausedInSpecificationBeforeTheRename();
		const d = design();
		const refused = decide(
			t.ledger.loadChange(changeId)!.state,
			{ type: "gate.evaluate", gate: "G3", at: tick(), actor: KERNEL, design_ref: ref("dsg_1", d), design: d },
			DEFAULT_POLICY,
		);
		assert.ok(!refused.ok, "the design gate is refused");
		assert.equal(
			refused.error.message,
			"operation gate.evaluate is not allowed in phase specification; it is allowed in design",
		);
		assert.equal(refused.error.phase, "specification");
	});
});
