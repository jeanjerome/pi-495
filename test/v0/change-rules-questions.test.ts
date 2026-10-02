import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
	Runner,
	candidate,
	decisionRequest,
	evidence,
	integrationPrepared,
	mandate,
	ownerAnswers,
	ownerDecides,
	ref,
	requirements,
	tick,
	tuiOrigin,
	AGENT,
	HUMAN,
	KERNEL,
} from "../helpers/change-fixture.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { ActorRef } from "../../src/contracts/v1/common.ts";
import type { DecisionRequest, HumanOrigin } from "../../src/contracts/v1/decision.ts";
import { Mandate as MandateSchema } from "../../src/contracts/v1/protocol.ts";
import type { Mandate } from "../../src/contracts/v1/protocol.ts";
import { validate } from "../../src/contracts/validate.ts";
import { apply } from "../../src/domain/change/apply.ts";
import type { Decision } from "../../src/domain/change/decide.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";
import { answersOf, isQuestionClosed, specificationStanding } from "../../src/domain/change/state.ts";
import type { DomainError } from "../../src/domain/errors.ts";

/** Opens a material question and records a human answer for it, without going through IH-01. */
function answerMaterialQuestion(r: Runner, id: string, question: string, answer = "422"): void {
	r.run({ type: "question.open", at: tick(), actor: KERNEL, id, question, material: true, decision_id: null });
	r.run({ type: "question.answer", at: tick(), actor: HUMAN, id, answer, human_decision_id: null });
}

/** The IH-01 request that puts a material question to the owner, with its three outcomes. */
function ih01Request(r: Runner, decisionId: string, question: string): DecisionRequest & { interaction: "IH-01" } {
	return decisionRequest("IH-01", {
		decision_id: decisionId,
		subject: { kind: "change", id: "chg_1", revision: r.s.revision, digest: r.s.reference.digest },
		question,
		options: [
			{ id: "answer", label: "A", effect: "", risky: false },
			{ id: "close", label: "C", effect: "", risky: true },
			{ id: "abandon", label: "B", effect: "", risky: true },
		],
		required_authority: "requester",
		allow_free_text: true,
	});
}

/** Opens a material question and closes it through IH-01, as the owner would by choosing "close". */
function closeMaterialQuestion(r: Runner, id: string, question: string): void {
	r.run({ type: "question.open", at: tick(), actor: KERNEL, id, question, material: true, decision_id: `dec_${id}` });
	ownerDecides(r, ih01Request(r, `dec_${id}`, question), "close", null, `hd_${id}`);
}

/** Opens a material question and answers it through IH-01 under `hd_<id>`, as the owner would by typing the answer. */
function answerThroughDecision(r: Runner, id: string, question: string, answer: string): void {
	r.run({ type: "question.open", at: tick(), actor: KERNEL, id, question, material: true, decision_id: `dec_${id}` });
	ownerDecides(r, ih01Request(r, `dec_${id}`, question), "answer", answer, `hd_${id}`);
}

/**
 * The owner revokes their resolution of material question `id`, the command carrying the IH-01
 * request that asks it again under `decisionId`.
 */
function revokeResolution(r: Runner, id: string, decisionId: string, origin: HumanOrigin = tuiOrigin()): Decision {
	const question = r.s.open_questions.find((x) => x.id === id)?.question ?? "?";
	return r.try({
		type: "question.revoke",
		at: tick(),
		actor: origin.actor,
		id,
		origin,
		request: ih01Request(r, decisionId, question),
	});
}

