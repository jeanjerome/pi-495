/**
 * Replays a formal trace on the kernel: each abstract action issues, through the real decider, the kernel
 * commands ACTION_MAPPING names for it, the events go to a store, and the store's state is observed after
 * each step as the model is. An abstract identity becomes a concrete reference here and nowhere else: a
 * candidate `n` is the fixture's candidate reference of seed `cn`, a revision `n` the protocol `prt_n`, a control
 * `k1`/`k2` a control of the fixture protocol; none is a path or a command. A revised protocol is frozen under an
 * identity of its own, at the first revision of that artifact, as the application freezes each protocol it
 * designs: two revisions of the model never share the identity a result carries.
 */
import type { ActorRef } from "../../src/contracts/v1/common.ts";
import type { HumanOrigin } from "../../src/contracts/v1/decision.ts";
import { apply } from "../../src/domain/change/apply.ts";
import type { ChangeCommand } from "../../src/domain/change/commands.ts";
import { type Decision, decide } from "../../src/domain/change/decide.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";
import { type ChangeState, unknownCost } from "../../src/domain/change/state.ts";
import type { ActivePolicy } from "../../src/domain/policy.ts";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import {
	EXECUTOR,
	HUMAN,
	KERNEL,
	Runner,
	candidate,
	decisionRequest,
	design,
	evidence,
	protocol,
	ref,
	tick,
	tuiOrigin,
} from "../helpers/change-fixture.ts";
import {
	ACTION_MAPPING,
	CONTROL_IDS,
	EXPLORED_DOMAIN,
	type FormalTrace,
	type G5Verdict,
	type Observation,
	type TraceProperty,
	type TraceStep,
	observeKernel,
	ranUnder,
} from "./formal-traces.ts";

const CHANGE_ID = "chg_1";

/** The kernel's decider, which a test may wrap to inject a defect. */
export type Decider = (state: ChangeState | null, command: ChangeCommand, policy: ActivePolicy) => Decision;

/** Where a replay keeps the kernel's events, and reads its state back from. A store serves one replay. */
export interface ReplayStore {
	append(events: readonly ChangeEvent[]): void;
	state(): ChangeState;
	events(): ChangeEvent[];
	close(): void;
}

export interface StepReport {
	step: number;
	action: TraceStep["action"];
	observed: Observation;
	/** The verdict of the G5 the step decided, if it decided one. */
	g5: G5Verdict | null;
	/** For a Deliver step: whether the kernel recorded the result as evidence. */
	delivered: "recorded" | "rejected" | null;
	/** Each command the kernel refused, as `type: code`. */
	refusals: string[];
}

export interface ReplayReport {
	trace: string;
	property: TraceProperty;
	steps: StepReport[];
	/** Each step whose observation departs from the model's, or that an allowed operation was refused at. */
	divergences: string[];
	/** How the kernel violates the trace's property at the end of the replay, null when it holds. */
	violation: string | null;
}

/** A store backed by the kernel's SQLite ledger at `path`. */
export function ledgerStore(path: string): ReplayStore {
	const ledger = new SqliteLedger(path);
	let revision = 0;
	return {
		append(events) {
			if (events.length === 0) return;
			revision = ledger.appendChange(CHANGE_ID, revision, events, { correlation_id: `replay_${revision}` }).revision;
		},
		state() {
			const loaded = ledger.loadChange(CHANGE_ID);
			if (!loaded) throw new Error(`the ledger holds no change ${CHANGE_ID}`);
			return loaded.state;
		},
		events: () => ledger.readChangeEvents(CHANGE_ID).map((s) => s.event),
		close: () => ledger.close(),
	};
}

/** A store in memory, which replays the events it holds to give the state. */
export function memoryStore(): ReplayStore {
	const events: ChangeEvent[] = [];
	return {
		append: (more) => events.push(...more),
		state() {
			const state = events.reduce<ChangeState | null>((s, e) => apply(s, e), null);
			if (!state) throw new Error(`the store holds no change ${CHANGE_ID}`);
			return state;
		},
		events: () => [...events],
		close: () => undefined,
	};
}

const concreteCandidate = (cand: number) => candidate(`c${cand}`);
/** The identity of the protocol a revision of the model is frozen under. */
const protocolOf = (revision: number) => `prt_${revision}`;

