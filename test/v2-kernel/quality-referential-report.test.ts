/**
 * The report of a survey whose quality referential the owner adopted: the survey section names each rule
 * with its oracle, its threshold, its source and its adoption date, and ranges each violation under the
 * rule that measures it.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answer, GRADER, lineOf, qualityProject, surveyed } from "../helpers/quality-survey.ts";

describe("the report of a survey whose quality referential was adopted", () => {
	it("le rapport d'un état des lieux au référentiel adopté nomme chaque règle avec son oracle, son seuil, sa source et sa date d'adoption, et la violation de complexité sous CyclomaticComplexity", async () => {
		const { t, changeId } = await surveyed(qualityProject());
		answer(t, changeId, "adopt_referential");
		await t.harness.advance(changeId, { max_steps: 40 });
		const adoption = t.ledger
			.loadChange(changeId)!
			.state.human_decisions.find((d) => d.option_id === "adopt_referential");
		assert.ok(adoption, "the owner adopted the referential");
		const adoptedOn = adoption.recorded_at.slice(0, 10);

		const report = await t.harness.report(changeId);
		const referential = report.survey?.referential;
		assert.ok(referential, "the survey section names the adopted referential");
		assert.equal(referential.adopted_on, adoptedOn, "with its adoption date");
		assert.deepEqual(
			referential.rules.map((r) => [r.rule_id, r.control_id]),
			[
				["CyclomaticComplexity", "pmd"],
				["CognitiveComplexity", "pmd"],
				["UnusedPrivateMethod", "pmd"],
				["UnusedPrivateField", "pmd"],
				["UnusedLocalVariable", "pmd"],
				["CPD", "cpd"],
			],
			"each rule with its oracle",
		);
		for (const rule of referential.rules) {
			assert.ok(rule.threshold.length > 0, `${rule.rule_id}: its threshold`);
			assert.match(rule.source, /^[a-z.-]+\.[a-z]+\/\S+$/, `${rule.rule_id}: its source`);
		}
		const under = (ruleId: string) => referential.rules.find((r) => r.rule_id === ruleId)?.findings ?? [];
		const complexity = `${GRADER}:${lineOf("int grade(")}`;
		assert.ok(
			under("CyclomaticComplexity").some((f) => f.path === GRADER && f.message.includes(complexity)),
			`the complexity violation is under CyclomaticComplexity: ${JSON.stringify(referential.rules)}`,
		);
		assert.ok(
			under("UnusedPrivateMethod").some((f) => f.message.includes(`${GRADER}:${lineOf("int never(")}`)),
			"the dead code is under UnusedPrivateMethod",
		);
		assert.equal(under("CPD").length, 1, "the duplication is under CPD");
		assert.deepEqual(under("CognitiveComplexity"), [], "a rule nothing violates ranges nothing");

		for (const [language, labels] of [
			["en", ["threshold:", "source:", "adopted on"]],
			["fr", ["seuil :", "source :", "adoptée le"]],
		] as const) {
			const text = formatReport(report, language);
			const section = text.slice(text.indexOf("CyclomaticComplexity"));
			const next = section.indexOf("CognitiveComplexity");
			assert.ok(next > 0, text);
			const cyclomatic = section.slice(0, next);
			const rule = referential.rules[0]!;
			for (const part of ["pmd", adoptedOn, rule.threshold, rule.source, complexity, ...labels])
				assert.ok(
					cyclomatic.includes(part),
					`${language}: ${part} under CyclomaticComplexity in the text: ${cyclomatic}`,
				);
		}
	});
});
