/**
 * The quality referential a Node target is offered: data of the adapter, each rule with what it
 * measures, the ESLint rule or the jscpd detection that checks it, its threshold, the analyser and its
 * version, the documentation page that justifies it and the date those were established, with what the
 * analysers read and leave aside. Nothing comes from a model, and nothing is written in the target.
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { jscpdConfig } from "../../src/adapters/stacks/node/quality/jscpd-config.ts";
import { validate } from "../../src/contracts/validate.ts";
import { RecommendedComplement } from "../../src/contracts/v1/protocol.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const NODE = process.execPath;
const REFS = [{ requirement_id: "QLT-01", revision: 1 }];

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-node-quality-referential-", cleanups);
});

function nodeProject(name: string, manifest: Record<string, unknown>): string {
	const project = join(root, name);
	writeFiles(project, {
		"package.json": `${JSON.stringify({ name, version: "1.0.0", type: "module", ...manifest }, null, 2)}\n`,
		"src/index.js": "export const one = 1;\n",
	});
	return project;
}

const WITHOUT_ANALYSERS = { dependencies: { lodash: "4.17.21" }, devDependencies: { vitest: "4.0.0" } };

function proposedOffer(project: string) {
	const offer = STACKS_OF_495.recognise(project, REFS, NODE).quality_referential;
	assert.equal(
		offer?.kind,
		"proposed",
		"a Node project that declares neither eslint nor jscpd is offered the referential",
	);
	if (offer?.kind !== "proposed") throw new Error("no referential is proposed");
	return offer;
}

describe("the Node adapter declares its quality referential and recommends ESLint and jscpd", () => {
	it("la détection d'un projet Node qui ne déclare ni eslint ni jscpd porte le référentiel de qualité, chaque règle avec sa nature, sa règle, son seuil, l'outil et sa version, sa source et sa date, et recommande l'installation d'eslint 10.12.0 et de jscpd 5.4.0", () => {
		const offer = proposedOffer(nodeProject("without-analysers", WITHOUT_ANALYSERS));
		assert.deepEqual(
			offer.rules.map((r) => [r.nature, r.rule_id, r.control_id, r.properties, r.tool]),
			[
				["complexity", "complexity", "eslint", { max: "20" }, "ESLint 10.12.0"],
				["dead_code", "no-unused-vars", "eslint", {}, "ESLint 10.12.0"],
				["dead_code", "no-unused-private-class-members", "eslint", {}, "ESLint 10.12.0"],
				["duplication", "jscpd", "jscpd", { minTokens: "50", minLines: "5" }, "jscpd 5.4.0"],
			],
		);
		const thresholds = offer.rules.map((r) => r.threshold);
		assert.match(thresholds[0]!, /\b20\b/, "a function whose cyclomatic complexity exceeds 20");
		assert.match(thresholds[1]!, /any occurrence/);
		assert.match(thresholds[2]!, /any occurrence/);
		assert.match(thresholds[3]!, /\b50 tokens\b.*\b5 lines\b/, "a block of at least 50 tokens and 5 lines");
		for (const rule of offer.rules) {
			assert.equal(rule.established_on, "2026-10-03", rule.rule_id);
			assert.match(rule.source, /^[a-z.-]+\.[a-z]+\/\S+$/, `${rule.rule_id}: a host and a path to read`);
		}
		assert.match(offer.rules[0]!.source, /eslint\.org\/docs\/\S+\/rules\/complexity$/);
		assert.match(offer.rules[1]!.source, /eslint\.org\/docs\/\S+\/rules\/no-unused-vars$/);
		assert.match(offer.rules[2]!.source, /eslint\.org\/docs\/\S+\/rules\/no-unused-private-class-members$/);
		assert.match(offer.rules[3]!.source, /jscpd/);

		for (const recommendation of offer.recommendations)
			assert.deepEqual(validate(RecommendedComplement, recommendation), recommendation);
		assert.deepEqual(
			offer.recommendations.map((r) => r.install),
			[
				{ package: "eslint", version: "10.12.0", manager: "npm" },
				{ package: "jscpd", version: "5.4.0", manager: "npm" },
			],
			"eslint 10.12.0 and jscpd 5.4.0 are installed with npm",
		);
		for (const recommendation of offer.recommendations) {
			assert.equal(recommendation.test_type, "quality");
			assert.equal(recommendation.established_on, "2026-10-03");
			assert.equal(recommendation.edit, undefined, "an install edits no file of the target by hand");
			assert.match(recommendation.change, /devDependency/);
		}
	});

	it("le périmètre déclaré mesure le module . et nomme comme non mesurés les sources TypeScript et JSX, lodash, vitest, les fichiers d'un autre format et la séparation du code généré, chacun avec sa raison", () => {
		const { perimeter } = proposedOffer(nodeProject("perimeter", WITHOUT_ANALYSERS));
		assert.deepEqual(perimeter.measured, [{ module: ".", root: "." }], "the package is measured as one module");
		assert.deepEqual(perimeter.generated_annotations, [], "no marker of generated code is declared for Node");
		const subjects = perimeter.unmeasured.map((u) => u.subject);
		assert.equal(subjects.length, 5, `five subjects are named: ${subjects.join(" | ")}`);
		const reasonOf = (pattern: RegExp): string => {
			const found = perimeter.unmeasured.find((u) => pattern.test(u.subject));
			assert.ok(found, `${pattern} is named as unmeasured among ${subjects.join(" | ")}`);
			return found.reason;
		};
		assert.match(reasonOf(/TypeScript.*JSX/), /ESLint.*parser/, "ESLint reads no TypeScript nor JSX without a parser");
		assert.match(reasonOf(/^lodash$/), /outside the tree/, "a declared dependency is outside the tree");
		assert.match(reasonOf(/^vitest$/), /outside the tree/, "a declared development dependency is outside the tree");
		assert.match(
			reasonOf(/format other than JavaScript and TypeScript/),
			/jscpd/,
			"jscpd reads JavaScript and TypeScript",
		);
		assert.match(reasonOf(/generated code/), /no marker of generated code/, "generated code is not told apart");
	});

	it("un package.json qui déclare eslint ne reçoit ni référentiel ni recommandation, et une note dit que le projet déclare ESLint lui-même", () => {
		const detection = STACKS_OF_495.recognise(
			nodeProject("with-eslint", { devDependencies: { eslint: "9.0.0" } }),
			REFS,
			NODE,
		);
		const offer = detection.quality_referential;
		assert.equal(offer?.kind, "not_proposed", "the project's own ESLint is not replaced by 495's referential");
		if (offer?.kind !== "not_proposed") return;
		assert.match(offer.note, /declares ESLint itself/);
		assert.ok(
			detection.recommendations.every((r) => r.tool !== "eslint" && r.tool !== "jscpd"),
			"no recommendation of eslint nor jscpd",
		);

		const withJscpd = STACKS_OF_495.recognise(
			nodeProject("with-jscpd", { devDependencies: { jscpd: "4.0.0" } }),
			REFS,
			NODE,
		);
		assert.equal(
			withJscpd.quality_referential?.kind,
			"not_proposed",
			"a project that declares jscpd is not offered it",
		);
		assert.ok(
			withJscpd.quality_referential?.kind === "not_proposed" &&
				/declares jscpd itself/.test(withJscpd.quality_referential.note),
			"the note says the project declares jscpd itself",
		);

		const refusedRunner = STACKS_OF_495.recognise(
			nodeProject("with-eslint-and-a-refused-runner", {
				scripts: { test: "tsc && node --test" },
				devDependencies: { eslint: "9.0.0" },
			}),
			REFS,
			NODE,
		);
		assert.notEqual(
			refusedRunner.quality_referential?.kind,
			"proposed",
			"a project that declares ESLint is not offered the referential whatever its scripts.test",
		);
	});

	it("un package.json qui épingle eslint 10.12.0 et jscpd 5.4.0, installés sous node_modules avec son propre eslint.config.js, ne reçoit ni contrôle eslint ni jscpd ni référentiel, et une note dit que le projet déclare ESLint lui-même ; seule la détection d'une copie où l'installation adoptée a posé le référentiel déclare les deux contrôles", () => {
		const pinned = { devDependencies: { eslint: "10.12.0", jscpd: "5.4.0" } };
		const installedUnder = (project: string): string => {
			writeFiles(project, {
				"node_modules/eslint/package.json": '{"name":"eslint","version":"10.12.0"}\n',
				"node_modules/jscpd/package.json": '{"name":"jscpd","version":"5.4.0"}\n',
			});
			return project;
		};
		const own = installedUnder(nodeProject("pins-the-referential-itself", pinned));
		writeFiles(own, { "eslint.config.js": 'export default [{ rules: { complexity: "off" } }];\n' });
		const detection = STACKS_OF_495.recognise(own, REFS, NODE);
		const ids = detection.controls.map((c) => c.control_id);
		assert.ok(
			!ids.includes("eslint") && !ids.includes("jscpd"),
			`a project that pins and installs eslint and jscpd itself receives no eslint nor jscpd control: ${ids}`,
		);
		assert.deepEqual(detection.lint_control_ids, [], "neither is a quality control of the project");
		const offer = detection.quality_referential;
		assert.equal(offer?.kind, "not_proposed", "the project's own ESLint is not replaced by 495's referential");
		if (offer?.kind !== "not_proposed") return;
		assert.match(offer.note, /declares ESLint itself/);

		const adopted = [
			{ name: "eslint", version: "10.12.0", integrity: "sha512-eslint" },
			{ name: "jscpd", version: "5.4.0", integrity: "sha512-jscpd" },
		];
		const copy = STACKS_OF_495.recognise(installedUnder(nodeProject("adopted-copy", pinned)), REFS, NODE, adopted);
		assert.deepEqual(
			copy.controls.map((c) => c.control_id).filter((id) => id === "eslint" || id === "jscpd"),
			["eslint", "jscpd"],
			"the copy where the adopted install put the referential declares both controls, because the install says so",
		);
		assert.deepEqual([...copy.lint_control_ids].sort(), ["eslint", "jscpd"]);
	});

	it("les seuils gelés du référentiel sont ceux que reçoivent les analyseurs : eslint reçoit complexity avec max 20 et les deux autres règles à error, jscpd une configuration à minTokens 50 et minLines 5", () => {
		const adopted = [
			{ name: "eslint", version: "10.12.0", integrity: "sha512-eslint" },
			{ name: "jscpd", version: "5.4.0", integrity: "sha512-jscpd" },
		];
		const detection = STACKS_OF_495.recognise(nodeProject("frozen-thresholds", WITHOUT_ANALYSERS), REFS, NODE, adopted);
		const eslint = detection.controls.find((c) => c.control_id === "eslint");
		const rules = eslint?.command[eslint.command.indexOf("--rule") + 1];
		assert.deepEqual(JSON.parse(rules ?? "null"), {
			complexity: ["error", { max: 20 }],
			"no-unused-vars": "error",
			"no-unused-private-class-members": "error",
		});
		const jscpd = detection.controls.find((c) => c.control_id === "jscpd");
		assert.deepEqual(JSON.parse(jscpdConfig(jscpd?.quality_rules ?? [])), { minTokens: 50, minLines: 5 });
	});
});
