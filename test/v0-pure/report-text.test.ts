/**
 * The report of a change as the owner reads it: what was asked with its verdict, what was measured on
 * the reference and on the candidate, what was concluded, and what remains uncertain — the three
 * natures of IMP-05 kept apart, with no digest and no line per qualification run.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { EngineeringReport, MechanicalObservation } from "../../src/application/report.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";

const TITLE = "add freeMinutes(busy) beside freeSlots";
const CANDIDATE = `sha256:${"c".repeat(64)}`;
const REFERENCE = `sha256:${"r".repeat(64)}`;
const FIXTURE = `sha256:${"f".repeat(64)}`;
const CONTROLS = ["unit", "coverage", "mutation"];

function run(
	control_id: string,
	subject_kind: string,
	subject_digest: string,
	verdict: MechanicalObservation["verdict"],
): MechanicalObservation {
	return {
		evidence_id: `evd_${control_id}_${subject_kind}_${verdict}`,
		control_id,
		control_version: "v1+junit-xml@1.0.0",
		subject_kind,
		subject_digest,
		verdict,
		blocking_findings: 0,
		valid: true,
	};
}

/** The change accepted at its first attempt, two requirements, three controls each qualified on three witness runs. */
function acceptedReport(): EngineeringReport {
	return {
		schema_version: 1,
		change_id: "chg_muvojsvvb399c9ce4d",
		title: TITLE,
		outcome: "accepted",
		candidate: { candidate_id: "cand_dbff53b24f15", manifest_digest: CANDIDATE },
		requirements: [
			{
				requirement_id: "R1",
				statement: "freeMinutes(busy) returns the free minutes of the day",
				mandatory: true,
				decided_by_owner: false,
				controls: [
					{ control_id: "unit", verdict: "PASS" },
					{ control_id: "mutation", verdict: "PASS" },
				],
			},
			{
				requirement_id: "R2",
				statement: "freeSlots keeps its behaviour",
				mandatory: true,
				decided_by_owner: false,
				controls: [{ control_id: "unit", verdict: "PASS" }],
			},
		],
		survey: null,
		observations: [
			...CONTROLS.flatMap((c) => [
				run(c, "fixture", FIXTURE, "PASS"),
				run(c, "fixture", FIXTURE, "FAIL"),
				run(c, "fixture", FIXTURE, "INDETERMINATE"),
			]),
			run("unit", "reference", REFERENCE, "FAIL"),
			run("coverage", "reference", REFERENCE, "PASS"),
			run("mutation", "reference", REFERENCE, "PASS"),
			...CONTROLS.map((c) => run(c, "candidate", CANDIDATE, "PASS")),
		],
		judgments: ["G0", "G1", "G2", "G3", "G4", "G5"].map((gate) => ({
			kind: "gate" as const,
			id: gate,
			by: "495 kernel",
			authority: "kernel" as const,
			statement: `${gate} PASS`,
			binding: true,
		})),
		implementation: null,
		residual_risks: [
			{
				code: "controls_are_not_a_proof",
				statement:
					"3 control run(s) observed the candidate under the frozen protocol; they establish what those controls detect, not the absence of defects.",
			},
		],
	};
}

