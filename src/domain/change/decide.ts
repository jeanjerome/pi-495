/**
 * Command reducer of the Change aggregate.
 *
 *   decide(state, command, policy) -> { ok: true, events } | { ok: false, error }
 *
 * The reducer reads no clock, no file system and no model. Time, identifiers, digests and
 * observations are provided as facts inside the command (AT-01, AT-02, ADR-003).
 */
import type { ActorRef, Phase, StopReason } from "../../contracts/v1/common.ts";
import { DomainError } from "../errors.ts";
import type { ActivePolicy } from "../policy.ts";
import { evaluateG5 } from "../gates/g5.ts";
import { evaluateG2 } from "../gates/g2.ts";
import { evaluateG4 } from "../gates/g4.ts";
import { invalidationFor, type InvalidationCause } from "../invalidation.ts";
import { unobservedEnd } from "../imposed-layers.ts";
import type { ChangeCommand, CommandOf } from "./commands.ts";
import type { ChangeEvent } from "./events.ts";
import { apply } from "./apply.ts";
import {
	currentAttempt,
	isActive,
	openAttempt,
	runningIntervention,
	subjectOfChange,
	unknownCost,
	type ChangeState,
	type GateDecisionState,
} from "./state.ts";
import { PHASE_FOR_ROLE } from "./commands.ts";

export type Decision = { ok: true; events: ChangeEvent[] } | { ok: false; error: DomainError };

const HUMAN_ORIGINS = new Set(["tui_session", "rpc_qualified", "sdk_qualified"]);

export function decide(state: ChangeState | null, command: ChangeCommand, policy: ActivePolicy): Decision {
	try {
		if (command.type === "change.create") {
			if (state) return reject(new DomainError("PRECONDITION_FAILED", "change already exists"));
			const base = { at: command.at, actor: command.actor };
			return ok([
				{
					type: "change.created",
					...base,
					change_id: command.change_id,
					program_id: command.program_id,
					increment_id: command.increment_id,
					request: command.request,
					reference: command.reference,
					environment_digest: command.environment_digest,
				},
				{
					type: "phase.entered",
					...base,
					phase: "clarifying",
					status: "ready",
					reason: "request and reference identified",
				},
			]);
		}
		if (!state) return reject(new DomainError("UNKNOWN_REFERENCE", "change does not exist"));
		const ctx = new Ctx(state, command, policy);
		return ctx.run();
	} catch (error) {
		if (error instanceof DomainError) return reject(error);
		throw error;
	}
}

function ok(events: ChangeEvent[]): Decision {
	return { ok: true, events };
}
function reject(error: DomainError): Decision {
	return { ok: false, error };
}

class Ctx {
	readonly events: ChangeEvent[] = [];
	state: ChangeState;
	readonly initial: ChangeState;
	readonly command: ChangeCommand;
	readonly policy: ActivePolicy;
	constructor(initial: ChangeState, command: ChangeCommand, policy: ActivePolicy) {
		this.initial = initial;
		this.command = command;
		this.policy = policy;
		this.state = initial;
	}

	get at(): string {
		return this.command.at;
	}
	get actor(): ActorRef {
		return this.command.actor;
	}

	emit(event: ChangeEvent): void {
		this.events.push(event);
		this.state = apply(this.state, event);
	}
	base() {
		return { at: this.at, actor: this.actor };
	}
	fail(code: ConstructorParameters<typeof DomainError>[0], summary: string, nextActions: string[] = []): never {
		throw new DomainError(code, summary, {
			subject: subjectOfChange(this.state),
			phase: this.state.phase,
			nextActions,
		});
	}
	requirePhase(...phases: Phase[]): void {
		if (!phases.includes(this.state.phase))
			this.fail("INVALID_TRANSITION", `operation ${this.command.type} is not allowed in phase ${this.state.phase}`, [
				`expected_phase:${phases.join("|")}`,
			]);
	}
	requireActive(): void {
		if (!isActive(this.state))
			this.fail("INVALID_TRANSITION", `change is ${this.state.status} in phase ${this.state.phase}`);
	}
	requireNotBlocked(): void {
		if (this.state.status === "blocked")
			this.fail("PRECONDITION_FAILED", `change is blocked: ${this.state.stop_reason ?? "unknown"}`, ["unblock"]);
		if (this.state.status === "decision_required")
			this.fail(
				"DECISION_REQUIRED",
				`a human decision is pending: ${this.state.pending_decisions.map((d) => d.interaction).join(", ")}`,
				["decide"],
			);
		if (this.state.status === "paused") this.fail("PRECONDITION_FAILED", "change is paused", ["resume"]);
	}
	requireKernelAuthority(): void {
		if (this.actor.actor_type === "agent" || this.actor.origin === "model_output" || this.actor.origin === "tool_call")
			this.fail(
				"POLICY_DENIED",
				`actor ${this.actor.actor_id} (${this.actor.actor_type}/${this.actor.origin}) cannot write normative state`,
			);
	}
	enter(phase: Phase, reason: string, status: "ready" | "running" | "completed" = "ready"): void {
		this.emit({ type: "phase.entered", ...this.base(), phase, status, reason });
	}
	block(reason: StopReason, detail: string, retryable = false): void {
		// A stop leaves nothing running: ending the intervention later, on a pause or a resume, would
		// hand the change back ready and erase the stop without the kernel ever lifting it.
		const running = runningIntervention(this.state);
		if (running)
			this.emit({
				type: "intervention.finished",
				...this.base(),
				intervention_id: running.intervention_id,
				result: "failed",
				counters: { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 },
				detail: `change blocked: ${reason}`,
				cost: unknownCost("the change was blocked before the host reported the session's usage"),
				imposed_layers: [unobservedEnd("the change was blocked before the session reported its requests")],
			});
		this.emit({ type: "status.changed", ...this.base(), status: "blocked", stop_reason: reason, detail, retryable });
	}
	gateDecision(partial: Omit<GateDecisionState, "decided_at" | "state_revision">): GateDecisionState {
		return { ...partial, decided_at: this.at, state_revision: this.state.revision };
	}
	invalidate(cause: InvalidationCause): void {
		const plan = invalidationFor(this.state, cause);
		for (const gate of plan.gates)
			if (this.state.gates[gate]) this.emit({ type: "gate.invalidated", ...this.base(), gate, reason: plan.reason });
		for (const evidenceId of plan.evidence)
			this.emit({ type: "evidence.invalidated", ...this.base(), evidence_id: evidenceId, reason: plan.reason });
		for (const reviewId of plan.reviews)
			this.emit({ type: "review.invalidated", ...this.base(), review_id: reviewId, reason: plan.reason });
		for (const humanDecisionId of plan.human_decisions)
			this.emit({ type: "decision.revoked", ...this.base(), human_decision_id: humanDecisionId, reason: plan.reason });
	}

