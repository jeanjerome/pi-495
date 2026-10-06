/**
 * The residual risks a control run raises bear on the candidate the report judges: a pass on the
 * reference or on the candidate of an earlier attempt is not a doubt about the accepted change, while
 * the limits of the current candidate stay risks. Every run stays an observation.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { engineeringReport } from "../../src/application/report.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { EMPTY_LIMITS, type Evidence } from "../../src/contracts/v1/evidence.ts";
import type { Verdict } from "../../src/contracts/v1/common.ts";
import { KERNEL, ENV, Runner, candidate, evidence, protocol, tick } from "../helpers/change-fixture.ts";

const REFERENCE = { kind: "reference" as const, id: "ref_1", revision: 1, digest: digestValue({ tree: "base" }) };

/** What a control returned on `subject`, with no limit unless `over` sets one. */
function run(
	evidenceId: string,
	controlId: string,
	subject: Evidence["subject"],
	verdict: Verdict,
	over: Partial<Evidence> = {},
): Evidence {
	return {
		evidence_id: evidenceId,
		requirement_refs: [{ requirement_id: controlId === "lint" ? "R2" : "R1", revision: 1 }],
		control_id: controlId,
		control_version: "1",
		subject,
		protocol_revision: { protocol_id: "prt_1", revision: 1, content_digest: digestValue("p") },
		environment_digest: ENV,
		inputs_digest: digestValue("i"),
		started_at: "2026-09-16T10:00:00.000Z",
		ended_at: "2026-09-16T10:00:01.000Z",
		verdict,
		facts: {},
		findings: [],
		artifacts: [],
		limits: EMPTY_LIMITS,
		baseline: null,
		producer: KERNEL,
		integrity: { content_digest: digestValue(evidenceId), chained_to: null },
		...over,
	};
}

const subjectOf = (c: ReturnType<typeof candidate>): Evidence["subject"] => ({
	kind: "candidate",
	id: c.candidate_id,
	revision: 1,
	digest: c.manifest_digest,
});

/** The stored runs behind the evidence entries of a change, each on the candidate whose digest it carries. */
function storedEntries(r: Runner, ...candidates: ReturnType<typeof candidate>[]): Evidence[] {
	return r.s.evidence.map((e) => {
		const c = candidates.find((k) => k.manifest_digest === e.subject_digest)!;
		return run(e.evidence_id, e.control_id, subjectOf(c), e.verdict);
	});
}

