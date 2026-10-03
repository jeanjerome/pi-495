/**
 * The report of a survey whose quality referential was adopted, read as the starting point of bringing
 * the code to the standards: under each rule, the violations of the code written by hand apart from those
 * of the generated code, how many of the first each module carries, and what the referential does not
 * measure, each with its reason.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formatReport } from "../../src/presentation/structured/text.ts";
import {
	answer,
	complex,
	duplicated,
	GENERATED_GRADER,
	GRADER,
	IMPORTED_GENERATED,
	onlyComplex,
	QUALIFIED_GENERATED,
	QUALITY_SOURCES,
	qualityProject,
	qualityReactor,
	surveyed,
} from "../helpers/quality-survey.ts";

const RULES = [
	"CyclomaticComplexity",
	"CognitiveComplexity",
	"UnusedPrivateMethod",
	"UnusedPrivateField",
	"UnusedLocalVariable",
	"CPD",
];

/** The report of the survey of `project`, once the owner adopted the referential. */
async function adoptedReport(project: string) {
	const { t, changeId } = await surveyed(project);
	answer(t, changeId, "adopt_referential");
	await t.harness.advance(changeId, { max_steps: 40 });
	const report = await t.harness.report(changeId);
	const referential = report.survey?.referential;
	assert.ok(referential, "the survey section names the adopted referential");
	return { report, referential };
}

/** The lines of the text that the rule `ruleId` heads, up to the next rule. */
function ruleText(text: string, ruleId: string): string {
	const start = text.indexOf(`${ruleId} — `);
	assert.ok(start >= 0, `${ruleId} in the text: ${text}`);
	const next = RULES.map((r) => text.indexOf(`${r} — `, start + 1)).filter((i) => i > start);
	return text.slice(start, next.length > 0 ? Math.min(...next) : undefined);
}

describe("the report of a survey separates perimeters, counts by module and names what is not measured", () => {
	it("sous chaque règle, le rapport sépare les violations du code propriétaire de celles du code généré", async () => {
		const { report, referential } = await adoptedReport(
			qualityProject("", {
				[GRADER]: QUALITY_SOURCES[GRADER]!,
				[GENERATED_GRADER]: complex("GeneratedGrader", QUALIFIED_GENERATED),
				"src/main/java/io/h495/GenA.java": duplicated("GenA", IMPORTED_GENERATED),
				"src/main/java/io/h495/GenB.java": duplicated("GenB", IMPORTED_GENERATED),
			}),
		);
		const under = (ruleId: string) => referential.rules.find((r) => r.rule_id === ruleId)?.findings ?? [];
		const authorshipAt = (ruleId: string, path: string) => under(ruleId).find((f) => f.path === path)?.authorship;
		assert.equal(
			authorshipAt("CyclomaticComplexity", GRADER),
			"proprietary",
			JSON.stringify(under("CyclomaticComplexity")),
		);
		assert.equal(authorshipAt("CyclomaticComplexity", GENERATED_GRADER), "generated");
		assert.deepEqual(
			under("CPD").map((f) => f.authorship),
			["generated"],
		);
		const counts = (ruleId: string) => referential.rules.find((r) => r.rule_id === ruleId)?.proprietary_by_module ?? [];
		assert.deepEqual(
			counts("CyclomaticComplexity"),
			[{ module: ".", violations: 1 }],
			"the count of proprietary code leaves the generated violation out",
		);
		assert.deepEqual(counts("CPD"), [], "a duplication of generated code counts nothing as proprietary");

		for (const [language, proprietary, generated, count] of [
			["en", "proprietary code", "generated code", "proprietary code: 1 in ."],
			["fr", "code propriétaire", "code généré", "code propriétaire : 1 dans ."],
		] as const) {
			const text = ruleText(formatReport(report, language), "CyclomaticComplexity");
			const at = (part: string) => text.indexOf(part);
			assert.ok(text.includes(count), `${language}: one proprietary violation in the module: ${text}`);
			assert.ok(
				at(proprietary) >= 0 && at(proprietary) < at(GRADER) && at(GRADER) < at(generated),
				`${language}: the violation of the class written by hand under ${proprietary}: ${text}`,
			);
			assert.ok(
				at(generated) < at(GENERATED_GRADER),
				`${language}: the violation of the marked class under ${generated}: ${text}`,
			);
			const cpd = ruleText(formatReport(report, language), "CPD");
			assert.ok(
				cpd.indexOf(generated) >= 0 && cpd.indexOf(generated) < cpd.indexOf("GenA.java"),
				`${language}: the duplication under ${generated}: ${cpd}`,
			);
		}
	});

	it("le rapport d'un réacteur de deux modules compte CyclomaticComplexity 1 dans domain et 1 dans infrastructure, UnusedPrivateMethod 1 dans domain", async () => {
		const { report, referential } = await adoptedReport(
			qualityReactor({
				"domain/src/main/java/io/h495/Grader.java": QUALITY_SOURCES[GRADER]!,
				"infrastructure/src/main/java/io/h495/Router.java": onlyComplex("Router"),
			}),
		);
		const counts = (ruleId: string) => referential.rules.find((r) => r.rule_id === ruleId)?.proprietary_by_module ?? [];
		assert.deepEqual(
			counts("CyclomaticComplexity"),
			[
				{ module: "domain", violations: 1 },
				{ module: "infrastructure", violations: 1 },
			],
			JSON.stringify(referential.rules),
		);
		assert.deepEqual(counts("UnusedPrivateMethod"), [{ module: "domain", violations: 1 }]);
		assert.deepEqual(counts("CognitiveComplexity"), [], "a rule nothing violates counts nothing");

		for (const [language, inDomain, inInfrastructure] of [
			["en", "1 in domain", "1 in infrastructure"],
			["fr", "1 dans domain", "1 dans infrastructure"],
		] as const) {
			const text = formatReport(report, language);
			const cyclomatic = ruleText(text, "CyclomaticComplexity");
			assert.ok(cyclomatic.includes(inDomain) && cyclomatic.includes(inInfrastructure), `${language}: ${cyclomatic}`);
			const unused = ruleText(text, "UnusedPrivateMethod");
			assert.ok(unused.includes(inDomain) && !unused.includes(inInfrastructure), `${language}: ${unused}`);
		}
	});

	it("le rapport nomme sous le référentiel adopté les sources de test, org.junit.jupiter:junit-jupiter et la duplication entre modules comme non mesurées, avec leur raison, en anglais et en français", async () => {
		const { report, referential } = await adoptedReport(qualityProject());
		const unmeasured = referential.unmeasured;
		assert.deepEqual(
			unmeasured.map((u) => u.subject),
			["src/test/java/", "org.junit.jupiter:junit-jupiter", "duplication between two modules"],
			"the referential names what it does not measure",
		);
		for (const u of unmeasured) assert.ok(u.reason.length > 0, `${u.subject}: its reason`);

		for (const [language, label] of [
			["en", "not measured"],
			["fr", "non mesuré"],
		] as const) {
			const text = formatReport(report, language);
			const from = text.indexOf(label);
			assert.ok(from > text.indexOf("CPD — "), `${language}: what is not measured, under the referential: ${text}`);
			const section = text.slice(from);
			for (const u of unmeasured)
				assert.ok(
					section.includes(`${u.subject}: ${u.reason}`),
					`${language}: ${u.subject} with its reason: ${section}`,
				);
		}
	});
});