	run(): Decision {
		const c = this.command;
		switch (c.type) {
			case "change.create":
				throw new Error("unreachable");
			case "artifact.propose":
				return this.propose(c);
			case "question.open":
				return this.questionOpen(c);
			case "question.answer":
				return this.questionAnswer(c);
			case "gate.evaluate":
				return this.gate(c);
			case "preparation.open":
				return this.preparationOpen(c);
			case "preparation.close":
				return this.preparationClose(c);
			case "intervention.start":
				return this.interventionStart(c);
			case "intervention.finish":
				return this.interventionFinish(c);
			case "budget.consume":
				return this.budgetConsume(c);
			case "candidate.freeze":
				return this.candidateFreeze(c);
			case "verification.start":
				return this.verificationStart(c);
			case "verification.record":
				return this.verificationRecord(c);
			case "verification.complete":
				return this.verificationComplete(c);
			case "verification.rerun":
				return this.verificationRerun(c);
			case "review.record":
				return this.reviewRecord(c);
			case "review.complete":
				return this.reviewComplete();
			case "correction.authorize":
				return this.correctionAuthorize(c);
			case "change.reject":
				return this.changeReject(c);
			case "change.pause":
				return this.changePause();
			case "change.resume":
				return this.changeResume();
			case "change.cancel":
				return this.changeCancel(c);
			case "change.block":
				return this.changeBlock(c);
			case "change.unblock":
				return this.changeUnblock();
			case "decision.request":
				return this.decisionRequest(c);
			case "decision.answer":
				return this.decisionAnswer(c);
			case "decision.revoke":
				return this.decisionRevoke(c);
			case "artifact.revise":
				return this.artifactRevise(c);
			case "environment.change":
				return this.environmentChange(c);
			case "evidence.invalidate":
				return this.evidenceInvalidate(c);
			case "operation.fail":
				return this.operationFail(c);
			case "integration.prepare":
				return this.integrationPrepare(c);
			case "integration.effect":
				return this.integrationEffect(c);
			case "integration.reconcile":
				return this.integrationReconcile(c);
			case "integration.destination_advanced":
				return this.integrationDestinationAdvanced(c);
			case "resume_point.save":
				this.emit({ type: "resume_point.saved", ...this.base(), phase: this.state.phase, status: this.state.status });
				return ok(this.events);
			default: {
				const never: never = c;
				throw new Error(`unknown command ${(never as { type: string }).type}`);
			}
		}
	}

	// --- artifacts and questions -------------------------------------------------------------

	propose(c: CommandOf<"artifact.propose">): Decision {
		this.requireActive();
		if (c.kind === "protocol" && this.actor.actor_type === "agent")
			this.fail("POLICY_DENIED", "a producer cannot propose the protocol that judges it (RM-013)");
		if (c.kind === "request")
			this.fail("POLICY_DENIED", "the original request is immutable (RM-001); propose a mandate instead");
		this.emit({ type: "artifact.proposed", ...this.base(), kind: c.kind, ref: c.ref });
		return ok(this.events);
	}

	questionOpen(c: CommandOf<"question.open">): Decision {
		this.requireActive();
		if (this.state.open_questions.some((q) => q.id === c.id))
			this.fail("PRECONDITION_FAILED", `question ${c.id} already exists`);
		this.emit({
			type: "question.opened",
			...this.base(),
			id: c.id,
			question: c.question,
			material: c.material,
			decision_id: c.decision_id,
		});
		return ok(this.events);
	}

	questionAnswer(c: CommandOf<"question.answer">): Decision {
		const q = this.state.open_questions.find((x) => x.id === c.id);
		if (!q) this.fail("UNKNOWN_REFERENCE", `question ${c.id} does not exist`);
		if (q.material && !c.human_decision_id) {
			if (!HUMAN_ORIGINS.has(this.actor.origin))
				this.fail("INVALID_PROVENANCE", "a material question requires an answer with human provenance");
		}
		this.emit({
			type: "question.answered",
			...this.base(),
			id: c.id,
			answer: c.answer,
			human_decision_id: c.human_decision_id,
		});
		return ok(this.events);
	}

	// --- gates ---------------------------------------------------------------------------------

	gate(c: Extract<ChangeCommand, { type: "gate.evaluate" }>): Decision {
		this.requireActive();
		this.requireKernelAuthority();
		switch (c.gate) {
			case "G0":
				return this.gateG0(c);
			case "G1":
				return this.gateG1(c);
			case "G2":
				return this.gateG2(c);
			case "G3":
				return this.gateG3(c);
			case "G5":
				return this.gateG5(c);
			case "G6":
				return this.gateG6(c);
			default: {
				const never: never = c;
				throw new Error(`unsupported gate ${(never as { gate: string }).gate}`);
			}
		}
	}

	gateG0(c: Extract<ChangeCommand, { gate: "G0" }>): Decision {
		this.requirePhase("clarifying");
		this.requireNotBlocked();
		const reasons: string[] = [];
		if (!c.mandate.objective.trim()) reasons.push("objective is empty");
		const materialOpen = [
			...this.state.open_questions.filter((q) => q.material && q.answer === null).map((q) => q.id),
			...c.mandate.open_questions
				.filter(
					(q) =>
						q.material &&
						q.answer === null &&
						!this.state.open_questions.some((s) => s.id === q.id && s.answer !== null),
				)
				.map((q) => q.id),
		];
		for (const id of new Set(materialOpen)) reasons.push(`material question open: ${id}`);
		const evaluated = { mandate: c.mandate_ref.content_digest, request: this.state.request.content_digest };
		if (reasons.length > 0) {
			this.emit({
				type: "gate.decided",
				...this.base(),
				decision: this.gateDecision({
					gate: "G0",
					verdict: "FAIL",
					evaluated,
					reasons,
					evidence_retained: [],
					evidence_ignored: [],
					evidence_missing: [],
					fail_requirements: [],
					indeterminate_requirements: [],
					next_action: materialOpen.length > 0 ? "answer_material_questions" : "revise_mandate",
				}),
			});
			return ok(this.events);
		}
		if (
			this.policy.adoption.mandate === "human" &&
			!this.hasValidDecision("IH-02", "adopt", c.mandate_ref.content_digest)
		) {
			this.emit({
				type: "gate.decided",
				...this.base(),
				decision: this.gateDecision({
					gate: "G0",
					verdict: "INDETERMINATE",
					evaluated,
					reasons: ["mandate adoption requires a human decision (IH-02)"],
					evidence_retained: [],
					evidence_ignored: [],
					evidence_missing: [],
					fail_requirements: [],
					indeterminate_requirements: [],
					next_action: "request_decision:IH-02",
				}),
			});
			return ok(this.events);
		}
		this.emit({
			type: "gate.decided",
			...this.base(),
			decision: this.gateDecision({
				gate: "G0",
				verdict: "PASS",
				evaluated,
				reasons: [],
				evidence_retained: [],
				evidence_ignored: [],
				evidence_missing: [],
				fail_requirements: [],
				indeterminate_requirements: [],
				next_action: "specify_requirements",
			}),
		});
		this.emit({ type: "artifact.adopted", ...this.base(), kind: "mandate", ref: c.mandate_ref, gate: "G0" });
		this.emit({
			type: "mandate.recorded",
			...this.base(),
			allowed_paths: c.mandate.allowed_paths,
			integration: c.mandate.integration,
			language: c.mandate.language,
		});
		this.enter("specifying", "G0 passed");
		return ok(this.events);
	}

