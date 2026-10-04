import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { makeHarness, trackedProject } from "../helpers/harness-fixture.ts";
import { HUMAN } from "../helpers/change-fixture.ts";

const EXHAUSTED =
	"blocked: execution_error — BUDGET_EXHAUSTED: increment duration budget exhausted; a raised policy.budgets.increment_ms takes effect in a new session";

describe("the stop on an exhausted increment duration budget names what lifts it", () => {
	it("stops blocked under increment_ms 0, and a resume in the same session stops again on the same named exit", async () => {
		const t = makeHarness({ policy: { budgets: { increment_ms: 0 } } });
		const { change } = await t.harness.start({
			project_path: trackedProject(),
			request_text: "Keep greet behaviour, tidy the implementation",
			actor: HUMAN,
		});
		await t.harness.advance(change.change_id, { max_steps: 20 });
		const stopped = t.harness.status(change.change_id).change;
		assert.equal(stopped?.status, "blocked");
		assert.equal(stopped?.next_action, EXHAUSTED);

		assert.equal(t.harness.resume(change.change_id, HUMAN).change?.status, "ready");
		await t.harness.advance(change.change_id, { max_steps: 20 });
		const again = t.harness.status(change.change_id).change;
		assert.equal(again?.status, "blocked");
		assert.match(again?.next_action ?? "", /policy\.budgets\.increment_ms/);
		assert.match(again?.next_action ?? "", /takes effect in a new session/);
	});
});
