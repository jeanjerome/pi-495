/**
 * The report an engineer reads (IMP-05, REC-24): measured, concluded, and unestablished, kept in
 * three sections. A model review is never filed as an observation, and a run where every control
 * passed still names what it did not establish.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { engineeringReport } from "../../src/application/report.ts";
import { formatReport } from "../../src/presentation/structured/text.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { EMPTY_LIMITS, type Evidence } from "../../src/contracts/v1/evidence.ts";
import type { EvidenceEntry } from "../../src/domain/change/state.ts";
import type { ImplementationRecord } from "../../src/domain/implementation-record.ts";
import { AGENT, ENV, HUMAN, KERNEL, Runner, candidate, protocol, tick } from "../helpers/change-fixture.ts";

const c = candidate("c1");

/** The stored evidence behind a projected entry: what the control actually returned. */
function stored(entry: EvidenceEntry, over: Partial<Evidence> = {}): Evidence {
	return {
		evidence_id: entry.evidence_id,
		requirement_refs: entry.requirement_ids.map((requirement_id) => ({ requirement_id, revision: 1 })),
		control_id: entry.control_id,
		control_version: entry.control_version,
		subject: { kind: "candidate", id: c.candidate_id, revision: 1, digest: entry.subject_digest },
		protocol_revision: { protocol_id: "prt_1", revision: 1, content_digest: digestValue("p") },
		environment_digest: ENV,
		inputs_digest: digestValue("i"),
		started_at: "2026-09-16T10:00:00.000Z",
		ended_at: "2026-09-16T10:00:01.000Z",
		verdict: entry.verdict,
		facts: { run: "candidate" },
		findings: [],
		artifacts: [],
		limits: EMPTY_LIMITS,
		baseline: null,
		producer: KERNEL,
		integrity: { content_digest: digestValue("x"), chained_to: null },
		...over,
	};
}