	gateG1(c: Extract<ChangeCommand, { gate: "G1" }>): Decision {
		this.requirePhase("specifying");
		this.requireNotBlocked();
		const reasons: string[] = [...c.report.issues];
		if (!c.report.valid && reasons.length === 0) reasons.push("requirements report is invalid");
		const ids = new Set<string>();
		for (const r of c.requirements.requirements) {
			if (ids.has(r.requirement_id)) reasons.push(`duplicate requirement id ${r.requirement_id}`);
			ids.add(r.requirement_id);
			if (!r.criterion.trim()) reasons.push(`requirement ${r.requirement_id} has no observable criterion`);
			if (!r.source.trim()) reasons.push(`requirement ${r.requirement_id} has no source`);
		}
		if (c.requirements.requirements.length === 0) reasons.push("no requirement identified");
		for (const [family, status] of Object.entries(c.requirements.contract_families))
			if (status === "to_instruct") reasons.push(`contract family ${family} still to instruct`);
		// A material question was answered by a human and the answer binds this change. What the
		// requirements do not carry, no obligation covers and no control observes, so the decision
		// would be lost between the ledger that records it and the artifact that binds the producer.
		const carried = new Map(c.requirements.answers.map((a) => [a.question_id, a] as const));
		for (const q of this.state.open_questions) {
			if (!q.material || q.answer === null) continue;
			const a = carried.get(q.id);
			if (!a) {
				reasons.push(`material answer ${q.id} is absent from the requirements`);
				continue;
			}
			if (a.answer !== q.answer) reasons.push(`material answer ${q.id} differs from the recorded decision`);
			if (!a.observable) continue;
			if (a.requirement_ids.length === 0) {
				reasons.push(`material answer ${q.id} fixes an observable contract that no requirement carries`);
				continue;
			}
			// Naming a requirement that is not mandatory is not a defect as long as a mandatory one
			// carries the answer too; what would lose it is a name that matches nothing, or a set G2
			// could freeze without a single obligation.
			const named = a.requirement_ids.map((rid) => ({
				rid,
				requirement: c.requirements.requirements.find((x) => x.requirement_id === rid),
			}));
			for (const { rid, requirement } of named)
				if (!requirement)
					reasons.push(`material answer ${q.id} names requirement ${rid}, which this document does not carry`);
			if (!named.some((n) => n.requirement?.mandatory))
				reasons.push(
					`material answer ${q.id} fixes an observable contract that no mandatory requirement carries: G2 would freeze a protocol without an obligation for it`,
				);
		}
		const evaluated = {
			requirements: c.requirements_ref.content_digest,
			mandate: this.state.adopted.mandate?.ref.content_digest ?? "",
		};
		// Past G0 no phase goes back to the specification, so the refusal names the one way out a
		// command holds: abandoning the change.
		if (reasons.length > 0) {
			this.emit({
				type: "gate.decided",
				...this.base(),
				decision: this.gateDecision({
					gate: "G1",
					verdict: "FAIL",
					evaluated,
					reasons,
					evidence_retained: [],
					evidence_ignored: [],
					evidence_missing: [],
					fail_requirements: [],
					indeterminate_requirements: [],
					next_action: "cancel",
				}),
			});
			return ok(this.events);
		}
		if (
			this.policy.adoption.requirements === "human" &&
			!this.hasValidDecision("IH-02", "adopt", c.requirements_ref.content_digest)
		) {
			this.emit({
				type: "gate.decided",
				...this.base(),
				decision: this.gateDecision({
					gate: "G1",
					verdict: "INDETERMINATE",
					evaluated,
					reasons: ["requirements adoption requires a human decision"],
					evidence_retained: [],
					evidence_ignored: [],
					evidence_missing: [],
					fail_requirements: [],
					indeterminate_requirements: [],
					next_action: "request_decision:IH-02",
				}),
			});
			return ok(this.events);
		}
		this.emit({
			type: "gate.decided",
			...this.base(),
			decision: this.gateDecision({
				gate: "G1",
				verdict: "PASS",
				evaluated,
				reasons: [],
				evidence_retained: [],
				evidence_ignored: [],
				evidence_missing: [],
				fail_requirements: [],
				indeterminate_requirements: [],
				next_action: "design_verification",
			}),
		});
		this.emit({ type: "artifact.adopted", ...this.base(), kind: "requirements", ref: c.requirements_ref, gate: "G1" });
		this.emit({
			type: "requirements.recorded",
			...this.base(),
			requirement_ids: c.requirements.requirements.map((r) => r.requirement_id),
			mandatory_requirement_ids: c.requirements.requirements.filter((r) => r.mandatory).map((r) => r.requirement_id),
		});
		this.enter("verification_design", "G1 passed");
		return ok(this.events);
	}

	gateG2(c: Extract<ChangeCommand, { gate: "G2" }>): Decision {
		this.requirePhase("verification_design");
		this.requireNotBlocked();
		const result = evaluateG2(this.state, c.protocol, this.policy);
		const evaluated = {
			protocol: c.protocol_ref.content_digest,
			requirements: this.state.adopted.requirements?.ref.content_digest ?? "",
			environment: this.state.environment_digest ?? "",
		};
		this.emit({
			type: "gate.decided",
			...this.base(),
			decision: this.gateDecision({
				gate: "G2",
				verdict: result.verdict,
				evaluated,
				reasons: result.reasons,
				evidence_retained: [],
				evidence_ignored: [],
				evidence_missing: result.missing_capabilities,
				fail_requirements: result.uncovered_requirements,
				indeterminate_requirements: [],
				next_action: result.next_action,
			}),
		});
		if (result.verdict !== "PASS") return ok(this.events);
		this.emit({ type: "artifact.adopted", ...this.base(), kind: "protocol", ref: c.protocol_ref, gate: "G2" });
		this.emit({
			type: "protocol.frozen",
			...this.base(),
			protocol: {
				ref: {
					protocol_id: c.protocol.protocol_id,
					revision: c.protocol_ref.revision,
					content_digest: c.protocol_ref.content_digest,
				},
				obligations: c.protocol.obligations,
				control_ids: c.protocol.controls.map((k) => k.control_id),
				protected_paths: [...new Set(c.protocol.controls.flatMap((k) => k.protected_paths))],
				required_reviews: [...new Set([...c.protocol.required_reviews, ...this.policy.required_reviews])],
				arbitration: c.protocol.arbitration,
				environment_digest: c.protocol.environment_digest,
			},
		});
		this.enter("designing", "G2 passed");
		return ok(this.events);
	}

	gateG3(c: Extract<ChangeCommand, { gate: "G3" }>): Decision {
		this.requirePhase("designing");
		this.requireNotBlocked();
		const reasons: string[] = [];
		if (!c.design.compatible_with_mandate) reasons.push("design is not compatible with the mandate");
		if (!c.design.executable) reasons.push("design is not executable");
		if (c.design.requirement_ids.length === 0) reasons.push("design is not linked to any requirement");
		const known = new Set(this.state.requirement_ids);
		for (const id of c.design.requirement_ids)
			if (!known.has(id)) reasons.push(`design references unknown requirement ${id}`);
		const covered = new Set(c.design.requirement_ids);
		for (const id of this.state.mandatory_requirement_ids)
			if (!covered.has(id)) reasons.push(`mandatory requirement ${id} is not addressed by the design`);
		const evaluated = { design: c.design_ref.content_digest, protocol: this.state.protocol?.ref.content_digest ?? "" };
		if (reasons.length > 0) {
			this.emit({
				type: "gate.decided",
				...this.base(),
				decision: this.gateDecision({
					gate: "G3",
					verdict: "FAIL",
					evaluated,
					reasons,
					evidence_retained: [],
					evidence_ignored: [],
					evidence_missing: [],
					fail_requirements: [],
					indeterminate_requirements: [],
					next_action: "revise_design",
				}),
			});
			return ok(this.events);
		}
		if (
			this.policy.adoption.design === "human" &&
			!this.hasValidDecision("IH-05", "choose", c.design_ref.content_digest)
		) {
			this.emit({
				type: "gate.decided",
				...this.base(),
				decision: this.gateDecision({
					gate: "G3",
					verdict: "INDETERMINATE",
					evaluated,
					reasons: ["design adoption requires a human decision (IH-05)"],
					evidence_retained: [],
					evidence_ignored: [],
					evidence_missing: [],
					fail_requirements: [],
					indeterminate_requirements: [],
					next_action: "request_decision:IH-05",
				}),
			});
			return ok(this.events);
		}
		this.emit({
			type: "gate.decided",
			...this.base(),
			decision: this.gateDecision({
				gate: "G3",
				verdict: "PASS",
				evaluated,
				reasons: [],
				evidence_retained: [],
				evidence_ignored: [],
				evidence_missing: [],
				fail_requirements: [],
				indeterminate_requirements: [],
				next_action: "produce_candidate",
			}),
		});
		this.emit({ type: "artifact.adopted", ...this.base(), kind: "design", ref: c.design_ref, gate: "G3" });
		this.enter("implementing", "G3 passed");
		return ok(this.events);
	}

