/**
 * What the verification of the adopted map of an npm package does not see is named under the map in the survey
 * section of the report, each point with its reason, in English and in French: a reader does not take the
 * absence of a finding for the absence of a defect. npm and dependency-cruiser are fakes, the readers are the
 * real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answerMap } from "../helpers/architecture-survey.ts";
import {
	NODE_DOMAIN_MAP,
	NODE_DOMAIN_SOURCES,
	nodePackage,
	nodeSurveyedArchitecture,
} from "../helpers/node-architecture-survey.ts";

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
			["les sources .mts et .cts", "swc ne les lit pas"],
			[
				"sans import ni require d'un chemin écrit en toutes lettres",
				"chemin calculé",
				"injection",
				"configuration d'un framework",
			],
			["les sources de test", "les règles de la carte ne les jugent pas"],
			["les paquets installés sous node_modules", "les règles de la carte ne les opposent à aucune partie"],
		],
	},
	en: {
		heading: "what its verification does not see:",
		points: [
			["the .mts and .cts sources", "swc does not read them"],
			[
				"without an import or a require of a path written out in full",
				"computed path",
				"injection",
				"configuration of a framework",
			],
			["the test sources", "the rules of the map do not judge them"],
			["the packages installed under node_modules", "the rules of the map oppose them to no part"],
		],
	},
} as const;

describe("what the verification of the adopted map of an npm package does not see is named", () => {
	it("la section état des lieux d'une carte adoptée d'un paquet npm nomme, sous la carte et chacun avec sa raison, les sources .mts et .cts, les liens établis sans import ni require d'un chemin écrit en toutes lettres, les sources de test et les paquets installés sous node_modules, en anglais et en français", async () => {
		const { t, changeId } = await nodeSurveyedArchitecture(nodePackage(NODE_DOMAIN_SOURCES), [NODE_DOMAIN_MAP]);
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
