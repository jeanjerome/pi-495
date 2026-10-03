/**
 * The survey of a Maven project whose quality referential was adopted ranges each violation in the code
 * written by hand or in the generated code, as the Generated annotations of its file declare it. The
 * generated code stays measured: its violations are in the evidence and the verdict as much as any other.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SurveyFinding } from "../../src/domain/survey.ts";
import {
	answer,
	complex,
	duplicated,
	GENERATED_GRADER,
	GRADER,
	IMPORTED_GENERATED,
	latestSurvey,
	QUALIFIED_GENERATED,
	QUALITY_SOURCES,
	qualityProject,
	surveyed,
} from "../helpers/quality-survey.ts";

/** The findings of each control of the survey of `sources`, once the owner adopted the referential. */
async function adoptedSurvey(sources: Record<string, string>) {
	const { t, changeId } = await surveyed(qualityProject("", sources));
	answer(t, changeId, "adopt_referential");
	await t.harness.advance(changeId, { max_steps: 40 });
	const survey = await latestSurvey(t, changeId);
	const findings = (id: string): SurveyFinding[] => survey.controls.find((c) => c.control_id === id)?.findings ?? [];
	return { survey, findings };
}

const described = (findings: readonly SurveyFinding[]) => JSON.stringify(findings, null, 1);

describe("the survey ranges each violation of the adopted referential in its perimeter", () => {
	it("la violation d'une classe écrite à la main est rangée dans le code propriétaire et celle d'une classe marquée Generated dans le code généré", async () => {
		const { findings } = await adoptedSurvey({
			[GRADER]: QUALITY_SOURCES[GRADER]!,
			[GENERATED_GRADER]: complex("GeneratedGrader", QUALIFIED_GENERATED),
		});
		const complexity = (path: string) =>
			findings("pmd").find((f) => f.path === path && f.rule_id === "CyclomaticComplexity");
		assert.ok(complexity(GRADER) && complexity(GENERATED_GRADER), `both violations: ${described(findings("pmd"))}`);
		assert.equal(complexity(GRADER)?.authorship, "proprietary", described(findings("pmd")));
		assert.equal(complexity(GENERATED_GRADER)?.authorship, "generated", described(findings("pmd")));
	});

	it("une duplication entre deux classes marquées Generated est rangée dans le code généré", async () => {
		const generated = {
			"src/main/java/io/h495/GenA.java": duplicated("GenA", IMPORTED_GENERATED),
			"src/main/java/io/h495/GenB.java": duplicated("GenB", IMPORTED_GENERATED),
		};
		const between = await adoptedSurvey(generated);
		assert.deepEqual(
			between.findings("cpd").map((f) => f.authorship),
			["generated"],
			described(between.findings("cpd")),
		);

		// The same block repeated once more by a class written by hand is a duplication of that class.
		const mixed = await adoptedSurvey({ ...generated, "src/main/java/io/h495/DupA.java": duplicated("DupA") });
		assert.deepEqual(
			mixed.findings("cpd").map((f) => f.authorship),
			["proprietary"],
			described(mixed.findings("cpd")),
		);
	});

	it("une méthode trop complexe dans la seule classe générée laisse l'exigence de qualité mesurée par pmd en FAIL, la violation rangée dans le code généré", async () => {
		const { survey, findings } = await adoptedSurvey({
			[GENERATED_GRADER]: complex("GeneratedGrader", QUALIFIED_GENERATED),
		});
		const quality = survey.requirements.find((r) => r.requirement_id === "QLT-01");
		assert.ok(
			quality?.measures.some((m) => m.control_id === "pmd" && m.verdict === "FAIL"),
			`the requirement is measured by pmd in FAIL: ${JSON.stringify(quality)}`,
		);
		const violation = findings("pmd").find((f) => f.rule_id === "CyclomaticComplexity");
		assert.equal(violation?.path, GENERATED_GRADER, described(findings("pmd")));
		assert.equal(violation?.authorship, "generated", described(findings("pmd")));
	});
});
