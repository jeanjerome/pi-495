/**
 * Program scheduler (CMP-PRG) — the aggregate: objective, increments as a DAG, milestones and
 * hierarchical budgets.
 * Pure functions; eligibility is recomputed from dependencies and increment results (RM-005 to RM-009).
 */
import type { ActorRef, ArtifactRef, Verdict } from "../../contracts/v1/common.ts";
import { DomainError } from "../errors.ts";

export type IncrementStatus = "planned" | "ready" | "active" | "accepted" | "integrated" | "blocked" | "abandoned";
export type IncrementKind = "functional" | "preparatory" | "remediation";

export interface IncrementSpec {
	increment_id: string;
	title: string;
	kind: IncrementKind;
	value: string;
	depends_on: string[];
	required_capabilities: string[];
	requirement_ids: string[];
	closure_criterion: string;
}

export interface IncrementState extends IncrementSpec {
	status: IncrementStatus;
	change_id: string | null;
	result_note: string | null;
}

export interface Milestone {
	milestone_id: string;
	title: string;
	increment_ids: string[];
	global_requirement_ids: string[];
	final: boolean;
}

export interface MilestoneEvaluation {
	milestone_id: string;
	verdict: Verdict;
	satisfied: string[];
	remaining: string[];
	abandoned: string[];
	indeterminate: string[];
	evaluated_at: string;
	integrated_digest: string | null;
}

export interface ProgramState {
	schema_version: 1;
	program_id: string;
	project_path: string;
	objective: ArtifactRef;
	title: string;
	revision: number;
	trajectory_revision: number;
	increments: IncrementState[];
	milestones: Milestone[];
	milestone_evaluations: MilestoneEvaluation[];
	budgets: { max_increments: number; increments_started: number; program_ms: number; program_ms_used: number };
	closed: boolean;
	created_at: string;
	updated_at: string;
	last_actor: ActorRef | null;
}

interface Base {
	at: string;
	actor: ActorRef;
}

export type ProgramEvent =
	| (Base & {
			type: "program.created";
			program_id: string;
			project_path: string;
			objective: ArtifactRef;
			title: string;
			budgets: ProgramState["budgets"];
	  })
	| (Base & {
			type: "trajectory.adopted";
			revision: number;
			increments: IncrementSpec[];
			milestones: Milestone[];
			reason: string;
	  })
	| (Base & { type: "increment.bound"; increment_id: string; change_id: string })
	| (Base & { type: "increment.status"; increment_id: string; status: IncrementStatus; note: string | null })
	| (Base & { type: "milestone.evaluated"; evaluation: MilestoneEvaluation })
	| (Base & { type: "program.closed"; reason: string })
	| (Base & { type: "program.budget"; program_ms_used: number });

export type ProgramCommand =
	| (Base & {
			type: "program.create";
			program_id: string;
			project_path: string;
			objective: ArtifactRef;
			title: string;
			budgets?: Partial<ProgramState["budgets"]>;
	  })
	| (Base & { type: "trajectory.adopt"; increments: IncrementSpec[]; milestones: Milestone[]; reason: string })
	| (Base & { type: "increment.bind"; increment_id: string; change_id: string })
	| (Base & {
			type: "increment.result";
			increment_id: string;
			status: "accepted" | "integrated" | "blocked" | "abandoned" | "active" | "planned";
			note: string | null;
	  })
	| (Base & {
			type: "milestone.evaluate";
			milestone_id: string;
			global_verdicts: Record<string, Verdict>;
			integrated_digest: string | null;
	  })
	| (Base & { type: "program.close"; reason: string });

export type ProgramDecision = { ok: true; events: ProgramEvent[] } | { ok: false; error: DomainError };