	// biome-ignore lint/correctness/noUnusedFunctionParameters: the six gate methods share one signature so the dispatcher can treat them alike
	gateG5(c: Extract<ChangeCommand, { gate: "G5" }>): Decision {
		this.requirePhase("deciding");
		if (this.state.status === "blocked" || this.state.status === "paused") this.requireNotBlocked();
		if (runningIntervention(this.state))
			this.fail("PRECONDITION_FAILED", "a producer is still active on the candidate");
		if (!this.state.candidate) this.fail("PRECONDITION_FAILED", "no candidate frozen");
		if (!this.state.protocol) this.fail("PROTOCOL_NOT_FROZEN", "no protocol frozen");
		const result = evaluateG5(this.state, this.policy);
		const evaluated = {
			candidate: this.state.candidate.manifest_digest,
			protocol: this.state.protocol.ref.content_digest,
			environment: this.state.environment_digest ?? "",
		};
		this.emit({
			type: "gate.decided",
			...this.base(),
			decision: this.gateDecision({
				gate: "G5",
				verdict: result.verdict,
				evaluated,
				reasons: result.reasons,
				evidence_retained: result.retained,
				evidence_ignored: result.ignored,
				evidence_missing: result.missing,
				fail_requirements: result.failed_requirements,
				indeterminate_requirements: result.indeterminate_requirements,
				next_action: result.next_action,
			}),
		});
		if (result.verdict === "PASS") {
			this.emit({ type: "outcome.set", ...this.base(), outcome: "accepted" });
			const wantsIntegration = this.policy.integration_enabled && this.state.mandate?.integration === "local_branch";
			if (wantsIntegration) {
				this.enter("integrating", "G5 passed, integration mandated");
			} else {
				this.enter("closed", "G5 passed, accepted without integration", "completed");
			}
			return ok(this.events);
		}
		return ok(this.events);
	}

	gateG6(c: Extract<ChangeCommand, { gate: "G6" }>): Decision {
		this.requirePhase("integrating");
		const integ = this.state.integration;
		if (!integ) this.fail("PRECONDITION_FAILED", "no integration prepared");
		const reasons: string[] = [];
		if (!this.state.candidate || c.applied_digest !== this.state.candidate.manifest_digest)
			reasons.push("applied tree differs from the accepted candidate");
		if (this.state.gates.G5?.verdict !== "PASS") reasons.push("G5 is not passed");
		if (this.state.operation && this.state.operation.effect_state !== "confirmed")
			reasons.push(`integration effect is ${this.state.operation.effect_state}`);
		const evaluated = {
			candidate: this.state.candidate?.manifest_digest ?? "",
			destination_before: integ.destination_before,
			destination_after: c.destination_after,
			receipt: c.receipt_digest,
		};
		if (reasons.length > 0) {
			this.emit({
				type: "gate.decided",
				...this.base(),
				decision: this.gateDecision({
					gate: "G6",
					verdict: "FAIL",
					evaluated,
					reasons,
					evidence_retained: [],
					evidence_ignored: [],
					evidence_missing: [],
					fail_requirements: [],
					indeterminate_requirements: [],
					next_action: "reconcile_integration",
				}),
			});
			this.block("integration_conflict", reasons.join("; "));
			return ok(this.events);
		}
		this.emit({
			type: "gate.decided",
			...this.base(),
			decision: this.gateDecision({
				gate: "G6",
				verdict: "PASS",
				evaluated,
				reasons: [],
				evidence_retained: [],
				evidence_ignored: [],
				evidence_missing: [],
				fail_requirements: [],
				indeterminate_requirements: [],
				next_action: "close",
			}),
		});
		this.emit({
			type: "integration.confirmed",
			...this.base(),
			destination_after: c.destination_after,
			receipt_digest: c.receipt_digest,
		});
		if (this.state.operation)
			this.emit({ type: "operation.closed", ...this.base(), operation_id: this.state.operation.operation_id });
		this.emit({ type: "outcome.set", ...this.base(), outcome: "integrated" });
		this.enter("closed", "G6 passed", "completed");
		return ok(this.events);
	}

	hasValidDecision(interaction: "IH-02" | "IH-05" | "IH-10" | "IH-11", option: string, digest: string): boolean {
		return this.state.human_decisions.some(
			(d) => d.valid && d.interaction === interaction && d.option_id === option && d.subject.digest === digest,
		);
	}

	// --- preparation -----------------------------------------------------------------------------

	preparationOpen(c: CommandOf<"preparation.open">): Decision {
		this.requirePhase("verification_design");
		this.requireNotBlocked();
		this.requireKernelAuthority();
		this.emit({ type: "preparation.opened", ...this.base(), mandate_ref: c.mandate_ref });
		this.emit({ type: "artifact.adopted", ...this.base(), kind: "preparation", ref: c.mandate_ref, gate: null });
		this.enter("preparing", "capability missing, bounded preparation mandate adopted");
		return ok(this.events);
	}

	preparationClose(c: CommandOf<"preparation.close">): Decision {
		this.requirePhase("preparing");
		this.requireKernelAuthority();
		if (runningIntervention(this.state)) this.fail("PRECONDITION_FAILED", "a preparation producer is still running");
		this.emit({ type: "preparation.closed", ...this.base(), qualified: c.qualified, capability_ids: c.capability_ids });
		if (c.qualified && c.adopted_ref)
			this.emit({ type: "artifact.adopted", ...this.base(), kind: "preparation", ref: c.adopted_ref, gate: null });
		this.enter(
			"verification_design",
			c.qualified
				? "capability qualified"
				: `preparation not qualified: ${c.capability_ids.join(", ") || "no capability"}`,
		);
		return ok(this.events);
	}

	// --- interventions ---------------------------------------------------------------------------

	interventionStart(c: CommandOf<"intervention.start">): Decision {
		this.requireActive();
		this.requireNotBlocked();
		this.requireKernelAuthority();
		if (runningIntervention(this.state))
			this.fail("OPERATION_ACTIVE", "an intervention is already running (P0 is sequential)");
		if (!PHASE_FOR_ROLE[c.role].includes(this.state.phase))
			this.fail("INVALID_TRANSITION", `role ${c.role} is not allowed in phase ${this.state.phase}`);
		if (!c.profile_qualified)
			this.fail("CAPABILITY_MISSING", `execution profile ${c.profile_id} is not qualified on this platform`, [
				"qualify_capability",
				"revise_mandate",
			]);
		if (!c.model.provider_id || !c.model.model_id)
			this.fail("CONFIGURATION_ERROR", "provider and model must be explicit (RM-022)");
		if (this.state.budgets.increment_ms_used >= this.policy.budgets.increment_ms)
			this.fail("BUDGET_EXHAUSTED", "increment duration budget exhausted", ["request_decision:IH-07"]);
		let attemptId: string | null = c.attempt_id;
		if (c.role === "implement") {
			if (!this.state.protocol)
				this.fail("PROTOCOL_NOT_FROZEN", "the protocol must be frozen before implementation (RM-012)");
			const open = openAttempt(this.state);
			if (open) attemptId = open.attempt_id;
			else {
				if (!c.attempt_id) this.fail("PRECONDITION_FAILED", "attempt_id is required to open an attempt");
				if (this.state.budgets.attempts_used >= this.state.budgets.max_attempts) {
					this.block(
						"attempts_exhausted",
						`${this.state.budgets.attempts_used}/${this.state.budgets.max_attempts} attempts consumed`,
					);
					return ok(this.events);
				}
				this.emit({
					type: "attempt.opened",
					...this.base(),
					attempt_id: c.attempt_id,
					index: this.state.attempts.length + 1,
				});
				attemptId = c.attempt_id;
			}
		} else attemptId = null;
		this.emit({
			type: "intervention.started",
			...this.base(),
			intervention_id: c.intervention_id,
			role: c.role,
			attempt_id: attemptId,
			model: c.model,
			profile_id: c.profile_id,
		});
		return ok(this.events);
	}

