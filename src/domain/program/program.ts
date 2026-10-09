/**
 * Program scheduler (CMP-PRG) — the aggregate: objective, increments as a DAG, milestones and
 * hierarchical budgets.
 * Pure functions; eligibility is recomputed from dependencies and increment results (RM-005 to RM-009).
 */
import type { ActorRef, ArtifactRef, Verdict } from "../../contracts/v1/common.ts";
import { DomainError } from "../errors.ts";
import type { CodeAuthorship } from "../survey.ts";

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
	/** The gaps of the cited survey the increment removes. */
	gaps: GapKey[];
	/** The violated rules of the map of the cited migration the step removes; absent outside a migration. */
	removes?: string[];
	/** How the step of a migration moves from the old path to the new one; absent outside a migration. */
	transition?: Transition;
}

/**
 * The transition of a step of a migration, in the owner's words: the interfaces it preserves, where the old
 * and the new path live side by side, how compatibility is kept, and how the step is undone (ARC-03).
 */
export interface Transition {
	contract: string;
	coexistence: string;
	compatibility: string;
	rollback: string;
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

/**
 * A requirement the program as a whole answers for. Adoption requires each one carried by an increment,
 * verified by a milestone, or set aside by a scope decision that states its reason (PRG-03).
 */
export interface GlobalRequirement {
	requirement_id: string;
	scope_decision: { reason: string } | null;
}

/** A gap of a survey as an increment names it: a rule of the adopted referential, a module, and the code it lies in. */
export interface GapKey {
	rule_id: string;
	/** Null for the violations no measured source root holds. */
	module: string | null;
	authorship: CodeAuthorship;
}

/**
 * What tolerates a gap until a date: who answers for it, the last day it excuses the gap, and why. The
 * owner is a name the document gives, never an authenticated actor.
 */
export interface GapException {
	owner: string;
	/** The last day the exception tolerates its gap, as `YYYY-MM-DD`. */
	due: string;
	reason: string;
}

/**
 * A gap the cited survey counts: the threshold of its rule, its violations on the measured tree, the
 * scope decision that sets it aside with its reason, if any, and the exception that tolerates it, if any.
 * Adoption requires each one removed by an increment, set aside, or under an exception (QLT-03).
 */
export interface BaselineGap extends GapKey {
	threshold: string;
	violations: number;
	scope_decision: { reason: string } | null;
	/** Absent from a gap no exception tolerates, and from every gap adopted before exceptions existed. */
	exception?: GapException;
}

/** The accepted survey a trajectory starts from: the change that took it, the tree it measured and its gaps. */
export interface Baseline {
	change_id: string;
	reference_digest: string;
	gaps: BaselineGap[];
}

/** The alternative of the architecture recommendation of a survey its owner chose as the target of a migration. */
export interface MigrationTarget {
	alternative_id: string;
	nature: "keep" | "adjust" | "transform";
	description: string;
}

/**
 * A rule of the adopted architecture map the cited survey found broken, with its violations on the measured tree,
 * the scope decision that sets it aside with its reason, if any, and the exception that tolerates it, if any.
 * Adoption requires each one removed by a step, set aside, or under an exception (ARC-03).
 */
export interface MigrationGap {
	rule_id: string;
	violations: number;
	scope_decision: { reason: string } | null;
	exception?: GapException;
}

/** The accepted survey of the architecture a migration starts from: the change that took it, the tree it measured, the target its owner chose and the violated rules. */
export interface Migration {
	change_id: string;
	reference_digest: string;
	target: MigrationTarget;
	gaps: MigrationGap[];
}

/** A gap a survey of the integrated project counts, by rule, module and the code it lies in. */
interface MeasuredGap extends GapKey {
	violations: number;
}

/**
 * What the analysers of a measure controlled: each rule of its referential with the analyser and version
 * that checks it, the modules they read, and what they leave out with the reason.
 */
export interface ControlledPerimeter {
	rules: { rule_id: string; tool: string }[];
	modules: string[];
	unmeasured: { subject: string; reason: string }[];
}

/** The accepted survey of the integrated project a milestone is judged on, the gaps it counts, and its perimeter. */
export interface Measure {
	change_id: string;
	gaps: MeasuredGap[];
	perimeter: ControlledPerimeter;
}

/** What the verification of an adopted map covers: its parts, the control that checks it, and what it does not see. */
export interface MapPerimeter {
	parts: string[];
	tool: string;
	unseen: { en: string; fr: string }[];
}

/** The accepted survey of the integrated project a milestone of a migration is judged on, under the same map. */
export interface MapMeasure {
	change_id: string;
	/** The violations its architecture control counts, by rule of the map. */
	rules: { rule_id: string; violations: number }[];
	map: MapPerimeter;
}

export type ExceptionStanding = "current" | "expired" | "withdrawn";

/**
 * A gap or a violated rule as a measure judges it, with its count at the starting survey and on the
 * integrated project: removed when the measure no longer counts it, remaining when it still does,
 * tolerated while a current exception excuses it, appeared when the starting survey did not carry it,
 * set aside when a scope decision leaves it out of the verdict. Its exception is current until its due
 * date, expired after it, and withdrawn once its gap is gone.
 */
interface Judgement {
	outcome: "removed" | "remaining" | "tolerated" | "appeared" | "set_aside";
	surveyed: number;
	measured: number;
	exception?: GapException & { standing: ExceptionStanding };
}

export interface JudgedGap extends GapKey, Judgement {}

export interface JudgedRule extends Judgement {
	rule_id: string;
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
	/** The survey the gaps were judged on; absent from an evaluation taken without a measure. */
	measure?: { change_id: string; gaps: JudgedGap[]; perimeter: ControlledPerimeter };
	/**
	 * The survey the violated rules of a migration were judged on, and whether it counts no violation of any rule of
	 * the map; absent from an evaluation taken without one.
	 */
	map_measure?: { change_id: string; rules: JudgedRule[]; map: MapPerimeter; conforms: boolean };
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
	global_requirements: GlobalRequirement[];
	baseline: Baseline | null;
	/** Absent from a program adopted before a trajectory could cite a migration. */
	migration?: Migration | null;
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
			/** An adoption recorded before increments named gaps carries neither their gaps nor a baseline. */
			increments: (Omit<IncrementSpec, "gaps"> & { gaps?: GapKey[] })[];
			milestones: Milestone[];
			global_requirements: GlobalRequirement[];
			baseline?: Baseline | null;
			migration?: Migration | null;
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
	| (Base & {
			type: "trajectory.adopt";
			increments: IncrementSpec[];
			milestones: Milestone[];
			global_requirements: GlobalRequirement[];
			/** The survey the trajectory starts from, when it brings a project to standards. */
			baseline?: Baseline;
			/** The survey of the architecture and the target the trajectory starts from, when it migrates an architecture. */
			migration?: Migration;
			reason: string;
	  })
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
			/** The accepted survey of the integrated project; without one, no gap is measured. */
			measure?: Measure;
			/** The accepted survey of the integrated project under the map of a migration; without one, no rule is measured. */
			map_measure?: MapMeasure;
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
			global_requirements: [],
			baseline: null,
			migration: null,
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
					gaps: spec.gaps ?? [],
					status: old?.status ?? "planned",
					change_id: old?.change_id ?? null,
					result_note: old?.result_note ?? null,
				};
			});
			s.milestones = event.milestones;
			s.global_requirements = event.global_requirements;
			s.baseline = event.baseline ?? null;
			s.migration = event.migration ?? null;
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
			throw new Error(`unknown event ${JSON.stringify(never)}`);
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
				if (cycle) throw new DomainError("CYCLE_DETECTED", `dependency cycle: ${cycle.join(" -> ")} (RM-006)`);
				for (const inc of state.increments) {
					if ((inc.status === "accepted" || inc.status === "integrated") && !ids.has(inc.increment_id))
						throw new DomainError(
							"PRECONDITION_FAILED",
							`accepted increment ${inc.increment_id} cannot disappear from the trajectory; mark it abandoned explicitly`,
						);
				}
				for (const m of command.milestones)
					for (const id of m.increment_ids)
						if (!ids.has(id))
							throw new DomainError(
								"UNKNOWN_REFERENCE",
								`milestone ${m.milestone_id} references unknown increment ${id}`,
							);
				const unassigned = unassignedGlobalRequirements(command);
				if (unassigned.length > 0)
					throw new DomainError(
						"PRECONDITION_FAILED",
						unassigned
							.map(
								(rid) =>
									`global requirement ${rid} is assigned neither to an increment, nor to a milestone verification, nor to a scope decision`,
							)
							.join("; "),
					);
				checkGaps(command.increments, command.baseline ?? null, command.at);
				checkMigration(command.increments, command.migration ?? null, command.at);
				return {
					ok: true,
					events: [
						{
							type: "trajectory.adopted",
							...base,
							revision: state.trajectory_revision + 1,
							increments: command.increments,
							milestones: command.milestones,
							global_requirements: command.global_requirements,
							baseline: command.baseline ?? null,
							...(command.migration ? { migration: command.migration } : {}),
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
				const evaluation = evaluateMilestone(state, m, command);
				const events: ProgramEvent[] = [{ type: "milestone.evaluated", ...base, evaluation }];
				if (m.final && evaluation.verdict === "PASS")
					events.push({ type: "program.closed", ...base, reason: "final milestone passed" });
				return { ok: true, events };
			}
			case "program.close":
				return { ok: true, events: [{ type: "program.closed", ...base, reason: command.reason }] };
			default: {
				const never: never = command;
				throw new Error(`unknown command ${JSON.stringify(never)}`);
			}
		}
	} catch (error) {
		if (error instanceof DomainError) return { ok: false, error };
		throw error;
	}
}

