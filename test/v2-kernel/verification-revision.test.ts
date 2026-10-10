/**
 * A revision a contestation obtains goes back through qualification and freezing, and what was established
 * under the contested protocol stops counting: on the kernel through the traces of the change-lifecycle model,
 * and through the phases of the change.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { loadTrace } from "../support/formal-traces.ts";
import { KernelTranslation, type StepReport, ledgerStore, propertyViolation } from "../support/kernel-replay.ts";
import {
	CONTESTED_CASE,
	OTHER_CASE,
	RIGHT_TEST,
	WRONG_TEST,
	conductContestedChange,
	contesting,
	examining,
	implementing,
	preparing,
	twoCases,
} from "../helpers/contested-change.ts";
import {
	EXECUTOR,
	KERNEL,
	Runner,
	candidate,
	decisionRequest,
	evidence,
	ownerDecides,
	protocol,
	ref,
	tick,
	tuiOrigin,
} from "../helpers/change-fixture.ts";
import { SHOUT_IMPL, removedAfterEach, tempDir } from "../helpers/fixtures.ts";
import type { TestHarness } from "../helpers/harness-fixture.ts";
import type { CandidateRef } from "../../src/contracts/v1/common.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { DecisionRequest } from "../../src/contracts/v1/decision.ts";
import type { Obligation } from "../../src/contracts/v1/protocol.ts";
import type { ChangeCommand } from "../../src/domain/change/commands.ts";

const cleanups = removedAfterEach();
let dir: string;
beforeEach(() => {
	dir = tempDir("495-verification-revision-", cleanups);
});

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** Runs `command` on the change and says why the kernel refused it, if it did. */
function accepted(r: Runner, command: ChangeCommand): string | null {
	const d = r.try(command);
	return d.ok ? null : `${d.error.code}: ${d.error.message}`;
}

/** The owner's answer `option` to `decision`, given from the TUI. */
function answerAs(
	t: TestHarness,
	changeId: string,
	decision: DecisionRequest,
	option: string,
	text: string | null = null,
) {
	return t.harness.answerDecision(
		changeId,
		{
			decision_id: decision.decision_id,
			option_id: option,
			free_text: text,
			reason: null,
			subject_revision: decision.subject.revision,
			scope: null,
			expires_at: null,
		},
		tuiOrigin(),
	);
}

/**
 * A change whose owner accepted candidate c1 under P1 (IH-10 judges R2), while the frozen case of R1 failed on it:
 * G5 refused the candidate.
 */
