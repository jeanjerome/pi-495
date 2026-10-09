/**
 * Application controller (CMP-APP): coordinates the use cases, opens units of work, calls the
 * ports and commits results. It never computes a verdict itself (AT-01): every normative change
 * goes through the domain reducer and is appended atomically to the ledger.
 *
 * What each phase needs done is asked of the component that owns it — the verification coordinator
 * for the protocol and the evidence, the target registry for what a stack offers, the review query
 * model for what a candidate shows, `phases/intervene.ts` for one bounded agent session. This module
 * wires those collaborators, creates a change, conducts it in the order of its phases and blocks it
 * on the failure of a step, and records what an entry point asks of it: a decision, a verification,
 * a pause, a resume, a cancellation, a question closed or revoked.
 */
import type { ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type {
	ActorRef,
	ArtifactRef,
	EnvironmentRef,
	HumanInteraction,
	Outcome,
	Phase,
	StopReason,
} from "../contracts/v1/common.ts";
import type { DecisionRequest, DecisionResponse, HumanDecision, HumanOrigin } from "../contracts/v1/decision.ts";
import type { Evidence } from "../contracts/v1/evidence.ts";
import type { Protocol, RequirementsDocument } from "../contracts/v1/protocol.ts";
import type { RecommendationProposal } from "../domain/architecture-recommendation.ts";
import { apply } from "../domain/change/apply.ts";
import type { ChangeCommand } from "../domain/change/commands.ts";
import { decide } from "../domain/change/decide.ts";
import {
	requestedLanguage,
	resumeLiftsStop,
	runningIntervention,
	subjectOfChange,
	unknownCost,
	type ChangeState,
	type Deliverable,
	type IntegrationState,
} from "../domain/change/state.ts";
import { DomainError, type DomainErrorCode } from "../domain/errors.ts";
import { unobservedEnd } from "../domain/imposed-layers.ts";
import type { ActivePolicy } from "../domain/policy.ts";
import {
	applyProgram,
	decideProgram,
	nextIncrement,
	type ProgramCommand,
	type ProgramEvent,
	type ProgramState,
} from "../domain/program/program.ts";
import type { Survey } from "../domain/survey.ts";
import type { LedgerPort } from "../ports/ledger.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import type {
	AgentContext,
	AgentPort,
	ControlExecutionPort,
	ModelSelection,
	SandboxSelection,
	WorkspacePolicy,
	WorkspacePort,
} from "../ports/execution.ts";
import { KERNEL_ACTOR } from "./actors.ts";
import { ArtifactRepository } from "./artifacts.ts";
import { InterventionSupervisor } from "./intervention.ts";
import { clarify } from "./phases/clarify.ts";
import { decide as decidePhase } from "./phases/decide.ts";
import { design } from "./phases/design.ts";
import { implement } from "./phases/implement.ts";
import { integrate } from "./phases/integrate.ts";
import { intervene } from "./phases/intervene.ts";
import type { DecisionOptions, PhaseContext, Unit } from "./phases/phase.ts";
import { prepare } from "./phases/prepare.ts";
import { review } from "./phases/review.ts";
import { specify } from "./phases/specify.ts";
import { verify as verifyPhase } from "./phases/verify.ts";
import { designVerification } from "./phases/verification-design.ts";
import type { FeedbackSources } from "./context.ts";
import { engineeringReport, type EngineeringReport } from "./report.ts";
import { baselineOf, measureOf, type CitedSurvey } from "./baseline.ts";
import { migrationOf } from "./migration.ts";
import { buildDecisionRequest } from "./decisions.ts";
import { askedOutsideDirectory, runInstall, type InstallRun } from "./installation.ts";
import type { Clock, IdSource } from "./ids.ts";
import type { InstallCapability } from "./stacks/plugin.ts";
import type { StackRegistry } from "./stacks/registry.ts";
import { VerificationCoordinator } from "./verification.ts";
import { statusView, type StatusView } from "./views.ts";
import { incrementRequest, readTrajectory } from "./trajectory.ts";
import { openReview as openReviewOf } from "./review.ts";

export interface HarnessDeps {
	ledger: LedgerPort;
	objects: ObjectStorePort;
	workspace: WorkspacePort;
	controls: ControlExecutionPort;
	/** The technologies the kernel detects a project with, in the order they claim one. */
	stacks: StackRegistry;
	agent: AgentPort;
	sandbox: SandboxSelection;
	clock: Clock;
	ids: IdSource;
	policy: ActivePolicy;
	workspacePolicy: WorkspacePolicy;
	environment: EnvironmentRef;
	/** The Pi session this harness writes for: the holder of the changes it conducts. */
	session: string;
	/** Called when a decision is requested (presentation hook, never authoritative). */
	onDecisionRequested?: (request: DecisionRequest) => void;
	onProgress?: (message: string) => void;
	/** Called with the context the working agent reports, then with `null` when its intervention ends. */
	onAgentContext?: (context: AgentContext | null) => void;
}

export interface StartArgs {
	project_path: string;
	request_text: string;
	title?: string;
	actor: ActorRef;
	language?: "fr" | "en";
	/** A candidate an agent writes, by default, or the state of the project measured on the reference. */
	deliverable?: Deliverable;
}

export interface AdoptArgs {
	project_path: string;
	/** The trajectory document as read, checked against its contract before anything is written. */
	trajectory: unknown;
	actor: ActorRef;
	language?: "fr" | "en";
}

export interface StartNextArgs {
	program_id: string;
	actor: ActorRef;
	language?: "fr" | "en";
}

export interface AdvanceResult {
	view: StatusView;
	steps: string[];
	stopped_because:
		| "closed"
		| "decision_required"
		| "blocked"
		| "paused"
		| "max_steps"
		| "cancelled"
		| "capability_missing";
}

