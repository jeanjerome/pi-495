/**
 * The owner's answer to the recommendation is recorded and presented: choosing an alternative records it with its
 * date, leaving the choice pending records none, and either way the survey goes to its acceptance; the survey section
 * of the report presents the recommendation under the map, in English and in French. No verdict changes and the
 * project is not modified. Maven and ArchUnit are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Survey } from "../../src/domain/survey.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answerMap } from "../helpers/architecture-survey.ts";
import {
	ADJUST,
	KEEP,
	ORDER_REPOSITORY,
	ORDER_SERVICE,
	R2_STATEMENT,
	RECOMMENDATION,
	recommended,
	TRANSFORM,
} from "../helpers/architecture-recommendation.ts";
import { treeDigest } from "../helpers/quality-survey.ts";

const DIRECT_CALL = "appel direct de l'infrastructure depuis l'application";

const REVIEWED = {
	...RECOMMENDATION,
	review: [
		{ kind: "anti_pattern", name: DIRECT_CALL, hints: [{ path: ORDER_SERVICE, line: 7, says: "a direct call" }] },
		{ kind: "pattern", name: "repository", hints: [{ path: ORDER_REPOSITORY, line: 3, says: "a port" }] },
	],
};

const HEADINGS = {
	fr: {
		map: "Carte d'architecture adoptée",
		recommendation: "Recommandation d'architecture",
		findings: "Constats:",
		chosen: (on: string) => `le propriétaire a choisi A2 le ${on}`,
		pending: "le propriétaire a laissé le choix en suspens",
		review: "revue de patterns",
		set: { chosen: "choisie", discarded: "écartée" },
		natures: { keep: "conserver", adjust: "ajuster", transform: "transformer" },
	},
	en: {
		map: "Adopted architecture map",
		recommendation: "Architecture recommendation",
		findings: "Findings:",
		chosen: (on: string) => `the owner chose A2 on ${on}`,
		pending: "the owner left the choice pending",
		review: "pattern review",
		set: { chosen: "chosen", discarded: "set aside" },
		natures: { keep: "keep", adjust: "adjust", transform: "transform" },
	},
} as const;

const verdicts = (s: Survey | undefined) =>
	s?.requirements.map((r) => [r.requirement_id, r.measures.map((m) => [m.control_id, m.verdict])]);

/** The survey of the reactor once the owner answered the recommendation with `option`, conducted until it stops again. */
async function answered(option: string) {
	const surveyed = await recommended([REVIEWED]);
	const { t, changeId } = surveyed;
	const latestSurvey = async () =>
		(await t.harness.artifacts.latest<Survey>(t.ledger.loadChange(changeId)!.state, "survey"))?.content;
	const measured = await latestSurvey();
	assert.deepEqual(
		t.harness.pendingDecisions(changeId).map((d) => d.interaction),
		["IH-05"],
		`the recommendation is presented: ${surveyed.steps.join(" | ")}`,
	);
	answerMap(t, changeId, option);
	const after = await t.harness.advance(changeId, { max_steps: 40 });
	const state = t.ledger.loadChange(changeId)!.state;
	const report = await t.harness.report(changeId);
	return {
		...surveyed,
		after,
		decisions: state.human_decisions.filter((d) => d.interaction === "IH-05"),
		asked: t.harness.pendingDecisions(changeId).map((d) => d.interaction),
		measured,
		remeasured: await latestSurvey(),
		text: { fr: formatReport(report, "fr"), en: formatReport(report, "en") },
	};
}

/** The lines of the survey section from the recommendation to the findings, which come under the map. */
function recommendationLines(text: string, lang: "fr" | "en"): string[] {
	const lines = text.split("\n");
	const t = HEADINGS[lang];
	const map = lines.findIndex((l) => l.trim().startsWith(t.map));
	const start = lines.findIndex((l) => l.trim().startsWith(t.recommendation));
	const end = lines.findIndex((l, i) => i > start && l.trim() === t.findings);
	assert.ok(start > map && map >= 0, `${lang}: the recommendation comes under the map:\n${text}`);
	return lines.slice(start, end < 0 ? undefined : end);
}

/** The line that opens alternative `id`, and the lines under it up to the next one at its depth. */
function alternativeBlock(lines: readonly string[], id: string): string {
	const at = lines.findIndex((l) => l.trim().startsWith(`${id} — `));
	assert.ok(at > 0, `alternative ${id} is presented:\n${lines.join("\n")}`);
	const depth = lines[at]!.search(/\S/);
	const next = lines.findIndex((l, i) => i > at && l.search(/\S/) <= depth);
	return lines.slice(at, next < 0 ? undefined : next).join("\n");
}

