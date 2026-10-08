/**
 * The report of a survey whose architecture map the owner adopted presents the map in its survey section:
 * the date of its adoption, each part with its perimeter, its style, the role of each of its packages and
 * the parts it may depend on, then the packages no part covers, in English and in French.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatReport } from "../../src/presentation/structured/text.ts";
import {
	answerMap,
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	javaSource,
	mavenReactor,
	surveyedArchitecture,
} from "../helpers/architecture-survey.ts";

const [LEGACY_PATH, LEGACY_SOURCE] = javaSource("domain", "io.demo.domain.legacy", "OldUser");

/** What each language says of the adopted map, for a map adopted on `on`. */
const SAID = {
	fr: (on: string) => [
		`Carte d'architecture adoptée le ${on} :`,
		"domain — périmètre : domain, style : onion, peut dépendre de : aucune partie",
		"io.demo.domain.user : domain model",
		"io.demo.domain.service : domain services",
		"io.demo.domain.port : ports",
		"infrastructure — périmètre : infrastructure, style : onion, peut dépendre de : domain",
		"io.demo.infra : adapters",
		"paquets sans partie : io.demo.domain.legacy",
	],
	en: (on: string) => [
		`Adopted architecture map, adopted on ${on}:`,
		"domain — perimeter: domain, style: onion, may depend on: no part",
		"io.demo.domain.user: domain model",
		"io.demo.domain.service: domain services",
		"io.demo.domain.port: ports",
		"infrastructure — perimeter: infrastructure, style: onion, may depend on: domain",
		"io.demo.infra: adapters",
		"packages without a part: io.demo.domain.legacy",
	],
};

describe("the report of a survey presents the adopted architecture map", () => {
	it("le rapport d'un état des lieux à la carte adoptée présente sa date d'adoption, chaque partie avec son périmètre, son style, ses rôles et ses relations permises, et les paquets sans partie, en anglais et en français", async () => {
		const project = mavenReactor(DOMAIN_MODULES, { ...DOMAIN_SOURCES, [LEGACY_PATH]: LEGACY_SOURCE });
		const { t, changeId } = await surveyedArchitecture(project, [DOMAIN_MAP]);
		answerMap(t, changeId, "adopt_map");
		await t.harness.advance(changeId, { max_steps: 40 });
		const adoption = t.ledger.loadChange(changeId)!.state.human_decisions.find((d) => d.option_id === "adopt_map");
		assert.ok(adoption, "the map is adopted");
		const on = adoption.recorded_at.slice(0, 10);
		const report = await t.harness.report(changeId);
		assert.ok(report.survey, "the report has a survey section");
		for (const lang of ["fr", "en"] as const) {
			const text = formatReport(report, lang);
			const section = text.slice(text.indexOf(lang === "fr" ? "## État des lieux" : "## Survey"));
			for (const said of SAID[lang](on)) assert.ok(section.includes(said), `${lang}: « ${said} » in\n${section}`);
		}
	});
});
