/**
 * What the verification of the dependencies of an npm package by Knip does not see is named under the adopted map
 * in the survey section of the report, beside what the verification of the map does not see, each point with its
 * reason, in English and in French. npm, dependency-cruiser and Knip are fakes, the readers are the real ones.
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

/** Each point about the dependencies the section names, in the words of `lang`, with what its reason must say. */
const UNSEEN = {
	fr: {
		heading: "ce que sa vérification ne voit pas :",
		already: "les sources .mts et .cts",
		points: [
			[
				"chargée par un chemin calculé",
				"seulement par la configuration d'un outil dont Knip ne connaît pas le format",
				"inutilisée",
			],
			["les binaires que les scripts de package.json appellent", "ne les compare pas aux dépendances déclarées"],
			["les paquets que 495 installe dans la copie", "écartés de l'analyse"],
		],
	},
	en: {
		heading: "what its verification does not see:",
		already: "the .mts and .cts sources",
		points: [
			["loaded by a computed path", "only by the configuration of a tool whose format Knip does not know", "unused"],
			["the binaries the scripts of package.json call", "does not compare them to the declared dependencies"],
			["the packages 495 installs in the copy", "left out of the analysis"],
		],
	},
} as const;

describe("what the verification of the dependencies of an npm package does not see is named", () => {
	it("la section état des lieux d'une carte adoptée d'un paquet npm nomme, sous la carte et chacun avec sa raison, les dépendances chargées par un chemin calculé ou par la configuration d'un outil que Knip ne connaît pas, les binaires des scripts de package.json et les paquets que 495 installe dans la copie, en anglais et en français", async () => {
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
			assert.ok(
				named.some((l) => l.includes(UNSEEN[lang].already)),
				`${lang}: beside what the verification of the map does not see:\n${named.join("\n")}`,
			);
			for (const words of UNSEEN[lang].points) {
				const point = named.find((l) => l.includes(words[0]));
				assert.ok(point, `${lang}: « ${words[0]} » is named:\n${named.join("\n")}`);
				for (const word of words.slice(1)) assert.ok(point.includes(word), `${lang}: « ${word} » in ${point}`);
				assert.match(point, /\S: \S|\S : \S/, `${lang}: the point gives its reason: ${point}`);
			}
		}
	});
});
