/**
 * Adopting the architecture map of an npm package adopts its verification: the decision names dependency-cruiser
 * and swc, how npm installs them and the rules they will check; the adoption installs them with the network open
 * for that step alone, the protocol freezes the map and the architecture control qualified by its witnesses, and
 * the survey measures the requirement about the architecture by that control, each violation located in the
 * report. npm and dependency-cruiser are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildDecisionRequest } from "../../src/application/decisions.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answerMap } from "../helpers/architecture-survey.ts";
import {
	NODE_DOMAIN_MAP,
	NODE_DOMAIN_SOURCES,
	NODE_MTS_MAP,
	NODE_MTS_SOURCES,
	nodePackage,
	nodeSurveyedArchitecture,
} from "../helpers/node-architecture-survey.ts";
import { treeDigest } from "../helpers/quality-survey.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const USER = "src/domain/model/user.ts";

/** The model of the domain imports a service of the domain, which the onion of the part `domain` forbids. */
const USER_IMPORTS_SERVICE =
	'export interface User {\n  readonly id: string;\n}\n\nimport { rename } from "../service/user-service.ts";\n\nexport const renamed = rename;\n';
const IMPORT_LINE = USER_IMPORTS_SERVICE.split("\n").findIndex((l) => l.includes("user-service.ts")) + 1;

/** The package of the story without `src/legacy`: every folder of its sources has a part. */
const HELD_SOURCES = Object.fromEntries(
	Object.entries(NODE_DOMAIN_SOURCES).filter(([path]) => !path.startsWith("src/legacy/")),
);

const INSTALLS = [
	{ package: "dependency-cruiser", version: "18.5.0", manager: "npm" },
	{ package: "@swc/core", version: "1.16.13", manager: "npm" },
];

/** The survey of the package carrying `sources`, stopped on the map it proposes. */
async function proposed(
	sources: Record<string, string> = NODE_DOMAIN_SOURCES,
	reachable = true,
	map: unknown = NODE_DOMAIN_MAP,
) {
	const project = nodePackage(sources);
	const before = treeDigest(project);
	const surveyed = await nodeSurveyedArchitecture(project, [map], reachable);
	return { ...surveyed, project, before };
}

/** The survey once the owner adopted the map: the frozen protocol, and what the survey says of ARC-01. */
async function adopted(sources: Record<string, string>, reachable = true, map: unknown = NODE_DOMAIN_MAP) {
	const { t, npm, changeId, project, before } = await proposed(sources, reachable, map);
	answerMap(t, changeId, "adopt_map");
	const after = await t.harness.advance(changeId, { max_steps: 60 });
	const state = t.ledger.loadChange(changeId)!.state;
	const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
	const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
	const architecture = survey?.requirements.find((r) => r.requirement_id === "ARC-01");
	return { t, npm, changeId, project, before, after, protocol, survey, architecture };
}

