/**
 * The reading of the model goes with the map it proposes: statements about the data, the cross-cutting concerns
 * and the deployment of the project, each with its hints. The kernel confronts each hint with the reference as it
 * does those of the map, sets aside a statement whose hint designates no line and says so; the reading enters the
 * survey section of the report under its own name, apart from the findings and with no verdict depending on it.
 * Maven and its plugins are fakes, the readers are the real ones.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ArchitectureHint, ArchitectureMap, Protocol } from "../../src/contracts/v1/protocol.ts";
import type { Survey } from "../../src/domain/survey.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { answerMap, surveyedArchitecture } from "../helpers/architecture-survey.ts";
import { DEPENDENCIES_MAP, DEPENDENCIES_REACTOR } from "../helpers/dependencies-reactor.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { trackedProject } from "../helpers/harness-fixture.ts";

const JPA = "infrastructure/src/main/java/io/demo/infra/JpaOrderRepository.java";
const ORDER_SERVICE = "app/src/main/java/io/demo/app/OrderService.java";

/** The reactor of the story with a repository written by JPA, a service whose transactions `@Transactional` opens, and a Dockerfile of 12 lines. */
const READ_REACTOR: Record<string, string> = {
	...DEPENDENCIES_REACTOR,
	[JPA]:
		"package io.demo.infra;\n\nimport io.demo.domain.User;\n\n@jakarta.persistence.Entity\npublic class JpaOrderRepository {\n    public User owner() {\n        return new User();\n    }\n}\n",
	[ORDER_SERVICE]:
		"package io.demo.app;\n\nimport io.demo.infra.JpaOrderRepository;\n\npublic class OrderService {\n    private final JpaOrderRepository orders = new JpaOrderRepository();\n\n    // the transaction of each order\n    @jakarta.transaction.Transactional\n    public Object owner() {\n        return orders.owner();\n    }\n}\n",
	Dockerfile:
		'FROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY app/target/app-1.0.0.jar app.jar\nEXPOSE 8080\nENV JAVA_OPTS=""\nUSER 1000\nHEALTHCHECK CMD true\nLABEL org.opencontainers.image.title=demo\nVOLUME /data\nARG BUILD=1\nSTOPSIGNAL SIGTERM\nENTRYPOINT ["java", "-jar", "app.jar"]\n',
};

const hint = (path: string, line: number, says: string): ArchitectureHint[] => [{ path, line, says }];

const DATA = "the orders are written by JPA";
const TRANSACTIONS = "the transactions are opened by @Transactional";
const IMAGE = "the application is delivered as an image";

/** The map of the story with the reading of the model, its deployment supported at line `dockerLine` of the Dockerfile. */
function readMap(dockerLine: number): ArchitectureMap {
	return {
		...DEPENDENCIES_MAP,
		reading: {
			data: [{ statement: DATA, hints: hint(JPA, 5, "an entity of JPA") }],
			cross_cutting: [{ statement: TRANSACTIONS, hints: hint(ORDER_SERVICE, 9, "a transactional method") }],
			deployment: [{ statement: IMAGE, hints: hint("Dockerfile", dockerLine, "the base image") }],
		},
	};
}

/** The survey of the reactor once the owner adopted `map`: the frozen protocol, the survey, and the report in both languages. */
async function adopted(map: ArchitectureMap) {
	const project = trackedProject((root) => writeFiles(root, READ_REACTOR));
	const { t, agent, changeId } = await surveyedArchitecture(project, [map]);
	answerMap(t, changeId, "adopt_map");
	const after = await t.harness.advance(changeId, { max_steps: 60 });
	const state = t.ledger.loadChange(changeId)!.state;
	const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
	const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
	const report = await t.harness.report(changeId);
	return { agent, after, protocol, survey, report };
}

/** The lines of the survey section from the reading of the model to the findings, in `lang`. */
function readingLines(text: string, lang: "fr" | "en"): string[] {
	const lines = text.split("\n");
	const start = lines.findIndex((l) =>
		l.trim().startsWith(lang === "fr" ? "Lecture du modèle" : "Reading of the model"),
	);
	assert.ok(start >= 0, `${lang}: the survey section gives the reading of the model:\n${text}`);
	const end = lines.findIndex((l, i) => i > start && l.trim() === (lang === "fr" ? "Constats:" : "Findings:"));
	return lines.slice(start, end < 0 ? undefined : end);
}

/** The statement lines under the heading `heading` of the reading, up to the next heading. */
function under(reading: readonly string[], heading: string): string[] {
	const at = reading.findIndex((l) => l.trim() === heading);
	assert.ok(at > 0, `« ${heading} » in the reading:\n${reading.join("\n")}`);
	const depth = reading[at]!.search(/\S/);
	const next = reading.findIndex((l, i) => i > at && l.search(/\S/) <= depth);
	return reading.slice(at + 1, next < 0 ? undefined : next);
}

const HEADINGS = {
	fr: { data: "données :", cross_cutting: "préoccupations transverses :", deployment: "déploiement :" },
	en: { data: "data:", cross_cutting: "cross-cutting concerns:", deployment: "deployment:" },
} as const;

