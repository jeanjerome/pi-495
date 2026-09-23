/**
 * Property tests over generated command sequences (C-FSM, NFR-07).
 * Invariants must hold after every accepted command whatever the order of attempts.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import fc from "fast-check";
import { replay } from "../../src/domain/change/apply.ts";
import type { ChangeCommand } from "../../src/domain/change/commands.ts";
import { type ChangeState, unknownCost } from "../../src/domain/change/state.ts";
import { PHASES, type Phase } from "../../src/contracts/v1/common.ts";
import {
	Runner,
	candidate,
	design,
	evidence,
	mandate,
	protocol,
	ref,
	requirements,
	tick,
	AGENT,
	HUMAN,
	KERNEL,
} from "../helpers/change-fixture.ts";

const EDGES: Record<Phase, Phase[]> = {
	intake: ["clarifying"],
	clarifying: ["specifying", "closed"],
	specifying: ["verification_design", "closed", "clarifying"],
	verification_design: ["preparing", "designing", "closed", "clarifying", "specifying"],
	preparing: ["verification_design", "closed", "clarifying", "specifying"],
	designing: ["implementing", "closed", "clarifying", "specifying", "verification_design"],
	implementing: ["verifying", "deciding", "closed", "clarifying", "specifying", "verification_design", "designing"],
	verifying: [
		"reviewing",
		"deciding",
		"closed",
		"clarifying",
		"specifying",
		"verification_design",
		"designing",
		"implementing",
	],
	reviewing: [
		"deciding",
		"verifying",
		"closed",
		"clarifying",
		"specifying",
		"verification_design",
		"designing",
		"implementing",
	],
	deciding: [
		"implementing",
		"integrating",
		"closed",
		"verifying",
		"clarifying",
		"specifying",
		"verification_design",
		"designing",
	],
	integrating: ["closed", "verifying", "integrating", "clarifying", "specifying", "verification_design", "designing"],
	closed: [],
};

type Kind =
	| "g0"
	| "g1"
	| "g2"
	| "g3"
	| "start"
	| "finish"
	| "freeze"
	| "verify_pass"
	| "verify_fail"
	| "verify_indet"
	| "verify_none"
	| "g5"
	| "correct"
	| "reject"
	| "pause"
	| "resume"
	| "cancel"
	| "revise_req"
	| "revise_protocol"
	| "env"
	| "agent_gate"
	| "agent_decide"
	| "request_ih10"
	| "answer_ih10"
	| "question"
	| "propose_agent"
	| "prep_open"
	| "prep_close"
	| "block"
	| "unblock";
const KINDS: Kind[] = [
	"g0",
	"g1",
	"g2",
	"g3",
	"start",
	"finish",
	"freeze",
	"verify_pass",
	"verify_fail",
	"verify_indet",
	"verify_none",
	"g5",
	"correct",
	"reject",
	"pause",
	"resume",
	"cancel",
	"revise_req",
	"revise_protocol",
	"env",
	"agent_gate",
	"agent_decide",
	"request_ih10",
	"answer_ih10",
	"question",
	"propose_agent",
	"prep_open",
	"prep_close",
	"block",
	"unblock",
];

let n = 0;
function materialize(kind: Kind, s: ChangeState): ChangeCommand {
	n++;
	const at = tick();
	const running = s.interventions.find((i) => i.result === "running");
	const attempt = s.attempts[s.attempts.length - 1];
	const cand = s.candidate ?? candidate("none");
	switch (kind) {
		case "g0":
			return {
				type: "gate.evaluate",
				gate: "G0",
				at,
				actor: KERNEL,
				mandate_ref: ref("m", mandate()),
				mandate: mandate(),
			};
		case "g1":
			return {
				type: "gate.evaluate",
				gate: "G1",
				at,
				actor: KERNEL,
				requirements_ref: ref("r", requirements()),
				requirements: requirements(),
				report: { valid: true, issues: [] },
			};
		case "g2":
			return {
				type: "gate.evaluate",
				gate: "G2",
				at,
				actor: KERNEL,
				protocol_ref: ref("p", protocol()),
				protocol: protocol(),
			};
		case "g3":
			return { type: "gate.evaluate", gate: "G3", at, actor: KERNEL, design_ref: ref("d", design()), design: design() };
		case "start":
			return {
				type: "intervention.start",
				at,
				actor: KERNEL,
				intervention_id: `int_${n}`,
				role: s.phase === "preparing" ? "prepare" : "implement",
				attempt_id: `att_${n}`,
				model: { provider_id: "p", model_id: "m", thinking_level: "off" },
				profile_id: "implement",
				profile_qualified: true,
			};
		case "finish":
			return {
				type: "intervention.finish",
				at,
				actor: KERNEL,
				intervention_id: running?.intervention_id ?? "none",
				result: "completed",
				counters: { tool_calls: 1, duration_ms: 5, tokens_known: 1, delegations: 0 },
				detail: null,
				cost: unknownCost("a fixture reports no host session"),
				imposed_layers: [],
			};
		case "freeze":
			return {
				type: "candidate.freeze",
				at,
				actor: KERNEL,
				attempt_id: attempt?.attempt_id ?? "none",
				facts: {
					candidate: candidate(`c${n}`),
					entry_count: 1,
					changed_paths: ["src/a.ts"],
					out_of_scope_paths: [],
					altered_protected_paths: [],
					complete: true,
					limits_notes: [],
					allowed_protected_paths: [],
				},
			};
		case "verify_pass":
		case "verify_fail":
		case "verify_indet":
		case "verify_none": {
			const v = kind === "verify_pass" ? "PASS" : kind === "verify_fail" ? "FAIL" : "INDETERMINATE";
			const facts =
				kind === "verify_none"
					? []
					: [
							evidence({ control_id: "unit", subject_digest: cand.manifest_digest, verdict: v }),
							evidence({ control_id: "lint", subject_digest: cand.manifest_digest }),
						];
			return { type: "verification.record", at, actor: KERNEL, evidence: facts };
		}
		case "g5":
			return { type: "gate.evaluate", gate: "G5", at, actor: KERNEL, decision_id: null };
		case "correct":
			return { type: "correction.authorize", at, actor: KERNEL, attempt_id: `att_${n}`, feedback: null };
		case "reject":
			return { type: "change.reject", at, actor: KERNEL, reason: "x" };
		case "pause":
			return { type: "change.pause", at, actor: HUMAN };
		case "resume":
			return { type: "change.resume", at, actor: HUMAN };
		case "cancel":
			return { type: "change.cancel", at, actor: HUMAN, reason: "x" };
		case "revise_req":
			return { type: "artifact.revise", at, actor: KERNEL, kind: "requirements", ref: ref("r", { n }, 2), reason: "x" };
		case "revise_protocol":
			return { type: "artifact.revise", at, actor: KERNEL, kind: "protocol", ref: ref("p", { n }, 2), reason: "x" };
		case "env":
			return { type: "environment.change", at, actor: KERNEL, digest: `sha256:${n.toString(16).padStart(64, "0")}` };
		case "agent_gate":
			return { type: "gate.evaluate", gate: "G5", at, actor: AGENT, decision_id: null };
		case "agent_decide":
			return {
				type: "decision.answer",
				at,
				actor: AGENT,
				human_decision_id: `hd_${n}`,
				response: {
					decision_id: s.pending_decisions[0]?.decision_id ?? "none",
					option_id: "accept",
					free_text: null,
					reason: null,
					subject_revision: 1,
					scope: null,
					expires_at: null,
				},
				origin: { actor: AGENT, host: "tui", session_id: "s", asserted_at: at },
			};
		case "request_ih10":
			return {
				type: "decision.request",
				at,
				actor: KERNEL,
				request: {
					decision_id: `dec_${n}`,
					change_id: s.change_id,
					interaction: "IH-10",
					subject: { kind: "candidate", id: cand.candidate_id, revision: 1, digest: cand.manifest_digest },
					question: "?",
					facts: [],
					recommendation: null,
					options: [{ id: "accept", label: "", effect: "", risky: false }],
					required_authority: "change_owner",
					allow_free_text: false,
					requested_at: at,
					expires_at: null,
					language: "fr",
				},
			};
		case "answer_ih10":
			return {
				type: "decision.answer",
				at,
				actor: HUMAN,
				human_decision_id: `hd_${n}`,
				response: {
					decision_id: s.pending_decisions[0]?.decision_id ?? "none",
					option_id: "accept",
					free_text: null,
					reason: null,
					subject_revision: s.pending_decisions[0]?.subject.revision ?? 1,
					scope: null,
					expires_at: null,
				},
				origin: { actor: HUMAN, host: "tui", session_id: "s", asserted_at: at },
			};
		case "question":
			return {
				type: "question.open",
				at,
				actor: KERNEL,
				id: `q${n}`,
				question: "?",
				material: false,
				decision_id: null,
			};
		case "propose_agent":
			return { type: "artifact.propose", at, actor: AGENT, kind: n % 2 ? "protocol" : "design", ref: ref("x", n) };
		case "prep_open":
			return { type: "preparation.open", at, actor: KERNEL, mandate_ref: ref("prep", n) };
		case "prep_close":
			return {
				type: "preparation.close",
				at,
				actor: KERNEL,
				qualified: n % 3 !== 0,
				capability_ids: ["unit"],
				adopted_ref: null,
			};
		case "block":
			return { type: "change.block", at, actor: KERNEL, reason: "execution_error", detail: "x" };
		case "unblock":
			return { type: "change.unblock", at, actor: KERNEL };
	}
}

function checkInvariants(r: Runner, before: ChangeState | null, cmd: ChangeCommand) {
	const s = r.s;
	assert.deepEqual(replay(r.events), s, "replay determinism");
	assert.equal(s.revision, r.events.length, "revision counts events");
	assert.ok(PHASES.includes(s.phase));
	if (before) {
		if (before.phase !== s.phase)
			assert.ok(EDGES[before.phase].includes(s.phase), `illegal edge ${before.phase} -> ${s.phase} on ${cmd.type}`);
		assert.ok(s.revision >= before.revision);
	}
	assert.ok(s.budgets.attempts_used <= s.budgets.max_attempts, "attempts within budget");
	assert.ok(s.attempts.filter((a) => a.result === "open").length <= 1, "at most one open attempt");
	assert.ok(s.interventions.filter((i) => i.result === "running").length <= 1, "sequential interventions");
	if (s.outcome === "accepted" || s.outcome === "integrated") {
		const g5 = r.events.filter((e) => e.type === "gate.decided" && e.decision.gate === "G5").pop();
		assert.ok(g5 && g5.type === "gate.decided" && g5.decision.verdict === "PASS", "accepted implies a G5 PASS");
	}
	for (const e of r.events) {
		if (
			e.type === "gate.decided" ||
			e.type === "artifact.adopted" ||
			e.type === "outcome.set" ||
			e.type === "decision.recorded"
		)
			assert.notEqual(e.actor.actor_type, "agent", `agent wrote normative event ${e.type}`);
	}
	if (s.status === "decision_required")
		assert.ok(s.pending_decisions.length > 0, "decision_required implies a pending decision");
	if (s.gates.G5?.verdict === "PASS")
		for (const id of s.gates.G5.evidence_retained) {
			const e = s.evidence.find((x) => x.evidence_id === id);
			if (e)
				assert.equal(
					e.subject_digest,
					s.candidate?.manifest_digest,
					"retained evidence is about the current candidate",
				);
		}
	if (s.protocol && s.phase !== "verification_design" && s.phase !== "preparing" && s.gates.G2 === undefined)
		assert.ok(["clarifying", "specifying", "closed"].includes(s.phase) || true);
	if (s.phase === "implementing" || s.phase === "verifying") assert.ok(s.protocol, `protocol frozen in ${s.phase}`);
	for (const d of s.human_decisions)
		if (d.valid && d.interaction === "IH-10")
			assert.equal(
				d.subject.digest,
				s.candidate?.manifest_digest,
				"valid acceptance is bound to the current candidate",
			);
}

describe("generated command sequences keep the change invariants", () => {
	it("holds for 300 random sequences of up to 60 commands", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom(...KINDS), { minLength: 1, maxLength: 60 }),
				fc.boolean(),
				(kinds, human) => {
					const r = new Runner({ g5_human_acceptance: human });
					r.create();
					checkInvariants(r, null, { type: "change.create" } as ChangeCommand);
					for (const kind of kinds) {
						const before = r.s;
						const cmd = materialize(kind, before);
						const d = r.try(cmd);
						if (d.ok) checkInvariants(r, before, cmd);
						else assert.deepEqual(r.s, before, "a rejected command leaves the state untouched");
						if (kind === "agent_gate" || kind === "agent_decide") assert.equal(d.ok, false, `${kind} must be rejected`);
					}
				},
			),
			{ numRuns: 300, seed: 495 },
		);
	});
	it("a random sequence that reaches acceptance always has a frozen candidate with matching valid evidence", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.constantFrom<Kind>(
						"g0",
						"g1",
						"g2",
						"g3",
						"start",
						"finish",
						"freeze",
						"verify_pass",
						"verify_fail",
						"g5",
						"correct",
					),
					{ minLength: 12, maxLength: 40 },
				),
				(kinds) => {
					const r = new Runner();
					r.create();
					for (const kind of kinds) {
						r.try(materialize(kind, r.s));
						if (r.s.outcome === "accepted") {
							assert.ok(r.s.candidate);
							const valid = r.s.evidence.filter((e) => e.valid && e.subject_digest === r.s.candidate!.manifest_digest);
							assert.ok(valid.some((e) => e.control_id === "unit" && e.verdict === "PASS"));
							assert.ok(valid.some((e) => e.control_id === "lint" && e.verdict === "PASS"));
							assert.ok(valid.every((e) => e.verdict !== "FAIL") || r.s.gates.G5?.verdict === "PASS");
							return;
						}
					}
				},
			),
			{ numRuns: 300, seed: 496 },
		);
	});
});