describe("adopting the architecture map of an npm package adopts its verification by dependency-cruiser", () => {
	it("l'issue d'adoption de la carte d'un paquet npm nomme dependency-cruiser 18.5.0 et @swc/core 1.16.13, leur installation par npm comme dépendances de développement exactes dans une copie, sans script d'installation et réseau ouvert pour cette seule étape, l'inspection de la copie, et les règles qu'ils vérifieront", async () => {
		const { t, changeId } = await proposed();
		const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-04");
		assert.ok(asked, "the map is presented");
		const adopt = asked.options.find((o) => o.id === "adopt_map");
		assert.ok(adopt, "the owner may adopt the map");
		const said = `${adopt.label} — ${adopt.effect}`;
		for (const expected of [
			"dependency-cruiser 18.5.0",
			"@swc/core 1.16.13",
			"comme dépendances de développement exactes dans une copie",
			"sans exécuter de script d'installation",
			"réseau pour cette seule étape",
			"la copie est inspectée",
			"rien n'est écrit dans le projet",
			"le style de chaque partie",
			"les relations permises entre parties",
			"l'absence de cycle",
			"les sources qu'aucune partie ne couvre",
			"l'état des lieux mesure l'exigence avec eux",
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
			architecture_map: { installs: INSTALLS, unverified: null, unchecked_parts: [] },
			installers: (manager) => STACKS_OF_495.installerOf(manager)?.install,
			requested_at: asked.requested_at,
		}).options.find((o) => o.id === "adopt_map");
		assert.ok(english, "the owner may adopt the map in English");
		const saidInEnglish = `${english.label} — ${english.effect}`;
		for (const expected of [
			"dependency-cruiser 18.5.0",
			"@swc/core 1.16.13",
			"as exact development dependencies in a copy",
			"running no install script",
			"network for that step alone",
			"the copy is inspected",
			"nothing is written in the project",
			"the style of each part",
			"the relations permitted between parts",
			"the absence of cycles",
			"the sources no part covers",
			"the survey measures the requirement with them",
		])
			assert.ok(saidInEnglish.includes(expected), `« ${expected} » in ${saidInEnglish}`);
	});

	it("l'adoption installe les deux paquets, gèle la carte et le contrôle d'architecture qualifié, et le survey mesure l'exigence d'architecture en FAIL avec un constat qui nomme la règle, src/domain/model/user.ts et la ligne de l'import, que le rapport donne aussi, sans changer le digest du projet", async () => {
		const { t, npm, changeId, project, before, after, protocol, architecture } = await adopted({
			...NODE_DOMAIN_SOURCES,
			[USER]: USER_IMPORTS_SERVICE,
		});
		const installs = npm.installs();
		assert.equal(installs.length, 1, `npm installs once: ${after.steps.join(" | ")}`);
		for (const asked of ["dependency-cruiser@18.5.0", "@swc/core@1.16.13"])
			assert.ok(
				installs[0]!.command.includes(asked),
				`the install asks for ${asked}: ${installs[0]!.command.join(" ")}`,
			);
		assert.equal(installs[0]!.network, "allowed", "the network is open for the install");
		assert.ok(
			npm.runs.filter((r) => r !== installs[0]).every((r) => r.network !== "allowed"),
			"and for no other step",
		);

		assert.ok(protocol, `a protocol is frozen: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		assert.deepEqual(protocol.architecture_map?.map, NODE_DOMAIN_MAP, "the protocol carries the adopted map");
		const control = protocol.controls.find((c) => c.control_id === "architecture");
		assert.ok(control, `the protocol carries the architecture control: ${protocol.controls.map((c) => c.control_id)}`);
		assert.deepEqual(control.architecture_map, NODE_DOMAIN_MAP, "whose rules are written from the adopted map");
		assert.equal(
			protocol.qualifications.architecture?.qualified,
			true,
			JSON.stringify(protocol.qualifications.architecture),
		);

		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.equal(architecture.blind_spot, null, "the requirement is measured");
		const measure = architecture.measures.find((m) => m.control_id === "architecture");
		assert.equal(measure?.verdict, "FAIL", JSON.stringify(architecture.measures));

		const report = await t.harness.report(changeId);
		const finding = report.survey?.findings.find(
			(f) => f.control_id === "architecture" && f.path === USER && f.message.includes(`${USER}:${IMPORT_LINE}:`),
		);
		assert.ok(finding, `a finding is at the line of the import: ${JSON.stringify(report.survey?.findings)}`);
		assert.match(finding.message, /part domain keeps the rings of its onion/, "it names the rule broken");
		const text = formatReport(report, "fr");
		assert.ok(
			text.includes(`architecture ${USER}: ${USER}:${IMPORT_LINE}: part domain keeps the rings of its onion`),
			`the survey section gives the finding with its rule, its file and its line:\n${text}`,
		);
		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});

	it("sur un paquet qui tient sa carte, le survey mesure l'exigence en PASS sans constat", async () => {
		const { after, survey, architecture } = await adopted(HELD_SOURCES);
		assert.ok(architecture, `the survey carries the architecture requirement: ${after.steps.join(" | ")}`);
		const measure = architecture.measures.find((m) => m.control_id === "architecture");
		assert.equal(measure?.verdict, "PASS", `${architecture.blind_spot} ${JSON.stringify(architecture.measures)}`);
		assert.deepEqual(survey?.controls.find((c) => c.control_id === "architecture")?.findings, []);
	});

	it("une installation qui échoue gèle la carte sans contrôle d'architecture et le survey nomme l'exigence comme angle mort avec la raison de npm", async () => {
		const { after, protocol, architecture } = await adopted(NODE_DOMAIN_SOURCES, false);
		assert.ok(protocol, `a protocol is frozen: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		assert.deepEqual(protocol.architecture_map?.map, NODE_DOMAIN_MAP, "the adopted map is frozen all the same");
		assert.deepEqual(
			protocol.controls.filter((c) => c.control_id === "architecture"),
			[],
			"and no architecture control",
		);
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			/ENOTFOUND registry\.npmjs\.org/,
			"the requirement is a blind spot, with the reason npm gave",
		);
		assert.deepEqual(architecture.measures, []);
	});

	it("sur un paquet dont toutes les sources sont en .mts, l'adoption gèle la carte sans contrôle d'architecture, le survey nomme l'exigence comme angle mort parce que dependency-cruiser ne lit aucune de ses sources, et l'état des lieux mesure les tests du projet", async () => {
		const { after, protocol, survey, architecture } = await adopted(NODE_MTS_SOURCES, true, NODE_MTS_MAP);
		assert.ok(protocol, `a protocol is frozen: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		assert.deepEqual(protocol.architecture_map?.map, NODE_MTS_MAP, "the adopted map is frozen all the same");
		assert.deepEqual(
			protocol.controls.filter((c) => c.control_id === "architecture"),
			[],
			"and no architecture control",
		);
		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.match(
			architecture.blind_spot ?? "",
			/dependency-cruiser 18\.5\.0 reads none of the sources of its folders/,
			"the requirement is a blind spot, with the reason",
		);
		assert.deepEqual(architecture.measures, []);
		assert.equal(
			survey?.controls.find((c) => c.control_id === "unit")?.verdict,
			"PASS",
			"the tests of the project are measured",
		);
	});
});
