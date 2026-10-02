import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SurveySection } from "../../src/application/report.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTsWithFailingTest } from "../helpers/fixtures.ts";
import { makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

/** What the survey in the dossier says, as this test reads it. */
interface Surveyed {
	controls: { control_id: string; blind_spot: string | null }[];
	requirements: {
		requirement_id: string;
		measures: { control_id: string; verdict: string }[];
		blind_spot: string | null;
	}[];
}

const QUESTION = "où en sont les tests et l'architecture ?";

describe("the report of a survey", () => {
	it("le rapport d'un état des lieux d'un projet dont un test échoue et dont une exigence porte sur l'architecture nomme chaque exigence avec ses verdicts, le fichier du test en échec et l'angle mort d'architecture avec sa raison", async () => {
		const p = trackedProject(fixtureTsWithFailingTest);
		const t = makeHarness({
			defaultScript: {
				steps: [
					{
						kind: "complete",
						output: specReport({
							objective: QUESTION,
							requirements: [
								{
									requirement_id: "R1",
									statement: "the test suite of the project passes",
									mandatory: true,
									criterion: "the unit test suite passes",
									category: "functional",
									satisfied_by_reference: true,
								},
								{
									requirement_id: "R-ARCH",
									statement: "the domain modules import nothing from the infrastructure modules",
									mandatory: true,
									criterion: "no import from src/infra under src/domain",
									category: "architecture",
									satisfied_by_reference: true,
								},
							],
						}),
					},
				],
			},
		});
		const { change } = await t.harness.start({
			project_path: p,
			request_text: QUESTION,
			actor: HUMAN,
			deliverable: "state",
		});
		await t.harness.advance(change.change_id, { max_steps: 40 });
		const state = t.ledger.loadChange(change.change_id)!.state;
		const proposed = state.proposals.survey?.at(-1);
		assert.ok(proposed, `a survey is proposed: ${state.phase}/${state.status} ${state.stop_detail ?? ""}`);
		const surveyed = await t.harness.artifacts.read<Surveyed>(proposed);

		const report = await t.harness.report(change.change_id);
		const section = report.survey;
		assert.ok(section, "the report carries a survey section");
		for (const r of surveyed.requirements) {
			const line: SurveySection["requirements"][number] | undefined = section.requirements.find(
				(q) => q.requirement_id === r.requirement_id,
			);
			assert.ok(line, `the report names ${r.requirement_id}`);
			assert.deepEqual(
				line.controls,
				r.measures.map((m) => ({ control_id: m.control_id, verdict: m.verdict })),
				`${r.requirement_id} carries the verdicts of its controls on the reference`,
			);
			assert.equal(line.blind_spot, r.blind_spot, `${r.requirement_id} carries its blind spot`);
		}
		const tests = section.requirements.find((q) => q.requirement_id === "R1");
		assert.equal(tests?.statement, "the test suite of the project passes", "R1 carries its statement");
		assert.deepEqual(tests?.controls, [{ control_id: "unit", verdict: "FAIL" }]);
		const architecture = section.requirements.find((q) => q.requirement_id === "R-ARCH");
		assert.match(architecture?.blind_spot ?? "", /no control of the target measures its nature/);
		assert.ok(
			section.findings.some((f) => f.control_id === "unit" && f.path === "test/farewell.test.js"),
			`a finding names the file of the failing test: ${JSON.stringify(section.findings)}`,
		);
		assert.deepEqual(
			section.blind_spots,
			surveyed.controls.flatMap((c) =>
				c.blind_spot === null ? [] : [{ control_id: c.control_id, reason: c.blind_spot }],
			),
			"each blind spot control is named with its reason",
		);

		const text = formatReport(report, "fr");
		assert.match(text, /## État des lieux/, text);
		const surveyText = text.slice(text.indexOf("## État des lieux"));
		assert.ok(surveyText.includes("R1: the test suite of the project passes — unit=FAIL"), surveyText);
		for (const f of section.findings.filter((f) => f.path !== null))
			assert.ok(
				surveyText.includes(`${f.control_id} ${f.path}: ${f.message}`),
				`the text names the file of the finding: ${surveyText}`,
			);
		assert.match(surveyText, /R-ARCH: .*no control of the target measures its nature/, surveyText);
		for (const spot of section.blind_spots)
			assert.ok(surveyText.includes(spot.reason), `${spot.control_id}: ${surveyText}`);
	});
});
