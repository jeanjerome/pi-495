/**
 * Adopting the architecture map of a Maven reactor also has the links its configuration files and the strings of
 * its code establish read against the map: the protocol freezes the control of those links qualified by its
 * witnesses beside the architecture control, though the reference already breaks the map, and the survey measures
 * the requirement about the architecture by it, each link located in the report with its method of observation.
 * Maven and its plugins are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answerMap, surveyedArchitecture } from "../helpers/architecture-survey.ts";
import {
	CONFIGURED_LINKS_REACTOR,
	linkLineOf,
	PERMITTED_LINKS_REACTOR,
	REPOSITORY_PROPERTIES,
	USER_LOADER,
} from "../helpers/configured-links-reactor.ts";
import { DEPENDENCIES_MAP } from "../helpers/dependencies-reactor.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { trackedProject } from "../helpers/harness-fixture.ts";
import { treeDigest } from "../helpers/quality-survey.ts";

const LINKS = "configured-links";

/** The survey of `reactor` once the owner adopted the map: the frozen protocol, and what the survey says of ARC-01. */
async function adopted(reactor: Record<string, string>) {
	const project = trackedProject((root) => writeFiles(root, reactor));
	const before = treeDigest(project);
	const { t, changeId } = await surveyedArchitecture(project, [DEPENDENCIES_MAP]);
	answerMap(t, changeId, "adopt_map");
	const after = await t.harness.advance(changeId, { max_steps: 60 });
	const state = t.ledger.loadChange(changeId)!.state;
	const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
	const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
	const architecture = survey?.requirements.find((r) => r.requirement_id === "ARC-01");
	return { t, changeId, project, before, after, protocol, survey, architecture };
}

const STRING_LINE = linkLineOf(USER_LOADER, '"io.demo.infra.UserStore"');
const PROPERTY_LINE = linkLineOf(REPOSITORY_PROPERTIES, "io.demo.infra.UserStore");

describe("adopting the architecture map of a Maven reactor reads the links established by configuration or by reflection", () => {
	it("l'adoption gèle le contrôle des liens établis par configuration ou par réflexion, qualifié par ses témoins, et le survey mesure l'exigence d'architecture par lui en FAIL, avec le lien de domain vers infrastructure par réflexion à la ligne de la chaîne de UserLoader.java et par configuration à la ligne de repository.properties, que le rapport donne avec leur méthode, sans changer le digest du projet", async () => {
		const { t, changeId, project, before, after, protocol, architecture } = await adopted(CONFIGURED_LINKS_REACTOR);
		assert.ok(protocol, `a protocol is frozen: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		const ids = protocol.controls.map((c) => c.control_id);
		assert.ok(ids.includes("architecture") && ids.includes(LINKS), `the protocol carries both controls: ${ids}`);
		const links = protocol.controls.find((c) => c.control_id === LINKS)!;
		assert.equal(links.network, "denied", "the control runs with the network closed");
		assert.equal(
			protocol.qualifications[LINKS]?.qualified,
			true,
			`qualified by its witnesses: ${JSON.stringify(protocol.qualifications[LINKS]?.notes)}`,
		);

		assert.ok(architecture, "the survey carries the architecture requirement");
		const measure = architecture.measures.find((m) => m.control_id === LINKS);
		assert.equal(measure?.verdict, "FAIL", `measured by the control: ${JSON.stringify(architecture.measures)}`);

		const report = await t.harness.report(changeId);
		const findings = report.survey?.findings.filter((f) => f.control_id === LINKS) ?? [];
		const reflected = findings.find((f) => f.path === USER_LOADER);
		assert.ok(reflected, `the link by reflection is a finding: ${JSON.stringify(findings)}`);
		assert.ok(reflected.message.startsWith(`${USER_LOADER}:${STRING_LINE}:`), reflected.message);
		assert.match(
			reflected.message,
			/part domain depends on part infrastructure by reflection, naming io\.demo\.infra\.UserStore/,
		);
		const configured = findings.find((f) => f.path === REPOSITORY_PROPERTIES);
		assert.ok(configured, `the link by configuration is a finding: ${JSON.stringify(findings)}`);
		assert.ok(configured.message.startsWith(`${REPOSITORY_PROPERTIES}:${PROPERTY_LINE}:`), configured.message);
		assert.match(
			configured.message,
			/part domain depends on part infrastructure by configuration, naming io\.demo\.infra\.UserStore/,
		);

		const text = formatReport(report, "fr");
		for (const expected of [
			`${LINKS} ${USER_LOADER}: ${USER_LOADER}:${STRING_LINE}: part domain depends on part infrastructure by reflection`,
			`${LINKS} ${REPOSITORY_PROPERTIES}: ${REPOSITORY_PROPERTIES}:${PROPERTY_LINE}: part domain depends on part infrastructure by configuration`,
		])
			assert.ok(text.includes(expected), `the survey section gives « ${expected} »:\n${text}`);
		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});

	it("sur un réacteur où seul beans.xml d'app nomme une classe d'infrastructure, le survey mesure l'exigence par ce contrôle en PASS sans constat", async () => {
		const { after, survey, architecture } = await adopted(PERMITTED_LINKS_REACTOR);
		assert.ok(architecture, `the survey carries the architecture requirement: ${after.steps.join(" | ")}`);
		const measure = architecture.measures.find((m) => m.control_id === LINKS);
		assert.equal(measure?.verdict, "PASS", `${architecture.blind_spot} ${JSON.stringify(architecture.measures)}`);
		assert.deepEqual(survey?.controls.find((c) => c.control_id === LINKS)?.findings, []);
	});
});
