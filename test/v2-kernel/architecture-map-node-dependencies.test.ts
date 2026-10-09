/**
 * Adopting the architecture map of an npm package also has the dependencies `package.json` declares compared to
 * those its code uses: the decision names Knip 6.40.0 and the rule it checks, installed by npm in the same step as
 * dependency-cruiser and swc; the protocol freezes the dependencies control qualified by its witnesses beside the
 * architecture control, and the survey measures the requirement about the architecture by both, each gap located
 * in the report. npm, dependency-cruiser and Knip are fakes, the readers are the real ones.
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
	nodePackage,
	nodeSurveyedArchitecture,
} from "../helpers/node-architecture-survey.ts";
import { treeDigest } from "../helpers/quality-survey.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const REPOSITORY = "src/adapters/db/sql-user-repository.ts";

/** The manifest of the package `users`, declaring `declared` besides TypeScript 7.0.2 for its development. */
const manifest = (declared: Record<string, string>) =>
	`${JSON.stringify(
		{
			name: "users",
			version: "1.0.0",
			type: "module",
			scripts: { test: "node --test" },
			dependencies: declared,
			devDependencies: { typescript: "7.0.2" },
		},
		null,
		2,
	)}\n`;

/** The adapter of the story, which imports `pg`. */
const REPOSITORY_USING_PG =
	'import type { UserRepository } from "../../domain/port/user-repository.ts";\nimport pg from "pg";\n\nexport const pool = (): unknown => new pg.Pool();\nexport const repository: UserRepository = { find: () => undefined };\n';
const PG_LINE = REPOSITORY_USING_PG.split("\n").findIndex((l) => l.includes('"pg"')) + 1;

/** The package of the story: its adapter imports `pg`, which `package.json` does not declare, and it declares `lodash`, which no source uses. */
const BREAKING: Record<string, string> = {
	...NODE_DOMAIN_SOURCES,
	"package.json": manifest({ lodash: "4.17.21" }),
	[REPOSITORY]: REPOSITORY_USING_PG,
};
const LODASH_LINE = BREAKING["package.json"]!.split("\n").findIndex((l) => l.includes('"lodash":')) + 1;

/** The package of the story whose `package.json` declares `pg` and no longer `lodash`. */
const DECLARING: Record<string, string> = { ...BREAKING, "package.json": manifest({ pg: "8.16.3" }) };

const INSTALLS = [
	{ package: "dependency-cruiser", version: "18.5.0", manager: "npm" },
	{ package: "@swc/core", version: "1.16.13", manager: "npm" },
	{ package: "knip", version: "6.40.0", manager: "npm" },
];

/** The sentence of `said` up to `marker`, which says what checks the rules of the map; all of `said` without it. */
const sentenceUpTo = (said: string, marker: string) => {
	const at = said.indexOf(marker);
	return at < 0 ? said : said.slice(said.lastIndexOf(". ", at) + 2, at + marker.length);
};

/** The survey of the package carrying `sources`, stopped on the map it proposes. */
async function proposed(sources: Record<string, string> = BREAKING) {
	const project = nodePackage(sources);
	const before = treeDigest(project);
	const surveyed = await nodeSurveyedArchitecture(project, [NODE_DOMAIN_MAP]);
	return { ...surveyed, project, before };
}

/** The survey once the owner adopted the map: the frozen protocol, and what the survey says of ARC-01. */
async function adopted(sources: Record<string, string>) {
	const { t, npm, changeId, project, before } = await proposed(sources);
	answerMap(t, changeId, "adopt_map");
	const after = await t.harness.advance(changeId, { max_steps: 60 });
	const state = t.ledger.loadChange(changeId)!.state;
	const protocol = (await t.harness.artifacts.latest<Protocol>(state, "protocol"))?.content;
	const survey = (await t.harness.artifacts.latest<Survey>(state, "survey"))?.content;
	const architecture = survey?.requirements.find((r) => r.requirement_id === "ARC-01");
	return { t, npm, changeId, project, before, after, protocol, survey, architecture };
}