/** Why a conduct stops on the change as it stands, or null while it has a step to run. */
function stopOf(s: ChangeState): AdvanceResult["stopped_because"] | null {
	if (s.phase === "closed") return s.status === "cancelled" ? "cancelled" : "closed";
	if (s.status === "decision_required") return "decision_required";
	if (s.status === "blocked") return s.stop_reason === "capability_missing" ? "capability_missing" : "blocked";
	if (s.status === "paused") return "paused";
	return null;
}

/**
 * How long a change stays held by a session that stopped renewing it. A live session renews it well
 * before then; past it, the session is taken for gone and another may conduct the change.
 */
const CHANGE_LEASE_MS = 60_000;

/** The phase a change is in decides what runs next; this table is the whole of that order. */
const PHASES: Partial<Record<Phase, (ctx: PhaseContext, unit: Unit, cor: string) => Promise<Unit>>> = {
	intake: clarify,
	scoping: clarify,
	specification: specify,
	qualification: designVerification,
	preparing: prepare,
	design: design,
	implementation: implement,
	verifying: verifyPhase,
	reviewing: review,
	deciding: decidePhase,
	integration: integrate,
};

/** What a change's close makes of the increment it conducts: a change rejected or cancelled blocks it. */
const INCREMENT_RESULTS: Record<Outcome, Extract<ProgramCommand, { type: "increment.result" }>["status"]> = {
	integrated: "integrated",
	accepted: "accepted",
	rejected: "blocked",
	abandoned: "blocked",
	pending: "active",
};

/** The reason a step's failure blocks the change under; any code not listed is an execution error. */
const BLOCK_REASONS: Partial<Record<DomainErrorCode, StopReason>> = {
	CAPABILITY_MISSING: "capability_missing",
	CONFIGURATION_ERROR: "configuration_error",
	POLICY_DENIED: "policy_denied",
};

/** What an answer does to the change once it is recorded, for an option that acts at once. */
type AnswerEffect = (
	response: DecisionResponse,
	answer: { actor: ActorRef; human_decision_id: string; now(): string },
) => ChangeCommand | null;

/** The interactions an answer acts on; any other answer is recorded and does nothing more. */
const ANSWER_EFFECTS: Partial<Record<HumanInteraction, AnswerEffect>> = {
	"IH-01": (response, { actor, now }) =>
		response.option_id === "abandon"
			? { type: "change.cancel", at: now(), actor, reason: "abandoned at clarification" }
			: null,
	"IH-10": (response, { human_decision_id, now }) =>
		response.option_id === "correct"
			? { type: "gate.evaluate", gate: "G5", at: now(), actor: KERNEL_ACTOR, decision_id: human_decision_id }
			: null,
	"IH-11": (response, { now }) =>
		response.option_id === "export_only" || response.option_id === "cancel"
			? {
					type: "change.block",
					at: now(),
					actor: KERNEL_ACTOR,
					reason: "policy_denied",
					detail: "integration declined by the change owner; the change stays accepted and exportable",
				}
			: null,
	"IH-02": (response, { now }) =>
		response.option_id === "refuse"
			? {
					type: "change.block",
					at: now(),
					actor: KERNEL_ACTOR,
					reason: "policy_denied",
					detail: `adoption refused by the change owner${response.free_text ? `: ${response.free_text}` : ""}`,
				}
			: null,
	"IH-07": (response, { now }) =>
		response.option_id === "stop"
			? {
					type: "change.block",
					at: now(),
					actor: KERNEL_ACTOR,
					reason: "attempts_exhausted",
					detail: "budget extension refused",
				}
			: null,
};

export class Harness {
	readonly deps: HarnessDeps;
	/** What the change proposed and adopted, over the ledger and the object store. */
	readonly artifacts: ArtifactRepository;
	/** Resolves the protocol, qualifies the sensors, runs the controls and produces the evidence. */
	private readonly verification: VerificationCoordinator;
	/** Drives one bounded agent session and reports what it observed. */
	private readonly interventions: InterventionSupervisor;
	/**
	 * The whole of what a phase may do, but open an intervention: that needs the model selected when
	 * it starts, which only the caller of `advance` can read.
	 */
	private readonly phase: Omit<PhaseContext, "runIntervention">;
	/** The changes this session holds: how many of its acts hold each, and the timer that renews it. */
	private readonly held = new Map<string, { acts: number; renewal: ReturnType<typeof setInterval> }>();
	constructor(deps: HarnessDeps) {
		this.deps = deps;
		const harness = this;
		this.artifacts = new ArtifactRepository({
			ledger: deps.ledger,
			objects: deps.objects,
			now: () => harness.now(),
			installedDependencies: () => deps.stacks.installedDependencies(),
		});
		this.verification = new VerificationCoordinator({
			controls: deps.controls,
			workspace: deps.workspace,
			workspacePolicy: deps.workspacePolicy,
			objects: deps.objects,
			ledger: deps.ledger,
			environment: deps.environment,
			policy: deps.policy,
			now: () => harness.now(),
			id: (prefix: string) => harness.id(prefix),
			readArtifact<T>(ref: { artifact_id: string; revision: number }): Promise<T> {
				return harness.artifacts.read<T>(ref);
			},
			storedFiles: (indexId: string) => harness.artifacts.storedFiles(indexId),
			progress: (message: string) => harness.progress(message),
		});
		this.phase = {
			artifacts: this.artifacts,
			verification: this.verification,
			workspace: deps.workspace,
			workspacePolicy: deps.workspacePolicy,
			stacks: deps.stacks,
			install: (copyPath: string, command: readonly string[], install: InstallCapability, outside?: string) =>
				deps.sandbox.qualification.qualified
					? runInstall(deps.sandbox.backend, copyPath, command, install, outside)
					: Promise.resolve<InstallRun>({
							kind: "failed",
							reason: `sandbox backend ${deps.sandbox.backend.backend} is not qualified: ${deps.sandbox.qualification.reasons.join("; ")}`,
						}),
			outsideDirectory: async (copyPath: string, install: InstallCapability) => {
				if (!deps.sandbox.qualification.qualified) return null;
				const said = await askedOutsideDirectory(deps.sandbox.backend, install, copyPath);
				return "path" in said ? said.path : null;
			},
			policy: deps.policy,
			get integrator() {
				return harness.integrator;
			},
			now: () => harness.now(),
			id: (prefix: string) => harness.id(prefix),
			progress: (message: string) => harness.progress(message),
			language: (state: ChangeState) => harness.language(state),
			commit: (unit: Unit, command: ChangeCommand, correlation: string) => harness.commit(unit, command, correlation),
			requestDecision: (unit, cor, options) => harness.requestDecision(unit, cor, options),
			feedbackSources: () => harness.feedbackSources(),
			indeterminateObservations: (state: ChangeState) => harness.indeterminateObservations(state),
		};
		this.interventions = new InterventionSupervisor({
			agent: deps.agent,
			sandbox: deps.sandbox,
			policy: deps.policy,
			now: () => harness.now(),
			progress: (message: string) => harness.progress(message),
			agentContext: (context: AgentContext | null) => harness.deps.onAgentContext?.(context),
			technologyEnv: (workspacePath: string) => deps.stacks.workspaceOf(workspacePath).env ?? [],
		});
	}

