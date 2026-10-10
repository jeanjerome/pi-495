import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { removedAfterEach } from "../helpers/fixtures.ts";
import { runWithRecipe } from "../helpers/acceptance-recipe.ts";
import type { ChangeState } from "../../src/domain/change/state.ts";
import { evaluateG5 } from "../../src/domain/gates/g5.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";

removedAfterEach();

const RECIPE = "acceptance-recipe";

describe("G5 judges the acceptance recipe among the frozen obligations", () => {
	it("les tests verts ne compensent pas la recette manquante et un avis ne remplace pas IH-10", async () => {
		const { t, state } = await runWithRecipe([], { g5_human_acceptance: true });
		const candidate = state.candidate!;
		const protocol = state.protocol!;
		const policy = { ...DEFAULT_POLICY, g5_human_acceptance: true };

		// The reviewer approved, and the recipe passed: the owner's acceptance is still asked through Pi.
		assert.ok(
			state.reviews.some((r) => r.valid && r.conclusion === "approve"),
			"the model reviewer approved",
		);
		assert.equal(state.evidence.filter((e) => e.control_id === RECIPE && e.valid).at(-1)?.verdict, "PASS");
		assert.notEqual(state.outcome, "accepted", "a model's approval does not stand for the human decision");
		assert.equal(state.gates.G5?.verdict, "INDETERMINATE");
		assert.equal(state.gates.G5?.next_action, "request_decision:IH-10");
		assert.ok(
			t.requested.some((r) => r.interaction === "IH-10"),
			"the human decision is put to the owner through Pi",
		);

		const owner: ChangeState = {
			...state,
			human_decisions: [
				...state.human_decisions,
				{
					human_decision_id: "hd_owner",
					decision_id: "dec_owner",
					interaction: "IH-10",
					option_id: "accept",
					subject: { kind: "candidate", id: candidate.candidate_id, revision: 1, digest: candidate.manifest_digest },
					actor_id: "owner",
					scope: null,
					free_text: null,
					valid: true,
					recorded_at: "2026-10-10T00:00:00.000Z",
				},
			],
		};
		assert.equal(evaluateG5(owner, protocol, candidate, policy).verdict, "PASS", "the complete set accepts");

		const withoutRecipe: ChangeState = { ...owner, evidence: owner.evidence.filter((e) => e.control_id !== RECIPE) };
		assert.ok(
			withoutRecipe.evidence.some((e) => e.control_id === "unit" && e.valid && e.verdict === "PASS"),
			"the tests stay green",
		);
		const missing = evaluateG5(withoutRecipe, protocol, candidate, policy);
		assert.notEqual(missing.verdict, "PASS", "green tests do not stand for the missing acceptance run");
		assert.ok(missing.missing.includes(`recipe:${RECIPE}`), missing.missing.join(", "));
		assert.match(missing.reasons.join(" | "), /acceptance recipe acceptance-recipe was not run on the candidate/);

		const elsewhere: ChangeState = {
			...owner,
			evidence: owner.evidence.map((e) =>
				e.control_id === RECIPE ? { ...e, subject_digest: `sha256:${"1".repeat(64)}` } : e,
			),
		};
		const foreign = evaluateG5(elsewhere, protocol, candidate, policy);
		assert.notEqual(foreign.verdict, "PASS", "the acceptance run of another candidate does not stand for this one");
		assert.ok(foreign.missing.includes(`recipe:${RECIPE}`));

		const exhausted: ChangeState = {
			...owner,
			budgets: { ...owner.budgets, attempts_used: owner.budgets.max_attempts },
			evidence: owner.evidence.map((e) => (e.control_id === RECIPE ? { ...e, verdict: "FAIL" as const } : e)),
		};
		const failed = evaluateG5(exhausted, protocol, candidate, policy);
		assert.equal(failed.verdict, "FAIL", "an exhausted budget does not erase a failed acceptance run");
		assert.equal(failed.next_action, "stop:attempts_exhausted");
		assert.ok(failed.failed_requirements.includes(`recipe:${RECIPE}`));
	});
});
