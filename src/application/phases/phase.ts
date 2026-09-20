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
import type { ChangeCommand } from "../../domain/change/commands.ts";
import type { ArtifactKind, ChangeState } from "../../domain/change/state.ts";
import type { ActivePolicy } from "../../domain/policy.ts";
import type { InterventionMandate, WorkspacePolicy, WorkspacePort } from "../../ports/execution.ts";
import type { ArtifactRepository } from "../artifacts.ts";
import type { FeedbackSources } from "../context.ts";
import type { VerificationCoordinator } from "../verification.ts";

/** A change and the ledger revision it was read at: a commit that loses that race is refused. */
export interface Unit {
	state: ChangeState;
	revision: number;
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
export type PhaseInteraction = Exclude<HumanInteraction, "IH-03" | "IH-04" | "IH-05" | "IH-06" | "IH-09">;

export interface PhaseContext {
	/** What this change proposed and adopted, over the ledger and the object store. */
	readonly artifacts: ArtifactRepository;
	/** The protocol, the qualification of the sensors, and the evidence of a run. */
	readonly verification: VerificationCoordinator;
	readonly workspace: WorkspacePort;
	readonly workspacePolicy: WorkspacePolicy;
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
	runIntervention(unit: Unit, cor: string, role: InterventionMandate["role"], objective: string, workspacePath: string, extra: { adopted?: ArtifactKind[]; untrusted?: { source: string; text: string }[]; feedback?: string | null; attempt_id?: string | null }): Promise<InterventionOutcome>;
	/** Puts a decision to the human and stops the change on it. */
	requestDecision(unit: Unit, cor: string, interaction: PhaseInteraction, subject: SubjectRef, facts: string[], recommendation: string | null, arg?: string, decisionId?: string, language?: "fr" | "en"): Promise<Unit>;
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
export async function requestAdoption(ctx: PhaseContext, unit: Unit, cor: string, gate: "G0" | "G1", kind: "mandate" | "requirements", ref: ArtifactRef, language: "fr" | "en"): Promise<Unit> {
	const decided = unit.state.gates[gate];
	if (!decided || decided.next_action !== "request_decision:IH-02") return unit;
	const subject: SubjectRef = { kind: "artifact", id: ref.artifact_id, revision: ref.revision, digest: ref.content_digest };
	return ctx.requestDecision(unit, cor, "IH-02", subject, decided.reasons, null, kind, undefined, language);
}
