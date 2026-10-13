/**
 * The producer runs, to check itself, what the kernel will run on its candidate. The mutation control of a target
 * talks to its own worker processes over the loopback interface, so the producer's sandbox grants that interface and
 * no other host; every other role keeps the network closed.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { HUMAN } from "../helpers/change-fixture.ts";
import { removedAfterEach } from "../helpers/fixtures.ts";
import { GOOD_GREET, makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

removedAfterEach();

describe("the network each role's sandbox grants", () => {
	it("given a change conducted to its acceptance, then the producer's sandbox grants the loopback interface and every other role's closes the network", async () => {
		const t = makeHarness({
			defaultScript: { steps: [{ kind: "complete", output: specReport() }] },
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greet.js", content: GOOD_GREET },
						{
							kind: "complete",
							output: { summary: "done", changed_paths: ["src/greet.js"], tests_claimed: true, notes: [] },
						},
					],
				},
			},
		});
		const { change } = await t.harness.start({
			project_path: trackedProject(),
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id);

		const networks = (role: string) => t.agent.started.filter((m) => m.role === role).map((m) => m.profile.network);
		assert.deepEqual(networks("implement"), ["loopback"], "the producer can run the mutation control it is judged by");
		const others = [...new Set(t.agent.started.map((m) => m.role))].filter((role) => role !== "implement");
		assert.ok(others.includes("specify"), `roles run: ${others.join(", ")}`);
		for (const role of others)
			assert.ok(
				networks(role).every((n) => n === "denied"),
				`${role}: ${networks(role)}`,
			);
	});
});
