/**
 * The nature of a requirement is read on its category, a free word the model writes. The instruction
 * the specifying model is given names each category 495 reads with what it measures, and a requirement
 * about complexity, duplication or dead code written "maintainability" is read as one about quality:
 * it is offered the quality referential and, adopted, measured by PMD and CPD. A requirement about
 * coverage is measured by no quality control.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SpecificationReport } from "../../src/contracts/v1/reports.ts";
import type { ContextManifest } from "../../src/ports/execution.ts";
import { specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { answer, latestSurvey, qualityProject, surveyed } from "../helpers/quality-survey.ts";

const QUALITY_REQUIREMENTS = ["r-complexity", "r-duplication", "r-dead-code"];

const requirement = (requirement_id: string, statement: string, category: string) => ({
	requirement_id,
	statement,
	mandatory: true,
	criterion: "the analysis of the code reports no violation",
	category,
	satisfied_by_reference: false,
});

/** The specification a model wrote for the question about quality, its categories as Sonnet 5.5 wrote them. */
const maintainability: SpecificationReport = specReport({
	objective: "quel est l'état de la qualité du code ?",
	requirements: [
		requirement("r-complexity", "no method exceeds the complexity threshold", "maintainability"),
		requirement("r-duplication", "no block of code is duplicated", "maintainability"),
		requirement("r-dead-code", "no private method is left uncalled", "maintainability"),
		requirement("r-test-coverage", "each class of the main code is exercised by at least one test", "coverage"),
	],
});

async function specifyInstruction(t: TestHarness, changeId: string): Promise<string> {
	for (const stored of t.ledger.listArtifacts(changeId, "context")) {
		const manifest = await t.harness.artifacts.read<ContextManifest>(stored.ref);
		if (manifest.role !== "specify") continue;
		const recorded = await t.objects.get(manifest.prompt_digest!);
		return (JSON.parse(new TextDecoder().decode(recorded!)) as { system_prompt: string }).system_prompt;
	}
	assert.fail("a specify intervention recorded what it was handed");
}

describe("the nature of a requirement is read on a category the specification instruction names", () => {
	it("la consigne de spécification nomme chaque catégorie que 495 lit avec ce qu'elle mesure", async () => {
		const { t, changeId } = await surveyed(qualityProject());
		const instruction = await specifyInstruction(t, changeId);
		for (const [category, ...measures] of [
			["functional", /behaviou?r/],
			["quality", /complexity/, /duplication/, /dead code/, /style/],
			["coverage", /cover|exercise/],
			["mutation", /mutant|mutation/],
			["architecture", /structure|dependenc|layer/],
		] as const) {
			const named = new RegExp(`"${category}"[^".;]*`).exec(instruction)?.[0];
			assert.ok(named, `the instruction names the category "${category}"`);
			for (const measure of measures) assert.match(named, measure, `"${category}" says what it measures: ${named}`);
		}
	});

	it("des exigences de complexité, de duplication et de code mort écrites maintainability reçoivent la décision d'adoption, qui les nomme, et le survey les mesure par pmd et cpd en FAIL, sans mesurer l'exigence de couverture par pmd ni par cpd", async () => {
		const { t, changeId, first } = await surveyed(qualityProject(), { report: maintainability });
		assert.equal(first.stopped_because, "decision_required", first.steps.join(" | "));
		const [asked] = t.harness.pendingDecisions(changeId);
		assert.ok(asked);
		assert.deepEqual(
			asked.options.map((o) => o.id),
			["adopt_referential", "leave_blind_spot"],
			`the referential is proposed: ${asked.question}`,
		);
		for (const id of QUALITY_REQUIREMENTS) assert.ok(asked.question.includes(id), `${id} in ${asked.question}`);
		assert.ok(!asked.question.includes("r-test-coverage"), asked.question);

		answer(t, changeId, "adopt_referential");
		const after = await t.harness.advance(changeId, { max_steps: 40 });
		assert.equal(after.stopped_because, "decision_required", after.steps.join(" | "));
		const survey = await latestSurvey(t, changeId);
		for (const id of QUALITY_REQUIREMENTS) {
			const measured = survey.requirements.find((r) => r.requirement_id === id);
			assert.ok(measured, id);
			assert.deepEqual(
				measured.measures.map((m) => [m.control_id, m.verdict]).sort(),
				[
					["cpd", "FAIL"],
					["pmd", "FAIL"],
				],
				`${id} is measured by pmd and cpd: ${measured.blind_spot}`,
			);
		}
		const coverage = survey.requirements.find((r) => r.requirement_id === "r-test-coverage");
		assert.ok(coverage);
		assert.deepEqual(
			coverage.measures.filter((m) => m.control_id === "pmd" || m.control_id === "cpd"),
			[],
			"coverage is measured by no quality control",
		);
	});
});