describe("engineering report: observations, judgments and residual risks (IMP-05)", () => {
	it("keeps the three natures apart and shares no identifier between them", () => {
		const r = new Runner().toDeciding(c);
		r.run({
			type: "review.record",
			at: tick(),
			actor: AGENT,
			review_id: "rev_1",
			reviewer_role: "security",
			subject_digest: c.manifest_digest,
			conclusion: "consultative",
			blocking_findings: 0,
		});
		r.g5();
		const evidences = r.s.evidence.map((e) => stored(e));
		const report = engineeringReport(r.s, evidences, protocol());

		// Measured: one line per control run, carrying the subject it was pointed at.
		assert.deepEqual(
			report.observations.map((o) => `${o.control_id}=${o.verdict}`),
			["unit=PASS", "lint=PASS"],
		);
		assert.ok(
			report.observations.every((o) => o.subject_kind === "candidate" && o.subject_digest === c.manifest_digest),
		);

		// Concluded: the gates by the kernel, the review by a model. Same list, different authority.
		assert.deepEqual([...new Set(report.judgments.map((j) => j.authority))], ["kernel", "model"]);
		const review = report.judgments.find((j) => j.kind === "review")!;
		assert.equal(review.authority, "model", "a review is a model reading the candidate");
		assert.equal(review.binding, false, "a consultative review carrying no blocking finding decides nothing");
		assert.ok(report.judgments.some((j) => j.kind === "gate" && j.id === "G5" && j.authority === "kernel"));

		// Nothing is filed twice: an identifier belongs to one nature only.
		const ids = [...report.observations.map((o) => o.evidence_id), ...report.judgments.map((j) => j.id)];
		assert.equal(new Set(ids).size, ids.length);
		assert.equal(
			report.observations.some((o) => o.evidence_id === "rev_1"),
			false,
			"the review is not evidence",
		);
	});

	it("a run where every control passed still names what it does not establish", () => {
		const r = new Runner().toDeciding(c).g5();
		assert.equal(r.s.outcome, "accepted");
		const report = engineeringReport(
			r.s,
			r.s.evidence.map((e) => stored(e)),
			protocol(),
		);
		assert.equal(report.outcome, "accepted");
		assert.ok(report.observations.every((o) => o.verdict === "PASS"));
		const codes = report.residual_risks.map((risk) => risk.code);
		assert.ok(
			codes.includes("controls_are_not_a_proof"),
			report.residual_risks.map((risk) => risk.statement).join(" | "),
		);
		const statement = report.residual_risks.find((risk) => risk.code === "controls_are_not_a_proof")!.statement;
		assert.match(statement, /not the absence of defects/);
	});

	it("carries every limit of the controls into the risks: indeterminate, unstable, truncated, excluded and tolerated", () => {
		const r = new Runner().toDeciding(c, { unit: "INDETERMINATE", lint: "PASS" });
		const entries = r.s.evidence;
		const evidences = [
			stored(entries[0]!, {
				limits: {
					...EMPTY_LIMITS,
					unstable: true,
					truncated: true,
					bytes_read: 4096,
					exclusions: ["generated/"],
					notes: ["two passes disagreed"],
				},
			}),
			stored(entries[1]!, {
				baseline: {
					reference_id: "ref_1",
					reference_digest: digestValue("ref"),
					reference_verdict: "FAIL",
					reference_evidence_id: null,
					reused: false,
					tolerance: "no_aggravation",
					raw_verdict: "FAIL",
					new_findings: 0,
					preexisting_findings: 3,
					removed_findings: 0,
					blocking_findings: 0,
					unstable: false,
					confirmations: 0,
					notes: [],
				},
			}),
		];
		const codes = engineeringReport(r.s, evidences, protocol()).residual_risks.map((risk) => risk.code);
		for (const expected of [
			"indeterminate_control",
			"unstable_control",
			"truncated_output",
			"excluded_from_measure",
			"control_limit",
			"preexisting_findings_tolerated",
		]) {
			assert.ok(codes.includes(expected), `${expected} missing from ${codes.join(", ")}`);
		}
	});

	it("names a control that failed its own witnesses and a requirement no control carries", () => {
		const r = new Runner().toDeciding(c);
		const weakened = protocol({
			qualifications: {
				unit: {
					positive: "PASS",
					negative: "PASS",
					incident: "INDETERMINATE",
					qualified: false,
					environment_digest: ENV,
					notes: ["negative witness gave PASS"],
				},
				lint: protocol().qualifications.lint!,
			},
			obligations: [
				{
					requirement: { requirement_id: "R1", revision: 1 },
					mandatory: true,
					control_ids: [],
					combination: "all_pass",
					human_interaction: null,
					not_applicable_reason: null,
				},
				{
					requirement: { requirement_id: "R2", revision: 1 },
					mandatory: true,
					control_ids: [],
					combination: "human_decision",
					human_interaction: "IH-10",
					not_applicable_reason: null,
				},
			],
		});
		const risks = engineeringReport(r.s, [], weakened).residual_risks;
		assert.ok(
			risks.some((risk) => risk.code === "control_not_qualified" && risk.statement.includes("negative witness")),
		);
		assert.ok(risks.some((risk) => risk.code === "requirement_without_control" && risk.statement.includes("R1")));
		assert.ok(risks.some((risk) => risk.code === "requirement_decided_by_a_human" && risk.statement.includes("IH-10")));
		assert.ok(
			!risks.some((risk) => risk.code === "requirement_without_control" && risk.statement.includes("R2")),
			"a requirement assigned to a human decision is not also listed as carried by no control",
		);
	});

	it("reports a human acceptance as a judgment of human authority, distinct from what was measured", () => {
		const r = new Runner({ g5_human_acceptance: true }).toDeciding(c).g5();
		assert.equal(r.s.gates.G5?.next_action, "request_decision:IH-10");
		const subject = { kind: "candidate" as const, id: c.candidate_id, revision: 1, digest: c.manifest_digest };
		r.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: {
				decision_id: "dec_a",
				change_id: "chg_1",
				interaction: "IH-10",
				subject,
				question: "Accepter ?",
				facts: [],
				recommendation: null,
				options: [{ id: "accept", label: "Accepter", effect: "", risky: false }],
				required_authority: "change_owner",
				allow_free_text: false,
				requested_at: tick(),
				expires_at: null,
				language: "fr",
			},
		});
		r.run({
			type: "decision.answer",
			at: tick(),
			actor: HUMAN,
			human_decision_id: "hd_1",
			response: {
				decision_id: "dec_a",
				option_id: "accept",
				free_text: null,
				reason: null,
				subject_revision: 1,
				scope: null,
				expires_at: null,
			},
			origin: { actor: HUMAN, host: "tui", session_id: "s1", asserted_at: tick() },
		});
		const report = engineeringReport(r.s, [], null);
		const human = report.judgments.find((j) => j.kind === "human_decision")!;
		assert.equal(human.authority, "human");
		assert.equal(human.by, HUMAN.actor_id);
		assert.match(human.statement, /IH-10 accept/);
		assert.equal(report.observations.length, 0, "a decision is never an observation");
	});

	it("renders what was asked, then the three sections in order, in the language of the change", () => {
		const r = new Runner().toDeciding(c).g5();
		const text = formatReport(
			engineeringReport(
				r.s,
				r.s.evidence.map((e) => stored(e)),
				protocol(),
			),
			"fr",
		);
		const sections = ["Ce qui était demandé", "Ce qui a été mesuré", "Ce qui a été conclu", "Ce qui reste incertain"];
		const at = sections.map((s) => text.split("\n").indexOf(s));
		assert.ok(
			at.every((i, n) => i > 0 && (n === 0 || i > at[n - 1]!)),
			text,
		);
		assert.match(formatReport(engineeringReport(r.s, [], null), "en"), /^What remains uncertain$/m);
	});
});