describe("intake and mandate (SA-004, RM-001, RM-003)", () => {
	it("a material question blocks G0 with decision_required and persists the question", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "Quelle règle d'acceptation ?",
			material: true,
			decision_id: "dec_q1",
		});
		r.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-01", {
				decision_id: "dec_q1",
				subject: { kind: "change", id: "chg_1", revision: 3, digest: r.s.reference.digest },
				question: "Quelle règle ?",
				options: [{ id: "a", label: "A", effect: "", risky: false }],
				required_authority: "requester",
				allow_free_text: true,
			}),
		});
		assert.equal(r.s.status, "decision_required");
		assert.equal(r.s.stop_reason, "decision_pending");
		r.expectError(
			{
				type: "gate.evaluate",
				gate: "G0",
				at: tick(),
				actor: KERNEL,
				mandate_ref: ref("m", mandate()),
				mandate: mandate(),
			},
			"DECISION_REQUIRED",
		);
		assert.equal(r.s.gates.G0, undefined);
		assert.equal(r.s.adopted.requirements, undefined);
		r.run({
			type: "decision.answer",
			at: tick(),
			actor: HUMAN,
			human_decision_id: "hd_q1",
			response: {
				decision_id: "dec_q1",
				option_id: null,
				free_text: "règle A",
				reason: null,
				subject_revision: 3,
				scope: null,
				expires_at: null,
			},
			origin: tuiOrigin(),
		});
		assert.equal(r.s.open_questions[0]?.answer, "règle A");
		assert.equal(r.s.status, "ready");
		r.g0();
		assert.equal(r.s.phase, "specifying");
	});

	it("G0 fails while a material question inside the mandate is unanswered", () => {
		const r = new Runner().create();
		const m = mandate({ open_questions: [{ id: "q9", question: "?", material: true, answer: null }] });
		r.run({ type: "gate.evaluate", gate: "G0", at: tick(), actor: KERNEL, mandate_ref: ref("m", m), mandate: m });
		assert.equal(r.s.gates.G0?.verdict, "FAIL");
		assert.equal(r.s.phase, "clarifying");
		assert.equal(r.s.gates.G0?.next_action, "answer_material_questions");
	});

	it("the original request cannot be re-proposed and a producer cannot propose the protocol (RM-001, RM-013)", () => {
		const r = new Runner().create();
		r.expectError(
			{ type: "artifact.propose", at: tick(), actor: KERNEL, kind: "request", ref: ref("x", 1) },
			"POLICY_DENIED",
		);
		r.expectError(
			{ type: "artifact.propose", at: tick(), actor: AGENT, kind: "protocol", ref: ref("x", 1) },
			"POLICY_DENIED",
		);
		r.run({ type: "artifact.propose", at: tick(), actor: AGENT, kind: "requirements", ref: ref("x", 1) });
		assert.equal(r.s.proposals.requirements?.length, 1);
	});

	it("an agent cannot evaluate a gate (RM-031)", () => {
		const r = new Runner().create();
		r.expectError(
			{
				type: "gate.evaluate",
				gate: "G0",
				at: tick(),
				actor: AGENT,
				mandate_ref: ref("m", mandate()),
				mandate: mandate(),
			},
			"POLICY_DENIED",
		);
	});

	it("G1 refuses an answer bound to a requirement the document does not carry or to no mandatory one, and accepts a non-mandatory one named beside a mandatory one (RM-011)", () => {
		const answered = (requirementIds: string[]) => {
			const r = new Runner().create();
			r.run({
				type: "question.open",
				at: tick(),
				actor: KERNEL,
				id: "q1",
				question: "chaîne brute ou trimée ?",
				material: true,
				decision_id: "dec_q1",
			});
			const presented = r.s.revision;
			r.run({
				type: "decision.request",
				at: tick(),
				actor: KERNEL,
				request: decisionRequest("IH-01", {
					decision_id: "dec_q1",
					subject: { kind: "change", id: "chg_1", revision: presented, digest: r.s.reference.digest },
					question: "chaîne brute ou trimée ?",
					options: [{ id: "a", label: "A", effect: "", risky: false }],
					required_authority: "requester",
					allow_free_text: true,
				}),
			});
			r.run({
				type: "decision.answer",
				at: tick(),
				actor: HUMAN,
				human_decision_id: "hd_q1",
				response: {
					decision_id: "dec_q1",
					option_id: null,
					free_text: "trimée",
					reason: null,
					subject_revision: presented,
					scope: null,
					expires_at: null,
				},
				origin: tuiOrigin(),
			});
			const doc = requirements();
			doc.requirements.push({ ...doc.requirements[1]!, requirement_id: "R3", mandatory: false });
			doc.answers = [
				{
					question_id: "q1",
					question: "chaîne brute ou trimée ?",
					answer: "trimée",
					observable: true,
					requirement_ids: requirementIds,
				},
			];
			return r.g0().g1(doc).s.gates.G1!;
		};
		const refused = answered(["R1-trimee", "R3"]);
		assert.equal(refused.verdict, "FAIL");
		assert.ok(
			refused.reasons.some((x) => x.includes("R1-trimee") && x.includes("does not carry")),
			refused.reasons.join(" | "),
		);
		assert.ok(
			refused.reasons.some((x) => x.includes("no mandatory requirement carries")),
			refused.reasons.join(" | "),
		);
		assert.equal(
			refused.reasons.some((x) => x.includes("R3")),
			false,
			"naming a non-mandatory requirement is not itself a reason",
		);
		assert.equal(answered(["R1", "R3"]).verdict, "PASS");
	});

	it("G1 refuses a material answer declared to fix nothing observable while its question is not closed, naming it, and requires nothing of one that is closed (BES-02, D-37)", () => {
		const openAndAnswer = (): Runner => {
			const r = new Runner().create();
			answerMaterialQuestion(r, "q1", "422 ou 400 ?");
			return r;
		};
		const declaresNonObservable = () => {
			const doc = requirements();
			doc.answers = [
				{ question_id: "q1", question: "422 ou 400 ?", answer: "422", observable: false, requirement_ids: [] },
			];
			return doc;
		};
		const open = openAndAnswer();
		const refused = open.g0().g1(declaresNonObservable()).s.gates.G1!;
		assert.equal(refused.verdict, "FAIL");
		assert.ok(
			refused.reasons.some((x) => x.includes("q1") && x.includes("fix nothing observable") && x.includes("not closed")),
			refused.reasons.join(" | "),
		);
		const closed = openAndAnswer();
		closed.run({ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() });
		const pass = closed.g0().g1(declaresNonObservable()).s.gates.G1!;
		assert.equal(pass.verdict, "PASS", pass.reasons.join(" | "));
	});

	it("passing from a refused binding to a declaration that fixes nothing observable is not progress: the reopening stalls naming the answer, unless the question is closed (6f)", () => {
		const r = new Runner().create();
		answerMaterialQuestion(r, "q1", "422 ou 400 ?");
		const requirementsList = [{ requirement_id: "R1", mandatory: true }];
		const boundToNothing = {
			requirements: requirementsList,
			answers: [{ question_id: "q1", observable: true, requirement_ids: ["R-missing"] }],
		};
		const declaresNonObservable = {
			requirements: requirementsList,
			answers: [{ question_id: "q1", observable: false, requirement_ids: [] }],
		};
		const first = specificationStanding(r.s, boundToNothing, { earlier: [], sinceLastHumanAct: [] });
		assert.equal(first.reopen, true, "the first report gains nothing bound; one rewriting is still owed");
		const second = specificationStanding(r.s, declaresNonObservable, {
			earlier: [],
			sinceLastHumanAct: [boundToNothing],
		});
		assert.equal(
			second.stalled,
			true,
			"swapping a refused binding for an unclosed declaration that fixes nothing observable is not progress",
		);
		assert.deepEqual(
			second.ignored.map((q) => q.id),
			["q1"],
		);
	});

	it("naming a mandatory requirement does not turn a declaration that fixes nothing observable into a binding (BES-02, M1)", () => {
		const r = new Runner().create();
		answerMaterialQuestion(r, "q1", "422 ou 400 ?");
		const report = {
			requirements: [{ requirement_id: "R1", mandatory: true }],
			answers: [{ question_id: "q1", observable: false, requirement_ids: ["R1"] }],
		};
		const standing = specificationStanding(r.s, report, { earlier: [], sinceLastHumanAct: [] });
		assert.equal(
			standing.declared.has("q1"),
			false,
			"a proposal to fix nothing observable is never declared bound (M1)",
		);
		assert.deepEqual(
			standing.ignored.map((q) => q.id),
			["q1"],
			"a proposal stays ignored, not bound, whatever mandatory requirement it names (M1)",
		);
	});

	it("a rewritten report's proposal erases the binding an earlier report gave a mandatory requirement (6c, M1)", () => {
		const r = new Runner().create();
		answerMaterialQuestion(r, "q1", "422 ou 400 ?");
		const requirementsList = [{ requirement_id: "R1", mandatory: true }];
		const boundToR1 = {
			requirements: requirementsList,
			answers: [{ question_id: "q1", observable: true, requirement_ids: ["R1"] }],
		};
		const proposesNonObservable = {
			requirements: requirementsList,
			answers: [{ question_id: "q1", observable: false, requirement_ids: [] }],
		};
		const standing = specificationStanding(r.s, proposesNonObservable, {
			earlier: [boundToR1],
			sinceLastHumanAct: [],
		});
		assert.equal(
			standing.declared.has("q1"),
			false,
			"a later proposal to fix nothing observable erases the binding it inherits, not just one it would have gained",
		);
		assert.deepEqual(
			standing.ignored.map((q) => q.id),
			["q1"],
		);
	});

	it("choosing close on IH-01 closes the question under the actor instead of recording an answer (BES-02)", () => {
		const r = new Runner().create();
		closeMaterialQuestion(r, "q1", "Quelle règle d'acceptation ?");
		const q = r.s.open_questions.find((x) => x.id === "q1")!;
		assert.equal(q.answer, null, "closing does not record an answer");
		assert.equal(q.closed_by?.actor_id, HUMAN.actor_id);
		assert.ok(q.closed_at);
		assert.equal(r.s.status, "ready");
	});

	it("a decision carried by a model output or a tool call cannot close a question (BES-02, RM-031)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: "dec_q1",
		});
		const presented = r.s.revision;
		r.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-01", {
				decision_id: "dec_q1",
				subject: { kind: "change", id: "chg_1", revision: presented, digest: r.s.reference.digest },
				question: "?",
				options: [{ id: "close", label: "C", effect: "", risky: true }],
				required_authority: "requester",
				allow_free_text: true,
			}),
		});
		const forged: ActorRef = { ...HUMAN, actor_type: "agent", origin: "model_output", authentication_level: "none" };
		r.expectError(
			{
				type: "decision.answer",
				at: tick(),
				actor: forged,
				human_decision_id: "hd_q1",
				response: {
					decision_id: "dec_q1",
					option_id: "close",
					free_text: null,
					reason: null,
					subject_revision: presented,
					scope: null,
					expires_at: null,
				},
				origin: { actor: forged, host: "tui", session_id: "s1", asserted_at: tick() },
			},
			"INVALID_PROVENANCE",
		);
		const q = r.s.open_questions.find((x) => x.id === "q1")!;
		assert.equal(q.closed_at, null);
		assert.equal(q.material, true);
	});

	it("G0 does not count a closed material question as open, whether the mandate still lists it or not (BES-02)", () => {
		const r = new Runner().create();
		closeMaterialQuestion(r, "q1", "?");
		const m = mandate({ open_questions: [{ id: "q1", question: "?", material: true, answer: null }] });
		r.g0(m);
		assert.equal(r.s.gates.G0?.verdict, "PASS", r.s.gates.G0?.reasons.join(" | "));
		assert.equal(r.s.phase, "specifying");
	});

	it("an agent, a model output or a tool call cannot lift a stop a resume lifts (RM-031)", () => {
		const r = new Runner().create();
		r.run({
			type: "change.block",
			at: tick(),
			actor: KERNEL,
			reason: "stagnation",
			detail: "the specification loses material answer(s) q1",
			retryable: true,
		});
		for (const actor of [
			AGENT,
			{ ...HUMAN, origin: "model_output" as const },
			{ ...HUMAN, origin: "tool_call" as const },
		])
			r.expectError({ type: "change.unblock", at: tick(), actor }, "POLICY_DENIED");
		assert.equal(r.s.status, "blocked");
		r.run({ type: "change.unblock", at: tick(), actor: HUMAN });
		assert.equal(r.s.status, "ready");
	});

	it("a kernel close command closes a material question and lifts a stagnation stop, like a resume (BES-02)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: null,
		});
		r.run({
			type: "change.block",
			at: tick(),
			actor: KERNEL,
			reason: "stagnation",
			detail:
				"the specification loses material answer(s) q1; resume rewrites the specification, close <question> closes a question that is no longer material, cancel abandons the change",
			retryable: true,
		});
		r.run({ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() });
		const q = r.s.open_questions.find((x) => x.id === "q1")!;
		assert.ok(q.closed_at);
		assert.equal(q.closed_by?.actor_id, HUMAN.actor_id);
		assert.equal(q.answer, null, "closing does not record an answer");
		assert.equal(r.s.status, "ready", "the stop is lifted like a resume lifts it");
	});

	it("a question from a dossier written before closed_at existed reads as open, not closed (BES-02, M1)", () => {
		const r = new Runner().create();
		answerMaterialQuestion(r, "q1", "400 ou 422 ?");
		// `SqliteLedger.loadChange` hands back `JSON.parse(row.state)` as is: a row written before
		// `closed_at`/`closed_by` existed carries neither key, not one set to `null`.
		const legacy = legacyState(r.s, "q1");
		const q = legacy.open_questions.find((x) => x.id === "q1")!;
		assert.equal(isQuestionClosed(q), false, "a question with no closed_at key at all reads as open");
		const answer = answersOf(legacy, new Map())[0];
		assert.equal(
			answer?.observable,
			true,
			"the answer stays held observable; a missing closed_at must not silently dispense it from every requirement (M1)",
		);
	});

	/** A copy of `state` with `closed_at`/`closed_by` stripped off the named question, as
	 * `SqliteLedger.loadChange` hands back a row written before the two fields existed: neither key at
	 * all, not one set to `null`. */
	function legacyState<T extends { open_questions: { id: string }[] }>(state: T, id: string): T {
		const legacy = JSON.parse(JSON.stringify(state)) as T;
		const q = legacy.open_questions.find((x) => x.id === id)!;
		delete (q as { closed_at?: unknown }).closed_at;
		delete (q as { closed_by?: unknown }).closed_by;
		return legacy;
	}

	function stripClosedFields(r: Runner, id: string): void {
		r.state = legacyState(r.s, id);
	}

	it("a legacy material question with no closed_at key still blocks G0, not read as already closed (BES-02, M1)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "400 ou 422 ?",
			material: true,
			decision_id: null,
		});
		stripClosedFields(r, "q1");
		const g0 = r.g0().s.gates.G0!;
		assert.equal(g0.verdict, "FAIL");
		assert.ok(
			g0.reasons.some((x) => x.includes("material question open: q1")),
			g0.reasons.join(" | "),
		);
	});

	it("a legacy material answer with no closed_at key still needs a binding at G1, not read as already closed (BES-02, M1)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "400 ou 422 ?",
			material: true,
			decision_id: null,
		});
		r.run({ type: "question.answer", at: tick(), actor: HUMAN, id: "q1", answer: "422", human_decision_id: null });
		stripClosedFields(r, "q1");
		// `requirements()` binds nothing to q1: its default `answers` fixture is empty, and declares no
		// question at all.
		const g1 = r.g0().g1(requirements()).s.gates.G1!;
		assert.equal(g1.verdict, "FAIL");
		assert.ok(
			g1.reasons.some((x) => x.includes("q1") && x.includes("absent from the requirements")),
			g1.reasons.join(" | "),
		);
	});

	it("specificationStanding does not read a legacy, unanswered question with no closed_at key as resolved (BES-02, M1)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "400 ou 422 ?",
			material: true,
			decision_id: null,
		});
		const legacy = legacyState(r.s, "q1");
		const report = { requirements: [{ requirement_id: "R1", mandatory: true }], answers: [] };
		const standing = specificationStanding(legacy, report, { earlier: [], sinceLastHumanAct: [] });
		assert.equal(
			standing.settled,
			false,
			"q1 is neither answered nor actually closed; a missing closed_at must not read as resolved (M1)",
		);
		assert.equal(standing.stalled, false);
	});

	it("specificationStanding still owes a binding for a legacy, answered question with no closed_at key (BES-02, M1)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "400 ou 422 ?",
			material: true,
			decision_id: null,
		});
		r.run({ type: "question.answer", at: tick(), actor: HUMAN, id: "q1", answer: "422", human_decision_id: null });
		const legacy = legacyState(r.s, "q1");
		// Says nothing of q1: its `answers` array is empty, naming no question at all.
		const report = { requirements: [{ requirement_id: "R1", mandatory: true }], answers: [] };
		const standing = specificationStanding(legacy, report, { earlier: [], sinceLastHumanAct: [] });
		assert.deepEqual(
			standing.ignored.map((x) => x.id),
			["q1"],
			"a legacy question with no closed_at key still owes a binding, not a free pass (M1)",
		);
	});

	it("closes a question under the verified human origin, not under the command's own executing actor (BES-02, RM-024)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: null,
		});
		r.run({ type: "question.close", at: tick(), actor: KERNEL, id: "q1", origin: tuiOrigin() });
		const q = r.s.open_questions.find((x) => x.id === "q1")!;
		assert.equal(
			q.closed_by?.actor_id,
			HUMAN.actor_id,
			"closed_by is the verified human origin the provenance check reads, not the kernel that carried the command",
		);
	});

	it("closes a question via IH-01 under the verified human origin, not under decision.answer's own executing actor (BES-02, RM-024)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: "dec_q1",
		});
		const presented = r.s.revision;
		r.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-01", {
				decision_id: "dec_q1",
				subject: { kind: "change", id: "chg_1", revision: presented, digest: r.s.reference.digest },
				question: "?",
				options: [{ id: "close", label: "C", effect: "", risky: true }],
				required_authority: "requester",
				allow_free_text: true,
			}),
		});
		r.run({
			type: "decision.answer",
			at: tick(),
			// The command is carried by the kernel, on the human's behalf; the verified origin is what
			// must land in closed_by, not this executing actor.
			actor: KERNEL,
			human_decision_id: "hd_q1",
			response: {
				decision_id: "dec_q1",
				option_id: "close",
				free_text: null,
				reason: null,
				subject_revision: presented,
				scope: null,
				expires_at: null,
			},
			origin: tuiOrigin(),
		});
		const q = r.s.open_questions.find((x) => x.id === "q1")!;
		assert.equal(
			q.closed_by?.actor_id,
			HUMAN.actor_id,
			"closed_by is the verified origin decision.answer carries, not the actor that executed the command",
		);
	});

	it("records the human decision that closed a question via IH-01, so the exported dossier traces it (BES-02, §12)", () => {
		const r = new Runner().create();
		closeMaterialQuestion(r, "q1", "Quelle règle d'acceptation ?");
		assert.ok(
			r.events.some((e) => e.type === "question.closed" && e.human_decision_id === "hd_q1"),
			"the closure names the same human_decision_id decision.recorded carries for the chosen option (§12)",
		);
	});

	it("the mandate contract refuses closed_by: null; a closed question's actor is never absent, never null (BES-02, RM-024)", () => {
		const withNullClosedBy = {
			...mandate({
				open_questions: [{ id: "q1", question: "?", material: true, answer: null }],
			}),
			open_questions: [{ id: "q1", question: "?", material: true, answer: null, closed_by: null }],
		} as unknown as Mandate;
		assert.throws(() => validate(MandateSchema, withNullClosedBy, "mandate"), /closed_by/);
		const absent: Mandate = mandate({ open_questions: [{ id: "q1", question: "?", material: true, answer: null }] });
		assert.doesNotThrow(
			() => validate(MandateSchema, absent, "mandate"),
			"absent stays valid for a question still open",
		);
	});

	it("a close command leaves in place a stop a resume does not lift (BES-02)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: null,
		});
		r.run({
			type: "change.block",
			at: tick(),
			actor: KERNEL,
			reason: "policy_denied",
			detail: "an unrelated stop the closure does not answer",
			retryable: false,
		});
		r.run({ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() });
		const q = r.s.open_questions.find((x) => x.id === "q1")!;
		assert.ok(q.closed_at, "the question is closed regardless");
		assert.equal(r.s.status, "blocked", "a stop a resume would not lift is not lifted by the closure either");
		assert.equal(r.s.stop_reason, "policy_denied");
	});

	it("a close command outside clarification, on an unknown, non-material or already closed question is refused, naming why (BES-02)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: null,
		});
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q2",
			question: "?",
			material: false,
			decision_id: null,
		});
		r.expectError(
			{ type: "question.close", at: tick(), actor: HUMAN, id: "unknown", origin: tuiOrigin() },
			"UNKNOWN_REFERENCE",
		);
		r.expectError(
			{ type: "question.close", at: tick(), actor: HUMAN, id: "q2", origin: tuiOrigin() },
			"PRECONDITION_FAILED",
		);
		r.run({ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() });
		r.expectError(
			{ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() },
			"PRECONDITION_FAILED",
		);
		r.g0(mandate({ open_questions: [{ id: "q1", question: "?", material: true, answer: null }] }));
		assert.equal(r.s.phase, "specifying");
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q3",
			question: "?",
			material: true,
			decision_id: null,
		});
		r.expectError(
			{ type: "question.close", at: tick(), actor: HUMAN, id: "q3", origin: tuiOrigin() },
			"INVALID_TRANSITION",
		);
	});

	it("a close command is refused while an intervention runs or a decision is pending, naming the way out (BES-02)", () => {
		const running = new Runner().create();
		running.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: null,
		});
		running.run({
			type: "intervention.start",
			at: tick(),
			actor: KERNEL,
			intervention_id: "int_s",
			role: "specify",
			attempt_id: null,
			model: { provider_id: "omlx", model_id: "m", thinking_level: "off", location: "on_machine" },
			profile_id: "specify",
			profile_qualified: true,
		});
		running.expectError(
			{ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() },
			"PRECONDITION_FAILED",
		);

		const pending = new Runner().create();
		pending.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: null,
		});
		pending.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q2",
			question: "?",
			material: true,
			decision_id: "dec_q2",
		});
		pending.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-01", {
				decision_id: "dec_q2",
				subject: { kind: "change", id: "chg_1", revision: pending.s.revision, digest: pending.s.reference.digest },
				question: "?",
				options: [
					{ id: "answer", label: "A", effect: "", risky: false },
					{ id: "close", label: "C", effect: "", risky: true },
				],
				required_authority: "requester",
				allow_free_text: true,
			}),
		});
		const err = pending.expectError(
			{ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() },
			"PRECONDITION_FAILED",
		);
		assert.match(err.message, /pending/);
	});

	it("a close command carried by an agent, a model output, a tool call or an unauthenticated origin is refused (BES-02, RM-031)", () => {
		const r = new Runner().create();
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: "?",
			material: true,
			decision_id: null,
		});
		const forgedOrigins: HumanOrigin[] = [
			{ actor: AGENT, host: "tui", session_id: "s1", asserted_at: tick() },
			{ actor: { ...HUMAN, origin: "model_output" }, host: "tui", session_id: "s1", asserted_at: tick() },
			{ actor: { ...HUMAN, origin: "tool_call" }, host: "tui", session_id: "s1", asserted_at: tick() },
			{ actor: { ...HUMAN, authentication_level: "none" }, host: "tui", session_id: "s1", asserted_at: tick() },
		];
		for (const origin of forgedOrigins)
			r.expectError({ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin }, "INVALID_PROVENANCE");
		const q = r.s.open_questions.find((x) => x.id === "q1")!;
		assert.equal(q.closed_at, null);
	});

	it("answersOf copies a closed question's answer as fixing nothing observable and bound to nothing, whatever the report declares (BES-02)", () => {
		const r = new Runner().create();
		answerMaterialQuestion(r, "q1", "422 ou 400 ?");
		r.run({ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() });

		const undeclared = answersOf(r.s, new Map());
		assert.equal(undeclared.length, 1);
		assert.equal(undeclared[0]!.observable, false);
		assert.deepEqual(undeclared[0]!.requirement_ids, []);

		const stillLinked = answersOf(r.s, new Map([["q1", ["R1"]]]));
		assert.equal(stillLinked[0]!.observable, false, "closing dispenses the answer whatever the report still declares");
		assert.deepEqual(stillLinked[0]!.requirement_ids, []);
	});

	it("answersOf leaves an answered, unclosed question's binding to the report's declaration, as before (BES-02)", () => {
		const r = new Runner().create();
		answerMaterialQuestion(r, "q1", "422 ou 400 ?");
		const undeclared = answersOf(r.s, new Map());
		assert.equal(undeclared[0]!.observable, true);
		assert.deepEqual(undeclared[0]!.requirement_ids, []);
	});
});

