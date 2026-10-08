/**
 * Adopting the architecture map of a Maven reactor also has the dependencies each module declares compared to
 * those its code uses: the decision names `dependency:analyze` of maven-dependency-plugin 3.11.0 and the rule it
 * checks, resolved in the same step as ArchUnit and declared in a copy of each POM of the reactor; the protocol
 * freezes the dependencies control qualified by its witnesses beside the architecture control, and the survey
 * measures the requirement about the architecture by both, each gap located in the report. Maven and its plugins
 * are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildDecisionRequest } from "../../src/application/decisions.ts";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answerMap, surveyedArchitecture } from "../helpers/architecture-survey.ts";
import {
	DEPENDENCIES_MAP,
	DEPENDENCIES_REACTOR,
	INFRASTRUCTURE_POM,
	lineOf,
	MAIN,
} from "../helpers/dependencies-reactor.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { trackedProject } from "../helpers/harness-fixture.ts";
import { treeDigest } from "../helpers/quality-survey.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

/** The reactor of the story with its POMs saying what its code uses: `app` declares `domain` and the API of JUnit, `infrastructure` no Guava. */
const DECLARING_REACTOR: Record<string, string> = {
	...DEPENDENCIES_REACTOR,
	"app/pom.xml": DEPENDENCIES_REACTOR["app/pom.xml"]!.replace(
		"<artifactId>infrastructure</artifactId>",
		"<artifactId>infrastructure</artifactId>\n      <version>1.0.0</version>\n    </dependency>\n    <dependency>\n      <groupId>io.demo</groupId>\n      <artifactId>domain</artifactId>",
	).replace("<artifactId>junit-jupiter</artifactId>", "<artifactId>junit-jupiter-api</artifactId>"),
	[INFRASTRUCTURE_POM]: DEPENDENCIES_REACTOR[INFRASTRUCTURE_POM]!.replace(
		/ {4}<dependency>\n {6}<groupId>com\.google\.guava<\/groupId>[\s\S]*?<\/dependency>\n/,
		"",
	),
};

/** The survey of `reactor`, stopped on the map it proposes. */
async function proposed(reactor: Record<string, string> = DEPENDENCIES_REACTOR) {
	const project = trackedProject((root) => writeFiles(root, reactor));
	const before = treeDigest(project);
	const surveyed = await surveyedArchitecture(project, [DEPENDENCIES_MAP]);
	return { ...surveyed, project, before };
}

/** The survey once the owner adopted the map: the frozen protocol, and what the survey says of ARC-01. */
async function adopted(reactor: Record<string, string> = DEPENDENCIES_REACTOR) {
	const { t, maven, changeId, project, before } = await proposed(reactor);
	answerMap(t, changeId, "adopt_map");
	const after = await t.harness.advance(changeId, { max_steps: 60 });
	const state = t.ledger.loadChange(changeId)!.state;
	const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
	const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
	const architecture = survey?.requirements.find((r) => r.requirement_id === "ARC-01");
	return { t, maven, changeId, project, before, after, protocol, survey, architecture };
}

const USE_LINE = lineOf(MAIN, "import io.demo.domain.User;");
const GUAVA_LINE = lineOf(INFRASTRUCTURE_POM, "<artifactId>guava</artifactId>");

