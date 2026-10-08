/**
 * The kernel checks the form of the argument of a recommendation before presenting it, never its substance: at least
 * two alternatives, each with a benefit, a cost, a risk and a constraint, every constraint a requirement of the survey
 * or a question the owner answered, and a conclusion that cites one and recommends one of the alternatives. A
 * recommendation whose form does not hold is not presented, and the survey section of the report says why no
 * recommendation is given. Maven and ArchUnit are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { ADJUST, KEEP, RECOMMENDATION, recommended, TRANSFORM } from "../helpers/architecture-recommendation.ts";

const NO_RECOMMENDATION = {
	fr: "Aucune recommandation d'architecture n'est donnée",
	en: "No architecture recommendation is given",
} as const;

/** The survey of the reactor whose model proposed `recommendation`: what the owner is asked, and the report in both languages. */
async function refused(recommendation: unknown) {
	const { t, agent, changeId, stopped_because, steps } = await recommended([recommendation]);
	assert.equal(
		agent.recommendationMandates.length,
		1,
		`an intervention proposed the recommendation: ${steps.join(" | ")}`,
	);
	const asked = t.harness.pendingDecisions(changeId).map((d) => d.interaction);
	const report = await t.harness.report(changeId);
	return { asked, stopped_because, steps, text: { fr: formatReport(report, "fr"), en: formatReport(report, "en") } };
}

/** The line of the survey section that says no recommendation is given, in `lang`. */
function noRecommendationLine(text: string, lang: "fr" | "en"): string {
	const line = text.split("\n").find((l) => l.includes(NO_RECOMMENDATION[lang]));
	assert.ok(line, `${lang}: the survey section says no recommendation is given:\n${text}`);
	return line;
}

/** The recommendation is not presented, and the report names in both languages what its argument misses. */
async function notPresented(recommendation: unknown, missing: RegExp) {
	const { asked, stopped_because, steps, text } = await refused(recommendation);
	assert.deepEqual(
		asked,
		["IH-10"],
		`no IH-05 is asked on it, the survey goes to its acceptance: ${stopped_because}, ${steps.join(" | ")}`,
	);
	for (const lang of ["fr", "en"] as const)
		assert.match(noRecommendationLine(text[lang], lang), missing, `${lang}: the reason names what is missing`);
}

describe("the form of the argument of a recommendation is checked before it is presented", () => {
	it("une recommandation dont A3 cite R9, que les exigences ne portent pas, n'est pas présentée et le rapport dit qu'aucune recommandation n'est donnée en désignant A3 et R9", async () => {
		await notPresented(
			{ ...RECOMMENDATION, alternatives: [KEEP, ADJUST, { ...TRANSFORM, constraints: ["R9"] }] },
			/A3.*R9/,
		);
	});

	it("une recommandation dont A1 ne porte aucun risque n'est pas présentée et le rapport désigne A1 et le risque manquant", async () => {
		await notPresented({ ...RECOMMENDATION, alternatives: [{ ...KEEP, risks: [] }, ADJUST, TRANSFORM] }, /A1.*no risk/);
	});

	it("une recommandation d'une seule alternative, ou dont la conclusion ne cite aucune contrainte, ou dont l'alternative recommandée n'est pas parmi les siennes, n'est pas présentée et le rapport dit ce qui manque", async () => {
		await notPresented({ ...RECOMMENDATION, alternatives: [ADJUST] }, /1 alternative.*at least two/);
		await notPresented(
			{ ...RECOMMENDATION, recommended: { ...RECOMMENDATION.recommended, constraints: [] } },
			/conclusion cites no constraint/,
		);
		await notPresented(
			{ ...RECOMMENDATION, recommended: { ...RECOMMENDATION.recommended, alternative_id: "A9" } },
			/recommended alternative A9 is none of the alternatives/,
		);
	});
});