describe("revoking the resolution of a material question (DEC-06)", () => {
	const Q1 = "Quel statut pour une saisie invalide ?";
	const Q2 = "Quelle longueur maximale ?";

	const question = (r: Runner, id: string) => r.s.open_questions.find((q) => q.id === id)!;
	const isValid = (r: Runner, humanDecisionId: string) =>
		r.s.human_decisions.find((d) => d.human_decision_id === humanDecisionId)?.valid;
	const pending = (r: Runner) => r.s.pending_decisions.map((d) => [d.interaction, d.decision_id]);
	const bound = (id: string, text: string, answer: string, requirementId: string) => ({
		question_id: id,
		question: text,
		answer,
		observable: true,
		requirement_ids: [requirementId],
	});

	/** Q1 answered "400" through IH-01 and carried by R1, up to a change that passed G3. */
	function answeredToImplementing(runner: Runner, m: Mandate = mandate()): Runner {
		const r = runner.create();
		answerThroughDecision(r, "q1", Q1, "400");
		return r
			.g0(m)
			.g1(requirements({ answers: [bound("q1", Q1, "400", "R1")] }))
			.g2()
			.g3();
	}

	/** Events a build before this kernel wrote, applied as its journal is read back. */
	function readBack(r: Runner, events: ChangeEvent[]): void {
		for (const event of events) {
			r.state = apply(r.state, event);
			r.events.push(event);
		}
	}

	/** The pause as a build before this kernel wrote it: the change paused, and the verification it suspended left open. */
	function pausedByAnEarlierBuild(r: Runner): void {
		readBack(r, [
			{ type: "resume_point.saved", at: tick(), actor: HUMAN, phase: r.s.phase, status: r.s.status },
			{ type: "status.changed", at: tick(), actor: HUMAN, status: "paused", stop_reason: null, detail: null },
		]);
	}

	/** The block as a build before this kernel wrote it: the change blocked, and the verification it stopped left open. */
	function blockedByAnEarlierBuild(r: Runner): void {
		readBack(r, [
			{
				type: "status.changed",
				at: tick(),
				actor: KERNEL,
				status: "blocked",
				stop_reason: "execution_error",
				detail: "REVISION_CONFLICT",
				retryable: true,
			},
		]);
	}

	/** Q1 answered "400" and Q2 answered, the mandate adopted by the owner (IH-02), the candidate verified and IH-10 pending. */
	function awaitingAcceptance(): Runner {
		const r = new Runner({ g5_human_acceptance: true, adoption: { mandate: "human" } }).create();
		answerThroughDecision(r, "q1", Q1, "400");
		answerThroughDecision(r, "q2", Q2, "64");
		const m = mandate();
		r.g0(m);
		ownerDecides(
			r,
			decisionRequest("IH-02", {
				decision_id: "dec_m",
				subject: { kind: "artifact", id: "mnd_1", revision: 1, digest: digestValue(m) },
				question: "Adopter le mandat ?",
				options: [
					{ id: "adopt", label: "Adopter", effect: "", risky: false },
					{ id: "refuse", label: "Refuser", effect: "", risky: false },
				],
			}),
			"adopt",
			null,
			"hd_m",
		);
		r.g0(m)
			.g1(requirements({ answers: [bound("q1", Q1, "400", "R1"), bound("q2", Q2, "64", "R2")] }))
			.g2()
			.g3()
			.implement();
		const c = candidate("c1");
		r.freeze(c)
			.verify([
				evidence({ control_id: "unit", subject_digest: c.manifest_digest }),
				evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
			])
			.g5();
		r.run({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-10", {
				decision_id: "dec_a",
				subject: { kind: "candidate", id: c.candidate_id, revision: 1, digest: c.manifest_digest },
				question: "Accepter ?",
				options: [
					{ id: "accept", label: "Accepter", effect: "", risky: false },
					{ id: "refuse", label: "Refuser", effect: "", risky: false },
				],
			}),
		});
		return r;
	}

	it("revoking an answer asks the question again and leaves nothing adopted since G0, under the owner's name (steps 1 to 5)", () => {
		const r = awaitingAcceptance();
		assert.equal(r.s.phase, "deciding");
		assert.deepEqual(pending(r), [["IH-10", "dec_a"]]);
		const gatesBefore = Object.keys(r.s.gates).sort();
		const from = r.events.length;

		const revoked = revokeResolution(r, "q1", "dec_q1_again");

		assert.equal(revoked.ok, true, "the owner's revocation is accepted");
		assert.equal(question(r, "q1").answer, null, "Q1 has no answer any more");
		assert.equal(question(r, "q1").answered_at, null, "nor the time it was answered");
		assert.equal(isValid(r, "hd_m"), false, "the owner's adoption of the mandate is revoked");
		assert.equal(isValid(r, "hd_q1"), false, "the IH-01 decision that answered Q1 is revoked");
		assert.equal(isValid(r, "hd_q2"), true, "the answer to Q2 stays recorded and valid");
		assert.equal(question(r, "q2").answer, "64");
		assert.deepEqual(Object.keys(r.s.gates), [], "G0 and every later gate are withdrawn");
		const withdrawn = r.events.slice(from).flatMap((e) => (e.type === "gate.invalidated" ? [e.gate] : []));
		assert.deepEqual(withdrawn.sort(), gatesBefore, "each withdrawn gate is inscribed");
		// The original request is adopted when the change is created, before G0, and is immutable (RM-001).
		assert.deepEqual(Object.keys(r.s.adopted), ["request"], "no artifact adopted since G0 stays adopted");
		assert.equal(r.s.protocol, null, "the protocol is no longer frozen");
		assert.deepEqual(
			[r.s.mandate, r.s.requirement_ids, r.s.mandatory_requirement_ids],
			[null, [], []],
			"the mandate and the requirements G0 and G1 adopted are no longer the change's",
		);
		assert.ok(
			r.s.evidence.every((e) => !e.valid),
			"the evidence gathered on the faith of the answer is invalidated",
		);
		assert.deepEqual(pending(r), [["IH-01", "dec_q1_again"]], "IH-10 is withdrawn and an IH-01 asks Q1 again");
		assert.equal(question(r, "q1").decision_id, "dec_q1_again");
		assert.equal(r.s.phase, "clarifying");
		const inscribed = r.events.slice(from).find((e) => e.type === "question.revoked");
		assert.equal(inscribed?.actor.actor_id, HUMAN.actor_id, "the revocation is inscribed under the owner's name");
		assert.equal(
			inscribed?.type === "question.revoked" && inscribed.human_decision_id,
			"hd_q1",
			"the revocation names the IH-01 decision it revokes",
		);
	});

	it("revoking a close reopens the question, and revokes the IH-01 decision when the close came from it (6a)", () => {
		const throughDecision = new Runner().create();
		closeMaterialQuestion(throughDecision, "q1", Q1);
		assert.equal(revokeResolution(throughDecision, "q1", "dec_q1_again").ok, true);
		const reopened = question(throughDecision, "q1");
		assert.equal(isQuestionClosed(reopened), false, "Q1 is no longer closed");
		assert.equal(reopened.closed_by, null, "the actor who closed Q1 is withdrawn with the close");
		assert.equal(isValid(throughDecision, "hd_q1"), false, "the IH-01 decision that closed Q1 is revoked");
		assert.deepEqual(pending(throughDecision), [["IH-01", "dec_q1_again"]]);

		const throughCommand = new Runner().create();
		throughCommand.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q1",
			question: Q1,
			material: true,
			decision_id: null,
		});
		throughCommand.run({ type: "question.close", at: tick(), actor: HUMAN, id: "q1", origin: tuiOrigin() });
		const from = throughCommand.events.length;
		assert.equal(revokeResolution(throughCommand, "q1", "dec_q1_again").ok, true);
		assert.equal(isQuestionClosed(question(throughCommand, "q1")), false, "a close without a decision reopens too");
		assert.deepEqual(pending(throughCommand), [["IH-01", "dec_q1_again"]]);
		const inscribed = throughCommand.events.slice(from).find((e) => e.type === "question.revoked");
		assert.equal(
			inscribed?.type === "question.revoked" ? inscribed.human_decision_id : "not inscribed",
			null,
			"a revocation of a close given without a decision names none",
		);
	});

	it("a revocation carried by an agent, a model output, a tool call or an unauthenticated origin is refused for its provenance, and nothing is inscribed (6f)", () => {
		const r = new Runner().create();
		answerThroughDecision(r, "q1", Q1, "400");
		const forgedOrigins: HumanOrigin[] = [
			{
				actor: { ...AGENT, origin: "tui_session", authentication_level: "session" },
				host: "tui",
				session_id: "s1",
				asserted_at: tick(),
			},
			{ actor: { ...HUMAN, origin: "model_output" }, host: "tui", session_id: "s1", asserted_at: tick() },
			{ actor: { ...HUMAN, origin: "tool_call" }, host: "tui", session_id: "s1", asserted_at: tick() },
			{ actor: { ...HUMAN, authentication_level: "none" }, host: "tui", session_id: "s1", asserted_at: tick() },
		];
		const from = r.events.length;
		for (const origin of forgedOrigins) {
			const refused = revokeResolution(r, "q1", "dec_q1_again", origin);
			const { actor } = origin;
			assert.equal(
				refused.ok ? "accepted" : refused.error.code,
				"INVALID_PROVENANCE",
				`a revocation from ${actor.actor_type}/${actor.origin}/${actor.authentication_level} is refused for its provenance`,
			);
		}
		assert.equal(r.events.length, from, "nothing is inscribed");
		assert.equal(question(r, "q1").answer, "400", "Q1 stays answered");
		assert.equal(isValid(r, "hd_q1"), true);
	});

	it("a revocation out of reach is refused naming why, nothing is inscribed and Q1 stays answered (6h)", () => {
		const refusedFor = (r: Runner, id: string, code: DomainError["code"], cause: RegExp): void => {
			const from = r.events.length;
			const refused = revokeResolution(r, id, "dec_again");
			assert.equal(refused.ok, false, `a revocation of ${id} is refused (${cause})`);
			if (refused.ok) return;
			assert.equal(refused.error.code, code, refused.error.message);
			assert.match(refused.error.message, cause);
			assert.equal(r.events.length, from, "nothing is inscribed");
			assert.equal(question(r, "q1").answer, "400", "Q1 stays answered");
		};

		const cancelled = new Runner().create();
		answerThroughDecision(cancelled, "q1", Q1, "400");
		cancelled.run({ type: "change.cancel", at: tick(), actor: HUMAN, reason: "abandoned" });
		refusedFor(cancelled, "q1", "INVALID_TRANSITION", /cancelled/);

		const integrating = answeredToImplementing(
			new Runner({ integration_enabled: true }),
			mandate({ integration: "local_branch" }),
		).implement();
		const c = candidate("c1");
		integrating
			.freeze(c)
			.verify([
				evidence({ control_id: "unit", subject_digest: c.manifest_digest }),
				evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
			]);
		integrating.run({
			type: "gate.evaluate",
			gate: "G5",
			at: tick(),
			actor: KERNEL,
			decision_id: null,
		});
		assert.equal(integrating.s.phase, "integrating");
		refusedFor(integrating, "q1", "INVALID_TRANSITION", /candidate is accepted/);

		const running = new Runner().create();
		answerThroughDecision(running, "q1", Q1, "400");
		running.run({
			type: "intervention.start",
			at: tick(),
			actor: KERNEL,
			intervention_id: "int_s",
			role: "specify",
			attempt_id: null,
			model: { provider_id: "omlx", model_id: "m", thinking_level: "off", location: "on_machine" },
			profile_id: "specify",
			profile_qualified: true,
		});
		refusedFor(running, "q1", "OPERATION_ACTIVE", /intervention int_s is running/);

		const verifying = answeredToImplementing(new Runner()).implement();
		verifying.freeze(candidate("c2"));
		verifying.run({
			type: "verification.start",
			at: tick(),
			actor: KERNEL,
			operation_id: "op_v1",
			idempotency_key: "k",
		});
		refusedFor(verifying, "q1", "OPERATION_ACTIVE", /verification operation op_v1 is in progress/);

		const r = new Runner().create();
		answerThroughDecision(r, "q1", Q1, "400");
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q2",
			question: Q2,
			material: false,
			decision_id: null,
		});
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q3",
			question: "?",
			material: true,
			decision_id: null,
		});
		refusedFor(r, "q9", "UNKNOWN_REFERENCE", /question q9 does not exist/);
		refusedFor(r, "q2", "PRECONDITION_FAILED", /question q2 is not material/);
		refusedFor(r, "q3", "PRECONDITION_FAILED", /question q3 is neither answered nor closed/);
	});

	it("an IH-01 pending for another question stays pending beside the one that asks Q1 again (6e)", () => {
		const r = new Runner().create();
		answerThroughDecision(r, "q1", Q1, "400");
		r.run({
			type: "question.open",
			at: tick(),
			actor: KERNEL,
			id: "q2",
			question: Q2,
			material: true,
			decision_id: "dec_q2",
		});
		r.run({ type: "decision.request", at: tick(), actor: KERNEL, request: ih01Request(r, "dec_q2", Q2) });

		assert.equal(revokeResolution(r, "q1", "dec_q1_again").ok, true);

		assert.deepEqual(pending(r), [
			["IH-01", "dec_q2"],
			["IH-01", "dec_q1_again"],
		]);
	});

	it("a paused change stays paused once its answer is revoked, and its resume presents the question asked again", () => {
		const r = answeredToImplementing(new Runner());
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });

		assert.equal(revokeResolution(r, "q1", "dec_q1_again").ok, true);

		assert.equal(r.s.status, "paused", "the owner's pause holds across the revocation");
		assert.equal(r.s.phase, "clarifying");
		assert.deepEqual(pending(r), [["IH-01", "dec_q1_again"]]);
		r.run({ type: "change.resume", at: tick(), actor: HUMAN });
		assert.equal(r.s.status, "decision_required", "the resume presents the question asked again");
	});

	it("a change paused while its verification ran has its answer revoked, and stays paused", () => {
		const r = answeredToImplementing(new Runner()).implement();
		r.freeze(candidate("c1"));
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v1", idempotency_key: "k_v1" });
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });

		const revoked = revokeResolution(r, "q1", "dec_q1_again");

		assert.equal(revoked.ok ? "accepted" : `${revoked.error.code} ${revoked.error.message}`, "accepted");
		assert.equal(r.s.phase, "clarifying");
		assert.equal(r.s.status, "paused", "the owner's pause holds across the revocation");
		assert.deepEqual(pending(r), [["IH-01", "dec_q1_again"]], "IH-01 asks Q1 again");
		assert.equal(r.s.operation, null, "no operation is left open");
	});

	it("a change whose session ended during its verification is revocable once paused", () => {
		const r = answeredToImplementing(new Runner()).implement();
		r.freeze(candidate("c1"));
		// The conduct that ran the controls ended with its session: nothing completed the verification.
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v1", idempotency_key: "k_v1" });
		const beforeThePause = revokeResolution(r, "q1", "dec_q1_again");
		assert.equal(beforeThePause.ok ? "accepted" : beforeThePause.error.code, "OPERATION_ACTIVE");
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });

		const revoked = revokeResolution(r, "q1", "dec_q1_again");

		assert.equal(revoked.ok ? "accepted" : `${revoked.error.code} ${revoked.error.message}`, "accepted");
		assert.equal(r.s.phase, "clarifying");
		assert.equal(r.s.status, "paused");
	});

	it("a revocation refused while a verification or an intervention is open names the pause that stops it", () => {
		const verifying = answeredToImplementing(new Runner()).implement();
		verifying.freeze(candidate("c1"));
		verifying.run({
			type: "verification.start",
			at: tick(),
			actor: KERNEL,
			operation_id: "op_v1",
			idempotency_key: "k_v1",
		});
		const producing = answeredToImplementing(new Runner());
		producing.run({
			type: "intervention.start",
			at: tick(),
			actor: KERNEL,
			intervention_id: "int_1",
			role: "implement",
			attempt_id: "att_1",
			model: { provider_id: "omlx", model_id: "qwen3.8-27b-oq8e", thinking_level: "medium", location: "on_machine" },
			profile_id: "implement",
			profile_qualified: true,
		});

		for (const [open, r] of [
			["verification", verifying],
			["intervention", producing],
		] as const) {
			const refused = revokeResolution(r, "q1", "dec_q1_again");
			assert.equal(refused.ok ? "accepted" : refused.error.code, "OPERATION_ACTIVE", `${open} open`);
			assert.deepEqual(refused.ok ? null : refused.error.nextActions, ["pause"], `${open} open`);
		}
	});

	it("a change blocked during its verification has its answer revoked, since the block leaves no verification open", () => {
		const r = answeredToImplementing(new Runner()).implement();
		r.freeze(candidate("c1"));
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v1", idempotency_key: "k_v1" });
		// A session whose record loses on the revision to another live session's write blocks the change
		// while its verification is open.
		r.run({ type: "change.block", at: tick(), actor: KERNEL, reason: "execution_error", detail: "REVISION_CONFLICT" });
		assert.equal(r.s.operation, null, "the block closes the verification it stops");

		const revoked = revokeResolution(r, "q1", "dec_q1_again");

		assert.equal(revoked.ok ? "accepted" : `${revoked.error.code} ${revoked.error.message}`, "accepted");
		assert.equal(r.s.phase, "clarifying");
		assert.deepEqual(pending(r), [["IH-01", "dec_q1_again"]], "IH-01 asks Q1 again");
		assert.equal(r.s.operation, null, "no operation is left open");
	});

	it("a change an earlier build blocked during its verification has its answer revoked, and the verification left open closed", () => {
		const r = answeredToImplementing(new Runner()).implement();
		r.freeze(candidate("c1"));
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v1", idempotency_key: "k_v1" });
		blockedByAnEarlierBuild(r);
		assert.equal(r.s.operation?.operation_id, "op_v1");

		const revoked = revokeResolution(r, "q1", "dec_q1_again");

		assert.equal(revoked.ok ? "accepted" : `${revoked.error.code} ${revoked.error.message}`, "accepted");
		assert.equal(r.s.phase, "clarifying");
		assert.deepEqual(pending(r), [["IH-01", "dec_q1_again"]], "IH-01 asks Q1 again");
		assert.equal(r.s.operation, null, "the revocation closes the verification the earlier build left open");
	});

	it("a change an earlier build paused during its verification has that verification closed by a pause, and its answer is then revoked", () => {
		const r = answeredToImplementing(new Runner()).implement();
		r.freeze(candidate("c1"));
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v1", idempotency_key: "k_v1" });
		pausedByAnEarlierBuild(r);
		const refused = revokeResolution(r, "q1", "dec_q1_again");
		assert.deepEqual(refused.ok ? null : [refused.error.code, refused.error.nextActions], [
			"OPERATION_ACTIVE",
			["pause"],
		]);

		r.run({ type: "change.pause", at: tick(), actor: HUMAN });

		assert.equal(r.s.operation, null, "the pause closes the verification the earlier build left open");
		assert.equal(r.s.status, "paused");
		const revoked = revokeResolution(r, "q1", "dec_q1_again");
		assert.equal(revoked.ok ? "accepted" : `${revoked.error.code} ${revoked.error.message}`, "accepted");
		assert.equal(r.s.status, "paused", "the owner's pause holds across the revocation");
	});

	it("a change an earlier build paused during its verification resumes once paused again, with no verification open, and verifies again", () => {
		const r = answeredToImplementing(new Runner()).implement();
		r.freeze(candidate("c1"));
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v1", idempotency_key: "k_v1" });
		pausedByAnEarlierBuild(r);
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });

		r.run({ type: "change.resume", at: tick(), actor: HUMAN });

		assert.deepEqual([r.s.phase, r.s.status, r.s.operation], ["verifying", "ready", null]);
		r.run({ type: "verification.start", at: tick(), actor: KERNEL, operation_id: "op_v2", idempotency_key: "k_v2" });
		assert.equal(r.s.operation?.operation_id, "op_v2", "the verification runs again");
	});

	it("a change paused twice while the owner's acceptance waits resumes on that decision, since the second pause keeps the resume point", () => {
		const r = awaitingAcceptance();
		assert.equal(r.s.status, "decision_required");
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });
		r.run({ type: "change.pause", at: tick(), actor: HUMAN });

		r.run({ type: "change.resume", at: tick(), actor: HUMAN });

		assert.equal(r.s.status, "decision_required");
		assert.deepEqual(pending(r), [["IH-10", "dec_a"]]);
	});

	it("the attempt opened on a revoked answer is closed, so the change rebuilt on the new answer implements in an attempt of its own", () => {
		const r = answeredToImplementing(new Runner()).implement("int_1", "att_1");
		r.run({ type: "change.block", at: tick(), actor: KERNEL, reason: "execution_error", detail: "producer failed" });

		assert.equal(revokeResolution(r, "q1", "dec_q1_again").ok, true);

		assert.equal(
			r.s.attempts.find((a) => a.attempt_id === "att_1")?.result,
			"superseded",
			"the attempt opened on the revoked answer is closed",
		);
		ownerAnswers(r, "dec_q1_again", "answer", "422", "hd_q1_again");
		r.g0()
			.g1(requirements({ answers: [bound("q1", Q1, "422", "R1")] }))
			.g2()
			.g3()
			.implement("int_2", "att_2");
		assert.equal(
			r.s.interventions.find((i) => i.intervention_id === "int_2")?.attempt_id,
			"att_2",
			"the producer of the rebuilt change works in an attempt of its own",
		);
	});

	it("a revocation is refused once the owner accepted the candidate, before the change is integrating (6h)", () => {
		const r = awaitingAcceptance();
		ownerAnswers(r, "dec_a", "accept", null, "hd_a");
		assert.notEqual(r.s.phase, "integrating", "the acceptance is recorded before any integration");
		const from = r.events.length;

		const refused = revokeResolution(r, "q1", "dec_q1_again");

		assert.equal(refused.ok ? "accepted" : refused.error.code, "INVALID_TRANSITION", "the revocation is refused");
		assert.match(refused.ok ? "" : refused.error.message, /candidate is accepted/);
		assert.equal(r.events.length, from, "nothing is inscribed");
		assert.equal(question(r, "q1").answer, "400", "Q1 stays answered");
	});

	it("the revocation revokes the IH-01 decision the kernel tied to the question revoked, whichever was answered first (M4)", () => {
		const r = new Runner().create();
		answerThroughDecision(r, "q1", Q1, "400");
		answerThroughDecision(r, "q2", Q2, "64");

		assert.equal(revokeResolution(r, "q2", "dec_q2_again").ok, true);

		assert.equal(isValid(r, "hd_q2"), false, "the decision that answered Q2 is revoked");
		assert.equal(isValid(r, "hd_q1"), true, "the decision that answered Q1 stays valid");
		assert.equal(question(r, "q1").answer, "400", "Q1 stays answered");
	});

	it("the change rebuilt after a revocation is judged on its own candidates: one built before is neither a stagnation nor a spent retry", () => {
		const r = answeredToImplementing(new Runner()).implement("int_1", "att_1");
		const failing = (c: ReturnType<typeof candidate>) => [
			evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "FAIL" }),
			evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
		];
		const before = candidate("c1");
		r.freeze(before).verify(failing(before)).g5();
		const retry = `verify:${before.manifest_digest}`;
		for (const _ of [1, 2]) r.run({ type: "operation.fail", at: tick(), actor: KERNEL, operation_key: retry });
		assert.notEqual(r.s.status, "blocked", "two technical retries are within the budget");

		assert.equal(revokeResolution(r, "q1", "dec_q1_again").ok, true);
		ownerAnswers(r, "dec_q1_again", "answer", "422", "hd_q1_again");
		r.g0()
			.g1(requirements({ answers: [bound("q1", Q1, "422", "R1")] }))
			.g2()
			.g3()
			.implement("int_2", "att_2");
		const rebuilt = candidate("c1");
		r.freeze(rebuilt).verify(failing(rebuilt)).g5();

		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_3", feedback: null });
		assert.equal(
			r.s.stop_reason,
			null,
			`the first candidate of the rebuilt change is corrected, not judged a stagnation: ${r.s.stop_detail}`,
		);
		assert.equal(r.s.phase, "implementing");
		r.run({ type: "operation.fail", at: tick(), actor: KERNEL, operation_key: retry });
		assert.notEqual(
			r.s.status,
			"blocked",
			`a verification of the rebuilt change is retried as a first one: ${r.s.stop_detail}`,
		);
	});

	/** Three attempts spent, each refused at G5, and a fourth granted by the owner's budget extension `hd_b`. */
	function extensionGranted(): Runner {
		const r = answeredToImplementing(new Runner()).implement("int_1", "att_1");
		for (const n of [1, 2, 3]) {
			if (n > 1) {
				r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: `att_${n}`, feedback: null });
				r.implement(`int_${n}`, `att_${n}`);
			}
			const c = candidate(`c${n}`);
			r.freeze(c)
				.verify([
					evidence({ control_id: "unit", subject_digest: c.manifest_digest, verdict: "FAIL" }),
					evidence({ control_id: "lint", subject_digest: c.manifest_digest }),
				])
				.g5();
		}
		r.run({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: "att_4", feedback: null });
		assert.equal(r.s.stop_reason, "attempts_exhausted");
		ownerDecides(
			r,
			decisionRequest("IH-07", {
				decision_id: "dec_b",
				subject: { kind: "change", id: "chg_1", revision: r.s.revision, digest: r.s.candidate!.manifest_digest },
				question: "Étendre ?",
				options: [
					{ id: "extend", label: "Étendre", effect: "+n", risky: false },
					{ id: "stop", label: "Arrêter", effect: "", risky: false },
				],
				allow_free_text: true,
			}),
			"extend",
			"1",
			"hd_b",
		);
		assert.equal(r.s.budgets.max_attempts, 4);
		return r;
	}

	it("a budget extension the owner granted survives a revocation, since the rebuilt change spends on the same budget (§18, M5)", () => {
		const r = extensionGranted();

		assert.equal(revokeResolution(r, "q1", "dec_q1_again").ok, true);

		assert.equal(isValid(r, "hd_b"), true, "the budget extension is not said revoked");
		assert.equal(r.s.budgets.max_attempts, 4, "and its effect holds");
	});

	it("a budget extension survives a revision of the mandate, which undoes the rest as a revocation does (M5)", () => {
		const r = extensionGranted();

		r.run({
			type: "artifact.revise",
			at: tick(),
			actor: KERNEL,
			kind: "mandate",
			ref: ref("mdt_1", { v: 2 }, 2),
			reason: "objective restated",
		});

		assert.equal(r.s.phase, "clarifying");
		assert.equal(isValid(r, "hd_b"), true, "the budget extension is not said revoked");
		assert.equal(r.s.budgets.max_attempts, 4, "and its effect holds");
	});

	/**
	 * Q1 answered through IH-01, G5 passed into a mandated integration, the owner's IH-11 recorded, the
	 * Git effect answered not applied through IH-12 (`hd_r`), then the destination advanced with a
	 * combined tree that differs: the change falls back to verifying.
	 */
	function fellBackFromIntegration(): Runner {
		const r = answeredToImplementing(
			new Runner({ integration_enabled: true }),
			mandate({ integration: "local_branch" }),
		).implement();
		integrationPrepared(r);
		for (const effect_state of ["started", "uncertain"] as const)
			r.run({
				type: "integration.effect",
				at: tick(),
				actor: KERNEL,
				operation_id: "op_i",
				effect_state,
				detail: effect_state === "uncertain" ? "process died" : null,
				decision_id: effect_state === "uncertain" ? "dec_r" : null,
			});
		ownerAnswers(r, "dec_r", "confirm_not_applied", null, "hd_r");
		r.run({
			type: "integration.destination_advanced",
			at: tick(),
			actor: KERNEL,
			destination_before: "c".repeat(40),
			combined_changed: true,
		});
		assert.deepEqual([r.s.phase, r.s.status], ["verifying", "ready"]);
		assert.equal(isValid(r, "hd_r"), true, "the fallback keeps the reconciliation valid");
		return r;
	}
	const revokedEvents = (r: Runner, from: number, humanDecisionId: string) =>
		r.events.slice(from).filter((e) => e.type === "decision.revoked" && e.human_decision_id === humanDecisionId);

	it("a revocation after an integration fallback keeps the reconciliation of the Git effect valid (M5)", () => {
		const r = fellBackFromIntegration();
		const from = r.events.length;

		assert.equal(revokeResolution(r, "q1", "dec_q1_again").ok, true);

		assert.equal(isValid(r, "hd_r"), true, "the IH-12 reconciliation is not said revoked");
		assert.deepEqual(revokedEvents(r, from, "hd_r"), [], "no decision.revoked names it");
	});

	it("a revision of the mandate after an integration fallback keeps the reconciliation of the Git effect valid too (M5)", () => {
		const r = fellBackFromIntegration();
		const from = r.events.length;

		r.run({
			type: "artifact.revise",
			at: tick(),
			actor: KERNEL,
			kind: "mandate",
			ref: ref("mdt_1", { v: 2 }, 2),
			reason: "objective restated",
		});

		assert.equal(r.s.phase, "clarifying");
		assert.equal(isValid(r, "hd_r"), true, "the IH-12 reconciliation is not said revoked");
		assert.deepEqual(revokedEvents(r, from, "hd_r"), [], "no decision.revoked names it");
	});

	it("a change taken back to clarification by a revocation after an integration fallback holds a pending outcome", () => {
		const r = fellBackFromIntegration();

		assert.equal(revokeResolution(r, "q1", "dec_q1_again").ok, true);

		assert.equal(r.s.phase, "clarifying");
		assert.equal(r.s.outcome, "pending");
	});
});
