/**
 * Application controller (CMP-APP): coordinates the use cases, opens units of work, calls the
 * ports and commits results. It never computes a verdict itself (AT-01): every normative change
 * goes through the domain reducer and is appended atomically to the ledger.
 *
 * What each phase needs done is asked of the component that owns it — the verification coordinator
 * for the protocol and the evidence, the target registry for what a stack offers, the review query
 * model for what a candidate shows. This module holds the order of the phases, and nothing else.
 */
import type { ActorRef, EnvironmentRef, HumanInteraction, Phase, SubjectRef } from "../contracts/v1/common.ts";
import type { CandidateManifest } from "../contracts/v1/candidate.ts";
import type { DecisionRequest, DecisionResponse, HumanDecision, HumanOrigin } from "../contracts/v1/decision.ts";
import type { Evidence } from "../contracts/v1/evidence.ts";
import type { Protocol } from "../contracts/v1/protocol.ts";
import { TOOLS_FOR_ROLE } from "../contracts/v1/reports.ts";
import { apply } from "../domain/change/apply.ts";
import type { ChangeCommand } from "../domain/change/commands.ts";
import { decide } from "../domain/change/decide.ts";
import { runningIntervention, unknownCost, type ArtifactKind, type ChangeState } from "../domain/change/state.ts";
import { DomainError } from "../domain/errors.ts";
import { imposedLayersFor, recordImposedLayers, unobservedEnd } from "../domain/imposed-layers.ts";
import type { ActivePolicy } from "../domain/policy.ts";
import { decideProgram, type ProgramCommand, type ProgramState } from "../domain/program/program.ts";
import type { LedgerPort } from "../ports/ledger.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import type {
	AgentPort,
	ControlExecutionPort,
	InterventionMandate,
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
import type { PhaseContext, Unit } from "./phases/phase.ts";
import { prepare } from "./phases/prepare.ts";
import { review } from "./phases/review.ts";
import { specify } from "./phases/specify.ts";
import { verify as verifyPhase } from "./phases/verify.ts";
import { designVerification } from "./phases/verification-design.ts";
import { buildContext, type FeedbackSources } from "./context.ts";
import { engineeringReport, type EngineeringReport } from "./report.ts";
import { buildDecisionRequest } from "./decisions.ts";
import type { Clock, IdSource } from "./ids.ts";
import { VerificationCoordinator } from "./verification.ts";
import { statusView, type StatusView } from "./views.ts";
import {
	buildSnapshot,
	readChanges,
	readContent,
	FILE_READ_BUDGET_BYTES,
	type ChangePage,
	type ContentPage,
	type PathStatus,
	type ReviewSnapshot,
} from "./review.ts";
import type { Finding } from "../contracts/v1/evidence.ts";

export interface HarnessDeps {
	ledger: LedgerPort;
	objects: ObjectStorePort;
	workspace: WorkspacePort;
	controls: ControlExecutionPort;
	agent: AgentPort;
	sandbox: SandboxSelection;
	clock: Clock;
	ids: IdSource;
	policy: ActivePolicy;
	workspacePolicy: WorkspacePolicy;
	environment: EnvironmentRef;
	instance_id: string;
	/** Absolute paths never readable by workers (data dir). */
	denied_read_paths: string[];
	/** Called when a decision is requested (presentation hook, never authoritative). */
	onDecisionRequested?: (request: DecisionRequest) => void;
	onProgress?: (message: string) => void;
}