/** The global requirements no increment carries, no milestone verifies and no reasoned scope decision sets aside. */
function unassignedGlobalRequirements(command: Extract<ProgramCommand, { type: "trajectory.adopt" }>): string[] {
	const carried = new Set([
		...command.increments.flatMap((i) => i.requirement_ids),
		...command.milestones.flatMap((m) => m.global_requirement_ids),
	]);
	return command.global_requirements
		.filter((r) => !carried.has(r.requirement_id) && !r.scope_decision?.reason.trim())
		.map((r) => r.requirement_id);
}

/** A gap a scope decision sets aside: only a decision that states its reason does. */
export function setAside<G extends { scope_decision: { reason: string } | null }>(
	gap: G,
): gap is G & { scope_decision: { reason: string } } {
	return Boolean(gap.scope_decision?.reason.trim());
}

export function sameGap(a: GapKey, b: GapKey): boolean {
	return a.rule_id === b.rule_id && a.module === b.module && a.authorship === b.authorship;
}

export function gapName(gap: GapKey): string {
	return `${gap.rule_id} in ${gap.module ?? "no measured module"}`;
}

/**
 * Refuses an increment that removes a gap the survey does not carry, or any gap when the trajectory
 * cites no survey, then an exception without an owner or a due date or already expired on the day of
 * the adoption, then every gap of the survey no increment removes, no reasoned scope decision sets
 * aside and no exception tolerates, naming each.
 */
