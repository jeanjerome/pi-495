import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { AGENT, KERNEL, Runner, candidate, tick } from "../helpers/change-fixture.ts";
import type { Decision } from "../../src/domain/change/decide.ts";
import type { ChangeCommand } from "../../src/domain/change/commands.ts";
import { contestationIssues } from "../../src/domain/change/contestation.ts";
import type { ChangeState, ContestationFacts, EvidenceEntry } from "../../src/domain/change/state.ts";

const c1 = candidate("c1");

/** A change whose frozen case of R1 failed on candidate c1 under protocol prt_1 r1: G5 refused it. */
function refused(): Runner {
	return new Runner().toDeciding(c1, { unit: "FAIL", lint: "PASS" }).g5();
}

function evidenceOf(r: Runner, controlId: string): string {
	return r.s.evidence.find((e) => e.control_id === controlId)!.evidence_id;
}

/** The producer's contestation of the frozen case of R1, reproduced by the kernel's own failed run of `unit`. */
function contestation(r: Runner, over: Partial<ContestationFacts> = {}): ContestationFacts {
	return {
		contestation_id: "ctt_1",
		intervention_id: "int_1",
		requirement_id: "R1",
		case_name: "R1 greet greets",
		protocol: { protocol_id: "prt_1", revision: 1 },
		candidate_digest: c1.manifest_digest,
		observation: 'the case expects "Hi, x" where the owner answered that greet returns "Hello, x"',
		reproduction: { control_id: "unit", evidence_id: evidenceOf(r, "unit") },
		...over,
	};
}

/** The kernel's answer to a filed contestation: a command it does not know is no answer at all. */
function file(r: Runner, facts: ContestationFacts, actor = KERNEL): Decision {
	const command: ChangeCommand = { type: "contestation.file", at: tick(), actor, contestation: facts };
	let decision: Decision | undefined;
	assert.doesNotThrow(() => {
		decision = r.try(command);
	}, "the kernel takes the producer's contestation of a frozen case as a command of the change");
	return decision!;
}

/** What a contestation could loosen: the judge, its protected paths, the gates, the evidence and the decisions. */
function rights(s: ChangeState) {
	return {
		protocol: s.protocol,
		phase: s.phase,
		status: s.status,
		gates: Object.keys(s.gates),
		preparation: s.adopted.preparation?.ref ?? null,
		evidence: s.evidence.map((e) => [e.evidence_id, e.valid]),
		decisions: s.human_decisions.map((d) => [d.human_decision_id, d.valid]),
	};
}