	/** Cancels the intervention currently supervised, if any (§12.3). */
	async abortCurrent(reason: string): Promise<boolean> {
		return this.interventions.abortCurrent(reason);
	}

	// --- helpers -----------------------------------------------------------------------------------

	now(): string {
		return this.deps.clock.now();
	}
	id(prefix: string): string {
		return this.deps.ids.next(prefix);
	}
	private progress(message: string): void {
		this.deps.onProgress?.(message);
	}

	/**
	 * Takes the change for this session, or refuses before anything is written while another session
	 * holds it (§12.1: one producer per change). An act of this session made while another of its acts
	 * holds the change shares that hold. A lease whose holder stopped renewing it is taken.
	 */
	private take(changeId: string): () => void {
		const holding = this.held.get(changeId);
		if (holding) {
			holding.acts++;
			return () => this.loosen(changeId);
		}
		const scope = `change:${changeId}`;
		if (!this.deps.ledger.acquireLease(scope, this.deps.session, CHANGE_LEASE_MS, this.now())) {
			const other = this.deps.ledger.getLease(scope);
			throw new DomainError(
				"OPERATION_ACTIVE",
				`another Pi session conducts change ${changeId} and renews its hold while it runs; if that session is gone, the change is free at ${other?.expires_at ?? this.now()} at the latest`,
			);
		}
		const renewal = setInterval(() => {
			try {
				this.deps.ledger.heartbeatLease(scope, this.deps.session, CHANGE_LEASE_MS, this.now());
			} catch {
				// The journal closed under the session: the lease is left to expire, which frees the change.
				clearInterval(renewal);
			}
		}, CHANGE_LEASE_MS / 3);
		renewal.unref();
		this.held.set(changeId, { acts: 1, renewal });
		return () => this.loosen(changeId);
	}

	/** Ends one act's hold on the change, and gives the change back once no act of this session holds it. */
	private loosen(changeId: string): void {
		const holding = this.held.get(changeId);
		if (!holding || --holding.acts > 0) return;
		clearInterval(holding.renewal);
		this.held.delete(changeId);
		this.deps.ledger.releaseLease(`change:${changeId}`, this.deps.session);
	}

	/** Runs an act that writes on the change, holding it for this session while it runs. */
	private holdWhile<T>(changeId: string, act: () => T): T {
		const release = this.take(changeId);
		try {
			return act();
		} finally {
			release();
		}
	}

	/**
	 * Runs `work` holding the change for this session, so that an act and the conduct that follows it
	 * are not split by another session's act.
	 */
	async conducting<T>(changeId: string, work: () => Promise<T>): Promise<T> {
		const release = this.take(changeId);
		try {
			return await work();
		} finally {
			release();
		}
	}

	private load(changeId: string): Unit {
		const loaded = this.deps.ledger.loadChange(changeId);
		if (!loaded) throw new DomainError("UNKNOWN_REFERENCE", `change ${changeId} does not exist`);
		return loaded;
	}

	/** Whether the journal still names this session as the one conducting the change. */
	private holds(changeId: string): boolean {
		return this.deps.ledger.getLease(`change:${changeId}`)?.owner === this.deps.session;
	}

	/**
	 * Applies one command through the reducer and commits its events atomically, if this session still
	 * holds the change: a session whose lease expired and was taken over writes nothing more on it.
	 */
	commit(unit: Unit, command: ChangeCommand, correlation: string): Unit {
		if (!this.holds(unit.state.change_id))
			throw new DomainError(
				"OPERATION_ACTIVE",
				`this Pi session no longer holds change ${unit.state.change_id}: another session conducts it`,
			);
		const d = decide(unit.state, command, this.deps.policy);
		if (!d.ok) throw d.error;
		if (d.events.length === 0) return unit;
		const receipt = this.deps.ledger.appendChange(unit.state.change_id, unit.revision, d.events, {
			correlation_id: correlation,
		});
		let state = unit.state;
		for (const e of d.events) state = apply(state, e);
		if (unit.state.phase !== "closed" && state.phase === "closed") this.recordIncrementResult(state, correlation);
		return { state, revision: receipt.revision };
	}