function checkGaps(increments: readonly IncrementSpec[], baseline: Baseline | null, at: string): void {
	for (const inc of increments)
		for (const g of inc.gaps)
			if (!baseline?.gaps.some((b) => sameGap(b, g)))
				throw new DomainError(
					"UNKNOWN_REFERENCE",
					`increment ${inc.increment_id} removes ${gapName(g)} (${g.authorship} code), ${baseline ? "a gap the cited survey does not carry" : "a gap no cited survey carries"}`,
				);
	for (const b of baseline?.gaps ?? [])
		if (b.exception) checkException(`gap ${gapName(b)} (${b.authorship} code)`, b.exception, at);
	const unhandled = (baseline?.gaps ?? []).filter(
		(b) => !setAside(b) && !b.exception && !increments.some((i) => i.gaps.some((g) => sameGap(b, g))),
	);
	if (unhandled.length > 0)
		throw new DomainError(
			"PRECONDITION_FAILED",
			unhandled
				.map(
					(b) =>
						`gap ${gapName(b)} (${b.authorship} code, ${b.violations} violation${b.violations === 1 ? "" : "s"}) is removed by no increment and set aside by no scope decision`,
				)
				.join("; "),
		);
}

/**
 * Refuses a step that removes a rule the cited survey did not find broken, or any rule when the trajectory cites no
 * migration.
 */
function checkRemovedRules(increments: readonly IncrementSpec[], migration: Migration | null): void {
	for (const inc of increments)
		for (const rule of inc.removes ?? [])
			if (!migration?.gaps.some((g) => g.rule_id === rule))
				throw new DomainError(
					"UNKNOWN_REFERENCE",
					`increment ${inc.increment_id} removes ${rule}, ${migration ? "a violated rule the cited survey does not carry" : "a violated rule no cited migration carries"}`,
				);
}

/**
 * Refuses a step that removes a rule the cited survey did not find broken, or any rule when the trajectory cites no
 * migration, then an exception without an owner or a due date or already expired on the day of the adoption, then
 * every violated rule no step removes, no reasoned scope decision sets aside and no exception tolerates, naming each.
 */
