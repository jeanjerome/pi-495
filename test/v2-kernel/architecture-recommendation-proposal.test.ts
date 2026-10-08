/**
 * A survey whose architecture map the owner adopted ends with a recommendation: once the reference is measured, a
 * read-only intervention proposes alternatives argued by the requirements and the owner's answers, and the owner is
 * asked to choose one through IH-05 before the survey is put to their acceptance. Maven and ArchUnit are fakes, the
 * readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Survey } from "../../src/domain/survey.ts";
import {
	ADJUST,
	CONCLUSION,
	KEEP,
	R2_STATEMENT,
	RECOMMENDATION,
	recommended,
	TEAMS,
	TEAMS_ANSWER,
	TRANSFORM,
} from "../helpers/architecture-recommendation.ts";

describe("a survey with an adopted architecture map proposes a recommendation to the owner", () => {
	it("après la mesure d'un état des lieux à la carte adoptée, une intervention en lecture seule propose une recommandation et une décision IH-05 la présente avec une issue par alternative, ask_analysis et suspend, des faits qui donnent chaque alternative avec sa nature, ses bénéfices, son coût, ses risques et l'énoncé de R2, et la recommandation A2 à part des faits, sans décision IH-10 demandée", async () => {
		const { t, agent, changeId, stopped_because, steps } = await recommended([RECOMMENDATION]);
		const state = t.ledger.loadChange(changeId)!.state;
		const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
		assert.equal(
			survey?.controls.find((c) => c.control_id === "architecture")?.findings.length,
			2,
			`the survey measured the two calls of io.demo.infra from app: ${JSON.stringify(survey?.controls)}`,
		);

		const pending = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			pending.map((d) => d.interaction),
			["IH-05"],
			`the owner is asked to choose an alternative, and nothing else: ${stopped_because}, ${steps.join(" | ")}`,
		);
		assert.equal(agent.recommendationMandates.length, 1, "one intervention proposes the recommendation");
		const [mandate] = agent.recommendationMandates;
		assert.deepEqual(
			mandate!.tools,
			["read", "ls", "find", "grep"],
			"the intervention has the read-only tools of the specification",
		);
		for (const carried of [R2_STATEMENT, TEAMS.id, TEAMS.question, TEAMS_ANSWER, "io.demo.infra.JpaOrders"])
			assert.ok(mandate!.prompt.includes(carried), `the context carries « ${carried} »:\n${mandate!.prompt}`);

		const [asked] = pending;
		assert.deepEqual(
			asked!.options.map((o) => o.id),
			["A1", "A2", "A3", "ask_analysis", "suspend"],
			"one option per alternative, another analysis with a remark, or the choice left pending",
		);
		assert.equal(asked!.allow_free_text, true, "the remark is written beside the answer");
		for (const alternative of [KEEP, ADJUST, TRANSFORM]) {
			const fact = asked!.facts.find((f) => f.startsWith(`architecture alternative ${alternative.alternative_id} `));
			assert.ok(fact, `a fact gives ${alternative.alternative_id}: ${asked!.facts.join(" | ")}`);
			for (const said of [
				alternative.nature,
				alternative.description,
				...alternative.benefits,
				alternative.cost.complexity,
				alternative.cost.migration,
				...alternative.risks,
			])
				assert.ok(fact.includes(said), `${alternative.alternative_id}: « ${said} » in ${fact}`);
		}
		const adjust = asked!.facts.find((f) => f.startsWith("architecture alternative A2 "))!;
		assert.ok(adjust.includes(`R2: ${R2_STATEMENT}`), `A2 cites R2 with its statement: ${adjust}`);
		const transform = asked!.facts.find((f) => f.startsWith("architecture alternative A3 "))!;
		assert.ok(
			transform.includes(TEAMS.question) && transform.includes(TEAMS_ANSWER),
			`A3 cites the owner's answer to ${TEAMS.id} with its question: ${transform}`,
		);

		assert.ok(asked!.recommendation?.startsWith("A2"), `the recommendation designates A2: ${asked!.recommendation}`);
		assert.ok(
			asked!.recommendation?.includes(CONCLUSION) && asked!.recommendation.includes("R2"),
			`with its conclusion, which cites R2: ${asked!.recommendation}`,
		);
		assert.ok(
			asked!.facts.every((f) => !f.includes(CONCLUSION)),
			"the recommendation stands apart from the facts",
		);
		assert.ok(
			RECOMMENDATION.alternatives.every((a) => asked!.options.some((o) => o.id === a.alternative_id)),
			"every alternative may be chosen",
		);
	});

	it("dans un état des lieux demandé en anglais, la décision IH-05 demande Which alternative should the architecture of the project take? avec une issue Choose par alternative, ask_analysis Ask for another analysis et suspend Leave the choice pending", async () => {
		const { t, changeId } = await recommended([RECOMMENDATION], undefined, "en");
		const [asked] = t.harness.pendingDecisions(changeId);
		assert.equal(asked?.interaction, "IH-05", `the owner is asked to choose an alternative: ${asked?.interaction}`);
		assert.equal(asked!.question, "Which alternative should the architecture of the project take?");
		assert.deepEqual(
			asked!.options.map((o) => [o.id, o.label]),
			[
				["A1", `Choose A1 (keep): ${KEEP.description}`],
				["A2", `Choose A2 (adjust): ${ADJUST.description}`],
				["A3", `Choose A3 (transform): ${TRANSFORM.description}`],
				["ask_analysis", "Ask for another analysis (your remark as free text)"],
				["suspend", "Leave the choice pending"],
			],
			"one option per alternative, another analysis with a remark, or the choice left pending, in English",
		);
	});
});
