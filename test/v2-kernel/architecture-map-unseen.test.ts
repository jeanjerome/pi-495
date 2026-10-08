/**
 * What the verification of an adopted map does not see is named under the map in the survey section of the
 * report, each point with its reason, in English and in French: a reader does not take the absence of a finding
 * for the absence of a defect. Maven and its plugins are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answerMap, surveyedArchitecture } from "../helpers/architecture-survey.ts";
import { DEPENDENCIES_MAP, DEPENDENCIES_REACTOR } from "../helpers/dependencies-reactor.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { trackedProject } from "../helpers/harness-fixture.ts";

/** The lines of the survey section from the adopted map to the findings, in `lang`. */
function underTheMap(text: string, lang: "fr" | "en"): string[] {
	const lines = text.split("\n");
	const start = lines.findIndex((l) =>
		l.includes(lang === "fr" ? "Carte d'architecture adoptée le" : "Adopted architecture map, adopted on"),
	);
	assert.ok(start >= 0, `the survey section presents the adopted map:\n${text}`);
	const end = lines.findIndex((l, i) => i > start && l.trim() === (lang === "fr" ? "Constats:" : "Findings:"));
	return lines.slice(start, end < 0 ? undefined : end);
}

/** Each point the section names, in the words of `lang`, with what its reason must say. */
const UNSEEN = {
	fr: {
		heading: "ce que sa vérification ne voit pas :",
		points: [
			[
				"sans import ni référence dans les classes compilées",
				"réflexion",
				"META-INF/services",
				"configuration d'un framework",
			],
			["les sources de test", "les règles de la carte ne les jugent pas"],
			["les bibliothèques hors du réacteur", "les règles de la carte ne les opposent à aucune partie"],
			["déclarées pour la seule exécution", "portée runtime"],
			[
				"les classes compilées ne gardent aucune trace",
				"constante recopiée à la compilation",
				"annotation gardée dans la seule source",
				"processeur d'annotations",
				"données comme inutilisées",
			],
			["les agrégats comme junit-jupiter", "donné comme inutilisé", "utilisé sans être déclaré"],
		],
	},
	en: {
		heading: "what its verification does not see:",
		points: [
			[
				"without an import or a reference in the compiled classes",
				"reflection",
				"META-INF/services",
				"configuration of a framework",
			],
			["the test sources", "the rules of the map do not judge them"],
			["the libraries outside the reactor", "the rules of the map oppose them to no part"],
			["declared for the runtime alone", "scope runtime"],
			[
				"the compiled classes keep no trace",
				"constant copied at compile time",
				"annotation kept in the source alone",
				"annotation processor",
				"given as unused",
			],
			["the aggregates such as junit-jupiter", "given as unused", "used without being declared"],
		],
	},
} as const;

describe("what the verification of the adopted map does not see is named", () => {
	it("la section état des lieux d'une carte adoptée nomme, sous la carte et chacun avec sa raison, les liens établis sans import, les sources de test, les bibliothèques hors du réacteur, les dépendances déclarées pour la seule exécution, les dépendances sans trace dans les classes compilées et les agrégats, en anglais et en français", async () => {
		const project = trackedProject((root) => writeFiles(root, DEPENDENCIES_REACTOR));
		const { t, changeId } = await surveyedArchitecture(project, [DEPENDENCIES_MAP]);
		answerMap(t, changeId, "adopt_map");
		const after = await t.harness.advance(changeId, { max_steps: 60 });
		const report = await t.harness.report(changeId);
		assert.ok(report.survey?.architecture, `the map is adopted: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		for (const lang of ["fr", "en"] as const) {
			const section = underTheMap(formatReport(report, lang), lang);
			const heading = section.findIndex((l) => l.trim() === UNSEEN[lang].heading);
			assert.ok(heading > 0, `${lang}: « ${UNSEEN[lang].heading} » under the map:\n${section.join("\n")}`);
			const named = section.slice(heading + 1);
			for (const words of UNSEEN[lang].points) {
				const point = named.find((l) => l.includes(words[0]));
				assert.ok(point, `${lang}: « ${words[0]} » is named:\n${named.join("\n")}`);
				for (const word of words.slice(1)) assert.ok(point.includes(word), `${lang}: « ${word} » in ${point}`);
				assert.match(point, /\S: \S|\S : \S/, `${lang}: the point gives its reason: ${point}`);
			}
		}
	});
});
