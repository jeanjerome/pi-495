/**
 * V2 — the next increment of a program starts on the project as it stands: once an increment is
 * integrated, the next one is conducted on the tree that carries its integration commit.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DomainError } from "../../src/domain/errors.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { trackedProject } from "../helpers/harness-fixture.ts";
import { integrated, programHarness, programOf } from "../helpers/program-fixture.ts";
import { increment, threeIncrements } from "../helpers/trajectory.ts";

describe("the next increment of a program", () => {
	it("A intégré, démarrer l'incrément suivant crée le changement de B rattaché au programme et à B, dont la référence porte le commit d'intégration de A ; B annulé, l'incrément suivant est C ; le programme clos, la demande est refusée", async () => {
		const t = programHarness(true);
		const { program, change } = await t.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements(),
			actor: HUMAN,
		});
		await integrated(t, change.change_id, "A");
		const integrationOfA = t.ledger.loadChange(change.change_id)!.state.integration?.destination_after;
		assert.ok(integrationOfA, "A's integration commit is recorded");

		const b = await t.harness.startNext({ program_id: program.program_id, actor: HUMAN });
		assert.equal(b.change.program_id, program.program_id, "B's change belongs to the program");
		assert.equal(b.change.increment_id, "B", "the first ready increment in the order of the trajectory starts");
		assert.equal(
			programOf(t, program.program_id).increments.find((i) => i.increment_id === "B")?.change_id,
			b.change.change_id,
		);
		const reference = await t.harness.artifacts.reference(b.change);
		assert.equal(reference.head_commit, integrationOfA, "B starts from the tree that carries A's integration");

		t.harness.cancel(b.change.change_id, HUMAN, "the export is dropped");
		const c = await t.harness.startNext({ program_id: program.program_id, actor: HUMAN });
		assert.equal(c.change.increment_id, "C", "a blocked increment does not keep the others from starting");
		await integrated(t, c.change.change_id, "C");

		const refused = await t.harness.startNext({ program_id: program.program_id, actor: HUMAN }).then(
			() => null,
			(error: unknown) => error,
		);
		assert.ok(refused instanceof DomainError, String(refused));
		assert.equal(refused.code, "PRECONDITION_FAILED", refused.message);
		assert.match(refused.message, /no increment of program .* is ready/);

		const closing = programHarness(true);
		const done = await closing.harness.adopt({
			project_path: trackedProject(),
			trajectory: threeIncrements({ increments: [increment("A", "Common base")], global_requirements: [] }),
			actor: HUMAN,
		});
		await integrated(closing, done.change.change_id, "A");
		assert.equal(programOf(closing, done.program.program_id).closed, true);
		const closed = await closing.harness.startNext({ program_id: done.program.program_id, actor: HUMAN }).then(
			() => null,
			(error: unknown) => error,
		);
		assert.ok(closed instanceof DomainError, String(closed));
		assert.equal(closed.code, "INVALID_TRANSITION", closed.message);
		assert.match(closed.message, /is closed/);
	});
});