	/**
	 * Writes the result of a closed change to the increment it conducts, then re-evaluates each milestone
	 * that holds the increment on the latest integration of the program (PRG-05): the program judges the
	 * integrated project, never the sum of the closures. No global verification runs yet, so a milestone
	 * that carries one stays unpassed.
	 */
	private recordIncrementResult(change: ChangeState, correlation: string): void {
		const program = this.deps.ledger.loadProgram(change.program_id)?.state;
		const increment = program?.increments.find((i) => i.change_id === change.change_id && i.status === "active");
		if (!program || !increment) return;
		const at = this.now();
		const integrated = this.latestIntegration(program.program_id)?.receipt_digest ?? null;
		this.commitProgram(
			program.program_id,
			[
				{
					type: "increment.result",
					at,
					actor: KERNEL_ACTOR,
					increment_id: increment.increment_id,
					status: INCREMENT_RESULTS[change.outcome],
					note: `change ${change.change_id} closed ${change.outcome}`,
				},
				...program.milestones
					.filter((m) => m.increment_ids.includes(increment.increment_id))
					.map(
						(m): ProgramCommand => ({
							type: "milestone.evaluate",
							at,
							actor: KERNEL_ACTOR,
							milestone_id: m.milestone_id,
							global_verdicts: {},
							integrated_digest: integrated,
						}),
					),
			],
			correlation,
		);
	}

	/** The latest integration of a change of the program that left a receipt, or null before any. */
	private latestIntegration(programId: string): IntegrationState | null {
		const integrated = this.deps.ledger.listChanges(programId).filter((c) => c.outcome === "integrated");
		for (const c of integrated.reverse()) {
			const integration = this.deps.ledger.loadChange(c.change_id)?.state.integration;
			if (integration?.receipt_digest) return integration;
		}
		return null;
	}

	private tryCommit(
		unit: Unit,
		command: ChangeCommand,
		correlation: string,
	): { unit: Unit; error: DomainError | null } {
		try {
			return { unit: this.commit(unit, command, correlation), error: null };
		} catch (error) {
			if (error instanceof DomainError) return { unit, error };
			throw error;
		}
	}

	/**
	 * Decides the commands one after the other on the program as it stands, then appends all their events
	 * at once: a command the kernel refuses leaves the program as it was, or unwritten.
	 */
	private commitProgram(programId: string, commands: readonly ProgramCommand[], correlation: string): ProgramState {
		const loaded = this.deps.ledger.loadProgram(programId);
		let state = loaded?.state ?? null;
		const events: ProgramEvent[] = [];
		for (const command of commands) {
			const d = decideProgram(state, command);
			if (!d.ok) throw d.error;
			for (const e of d.events) state = applyProgram(state, e);
			events.push(...d.events);
		}
		this.deps.ledger.appendProgram(programId, loaded?.revision ?? 0, events, { correlation_id: correlation });
		return this.deps.ledger.loadProgram(programId)!.state;
	}

	/** The ledger and store reads the feedback document is composed from. */
	private feedbackSources(): FeedbackSources {
		return {
			getEvidence: (evidenceId: string) => this.deps.ledger.getEvidence(evidenceId),
			readBytes: (ref, range) => this.deps.objects.get(ref, range),
			max_bytes: this.deps.policy.budgets.feedback_bytes,
		};
	}

	/** The mandate's language once G0 recorded it, and the one the change was started in before. */
	private language(state: ChangeState): "fr" | "en" {
		return state.mandate?.language ?? requestedLanguage(state) ?? "fr";
	}

	/**
	 * The reference of the project at `projectPath`, captured without what the owner's configuration excludes
	 * nor what the tools of its technology write into a copy: the reference records both, and every candidate
	 * of the change is observed without them. It records where every technology of the list installs dependencies
	 * too.
	 */
	private async captureReference(projectPath: string): Promise<ReferenceSnapshot> {
		return await this.deps.workspace.captureReference(
			projectPath,
			this.deps.stacks.copyPolicyOf(projectPath, this.deps.workspacePolicy),
		);
	}

	// --- program creation (PF-01) ----------------------------------------------------------------

	async start(args: StartArgs): Promise<{ program: ProgramState; change: ChangeState }> {
		const cor = this.id("cor");
		const at = this.now();
		this.progress("capturing the reference");
		const reference = await this.captureReference(args.project_path);
		const programId = this.id("prg");
		const changeId = this.id("chg");
		const incrementId = "inc_1";
		const requestRef = await this.artifacts.store(
			"request",
			changeId,
			this.id("req"),
			args.request_text,
			args.actor.actor_id,
		);
		const title = args.title ?? args.request_text.split("\n")[0]!.slice(0, 80);
		this.commitProgram(
			programId,
			[
				{
					type: "program.create",
					at,
					actor: args.actor,
					program_id: programId,
					project_path: reference.project_path,
					objective: requestRef,
					title,
				},
				{
					type: "trajectory.adopt",
					at,
					actor: args.actor,
					increments: [
						{
							increment_id: incrementId,
							title,
							kind: "functional",
							value: title,
							depends_on: [],
							required_capabilities: [],
							requirement_ids: [],
							closure_criterion: "change accepted at G5",
							gaps: [],
						},
					],
					milestones: [],
					global_requirements: [],
					reason: "initial single-increment trajectory",
				},
			],
			cor,
		);
		return this.openIncrementChange({
			programId,
			incrementId,
			changeId,
			requestRef,
			reference,
			actor: args.actor,
			language: args.language,
			deliverable: args.deliverable ?? "candidate",
			at,
			cor,
		});
	}