describe("adopting the architecture map of an npm package compares its declared dependencies to those its code uses", () => {
	it("l'issue d'adoption de la carte d'un paquet npm nomme Knip 6.40.0, son installation dans la même étape que dependency-cruiser et @swc/core, et la règle qu'il vérifie", async () => {
		const { t, changeId } = await proposed();
		const asked = t.harness.pendingDecisions(changeId).find((d) => d.interaction === "IH-04");
		assert.ok(asked, "the map is presented");
		const adopt = asked.options.find((o) => o.id === "adopt_map");
		assert.ok(adopt, "the owner may adopt the map");
		const said = `${adopt.label} — ${adopt.effect}`;
		for (const expected of [
			"installe dependency-cruiser 18.5.0, @swc/core 1.16.13, knip 6.40.0 comme dépendances de développement exactes dans une copie",
			"réseau pour cette seule étape",
			"knip 6.40.0 vérifie aussi, à chaque exécution, que le paquet déclare dans package.json les dépendances que son code utilise, et utilise celles qu'il déclare",
			"rien n'est écrit dans le projet",
		])
			assert.ok(said.includes(expected), `« ${expected} » in ${said}`);
		const checksTheMap = sentenceUpTo(said, "règles que 495 écrit depuis la carte");
		assert.ok(!checksTheMap.includes("knip"), `Knip is not said to check the rules of the map: ${checksTheMap}`);

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
			"installs dependency-cruiser 18.5.0, @swc/core 1.16.13, knip 6.40.0 as exact development dependencies in a copy",
			"network for that step alone",
			"knip 6.40.0 also checks, at each run, that the package declares in package.json the dependencies its code uses, and uses those it declares",
			"nothing is written in the project",
		])
			assert.ok(saidInEnglish.includes(expected), `« ${expected} » in ${saidInEnglish}`);
		const checksTheMapInEnglish = sentenceUpTo(saidInEnglish, "rules 495 writes from the map");
		assert.ok(
			!checksTheMapInEnglish.includes("knip"),
			`Knip is not said to check the rules of the map: ${checksTheMapInEnglish}`,
		);
	});

	it("l'adoption installe les trois paquets en une étape, gèle le contrôle des dépendances qualifié, et le survey mesure l'exigence d'architecture par architecture et par dependencies, ce dernier en FAIL avec l'usage de pg à src/adapters/db/sql-user-repository.ts et la déclaration inutilisée de lodash à package.json, que le rapport donne aussi, sans changer le digest du projet", async () => {
		const { t, npm, changeId, project, before, after, protocol, architecture } = await adopted(BREAKING);
		const installs = npm.installs();
		assert.equal(installs.length, 1, `npm installs once: ${after.steps.join(" | ")}`);
		for (const asked of ["dependency-cruiser@18.5.0", "@swc/core@1.16.13", "knip@6.40.0"])
			assert.ok(
				installs[0]!.command.includes(asked),
				`the install asks for ${asked}: ${installs[0]!.command.join(" ")}`,
			);
		assert.ok(
			npm.runs.filter((r) => r !== installs[0]).every((r) => r.network !== "allowed"),
			"the network is open for the install alone",
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
		const use = findings.find((f) => f.path === REPOSITORY && f.message.includes(`${REPOSITORY}:${PG_LINE}:`));
		assert.ok(use, `the undeclared use is at the line of the import: ${JSON.stringify(findings)}`);
		assert.match(use.message, /the package uses pg without declaring it/);
		const lodash = findings.find(
			(f) => f.path === "package.json" && f.message.includes(`package.json:${LODASH_LINE}:`),
		);
		assert.ok(lodash, `the unused declaration is at its line of package.json: ${JSON.stringify(findings)}`);
		assert.match(lodash.message, /the package declares lodash without using it/);
		const text = formatReport(report, "fr");
		for (const expected of [
			`dependencies ${REPOSITORY}: ${REPOSITORY}:${PG_LINE}:`,
			`dependencies package.json: package.json:${LODASH_LINE}:`,
		])
			assert.ok(text.includes(expected), `the survey section gives « ${expected} »:\n${text}`);
		assert.equal(treeDigest(project), before, "the project tree is as it was");
	});

	it("sur un paquet qui déclare ce que son code utilise, le survey mesure l'exigence par dependencies en PASS sans constat", async () => {
		const { after, survey, architecture } = await adopted(DECLARING);
		assert.ok(architecture, `the survey carries the architecture requirement: ${after.steps.join(" | ")}`);
		const measure = architecture.measures.find((m) => m.control_id === "dependencies");
		assert.equal(measure?.verdict, "PASS", `${architecture.blind_spot} ${JSON.stringify(architecture.measures)}`);
		assert.deepEqual(survey?.controls.find((c) => c.control_id === "dependencies")?.findings, []);
	});
});