/** Carries the abstract actions of one trace onto one change of the kernel. */
export class KernelTranslation {
	private readonly runner: Runner;
	private readonly store: ReplayStore;
	private readonly decider: Decider;
	private ids = 0;
	private flushed = 0;
	/** The revision the protocol was last revised to, which Requalify freezes. */
	private revision = 1;

	constructor(humanAcceptance: boolean, store: ReplayStore, decider: Decider = decide) {
		this.store = store;
		this.decider = decider;
		this.runner = new Runner({
			g5_human_acceptance: humanAcceptance,
			budgets: { max_attempts: EXPLORED_DOMAIN.maxAttempts },
		});
		// The model's initial state: G0 to G4 passed on an adopted preparation, the candidate of the first attempt
		// frozen under revision 1.
		this.runner.create().g0().g1();
		this.runner.run({ type: "preparation.open", at: tick(), actor: KERNEL, mandate_ref: ref("prp_0", "prepare") });
		this.runner.run({
			type: "preparation.close",
			at: tick(),
			actor: KERNEL,
			qualified: true,
			capability_ids: ["unit"],
			adopted_ref: ref("prep_0", "prepared"),
		});
		this.runner.g2().g3().implement("int_0", "att_0").freeze(concreteCandidate(1));
		this.flush();
	}

	run(step: Pick<TraceStep, "step" | "action" | "args">): StepReport {
		const before = this.runner.events.length;
		const refusals: string[] = [];
		const issue = (command: ChangeCommand): boolean => {
			const allowed: readonly string[] = ACTION_MAPPING[step.action].commands;
			if (!allowed.includes(command.type))
				throw new Error(`step ${step.step} ${step.action} issued ${command.type}, which its mapping does not name`);
			const d = this.decider(this.runner.state, command, this.runner.policy);
			if (!d.ok) {
				refusals.push(`${command.type}: ${d.error.code}`);
				return false;
			}
			for (const e of d.events) {
				this.runner.state = apply(this.runner.state, e);
				this.runner.events.push(e);
			}
			return true;
		};
		this.translate(step, issue);
		const emitted = this.runner.events.slice(before);
		this.flush();
		const g5 = emitted.findLast((e) => e.type === "gate.decided" && e.decision.gate === "G5");
		return {
			step: step.step,
			action: step.action,
			observed: observeKernel(this.store.state()),
			g5: g5?.type === "gate.decided" ? (g5.decision.verdict as G5Verdict) : null,
			delivered:
				step.action === "Deliver"
					? emitted.some((e) => e.type === "evidence.recorded")
						? "recorded"
						: "rejected"
					: null,
			refusals,
		};
	}

	private flush(): void {
		this.store.append(this.runner.events.slice(this.flushed));
		this.flushed = this.runner.events.length;
	}

	private id(prefix: string): string {
		this.ids += 1;
		return `${prefix}_${this.ids}`;
	}