	/**
	 * Creates a program from the trajectory document the owner wrote, adopts the trajectory, and starts
	 * the change of its first ready increment. The document is kept in the object store as the program's
	 * objective. A trajectory that cites a survey starts from the gaps read in that survey's dossier; one that
	 * cites a migration, from the target its owner chose and the violations of its map read in that dossier. A
	 * trajectory the kernel refuses writes neither the program nor a change.
	 */
	async adopt(args: AdoptArgs): Promise<{ program: ProgramState; change: ChangeState }> {
		const trajectory = readTrajectory(args.trajectory);
		const cor = this.id("cor");
		const at = this.now();
		this.progress("capturing the reference");
		const reference = await this.captureReference(args.project_path);
		const baseline = trajectory.baseline
			? baselineOf(
					await this.citedSurvey(trajectory.baseline.change_id),
					reference.project_path,
					trajectory.baseline.scope_decisions,
					trajectory.baseline.exceptions,
				)
			: null;
		const migration = trajectory.migration
			? migrationOf(
					await this.citedSurvey(trajectory.migration.change_id),
					reference.project_path,
					trajectory.migration.scope_decisions,
					trajectory.migration.exceptions,
				)
			: null;
		const programId = this.id("prg");
		const changeId = this.id("chg");
		const objective = await this.artifacts.store(
			"trajectory",
			changeId,
			this.id("trj"),
			trajectory.document,
			args.actor.actor_id,
		);
		const program = this.commitProgram(
			programId,
			[
				{
					type: "program.create",
					at,
					actor: args.actor,
					program_id: programId,
					project_path: reference.project_path,
					objective,
					title: trajectory.document.title,
				},
				{
					type: "trajectory.adopt",
					at,
					actor: args.actor,
					increments: trajectory.increments,
					milestones: trajectory.milestones,
					global_requirements: trajectory.global_requirements,
					...(baseline ? { baseline } : {}),
					...(migration ? { migration } : {}),
					reason: "trajectory adopted by the owner",
				},
			],
			cor,
		);
		const first = nextIncrement(program);
		const language = args.language ?? "fr";
		const requestRef = await this.artifacts.store(
			"request",
			changeId,
			this.id("req"),
			incrementRequest(first, language, program.baseline, program.migration ?? null),
			args.actor.actor_id,
		);
		return this.openIncrementChange({
			programId,
			incrementId: first.increment_id,
			changeId,
			requestRef,
			reference,
			actor: args.actor,
			language,
			deliverable: "candidate",
			at,
			cor,
		});
	}

	/** What the dossier of the change a trajectory cites holds of its survey. */
	private async citedSurvey(changeId: string): Promise<CitedSurvey> {
		const change = this.deps.ledger.loadChange(changeId)?.state ?? null;
		const survey = change ? ((await this.artifacts.latest<Survey>(change, "survey"))?.content ?? null) : null;
		const reference = change ? (await this.artifacts.latest<ReferenceSnapshot>(change, "reference"))?.content : null;
		return {
			change_id: changeId,
			change,
			surveyed_path: change ? (this.deps.ledger.loadProgram(change.program_id)?.state.project_path ?? null) : null,
			protocol: change ? ((await this.artifacts.latest<Protocol>(change, "protocol"))?.content ?? null) : null,
			survey,
			reported_findings: Object.fromEntries(
				(survey?.controls ?? []).flatMap((c) => {
					const counted = this.deps.ledger.getEvidence(c.evidence_id)?.facts.findings;
					return typeof counted === "number" ? [[c.control_id, counted]] : [];
				}),
			),
			reference_commit: reference?.kind === "git_clean_head" ? reference.head_commit : null,
			recommendation: change
				? await this.artifacts.latest<RecommendationProposal>(change, "architecture_recommendation")
				: null,
		};
	}

	/**
	 * Judges each milestone of the program on the accepted survey of the integrated project that the change
	 * `change_id` took, on the day it is asked. The survey is read from its dossier and nothing is run: it
	 * must measure the program's project on the tree of its latest integration, under the referential of
	 * the survey the program starts from. A program that cites no survey, or is closed, is refused.
	 */
	async measure(args: { program_id: string; change_id: string; actor: ActorRef }): Promise<ProgramState> {
		const program = this.deps.ledger.loadProgram(args.program_id)?.state;
		if (!program) throw new DomainError("UNKNOWN_REFERENCE", `program ${args.program_id} does not exist`);
		if (!program.baseline)
			throw new DomainError("PRECONDITION_FAILED", `program ${program.program_id} cites no survey to measure against`);
		if (program.closed) throw new DomainError("INVALID_TRANSITION", `program ${program.program_id} is closed`);
		const integration = this.latestIntegration(program.program_id);
		const measure = measureOf(
			await this.citedSurvey(args.change_id),
			await this.citedSurvey(program.baseline.change_id),
			program.project_path,
			integration?.destination_after ?? null,
		);
		const at = this.now();
		return this.commitProgram(
			program.program_id,
			program.milestones.map(
				(m): ProgramCommand => ({
					type: "milestone.evaluate",
					at,
					actor: args.actor,
					milestone_id: m.milestone_id,
					global_verdicts: {},
					integrated_digest: integration?.receipt_digest ?? null,
					measure,
				}),
			),
			this.id("cor"),
		);
	}

	/**
	 * Starts the change of the program's next ready increment, on the project as it stands: once an
	 * increment is integrated, the next one starts from the tree that carries it.
	 */
	async startNext(args: StartNextArgs): Promise<{ program: ProgramState; change: ChangeState }> {
		const program = this.deps.ledger.loadProgram(args.program_id)?.state;
		if (!program) throw new DomainError("UNKNOWN_REFERENCE", `program ${args.program_id} does not exist`);
		const increment = nextIncrement(program);
		const cor = this.id("cor");
		const at = this.now();
		this.progress("capturing the reference");
		const reference = await this.captureReference(program.project_path);
		const changeId = this.id("chg");
		const language = args.language ?? "fr";
		const requestRef = await this.artifacts.store(
			"request",
			changeId,
			this.id("req"),
			incrementRequest(increment, language, program.baseline, program.migration ?? null),
			args.actor.actor_id,
		);
		return this.openIncrementChange({
			programId: program.program_id,
			incrementId: increment.increment_id,
			changeId,
			requestRef,
			reference,
			actor: args.actor,
			language,
			deliverable: "candidate",
			at,
			cor,
		});
	}