function acceptedByTheOwnerUnderP1() {
	// R2 is the owner's to judge at acceptance (IH-10); R1 is judged by the contested case.
	const obligations: Obligation[] = [
		{
			requirement: { requirement_id: "R1", revision: 1 },
			mandatory: true,
			control_ids: ["unit"],
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
	];
	const r = new Runner().create().g0().g1();
	r.run({ type: "preparation.open", at: tick(), actor: KERNEL, mandate_ref: ref("prp_1", "prepare") });
	r.run({
		type: "preparation.close",
		at: tick(),
		actor: KERNEL,
		qualified: true,
		capability_ids: ["unit"],
		adopted_ref: ref("prep_1", "prepared"),
	});
	const p1 = protocol({ obligations });
	r.g2(p1).g3().implement();
	const c1 = candidate("c1");
	r.freeze(c1).verify([evidence({ control_id: "unit", subject_digest: c1.manifest_digest, verdict: "FAIL" })]);
	const subject = { kind: "candidate" as const, id: c1.candidate_id, revision: 1, digest: c1.manifest_digest };
	ownerDecides(
		r,
		decisionRequest("IH-10", {
			decision_id: "dec_p1",
			subject,
			question: "Accepter ce candidat ?",
			options: [{ id: "accept", label: "Accepter", effect: "", risky: true }],
		}),
		"accept",
		null,
		"hd_p1",
	);
	r.g5();
	assert.ok(r.s.gates.G5?.evidence_retained.includes("hd_p1"), "under P1, the owner's acceptance judges R2");
	return { r, c1, obligations };
}

/** Files the producer's contestation of the R1 case on c1, has it found wrong, and revises the preparation. */
function reviseOnContestation(r: Runner, c1: CandidateRef): string | null {
	const failed = r.s.evidence.find((e) => e.control_id === "unit")!;
	r.run({
		type: "contestation.file",
		at: tick(),
		actor: KERNEL,
		contestation: {
			contestation_id: "ctt_1",
			intervention_id: "int_1",
			requirement_id: "R1",
			case_name: "R1 greet greets",
			protocol: { protocol_id: "prt_1", revision: 1 },
			candidate_digest: c1.manifest_digest,
			observation: "the case asserts what R1 does not say",
			reproduction: { control_id: "unit", evidence_id: failed.evidence_id },
		},
	});
	r.run({
		type: "contestation.conclude",
		at: tick(),
		actor: KERNEL,
		contestation_id: "ctt_1",
		finding: "test_correction",
		examiner_id: "int_rev",
		reasons: "the case asserts what R1 does not say",
	});
	return accepted(r, {
		type: "artifact.revise",
		at: tick(),
		actor: KERNEL,
		kind: "preparation",
		ref: ref("prv_1", { contestation_id: "ctt_1" }),
		reason: "contestation ctt_1 found the test wrong",
	});
}

describe("a revision obtained by a contestation", () => {
	it("P2 doit être requalifié et une preuve P1 reçue après reprise reste inapplicable", () => {
		const trace = loadTrace(readJson("test/fixtures/formal-traces/contested-revision.json"));
		const store = ledgerStore(join(dir, "state.sqlite"));
		const kernel = new KernelTranslation(trace.human_acceptance, store);
		const reports: StepReport[] = [];
		let beforeRequalifying: StepReport | undefined;
		let lateP1: StepReport | undefined;
		try {
			for (const step of trace.steps) {
				if (step.action === "Requalify")
					beforeRequalifying = kernel.run({ step: step.step, action: "StartAttempt", args: {} });
				reports.push(kernel.run(step));
				// The model leaves no run in flight once G5 has refused: a result of P1 presented here is one another
				// session or an earlier build delivers late, on the very tree the change goes on with under P2.
				if (step.action === "Freeze")
					lateP1 = kernel.run({
						step: step.step,
						action: "Deliver",
						args: { control: "k1", cand: 1, ran: 1, verdict: "PASS" },
					});
			}
			for (const [i, step] of trace.steps.entries()) {
				const { g5, ...expected } = step.expect!;
				const report = reports[i]!;
				assert.deepEqual(report.refusals, [], `step ${step.step} ${step.action}: the kernel takes the allowed step`);
				assert.deepEqual(report.observed, expected, `step ${step.step} ${step.action}: the kernel follows the model`);
				if (g5) assert.equal(report.g5, g5, `step ${step.step}: G5`);
			}
			assert.deepEqual(
				beforeRequalifying?.refusals,
				["intervention.start: INVALID_TRANSITION"],
				"no attempt is produced against the contested protocol before P2 is frozen",
			);
			const state = store.state();
			assert.equal(state.protocol?.ref.protocol_id, "prt_2", "P2 is qualified and frozen under its own identity");
			assert.equal(lateP1?.delivered, "rejected", "a P1 result received after the resume is not recorded under P2");
			assert.deepEqual(lateP1?.observed.evidence, [], "it satisfies no obligation under P2");
			assert.equal(state.outcome, "accepted");
			assert.equal(propertyViolation("FreshAcceptance", state, store.events(), false), null);
			assert.equal(state.contestations?.[0]?.finding, "test_correction", "the contestation stays in the history");
			assert.ok(
				state.evidence.some((e) => e.protocol_id === "prt_1" && !e.valid && e.invalid_reason === "preparation revised"),
				"the P1 evidence stays consultable, invalidated by the revision",
			);
		} finally {
			store.close();
		}
	});

	it("une décision liée à P1 ne contribue plus à l’acceptation sous P2 et reste consultable", () => {
		const { r, c1, obligations } = acceptedByTheOwnerUnderP1();
		const revised = reviseOnContestation(r, c1);
		assert.equal(revised, null, "the finding revises the preparation that froze the case");
		assert.equal(r.s.phase, "qualification", "the change goes back through qualification");
		assert.deepEqual(Object.keys(r.s.gates).sort(), ["G0", "G1"], "G2 and what follows are to be passed again");
		const decision = r.s.human_decisions.find((d) => d.human_decision_id === "hd_p1");
		assert.equal(decision?.valid, false, "the decision taken on P1 is revoked, and kept in the history");

		const p2 = protocol({ protocol_id: "prt_2", obligations });
		r.g2(p2).g3();
		r.implement("int_2", "att_2").freeze(c1);
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v2", idempotency_key: "k_v2" });
		r.run({
			type: "verification.record",
			at: tick(),
			actor: EXECUTOR,
			evidence: [evidence({ control_id: "unit", subject_digest: c1.manifest_digest, protocol_id: "prt_2" })],
		});
		r.run({ type: "verification.complete", at: tick(), actor: KERNEL, operation_id: "op_v2" });
		r.g5();
		const g5 = r.s.gates.G5!;
		assert.equal(g5.evidence_retained.includes("hd_p1"), false, "the P1 decision does not judge R2 under P2");
		assert.notEqual(g5.verdict, "PASS", "the owner is asked again under P2");
		assert.ok(g5.indeterminate_requirements.includes("R2"), g5.reasons.join("; "));
	});

	it("une revue de modèle qui fait réviser la préparation ne révoque aucune réponse du propriétaire sur le besoin", () => {
		const { r, c1 } = acceptedByTheOwnerUnderP1();
		ownerDecides(
			r,
			decisionRequest("IH-04", {
				decision_id: "dec_need",
				subject: { kind: "artifact", id: "req_1", revision: 1, digest: digestValue({ requirements: "R1" }) },
				question: "Garder R1 tel qu'adopté ?",
				options: [{ id: "keep", label: "Garder", effect: "", risky: false }],
			}),
			"keep",
			null,
			"hd_need",
		);
		assert.equal(reviseOnContestation(r, c1), null);
		assert.equal(
			r.s.human_decisions.find((d) => d.human_decision_id === "hd_need")?.valid,
			true,
			"the owner's answer on the requirement holds after the examiner's finding revised the preparation",
		);
	});

	it("une contestation fondée fait écrire de nouveau la préparation, qualifier et geler P2, et les preuves de P1 cessent de compter", async () => {
		const { t, result, changeId } = await conductContestedChange({
			prepare: [preparing(WRONG_TEST), preparing(RIGHT_TEST)],
			implement: [implementing(true), implementing(false)],
			review: [examining("test_correction", "the case expects HELLO X! where R1 says HELLO, X")],
		});
		const state = t.ledger.loadChange(changeId)!.state;
		const events = t.ledger.readChangeEvents(changeId).map(({ event }) => event);
		assert.equal(state.contestations?.[0]?.finding, "test_correction", result.steps.join(" | "));
		const preparations = t.agent.started.filter((m) => m.role === "prepare");
		assert.equal(preparations.length, 2, "the preparation is written again");
		assert.match(
			preparations[1]!.objective,
			new RegExp(`${CONTESTED_CASE}.*found wrong`),
			"the preparation written again is told which case was found wrong",
		);
		const frozen = events.flatMap((e) => (e.type === "protocol.frozen" ? [e.protocol.ref.protocol_id] : []));
		assert.equal(frozen.length, 2, "P2 is qualified and frozen in turn");
		assert.notEqual(frozen[0], frozen[1], "under an identity of its own");
		const p1 = state.evidence.filter((e) => e.protocol_id === frozen[0]);
		assert.ok(p1.length > 0 && p1.every((e) => !e.valid), "what was observed under P1 no longer counts, and stays");
		assert.equal(state.outcome, "accepted", result.steps.join(" | "));
		assert.ok(
			state.gates.G5!.evidence_retained.every(
				(id) => state.evidence.find((e) => e.evidence_id === id)?.protocol_id === frozen[1],
			),
			"the acceptance rests on P2 alone",
		);
	});

	it("le constat d'une contestation de P1 ne fait plus réviser la préparation sous P2, même sur un candidat identique", async () => {
		const { t, result, changeId } = await conductContestedChange(
			{
				prepare: [preparing(WRONG_TEST)],
				implement: [implementing(true), implementing(false)],
				review: [examining("test_correction", "the case expects HELLO X! where R1 says HELLO, X")],
			},
			{ budgets: { max_attempts: 6 } },
		);
		const events = t.ledger.readChangeEvents(changeId).map(({ event }) => event);
		const frozen = events.flatMap((e) => (e.type === "protocol.frozen" ? [e.protocol.ref.protocol_id] : []));
		assert.equal(frozen.length, 2, result.steps.join(" | "));
		const revisions = events.flatMap((e) => (e.type === "artifact.revised" ? [e.reason] : []));
		assert.equal(
			revisions.length,
			1,
			`only what was examined under P1 revised its preparation: ${revisions.join("; ")}`,
		);
		assert.equal(
			events.filter((e) => e.type === "intervention.started" && e.role === "review").length,
			1,
			"no finding is drawn under P2 without an examination under P2",
		);
	});

	it("une exigence que le propriétaire garde laisse le cas et le protocole gelés et renvoie à la correction du code", async () => {
		const { t, changeId } = await conductContestedChange(
			{
				prepare: [preparing(WRONG_TEST)],
				implement: [implementing(true)],
				review: [examining("requirement_change", "the case asserts R1 as adopted; the objection is to R1 itself")],
			},
			{ budgets: { max_attempts: 2 } },
		);
		const pending = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			pending.map((d) => d.options.map((o) => o.id)),
			[["revise", "keep"]],
			"no option accepts the candidate",
		);
		const answered = answerAs(t, changeId, pending[0]!, "keep");
		assert.equal(answered.error, null);
		await t.harness.advance(changeId, { max_steps: 20 });
		const state = t.ledger.loadChange(changeId)!.state;
		const events = t.ledger.readChangeEvents(changeId).map(({ event }) => event);
		assert.equal(events.filter((e) => e.type === "protocol.frozen").length, 1, "the protocol stays the one frozen");
		assert.equal(
			events.some((e) => e.type === "artifact.revised"),
			false,
			"nothing adopted is revised",
		);
		assert.ok(state.attempts.length >= 2, "the code is corrected in a new attempt");
		const feedback = await t.harness.artifacts.read<string>({
			artifact_id: `fb_${state.attempts[0]!.attempt_id}`,
			revision: 1,
		});
		assert.match(feedback, new RegExp(`the owner kept R1 as adopted: the frozen case "${CONTESTED_CASE}" stands`));
	});

	it("un cas que le propriétaire a fait garder n’est pas réécrit sur le constat d’un modèle : l’examinateur reçoit sa réponse et le constat contraire lui est reposé en IH-04", async () => {
		const reasons = "the case expects HELLO X! where R1 says HELLO, X";
		const { t, changeId } = await conductContestedChange(
			{
				prepare: [preparing(WRONG_TEST), preparing(RIGHT_TEST)],
				implement: [implementing(true), implementing(true, `${SHOUT_IMPL}// shout follows greet\n`)],
				review: [
					examining("requirement_change", "the case asserts R1 as adopted; the objection is to R1 itself"),
					examining("test_correction", reasons),
				],
			},
			{ budgets: { max_attempts: 3 } },
		);
		const kept = t.harness.pendingDecisions(changeId)[0]!;
		const answered = answerAs(t, changeId, kept, "keep");
		assert.equal(answered.error, null);
		const result = await t.harness.advance(changeId, { max_steps: 20 });
		const state = t.ledger.loadChange(changeId)!.state;
		const events = t.ledger.readChangeEvents(changeId).map(({ event }) => event);
		const examinations = t.agent.started.filter((m) => m.role === "review");
		assert.equal(
			examinations.length,
			2,
			`the case is contested again on the next candidate: ${result.steps.join(" | ")}`,
		);
		assert.match(
			examinations[1]!.objective,
			new RegExp(`${CONTESTED_CASE}.*the owner .*"keep"`),
			"the examiner is handed the owner's answer keep on this case",
		);
		assert.equal(state.contestations?.[1]?.finding, "test_correction");
		assert.deepEqual(
			events.flatMap((e) => (e.type === "artifact.revised" ? [e.reason] : [])),
			[],
			"no preparation is revised without a new answer of the owner",
		);
		assert.equal(events.filter((e) => e.type === "protocol.frozen").length, 1, "no second protocol is frozen");
		const asked = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			asked.map((d) => d.interaction),
			["IH-04"],
			"the examiner's contrary finding is put to the owner",
		);
		const told = [asked[0]!.question, ...asked[0]!.facts].join(" | ");
		assert.match(told, new RegExp(CONTESTED_CASE), "the owner is told which case");
		assert.match(told, /"keep"/, "the owner is reminded of the answer keep");
		assert.match(asked[0]!.question, /« garder »/, "the question itself recalls the answer keep");
		assert.match(told, new RegExp(reasons), "the owner is told the examination's contrary finding");
		assert.equal(
			state.human_decisions.find((d) => d.decision_id === kept.decision_id)?.valid,
			true,
			"the owner's answer keep stays valid in the record",
		);
	});

	it("deux cas contestés dont un gardé : la révision qu’appelle l’autre attend la réponse du propriétaire, ne lui fait pas réécrire le cas gardé, et sous le protocole gelé ensuite le constat contraire sur le cas gardé lui est reposé en IH-04", async () => {
		const reasons = "the case expects HELLO X! where R1 says HELLO, X";
		const { t, changeId } = await conductContestedChange(
			{
				prepare: [preparing(twoCases("HELLO Y!")), preparing(twoCases("HELLO, Y"))],
				implement: [
					contesting([CONTESTED_CASE]),
					contesting([CONTESTED_CASE, OTHER_CASE], `${SHOUT_IMPL}// shout follows greet\n`),
					contesting([CONTESTED_CASE], `${SHOUT_IMPL}// shout follows greet, under P2\n`),
				],
				review: [
					examining("requirement_change", "the case asserts R1 as adopted; the objection is to R1 itself"),
					examining("test_correction", reasons),
					examining("test_correction", "the case expects HELLO Y! where R1 says HELLO, Y"),
					examining("test_correction", reasons),
				],
			},
			{ budgets: { max_attempts: 6 } },
		);
		const events = () => t.ledger.readChangeEvents(changeId).map(({ event }) => event);
		const revisions = () => events().flatMap((e) => (e.type === "artifact.revised" ? [e.reason] : []));
		const frozen = () => events().filter((e) => e.type === "protocol.frozen").length;
		const keptFirst = t.harness.pendingDecisions(changeId)[0]!;
		assert.equal(answerAs(t, changeId, keptFirst, "keep").error, null);

		const both = await t.harness.advance(changeId, { max_steps: 20 });
		assert.deepEqual(
			revisions(),
			[],
			`no preparation is revised before the owner answers again on the kept case: ${both.steps.join(" | ")}`,
		);
		const askedOnBoth = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			askedOnBoth.map((d) => d.interaction),
			["IH-04"],
			"the finding against the kept case is put to the owner",
		);
		const toldOnBoth = [askedOnBoth[0]!.question, ...askedOnBoth[0]!.facts].join(" | ");
		assert.match(toldOnBoth, new RegExp(CONTESTED_CASE), "the owner is told the kept case");
		assert.match(toldOnBoth, /"keep"/, "the owner is reminded of the answer keep");
		assert.match(toldOnBoth, new RegExp(reasons), "the owner is told the examination's contrary finding");
		const keptAgain = askedOnBoth[0]!;
		assert.equal(answerAs(t, changeId, keptAgain, "keep").error, null);

		const resumed = await t.harness.advance(changeId, { max_steps: 40 });
		const preparations = t.agent.started.filter((m) => m.role === "prepare");
		assert.equal(
			preparations.length,
			2,
			`the preparation is written again for the other case: ${resumed.steps.join(" | ")}`,
		);
		assert.match(preparations[1]!.objective, new RegExp(`"${OTHER_CASE}".*found wrong`));
		assert.doesNotMatch(
			preparations[1]!.objective,
			new RegExp(`"${CONTESTED_CASE}".*found wrong`),
			"the mandate does not name the kept case among the cases found wrong",
		);
		const examinations = t.agent.started.filter((m) => m.role === "review");
		assert.equal(examinations.length, 4, `the kept case is contested again under P2: ${resumed.steps.join(" | ")}`);
		assert.match(
			examinations[3]!.objective,
			new RegExp(`${CONTESTED_CASE}.*the owner .*"keep"`),
			"the examiner under P2 is handed the owner's answer keep on this case",
		);
		assert.equal(revisions().length, 1, `only the other case revised the preparation: ${revisions().join("; ")}`);
		assert.equal(frozen(), 2, "no protocol is frozen after P2 on the finding against the kept case");
		const askedUnderP2 = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			askedUnderP2.map((d) => d.interaction),
			["IH-04"],
			"the finding against the kept case under P2 is put to the owner again",
		);
		assert.match(askedUnderP2[0]!.facts.join(" | "), new RegExp(CONTESTED_CASE));
		const state = t.ledger.loadChange(changeId)!.state;
		for (const answer of [keptFirst, keptAgain])
			assert.equal(
				state.human_decisions.find((d) => d.decision_id === answer.decision_id)?.valid,
				true,
				"the owner's answers keep stay valid in the record",
			);
	});

	it("un cas gardé contesté de nouveau sous un nom que l’obligation gelée ne porte pas est refusé par le noyau : ni examen, ni révision de la préparation, ni second protocole, et la réponse « garder » reste valide", async () => {
		const neighbour = `${CONTESTED_CASE}!`;
		const { t, changeId } = await conductContestedChange(
			{
				prepare: [preparing(WRONG_TEST), preparing(RIGHT_TEST)],
				implement: [implementing(true), contesting([neighbour], `${SHOUT_IMPL}// shout follows greet\n`)],
				review: [
					examining("requirement_change", "the case asserts R1 as adopted; the objection is to R1 itself"),
					examining("test_correction", "the case expects HELLO X! where R1 says HELLO, X"),
				],
			},
			{ budgets: { max_attempts: 3 } },
		);
		const kept = t.harness.pendingDecisions(changeId)[0]!;
		const answered = answerAs(t, changeId, kept, "keep");
		assert.equal(answered.error, null);
		const result = await t.harness.advance(changeId, { max_steps: 20 });
		const state = t.ledger.loadChange(changeId)!.state;
		const events = t.ledger.readChangeEvents(changeId).map(({ event }) => event);
		assert.ok(state.attempts.length >= 2, `the producer contests on the next candidate: ${result.steps.join(" | ")}`);
		assert.ok(
			t.progress.some((m) => m.includes(`case "${neighbour}" is none of the frozen cases of R1`)),
			`the kernel refuses the contestation naming the case absent from the frozen cases of R1: ${t.progress.join(" | ")}`,
		);
		assert.deepEqual(
			events.flatMap((e) => (e.type === "contestation.filed" ? [e.contestation.case_name] : [])),
			[CONTESTED_CASE],
			"no contestation is filed for the case the frozen obligation does not carry",
		);
		assert.equal(
			t.agent.started.filter((m) => m.role === "review").length,
			1,
			"no examination is run on the case the frozen obligation does not carry",
		);
		assert.deepEqual(
			events.flatMap((e) => (e.type === "artifact.revised" ? [e.reason] : [])),
			[],
			"the preparation is not revised",
		);
		assert.equal(events.filter((e) => e.type === "protocol.frozen").length, 1, "no second protocol is frozen");
		assert.equal(
			state.human_decisions.find((d) => d.decision_id === kept.decision_id)?.valid,
			true,
			"the owner's answer keep stays valid in the record",
		);
	});

	it("un besoin qui change est tranché par le propriétaire et repasse par G1", async () => {
		const { t, changeId } = await conductContestedChange({
			prepare: [preparing(WRONG_TEST)],
			implement: [implementing(true)],
			review: [examining("requirement_change", "the case asserts R1 as adopted; the objection is to R1 itself")],
		});
		const pending = t.harness.pendingDecisions(changeId);
		assert.deepEqual(
			pending.map((d) => d.interaction),
			["IH-04"],
			"what changes the need is the owner's to decide",
		);
		assert.match(
			pending[0]!.facts.join(" | "),
			new RegExp(CONTESTED_CASE),
			"the owner is told which case is contested",
		);
		const before = t.ledger.loadChange(changeId)!.state;
		assert.equal(before.contestations?.[0]?.finding, "requirement_change");
		assert.equal(before.outcome, "pending", "nothing is accepted on the examiner's word");

		const text = "shout(name) returns greet(name) upper-cased followed by an exclamation mark";
		const answered = answerAs(t, changeId, pending[0]!, "revise", text);
		assert.equal(answered.error, null);
		await t.harness.advance(changeId, { max_steps: 10 });
		const state = t.ledger.loadChange(changeId)!.state;
		const specifications = t.agent.started.filter((m) => m.role === "specify");
		assert.ok(
			specifications.at(-1)!.objective.includes(text),
			"the specification is written again with the owner's text",
		);
		const events = t.ledger.readChangeEvents(changeId).map(({ event }) => event);
		const revision = events.findIndex((e) => e.type === "artifact.revised" && e.kind === "requirements");
		assert.ok(revision >= 0, "the requirements are revised");
		assert.ok(
			events.slice(revision).some((e) => e.type === "gate.decided" && e.decision.gate === "G1"),
			"the revised requirements go back through G1",
		);
		assert.ok(
			state.human_decisions.filter((d) => d.interaction === "IH-04").every((d) => !d.valid),
			"the answer given on the former requirements holds no more, and stays in the history",
		);
	});
});
