/**
 * V2 — each intervention's end record carries what was observed in the requests of its session, as a
 * fact read from the request and apart from the manifest's expectation (CTX-02, D-55). The manifest
 * is sealed before the intervention and a request payload exists only when it is sent, so what was
 * observed travels as an intervention event and lands in the ledger with the intervention's end.
 */
import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";
import type { ObservedLayers } from "../../src/domain/imposed-layers.ts";

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

const bare: ObservedLayers = {
	status: "observed",
	api: "openai-completions",
	above_local_instructions: [],
	below_local_instructions: [],
	added_by_host: ["\n\n<cwd>\n/workspace\n</cwd>"],
};
const preamble: ObservedLayers = { ...bare, above_local_instructions: ["an endpoint preamble"] };

/** The end of the change's first specification intervention, as the ledger holds it. */
async function specificationEnd(script: AgentScript): Promise<Extract<ChangeEvent, { type: "intervention.finished" }>> {
	const t: TestHarness = makeHarness({ scripts: { specify: script } });
	cleanups.push(t.root);
	const { change } = await t.harness.start({ project_path: project(), request_text: "greet", actor: HUMAN });
	await t.harness.advance(change.change_id, { max_steps: 3 });
	const events = t.ledger.readChangeEvents(change.change_id).map((stored) => stored.event);
	const started = events.find((e) => e.type === "intervention.started" && e.role === "specify");
	assert.ok(started?.type === "intervention.started", "a specification intervention started");
	const end = events.find((e) => e.type === "intervention.finished" && e.intervention_id === started.intervention_id);
	assert.ok(end?.type === "intervention.finished", "the specification intervention finished");
	return end;
}

describe("each intervention's end record carries what its requests showed (CTX-02, D-55)", () => {
	it("keeps each observation the session reported, in order, as observed in the request", async () => {
		const end = await specificationEnd({
			steps: [
				{ kind: "observe", observation: bare },
				{ kind: "observe", observation: preamble },
				{ kind: "complete", output: specReport() },
			],
			tokens: 120,
		});
		assert.deepEqual(
			end.imposed_layers?.map((record) => record.observed_in_request),
			[bare, preamble],
		);
	});

	it("says why nothing was observed when the session reported model usage, never that nothing was imposed", async () => {
		const end = await specificationEnd({ steps: [{ kind: "complete", output: specReport() }], tokens: 120 });
		assert.equal(end.imposed_layers?.length, 1);
		const observed = end.imposed_layers?.[0]?.observed_in_request;
		assert.equal(observed?.status, "not_observed");
		assert.match(observed?.status === "not_observed" ? observed.reason : "", /reported model usage/);
	});

	it("says why nothing was observed when the session reported no model usage (6g)", async () => {
		const end = await specificationEnd({ steps: [{ kind: "fail", error: "no model answered" }], tokens: 0 });
		const observed = end.imposed_layers?.[0]?.observed_in_request;
		assert.equal(observed?.status, "not_observed");
		assert.match(observed?.status === "not_observed" ? observed.reason : "", /reported no model usage/);
	});
});