describe("adopting the architecture map of a Maven reactor compares its declared dependencies to those its code uses", () => {
	it("l'issue d'adoption de la carte nomme dependency:analyze de maven-dependency-plugin 3.11.0, la règle qu'il vérifie, sa résolution dans la même étape qu'ArchUnit et sa déclaration dans une copie de chaque POM du réacteur", async () => {
		const { t, changeId } = await proposed();
		const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-04");
		assert.ok(asked, "the map is presented");
		const adopt = asked.options.find((o) => o.id === "adopt_map");
		assert.ok(adopt, "the owner may adopt the map");
		const said = `${adopt.label} — ${adopt.effect}`;
		for (const expected of [
			"dependency:analyze de org.apache.maven.plugins:maven-dependency-plugin 3.11.0",
			"chaque module déclare dans son POM les dépendances que son code utilise, et utilise celles qu'il déclare",
			"dans la même étape",
			"réseau pour cette seule étape",
			"dans une copie de chaque POM du réacteur",
			"rien n'est écrit dans le projet",
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
			"dependency:analyze of org.apache.maven.plugins:maven-dependency-plugin 3.11.0",
			"every module declares in its POM the dependencies its code uses, and uses those it declares",
			"in the same step",
			"network for that step alone",
			"in a copy of each POM of the reactor",
			"nothing is written in the project",
		])
			assert.ok(saidInEnglish.includes(expected), `« ${expected} » in ${saidInEnglish}`);
	});

	it("l'adoption gèle le contrôle des dépendances qualifié, et le survey mesure l'exigence d'architecture par architecture et par dependencies, ce dernier en FAIL avec l'usage de io.demo:domain par app à Main.java et la déclaration inutilisée de Guava à infrastructure/pom.xml, que le rapport donne aussi, sans changer le digest du projet", async () => {
		const { t, maven, changeId, project, before, after, protocol, architecture } = await adopted();
		const resolutions = maven.runs.filter((r) => r.command.some((part) => part.endsWith(":resolve-plugins")));
		assert.equal(
			resolutions.length,
			1,
			`ArchUnit and the dependency plugin are resolved in one step: ${after.steps.join(" | ")}`,
		);
		assert.ok(
			maven.runs.filter((r) => r !== resolutions[0]).every((r) => r.network !== "allowed"),
			"the network is open for the resolution alone",
		);

		assert.ok(protocol, `a protocol is frozen: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		const ids = protocol.controls.map((c) => c.control_id);
		assert.ok(
			ids.includes("architecture") && ids.includes("dependencies"),
			`the protocol carries both controls: ${ids}`,
		);
		assert.equal(
			protocol.qualifications.dependencies?.qualified,
			true,
			`qualified by its witnesses: ${JSON.stringify(protocol.qualifications.dependencies?.notes)}`,
		);

		assert.ok(architecture, "the survey carries the architecture requirement");
		assert.equal(architecture.blind_spot, null, "the requirement is measured");
		const measured = architecture.measures.map((m) => m.control_id);
		assert.ok(
			measured.includes("architecture") && measured.includes("dependencies"),
			`the requirement is measured by both controls: ${JSON.stringify(architecture.measures)}`,
		);
		assert.equal(architecture.measures.find((m) => m.control_id === "dependencies")?.verdict, "FAIL");

		const report = await t.harness.report(changeId);
		const findings = report.survey?.findings.filter((f) => f.control_id === "dependencies") ?? [];
		const use = findings.find((f) => f.path === MAIN && f.message.includes(`${MAIN}:${USE_LINE}:`));
		assert.ok(use, `the undeclared use is at the line of the import: ${JSON.stringify(findings)}`);
		assert.match(use.message, /app uses io\.demo:domain without declaring it/);
		const guava = findings.find(
			(f) => f.path === INFRASTRUCTURE_POM && f.message.includes(`${INFRASTRUCTURE_POM}:${GUAVA_LINE}:`),
		);
		assert.ok(guava, `the unused declaration is at its line of the POM: ${JSON.stringify(findings)}`);
		assert.match(guava.message, /infrastructure declares com\.google\.guava:guava without using it/);
		const text = formatReport(report, "fr");
		for (const expected of [
			`dependencies ${MAIN}: ${MAIN}:${USE_LINE}:`,
			`dependencies ${INFRASTRUCTURE_POM}: ${INFRASTRUCTURE_POM}:${GUAVA_LINE}:`,
		])
			assert.ok(text.includes(expected), `the survey section gives « ${expected} »:\n${text}`);
		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});

	it("sur un réacteur dont les POM déclarent ce que le code utilise, le survey mesure l'exigence par dependencies en PASS sans constat", async () => {
		assert.notEqual(DECLARING_REACTOR["app/pom.xml"], DEPENDENCIES_REACTOR["app/pom.xml"], "app declares domain");
		assert.ok(!DECLARING_REACTOR[INFRASTRUCTURE_POM]!.includes("guava"), "infrastructure declares no Guava");
		const { after, survey, architecture } = await adopted(DECLARING_REACTOR);
		assert.ok(architecture, `the survey carries the architecture requirement: ${after.steps.join(" | ")}`);
		const measure = architecture.measures.find((m) => m.control_id === "dependencies");
		assert.equal(measure?.verdict, "PASS", `${architecture.blind_spot} ${JSON.stringify(architecture.measures)}`);
		assert.deepEqual(survey?.controls.find((c) => c.control_id === "dependencies")?.findings, []);
	});
});