	interventionFinish(c: CommandOf<"intervention.finish">): Decision {
		const running = this.state.interventions.find((i) => i.intervention_id === c.intervention_id);
		if (!running) this.fail("UNKNOWN_REFERENCE", `intervention ${c.intervention_id} does not exist`);
		if (running.result !== "running")
			this.fail("PRECONDITION_FAILED", `intervention ${c.intervention_id} already finished`);
		this.emit({
			type: "intervention.finished",
			...this.base(),
			intervention_id: c.intervention_id,
			result: c.result,
			counters: c.counters,
			detail: c.detail,
			cost: c.cost,
			imposed_layers: c.imposed_layers,
		});
		return ok(this.events);
	}

	budgetConsume(c: CommandOf<"budget.consume">): Decision {
		const running = this.state.interventions.find(
			(i) => i.intervention_id === c.intervention_id && i.result === "running",
		);
		if (!running) this.fail("UNKNOWN_REFERENCE", `intervention ${c.intervention_id} is not running`);
		this.emit({ type: "budget.consumed", ...this.base(), intervention_id: c.intervention_id, counters: c.counters });
		const after = this.state.interventions.find((i) => i.intervention_id === c.intervention_id)!;
		if (after.counters.tool_calls > this.policy.budgets.tool_calls_per_intervention)
			this.fail(
				"BUDGET_EXHAUSTED",
				`tool call budget exceeded (${after.counters.tool_calls}/${this.policy.budgets.tool_calls_per_intervention})`,
				["abort_intervention"],
			);
		if (after.counters.duration_ms > this.policy.budgets.intervention_ms)
			this.fail("BUDGET_EXHAUSTED", `intervention duration budget exceeded`, ["abort_intervention"]);
		return ok(this.events);
	}

	// --- candidate and verification ----------------------------------------------------------------

	candidateFreeze(c: CommandOf<"candidate.freeze">): Decision {
		this.requirePhase("implementing");
		this.requireKernelAuthority();
		if (runningIntervention(this.state))
			this.fail("PRECONDITION_FAILED", "producers must be stopped before freezing the candidate");
		const attempt = this.state.attempts.find((a) => a.attempt_id === c.attempt_id);
		if (attempt?.result !== "open") this.fail("PRECONDITION_FAILED", `attempt ${c.attempt_id} is not open`);
		if (!this.state.protocol) this.fail("PROTOCOL_NOT_FROZEN", "no protocol frozen");
		this.emit({
			type: "candidate.frozen",
			...this.base(),
			candidate: c.facts.candidate,
			attempt_id: c.attempt_id,
			entry_count: c.facts.entry_count,
		});
		const result = evaluateG4(this.state, c.facts);
		const evaluated = {
			candidate: c.facts.candidate.manifest_digest,
			base: c.facts.candidate.base_digest,
			protocol: this.state.protocol.ref.content_digest,
		};
		this.emit({
			type: "gate.decided",
			...this.base(),
			decision: this.gateDecision({
				gate: "G4",
				verdict: result.verdict,
				evaluated,
				reasons: result.reasons,
				evidence_retained: [],
				evidence_ignored: [],
				evidence_missing: [],
				fail_requirements: [],
				indeterminate_requirements: [],
				next_action: result.next_action,
			}),
		});
		if (result.verdict === "PASS") this.enter("verifying", "candidate frozen, G4 passed");
		else this.enter("deciding", "G4 failed: correct or reject");
		return ok(this.events);
	}

	verificationStart(c: CommandOf<"verification.start">): Decision {
		this.requirePhase("verifying");
		this.requireNotBlocked();
		this.requireKernelAuthority();
		if (this.state.operation) this.fail("OPERATION_ACTIVE", `operation ${this.state.operation.operation_id} is active`);
		if (!this.state.candidate) this.fail("PRECONDITION_FAILED", "no candidate");
		this.emit({
			type: "operation.opened",
			...this.base(),
			operation_id: c.operation_id,
			kind: "verification",
			idempotency_key: c.idempotency_key,
		});
		this.emit({ type: "status.changed", ...this.base(), status: "running", stop_reason: null, detail: null });
		return ok(this.events);
	}

	verificationRecord(c: CommandOf<"verification.record">): Decision {
		this.requirePhase("verifying");
		this.requireKernelAuthority();
		const candidate = this.state.candidate;
		const protocol = this.state.protocol;
		if (!candidate || !protocol) this.fail("PRECONDITION_FAILED", "candidate and protocol required");
		for (const e of c.evidence) {
			const reasons: string[] = [];
			if (e.subject_digest !== candidate.manifest_digest)
				reasons.push("subject digest does not match the frozen candidate");
			if (e.protocol_revision !== protocol.ref.revision)
				reasons.push("protocol revision does not match the frozen protocol");
			if (this.state.environment_digest && e.environment_digest !== this.state.environment_digest)
				reasons.push("environment digest does not match the current environment");
			if (!protocol.control_ids.includes(e.control_id))
				reasons.push(`control ${e.control_id} is not part of the frozen protocol`);
			if (this.state.evidence.some((x) => x.evidence_id === e.evidence_id)) continue; // idempotent
			if (reasons.length > 0) {
				this.emit({
					type: "evidence.rejected",
					...this.base(),
					evidence_id: e.evidence_id,
					control_id: e.control_id,
					reason: reasons.join("; "),
				});
				continue;
			}
			this.emit({
				type: "evidence.recorded",
				...this.base(),
				evidence_id: e.evidence_id,
				control_id: e.control_id,
				control_version: e.control_version,
				requirement_ids: e.requirement_ids,
				subject_digest: e.subject_digest,
				protocol_revision: e.protocol_revision,
				environment_digest: e.environment_digest,
				verdict: e.verdict,
				findings_blocking: e.findings_blocking,
			});
		}
		return ok(this.events);
	}

	verificationComplete(c: CommandOf<"verification.complete">): Decision {
		this.requirePhase("verifying");
		this.requireKernelAuthority();
		if (this.state.operation && this.state.operation.operation_id === c.operation_id)
			this.emit({ type: "operation.closed", ...this.base(), operation_id: c.operation_id });
		const needsReview = (this.state.protocol?.required_reviews.length ?? 0) > 0;
		this.enter(needsReview ? "reviewing" : "deciding", "controls terminated");
		return ok(this.events);
	}

	/** Explicit re-verification of the frozen candidate (`/495 verify`): G5 is invalidated, evidence stays historised. */
	verificationRerun(c: CommandOf<"verification.rerun">): Decision {
		this.requirePhase("deciding", "reviewing", "verifying");
		this.requireKernelAuthority();
		if (this.state.status === "paused") this.requireNotBlocked();
		if (this.state.operation && this.state.operation.kind === "verification")
			this.emit({ type: "operation.closed", ...this.base(), operation_id: this.state.operation.operation_id });
		if (this.state.gates.G5) this.emit({ type: "gate.invalidated", ...this.base(), gate: "G5", reason: c.reason });
		if (this.state.status === "blocked")
			this.emit({ type: "status.changed", ...this.base(), status: "ready", stop_reason: null, detail: null });
		if (this.state.phase !== "verifying") this.enter("verifying", `re-verification: ${c.reason}`);
		return ok(this.events);
	}

