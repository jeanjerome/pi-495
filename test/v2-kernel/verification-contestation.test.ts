import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { TestHarness } from "../helpers/harness-fixture.ts";
import { removedAfterEach } from "../helpers/fixtures.ts";
import {
	CONTESTATION_OBSERVATION,
	CONTESTED_CASE,
	WRONG_TEST,
	conductContestedChange,
	examining,
	implementing,
	preparing,
} from "../helpers/contested-change.ts";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";

removedAfterEach();

/** The preparation froze a case that asserts what R1 does not say, the producer contests it, and `review` examines it. */
async function contested(review: AgentScript, budgets: Partial<typeof DEFAULT_POLICY.budgets> = {}) {
	const { t, result, changeId } = await conductContestedChange(
		{ prepare: [preparing(WRONG_TEST)], implement: [implementing(true)], review: [review] },
		{ budgets },
	);
	return { t, result, state: t.ledger.loadChange(changeId)!.state };
}

function roles(t: TestHarness): string[] {
	return t.agent.started.map((m) => m.role);
}

describe("the examination of a contested frozen test", () => {
	it("le signalement seul ne rouvre pas les tests et l’examen épuisé s’arrête avec une issue explicite", async () => {
		const { t, result, state } = await contested({
			steps: [{ kind: "complete", output: { finding: "perhaps" }, output_valid: false }],
		});
		assert.deepEqual(
			state.contestations?.map((c) => [c.requirement_id, c.case_name, c.observation, c.finding]),
			[["R1", CONTESTED_CASE, CONTESTATION_OBSERVATION, null]],
			"the kernel keeps the producer's signal, reproduced on the frozen candidate",
		);
		const reproduction = state.evidence.find(
			(e) => e.evidence_id === state.contestations?.[0]?.reproduction.evidence_id,
		);
		assert.equal(reproduction?.verdict, "FAIL", "the kernel's own run of the frozen control reproduces it");
		assert.equal(reproduction?.subject_digest, state.candidate?.manifest_digest);

		const examinations = t.agent.started.filter((m) => m.role === "review");
		assert.equal(
			examinations.length,
			DEFAULT_POLICY.budgets.max_technical_retries + 1,
			`a distinct examination, bounded by the retry budget: ${roles(t).join(", ")}`,
		);
		assert.deepEqual(roles(t).filter((r) => r === "prepare").length, 1, "the signal alone opens no new preparation");
		assert.deepEqual(
			state.gates.G2?.evaluated.protocol,
			state.protocol?.ref.content_digest,
			"the protocol frozen at G2 is still the one in force",
		);
		assert.ok(
			state.protocol?.protected_paths.some((p) => p.startsWith("test")),
			"the frozen test stays protected",
		);

		assert.equal(result.stopped_because, "blocked", result.steps.join(" | "));
		assert.equal(state.outcome, "pending", "the exhausted examination accepts nothing");
		assert.notEqual(state.gates.G5?.verdict, "PASS");
		assert.match(
			state.stop_detail ?? "",
			/contestation ctt_\w+/,
			"the stop names the contestation it could not settle",
		);
		assert.match(state.stop_detail ?? "", /exhausted/, "the stop says the examination ran out of tries");
		assert.equal(
			t.ledger.readChangeEvents(state.change_id).some(({ event }) => event.type === "artifact.revised"),
			false,
			"nothing the change adopted is revised",
		);
	});

	it("une contestation jugée infondée laisse protocole et tests identiques et renvoie à la correction du code", async () => {
		const { t, state } = await contested(
			{
				steps: [
					{ kind: "complete", output: { finding: "unfounded", reasons: "the case asserts the greeting R1 asks for" } },
				],
			},
			{ max_attempts: 2 },
		);
		assert.equal(state.contestations?.[0]?.finding, "unfounded", "the examiner's finding is recorded");
		const events = t.ledger.readChangeEvents(state.change_id).map(({ event }) => event);
		assert.equal(
			events.filter((e) => e.type === "protocol.frozen").length,
			1,
			"the protocol is frozen once, and stays the one in force",
		);
		assert.equal(
			events.some((e) => e.type === "artifact.revised"),
			false,
			"the tests it froze stay as they were",
		);
		assert.equal(roles(t).filter((r) => r === "prepare").length, 1, "the rejected contestation opens no preparation");
		assert.ok(state.attempts.length >= 2, "the code is corrected in a new attempt");
		const judged = state.attempts[0]!.attempt_id;
		const feedback = await t.harness.artifacts.read<string>({ artifact_id: `fb_${judged}`, revision: 1 });
		assert.match(feedback, new RegExp(`${CONTESTED_CASE}.*found unfounded`), "the correction is told the case stands");
		assert.match(feedback, /the frozen protocol stands/);
	});

	it("l’examinateur reçoit le cas contesté, l’exigence qu’il vérifie et l’objection du producteur", async () => {
		const { t } = await contested(examining("unfounded", "the case asserts the greeting R1 asks for"), {
			max_attempts: 2,
		});
		const examination = t.agent.started.find((m) => m.output_schema === "contestation-finding");
		assert.equal(examination?.role, "review", "the examiner is a reviewer, not the producer");
		assert.deepEqual(
			examination.tools.filter((tool) => ["write", "edit", "bash"].includes(tool)),
			[],
			`the examiner is given no tool that writes or runs: ${examination.tools.join(", ")}`,
		);
		assert.deepEqual(examination.profile.write_paths, [], "the examiner's sandbox writes nowhere");
		assert.ok(examination.objective.includes(`"${CONTESTED_CASE}" of requirement R1`), examination.objective);
		assert.ok(
			examination.objective.includes("shout(name) returns greet(name) upper-cased"),
			"the requirement it verifies",
		);
		assert.ok(examination.objective.includes(CONTESTATION_OBSERVATION), "the producer's objection");
	});
});