describe("engineering report: what was asked (IMP-05)", () => {
	const requirement = (requirement_id: string, statement: string) => ({
		requirement_id,
		statement,
		category: "functional",
		mandatory: true,
		criterion: "a control observes it",
		source: "request",
		contract_family: null,
		satisfied_by_reference: false,
	});

	it("states each adopted requirement with the verdicts its controls gave the candidate", () => {
		const r = new Runner().toDeciding(c).g5();
		const doc = {
			change_id: r.s.change_id,
			requirements: [
				requirement("R1", "greet ends with an exclamation mark"),
				requirement("R2", "the code stays lint-clean"),
			],
			answers: [],
			assumptions: [],
			contract_families: {},
		};
		const report = engineeringReport(
			r.s,
			r.s.evidence.map((e) => stored(e)),
			protocol(),
			doc,
		);
		assert.deepEqual(
			report.requirements.map(
				(q) => `${q.requirement_id}: ${q.controls.map((k) => `${k.control_id}=${k.verdict}`).join(",")}`,
			),
			["R1: unit=PASS", "R2: lint=PASS"],
		);
		const text = formatReport(report, "en");
		assert.match(
			text,
			/^What was asked\n {2}✔ greet ends with an exclamation mark — unit\n {2}✔ the code stays lint-clean — lint$/m,
		);
		assert.ok(text.indexOf("What was asked") < text.indexOf("What was measured"), "what was asked comes first");
	});

	it("given a requirement whose obligation is a human decision, when the report is rendered, then its line says it is decided by the owner and carries no control verdict, while a requirement carried by controls keeps its verdicts", () => {
		const r = new Runner().toDeciding(c).g5();
		const doc = {
			change_id: r.s.change_id,
			requirements: [
				requirement("R1", "greet ends with an exclamation mark"),
				requirement("R2", "the code stays lint-clean"),
			],
			answers: [],
			assumptions: [],
			contract_families: {},
		};
		const decidedByTheOwner = protocol({
			obligations: [
				{
					requirement: { requirement_id: "R1", revision: 1 },
					mandatory: true,
					control_ids: [],
					combination: "human_decision",
					human_interaction: "IH-10",
					not_applicable_reason: null,
				},
				{
					requirement: { requirement_id: "R2", revision: 1 },
					mandatory: true,
					control_ids: ["lint"],
					combination: "all_pass",
					human_interaction: null,
					not_applicable_reason: null,
				},
			],
		});
		// The unit run cites R1 among its requirements and passed on the candidate: it observed
		// something, but not that R1 holds.
		const report = engineeringReport(
			r.s,
			r.s.evidence.map((e) => stored(e)),
			decidedByTheOwner,
			doc,
		);
		assert.deepEqual(
			report.requirements.map((q) => q.controls.map((k) => k.control_id)),
			[[], ["lint"]],
		);
		assert.match(
			formatReport(report, "en"),
			/^What was asked\n {2}\? greet ends with an exclamation mark — decided by the owner\n {2}✔ the code stays lint-clean — lint\n/m,
		);
		assert.match(
			formatReport(report, "fr"),
			/^ {2}\? greet ends with an exclamation mark — décidée par le propriétaire$/m,
		);
	});

	it("says none when no requirements were adopted", () => {
		const r = new Runner().toDeciding(c);
		const report = engineeringReport(r.s, [], null, null);
		assert.deepEqual(report.requirements, []);
		assert.match(formatReport(report, "en"), /^What was asked\n {2}none$/m);
	});
});

