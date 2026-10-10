import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { removedAfterEach } from "../helpers/fixtures.ts";
import { runWithRecipe } from "../helpers/acceptance-recipe.ts";
import type { Evidence } from "../../src/contracts/v1/evidence.ts";

removedAfterEach();

async function runRecipe(extra: string[]): Promise<{ evidence: Evidence; digest: string; objectives: string[] }> {
	const { t, state, steps } = await runWithRecipe(extra);
	const entry = state.evidence.filter((e) => e.control_id === "acceptance-recipe").at(-1);
	assert.ok(entry, `the acceptance recipe ran on the candidate: ${steps.join(" | ")}`);
	return {
		evidence: t.ledger.getEvidence(entry.evidence_id)!,
		digest: state.candidate!.manifest_digest,
		objectives: t.agent.started.filter((m) => m.role === "review").map((m) => m.objective),
	};
}

describe("the acceptance recipe runs on the exact candidate through the controls the kernel already runs", () => {
	it("une recette sur une autre révision ou un simple compte rendu sans observations ne suffit pas", async () => {
		const green = await runRecipe([]);
		assert.equal(green.evidence.verdict, "PASS", JSON.stringify(green.evidence.limits.notes));
		assert.equal(green.evidence.subject.digest, green.digest);
		assert.equal(green.evidence.facts.candidate, green.digest, "the report names the candidate it ran on");
		assert.equal(green.evidence.facts.built_version, "f-notests@1.0.0");
		assert.equal(green.evidence.facts.entry, "node recipe.js");
		assert.deepEqual(green.evidence.facts.simulations, []);
		assert.deepEqual(green.evidence.facts.observations, [
			{ observation_id: "O1", requirement_id: "R1", observed: "HELLO, ADA", outcome: "passed" },
		]);
		assert.deepEqual(green.evidence.facts.negative_control, {
			requirement_id: "R1",
			observed: "shout is missing",
			outcome: "refused",
		});
		assert.match(green.objectives.join("\n"), /tie each promise to the code that keeps it/);
		assert.match(green.objectives.join("\n"), /O1 \(R1\)/, "the reviewer is handed the observations to link");

		const other = await runRecipe(["--other"]);
		assert.notEqual(other.evidence.verdict, "PASS", "a report about another candidate does not stand for this one");
		assert.match(other.evidence.limits.notes.join(" | "), /acceptance report names candidate sha256:1{64}/);

		const summary = await runRecipe(["--summary"]);
		assert.notEqual(summary.evidence.verdict, "PASS", "a summary without observations is not an acceptance run");
		assert.match(summary.evidence.limits.notes.join(" | "), /acceptance report observes nothing/);
	});
});