describe("the reading of the model goes with the adopted map, apart from the findings", () => {
	it("la consigne de l'intervention et la skill demandent une lecture des données, des préoccupations transverses et du déploiement, chaque énoncé avec ses indices", async () => {
		const project = trackedProject((root) => writeFiles(root, READ_REACTOR));
		const { agent } = await surveyedArchitecture(project, [DEPENDENCIES_MAP]);
		const [mandate] = agent.mapMandates;
		assert.ok(mandate, "an intervention proposes the map");
		const told = `${mandate.system_prompt}\n${mandate.prompt}`;
		for (const expected of [
			"a reading of the data, the cross-cutting concerns and the deployment of the project",
			"each statement with its hints, a file and a line that exists in it",
			'in "data", what persists the data and how the code reaches it',
			'in "cross_cutting", how security, errors, logging, validation and configuration are handled',
			'in "deployment", how the project is built, packaged and run',
			'"reading"',
			'"cross_cutting"',
			'"deployment"',
		])
			assert.ok(told.includes(expected), `the instructions ask « ${expected} »:\n${told}`);

		const [skillFile] = mandate.skills;
		assert.ok(skillFile, "the intervention receives the identification skill");
		const skill = readFileSync(skillFile, "utf8");
		for (const expected of [
			"## The reading of the model",
			"### Data",
			"### Cross-cutting concerns",
			"### Deployment",
			"each statement with its hints, a file and a line that exists in it",
			"6. Data Architecture",
			"7. Cross-Cutting Concerns Implementation",
			"12. Deployment Architecture",
		])
			assert.ok(skill.includes(expected), `the skill says « ${expected} »`);
		assert.doesNotMatch(
			skill,
			/the data architecture, the cross-cutting concerns, the deployment[^.]*were left out/,
			"the provenance no longer says these sections were left out",
		);
	});

	it("la section état des lieux d'une carte adoptée donne les énoncés de la lecture sur JPA, @Transactional et le Dockerfile, chacun avec son indice, comme lecture du modèle, en anglais et en français, et aucun n'est un constat ni ne change un verdict", async () => {
		const { after, protocol, survey, report } = await adopted(readMap(1));
		assert.ok(protocol?.architecture_map, `the map is adopted: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		for (const lang of ["fr", "en"] as const) {
			const reading = readingLines(formatReport(report, lang), lang);
			for (const [concern, statement, place] of [
				["data", DATA, `${JPA}:5`],
				["cross_cutting", TRANSACTIONS, `${ORDER_SERVICE}:9`],
				["deployment", IMAGE, "Dockerfile:1"],
			] as const) {
				const lines = under(reading, HEADINGS[lang][concern]);
				assert.ok(
					lines.some((l) => l.includes(statement) && l.includes(place)),
					`${lang}: « ${statement} » at ${place} under ${HEADINGS[lang][concern]}:\n${reading.join("\n")}`,
				);
			}
		}
		const said = [DATA, TRANSACTIONS, IMAGE];
		assert.deepEqual(
			(report.survey?.findings ?? []).filter((f) => said.some((s) => f.message.includes(s))),
			[],
			"no statement of the reading is a finding",
		);

		const without = await adopted(DEPENDENCIES_MAP);
		const verdicts = (s: Survey | undefined) =>
			s?.requirements.map((r) => ({
				id: r.requirement_id,
				measures: r.measures.map((m) => [m.control_id, m.verdict]),
			}));
		assert.ok(without.survey, "the same reactor surveyed with the map alone");
		assert.deepEqual(verdicts(survey), verdicts(without.survey), "no verdict of the survey depends on the reading");
	});

	it("un énoncé dont l'indice Dockerfile:40 ne désigne aucune ligne est écarté de la lecture, le rapport dit pourquoi, et la carte est adoptée", async () => {
		assert.equal(READ_REACTOR.Dockerfile!.split("\n").length - 1, 12, "the Dockerfile has 12 lines");
		const { after, protocol, report } = await adopted(readMap(40));
		assert.ok(protocol?.architecture_map, `the map is adopted: ${after.stopped_because}, ${after.steps.join(" | ")}`);
		for (const [lang, setAside] of [
			["fr", /écarté.*Dockerfile:40.*ne désigne aucune ligne de la référence/],
			["en", /set aside.*Dockerfile:40.*designates no line of the reference/],
		] as const) {
			const reading = readingLines(formatReport(report, lang), lang);
			assert.deepEqual(
				under(reading, HEADINGS[lang].deployment).filter((l) => l.includes(IMAGE) && !setAside.test(l)),
				[],
				`${lang}: the reading does not carry the statement:\n${reading.join("\n")}`,
			);
			assert.ok(
				reading.some((l) => l.includes(IMAGE) && setAside.test(l)),
				`${lang}: the reading says the statement was set aside and why:\n${reading.join("\n")}`,
			);
			assert.ok(
				under(reading, HEADINGS[lang].data).some((l) => l.includes(DATA)),
				`${lang}: the other statements are kept`,
			);
		}
	});
});