export interface StartArgs {
	project_path: string;
	request_text: string;
	title?: string;
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

/** The phase a change is in decides what runs next; this table is the whole of that order. */
const PHASES: Partial<Record<Phase, (ctx: PhaseContext, unit: Unit, cor: string) => Promise<Unit>>> = {
	intake: clarify,
	clarifying: clarify,
	specifying: specify,
	verification_design: designVerification,
	preparing: prepare,
	designing: design,
	implementing: implement,
	verifying: verifyPhase,
	reviewing: review,
	deciding: decidePhase,
	integrating: integrate,
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
	constructor(deps: HarnessDeps) {
		this.deps = deps;
		const harness = this;
		this.artifacts = new ArtifactRepository({ ledger: deps.ledger, objects: deps.objects, now: () => harness.now() });
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
			progress: (message: string) => harness.progress(message),
		});
		this.phase = {
			artifacts: this.artifacts,
			verification: this.verification,
			workspace: deps.workspace,
			workspacePolicy: deps.workspacePolicy,
			policy: deps.policy,
			get integrator() {
				return harness.integrator;
			},
			now: () => harness.now(),
			id: (prefix: string) => harness.id(prefix),
			progress: (message: string) => harness.progress(message),
			language: (state: ChangeState) => harness.language(state),
			commit: (unit: Unit, command: ChangeCommand, correlation: string) => harness.commit(unit, command, correlation),
			requestDecision: (unit, cor, interaction, subject, facts, recommendation, arg, decisionId, language) =>
				harness.requestDecision(unit, cor, interaction, subject, facts, recommendation, arg, decisionId, language),
			feedbackSources: () => harness.feedbackSources(),
			indeterminateObservations: (state: ChangeState) => harness.indeterminateObservations(state),
		};
		this.interventions = new InterventionSupervisor({
			agent: deps.agent,
			sandbox: deps.sandbox,
			policy: deps.policy,
			now: () => harness.now(),
			progress: (message: string) => harness.progress(message),
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

	private load(changeId: string): Unit {
		const loaded = this.deps.ledger.loadChange(changeId);
		if (!loaded) throw new DomainError("UNKNOWN_REFERENCE", `change ${changeId} does not exist`);
		return loaded;
	}

	/** Applies one command through the reducer and commits its events atomically. */
	commit(unit: Unit, command: ChangeCommand, correlation: string): Unit {
		const d = decide(unit.state, command, this.deps.policy);
		if (!d.ok) throw d.error;
		if (d.events.length === 0) return unit;
		const receipt = this.deps.ledger.appendChange(unit.state.change_id, unit.revision, d.events, {
			correlation_id: correlation,
		});
		let state = unit.state;
		for (const e of d.events) state = apply(state, e);
		return { state, revision: receipt.revision };
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

	private commitProgram(programId: string, command: ProgramCommand, correlation: string): ProgramState {
		const loaded = this.deps.ledger.loadProgram(programId);
		const d = decideProgram(loaded?.state ?? null, command);
		if (!d.ok) throw d.error;
		this.deps.ledger.appendProgram(programId, loaded?.revision ?? 0, d.events, { correlation_id: correlation });
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

	private language(state: ChangeState): "fr" | "en" {
		return state.mandate?.language ?? "fr";
	}

	// --- program creation (PF-01) ----------------------------------------------------------------

	async start(args: StartArgs): Promise<{ program: ProgramState; change: ChangeState }> {
		const cor = this.id("cor");
		const at = this.now();
		this.progress("capturing the reference");
		const reference = await this.deps.workspace.captureReference(args.project_path, this.deps.workspacePolicy);
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
		const referenceRef = await this.artifacts.store(
			"reference",
			changeId,
			this.id("ref"),
			reference,
			KERNEL_ACTOR.actor_id,
		);
		const title = args.title ?? args.request_text.split("\n")[0]!.slice(0, 80);
		this.commitProgram(
			programId,
			{
				type: "program.create",
				at,
				actor: args.actor,
				program_id: programId,
				project_path: reference.project_path,
				objective: requestRef,
				title,
			},
			cor,
		);
		this.commitProgram(
			programId,
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
					},
				],
				milestones: [],
				reason: "initial single-increment trajectory",
			},
			cor,
		);
		this.commitProgram(
			programId,
			{ type: "increment.bind", at, actor: KERNEL_ACTOR, increment_id: incrementId, change_id: changeId },
			cor,
		);
		let unit: Unit = { state: null as unknown as ChangeState, revision: 0 };
		const d = decide(
			null,
			{
				type: "change.create",
				at,
				actor: args.actor,
				change_id: changeId,
				program_id: programId,
				increment_id: incrementId,
				request: requestRef,
				reference: { reference_id: reference.reference_id, kind: reference.kind, digest: reference.tree_digest },
				environment_digest: this.deps.environment.digest,
			},
			this.deps.policy,
		);
		if (!d.ok) throw d.error;
		const receipt = this.deps.ledger.appendChange(changeId, 0, d.events, { correlation_id: cor });
		let state: ChangeState | null = null;
		for (const e of d.events) state = apply(state, e);
		unit = { state: state!, revision: receipt.revision };
		unit = this.commit(
			unit,
			{ type: "artifact.propose", at, actor: KERNEL_ACTOR, kind: "reference", ref: referenceRef },
			cor,
		);
		if (args.language)
			unit = this.commit(
				unit,
				{
					type: "question.open",
					at,
					actor: KERNEL_ACTOR,
					id: "language",
					question: `language:${args.language}`,
					material: false,
					decision_id: null,
				},
				cor,
			);
		return { program: this.deps.ledger.loadProgram(programId)!.state, change: unit.state };
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
		return engineeringReport(loaded.state, this.deps.ledger.listEvidence(changeId), protocol?.content ?? null);
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
		const steps: string[] = [];
		const max = options.max_steps ?? 12;
		const phaseContext: PhaseContext = {
			...this.phase,
			runIntervention: (unit, cor, role, objective, workspacePath, extra) =>
				this.runIntervention(options.readModel, unit, cor, role, objective, workspacePath, extra),
		};
		let unit = this.load(changeId);
		for (let i = 0; i < max; i++) {
			const s = unit.state;
			if (s.phase === "closed") return this.result(unit, steps, s.status === "cancelled" ? "cancelled" : "closed");
			if (s.status === "decision_required") return this.result(unit, steps, "decision_required");
			if (s.status === "blocked")
				return this.result(unit, steps, s.stop_reason === "capability_missing" ? "capability_missing" : "blocked");
			if (s.status === "paused") return this.result(unit, steps, "paused");
			const cor = this.id("cor");
			try {
				const phase = PHASES[s.phase];
				if (!phase) return this.result(unit, steps, "blocked");
				unit = await phase(phaseContext, unit, cor);
				steps.push(`${s.phase} -> ${unit.state.phase}/${unit.state.status}`);
			} catch (error) {
				if (error instanceof DomainError) {
					steps.push(`${s.phase}: ${error.code} ${error.message}`);
					// The failing step commits before it throws, so `unit` holds a stale revision: writing
					// the block against it loses the optimistic-concurrency race and the change silently
					// reappears ready, redoing the work that just failed.
					const current = this.deps.ledger.loadChange(changeId) ?? unit;
					// The action the error names is of no use to anyone unless the block records that it can
					// be retried and says so where the operator reads the change.
					const detail = `${error.code}: ${error.message}${error.nextActions.length > 0 ? ` (next: ${error.nextActions.join(", ")})` : ""}`;
					const blocked = this.tryCommit(
						current,
						{
							type: "change.block",
							at: this.now(),
							actor: KERNEL_ACTOR,
							reason:
								error.code === "CAPABILITY_MISSING"
									? "capability_missing"
									: error.code === "CONFIGURATION_ERROR"
										? "configuration_error"
										: error.code === "POLICY_DENIED"
											? "policy_denied"
											: "execution_error",
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

	// --- interventions ---------------------------------------------------------------------------

	private async runIntervention(
		readModel: () => ModelSelection,
		unit: Unit,
		cor: string,
		role: InterventionMandate["role"],
		objective: string,
		workspacePath: string,
		extra: { adopted?: ArtifactKind[]; feedback?: string | null; attempt_id?: string | null },
	): Promise<{
		unit: Unit;
		output: unknown;
		output_valid: boolean;
		result: "completed" | "failed" | "cancelled" | "truncated";
		intervention_id: string;
	}> {
		// Read once: the model judged is the one journaled, declared in the context and handed to the
		// worker, whatever is selected in Pi while the capability check awaits the model's description.
		const model = readModel();
		await this.interventions.requireCapable(role, model);
		const interventionId = this.id("int");
		const attemptId = extra.attempt_id ?? (role === "implement" || role === "prepare" ? this.id("att") : null);
		unit = this.commit(
			unit,
			{
				type: "intervention.start",
				at: this.now(),
				actor: KERNEL_ACTOR,
				intervention_id: interventionId,
				role,
				attempt_id: attemptId,
				model,
				profile_id: role,
				profile_qualified: this.interventions.qualifiedFor(role),
			},
			cor,
		);
		if (unit.state.status === "blocked")
			return { unit, output: null, output_valid: false, result: "failed", intervention_id: interventionId };
		const adopted: { kind: string; artifact_id: string; revision: number; digest: string; text: string }[] = [];
		for (const kind of extra.adopted ?? []) {
			const a = await this.artifacts.latest<unknown>(unit.state, kind);
			if (a)
				adopted.push({
					kind,
					artifact_id: a.ref.artifact_id,
					revision: a.ref.revision,
					digest: a.ref.content_digest,
					text: typeof a.content === "string" ? a.content : JSON.stringify(a.content, null, 2),
				});
		}
		const protocol = await this.artifacts.latest<Protocol>(unit.state, "protocol");
		const ctx = buildContext({
			role,
			objective,
			language: this.language(unit.state),
			adopted,
			untrusted: [],
			feedback: extra.feedback ?? null,
			tools: TOOLS_FOR_ROLE[role],
			budget_bytes: 60_000,
			// The provider is read from the same selection the supervisor hands the worker; what it
			// imposes is declared whether or not this intervention writes (CTX-02).
			imposed_layers: imposedLayersFor(model.provider_id),
			controls: (protocol?.content.controls ?? []).map((c) => ({
				control_id: c.control_id,
				command: c.command,
				cwd: c.cwd,
			})),
			boundaries: (protocol?.content.controls ?? []).flatMap((c) => c.structure_rules.map((rule) => rule.statement)),
		});
		// The manifest addresses the prompt and each excerpt by digest; the bytes go to the store, or
		// those digests resolve to nothing and the dossier cannot say what the model read.
		await this.deps.objects.putText(ctx.record, "application/json");
		const contextRef = await this.artifacts.store(
			"context",
			unit.state.change_id,
			this.id("ctx"),
			ctx.manifest,
			KERNEL_ACTOR.actor_id,
		);
		unit = this.commit(
			unit,
			{ type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "context", ref: contextRef },
			cor,
		);
		// Each tool call is paid for as it happens: what the budget refuses ends the session there.
		const report = await this.interventions.run(
			{
				intervention_id: interventionId,
				change_id: unit.state.change_id,
				role,
				objective,
				workspace_path: workspacePath,
				prompt: ctx.prompt,
				system_prompt: ctx.system_prompt,
				context: ctx.manifest,
				model,
			},
			() => {
				const consumed = this.tryCommit(
					unit,
					{
						type: "budget.consume",
						at: this.now(),
						actor: KERNEL_ACTOR,
						intervention_id: interventionId,
						counters: { tool_calls: 1, duration_ms: 0, tokens_known: 0, delegations: 0 },
					},
					cor,
				);
				unit = consumed.unit;
				return consumed.error;
			},
		);
		const outputRef = await this.artifacts.store(
			"output",
			unit.state.change_id,
			this.id("out"),
			{ intervention_id: interventionId, role, terminal: report.terminal, events: report.events },
			interventionId,
		);
		unit = this.commit(
			unit,
			{
				type: "artifact.propose",
				at: this.now(),
				actor: {
					actor_id: interventionId,
					actor_type: "agent",
					role: role === "review" ? "reviewer_agent" : "producer_agent",
					origin: "model_output",
					authentication_level: "none",
				},
				kind: "output",
				ref: outputRef,
			},
			cor,
		);
		unit = this.commit(
			unit,
			{
				type: "intervention.finish",
				at: this.now(),
				actor: KERNEL_ACTOR,
				intervention_id: interventionId,
				result: report.result,
				counters: report.counters,
				detail: report.detail,
				cost: report.cost,
				imposed_layers: report.imposed_layers_observed.map((observed) =>
					recordImposedLayers(ctx.manifest.imposed_layers, observed),
				),
			},
			cor,
		);
		// The tool-call bound is what caps spending on a provider billed per token, so reaching it waits
		// for the owner instead of resuming on its own the way the duration bound does (D-19). Whatever
		// the role, the change stops here; a resume lifts it.
		if (report.budget_refusal !== null)
			unit = this.commit(
				unit,
				{
					type: "change.block",
					at: this.now(),
					actor: KERNEL_ACTOR,
					reason: "budget_exhausted",
					detail: `${role} intervention: ${report.budget_refusal}; the change waits for its owner, and a raised bound takes effect in a new session`,
					retryable: true,
				},
				cor,
			);
		return {
			unit,
			output: report.output,
			output_valid: report.output_valid,
			result: report.result,
			intervention_id: interventionId,
		};
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
		interaction: Exclude<HumanInteraction, "IH-03" | "IH-04" | "IH-05" | "IH-06" | "IH-09">,
		subject: SubjectRef,
		facts: string[],
		recommendation: string | null,
		arg?: string,
		decisionId?: string,
		language: "fr" | "en" = "fr",
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
			requested_at: this.now(),
		});
		this.deps.ledger.putDecisionRequest(request);
		const next = this.commit(unit, { type: "decision.request", at: this.now(), actor: KERNEL_ACTOR, request }, cor);
		this.deps.onDecisionRequested?.(request);
		return next;
	}

	/** Opens a read-only review of the frozen candidate (or of the reference alone). Identical data in every Pi entry (RM-066). */
	async openReview(
		changeId: string,
		candidateId?: string,
	): Promise<{
		snapshot: ReviewSnapshot;
		changes(path: string, status: PathStatus, oldPath: string | null): Promise<ChangePage>;
		content(path: string, side: "old" | "new", start: number, limit: number): Promise<ContentPage>;
	}> {
		const { state } = this.load(changeId);
		const reference = await this.artifacts.reference(state);
		const wanted = candidateId ?? state.candidate?.candidate_id ?? null;
		const manifest = wanted
			? await this.artifacts.read<CandidateManifest>({ artifact_id: wanted, revision: 1 }).catch(() => null)
			: null;
		const workspacePath = manifest ? this.deps.workspace.workspacePath(manifest.workspace_id) : null;
		const findings: (Finding & { evidence_id: string })[] = [];
		for (const e of state.evidence.filter(
			(x) => x.valid && manifest && x.subject_digest === manifest.manifest_digest,
		)) {
			const ev = this.deps.ledger.getEvidence(e.evidence_id);
			if (ev) for (const f of ev.findings) findings.push({ ...f, evidence_id: ev.evidence_id });
		}
		const newer =
			manifest && state.candidate && state.candidate.candidate_id !== manifest.candidate_id
				? state.candidate.candidate_id
				: null;
		const snapshot = buildSnapshot({
			change_id: changeId,
			reference,
			manifest,
			findings,
			newer_candidate: newer,
			now: this.now(),
		});
		const sources = {
			referencePath: reference.project_path,
			workspacePath,
			reference,
			manifest,
			maxBytes: FILE_READ_BUDGET_BYTES,
		};
		return {
			snapshot,
			changes: (path, status, oldPath) => readChanges(sources, path, status, oldPath),
			content: (path, side, start, limit) => readContent(sources, path, side, { start_line: start, limit }),
		};
	}

	pendingDecisions(changeId: string): DecisionRequest[] {
		const unit = this.load(changeId);
		return unit.state.pending_decisions
			.map((d) => this.deps.ledger.getDecisionRequest(d.decision_id))
			.filter((d): d is DecisionRequest => d !== null);
	}

	/** Records a human decision; provenance is provided by the host adapter, never by the content (ADR-014). */
	answerDecision(
		changeId: string,
		response: DecisionResponse,
		origin: HumanOrigin,
	): { view: StatusView; decision: HumanDecision | null; error: DomainError | null } {
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
		if (request.interaction === "IH-01" && response.option_id === "abandon")
			unit = this.commit(
				unit,
				{ type: "change.cancel", at: this.now(), actor, reason: "abandoned at clarification" },
				cor,
			);
		if (request.interaction === "IH-10" && response.option_id === "correct") {
			unit = this.commit(
				unit,
				{ type: "gate.evaluate", gate: "G5", at: this.now(), actor: KERNEL_ACTOR, decision_id: humanDecisionId },
				cor,
			);
		}
		if (request.interaction === "IH-11" && (response.option_id === "export_only" || response.option_id === "cancel")) {
			unit = this.commit(
				unit,
				{
					type: "change.block",
					at: this.now(),
					actor: KERNEL_ACTOR,
					reason: "policy_denied",
					detail: "integration declined by the change owner; the change stays accepted and exportable",
				},
				cor,
			);
		}
		if (request.interaction === "IH-02" && response.option_id === "refuse") {
			unit = this.commit(
				unit,
				{
					type: "change.block",
					at: this.now(),
					actor: KERNEL_ACTOR,
					reason: "policy_denied",
					detail: `adoption refused by the change owner${response.free_text ? `: ${response.free_text}` : ""}`,
				},
				cor,
			);
		}
		if (request.interaction === "IH-07" && response.option_id === "stop") {
			unit = this.commit(
				unit,
				{
					type: "change.block",
					at: this.now(),
					actor: KERNEL_ACTOR,
					reason: "attempts_exhausted",
					detail: "budget extension refused",
				},
				cor,
			);
		}
		return { view: this.status(changeId), decision, error: null };
	}

	// --- explicit operations -------------------------------------------------------------------------

	async verify(changeId: string): Promise<AdvanceResult> {
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
	}

	pause(changeId: string, actor: ActorRef): StatusView {
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
	}

	resume(changeId: string, actor: ActorRef): StatusView {
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
		else if (u.state.status === "blocked" && (u.state.stop_reason === "execution_error" || u.state.stop_retryable))
			u = this.tryCommit(u, { type: "change.unblock", at: this.now(), actor }, cor).unit;
		return this.status(changeId);
	}

	cancel(changeId: string, actor: ActorRef, reason: string): StatusView {
		this.commit(this.load(changeId), { type: "change.cancel", at: this.now(), actor, reason }, this.id("cor"));
		return this.status(changeId);
	}
}
