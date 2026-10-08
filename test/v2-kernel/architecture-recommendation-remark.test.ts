/**
 * The owner asks for another analysis of the architecture with a remark: a new read-only intervention receives the
 * previous recommendation and the remark, and its recommendation, checked like the first, is presented by a new
 * IH-05 with the same options. Maven and ArchUnit are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { answerMap } from "../helpers/architecture-survey.ts";
import { ADJUST, KEEP, RECOMMENDATION, recommended, TRANSFORM } from "../helpers/architecture-recommendation.ts";

const REMARK = "deux équipes ne justifient pas deux modules";

/** The second analysis drops the module per team: keep, or adjust by a port of payment. */
const SECOND = { ...RECOMMENDATION, alternatives: [KEEP, ADJUST] };

describe("the owner asks for another analysis of the architecture with a remark", () => {
	it("demander une autre analyse avec la remarque deux équipes ne justifient pas deux modules ouvre une seconde intervention dont le contexte porte la recommandation précédente et la remarque, et une nouvelle décision IH-05 présente sa recommandation avec une issue par alternative, ask_analysis et suspend", async () => {
		const { t, agent, changeId } = await recommended([RECOMMENDATION, SECOND]);
		const [first] = t.harness.pendingDecisions(changeId);
		assert.equal(first?.interaction, "IH-05", "the first recommendation is presented");
		answerMap(t, changeId, "ask_analysis", REMARK);
		const after = await t.harness.advance(changeId, { max_steps: 40 });

		assert.equal(
			agent.recommendationMandates.length,
			2,
			`a second intervention proposes a recommendation: ${after.stopped_because}, ${after.steps.join(" | ")}`,
		);
		const [, second] = agent.recommendationMandates;
		assert.deepEqual(second!.tools, ["read", "ls", "find", "grep"], "it is read-only");
		assert.ok(
			second!.prompt.includes(TRANSFORM.description) && second!.prompt.includes('"alternative_id": "A3"'),
			`its context carries the previous recommendation: ${second!.prompt}`,
		);
		assert.ok(
			second!.prompt.includes(`The owner's remark: ${REMARK}`),
			`its context carries the owner's remark: ${second!.prompt}`,
		);

		const pending = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			pending.map((d) => d.interaction),
			["IH-05"],
			"a new IH-05 presents the second recommendation",
		);
		assert.notEqual(pending[0]!.decision_id, first.decision_id, "a new decision");
		assert.deepEqual(
			pending[0]!.options.map((o) => o.id),
			["A1", "A2", "ask_analysis", "suspend"],
			"one option per alternative of the second recommendation, ask_analysis and suspend",
		);
	});
});
