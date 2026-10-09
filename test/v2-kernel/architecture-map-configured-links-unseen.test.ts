/**
 * What the reading of the links established without an import does not see is named under the adopted map of a
 * Maven reactor, each point with its reason, in place of the general sentence on reflection, `META-INF/services` and
 * the configuration of a framework, in English and in French. Maven and its plugins are fakes, the readers are the
 * real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answerMap, surveyedArchitecture } from "../helpers/architecture-survey.ts";
import { CONFIGURED_LINKS_REACTOR } from "../helpers/configured-links-reactor.ts";
import { DEPENDENCIES_MAP } from "../helpers/dependencies-reactor.ts";
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

/** The general sentence no longer said, and each point said in its place, with what its reason must say, in `lang`. */
const UNSEEN = {
	fr: {
		heading: "ce que sa vérification ne voit pas :",
		general: "sans import ni référence dans les classes compilées",
		points: [
			["les noms de classe construits à l'exécution", "concaténation", "valeur substituée"],
			[
				"les classes désignées autrement que par leur nom entier",
				"balayage d'un paquet",
				"nom court",
				"META-INF/services",
			],
			["entre deux paquets d'une même partie"],
			["hors du src/main/ d'un module"],
			["qu'aucune partie ne revendique seule"],
		],
	},
	en: {
		heading: "what its verification does not see:",
		general: "without an import or a reference in the compiled classes",
		points: [
			["the class names built at runtime", "concatenation", "substituted value"],
			[
				"the classes designated otherwise than by their full name",
				"scan of a package",
				"short name",
				"META-INF/services",
			],
			["between two packages of the same part"],
			["outside the src/main/ of a module"],
			["no part claims alone"],
		],
	},
} as const;

describe("what the reading of the links established without an import does not see is named", () => {
	it("la section état des lieux d'une carte adoptée d'un réacteur Maven ne nomme plus les liens par réflexion, META-INF/services ou configuration d'un framework comme un angle mort entier, et nomme chacun avec sa raison les noms construits à l'exécution, les classes désignées autrement que par leur nom entier, les liens à l'intérieur d'une partie, la configuration hors de src/main/ et les fichiers qu'aucune partie ne revendique seule, en anglais et en français", async () => {
		const project = trackedProject((root) => writeFiles(root, CONFIGURED_LINKS_REACTOR));
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
			assert.ok(
				!named.some((l) => l.includes(UNSEEN[lang].general)),
				`${lang}: the links established without an import are no longer one whole blind spot:\n${named.join("\n")}`,
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
