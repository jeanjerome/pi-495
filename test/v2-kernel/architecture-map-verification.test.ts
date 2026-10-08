/**
 * Adopting the architecture map adopts its verification: the decision names ArchUnit, how it is declared and
 * resolved, and the rules it will check; the adoption resolves it with the network open for that step alone,
 * the protocol freezes the map and the architecture control qualified by its witnesses, and the survey
 * measures the requirement about the architecture by that control, each violation located in the report.
 * Maven and ArchUnit are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildDecisionRequest } from "../../src/application/decisions.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import {
	answerMap,
	DOMAIN_MAP,
	DOMAIN_MODULES,
	DOMAIN_SOURCES,
	mavenReactor,
	surveyedArchitecture,
} from "../helpers/architecture-survey.ts";
import type { FakeMavenSandbox } from "../helpers/fake-maven.ts";
import { treeDigest } from "../helpers/quality-survey.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const USER = "domain/src/main/java/io/demo/domain/user/User.java";

/** The model of the domain calls a service of the domain, which the onion of the part `domain` forbids. */
const USER_CALLS_SERVICE = `package io.demo.domain.user;

import io.demo.domain.service.UserService;

public class User {
    public String name() {
        return UserService.describe();
    }
}
`;
const CALL_LINE = USER_CALLS_SERVICE.split("\n").findIndex((l) => l.includes("UserService.describe()")) + 1;

/** The service of the domain the model calls. */
const USER_SERVICE = `package io.demo.domain.service;

public interface UserService {
    static String describe() {
        return "a user";
    }
}
`;

/** The survey of the reactor of `domain` and `infrastructure` carrying `sources`, stopped on the map it proposes. */
async function proposed(sources: Record<string, string> = DOMAIN_SOURCES) {
	const project = mavenReactor(DOMAIN_MODULES, sources);
	const before = treeDigest(project);
	const surveyed = await surveyedArchitecture(project, [DOMAIN_MAP]);
	return { ...surveyed, project, before };
}

/** The survey once the owner adopted the map: the frozen protocol, and what the survey says of ARC-01. */
async function adopted(sources: Record<string, string>) {
	const { t, maven, changeId, project, before } = await proposed(sources);
	answerMap(t, changeId, "adopt_map");
	const after = await t.harness.advance(changeId, { max_steps: 60 });
	const state = t.ledger.loadChange(changeId)!.state;
	const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
	const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
	const architecture = survey?.requirements.find((r) => r.requirement_id === "ARC-01");
	return { t, maven, changeId, project, before, after, protocol, survey, architecture };
}

const resolutionsOf = (maven: FakeMavenSandbox) =>
	maven.runs.filter((r) => r.command.some((part) => part.endsWith(":resolve-plugins")));