	/** Binds the increment to a new change, then creates that change on the reference, its request already stored. */
	private async openIncrementChange(o: {
		programId: string;
		incrementId: string;
		changeId: string;
		requestRef: ArtifactRef;
		reference: ReferenceSnapshot;
		actor: ActorRef;
		language: "fr" | "en" | undefined;
		deliverable: Deliverable;
		at: string;
		cor: string;
	}): Promise<{ program: ProgramState; change: ChangeState }> {
		const { changeId, at, cor } = o;
		const referenceRef = await this.artifacts.store(
			"reference",
			changeId,
			this.id("ref"),
			o.reference,
			KERNEL_ACTOR.actor_id,
		);
		const program = this.commitProgram(
			o.programId,
			[{ type: "increment.bind", at, actor: KERNEL_ACTOR, increment_id: o.incrementId, change_id: changeId }],
			cor,
		);
		return this.holdWhile(changeId, () => {
			const d = decide(
				null,
				{
					type: "change.create",
					at,
					actor: o.actor,
					change_id: changeId,
					program_id: o.programId,
					increment_id: o.incrementId,
					request: o.requestRef,
					reference: {
						reference_id: o.reference.reference_id,
						kind: o.reference.kind,
						digest: o.reference.tree_digest,
					},
					environment_digest: this.deps.environment.digest,
					deliverable: o.deliverable,
				},
				this.deps.policy,
			);
			if (!d.ok) throw d.error;
			const receipt = this.deps.ledger.appendChange(changeId, 0, d.events, { correlation_id: cor });
			let state: ChangeState | null = null;
			for (const e of d.events) state = apply(state, e);
			if (!state) throw new DomainError("INVALID_TRANSITION", "change.create produced no change state");
			let unit: Unit = { state, revision: receipt.revision };
			unit = this.commit(
				unit,
				{ type: "artifact.propose", at, actor: KERNEL_ACTOR, kind: "reference", ref: referenceRef },
				cor,
			);
			if (o.language)
				unit = this.commit(
					unit,
					{
						type: "question.open",
						at,
						actor: KERNEL_ACTOR,
						id: "language",
						question: `language:${o.language}`,
						material: false,
						decision_id: null,
					},
					cor,
				);
			return { program, change: unit.state };
		});
	}

	status(changeId: string): StatusView {
		const loaded = this.deps.ledger.loadChange(changeId);
		if (!loaded) return statusView(null, null, [`change ${changeId} not found`]);
		const program = this.deps.ledger.loadProgram(loaded.state.program_id)?.state ?? null;
		return statusView(program, loaded.state, [
			`sandbox:${this.deps.sandbox.backend.backend}:${this.deps.sandbox.qualification.qualified ? "qualified" : "not-qualified"}`,
		]);
	}

	/**
	 * The engineer's report on a change (IMP-05): measured, concluded and unestablished, kept apart.
	 * Built from the ledger only, so interrupting the change does not cost the reader its content.
	 */
	async report(changeId: string): Promise<EngineeringReport> {
		const loaded = this.deps.ledger.loadChange(changeId);
		if (!loaded) throw new DomainError("UNKNOWN_REFERENCE", `change ${changeId} not found`);
		const protocol = await this.artifacts.latest<Protocol>(loaded.state, "protocol").catch(() => null);
		// Only what G1 adopted: a proposal it refused is not the change's requirements.
		const adoptedRef = loaded.state.adopted.requirements?.ref;
		const requirements = adoptedRef
			? await this.artifacts.read<RequirementsDocument>(adoptedRef).catch(() => null)
			: null;
		const survey = await this.artifacts.latest<Survey>(loaded.state, "survey").catch(() => null);
		const recommendation = await this.artifacts
			.latest<RecommendationProposal>(loaded.state, "architecture_recommendation")
			.catch(() => null);
		const program = this.deps.ledger.loadProgram(loaded.state.program_id)?.state;
		return engineeringReport(
			loaded.state,
			this.deps.ledger.listEvidence(changeId),
			protocol?.content ?? null,
			requirements,
			survey?.content ?? null,
			program?.increments.find((i) => i.increment_id === loaded.state.increment_id)?.title,
			recommendation,
		);
	}

	// --- conduct loop ----------------------------------------------------------------------------

	/**
	 * `readModel` returns the model Pi holds as selected, with its thinking level. It is called once as
	 * each intervention starts, so a model selected between two interventions is the one the next runs
	 * with (AGT-07).
	 */
	async advance(
		changeId: string,
		options: { max_steps?: number; actor?: ActorRef; readModel: () => ModelSelection },
	): Promise<AdvanceResult> {
		return this.conducting(changeId, () => this.conduct(changeId, options));
	}

	/** Runs the change through its phases until it stops, under the hold `advance` took. */
	private async conduct(
		changeId: string,
		options: { max_steps?: number; actor?: ActorRef; readModel: () => ModelSelection },
	): Promise<AdvanceResult> {
		const steps: string[] = [];
		const max = options.max_steps ?? 12;
		const phaseContext: PhaseContext = {
			...this.phase,
			runIntervention: (unit, cor, role, objective, workspacePath, extra) =>
				intervene(
					{
						artifacts: this.artifacts,
						interventions: this.interventions,
						objects: this.deps.objects,
						commit: this.phase.commit,
						now: this.phase.now,
						id: this.phase.id,
						language: this.phase.language,
					},
					options.readModel,
					unit,
					cor,
					role,
					objective,
					workspacePath,
					extra,
				),
		};
		let unit = this.load(changeId);
		for (let i = 0; i < max; i++) {
			const s = unit.state;
			const stop = stopOf(s);
			if (stop) return this.result(unit, steps, stop);
			const cor = this.id("cor");
			try {
				const phase = PHASES[s.phase];
				if (!phase) return this.result(unit, steps, "blocked");
				unit = await phase(phaseContext, unit, cor);
				steps.push(`${s.phase} -> ${unit.state.phase}/${unit.state.status}`);
			} catch (error) {
				if (error instanceof DomainError) {
					// A session that lost the change to another writes nothing on it, not even its own block.
					if (!this.holds(changeId)) throw error;
					steps.push(`${s.phase}: ${error.code} ${error.message}`);
					// The failing step commits before it throws, so `unit` holds a stale revision: writing
					// the block against it loses the optimistic-concurrency race and the change silently
					// reappears ready, redoing the work that just failed.
					const current = this.deps.ledger.loadChange(changeId) ?? unit;
					// A pause, or what another live session writes — its block, then a revocation — commits under
					// the step, whose next commit then conflicts: that act is the latest on the change, and
					// blocking over it would replace the pause, the decision or the stop it left with this step's
					// failure. Any other failure is the step's own.
					const stopped = error.code === "REVISION_CONFLICT" ? stopOf(current.state) : null;
					if (stopped) return this.result(current, steps, stopped);
					// The action the error names is of no use to anyone unless the block records that it can
					// be retried and says so where the operator reads the change.
					const detail = error.toText();
					const blocked = this.tryCommit(
						current,
						{
							type: "change.block",
							at: this.now(),
							actor: KERNEL_ACTOR,
							reason: BLOCK_REASONS[error.code] ?? "execution_error",
							detail,
							retryable: error.retryable,
						},
						cor,
					);
					unit = blocked.unit;
					if (blocked.error)
						steps.push(`${s.phase}: the change could not be blocked: ${blocked.error.code} ${blocked.error.message}`);
					return this.result(unit, steps, error.code === "CAPABILITY_MISSING" ? "capability_missing" : "blocked");
				}
				throw error;
			}
		}
		return this.result(unit, steps, "max_steps");
	}