function checkMigration(increments: readonly IncrementSpec[], migration: Migration | null, at: string): void {
	checkRemovedRules(increments, migration);
	for (const g of migration?.gaps ?? []) if (g.exception) checkException(`rule ${g.rule_id}`, g.exception, at);
	const unhandled = (migration?.gaps ?? []).filter(
		(g) => !setAside(g) && !g.exception && !increments.some((i) => i.removes?.includes(g.rule_id)),
	);
	if (unhandled.length > 0)
		throw new DomainError(
			"PRECONDITION_FAILED",
			unhandled
				.map(
					(g) =>
						`rule ${g.rule_id} (${g.violations} violation${g.violations === 1 ? "" : "s"}) is removed by no increment, set aside by no scope decision and tolerated by no exception`,
				)
				.join("; "),
		);
}

/** Refuses the exception on `subject` without an owner or a due date, or already expired on the day of the adoption. */
function checkException(subject: string, exception: GapException, at: string): void {
	const refused = (why: string) => new DomainError("PRECONDITION_FAILED", `exception on ${subject} ${why}`);
	if (!exception.owner.trim()) throw refused("has no owner");
	if (!exception.due.trim()) throw refused("has no due date");
	if (exception.due < day(at)) throw refused(`expired on ${exception.due}, before the adoption`);
}

/** The calendar day of an instant, as an exception's due date is written. */
function day(at: string): string {
	return at.slice(0, 10);
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

/**
 * The increment the program starts next: the first ready one in the order of the trajectory. Refused
 * while the program is closed, while another increment is active, or when none is ready.
 */
export function nextIncrement(state: ProgramState): IncrementState {
	if (state.closed) throw new DomainError("INVALID_TRANSITION", `program ${state.program_id} is closed`);
	const active = state.increments.find((i) => i.status === "active");
	if (active)
		throw new DomainError(
			"OPERATION_ACTIVE",
			`the program conducts one increment at a time: increment ${active.increment_id} is active on change ${active.change_id}`,
		);
	const ready = eligibleIncrements(state)[0];
	if (!ready) throw new DomainError("PRECONDITION_FAILED", `no increment of program ${state.program_id} is ready`);
	return ready;
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

/**
 * The violated rules of the migration of `state` milestone `m` judges: those one of its steps removes, those a scope
 * decision sets aside, and, on the final milestone, those an exception tolerates.
 */
function rulesOf(state: ProgramState, m: Milestone, removing: readonly IncrementSpec[]): MigrationGap[] {
	return (state.migration?.gaps ?? []).filter(
		(gap) => setAside(gap) || (m.final && gap.exception) || removing.some((i) => i.removes?.includes(gap.rule_id)),
	);
}

/**
 * The violated rules of the migration milestone `m` judges, on the map measure of `command`, and whether that measure
 * counts no violation of any rule of the map; without a measure, the rules it cannot verify on the integrated project.
 */
function judgeMigration(
	state: ProgramState,
	m: Milestone,
	removing: readonly IncrementSpec[],
	command: Extract<ProgramCommand, { type: "milestone.evaluate" }>,
): { mapMeasure: NonNullable<MilestoneEvaluation["map_measure"]> | null; unmeasured: string[] } {
	const rules = rulesOf(state, m, removing);
	if (!command.map_measure)
		return {
			mapMeasure: null,
			unmeasured: rules
				.filter((gap) => !setAside(gap))
				.map((gap) => `rule:${gap.rule_id}: not measured on the integrated project`),
		};
	return {
		mapMeasure: {
			change_id: command.map_measure.change_id,
			rules: judgeRules(rules, state.migration?.gaps ?? [], command.map_measure, day(command.at)),
			map: command.map_measure.map,
			conforms: command.map_measure.rules.every((r) => r.violations === 0),
		},
		unmeasured: [],
	};
}

/** Milestone verdict is recomputed from global obligations; it is never the sum of child statuses (RM-007, RM-008, PRG-05). */
function evaluateMilestone(
	state: ProgramState,
	m: Milestone,
	command: Extract<ProgramCommand, { type: "milestone.evaluate" }>,
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
		const v = command.global_verdicts[rid] ?? "NOT_RUN";
		if (v === "PASS") satisfied.push(`global:${rid}`);
		else if (v === "NOT_APPLICABLE") satisfied.push(`global:${rid}:not_applicable`);
		else if (v === "FAIL") remaining.push(`global:${rid}:FAIL`);
		else indeterminate.push(`global:${rid}:${v}`);
	}
	const removing = state.increments.filter((i) => m.increment_ids.includes(i.increment_id));
	// A gap no increment removes and an exception tolerates is the final milestone's to judge.
	const judged = (state.baseline?.gaps ?? []).filter(
		(gap) => setAside(gap) || (m.final && gap.exception) || removing.some((i) => i.gaps.some((g) => sameGap(g, gap))),
	);
	const measure = command.measure
		? {
				change_id: command.measure.change_id,
				gaps: judgeGaps(judged, state.baseline?.gaps ?? [], command.measure, day(command.at)),
				perimeter: command.measure.perimeter,
			}
		: null;
	// Without a measure, a gap one of its increments removes is not verified on the integrated project.
	if (!measure)
		for (const gap of judged)
			if (!setAside(gap))
				indeterminate.push(`gap:${gapName(gap)} (${gap.authorship} code): not measured on the integrated project`);
	const { mapMeasure, unmeasured } = judgeMigration(state, m, removing, command);
	indeterminate.push(...unmeasured);
	if (!command.integrated_digest && m.increment_ids.length > 0) indeterminate.push("integrated_candidate:missing");
	let verdict: Verdict;
	if (
		remaining.some((r) => r.endsWith(":FAIL")) ||
		[...(measure?.gaps ?? []), ...(mapMeasure?.rules ?? [])].some(
			(g) => g.outcome === "remaining" || g.outcome === "appeared",
		)
	)
		verdict = "FAIL";
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
		evaluated_at: command.at,
		integrated_digest: command.integrated_digest,
		...(measure ? { measure } : {}),
		...(mapMeasure ? { map_measure: mapMeasure } : {}),
	};
}