	private translate(step: Pick<TraceStep, "step" | "action" | "args">, issue: (c: ChangeCommand) => boolean): void {
		const s = this.runner.s;
		const { args } = step;
		switch (step.action) {
			case "Launch":
				// One verification operation carries every launch until it closes; the run is the executor's.
				if (!s.operation)
					issue({
						type: "verification.start",
						at: tick(),
						actor: KERNEL,
						operation_id: this.id("op"),
						idempotency_key: this.id("key"),
					});
				return;
			case "Deliver": {
				const control = args.control ?? "k1";
				const fact = evidence({
					control_id: CONTROL_IDS[control],
					subject_digest: concreteCandidate(args.cand ?? 1).manifest_digest,
					protocol_id: protocolOf(args.ran ?? 1),
					protocol_revision: 1,
					verdict: args.verdict ?? "PASS",
				});
				issue({ type: "verification.record", at: tick(), actor: EXECUTOR, evidence: [fact] });
				return;
			}
			case "Complete":
				issue({
					type: "verification.complete",
					at: tick(),
					actor: KERNEL,
					operation_id: s.operation?.operation_id ?? this.id("op"),
				});
				return;
			case "EvaluateG5":
				this.evaluateG5(issue);
				return;
			case "HumanAnswer":
				this.answer(issue, HUMAN, tuiOrigin(), args.option ?? "accept");
				return;
			case "Correct":
			case "ExhaustOnCorrection":
				this.correct(issue);
				return;
			case "StartAttempt":
			case "ExhaustOnStart":
				this.startAttempt(issue);
				return;
			case "Freeze":
				this.freeze(issue, args.cand ?? 1);
				return;
			case "ReviseProtocol": {
				const revision = this.revision + 1;
				const p = protocol({ protocol_id: protocolOf(revision) });
				const revised = issue({
					type: "artifact.revise",
					at: tick(),
					actor: KERNEL,
					kind: "protocol",
					ref: ref(p.protocol_id, p),
					reason: `protocol revision ${revision}`,
				});
				if (revised) this.revision = revision;
				return;
			}
			case "Contest":
				this.contest(issue);
				return;
			case "Requalify": {
				const p = protocol({ protocol_id: protocolOf(this.revision) });
				const frozen = issue({
					type: "gate.evaluate",
					gate: "G2",
					at: tick(),
					actor: KERNEL,
					protocol_ref: ref(p.protocol_id, p),
					protocol: p,
				});
				if (frozen)
					issue({
						type: "gate.evaluate",
						gate: "G3",
						at: tick(),
						actor: KERNEL,
						design_ref: ref("dsg_1", design()),
						design: design(),
					});
				return;
			}
			case "Pause":
				issue({ type: "change.pause", at: tick(), actor: HUMAN });
				return;
			case "Resume":
			case "ResumeAdoptingRuns":
				issue({ type: "change.resume", at: tick(), actor: HUMAN });
				return;
			case "ResumeRecordingAcceptance":
				issue({ type: "change.resume", at: tick(), actor: HUMAN });
				this.answer(issue, KERNEL, { actor: KERNEL, host: "tui", session_id: "kernel", asserted_at: tick() }, "accept");
				return;
			case "AcceptWhenExhausted":
				this.correct(issue);
				issue({ type: "gate.evaluate", gate: "G5", at: tick(), actor: KERNEL, decision_id: null });
				return;
			default: {
				const unmapped: never = step.action;
				throw new Error(`step ${step.step}: action ${String(unmapped)} has no translation to kernel commands`);
			}
		}
	}

	/**
	 * G5, then the IH-10 request it asks for when the policy wants a human acceptance, every time it asks, as
	 * the decide phase does (src/application/phases/decide.ts).
	 */
	private evaluateG5(issue: (c: ChangeCommand) => boolean): void {
		if (!issue({ type: "gate.evaluate", gate: "G5", at: tick(), actor: KERNEL, decision_id: null })) return;
		const s = this.runner.s;
		if (s.gates.G5?.next_action !== "request_decision:IH-10" || !s.candidate) return;
		const c = s.candidate;
		issue({
			type: "decision.request",
			at: tick(),
			actor: KERNEL,
			request: decisionRequest("IH-10", {
				decision_id: this.id("dec"),
				subject: { kind: "candidate", id: c.candidate_id, revision: 1, digest: c.manifest_digest },
				question: "Accepter le candidat ?",
				options: [
					{ id: "accept", label: "Accepter", effect: "", risky: false },
					{ id: "reject", label: "Refuser", effect: "", risky: false },
				],
			}),
		});
	}

	private answer(
		issue: (c: ChangeCommand) => boolean,
		actor: ActorRef,
		origin: HumanOrigin,
		option: "accept" | "reject",
	): void {
		const pending = this.runner.s.pending_decisions.find((d) => d.interaction === "IH-10");
		issue({
			type: "decision.answer",
			at: tick(),
			actor,
			human_decision_id: this.id("hd"),
			response: {
				decision_id: pending?.decision_id ?? "none",
				option_id: option,
				free_text: null,
				reason: null,
				subject_revision: pending?.subject.revision ?? 1,
				scope: null,
				expires_at: null,
			},
			origin,
		});
	}