export function applyProgram(state: ProgramState | null, event: ProgramEvent): ProgramState {
	if (event.type === "program.created") {
		return {
			schema_version: 1,
			program_id: event.program_id,
			project_path: event.project_path,
			objective: event.objective,
			title: event.title,
			revision: 1,
			trajectory_revision: 0,
			increments: [],
			milestones: [],
			milestone_evaluations: [],
			budgets: event.budgets,
			closed: false,
			created_at: event.at,
			updated_at: event.at,
			last_actor: event.actor,
		};
	}
	if (!state) throw new Error(`event ${event.type} before program.created`);
	const s: ProgramState = { ...state, revision: state.revision + 1, updated_at: event.at, last_actor: event.actor };
	switch (event.type) {
		case "trajectory.adopted": {
			const previous = new Map(state.increments.map((i) => [i.increment_id, i] as const));
			s.trajectory_revision = event.revision;
			s.increments = event.increments.map((spec) => {
				const old = previous.get(spec.increment_id);
				return {
					...spec,
					status: old?.status ?? "planned",
					change_id: old?.change_id ?? null,
					result_note: old?.result_note ?? null,
				};
			});
			s.milestones = event.milestones;
			return recomputeEligibility(s);
		}
		case "increment.bound":
			s.increments = s.increments.map((i) =>
				i.increment_id === event.increment_id ? { ...i, change_id: event.change_id, status: "active" } : i,
			);
			s.budgets = { ...s.budgets, increments_started: s.budgets.increments_started + 1 };
			return s;
		case "increment.status":
			s.increments = s.increments.map((i) =>
				i.increment_id === event.increment_id ? { ...i, status: event.status, result_note: event.note } : i,
			);
			return recomputeEligibility(s);
		case "milestone.evaluated":
			s.milestone_evaluations = [...s.milestone_evaluations, event.evaluation];
			return s;
		case "program.closed":
			s.closed = true;
			return s;
		case "program.budget":
			s.budgets = { ...s.budgets, program_ms_used: event.program_ms_used };
			return s;
		default: {
			const never: never = event;
			throw new Error(`unknown event ${(never as { type: string }).type}`);
		}
	}
}

export function replayProgram(events: readonly ProgramEvent[]): ProgramState {
	let s: ProgramState | null = null;
	for (const e of events) s = applyProgram(s, e);
	if (!s) throw new Error("empty program stream");
	return s;
}

