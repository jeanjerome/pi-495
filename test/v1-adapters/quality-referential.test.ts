/**
 * The quality referential a Maven target is offered: data of the adapter, each rule with what it
 * measures, the PMD rule that checks it, its threshold, the version of PMD, the documentation page
 * that justifies it and the date those were established. Nothing comes from a model, and nothing is
 * written in the target.
 */
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { editedFile } from "../../src/application/complement.ts";
import { validate } from "../../src/contracts/validate.ts";
import { RecommendedComplement, RULESET_PLACEHOLDER } from "../../src/contracts/v1/protocol.ts";
import { fixtureJava, removedAfterEach, tempDir } from "../helpers/fixtures.ts";
import { PMD_DECLARED_BY_PROJECT } from "../helpers/quality-survey.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "QLT-01", revision: 1 }];

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-quality-referential-", cleanups);
});

function mavenProject(name: string, extraPlugin = ""): string {
	const project = join(root, name);
	fixtureJava(project);
	if (extraPlugin) {
		const pom = join(project, "pom.xml");
		writeFileSync(pom, readFileSync(pom, "utf8").replace("</plugins>", `${extraPlugin}    </plugins>`));
	}
	return project;
}

describe("the Maven adapter declares its quality referential and recommends PMD", () => {
	it("la détection d'un projet Maven sans PMD porte le référentiel de qualité, chaque règle avec sa nature, sa règle PMD, son seuil, la version de PMD, sa source et sa date, et recommande maven-pmd-plugin 3.28.0 avec la modification du POM et sa résolution", () => {
		const project = mavenProject("without-pmd");
		const offer = STACKS_OF_495.recognise(project, REFS, NODE).quality_referential;
		assert.equal(offer?.kind, "proposed", "a Maven project without PMD is offered the referential");
		if (offer?.kind !== "proposed") return;
		assert.deepEqual(
			offer.rules.map((r) => [r.nature, r.rule_id, r.control_id, r.properties]),
			[
				["complexity", "CyclomaticComplexity", "pmd", { methodReportLevel: "10" }],
				["complexity", "CognitiveComplexity", "pmd", { reportLevel: "15" }],
				["dead_code", "UnusedPrivateMethod", "pmd", {}],
				["dead_code", "UnusedPrivateField", "pmd", {}],
				["dead_code", "UnusedLocalVariable", "pmd", {}],
				["duplication", "CPD", "cpd", { minimumTokens: "100" }],
			],
		);
		const thresholds = offer.rules.map((r) => r.threshold);
		assert.match(thresholds[0]!, /\b10\b/);
		assert.match(thresholds[1]!, /\b15\b/);
		assert.match(thresholds[5]!, /\b100\b/);
		for (const rule of offer.rules) {
			assert.equal(rule.tool, "PMD 7.17.0", rule.rule_id);
			assert.equal(rule.established_on, "2026-10-03", rule.rule_id);
			assert.match(rule.source, /^[a-z.-]+\.[a-z]+\/\S+$/, `${rule.rule_id}: a host and a path to read`);
			assert.ok(rule.threshold.length > 0, rule.rule_id);
		}
		assert.match(offer.rules[0]!.source, /pmd-doc-7\.17\.0\/pmd_rules_java_design\.html#cyclomaticcomplexity$/);
		assert.match(offer.rules[2]!.source, /pmd-doc-7\.17\.0\/pmd_rules_java_bestpractices\.html#unusedprivatemethod$/);

		const [recommendation] = offer.recommendations;
		assert.ok(recommendation, "the referential is brought by one recommendation");
		assert.deepEqual(validate(RecommendedComplement, recommendation), recommendation);
		assert.equal(recommendation.tool, "org.apache.maven.plugins:maven-pmd-plugin");
		assert.equal(recommendation.version, "3.28.0");
		assert.equal(recommendation.established_on, "2026-10-03");
		const edit = recommendation.edit;
		assert.ok(edit, "the recommendation carries the edit of the POM");
		assert.equal(edit.path, "pom.xml");
		const declaration = edit.wanted.slice(edit.current.length);
		for (const expected of ["maven-pmd-plugin", "<version>3.28.0</version>", "<ruleset>${pmd495.ruleset}</ruleset>"])
			assert.ok(declaration.includes(expected), expected);
		assert.ok(editedFile(project, edit) !== null, "the edit applies to the POM of the project");
		assert.deepEqual(recommendation.install, {
			package: "org.apache.maven.plugins:maven-pmd-plugin",
			version: "3.28.0",
			manager: "maven",
		});
	});

	it("une fois PMD déclaré par 495 dans la copie, pmd et cpd tournent hors ligne, le réseau fermé, et pmd lit le jeu de règles que le runner écrit, jamais un fichier de l'arbre analysé", () => {
		const project = mavenProject("adopted-pmd");
		const offer = STACKS_OF_495.recognise(project, REFS, NODE).quality_referential;
		assert.equal(offer?.kind, "proposed");
		const edit = offer?.kind === "proposed" ? offer.recommendations[0]?.edit : undefined;
		if (edit === undefined) return;
		const pom = editedFile(project, edit);
		assert.ok(pom !== null, "the edit applies to the POM of the project");
		writeFileSync(join(project, "pom.xml"), pom);

		const controls = STACKS_OF_495.recognise(project, REFS, NODE).controls;
		const commandOf = (id: string) => controls.find((c) => c.control_id === id)?.command;
		assert.deepEqual(commandOf("pmd"), [
			"mvn",
			"-B",
			"-q",
			"-o",
			"compile",
			"pmd:pmd",
			`-Dpmd495.ruleset=${RULESET_PLACEHOLDER}`,
		]);
		assert.deepEqual(commandOf("cpd"), ["mvn", "-B", "-q", "-o", "compile", "pmd:cpd", "-DminimumTokens=100"]);
		for (const id of ["pmd", "cpd"])
			assert.equal(controls.find((c) => c.control_id === id)?.network, "denied", `${id} runs with the network closed`);
	});

	it("un POM qui déclare déjà maven-pmd-plugin ne reçoit ni référentiel ni recommandation, et une note dit que le projet configure PMD lui-même", () => {
		const detection = STACKS_OF_495.recognise(mavenProject("with-pmd", PMD_DECLARED_BY_PROJECT), REFS, NODE);
		const offer = detection.quality_referential;
		assert.equal(offer?.kind, "not_proposed", "the project's own PMD is not replaced by 495's referential");
		if (offer?.kind !== "not_proposed") return;
		assert.match(offer.note, /configures PMD itself/);
		assert.ok(!("rules" in offer), "no referential");
		assert.ok(
			detection.recommendations.every((r) => !r.tool.includes("maven-pmd-plugin")),
			"no recommendation of PMD",
		);
	});
});