	/**
	 * The producer contests the case of the control that failed on the refused candidate, the kernel files it
	 * with the run that reproduces it, the examination finds the test wrong, and the preparation is revised.
	 */
	private contest(issue: (c: ChangeCommand) => boolean): void {
		const s = this.runner.s;
		const failed = s.evidence.findLast(
			(e) => e.valid && e.verdict === "FAIL" && e.subject_digest === s.candidate?.manifest_digest,
		);
		const requirement = failed?.requirement_ids[0] ?? "none";
		const contestationId = this.id("ctt");
		const filed = issue({
			type: "contestation.file",
			at: tick(),
			actor: KERNEL,
			contestation: {
				contestation_id: contestationId,
				intervention_id: s.interventions.findLast((i) => i.role === "implement")?.intervention_id ?? "none",
				requirement_id: requirement,
				case_name: `${requirement} contested case`,
				protocol: { protocol_id: s.protocol?.ref.protocol_id ?? "none", revision: s.protocol?.ref.revision ?? 0 },
				candidate_digest: s.candidate?.manifest_digest ?? "none",
				observation: `the case asserts what ${requirement} does not say`,
				reproduction: { control_id: failed?.control_id ?? "none", evidence_id: failed?.evidence_id ?? "none" },
			},
		});
		if (!filed) return;
		issue({
			type: "contestation.conclude",
			at: tick(),
			actor: KERNEL,
			contestation_id: contestationId,
			finding: "test_correction",
			examiner_id: this.id("int"),
			reasons: `the case asserts what ${requirement} does not say`,
		});
		const revision = this.revision + 1;
		const revised = issue({
			type: "artifact.revise",
			at: tick(),
			actor: KERNEL,
			kind: "preparation",
			ref: ref(`prv_${revision}`, { contestation_id: contestationId }),
			reason: `contestation ${contestationId} found the test wrong`,
		});
		if (revised) this.revision = revision;
	}

	private correct(issue: (c: ChangeCommand) => boolean): void {
		issue({ type: "correction.authorize", at: tick(), actor: KERNEL, attempt_id: this.id("att"), feedback: null });
	}

	/** An implement intervention, which opens an attempt while the budget allows it; the producer's work is abstracted. */
	private startAttempt(issue: (c: ChangeCommand) => boolean): void {
		const interventionId = this.id("int");
		issue({
			type: "intervention.start",
			at: tick(),
			actor: KERNEL,
			intervention_id: interventionId,
			role: "implement",
			attempt_id: this.id("att"),
			model: { provider_id: "omlx", model_id: "qwen3.8-27b-oq8e", thinking_level: "medium", location: "on_machine" },
			profile_id: "implement",
			profile_qualified: true,
		});
		if (!this.runner.s.interventions.some((i) => i.intervention_id === interventionId && i.result === "running"))
			return;
		issue({
			type: "intervention.finish",
			at: tick(),
			actor: KERNEL,
			intervention_id: interventionId,
			result: "completed",
			counters: { tool_calls: 1, duration_ms: 1000, tokens_known: 100, delegations: 0 },
			detail: null,
			cost: unknownCost("a replayed trace runs no host session"),
			imposed_layers: [],
		});
	}

	private freeze(issue: (c: ChangeCommand) => boolean, cand: number): void {
		const open = this.runner.s.attempts.find((a) => a.result === "open");
		issue({
			type: "candidate.freeze",
			at: tick(),
			actor: KERNEL,
			attempt_id: open?.attempt_id ?? "none",
			facts: {
				candidate: concreteCandidate(cand),
				entry_count: 3,
				changed_paths: ["src/greet.ts"],
				out_of_scope_paths: [],
				altered_protected_paths: [],
				complete: true,
				limits_notes: [],
				allowed_protected_paths: [],
				submodule_paths: [],
			},
		});
	}
}

// --- the properties, judged on the kernel's public state and events ----------------------------------------

function retainedEvidence(state: ChangeState, events: readonly ChangeEvent[]) {
	const retained = new Set(state.gates.G5?.evidence_retained ?? []);
	return events.flatMap((e) => (e.type === "evidence.recorded" && retained.has(e.evidence_id) ? [e] : []));
}

/** What a property is judged on: the kernel's state and events after a replay, and the policy it ran under. */
interface Judged {
	state: ChangeState;
	events: readonly ChangeEvent[];
	humanAcceptance: boolean;
}