	private result(unit: Unit, steps: string[], why: AdvanceResult["stopped_because"]): AdvanceResult {
		return { view: this.status(unit.state.change_id), steps, stopped_because: why };
	}

	// --- phase steps -----------------------------------------------------------------------------

	/** The indeterminate observations recorded on the frozen candidate, oldest first. */
	private indeterminateObservations(state: ChangeState): Evidence[] {
		const digest = state.candidate?.manifest_digest;
		if (!digest) return [];
		return state.evidence
			.filter((e) => e.valid && e.subject_digest === digest && e.verdict === "INDETERMINATE")
			.map((e) => this.deps.ledger.getEvidence(e.evidence_id))
			.filter((e): e is Evidence => e !== null);
	}

	/** Injected by the Git integration module (IT-4) to keep this controller free of Git details. */
	integrator: ((unit: Unit, cor: string) => Promise<Unit>) | null = null;

	// --- human decisions -----------------------------------------------------------------------------

	private async requestDecision(
		unit: Unit,
		cor: string,
		{
			interaction,
			subject,
			facts,
			recommendation,
			arg,
			decisionId,
			language,
			adoptable,
			referential,
			architecture_map,
			alternatives,
		}: DecisionOptions,
	): Promise<Unit> {
		const request = buildDecisionRequest({
			decision_id: decisionId ?? this.id("dec"),
			change_id: unit.state.change_id,
			interaction,
			subject,
			language,
			facts,
			recommendation,
			...(arg !== undefined ? { arg } : {}),
			...(adoptable ? { adoptable } : {}),
			...(referential ? { referential } : {}),
			...(architecture_map ? { architecture_map } : {}),
			...(alternatives ? { alternatives } : {}),
			installers: (manager: string) => this.deps.stacks.installerOf(manager)?.install,
			requested_at: this.now(),
		});
		this.deps.ledger.putDecisionRequest(request);
		const next = this.commit(unit, { type: "decision.request", at: this.now(), actor: KERNEL_ACTOR, request }, cor);
		this.deps.onDecisionRequested?.(request);
		return next;
	}

	/** Opens a read-only review of the frozen candidate (or of the reference alone). Identical data in every Pi entry (RM-066). */
	async openReview(changeId: string, candidateId?: string): ReturnType<typeof openReviewOf> {
		const { state } = this.load(changeId);
		return openReviewOf(
			{
				artifacts: this.artifacts,
				workspace: this.deps.workspace,
				getEvidence: (evidenceId: string) => this.deps.ledger.getEvidence(evidenceId),
				now: () => this.now(),
			},
			state,
			changeId,
			candidateId,
		);
	}

	pendingDecisions(changeId: string): DecisionRequest[] {
		const unit = this.load(changeId);
		return unit.state.pending_decisions
			.map((d) => this.deps.ledger.getDecisionRequest(d.decision_id))
			.filter((d): d is DecisionRequest => d !== null);
	}

	/**
	 * Records a human decision; provenance is provided by the host adapter, never by the content, and
	 * only a local TUI or a qualified RPC or SDK host provides it.
	 */
	answerDecision(
		changeId: string,
		response: DecisionResponse,
		origin: HumanOrigin,
	): { view: StatusView; decision: HumanDecision | null; error: DomainError | null } {
		return this.holdWhile(changeId, () => {
			const cor = this.id("cor");
			let unit = this.load(changeId);
			const request = this.deps.ledger.getDecisionRequest(response.decision_id);
			if (!request)
				return {
					view: this.status(changeId),
					decision: null,
					error: new DomainError("UNKNOWN_REFERENCE", `decision ${response.decision_id} not found`),
				};
			const humanDecisionId = this.id("hd");
			const actor: ActorRef = origin.actor;
			const res = this.tryCommit(
				unit,
				{ type: "decision.answer", at: this.now(), actor, human_decision_id: humanDecisionId, response, origin },
				cor,
			);
			unit = res.unit;
			if (res.error) return { view: this.status(changeId), decision: null, error: res.error };
			const decision: HumanDecision = {
				human_decision_id: humanDecisionId,
				request,
				response,
				origin,
				recorded_at: this.now(),
				revoked: false,
			};
			this.deps.ledger.putHumanDecision(decision, changeId);
			const effect = ANSWER_EFFECTS[request.interaction]?.(response, {
				actor,
				human_decision_id: humanDecisionId,
				now: () => this.now(),
			});
			if (effect) unit = this.commit(unit, effect, cor);
			return { view: this.status(changeId), decision, error: null };
		});
	}

	// --- explicit operations -------------------------------------------------------------------------