/**
 * Judges a gap or a violated rule the starting survey counted `gap.violations` times, which the measure taken
 * on `today` counts `now` times. A gap set aside stays out of the verdict; a gap under an exception is
 * tolerated until its due date, included.
 */
function judgement(gap: BaselineGap | MigrationGap, now: number, today: string): Judgement {
	const counts = { surveyed: gap.violations, measured: now };
	if (setAside(gap)) return { outcome: "set_aside", ...counts };
	if (!gap.exception) return { outcome: now > 0 ? "remaining" : "removed", ...counts };
	const standing = now === 0 ? "withdrawn" : today <= gap.exception.due ? "current" : "expired";
	const outcome = standing === "withdrawn" ? "removed" : standing === "current" ? "tolerated" : "remaining";
	return { outcome, ...counts, exception: { ...gap.exception, standing } };
}

/**
 * Judges each gap of the milestone on the measure taken on `today`, with its two counts, then names as
 * appeared each gap the measure counts that the starting survey did not carry.
 */
function judgeGaps(
	judged: readonly BaselineGap[],
	surveyed: readonly BaselineGap[],
	measure: Measure,
	today: string,
): JudgedGap[] {
	const counted = (gap: GapKey) => measure.gaps.find((g) => sameGap(g, gap))?.violations ?? 0;
	const key = (g: GapKey): GapKey => ({ rule_id: g.rule_id, module: g.module, authorship: g.authorship });
	return [
		...judged.map((gap): JudgedGap => ({ ...key(gap), ...judgement(gap, counted(gap), today) })),
		...measure.gaps
			.filter((g) => g.violations > 0 && !surveyed.some((b) => sameGap(b, g)))
			.map((g): JudgedGap => ({ ...key(g), outcome: "appeared", surveyed: 0, measured: g.violations })),
	];
}

/**
 * Judges each violated rule of the migration the milestone judges on the measure taken on `today`, with its two
 * counts, then names as appeared each rule of the map the measure counts broken that the starting survey did not.
 */
function judgeRules(
	judged: readonly MigrationGap[],
	surveyed: readonly MigrationGap[],
	measure: MapMeasure,
	today: string,
): JudgedRule[] {
	const counted = (rule: string) => measure.rules.find((r) => r.rule_id === rule)?.violations ?? 0;
	return [
		...judged.map((gap): JudgedRule => ({ rule_id: gap.rule_id, ...judgement(gap, counted(gap.rule_id), today) })),
		...measure.rules
			.filter((r) => r.violations > 0 && !surveyed.some((g) => g.rule_id === r.rule_id))
			.map((r): JudgedRule => ({ rule_id: r.rule_id, outcome: "appeared", surveyed: 0, measured: r.violations })),
	];
}