/** One judge per property a finite trace protects: how the kernel violates it, or null when it holds. */
const PROPERTY_JUDGES: Record<TraceProperty, (judged: Judged) => string | null> = {
	FreshAcceptance({ state, events }) {
		if (state.outcome !== "accepted") return null;
		const retained = retainedEvidence(state, events);
		if (retained.length === 0) return "accepted on no retained evidence";
		const stale = retained.find(
			(e) => e.subject_digest !== state.candidate?.manifest_digest || !ranUnder(e, state.protocol?.ref),
		);
		return stale
			? `accepted on ${stale.evidence_id}, which ran under ${stale.protocol_id ?? "a protocol"} r${stale.protocol_revision} or on another candidate`
			: null;
	},
	AcceptanceNeedsObligations({ state, events }) {
		if (state.outcome !== "accepted") return null;
		const retained = retainedEvidence(state, events);
		const unmet = Object.values(CONTROL_IDS).filter(
			(control) =>
				!retained.some((e) => e.control_id === control && e.verdict === "PASS") ||
				retained.some((e) => e.control_id === control && e.verdict === "FAIL"),
		);
		return unmet.length > 0 ? `accepted without a passing evidence of ${unmet.join(", ")}` : null;
	},
	HumanAcceptance({ state, humanAcceptance }) {
		if (state.outcome !== "accepted" || !humanAcceptance) return null;
		const digest = state.candidate?.manifest_digest;
		const given = state.human_decisions.some(
			(d) => d.valid && d.interaction === "IH-10" && d.option_id === "accept" && d.subject.digest === digest,
		);
		return given ? null : "accepted without a valid human acceptance of the accepted candidate";
	},
	HumanProvenance({ events }) {
		const forged = events.find((e) => e.type === "decision.recorded" && e.actor.actor_type !== "human");
		return forged?.type === "decision.recorded"
			? `decision ${forged.human_decision_id} recorded by ${forged.actor.actor_type} ${forged.actor.actor_id}`
			: null;
	},
	StopIsFinal({ events }) {
		const stop = events.findIndex(
			(e) => e.type === "status.changed" && e.status === "blocked" && e.stop_reason === "attempts_exhausted",
		);
		if (stop < 0) return null;
		const after = events.slice(stop).some((e) => e.type === "outcome.set" && e.outcome === "accepted");
		return after ? "accepted after stopping on its exhausted budget" : null;
	},
};

/** How the kernel violates `property` in `state` after `events`, or null when it holds. */
export function propertyViolation(
	property: TraceProperty,
	state: ChangeState,
	events: readonly ChangeEvent[],
	humanAcceptance: boolean,
): string | null {
	return PROPERTY_JUDGES[property]({ state, events, humanAcceptance });
}

function divergence(trace: FormalTrace, step: TraceStep, report: StepReport): string | null {
	if (!step.expect) return null;
	if (step.action !== "Deliver" && report.refusals.length > 0)
		return `step ${step.step} ${step.action}: the kernel refused ${report.refusals.join(", ")}`;
	const { g5, ...expected } = step.expect;
	const observed = JSON.stringify(report.observed);
	if (observed !== JSON.stringify(expected))
		return `step ${step.step} ${step.action}: the kernel observes ${observed}, ${trace.name} expects ${JSON.stringify(expected)}`;
	if (g5 !== undefined && report.g5 !== g5)
		return `step ${step.step} ${step.action}: G5 is ${report.g5 ?? "not decided"}, ${trace.name} expects ${g5}`;
	return null;
}

/** Replays `trace` on the kernel with `store`, step by step, then judges its property; the store is closed. */
export function replayTrace(trace: FormalTrace, store: ReplayStore): ReplayReport {
	try {
		const kernel = new KernelTranslation(trace.human_acceptance, store);
		const steps = trace.steps.map((s) => kernel.run(s));
		const divergences = trace.steps.flatMap((s, i) => divergence(trace, s, steps[i]!) ?? []);
		const violation = propertyViolation(trace.property, store.state(), store.events(), trace.human_acceptance);
		return { trace: trace.name, property: trace.property, steps, divergences, violation };
	} finally {
		store.close();
	}
}
