/**
 * What a change has consumed so far, as its status reports it: the tokens its interventions used and
 * the amount the host put on them, never presented as billed.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { statusView } from "../../src/application/views.ts";
import { formatConsumption } from "../../src/presentation/structured/text.ts";
import { KERNEL, Runner, tick } from "../helpers/change-fixture.ts";

function finishPriced(r: Runner, interventionId: string, tokens: number, usd: number): void {
	r.run({
		type: "intervention.start",
		at: tick(),
		actor: KERNEL,
		intervention_id: interventionId,
		role: "implement",
		attempt_id: "att_1",
		model: { provider_id: "anthropic", model_id: "claude-sonnet-5", thinking_level: "medium", location: "off_machine" },
		profile_id: "implement",
		profile_qualified: true,
	});
	r.run({
		type: "intervention.finish",
		at: tick(),
		actor: KERNEL,
		intervention_id: interventionId,
		result: "completed",
		counters: { tool_calls: 2, duration_ms: 1000, tokens_known: tokens, delegations: 0 },
		detail: null,
		cost: { usd, unknown_reason: null, basis: "host_catalogue", subscription: true },
		imposed_layers: [],
	});
}

describe("the consumption a change's status reports", () => {
	it("sums the tokens of every intervention and the amounts the host put on them", () => {
		const r = new Runner().toImplementing().implement("int_1");
		finishPriced(r, "int_2", 38_100, 0.0301);
		finishPriced(r, "int_3", 115_600, 0.0777);
		const consumption = statusView(null, r.s).change!.consumption;
		assert.equal(consumption.tokens, 100 + 38_100 + 115_600);
		assert.equal(Math.round(consumption.usd! * 10_000), 1078);
		assert.equal(consumption.subscription, true);
		assert.equal(formatConsumption(consumption, "en"), "153.8k tokens · ~$0.11 (sub)");
		assert.equal(formatConsumption(consumption, "fr"), "153,8 k jetons · ~0,11 $ (abonnement)");
	});

	it("names no amount when the host put none on any intervention", () => {
		const r = new Runner().toImplementing().implement("int_1");
		const consumption = statusView(null, r.s).change!.consumption;
		assert.deepEqual(consumption, { tokens: 100, usd: null, subscription: false });
		assert.equal(formatConsumption(consumption, "en"), "100 tokens");
	});

	it("says nothing before any intervention has used a token", () => {
		const r = new Runner().toImplementing();
		assert.equal(formatConsumption(statusView(null, r.s).change!.consumption, "en"), "");
	});
});