	reviewRecord(c: CommandOf<"review.record">): Decision {
		this.requirePhase("reviewing", "verifying", "deciding");
		if (
			this.actor.actor_type === "agent" &&
			c.conclusion !== "consultative" &&
			!this.state.protocol?.required_reviews.includes(c.reviewer_role)
		) {
			this.fail("POLICY_DENIED", `review role ${c.reviewer_role} is not a required review of the frozen protocol`);
		}
		if (!this.state.candidate || c.subject_digest !== this.state.candidate.manifest_digest)
			this.fail("EVIDENCE_STALE", "review subject does not match the frozen candidate");
		this.emit({
			type: "review.recorded",
			...this.base(),
			review_id: c.review_id,
			reviewer_role: c.reviewer_role,
			subject_digest: c.subject_digest,
			conclusion: c.conclusion,
			blocking_findings: c.blocking_findings,
		});
		return ok(this.events);
	}

	reviewComplete(): Decision {
		this.requirePhase("reviewing");
		this.requireKernelAuthority();
		this.enter("deciding", "reviews available");
		return ok(this.events);
	}

	// --- decisions on the change -------------------------------------------------------------------

	correctionAuthorize(c: CommandOf<"correction.authorize">): Decision {
		this.requirePhase("deciding");
		this.requireKernelAuthority();
		if (this.state.status === "paused" || this.state.status === "decision_required") this.requireNotBlocked();
		const g5 = this.state.gates.G5;
		const g4 = this.state.gates.G4;
		if (!(g4 && g4.verdict === "FAIL") && !(g5 && g5.verdict !== "PASS"))
			this.fail("PRECONDITION_FAILED", "no failed gate to correct");
		const current = currentAttempt(this.state);
		if (!current) this.fail("PRECONDITION_FAILED", "no attempt to correct");
		if (this.state.budgets.attempts_used >= this.state.budgets.max_attempts) {
			this.block(
				"attempts_exhausted",
				`${this.state.budgets.attempts_used}/${this.state.budgets.max_attempts} attempts consumed; a budget extension (IH-07) is required`,
			);
			return ok(this.events);
		}
		const n = this.policy.stagnation_identical_candidates;
		const history = this.state.candidate_history;
		if (n > 0 && history.length >= n && new Set(history.slice(-n)).size === 1) {
			this.block("stagnation", `${n} identical candidates without measurable progress`);
			return ok(this.events);
		}
		if (c.feedback) {
			if (c.feedback.bytes > this.policy.budgets.feedback_bytes)
				this.fail("POLICY_DENIED", `feedback exceeds ${this.policy.budgets.feedback_bytes} bytes`);
			this.emit({
				type: "feedback.produced",
				...this.base(),
				attempt_id: current.attempt_id,
				digest: c.feedback.digest,
				bytes: c.feedback.bytes,
				truncated: c.feedback.truncated,
			});
		}
		this.emit({ type: "attempt.closed", ...this.base(), attempt_id: current.attempt_id, result: "superseded" });
		this.emit({
			type: "attempt.opened",
			...this.base(),
			attempt_id: c.attempt_id,
			index: this.state.attempts.length + 1,
		});
		this.invalidate({ kind: "candidate_replaced" });
		this.enter("implementing", "correction authorized");
		return ok(this.events);
	}

	changeReject(c: CommandOf<"change.reject">): Decision {
		this.requirePhase("deciding");
		this.requireKernelAuthority();
		this.emit({ type: "outcome.set", ...this.base(), outcome: "rejected" });
		this.emit({
			type: "status.changed",
			...this.base(),
			status: "completed",
			stop_reason: "policy_denied",
			detail: c.reason,
		});
		this.enter("closed", `rejected: ${c.reason}`, "completed");
		return ok(this.events);
	}

	changePause(): Decision {
		this.requireActive();
		if (this.state.status === "paused") return ok(this.events);
		// A blocked change runs nothing to suspend, and the pause would replace its stop: the reason, the
		// detail naming its ways out and whether a resume lifts it would be lost.
		if (this.state.status === "blocked")
			this.fail(
				"PRECONDITION_FAILED",
				`change is blocked: ${this.state.stop_reason ?? "unknown"}; nothing runs to pause`,
			);
		if (runningIntervention(this.state))
			this.fail("PRECONDITION_FAILED", "stop the running intervention before pausing");
		if (
			this.state.operation &&
			(this.state.operation.effect_state === "started" || this.state.operation.effect_state === "uncertain")
		)
			this.fail("EFFECT_UNCERTAIN", "an external effect is in flight; reconcile before pausing");
		this.emit({ type: "resume_point.saved", ...this.base(), phase: this.state.phase, status: this.state.status });
		this.emit({ type: "status.changed", ...this.base(), status: "paused", stop_reason: null, detail: null });
		return ok(this.events);
	}

	changeResume(): Decision {
		this.requireActive();
		if (this.state.status !== "paused") this.fail("PRECONDITION_FAILED", `change is ${this.state.status}, not paused`);
		if (this.state.operation && this.state.operation.effect_state === "uncertain")
			this.fail("EFFECT_UNCERTAIN", "an external effect is uncertain; reconcile first (IH-12)");
		const resume = this.state.resume_point;
		const status = resume && resume.status !== "running" ? resume.status : "ready";
		this.emit({
			type: "status.changed",
			...this.base(),
			status: status === "paused" ? "ready" : status,
			stop_reason: status === "decision_required" ? "decision_pending" : null,
			detail: null,
		});
		return ok(this.events);
	}

	changeCancel(c: CommandOf<"change.cancel">): Decision {
		this.requireActive();
		if (!HUMAN_ORIGINS.has(this.actor.origin) && this.actor.actor_type !== "kernel")
			this.fail("INVALID_PROVENANCE", "cancellation requires a human or kernel actor");
		const running = runningIntervention(this.state);
		if (running)
			this.emit({
				type: "intervention.finished",
				...this.base(),
				intervention_id: running.intervention_id,
				result: "cancelled",
				counters: { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 },
				detail: "change cancelled",
				cost: unknownCost("the change was cancelled before the host reported the session's usage"),
				imposed_layers: [unobservedEnd("the change was cancelled before the session reported its requests")],
			});
		const open = openAttempt(this.state);
		if (open) this.emit({ type: "attempt.closed", ...this.base(), attempt_id: open.attempt_id, result: "cancelled" });
		this.emit({ type: "outcome.set", ...this.base(), outcome: "abandoned" });
		this.emit({
			type: "status.changed",
			...this.base(),
			status: "cancelled",
			stop_reason: "user_cancelled",
			detail: c.reason,
		});
		this.emit({
			type: "phase.entered",
			...this.base(),
			phase: "closed",
			status: "cancelled",
			reason: `cancelled: ${c.reason}`,
		});
		return ok(this.events);
	}

	changeBlock(c: CommandOf<"change.block">): Decision {
		this.requireActive();
		this.block(c.reason, c.detail, c.retryable ?? false);
		return ok(this.events);
	}

	changeUnblock(): Decision {
		if (this.state.status !== "blocked") this.fail("PRECONDITION_FAILED", "change is not blocked");
		this.requireKernelAuthority();
		if (
			this.state.stop_reason === "attempts_exhausted" &&
			this.state.budgets.attempts_used >= this.state.budgets.max_attempts
		)
			this.fail("ATTEMPTS_EXHAUSTED", "attempt budget is still exhausted; a budget extension (IH-07) is required");
		if (this.state.operation?.effect_state === "uncertain")
			this.fail("EFFECT_UNCERTAIN", "reconcile the uncertain effect first (IH-12)");
		this.emit({ type: "status.changed", ...this.base(), status: "ready", stop_reason: null, detail: null });
		return ok(this.events);
	}