	async verify(changeId: string): Promise<AdvanceResult> {
		return this.conducting(changeId, async () => {
			const cor = this.id("cor");
			let unit = this.load(changeId);
			if (unit.state.phase !== "verifying") {
				unit = this.commit(
					unit,
					{
						type: "verification.rerun",
						at: this.now(),
						actor: KERNEL_ACTOR,
						reason: "explicit re-verification requested",
					},
					cor,
				);
			}
			unit = await verifyPhase(this.phase, unit, cor);
			return {
				view: this.status(changeId),
				steps: ["verify"],
				stopped_because: unit.state.status === "blocked" ? "blocked" : "max_steps",
			};
		});
	}

	pause(changeId: string, actor: ActorRef): StatusView {
		return this.holdWhile(changeId, () => {
			let unit = this.load(changeId);
			const running = runningIntervention(unit.state);
			if (running)
				unit = this.commit(
					unit,
					{
						type: "intervention.finish",
						at: this.now(),
						actor: KERNEL_ACTOR,
						intervention_id: running.intervention_id,
						result: "cancelled",
						counters: { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 },
						detail: "paused",
						cost: unknownCost("the change was paused before the host reported the session's usage"),
						imposed_layers: [unobservedEnd("the change was paused before the session reported its requests")],
					},
					this.id("cor"),
				);
			this.commit(unit, { type: "change.pause", at: this.now(), actor }, this.id("cor"));
			return this.status(changeId);
		});
	}

	resume(changeId: string, actor: ActorRef): StatusView {
		return this.holdWhile(changeId, () => {
			const unit = this.load(changeId);
			const cor = this.id("cor");
			const running = runningIntervention(unit.state);
			let u = unit;
			if (running)
				u = this.commit(
					u,
					{
						type: "intervention.finish",
						at: this.now(),
						actor: KERNEL_ACTOR,
						intervention_id: running.intervention_id,
						result: "failed",
						counters: { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 },
						detail: "intervention was running when the session stopped; treated as failed on resume",
						cost: unknownCost("the session stopped before the host reported its usage"),
						imposed_layers: [unobservedEnd("the session stopped before it reported its requests")],
					},
					cor,
				);
			if (u.state.operation && u.state.operation.kind === "verification")
				u = this.commit(
					u,
					{
						type: "verification.rerun",
						at: this.now(),
						actor: KERNEL_ACTOR,
						reason: "verification was interrupted; it will be re-run",
					},
					cor,
				);
			if (u.state.status === "paused") u = this.commit(u, { type: "change.resume", at: this.now(), actor }, cor);
			// A block whose cause the kernel declared retryable is lifted whatever its class: the change
			// goes back to the step that threw and redoes it. Declaring an error retryable and leaving no
			// entry able to act on it is what loses a change on an invalid structured output. The block is
			// lifted under the actor who resumed, so that what the change spends after a stop on its budget
			// is recorded as that actor's decision.
			else if (resumeLiftsStop(u.state))
				u = this.tryCommit(u, { type: "change.unblock", at: this.now(), actor }, cor).unit;
			return this.status(changeId);
		});
	}

	cancel(changeId: string, actor: ActorRef, reason: string): StatusView {
		return this.holdWhile(changeId, () => {
			this.commit(this.load(changeId), { type: "change.cancel", at: this.now(), actor, reason }, this.id("cor"));
			return this.status(changeId);
		});
	}

	/**
	 * Closes a material question from the stop a stalled specification causes (BES-02), on the same
	 * provenance check as a decision. The stop it lifts, when it holds one, is the one `resume` lifts,
	 * under the same actor; the caller conducts the change onward, as after a resume. The actor is the
	 * origin's, as for a decision, so whoever closes is the one whose provenance is checked.
	 */
	closeQuestion(
		changeId: string,
		questionId: string,
		origin: HumanOrigin,
	): { view: StatusView; error: DomainError | null } {
		return this.holdWhile(changeId, () => {
			const res = this.tryCommit(
				this.load(changeId),
				{ type: "question.close", at: this.now(), actor: origin.actor, id: questionId, origin },
				this.id("cor"),
			);
			return { view: this.status(changeId), error: res.error };
		});
	}

	/**
	 * Revokes the owner's resolution of a material question and asks it again (DEC-06), on the
	 * provenance the host adapter verified. The IH-01 request is built as clarification builds it, in
	 * the language the change was started in and on the tree the change was opened on, since the
	 * revocation withdraws the candidate, and the kernel inscribes it with the revocation. It is
	 * stored for presentation first, as every request is: a revocation the kernel refuses leaves a
	 * request no pending decision names, which nothing presents, whereas one stored after the
	 * revocation could fail and leave the question pending with nothing to present or answer. No
	 * intervention runs: the caller conducts the change onward, which presents the question again.
	 */
	revokeQuestion(
		changeId: string,
		questionId: string,
		origin: HumanOrigin,
	): { view: StatusView; error: DomainError | null } {
		return this.holdWhile(changeId, () => {
			const unit = this.load(changeId);
			const question = unit.state.open_questions.find((q) => q.id === questionId);
			const request = {
				...buildDecisionRequest({
					decision_id: this.id("dec"),
					change_id: changeId,
					interaction: "IH-01",
					subject: { ...subjectOfChange(unit.state), digest: unit.state.reference.digest },
					language: requestedLanguage(unit.state) ?? "fr",
					facts: [],
					recommendation: null,
					arg: question?.question ?? questionId,
					requested_at: this.now(),
				}),
				interaction: "IH-01" as const,
			};
			this.deps.ledger.putDecisionRequest(request);
			const res = this.tryCommit(
				unit,
				{ type: "question.revoke", at: this.now(), actor: origin.actor, id: questionId, origin, request },
				this.id("cor"),
			);
			if (!res.error) this.deps.onDecisionRequested?.(request);
			return { view: this.status(changeId), error: res.error };
		});
	}
}
