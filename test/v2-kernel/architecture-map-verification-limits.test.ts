/**
 * What the verification of an adopted architecture map leaves unverified, and says so: a resolution of
 * ArchUnit that fails keeps the adopted map frozen with no architecture control, the survey naming the
 * requirement a blind spot with the reason Maven gave; a host POM that cannot take the declaration of ArchUnit
 * leaves the map adopted with nothing resolved, the outcome and the survey saying why; and the internal rules of a part in the `other` style,
 * which no rule of the map checks, are said not to be verified in the adoption and in the report.
 */
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDecisionRequest } from "../../src/application/decisions.ts";
import type { ArchitectureMap, Protocol } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
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
import { STACKS_OF_495 } from "../helpers/technologies.ts";

/** The reactor of `domain` and `infrastructure` with a module `events`, in the `other` style of the map below. */
const EVENTS_SOURCES = Object.fromEntries([
	...Object.entries(DOMAIN_SOURCES),
	javaSource("events", "io.demo.events", "OrderPlaced"),
]);
const EVENTS_MAP: ArchitectureMap = {
	...DOMAIN_MAP,
	parts: [
		...DOMAIN_MAP.parts,
		{
			name: "events",
			perimeter: ["events"],
			style: "other",
			roles: [
				{
					package: "io.demo.events",
					role: "published events",
					hints: [{ path: "events/src/main/java/io/demo/events/OrderPlaced.java", line: 3, says: "an event" }],
				},
			],
			hints: [{ path: "events/pom.xml", line: 5, says: "an event-driven module" }],
		},
	],
};

const SAID = {
	fr: "les règles internes de la partie events ne sont pas vérifiées, seules ses relations et l'absence de cycle l'étant",
	en: "the internal rules of part events are not verified, only its relations and the absence of cycles are",
};

describe("what the verification of the adopted map leaves unverified is said", () => {
	it("une résolution d'ArchUnit qui échoue gèle la carte sans contrôle d'architecture et le survey nomme l'exigence comme angle mort avec la raison de Maven", async () => {
		const project = mavenReactor(DOMAIN_MODULES, DOMAIN_SOURCES);
		const { t, changeId } = await surveyedArchitecture(project, [DOMAIN_MAP], undefined, "fails");
		answerMap(t, changeId, "adopt_map");
		const after = await t.harness.advance(changeId, { max_steps: 60 });
		const state = t.ledger.loadChange(changeId)!.state;
		const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
		assert.ok(protocol, `a protocol is frozen: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		assert.deepEqual(protocol.architecture_map?.map, DOMAIN_MAP, "the adopted map is frozen all the same");
		assert.deepEqual(
			protocol.controls.filter((c) => c.control_id === "architecture"),
			[],
			"and no architecture control",
		);
		const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
		const architecture = survey?.requirements.find((r) => r.requirement_id === "ARC-01");
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			/Could not transfer artifact .* 403 Forbidden/,
			"the requirement is a blind spot, with the reason Maven gave",
		);
		assert.deepEqual(architecture.measures, []);
	});

	it("quand le POM d'infrastructure ne reçoit pas la déclaration d'ArchUnit sans ambiguïté, l'issue d'adoption dit qu'aucun contrôle ne vérifiera la carte et pourquoi, rien n'est résolu, et le survey nomme l'exigence comme angle mort avec cette raison", async () => {
		const project = mavenReactor(DOMAIN_MODULES, DOMAIN_SOURCES);
		const host = join(project, "infrastructure/pom.xml");
		writeFileSync(
			host,
			readFileSync(host, "utf8").replace("</project>", "  <profiles></profiles>\n  <profiles></profiles>\n</project>"),
		);
		const why = "infrastructure/pom.xml cannot receive the declaration of ArchUnit without ambiguity";
		const { t, maven, changeId } = await surveyedArchitecture(project, [DOMAIN_MAP]);
		const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-04");
		assert.ok(asked, "the map is presented");
		const adopt = asked.options.find((o) => o.id === "adopt_map")!;
		assert.equal(adopt.label, "Adopter la carte", "the outcome adopts no verification");
		assert.ok(
			adopt.effect.includes(`Aucun contrôle ne vérifiera la carte : ${why}.`),
			`the outcome says no control will verify the map, and why: ${adopt.effect}`,
		);

		answerMap(t, changeId, "adopt_map");
		const after = await t.harness.advance(changeId, { max_steps: 60 });
		assert.equal(maven.resolutions(), 0, "nothing is resolved");
		const state = t.ledger.loadChange(changeId)!.state;
		const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
		assert.ok(protocol, `a protocol is frozen: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		assert.deepEqual(protocol.architecture_map?.map, DOMAIN_MAP, "the adopted map is frozen");
		assert.deepEqual(
			protocol.controls.filter((c) => c.control_id === "architecture"),
			[],
			"and no architecture control",
		);
		const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
		const architecture = survey?.requirements.find((r) => r.requirement_id === "ARC-01");
		assert.equal(
			architecture?.blind_spot,
			`blind spot: no control verifies the adopted architecture map, frozen as the architecture the project declares: ${why}`,
		);
	});

	it("pour une partie events de style other, l'issue d'adoption et le rapport, en anglais et en français, disent que ses règles internes ne sont pas vérifiées", async () => {
		const project = mavenReactor({ ...DOMAIN_MODULES, events: [] }, EVENTS_SOURCES);
		const { t, changeId } = await surveyedArchitecture(project, [EVENTS_MAP]);
		const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-04");
		assert.ok(asked, "the map is presented");
		const adopt = asked.options.find((o) => o.id === "adopt_map")!;
		assert.ok(adopt.effect.includes(SAID.fr), `fr: « ${SAID.fr} » in ${adopt.effect}`);
		const english = buildDecisionRequest({
			decision_id: asked.decision_id,
			change_id: changeId,
			interaction: "IH-04",
			subject: asked.subject,
			language: "en",
			facts: asked.facts,
			recommendation: null,
			arg: "ARC-01",
			architecture_map: {
				installs: [{ package: "com.tngtech.archunit:archunit-junit5", version: "1.5.1", manager: "maven" }],
				unverified: null,
				unchecked_parts: ["events"],
			},
			installers: (manager) => STACKS_OF_495.installerOf(manager)?.install,
			requested_at: asked.requested_at,
		}).options.find((o) => o.id === "adopt_map")!;
		assert.ok(english.effect.includes(SAID.en), `en: « ${SAID.en} » in ${english.effect}`);

		answerMap(t, changeId, "adopt_map");
		await t.harness.advance(changeId, { max_steps: 60 });
		const report = await t.harness.report(changeId);
		for (const lang of ["fr", "en"] as const) {
			const text = formatReport(report, lang);
			const section = text.slice(text.indexOf(lang === "fr" ? "## État des lieux" : "## Survey"));
			assert.ok(section.includes(SAID[lang]), `${lang}: « ${SAID[lang]} » in\n${section}`);
		}
	});
});