describe("the producer's contestation of a frozen test", () => {
	it("une contestation incomplète ou relative à un autre protocole ne modifie aucun droit", () => {
		const r = refused();
		const before = rights(r.s);
		const inadmissible: [string, ContestationFacts][] = [
			["without its contradictory observation", contestation(r, { observation: "" })],
			["without the case it contests", contestation(r, { case_name: "" })],
			["without a reproduction", contestation(r, { reproduction: { control_id: "unit", evidence_id: "" } })],
			["about another protocol", contestation(r, { protocol: { protocol_id: "prt_2", revision: 1 } })],
			["about another revision of the protocol", contestation(r, { protocol: { protocol_id: "prt_1", revision: 2 } })],
			["about another candidate", contestation(r, { candidate_digest: candidate("c0").manifest_digest })],
			[
				"reproduced by a run that passed",
				contestation(r, { reproduction: { control_id: "lint", evidence_id: evidenceOf(r, "lint") } }),
			],
		];
		for (const [why, facts] of inadmissible) {
			const d = file(r, facts);
			assert.equal(d.ok, false, `a contestation ${why} is refused`);
			assert.deepEqual(rights(r.s), before, `a contestation ${why} changes no right`);
			assert.deepEqual(r.s.contestations ?? [], [], `a contestation ${why} is not kept as filed`);
		}
		const own = file(r, contestation(r), AGENT);
		assert.equal(own.ok, false, "the producer does not file into the ledger in its own name");
		assert.deepEqual(rights(r.s), before);

		const kept = file(r, contestation(r));
		assert.equal(kept.ok, true, kept.ok ? "" : kept.error.message);
		assert.deepEqual(
			r.s.contestations?.map((c) => [c.contestation_id, c.requirement_id, c.case_name, c.finding]),
			[["ctt_1", "R1", "R1 greet greets", null]],
			"the reproducible contestation is kept, open, with what it contests",
		);
		assert.deepEqual(rights(r.s), before, "a kept contestation is a signal, never an authorization");

		// The next attempt still has no right to write the frozen test.
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_2", feedback: null });
		r.implement("int_2", "att_2").freeze(candidate("c2"), { altered_protected_paths: ["test/greet.test.ts"] });
		assert.equal(r.s.gates.G4?.verdict, "FAIL", "a candidate that rewrites the contested test fails G4");
	});

	it("une contestation que sa reproduction ne tient pas sur l'une de ses identités n'est pas conservée", () => {
		const r = refused();
		const failed = r.s.evidence.find((e) => e.control_id === "unit")!;
		const { protocol_id: _, ...unversioned } = failed;
		/** The refused change, with one more run of the kernel's that the contestation cites as its reproduction. */
		const citing = (run: EvidenceEntry, over: Partial<ContestationFacts> = {}): [ChangeState, ContestationFacts] => [
			{ ...r.s, evidence: [...r.s.evidence, run] },
			contestation(r, { reproduction: { control_id: run.control_id, evidence_id: run.evidence_id }, ...over }),
		];
		const notReproduced = /does not show case "R1 greet greets" failing in/;
		const unreproduced: [string, [ChangeState, ContestationFacts], RegExp][] = [
			[
				"filed for an intervention that produced nothing",
				[r.s, contestation(r, { intervention_id: "int_x" })],
				/int_x is not a producer/,
			],
			[
				"about a protocol its run does not name",
				citing({ ...unversioned, evidence_id: "evd_legacy" }, { protocol: { protocol_id: "prt_2", revision: 1 } }),
				/it contests protocol prt_2 r1/,
			],
			[
				"about a candidate other than the frozen one",
				citing(
					{ ...failed, evidence_id: "evd_c0", subject_digest: candidate("c0").manifest_digest },
					{ candidate_digest: candidate("c0").manifest_digest },
				),
				/which is not the frozen candidate/,
			],
			[
				"reproduced by a control that does not judge its requirement",
				citing({ ...failed, evidence_id: "evd_lint", control_id: "lint", requirement_ids: ["R2"] }),
				/control lint does not judge requirement R1/,
			],
			[
				"reproduced by a run that passed",
				citing({ ...failed, evidence_id: "evd_pass", verdict: "PASS" }),
				notReproduced,
			],
			[
				"reproduced by a run in which the contested case passed",
				citing({ ...failed, evidence_id: "evd_case", passed_cases: ["R1 greet greets"] }),
				notReproduced,
			],
			[
				"citing a run of another control than the one it names",
				citing(
					{ ...failed, evidence_id: "evd_other_control", control_id: "lint" },
					{ reproduction: { control_id: "unit", evidence_id: "evd_other_control" } },
				),
				notReproduced,
			],
			[
				"citing a run of another candidate than the one it contests",
				citing({ ...failed, evidence_id: "evd_other_subject", subject_digest: candidate("c0").manifest_digest }),
				notReproduced,
			],
			[
				"citing a run under another protocol than the one it contests",
				citing({ ...failed, evidence_id: "evd_other_protocol", protocol_id: "prt_2" }),
				notReproduced,
			],
			[
				"citing a run under another revision of the protocol it contests",
				citing({ ...failed, evidence_id: "evd_other_revision", protocol_revision: 2 }),
				notReproduced,
			],
		];
		for (const [why, [state, facts], issue] of unreproduced) {
			const issues = contestationIssues(state, facts);
			assert.equal(issues.length, 1, `a contestation ${why} is refused on that ground alone: ${issues.join("; ")}`);
			assert.match(issues[0]!, issue, `a contestation ${why}`);
		}
	});

	it("une contestation jugée infondée laisse le protocole et les tests identiques et le code doit être corrigé", () => {
		const r = refused();
		file(r, contestation(r));
		const before = rights(r.s);
		const finding = (actor: typeof KERNEL) =>
			r.try({
				type: "contestation.conclude",
				at: tick(),
				actor,
				contestation_id: "ctt_1",
				finding: "unfounded",
				examiner_id: "int_rev",
				reasons: "the case asserts what the owner answered",
			});
		assert.equal(finding(AGENT).ok, false, "an agent does not record the finding of an examination in its own name");
		assert.equal(r.s.contestations?.[0]?.finding, null);
		const concluded = finding(KERNEL);
		assert.equal(concluded.ok, true, concluded.ok ? "" : concluded.error.message);
		assert.equal(r.s.contestations?.[0]?.finding, "unfounded");
		assert.deepEqual(rights(r.s), before, "the protocol, its protected tests and the refusal of G5 stand");
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_2", feedback: null });
		assert.equal(r.s.phase, "implementation", "the code is to be corrected");
		assert.deepEqual(r.s.protocol, before.protocol);
	});
});