	// --- human decisions ---------------------------------------------------------------------------

	decisionRequest(c: CommandOf<"decision.request">): Decision {
		this.requireActive();
		this.requireKernelAuthority();
		if (this.state.pending_decisions.some((d) => d.decision_id === c.request.decision_id)) return ok(this.events);
		this.emit({
			type: "decision.requested",
			...this.base(),
			decision_id: c.request.decision_id,
			interaction: c.request.interaction,
			subject: c.request.subject,
			expires_at: c.request.expires_at,
		});
		return ok(this.events);
	}

	decisionAnswer(c: CommandOf<"decision.answer">): Decision {
		const pending = this.state.pending_decisions.find((d) => d.decision_id === c.response.decision_id);
		const rejectWith = (reason: string, code: ConstructorParameters<typeof DomainError>[0]): Decision => {
			this.emit({ type: "decision.rejected", ...this.base(), decision_id: c.response.decision_id, reason });
			return reject(
				new DomainError(code, reason, {
					subject: subjectOfChange(this.state),
					phase: this.state.phase,
					nextActions: ["request_decision"],
				}),
			);
		};
		if (!pending) return rejectWith(`decision ${c.response.decision_id} is not pending`, "UNKNOWN_REFERENCE");
		const origin = c.origin.actor;
		if (origin.actor_type !== "human" || !HUMAN_ORIGINS.has(origin.origin) || origin.authentication_level === "none")
			return rejectWith(
				`decision provenance ${origin.actor_type}/${origin.origin}/${origin.authentication_level} is not a qualified human origin`,
				"INVALID_PROVENANCE",
			);
		if (this.actor.origin === "model_output" || this.actor.origin === "tool_call")
			return rejectWith("a decision cannot be carried by a model output or a tool call", "INVALID_PROVENANCE");
		if (pending.expires_at && c.at > pending.expires_at)
			return rejectWith(`decision ${pending.decision_id} expired at ${pending.expires_at}`, "DECISION_EXPIRED");
		if (c.response.subject_revision !== pending.subject.revision)
			return rejectWith(
				`decision answers revision ${c.response.subject_revision} but ${pending.subject.revision} was presented`,
				"DECISION_NOT_APPLICABLE",
			);
		const currentDigest =
			pending.subject.kind === "candidate"
				? this.state.candidate?.manifest_digest
				: pending.subject.kind === "change"
					? subjectOfChange(this.state).digest
					: pending.subject.digest;
		if (pending.subject.kind === "candidate" && currentDigest !== pending.subject.digest)
			return rejectWith("the candidate changed since the decision was requested", "DECISION_NOT_APPLICABLE");
		if (c.response.option_id === null && c.response.free_text === null)
			return rejectWith("a decision needs an option or a free text answer", "PRECONDITION_FAILED");
		this.emit({
			type: "decision.recorded",
			...this.base(),
			human_decision_id: c.human_decision_id,
			decision_id: pending.decision_id,
			interaction: pending.interaction,
			option_id: c.response.option_id,
			subject: pending.subject,
			actor_id: origin.actor_id,
			scope: c.response.scope,
		});
		switch (pending.interaction) {
			case "IH-01": {
				const q = this.state.open_questions.find((x) => x.decision_id === pending.decision_id);
				if (q)
					this.emit({
						type: "question.answered",
						...this.base(),
						id: q.id,
						answer: c.response.free_text ?? c.response.option_id ?? "",
						human_decision_id: c.human_decision_id,
					});
				break;
			}
			case "IH-07": {
				if (c.response.option_id === "extend") {
					const amount = Number.parseInt(c.response.free_text ?? "1", 10);
					const add = Number.isFinite(amount) && amount > 0 ? amount : 1;
					this.emit({
						type: "budget.extended",
						...this.base(),
						amount: add,
						decision_id: pending.decision_id,
						new_max_attempts: this.state.budgets.max_attempts + add,
					});
					if (this.state.status === "blocked" && this.state.stop_reason === "attempts_exhausted")
						this.emit({ type: "status.changed", ...this.base(), status: "ready", stop_reason: null, detail: null });
				}
				break;
			}
			case "IH-12": {
				if (this.state.operation && this.state.operation.effect_state === "uncertain") {
					if (c.response.option_id === "confirm_applied")
						this.emit({
							type: "operation.effect",
							...this.base(),
							operation_id: this.state.operation.operation_id,
							effect_state: "reconciled",
							detail: "human confirmed the effect was applied",
						});
					else if (c.response.option_id === "confirm_not_applied") {
						this.emit({
							type: "operation.effect",
							...this.base(),
							operation_id: this.state.operation.operation_id,
							effect_state: "failed",
							detail: "human confirmed the effect was not applied",
						});
						this.emit({ type: "operation.closed", ...this.base(), operation_id: this.state.operation.operation_id });
					}
				}
				break;
			}
			default:
				break;
		}
		return ok(this.events);
	}

	decisionRevoke(c: CommandOf<"decision.revoke">): Decision {
		const d = this.state.human_decisions.find((x) => x.human_decision_id === c.human_decision_id);
		if (!d) this.fail("UNKNOWN_REFERENCE", `human decision ${c.human_decision_id} does not exist`);
		if (!HUMAN_ORIGINS.has(this.actor.origin)) this.fail("INVALID_PROVENANCE", "revocation requires human provenance");
		this.emit({ type: "decision.revoked", ...this.base(), human_decision_id: c.human_decision_id, reason: c.reason });
		this.invalidate({
			kind: "authorization_revoked",
			human_decision_id: c.human_decision_id,
			interaction: d.interaction,
		});
		return ok(this.events);
	}

	// --- invalidations -----------------------------------------------------------------------------

	artifactRevise(c: CommandOf<"artifact.revise">): Decision {
		this.requireActive();
		this.requireKernelAuthority();
		if (runningIntervention(this.state))
			this.fail("PRECONDITION_FAILED", "stop the running intervention before revising an artifact");
		const plan = invalidationFor(this.state, { kind: "artifact_revised", artifact: c.kind });
		if (!plan.rollback_phase) this.fail("PRECONDITION_FAILED", `artifact ${c.kind} cannot be revised`);
		if (!this.state.adopted[c.kind])
			this.fail("PRECONDITION_FAILED", `artifact ${c.kind} has not been adopted; propose it instead`);
		if (PHASE_ORDER.indexOf(this.state.phase) < PHASE_ORDER.indexOf(plan.rollback_phase))
			this.fail(
				"PRECONDITION_FAILED",
				`phase ${this.state.phase} precedes ${plan.rollback_phase}; nothing to roll back`,
			);
		this.invalidate({ kind: "artifact_revised", artifact: c.kind });
		this.emit({
			type: "artifact.revised",
			...this.base(),
			kind: c.kind,
			ref: c.ref,
			rollback_phase: plan.rollback_phase,
			invalidated_gates: plan.gates,
			reason: c.reason,
		});
		return ok(this.events);
	}

	environmentChange(c: CommandOf<"environment.change">): Decision {
		if (c.digest === this.state.environment_digest) return ok(this.events);
		if (runningIntervention(this.state))
			this.fail("PRECONDITION_FAILED", "the environment cannot change during an intervention (RM-076)");
		this.emit({ type: "environment.changed", ...this.base(), digest: c.digest });
		this.invalidate({ kind: "environment_changed" });
		if (
			this.state.protocol &&
			["designing", "implementing", "verifying", "reviewing", "deciding"].includes(this.state.phase)
		) {
			this.enter("verification_design", "environment changed: protocol qualification must be re-established");
		}
		return ok(this.events);
	}

