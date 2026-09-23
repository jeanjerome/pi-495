/**
 * V2 — a disagreement between what the manifest expected a provider to impose and what the request
 * showed is written to the dossier, never left silent (CTX-02, D-55). The manifest's imposed layers
 * are an expectation: the provider is declared to impose its block on one authentication path only,
 * so a request that shows no block is a disagreement to name, not an error, and it stops nothing.
 */
import { strict as assert } from "node:assert";
import { rmSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { GOOD_GREET, makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { compareImposedLayers, imposedLayersFor, type ObservedLayers } from "../../src/domain/imposed-layers.ts";

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

const expected = imposedLayersFor("anthropic");
const IMPOSED = expected[0]!.text;
const CONDITION = expected[0]!.condition;

const observed = (above: string[], below: string[] = [], added_by_host: string[] = []): ObservedLayers => ({
	status: "observed",
	api: "anthropic-messages",
	above_local_instructions: above,
	below_local_instructions: below,
	added_by_host,
});

describe("the manifest's expectation set against what the request showed (CTX-02, D-55)", () => {
	it("agrees when the request shows exactly the expected block above the host's prompt", () => {
		assert.deepEqual(compareImposedLayers(expected, observed([IMPOSED])), { verdict: "agrees" });
	});

	it("agrees when nothing is expected and nothing is observed (6a)", () => {
		assert.deepEqual(compareImposedLayers([], observed([])), { verdict: "agrees" });
	});

	it("does not hold what the host added against a provider's expectation", () => {
		assert.deepEqual(compareImposedLayers(expected, observed([IMPOSED], [], ["\n\n<cwd>\n/w\n</cwd>"])), {
			verdict: "agrees",
		});
	});

	it("names an expected block the request did not show, with the condition it was declared under (6b)", () => {
		assert.deepEqual(compareImposedLayers(expected, observed([])), {
			verdict: "disagrees",
			disagreements: [{ kind: "expected_not_observed", text: IMPOSED, condition: CONDITION }],
		});
	});

	it("names a block the request showed and nothing expected, with its position (6c)", () => {
		assert.deepEqual(compareImposedLayers([], observed(["a new preamble"], ["an appendix"])), {
			verdict: "disagrees",
			disagreements: [
				{ kind: "observed_not_expected", position: "above_local_instructions", text: "a new preamble" },
				{ kind: "observed_not_expected", position: "below_local_instructions", text: "an appendix" },
			],
		});
	});

	it("names a changed block by both of its texts (6c)", () => {
		assert.deepEqual(compareImposedLayers(expected, observed(["You are Claude Code."])), {
			verdict: "disagrees",
			disagreements: [
				{ kind: "expected_not_observed", text: IMPOSED, condition: CONDITION },
				{ kind: "observed_not_expected", position: "above_local_instructions", text: "You are Claude Code." },
			],
		});
	});

	it("names 495's instructions as not found, with the system texts the request carried (6e)", () => {
		const unplaced: ObservedLayers = {
			status: "local_instructions_not_found",
			api: "anthropic-messages",
			system_texts: [IMPOSED, "a rewritten prompt"],
		};
		assert.deepEqual(compareImposedLayers(expected, unplaced), {
			verdict: "disagrees",
			disagreements: [{ kind: "local_instructions_not_found", system_texts: [IMPOSED, "a rewritten prompt"] }],
		});
	});

	it("compares nothing against an observation that is missing (6d)", () => {
		assert.deepEqual(compareImposedLayers(expected, { status: "not_observed", reason: "an unknown api" }), {
			verdict: "not_compared",
		});
	});
});

describe("a disagreement is written to the dossier and stops nothing (CTX-02, D-55)", () => {
	it("a provider declared to impose its block, reached without showing it, is named at the intervention's end", async () => {
		const p = tempDir("495-proj-");
		cleanups.push(p);
		fixtureTs(p);
		initRepo(p);
		const t: TestHarness = makeHarness({
			model: { provider_id: "anthropic", model_id: "claude-x", thinking_level: "off" },
			policy: { egress: [{ provider_id: "anthropic", location: "off_machine" }] },
			scripts: {
				specify: {
					steps: [
						{ kind: "observe", observation: observed([]) },
						{ kind: "complete", output: specReport() },
					],
					tokens: 120,
				},
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
		cleanups.push(t.root);
		const { change } = await t.harness.start({ project_path: p, request_text: "greet", actor: HUMAN });
		const result = await t.harness.advance(change.change_id, { max_steps: 30 });
		assert.equal(result.stopped_because, "closed", "a disagreement stops nothing");
		const events = t.ledger.readChangeEvents(change.change_id).map((stored) => stored.event);
		const started = events.find((e) => e.type === "intervention.started" && e.role === "specify");
		assert.ok(started?.type === "intervention.started");
		const end = events.find((e) => e.type === "intervention.finished" && e.intervention_id === started.intervention_id);
		assert.ok(end?.type === "intervention.finished");
		assert.equal(end.result, "completed", "a disagreement does not end the intervention");
		assert.deepEqual(end.imposed_layers?.[0]?.compared_with_manifest, {
			verdict: "disagrees",
			disagreements: [{ kind: "expected_not_observed", text: IMPOSED, condition: CONDITION }],
		});
	});
});