describe("the owner's answer to the recommendation is recorded and presented", () => {
	it("choisir A2 enregistre la décision avec A2 et sa date, l'acceptation IH-10 suit, et le rapport présente sous la carte l'alternative choisie avec sa date, sa nature, ses bénéfices, son coût, ses risques et R2, les alternatives écartées et la revue de patterns, en anglais et en français, sans changer de verdict ni le digest du projet", async () => {
		const { decisions, asked, after, measured, remeasured, text, project, before } = await answered("A2");
		const [chosen] = decisions;
		assert.equal(chosen?.option_id, "A2", "the decision recorded in the journal carries A2");
		assert.match(chosen.recorded_at, /^\d{4}-\d{2}-\d{2}T/, "and its date");
		assert.deepEqual(asked, ["IH-10"], `the acceptance of the survey follows: ${after.steps.join(" | ")}`);
		const on = chosen.recorded_at.slice(0, 10);
		for (const lang of ["fr", "en"] as const) {
			const t = HEADINGS[lang];
			const lines = recommendationLines(text[lang], lang);
			assert.ok(
				lines.some((l) => l.includes(t.chosen(on))),
				`${lang}: the chosen alternative with its date:\n${lines.join("\n")}`,
			);
			const adjust = alternativeBlock(lines, "A2");
			for (const said of [
				t.natures.adjust,
				t.set.chosen,
				ADJUST.description,
				...ADJUST.benefits,
				ADJUST.cost.complexity,
				ADJUST.cost.migration,
				...ADJUST.risks,
				R2_STATEMENT,
			])
				assert.ok(adjust.includes(said), `${lang}: A2 says « ${said} »:\n${adjust}`);
			for (const [discarded, nature] of [
				[KEEP, t.natures.keep],
				[TRANSFORM, t.natures.transform],
			] as const) {
				const block = alternativeBlock(lines, discarded.alternative_id);
				for (const said of [nature, t.set.discarded, discarded.description, ...discarded.risks])
					assert.ok(block.includes(said), `${lang}: ${discarded.alternative_id} says « ${said} »:\n${block}`);
			}
			const review = lines.findIndex((l) => l.trim().startsWith(t.review));
			assert.ok(review > 0, `${lang}: the pattern review is presented:\n${lines.join("\n")}`);
			assert.ok(
				lines.slice(review).some((l) => l.includes(DIRECT_CALL) && l.includes(`${ORDER_SERVICE}:7`)),
				`${lang}: the review gives the anti-pattern at its hint`,
			);
			assert.ok(
				lines.slice(review).some((l) => l.includes("repository") && l.includes(`${ORDER_REPOSITORY}:3`)),
				`${lang}: the review gives the pattern at its hint`,
			);
		}
		assert.deepEqual(verdicts(remeasured), verdicts(measured), "no verdict of the survey changes");
		assert.equal(treeDigest(project), before, "the project tree is as it was before the request");
	});

	it("laisser le choix en suspens n'enregistre aucune alternative, l'acceptation IH-10 suit, et le rapport dit que le propriétaire a laissé le choix en suspens, en anglais et en français", async () => {
		const { decisions, asked, after, text } = await answered("suspend");
		const ids = RECOMMENDATION.alternatives.map((a) => a.alternative_id);
		assert.deepEqual(
			decisions.map((d) => d.option_id),
			["suspend"],
			"no alternative is recorded as chosen",
		);
		assert.ok(!decisions.some((d) => ids.includes(d.option_id ?? "")));
		assert.deepEqual(asked, ["IH-10"], `the acceptance of the survey follows: ${after.steps.join(" | ")}`);
		for (const lang of ["fr", "en"] as const) {
			const t = HEADINGS[lang];
			const lines = recommendationLines(text[lang], lang);
			assert.ok(
				lines.some((l) => l.includes(t.pending)),
				`${lang}: the report says the owner left the choice pending:\n${lines.join("\n")}`,
			);
			for (const id of ids) alternativeBlock(lines, id);
			assert.ok(!lines.some((l) => l.includes(t.set.chosen)), `${lang}: no alternative is presented as chosen`);
		}
	});
});