export function decideProgram(state: ProgramState | null, command: ProgramCommand): ProgramDecision {
	const base = { at: command.at, actor: command.actor };
	try {
		if (command.type === "program.create") {
			if (state) throw new DomainError("PRECONDITION_FAILED", "program already exists");
			const budgets = {
				max_increments: 50,
				increments_started: 0,
				program_ms: 24 * 3600_000,
				program_ms_used: 0,
				...(command.budgets ?? {}),
			};
			return {
				ok: true,
				events: [
					{
						type: "program.created",
						...base,
						program_id: command.program_id,
						project_path: command.project_path,
						objective: command.objective,
						title: command.title,
						budgets,
					},
				],
			};
		}
		if (!state) throw new DomainError("UNKNOWN_REFERENCE", "program does not exist");
		if (state.closed && command.type !== "milestone.evaluate")
			throw new DomainError("INVALID_TRANSITION", "program is closed");
		if (command.actor.actor_type === "agent")
			throw new DomainError("POLICY_DENIED", "an agent cannot write the program");
		switch (command.type) {
			case "trajectory.adopt": {
				const ids = new Set<string>();
				for (const inc of command.increments) {
					if (ids.has(inc.increment_id))
						throw new DomainError("PRECONDITION_FAILED", `duplicate increment ${inc.increment_id}`);
					ids.add(inc.increment_id);
					if (!inc.closure_criterion.trim())
						throw new DomainError(
							"PRECONDITION_FAILED",
							`increment ${inc.increment_id} has no closure criterion (RM-005)`,
						);
				}
				for (const inc of command.increments)
					for (const d of inc.depends_on)
						if (!ids.has(d))
							throw new DomainError("UNKNOWN_REFERENCE", `increment ${inc.increment_id} depends on unknown ${d}`);
				const cycle = findCycle(command.increments);
				if (cycle)
					throw new DomainError("CYCLE_DETECTED", `dependency cycle: ${cycle.join(" -> ")} (RM-006)`, {
						nextActions: ["revise_trajectory"],
					});
				for (const inc of state.increments) {
					if ((inc.status === "accepted" || inc.status === "integrated") && !ids.has(inc.increment_id))
						throw new DomainError(
							"PRECONDITION_FAILED",
							`accepted increment ${inc.increment_id} cannot disappear from the trajectory; mark it abandoned explicitly`,
						);
				}
				const covered = new Set(command.increments.flatMap((i) => i.requirement_ids));
				for (const m of command.milestones) {
					for (const id of m.increment_ids)
						if (!ids.has(id))
							throw new DomainError(
								"UNKNOWN_REFERENCE",
								`milestone ${m.milestone_id} references unknown increment ${id}`,
							);
					for (const rid of m.global_requirement_ids)
						if (!covered.has(rid) && !m.global_requirement_ids.includes(rid))
							throw new DomainError(
								"PRECONDITION_FAILED",
								`global requirement ${rid} is neither assigned to an increment nor to a milestone control`,
							);
				}
				return {
					ok: true,
					events: [
						{
							type: "trajectory.adopted",
							...base,
							revision: state.trajectory_revision + 1,
							increments: command.increments,
							milestones: command.milestones,
							reason: command.reason,
						},
					],
				};
			}
			case "increment.bind": {
				const inc = state.increments.find((i) => i.increment_id === command.increment_id);
				if (!inc) throw new DomainError("UNKNOWN_REFERENCE", `unknown increment ${command.increment_id}`);
				if (inc.status !== "ready")
					throw new DomainError("PRECONDITION_FAILED", `increment ${inc.increment_id} is ${inc.status}, not ready`);
				if (state.increments.some((i) => i.status === "active"))
					throw new DomainError("OPERATION_ACTIVE", "P0 runs one producing increment at a time");
				if (state.budgets.increments_started >= state.budgets.max_increments)
					throw new DomainError("BUDGET_EXHAUSTED", "program increment budget exhausted");
				return {
					ok: true,
					events: [
						{ type: "increment.bound", ...base, increment_id: command.increment_id, change_id: command.change_id },
					],
				};
			}
			case "increment.result": {
				const inc = state.increments.find((i) => i.increment_id === command.increment_id);
				if (!inc) throw new DomainError("UNKNOWN_REFERENCE", `unknown increment ${command.increment_id}`);
				return {
					ok: true,
					events: [
						{
							type: "increment.status",
							...base,
							increment_id: command.increment_id,
							status: command.status,
							note: command.note,
						},
					],
				};
			}
			case "milestone.evaluate": {
				const m = state.milestones.find((x) => x.milestone_id === command.milestone_id);
				if (!m) throw new DomainError("UNKNOWN_REFERENCE", `unknown milestone ${command.milestone_id}`);
				const evaluation = evaluateMilestone(state, m, command.global_verdicts, command.integrated_digest, command.at);
				const events: ProgramEvent[] = [{ type: "milestone.evaluated", ...base, evaluation }];
				if (m.final && evaluation.verdict === "PASS")
					events.push({ type: "program.closed", ...base, reason: "final milestone passed" });
				return { ok: true, events };
			}
			case "program.close":
				return { ok: true, events: [{ type: "program.closed", ...base, reason: command.reason }] };
			default: {
				const never: never = command;
				throw new Error(`unknown command ${(never as { type: string }).type}`);
			}
		}
	} catch (error) {
		if (error instanceof DomainError) return { ok: false, error };
		throw error;
	}
}