describe("residual risks bear on the current candidate", () => {
	it("a reference pass and an earlier candidate's limits raise no risk of the accepted candidate, and the reference verdict stays in the table", () => {
		const c1 = candidate("c1");
		const c2 = candidate("c2");
		const r = new Runner().toDeciding(c1, { unit: "INDETERMINATE", lint: "PASS" }).g5();
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_2", feedback: null });
		r.implement("int_2", "att_2");
		r.freeze(c2)
			.verify([
				evidence({ control_id: "unit", subject_digest: c2.manifest_digest }),
				evidence({ control_id: "lint", subject_digest: c2.manifest_digest }),
			])
			.g5();
		assert.equal(r.s.outcome, "accepted");

		const firstUnit = r.s.evidence.find((e) => e.subject_digest === c1.manifest_digest && e.control_id === "unit")!;
		const stored = [
			run("evd_coverage_ref", "coverage", REFERENCE, "PASS", {
				limits: { ...EMPTY_LIMITS, notes: ["the candidate introduces no line JaCoCo measures"] },
			}),
			run("evd_unit_ref", "unit", REFERENCE, "INDETERMINATE"),
			...storedEntries(r, c1, c2).map((e) =>
				e.evidence_id === firstUnit.evidence_id
					? {
							...e,
							limits: {
								...EMPTY_LIMITS,
								truncated: true,
								bytes_read: 4096,
								bytes_total: 9000,
								notes: ["two passes disagreed"],
							},
						}
					: e,
			),
			run("evd_coverage_c2", "coverage", subjectOf(c2), "PASS"),
		];
		const report = engineeringReport(r.s, stored, protocol());
		const risks = report.residual_risks.map((risk) => `${risk.code}: ${risk.statement}`);

		for (const word of ["introduces no line", "reference", c1.candidate_id, "truncated", "two passes disagreed"])
			assert.ok(!risks.some((risk) => risk.includes(word)), `a residual risk names ${word}: ${risks.join(" | ")}`);

		assert.equal(report.observations.length, stored.length, "every run stays an observation");
		assert.ok(
			report.observations.some(
				(o) => o.subject_kind === "reference" && o.control_id === "unit" && o.verdict === "INDETERMINATE",
			),
		);
		/** The mark in the reference column of the `unit` row, which reads `?` for a missing run too. */
		const referenceUnit = (runs: Evidence[]) => {
			const lines = formatReport(engineeringReport(r.s, runs, protocol()), "en").split("\n");
			const header = lines.find((l) => l.includes("reference") && l.includes("candidate"))!;
			const unit = lines.find((l) => l.startsWith("  unit "))!;
			return unit[header.indexOf("reference") + Math.floor(("reference".length - 1) / 2)];
		};
		assert.equal(referenceUnit(stored), "?");
		const passOnReference = stored.map((e) =>
			e.evidence_id === "evd_unit_ref" ? { ...e, verdict: "PASS" as const } : e,
		);
		assert.equal(referenceUnit(passOnReference), "✔", "the reference column reads the verdict of the reference run");
	});

	it("counts in the runs that prove nothing only those that observed the current candidate", () => {
		const c1 = candidate("c1");
		const c2 = candidate("c2");
		const r = new Runner().toImplementing().implement().freeze(c1);
		r.verify([evidence({ control_id: "unit", subject_digest: c1.manifest_digest, verdict: "FAIL" })]).g5();
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_2", feedback: null });
		r.implement("int_2", "att_2");
		r.freeze(c2)
			.verify([
				evidence({ control_id: "unit", subject_digest: c2.manifest_digest }),
				evidence({ control_id: "lint", subject_digest: c2.manifest_digest }),
			])
			.g5();
		assert.equal(r.s.outcome, "accepted");

		const risks = engineeringReport(r.s, storedEntries(r, c1, c2), protocol()).residual_risks;
		const notAProof = risks.find((risk) => risk.code === "controls_are_not_a_proof");
		assert.ok(notAProof?.statement.startsWith("2 control run(s) observed the candidate"), JSON.stringify(risks));
	});

	it("an INDETERMINATE of the current candidate stays a risk that names the control and its note", () => {
		const c = candidate("c1");
		const r = new Runner().toDeciding(c, { unit: "INDETERMINATE", lint: "PASS" });
		const stored = storedEntries(r, c).map((e) =>
			e.control_id === "unit" ? { ...e, limits: { ...EMPTY_LIMITS, notes: ["two passes disagreed"] } } : e,
		);
		const risks = engineeringReport(r.s, stored, protocol()).residual_risks;

		const indeterminate = risks.find((risk) => risk.code === "indeterminate_control");
		assert.ok(indeterminate?.statement.includes("control unit"), JSON.stringify(risks));
		const limit = risks.find((risk) => risk.code === "control_limit");
		assert.ok(
			limit?.statement.includes("control unit") && limit.statement.includes("two passes disagreed"),
			JSON.stringify(risks),
		);
	});

	it("a change without a candidate draws no risk from a run on the reference, which stays an observation", () => {
		const r = new Runner().toImplementing();
		assert.equal(r.s.candidate, null);
		const stored = [
			run("evd_unit_ref", "unit", REFERENCE, "INDETERMINATE", {
				limits: { ...EMPTY_LIMITS, truncated: true, bytes_read: 4096, notes: ["two passes disagreed"] },
			}),
		];
		const report = engineeringReport(r.s, stored, protocol());

		const fromRuns = ["indeterminate_control", "truncated_output", "control_limit", "controls_are_not_a_proof"];
		const codes = report.residual_risks.map((risk) => risk.code);
		assert.ok(!codes.some((code) => fromRuns.includes(code)), codes.join(", "));
		assert.deepEqual(
			report.observations.map((o) => `${o.subject_kind}:${o.control_id}=${o.verdict}`),
			["reference:unit=INDETERMINATE"],
		);
	});
});