describe("adopting the architecture map adopts its verification by ArchUnit", () => {
	it("l'issue d'adoption de la carte nomme archunit-junit5 1.5.1, sa déclaration dans une copie du POM, sa résolution réseau ouvert pour cette seule étape dans le dépôt local que Maven désigne, et les règles qu'il vérifiera", async () => {
		const { t, changeId } = await proposed();
		const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-04");
		assert.ok(asked, "the map is presented");
		const adopt = asked.options.find((o) => o.id === "adopt_map");
		assert.ok(adopt, "the owner may adopt the map");
		const said = `${adopt.label} — ${adopt.effect}`;
		for (const expected of [
			"com.tngtech.archunit:archunit-junit5 1.5.1",
			"dans une copie du POM",
			"le résout avec Maven",
			"réseau pour cette seule étape",
			"dans le dépôt local que Maven désigne",
			"rien n'est écrit dans le projet",
			"le style de chaque partie",
			"les relations permises entre parties",
			"l'absence de cycle",
			"les sources qu'aucune partie ne couvre",
		])
			assert.ok(said.includes(expected), `« ${expected} » in ${said}`);

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
				unchecked_parts: [],
			},
			installers: (manager) => STACKS_OF_495.installerOf(manager)?.install,
			requested_at: asked.requested_at,
		}).options.find((o) => o.id === "adopt_map");
		assert.ok(english, "the owner may adopt the map in English");
		const saidInEnglish = `${english.label} — ${english.effect}`;
		for (const expected of [
			"com.tngtech.archunit:archunit-junit5 1.5.1",
			"in a copy of the POM",
			"resolves it with Maven",
			"network for that step alone",
			"into the local repository Maven designates",
			"nothing is written in the project",
			"the style of each part",
			"the relations permitted between parts",
			"the absence of cycles",
			"the sources no part covers",
		])
			assert.ok(saidInEnglish.includes(expected), `« ${expected} » in ${saidInEnglish}`);
	});

	it("l'adoption résout ArchUnit, gèle la carte et le contrôle d'architecture qualifié, et le survey mesure l'exigence d'architecture en FAIL avec un constat qui nomme la règle, domain/src/main/java/io/demo/domain/user/User.java et la ligne de l'appel, que le rapport donne aussi, sans changer le digest du projet", async () => {
		const { t, maven, changeId, project, before, after, protocol, architecture } = await adopted({
			...DOMAIN_SOURCES,
			[USER]: USER_CALLS_SERVICE,
			"domain/src/main/java/io/demo/domain/service/UserService.java": USER_SERVICE,
		});
		const resolutions = resolutionsOf(maven);
		assert.equal(resolutions.length, 1, `ArchUnit is resolved once: ${after.steps.join(" | ")}`);
		assert.ok(
			resolutions[0]!.command.some((part) => part.includes("com.tngtech.archunit:archunit-junit5:1.5.1")),
			`the resolution fetches ArchUnit: ${resolutions[0]!.command.join(" ")}`,
		);
		assert.equal(resolutions[0]!.network, "allowed", "the network is open for the resolution");
		assert.ok(
			maven.runs.filter((r) => r !== resolutions[0]).every((r) => r.network !== "allowed"),
			"and for no other step",
		);

		assert.ok(protocol, `a protocol is frozen: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		assert.deepEqual(protocol.architecture_map?.map, DOMAIN_MAP, "the protocol carries the adopted map");
		const control = protocol.controls.find((c) => c.control_id === "architecture");
		assert.ok(control, `the protocol carries the architecture control: ${protocol.controls.map((c) => c.control_id)}`);
		assert.deepEqual(control.architecture_map, DOMAIN_MAP, "whose rules are written from the adopted map");
		assert.equal(protocol.qualifications.architecture?.qualified, true, "qualified by its witnesses");

		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.equal(architecture.blind_spot, null, "the requirement is measured");
		const measure = architecture.measures.find((m) => m.control_id === "architecture");
		assert.equal(measure?.verdict, "FAIL", JSON.stringify(architecture.measures));

		const report = await t.harness.report(changeId);
		const finding = report.survey?.findings.find(
			(f) => f.control_id === "architecture" && f.path === USER && f.message.includes(`${USER}:${CALL_LINE}:`),
		);
		assert.ok(finding, `a finding is at the line of the call: ${JSON.stringify(report.survey?.findings)}`);
		assert.match(finding.message, /part domain keeps the rings of its onion/, "it names the rule broken");
		const text = formatReport(report, "fr");
		assert.ok(
			text.includes(`architecture ${USER}: ${USER}:${CALL_LINE}: part domain keeps the rings of its onion`),
			`the survey section gives the finding with its rule, its file and its line:\n${text}`,
		);
		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});

	it("sur une référence qui tient sa carte, le survey mesure l'exigence d'architecture en PASS sans constat", async () => {
		const { after, survey, architecture } = await adopted(DOMAIN_SOURCES);
		assert.ok(architecture, `the survey carries the architecture requirement: ${after.steps.join(" | ")}`);
		const measure = architecture.measures.find((m) => m.control_id === "architecture");
		assert.equal(measure?.verdict, "PASS", `${architecture.blind_spot} ${JSON.stringify(architecture.measures)}`);
		assert.deepEqual(survey?.controls.find((c) => c.control_id === "architecture")?.findings, []);
	});
});