describe("engineering report: the recommended complements a target has not adopted", () => {
	const recommendation = {
		test_type: "mutation",
		tool: "--experimental-test-coverage",
		version: "24.21.0",
		established_on: "2026-09-30",
		source: "https://nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage",
		change: "in package.json, add --experimental-test-coverage to scripts.test",
	};
	const frozen = protocol();
	const risksOf = (recommendations?: (typeof recommendation)[]) =>
		engineeringReport(
			new Runner().toDeciding(c).s,
			[],
			protocol({
				capability_diagnosis: { ...frozen.capability_diagnosis, ...(recommendations ? { recommendations } : {}) },
			}),
		).residual_risks.filter((risk) => risk.code === "recommended_complement_not_adopted");

	it("given a protocol whose diagnosis carries a recommendation, then the report lists recommended_complement_not_adopted naming the test type, the tool and its version, and a protocol without any lists none", () => {
		const [risk, ...others] = risksOf([recommendation]);
		assert.deepEqual(others, []);
		for (const named of [recommendation.test_type, recommendation.tool, recommendation.version])
			assert.ok(risk?.statement.includes(named), `${named} is named in: ${risk?.statement}`);
		assert.deepEqual(risksOf(), [], "a protocol frozen without the list");
		assert.deepEqual(risksOf([]), []);
	});
	it("given a mutation complement recommended and not adopted, then the report says the mutation of the introduced lines is not measured as well as the complement is not adopted", () => {
		const [risk] = risksOf([recommendation]);
		assert.match(risk?.statement ?? "", /not adopted/);
		assert.match(risk?.statement ?? "", /the mutation of the introduced lines is not measured/);
	});
	it("given a protocol carrying an adopted complement, then the report does not list it as recommended and not adopted", () => {
		const adopted = {
			path: "package.json",
			digest: `sha256:${"d".repeat(64)}` as const,
			test_type: recommendation.test_type,
			tool: recommendation.tool,
		};
		const listed = (complements: (typeof adopted)[]) =>
			engineeringReport(
				new Runner().toDeciding(c).s,
				[],
				protocol({
					capability_diagnosis: { ...frozen.capability_diagnosis, recommendations: [recommendation] },
					complements,
				}),
			).residual_risks.filter((risk) => risk.code === "recommended_complement_not_adopted");
		assert.deepEqual(listed([adopted]), []);
		assert.equal(listed([]).length, 1, "the same recommendation with nothing adopted is still listed");
		assert.equal(
			listed([{ ...adopted, tool: "another tool" }]).length,
			1,
			"another complement adopted does not cover it",
		);
	});
});

describe("engineering report: what the producer declared of the plan", () => {
	/** A declaration of the plan made on the candidate whose digest is `candidateDigest`. */
	function declaredOn(candidateDigest: string): ImplementationRecord {
		return {
			candidate_digest: candidateDigest,
			design_digest: digestValue("design"),
			authority: "producer_declaration",
			tasks: [{ task_id: "T1", declared_status: "done", local_checks: [], deviations: [] }],
			unplanned_tasks: [],
			self_review: [],
			self_review_missing: [],
			unplanned_paths: [],
		};
	}

	it("keeps the declaration made on the current candidate and drops one made on another candidate", () => {
		const r = new Runner().toDeciding(c);
		const report = (record: ImplementationRecord) =>
			engineeringReport(r.s, [], protocol(), null, null, "", null, record).implementation;
		const current = declaredOn(c.manifest_digest);
		assert.deepEqual(report(current), current);
		assert.equal(report(declaredOn(candidate("c0").manifest_digest)), null);
	});
});