	evidenceInvalidate(c: CommandOf<"evidence.invalidate">): Decision {
		const e = this.state.evidence.find((x) => x.evidence_id === c.evidence_id);
		if (!e) this.fail("UNKNOWN_REFERENCE", `evidence ${c.evidence_id} does not exist`);
		if (!e.valid) return ok(this.events);
		this.emit({ type: "evidence.invalidated", ...this.base(), evidence_id: c.evidence_id, reason: c.reason });
		this.invalidate({ kind: "evidence_lost", evidence_id: c.evidence_id });
		if (this.state.phase === "deciding" || this.state.phase === "reviewing")
			this.enter("verifying", "evidence lost: verification must be reproduced");
		else if (this.state.phase === "integrating")
			this.block("evidence_missing", `evidence ${c.evidence_id} invalidated after acceptance`);
		return ok(this.events);
	}

	operationFail(c: CommandOf<"operation.fail">): Decision {
		const count = (this.state.budgets.retries[c.operation_key] ?? 0) + 1;
		this.emit({ type: "operation.retried", ...this.base(), operation_key: c.operation_key, count });
		if (
			this.state.operation &&
			(this.state.operation.effect_state === "started" || this.state.operation.effect_state === "uncertain")
		) {
			this.block("execution_error", `operation ${c.operation_key} failed with an in-flight effect; no automatic retry`);
			return ok(this.events);
		}
		if (count > this.policy.budgets.max_technical_retries)
			this.block(
				"execution_error",
				`operation ${c.operation_key} failed ${count} times; retry budget (${this.policy.budgets.max_technical_retries}) exhausted`,
			);
		return ok(this.events);
	}

	// --- integration -------------------------------------------------------------------------------

	integrationPrepare(c: CommandOf<"integration.prepare">): Decision {
		this.requirePhase("integrating");
		this.requireNotBlocked();
		this.requireKernelAuthority();
		if (!this.policy.integration_enabled) this.fail("POLICY_DENIED", "integration is disabled by policy");
		const g5 = this.state.gates.G5;
		if (g5?.verdict !== "PASS" || !this.state.candidate)
			this.fail("PRECONDITION_FAILED", "only a candidate accepted at G5 can be integrated (RM-053)");
		if (g5.evaluated.candidate !== this.state.candidate.manifest_digest)
			this.fail("EVIDENCE_STALE", "G5 evaluated another candidate");
		if (!this.state.integration_authorization_id)
			this.fail("DECISION_REQUIRED", "integration requires a valid IH-11 authorization", ["request_decision:IH-11"]);
		const auth = this.state.human_decisions.find(
			(d) => d.human_decision_id === this.state.integration_authorization_id,
		);
		if (!auth?.valid || auth.subject.digest !== this.state.candidate.manifest_digest)
			this.fail("DECISION_NOT_APPLICABLE", "the integration authorization does not cover this candidate");
		if (this.state.operation) {
			if (this.state.operation.idempotency_key === c.idempotency_key) return ok(this.events);
			this.fail("OPERATION_ACTIVE", `operation ${this.state.operation.operation_id} is active`);
		}
		this.emit({
			type: "operation.opened",
			...this.base(),
			operation_id: c.operation_id,
			kind: "integration",
			idempotency_key: c.idempotency_key,
		});
		this.emit({
			type: "operation.effect",
			...this.base(),
			operation_id: c.operation_id,
			effect_state: "prepared",
			detail: null,
		});
		this.emit({
			type: "integration.prepared",
			...this.base(),
			destination: c.destination,
			destination_before: c.destination_before,
			candidate_digest: this.state.candidate.manifest_digest,
			plan_digest: c.plan_digest,
			authorized_by: auth.human_decision_id,
		});
		return ok(this.events);
	}

	integrationEffect(c: CommandOf<"integration.effect">): Decision {
		const op = this.state.operation;
		if (!op || op.operation_id !== c.operation_id)
			this.fail("UNKNOWN_REFERENCE", `operation ${c.operation_id} is not active`);
		const allowed: Record<string, string[]> = {
			prepared: ["started", "failed"],
			started: ["confirmed", "failed", "uncertain"],
			uncertain: [],
			confirmed: [],
			failed: [],
			none: [],
		};
		if (!allowed[op.effect_state]?.includes(c.effect_state))
			this.fail("INVALID_TRANSITION", `effect ${op.effect_state} -> ${c.effect_state} is not allowed`);
		this.emit({
			type: "operation.effect",
			...this.base(),
			operation_id: c.operation_id,
			effect_state: c.effect_state,
			detail: c.detail,
		});
		if (c.effect_state === "uncertain") {
			this.block("integration_conflict", "integration effect uncertain: reconciliation required (IH-12)");
			if (c.decision_id)
				this.emit({
					type: "decision.requested",
					...this.base(),
					decision_id: c.decision_id,
					interaction: "IH-12",
					subject: subjectOfChange(this.state),
					expires_at: null,
				});
		}
		if (c.effect_state === "failed") {
			this.emit({ type: "operation.closed", ...this.base(), operation_id: c.operation_id });
			this.block("integration_conflict", c.detail ?? "integration failed");
		}
		return ok(this.events);
	}

	integrationReconcile(c: CommandOf<"integration.reconcile">): Decision {
		const op = this.state.operation;
		if (!op || op.operation_id !== c.operation_id)
			this.fail("UNKNOWN_REFERENCE", `operation ${c.operation_id} is not active`);
		if (op.effect_state !== "uncertain" && op.effect_state !== "reconciled")
			this.fail("PRECONDITION_FAILED", `operation effect is ${op.effect_state}, nothing to reconcile`);
		this.requireKernelAuthority();
		if (c.applied) {
			this.emit({
				type: "operation.effect",
				...this.base(),
				operation_id: c.operation_id,
				effect_state: "confirmed",
				detail: "reconciled: effect observed",
			});
			this.emit({ type: "status.changed", ...this.base(), status: "ready", stop_reason: null, detail: null });
		} else {
			this.emit({
				type: "operation.effect",
				...this.base(),
				operation_id: c.operation_id,
				effect_state: "failed",
				detail: "reconciled: effect not observed",
			});
			this.emit({ type: "operation.closed", ...this.base(), operation_id: c.operation_id });
			this.emit({ type: "status.changed", ...this.base(), status: "ready", stop_reason: null, detail: null });
		}
		return ok(this.events);
	}

	integrationDestinationAdvanced(c: CommandOf<"integration.destination_advanced">): Decision {
		this.requirePhase("integrating");
		if (
			this.state.operation &&
			(this.state.operation.effect_state === "started" || this.state.operation.effect_state === "uncertain")
		)
			this.fail("EFFECT_UNCERTAIN", "cannot re-plan while an effect is in flight");
		if (this.state.operation)
			this.emit({ type: "operation.closed", ...this.base(), operation_id: this.state.operation.operation_id });
		this.emit({
			type: "integration.destination_advanced",
			...this.base(),
			destination_before: c.destination_before,
			combined_changed: c.combined_changed,
		});
		this.invalidate({ kind: "destination_advanced", combined_changed: c.combined_changed });
		if (c.combined_changed) this.enter("verifying", "destination advanced: combined tree must be re-verified");
		return ok(this.events);
	}
}

const PHASE_ORDER: Phase[] = [
	"intake",
	"clarifying",
	"specifying",
	"verification_design",
	"preparing",
	"designing",
	"implementing",
	"verifying",
	"reviewing",
	"deciding",
	"integrating",
	"closed",
];