describe("the text of a report", () => {
	it("le rapport du changement accepté à deux exigences et trois contrôles qualifiés chacun sur trois essais commence par 495 report · add freeMinutes(busy) beside freeSlots — ✔ Accepted, a les quatre sections dans l'ordre, un tableau reference/candidate de trois lignes, la phrase des essais de qualification, la ligne des portes passées, tient en 30 lignes et ne contient aucune empreinte", () => {
		const text = formatReport(acceptedReport(), "en");
		const lines = text.split("\n");
		assert.equal(lines[0], `495 report · ${TITLE} — ✔ Accepted`, text);
		const sections = ["What was asked", "What was measured", "What was concluded", "What remains uncertain"];
		const at = sections.map((s) => lines.indexOf(s));
		assert.ok(
			at.every((i, n) => i > 0 && (n === 0 || i > at[n - 1]!)),
			`the four sections in this order: ${text}`,
		);

		const asked = lines.slice(at[0]! + 1, at[1]!).filter(Boolean);
		assert.deepEqual(asked, [
			"  ✔ freeMinutes(busy) returns the free minutes of the day — unit, mutation",
			"  ✔ freeSlots keeps its behaviour — unit",
		]);

		const measured = lines.slice(at[1]! + 1, at[2]!).filter(Boolean);
		assert.match(measured[0]!, /^\s+reference\s+candidate$/, text);
		const rows = measured.slice(1, 4);
		assert.deepEqual(
			rows.map((r) => r.trim().split(/\s+/)[0]),
			CONTROLS,
			`one row per control: ${text}`,
		);
		for (const row of rows) assert.match(row, /^\s+\S+\s+[✔✘?]\s+[✔✘?]$/, text);
		assert.match(rows[0]!, /✘\s+✔$/, "unit failed on the reference and passed on the candidate");
		assert.equal(measured[4], "  3 checks were qualified on 9 witness runs before they were trusted.");

		assert.ok(
			lines
				.slice(at[2]! + 1, at[3]!)
				.includes("  ✔ The kernel passed Scoping, Specification, Qualification, Design, Implementation and Acceptance"),
			text,
		);
		assert.ok(lines.length <= 30, `${lines.length} lines: ${text}`);
		assert.doesNotMatch(text, /sha256:|fixture/, text);
		assert.doesNotMatch(text, /controls_are_not_a_proof|R1|R2/, "no code and no requirement identifier");
	});

	it("a rejected change says the gate the kernel refused with its reasons, apart from the gates it passed, then each review, and counts the controls left unqualified", () => {
		const accepted = acceptedReport();
		const report: EngineeringReport = {
			...accepted,
			outcome: "rejected",
			judgments: [
				...accepted.judgments.filter((j) => j.id !== "G5"),
				{
					kind: "gate",
					id: "G5",
					by: "495 kernel",
					authority: "kernel",
					statement: "G5 FAIL: mutation failed on the candidate",
					binding: true,
				},
				{ kind: "review", id: "rev_1", by: "reviewer", authority: "model", statement: "approve", binding: false },
			],
			residual_risks: [{ code: "control_not_qualified", statement: "control mutation is not qualified." }],
		};
		const lines = formatReport(report, "en").split("\n");
		assert.equal(lines[0], `495 report · ${TITLE} — ✘ Rejected`);
		const concluded = lines.slice(lines.indexOf("What was concluded") + 1, lines.indexOf("What remains uncertain"));
		assert.deepEqual(concluded.filter(Boolean), [
			"  ✔ The kernel passed Scoping, Specification, Qualification, Design and Implementation",
			"  ✘ The kernel refused Acceptance: mutation failed on the candidate",
			"  · Reviewed by reviewer: approve",
		]);
		assert.ok(lines.includes("  3 checks were tried on 9 witness runs; 1 was not qualified."), lines.join("\n"));
		assert.ok(lines.includes("  · control mutation is not qualified."), lines.join("\n"));
	});

	it("the candidate column holds the current candidate alone, not a candidate the change replaced", () => {
		const REPLACED = `sha256:${"o".repeat(64)}`;
		const report = acceptedReport();
		const text = formatReport(
			{
				...report,
				observations: [
					run("unit", "candidate", REPLACED, "FAIL"),
					run("lint", "candidate", REPLACED, "FAIL"),
					...report.observations,
				],
			},
			"en",
		);
		const lines = text.split("\n");
		const rows = lines.slice(lines.indexOf("What was measured") + 2, lines.indexOf("What was measured") + 5);
		assert.deepEqual(
			rows.map((r) => r.trim().split(/\s+/)[0]),
			CONTROLS,
			text,
		);
		assert.match(rows[0]!, /✘\s+✔$/, text);
		assert.doesNotMatch(text, /lint/, text);
	});

	it("a report with no control run says that nothing was measured", () => {
		const lines = formatReport({ ...acceptedReport(), observations: [] }, "en").split("\n");
		assert.equal(lines[lines.indexOf("What was measured") + 1], "  nothing was measured", lines.join("\n"));
	});

	it("one check qualified on one witness run and one gate passed read in the singular, and a gate the kernel could not decide says so with its reason, in English and in French", () => {
		const report: EngineeringReport = {
			...acceptedReport(),
			observations: [run("unit", "fixture", FIXTURE, "PASS"), run("unit", "candidate", CANDIDATE, "PASS")],
			judgments: [
				{ kind: "gate", id: "G0", by: "495 kernel", authority: "kernel", statement: "G0 PASS", binding: true },
				{
					kind: "gate",
					id: "G1",
					by: "495 kernel",
					authority: "kernel",
					statement: "G1 INDETERMINATE: the requirements could not be read",
					binding: true,
				},
			],
		};
		const en = formatReport(report, "en").split("\n");
		assert.ok(en.includes("  1 check was qualified on 1 witness run before it was trusted."), en.join("\n"));
		assert.ok(en.includes("  ✔ The kernel passed Scoping"), en.join("\n"));
		assert.ok(
			en.includes("  ? The kernel could not decide Specification: the requirements could not be read"),
			en.join("\n"),
		);
		const fr = formatReport(report, "fr").split("\n");
		assert.ok(fr.includes("  1 contrôle a été qualifié sur 1 essai témoin avant d'être retenu."), fr.join("\n"));
		assert.ok(fr.includes("  ✔ Le noyau a passé Cadrage"), fr.join("\n"));
		assert.ok(
			fr.includes("  ? Le noyau n'a pas pu trancher Spécification: the requirements could not be read"),
			fr.join("\n"),
		);
	});

	it("en français, des contrôles essayés dont un n'est pas qualifié se comptent au pluriel, avec celui qui ne l'est pas", () => {
		const report: EngineeringReport = {
			...acceptedReport(),
			residual_risks: [{ code: "control_not_qualified", statement: "control mutation is not qualified." }],
		};
		const lines = formatReport(report, "fr").split("\n");
		assert.ok(
			lines.includes("  3 contrôles ont été essayés sur 9 essais témoins ; 1 n'a pas été qualifié."),
			lines.join("\n"),
		);
	});

	it("en français, les sections sont Ce qui était demandé, Ce qui a été mesuré, Ce qui a été conclu et Ce qui reste incertain", () => {
		const lines = formatReport(acceptedReport(), "fr").split("\n");
		const at = ["Ce qui était demandé", "Ce qui a été mesuré", "Ce qui a été conclu", "Ce qui reste incertain"].map(
			(s) => lines.indexOf(s),
		);
		assert.ok(
			at.every((i, n) => i > 0 && (n === 0 || i > at[n - 1]!)),
			lines.join("\n"),
		);
	});
});