/** Increment ready when every dependency is accepted or integrated; blocked dependencies only block descendants (RM-009, SA-007). */
function recomputeEligibility(state: ProgramState): ProgramState {
	const byId = new Map(state.increments.map((i) => [i.increment_id, i] as const));
	const done = (id: string) => {
		const s = byId.get(id)?.status;
		return s === "accepted" || s === "integrated";
	};
	const increments = state.increments.map((inc) => {
		if (inc.status !== "planned" && inc.status !== "ready") return inc;
		const eligible = inc.depends_on.every(done);
		return { ...inc, status: eligible ? "ready" : "planned" } as IncrementState;
	});
	return { ...state, increments };
}

export function eligibleIncrements(state: ProgramState): IncrementState[] {
	return state.increments.filter((i) => i.status === "ready");
}

/** Transitive dependents of an increment (those blocked when it is blocked). */
export function dependentsOf(state: ProgramState, incrementId: string): string[] {
	const out = new Set<string>();
	let changed = true;
	while (changed) {
		changed = false;
		for (const inc of state.increments) {
			if (out.has(inc.increment_id)) continue;
			if (inc.depends_on.includes(incrementId) || inc.depends_on.some((d) => out.has(d))) {
				out.add(inc.increment_id);
				changed = true;
			}
		}
	}
	return [...out];
}

/** Returns the located cycle as a path, or null. */
export function findCycle(increments: readonly IncrementSpec[]): string[] | null {
	const adj = new Map(increments.map((i) => [i.increment_id, i.depends_on] as const));
	const state = new Map<string, 0 | 1 | 2>();
	const stack: string[] = [];
	const visit = (id: string): string[] | null => {
		const st = state.get(id) ?? 0;
		if (st === 1) {
			const idx = stack.indexOf(id);
			return [...stack.slice(idx), id];
		}
		if (st === 2) return null;
		state.set(id, 1);
		stack.push(id);
		for (const d of adj.get(id) ?? []) {
			const c = visit(d);
			if (c) return c;
		}
		stack.pop();
		state.set(id, 2);
		return null;
	};
	for (const inc of increments) {
		const c = visit(inc.increment_id);
		if (c) return c;
	}
	return null;
}

/** Milestone verdict is recomputed from global obligations; it is never the sum of child statuses (RM-007, RM-008, PRG-05). */
function evaluateMilestone(
	state: ProgramState,
	m: Milestone,
	globalVerdicts: Record<string, Verdict>,
	integratedDigest: string | null,
	at: string,
): MilestoneEvaluation {
	const satisfied: string[] = [];
	const remaining: string[] = [];
	const abandoned: string[] = [];
	const indeterminate: string[] = [];
	for (const id of m.increment_ids) {
		const inc = state.increments.find((i) => i.increment_id === id);
		if (!inc) {
			remaining.push(`increment:${id}`);
			continue;
		}
		if (inc.status === "integrated" || inc.status === "accepted") satisfied.push(`increment:${id}`);
		else if (inc.status === "abandoned") abandoned.push(`increment:${id}`);
		else remaining.push(`increment:${id}`);
	}
	for (const rid of m.global_requirement_ids) {
		const v = globalVerdicts[rid] ?? "NOT_RUN";
		if (v === "PASS") satisfied.push(`global:${rid}`);
		else if (v === "NOT_APPLICABLE") satisfied.push(`global:${rid}:not_applicable`);
		else if (v === "FAIL") remaining.push(`global:${rid}:FAIL`);
		else indeterminate.push(`global:${rid}:${v}`);
	}
	if (!integratedDigest && m.increment_ids.length > 0) indeterminate.push("integrated_candidate:missing");
	let verdict: Verdict;
	if (remaining.some((r) => r.endsWith(":FAIL"))) verdict = "FAIL";
	else if (remaining.length > 0 || indeterminate.length > 0)
		verdict = remaining.length > 0 && indeterminate.length === 0 ? "NOT_RUN" : "INDETERMINATE";
	else verdict = "PASS";
	return {
		milestone_id: m.milestone_id,
		verdict,
		satisfied,
		remaining,
		abandoned,
		indeterminate,
		evaluated_at: at,
		integrated_digest: integratedDigest,
	};
}
