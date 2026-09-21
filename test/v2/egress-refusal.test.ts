import { strict as assert } from "node:assert";
import { join } from "node:path";
import { readFileSync, rmSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { exportChange } from "../../src/export/export-service.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { makeHarness } from "../helpers/harness-fixture.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("what a refusal for an undeclared destination leaves behind (SEC-05)", () => {
	it("blocks the change, starts no intervention, and records the refusal in the journal", async () => {
		const project = tempDir("495-egress-");
		cleanups.push(project);
		fixtureTs(project);
		initRepo(project);
		const t = makeHarness({ policy: { egress: [{ provider_id: "elsewhere", location: "off_machine" }] } });
		cleanups.push(t.root);

		const { change } = await t.harness.start({ project_path: project, request_text: "x", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 5 });

		assert.equal(result.stopped_because, "blocked");
		assert.equal(t.ledger.loadChange(change.change_id)?.state.stop_reason, "policy_denied");
		const events = t.ledger.readChangeEvents(change.change_id);
		assert.deepEqual(
			events.filter((e) => e.type.startsWith("intervention")).map((e) => e.type),
			[],
			"no intervention was opened toward a destination the policy does not declare",
		);

		// The refusal is not silent: it is journaled like every other block, which is what makes a
		// closed folder readable. A story that claims nothing is written is describing the supervisor
		// in isolation, not a harness driving a change.
		const blocked = events.filter((e) => JSON.stringify(e).includes("policy_denied"));
		assert.ok(blocked.length > 0, `the refusal left no trace: ${events.map((e) => e.type).join(", ")}`);

		// And the journal travels: the declared destinations are readable in an exported dossier.
		const dossier = await exportChange(t.ledger, t.objects, {
			change_id: change.change_id,
			destination: join(t.root, "dossier"),
			redact: true,
			now: "t",
			producer: "test",
		});
		const stream = readFileSync(join(dossier.path, "events.jsonl"), "utf8");
		assert.ok(
			stream.includes("elsewhere"),
			"the destinations a refusal names are carried into the dossier; the story must say so rather than claim the policy stays out of it",
		);
	});
});
