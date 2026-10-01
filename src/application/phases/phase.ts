/**
 * What a phase of a change may do.
 *
 * A phase reads the state it was handed, asks a collaborator for what it cannot compute itself, and
 * commits the result. This interface is the whole of its reach: a phase holds no store, no clock
 * and no identifier source of its own, it never addresses the ledger or the object store directly,
 * and nothing here writes a verdict — everything normative goes through `commit`, which runs the
 * domain reducer and appends what it accepts in one transaction (AT-01).
 */
import type { ArtifactRef, HumanInteraction, SubjectRef } from "../../contracts/v1/common.ts";
import type { Evidence } from "../../contracts/v1/evidence.ts";
import type { ControlDefinition } from "../../contracts/v1/protocol.ts";
import type { ChangeCommand } from "../../domain/change/commands.ts";
import { subjectOfChange, type ArtifactKind, type ChangeState } from "../../domain/change/state.ts";
import type { ActivePolicy } from "../../domain/policy.ts";
import type { InterventionMandate, WorkspacePolicy, WorkspacePort } from "../../ports/execution.ts";
import type { ArtifactRepository } from "../artifacts.ts";
import type { FeedbackSources } from "../context.ts";
import type { Adoptable } from "../decisions.ts";
import type { InstallRun } from "../installation.ts";
import type { VerificationCoordinator } from "../verification.ts";

/** A change and the ledger revision it was read at: a commit that loses that race is refused. */
export interface Unit {
	state: ChangeState;
	revision: number;
}

/** What an intervention is handed beyond its role, its objective and its workspace. */
export interface InterventionOptions {
	adopted?: ArtifactKind[];
	feedback?: string | null;
	attempt_id?: string | null;
	/** The controls this intervention is judged by, when they are not those of the latest protocol. */
	controls?: readonly ControlDefinition[];
}

/** What one bounded agent session left behind, and the change as it stands after it. */
export interface InterventionOutcome {
	unit: Unit;
	output: unknown;
	output_valid: boolean;
	result: "completed" | "failed" | "cancelled" | "truncated";
	intervention_id: string;
}

/** The human interactions a phase may open. The others belong to entry points, not to a phase. */
export type PhaseInteraction = Exclude<HumanInteraction, "IH-03" | "IH-05" | "IH-06" | "IH-09">;

/** What a decision put to the human says: the interaction, what it is about, and in which language. */
export interface DecisionOptions {
	interaction: PhaseInteraction;
	subject: SubjectRef;
	facts: string[];
	recommendation: string | null;
	arg?: string;
	decisionId?: string;
	language: "fr" | "en";
	adoptable?: Adoptable;
}

export interface PhaseContext {
	/** What this change proposed and adopted, over the ledger and the object store. */
	readonly artifacts: ArtifactRepository;
	/** The protocol, the qualification of the sensors, and the evidence of a run. */
	readonly verification: VerificationCoordinator;
	readonly workspace: WorkspacePort;
	readonly workspacePolicy: WorkspacePolicy;
	/** Runs an install command in a copy, with the network open for that step alone, writing `outside` when it is given. */
	install(copyPath: string, command: readonly string[], outside?: string): Promise<InstallRun>;
	/** The local repository Maven announces for a copy, asked offline, or null when it announces none. */
	localRepository(copyPath: string): Promise<string | null>;
	readonly policy: ActivePolicy;
	/** Applies the accepted candidate locally; absent when no integrator is configured. */
	readonly integrator: ((unit: Unit, cor: string) => Promise<Unit>) | null;
	now(): string;
	id(prefix: string): string;
	/** Says what is happening to whoever is watching. Never authoritative, never recorded. */
	progress(message: string): void;
	language(state: ChangeState): "fr" | "en";
	/** Runs the command through the domain reducer and appends what it accepts, atomically. */
	commit(unit: Unit, command: ChangeCommand, correlation: string): Unit;
	/** Composes the context of one bounded agent session, runs it, and records what it produced. */
	runIntervention(
		unit: Unit,
		cor: string,
		role: InterventionMandate["role"],
		objective: string,
		workspacePath: string,
		extra: InterventionOptions,
	): Promise<InterventionOutcome>;
	/** Puts a decision to the human and stops the change on it. */
	requestDecision(unit: Unit, cor: string, options: DecisionOptions): Promise<Unit>;
	/** The ledger and store reads the feedback document is composed from. */
	feedbackSources(): FeedbackSources;
	/** The indeterminate observations recorded on the frozen candidate, oldest first. */
	indeterminateObservations(state: ChangeState): Evidence[];
}

/**
 * A gate that asks for the human adoption of an artifact must be able to ask: the decision is
 * bound to the exact text presented, so a revised artifact is adopted again rather than inheriting
 * the approval of the one it replaced.
 */
export async function requestAdoption(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	gate: "G0" | "G1",
	kind: "mandate" | "requirements",
	ref: ArtifactRef,
	language: "fr" | "en",
): Promise<Unit> {
	const decided = unit.state.gates[gate];
	if (decided?.next_action !== "request_decision:IH-02") return unit;
	const subject: SubjectRef = {
		kind: "artifact",
		id: ref.artifact_id,
		revision: ref.revision,
		digest: ref.content_digest,
	};
	return ctx.requestDecision(unit, cor, {
		interaction: "IH-02",
		subject,
		facts: decided.reasons,
		recommendation: null,
		arg: kind,
		language,
	});
}

/**
 * Once the kernel stopped the change because no attempt is left, whether a correction or a first
 * attempt asked for it, the owner is asked to extend the budget (IH-07): the circuit breaker refuses
 * the attempt and leaves the decision to a human, instead of a stop only a cancellation ends. Any
 * other state is handed back as it is.
 */
export async function requestBudgetExtensionIfExhausted(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	facts: string[],
): Promise<Unit> {
	const { budgets, status, stop_reason } = unit.state;
	if (status !== "blocked" || stop_reason !== "attempts_exhausted") return unit;
	return ctx.requestDecision(unit, cor, {
		interaction: "IH-07",
		subject: subjectOfChange(unit.state),
		facts,
		recommendation: "stop",
		arg: `${budgets.attempts_used}/${budgets.max_attempts}`,
		language: ctx.language(unit.state),
	});
}
