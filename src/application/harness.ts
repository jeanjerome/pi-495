/**
 * Application controller (CMP-APP): coordinates the use cases, opens units of work, calls the
 * ports and commits results. It never computes a verdict itself (AT-01): every normative change
 * goes through the domain reducer and is appended atomically to the ledger.
 *
 * What each phase needs done is asked of the component that owns it — the verification coordinator
 * for the protocol and the evidence, the target registry for what a stack offers, the review query
 * model for what a candidate shows. This module holds the order of the phases, and nothing else.
 */
import { join } from "node:path";
import { Value } from "typebox/value";
import { digestBytes, digestValue } from "../contracts/digest.ts";
import { validate } from "../contracts/validate.ts";
import type { ActorRef, ArtifactRef, EnvironmentRef, HumanInteraction, SubjectRef } from "../contracts/v1/common.ts";
import type { CandidateManifest } from "../contracts/v1/candidate.ts";
import type { DecisionRequest, DecisionResponse, HumanDecision, HumanOrigin } from "../contracts/v1/decision.ts";
import type { Evidence } from "../contracts/v1/evidence.ts";
import { retryCanDiffer } from "../domain/baseline.ts";
import { Mandate as MandateSchema, RequirementsDocument as RequirementsDocumentSchema, type ControlCapabilityDiagnosis, type Design, type Mandate, type Protocol, type RequirementsDocument } from "../contracts/v1/protocol.ts";
import { OUTPUT_SCHEMAS, TOOLS_FOR_ROLE, type ProducerReport, type ReviewReport, type SpecificationReport } from "../contracts/v1/reports.ts";
import { apply } from "../domain/change/apply.ts";
import type { ChangeCommand } from "../domain/change/commands.ts";
import { decide } from "../domain/change/decide.ts";
import { answersOf, declarationsOfReport, runningIntervention, specificationStanding, subjectOfChange, type ArtifactKind, type ChangeState } from "../domain/change/state.ts";
import { DomainError } from "../domain/errors.ts";
import { protectedPathsChanged } from "../domain/gates/g4.ts";
import type { ActivePolicy } from "../domain/policy.ts";
import { decideProgram, type ProgramCommand, type ProgramState } from "../domain/program/program.ts";
import type { LedgerPort } from "../ports/ledger.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import type { AgentPort, ControlExecutionPort, InterventionMandate, ModelSelection, SandboxSelection, WorkspacePolicy, WorkspacePort } from "../ports/execution.ts";
import { EXECUTOR_ACTOR, KERNEL_ACTOR } from "./actors.ts";
import { ArtifactRepository } from "./artifacts.ts";
import { InterventionSupervisor } from "./intervention.ts";
import { buildContext, buildFeedback, focusOf, implementObjective, preparationMandateObjective, preparationObjective, projectExcerpts, resumeNote, reviewObjective, specificationObjective, type FeedbackSources } from "./context.ts";
import { engineeringReport, type EngineeringReport } from "./report.ts";
import { buildDecisionRequest } from "./decisions.ts";
import type { Clock, IdSource } from "./ids.ts";
import { detectStack, mirrorsProductionResource, type StackDetection } from "./target.ts";
import { diagnoseControlCapability, preparedFilesFrom, referenceTestFiles, samePreparationPaths, type PreparationRecord, type ReferenceSuiteObservation } from "./preparation.ts";
import { VerificationCoordinator } from "./verification.ts";
import { statusView, type StatusView } from "./views.ts";
import { buildSnapshot, readChanges, readContent, FILE_READ_BUDGET_BYTES, type ChangePage, type ContentPage, type PathStatus, type ReviewSnapshot } from "./review.ts";
import type { Finding, RequirementRef } from "../contracts/v1/evidence.ts";

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
	model: ModelSelection;
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
	stopped_because: "closed" | "decision_required" | "blocked" | "paused" | "max_steps" | "cancelled" | "capability_missing";
}

interface Unit {
	state: ChangeState;
	revision: number;
}

export class Harness {
	readonly deps: HarnessDeps;
	/** What the change proposed and adopted, over the ledger and the object store. */
	readonly artifacts: ArtifactRepository;
	/** Resolves the protocol, qualifies the sensors, runs the controls and produces the evidence. */
	private readonly verification: VerificationCoordinator;
	/** Drives one bounded agent session and reports what it observed. */
	private readonly interventions: InterventionSupervisor;
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
		this.interventions = new InterventionSupervisor({
			agent: deps.agent,
			sandbox: deps.sandbox,
			model: deps.model,
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
		const receipt = this.deps.ledger.appendChange(unit.state.change_id, unit.revision, d.events, { correlation_id: correlation });
		let state = unit.state;
		for (const e of d.events) state = apply(state, e);
		return { state, revision: receipt.revision };
	}

	private tryCommit(unit: Unit, command: ChangeCommand, correlation: string): { unit: Unit; error: DomainError | null } {
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
		const requestRef = await this.artifacts.store("request", changeId, this.id("req"), args.request_text, args.actor.actor_id);
		const referenceRef = await this.artifacts.store("reference", changeId, this.id("ref"), reference, KERNEL_ACTOR.actor_id);
		const title = args.title ?? args.request_text.split("\n")[0]!.slice(0, 80);
		this.commitProgram(programId, { type: "program.create", at, actor: args.actor, program_id: programId, project_path: reference.project_path, objective: requestRef, title }, cor);
		this.commitProgram(programId, { type: "trajectory.adopt", at, actor: args.actor, increments: [{ increment_id: incrementId, title, kind: "functional", value: title, depends_on: [], required_capabilities: [], requirement_ids: [], closure_criterion: "change accepted at G5" }], milestones: [], reason: "initial single-increment trajectory" }, cor);
		this.commitProgram(programId, { type: "increment.bind", at, actor: KERNEL_ACTOR, increment_id: incrementId, change_id: changeId }, cor);
		let unit: Unit = { state: null as unknown as ChangeState, revision: 0 };
		const d = decide(null, { type: "change.create", at, actor: args.actor, change_id: changeId, program_id: programId, increment_id: incrementId, request: requestRef, reference: { reference_id: reference.reference_id, kind: reference.kind, digest: reference.tree_digest }, environment_digest: this.deps.environment.digest }, this.deps.policy);
		if (!d.ok) throw d.error;
		const receipt = this.deps.ledger.appendChange(changeId, 0, d.events, { correlation_id: cor });
		let state: ChangeState | null = null;
		for (const e of d.events) state = apply(state, e);
		unit = { state: state!, revision: receipt.revision };
		unit = this.commit(unit, { type: "artifact.propose", at, actor: KERNEL_ACTOR, kind: "reference", ref: referenceRef }, cor);
		if (args.language) unit = this.commit(unit, { type: "question.open", at, actor: KERNEL_ACTOR, id: "language", question: `language:${args.language}`, material: false, decision_id: null }, cor);
		return { program: this.deps.ledger.loadProgram(programId)!.state, change: unit.state };
	}

	status(changeId: string): StatusView {
		const loaded = this.deps.ledger.loadChange(changeId);
		if (!loaded) return statusView(null, null, [`change ${changeId} not found`]);
		const program = this.deps.ledger.loadProgram(loaded.state.program_id)?.state ?? null;
		return statusView(program, loaded.state, [`sandbox:${this.deps.sandbox.backend.backend}:${this.deps.sandbox.qualification.qualified ? "qualified" : "not-qualified"}`]);
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

	async advance(changeId: string, options: { max_steps?: number; actor?: ActorRef } = {}): Promise<AdvanceResult> {
		const steps: string[] = [];
		const max = options.max_steps ?? 12;
		let unit = this.load(changeId);
		for (let i = 0; i < max; i++) {
			const s = unit.state;
			if (s.phase === "closed") return this.result(unit, steps, s.status === "cancelled" ? "cancelled" : "closed");
			if (s.status === "decision_required") return this.result(unit, steps, "decision_required");
			if (s.status === "blocked") return this.result(unit, steps, s.stop_reason === "capability_missing" ? "capability_missing" : "blocked");
			if (s.status === "paused") return this.result(unit, steps, "paused");
			const cor = this.id("cor");
			try {
				switch (s.phase) {
					case "intake":
					case "clarifying":
						unit = await this.stepClarify(unit, cor);
						break;
					case "specifying":
						unit = await this.stepSpecify(unit, cor);
						break;
					case "verification_design":
						unit = await this.stepVerificationDesign(unit, cor);
						break;
					case "preparing":
						unit = await this.stepPrepare(unit, cor);
						break;
					case "designing":
						unit = await this.stepDesign(unit, cor);
						break;
					case "implementing":
						unit = await this.stepImplement(unit, cor);
						break;
					case "verifying":
						unit = await this.stepVerify(unit, cor);
						break;
					case "reviewing":
						unit = await this.stepReview(unit, cor);
						break;
					case "deciding":
						unit = await this.stepDecide(unit, cor);
						break;
					case "integrating":
						unit = await this.stepIntegrate(unit, cor);
						break;
					default:
						return this.result(unit, steps, "blocked");
				}
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
					const blocked = this.tryCommit(current, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: error.code === "CAPABILITY_MISSING" ? "capability_missing" : error.code === "CONFIGURATION_ERROR" ? "configuration_error" : error.code === "POLICY_DENIED" ? "policy_denied" : "execution_error", detail, retryable: error.retryable }, cor);
					unit = blocked.unit;
					if (blocked.error) steps.push(`${s.phase}: the change could not be blocked: ${blocked.error.code} ${blocked.error.message}`);
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

	private async runIntervention(unit: Unit, cor: string, role: InterventionMandate["role"], objective: string, workspacePath: string, extra: { adopted?: ArtifactKind[]; untrusted?: { source: string; text: string }[]; feedback?: string | null; attempt_id?: string | null }): Promise<{ unit: Unit; output: unknown; output_valid: boolean; result: "completed" | "failed" | "cancelled" | "truncated"; intervention_id: string }> {
		await this.interventions.requireCapable(role);
		const interventionId = this.id("int");
		const attemptId = extra.attempt_id ?? (role === "implement" || role === "prepare" ? this.id("att") : null);
		unit = this.commit(unit, { type: "intervention.start", at: this.now(), actor: KERNEL_ACTOR, intervention_id: interventionId, role, attempt_id: attemptId, model: this.deps.model, profile_id: role, profile_qualified: this.interventions.qualifiedFor(role) }, cor);
		if (unit.state.status === "blocked") return { unit, output: null, output_valid: false, result: "failed", intervention_id: interventionId };
		const adopted: { kind: string; artifact_id: string; revision: number; digest: string; text: string }[] = [];
		for (const kind of extra.adopted ?? []) {
			const a = await this.artifacts.latest<unknown>(unit.state, kind);
			if (a) adopted.push({ kind, artifact_id: a.ref.artifact_id, revision: a.ref.revision, digest: a.ref.content_digest, text: typeof a.content === "string" ? a.content : JSON.stringify(a.content, null, 2) });
		}
		const protocol = await this.artifacts.latest<Protocol>(unit.state, "protocol");
		const ctx = buildContext({ role, objective, language: this.language(unit.state), adopted, untrusted: extra.untrusted ?? [], feedback: extra.feedback ?? null, tools: TOOLS_FOR_ROLE[role], budget_bytes: 60_000, controls: (protocol?.content.controls ?? []).map((c) => ({ control_id: c.control_id, command: c.command, cwd: c.cwd })), boundaries: (protocol?.content.controls ?? []).flatMap((c) => c.structure_rules.map((rule) => rule.statement)) });
		// The manifest addresses the prompt and each excerpt by digest; the bytes go to the store, or
		// those digests resolve to nothing and the dossier cannot say what the model read.
		await this.deps.objects.putText(ctx.record, "application/json");
		for (const u of extra.untrusted ?? []) await this.deps.objects.putText(u.text, "text/plain");
		const contextRef = await this.artifacts.store("context", unit.state.change_id, this.id("ctx"), ctx.manifest, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "context", ref: contextRef }, cor);
		// Each tool call is paid for as it happens: what the budget refuses ends the session there.
		const report = await this.interventions.run({ intervention_id: interventionId, change_id: unit.state.change_id, role, objective, workspace_path: workspacePath, prompt: ctx.prompt, system_prompt: ctx.system_prompt, context: ctx.manifest }, () => {
			const consumed = this.tryCommit(unit, { type: "budget.consume", at: this.now(), actor: KERNEL_ACTOR, intervention_id: interventionId, counters: { tool_calls: 1, duration_ms: 0, tokens_known: 0, delegations: 0 } }, cor);
			unit = consumed.unit;
			return consumed.error;
		});
		const outputRef = await this.artifacts.store("output", unit.state.change_id, this.id("out"), { intervention_id: interventionId, role, terminal: report.terminal, events: report.events }, interventionId);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: { actor_id: interventionId, actor_type: "agent", role: role === "review" ? "reviewer_agent" : "producer_agent", origin: "model_output", authentication_level: "none" }, kind: "output", ref: outputRef }, cor);
		unit = this.commit(unit, { type: "intervention.finish", at: this.now(), actor: KERNEL_ACTOR, intervention_id: interventionId, result: report.result, counters: report.counters, detail: report.detail }, cor);
		return { unit, output: report.output, output_valid: report.output_valid, result: report.result, intervention_id: interventionId };
	}

	// --- phase steps -----------------------------------------------------------------------------

	private async stepClarify(unit: Unit, cor: string): Promise<Unit> {
		const reference = await this.artifacts.reference(unit.state);
		const request = await this.artifacts.read<string>(unit.state.request);
		const spec = await this.artifacts.latest<SpecificationReport>(unit.state, "diagnostic");
		let report: SpecificationReport;
		const standing = specificationStanding(unit.state, spec?.content ?? null, await this.artifacts.priorDiagnostics(unit.state));
		if (spec && standing.settled) {
			report = spec.content;
		} else {
			if (standing.reopen) this.progress(`specification reopened by ${standing.ignored.length} material answer(s): ${standing.ignored.map((q) => q.id).join(", ")}`);
			const handle = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
			try {
				const excerpts = await projectExcerpts(reference, handle.path, 12, request);
				const objective = specificationObjective(request, unit.state.open_questions, standing.declared);
				const r = await this.runIntervention(unit, cor, "specify", objective, handle.path, { untrusted: excerpts });
				unit = r.unit;
				if (r.result !== "completed" || !r.output_valid || !Value.Check(OUTPUT_SCHEMAS["specification-report"], r.output)) {
					throw new DomainError("CONFIGURATION_ERROR", `specification intervention ${r.result}${r.result === "completed" ? " with an invalid structured output" : ""}`, { retryable: true, nextActions: ["retry_specification"] });
				}
				report = r.output as SpecificationReport;
			} finally {
				await this.deps.workspace.closeWorkspace(handle.workspace_id, "delete");
			}
			const diagRef = await this.artifacts.store("diagnostic", unit.state.change_id, this.id("dia"), report, KERNEL_ACTOR.actor_id);
			unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "diagnostic", ref: diagRef }, cor);
		}
		const langQ = unit.state.open_questions.find((q) => q.id === "language");
		const language = (langQ?.question.split(":")[1] as "fr" | "en" | undefined) ?? "fr";
		const material = report.questions.filter((q) => q.material && !unit.state.open_questions.some((s) => s.id === q.id && s.answer !== null));
		if (material.length > 0) {
			for (const q of material) {
				if (unit.state.open_questions.some((s) => s.id === q.id)) continue;
				const decisionId = this.id("dec");
				unit = this.commit(unit, { type: "question.open", at: this.now(), actor: KERNEL_ACTOR, id: q.id, question: q.question, material: true, decision_id: decisionId }, cor);
				unit = await this.requestDecision(unit, cor, "IH-01", subjectOfChange(unit.state), [], null, q.question, decisionId, language);
			}
			return unit;
		}
		const mandate: Mandate = { change_id: unit.state.change_id, objective: report.objective, scope: report.requirements.map((r) => r.requirement_id), out_of_scope: report.out_of_scope, assumptions: report.assumptions, open_questions: report.questions.map((q) => ({ id: q.id, question: q.question, material: q.material, answer: unit.state.open_questions.find((s) => s.id === q.id)?.answer ?? (q.material ? null : "non-material, left open") })), allowed_paths: [], integration: this.deps.policy.integration_enabled ? "local_branch" : "disabled", language };
		validate(MandateSchema, mandate, "mandate");
		const mandateRef = await this.artifacts.store("mandate", unit.state.change_id, this.id("mnd"), mandate, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "mandate", ref: mandateRef }, cor);
		unit = this.commit(unit, { type: "gate.evaluate", gate: "G0", at: this.now(), actor: KERNEL_ACTOR, mandate_ref: mandateRef, mandate }, cor);
		return this.requestAdoption(unit, cor, "G0", "mandate", mandateRef, language);
	}

	/**
	 * A gate that asks for the human adoption of an artifact must be able to ask: the decision is
	 * bound to the exact text presented, so a revised artifact is adopted again rather than inheriting
	 * the approval of the one it replaced.
	 */
	private async requestAdoption(unit: Unit, cor: string, gate: "G0" | "G1", kind: "mandate" | "requirements", ref: ArtifactRef, language: "fr" | "en"): Promise<Unit> {
		const decided = unit.state.gates[gate];
		if (!decided || decided.next_action !== "request_decision:IH-02") return unit;
		const subject: SubjectRef = { kind: "artifact", id: ref.artifact_id, revision: ref.revision, digest: ref.content_digest };
		return this.requestDecision(unit, cor, "IH-02", subject, decided.reasons, null, kind, undefined, language);
	}

	private async stepSpecify(unit: Unit, cor: string): Promise<Unit> {
		const spec = await this.artifacts.latest<SpecificationReport>(unit.state, "diagnostic");
		if (!spec) throw new DomainError("EVIDENCE_MISSING", "no specification report");
		const declared = declarationsOfReport(await this.artifacts.priorDiagnostics(unit.state), spec.content);
		const doc: RequirementsDocument = { change_id: unit.state.change_id, requirements: spec.content.requirements.map((r) => ({ requirement_id: r.requirement_id, statement: r.statement, category: r.category, mandatory: r.mandatory, criterion: r.criterion, source: "specification intervention over the original request", contract_family: null, satisfied_by_reference: r.satisfied_by_reference })), answers: answersOf(unit.state, declared), assumptions: spec.content.assumptions, contract_families: {} };
		const issues: string[] = [];
		try {
			validate(RequirementsDocumentSchema, doc, "requirements");
		} catch (error) {
			issues.push((error as Error).message);
		}
		const ref = await this.artifacts.store("requirements", unit.state.change_id, this.id("rqs"), doc, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "requirements", ref }, cor);
		unit = this.commit(unit, { type: "gate.evaluate", gate: "G1", at: this.now(), actor: KERNEL_ACTOR, requirements_ref: ref, requirements: doc, report: { valid: issues.length === 0, issues } }, cor);
		if (unit.state.gates.G1?.verdict === "FAIL") throw new DomainError("PRECONDITION_FAILED", `requirements rejected at G1: ${unit.state.gates.G1.reasons.join("; ")}`, { nextActions: ["revise_requirements"] });
		return this.requestAdoption(unit, cor, "G1", "requirements", ref, this.language(unit.state));
	}

	private async stepVerificationDesign(unit: Unit, cor: string): Promise<Unit> {
		const reference = await this.artifacts.reference(unit.state);
		const requirements = await this.artifacts.latest<RequirementsDocument>(unit.state, "requirements");
		if (!requirements) throw new DomainError("EVIDENCE_MISSING", "requirements missing");
		const refs = requirements.content.requirements.map((r) => ({ requirement_id: r.requirement_id, revision: requirements.ref.revision }));
		const prepared = await this.artifacts.adoptedPreparation(unit.state);
		const handle = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
		try {
			const detection = detectStack(handle.path, refs);
			if (detection.controls.length === 0) throw new DomainError("CAPABILITY_MISSING", detection.capability_missing.join("; ") || "no control available", { nextActions: ["prepare_capabilities"] });
			const ordered = this.verification.orderOf(detection.controls);
			const diagnose = (suite: ReferenceSuiteObservation | null): ControlCapabilityDiagnosis => diagnoseControlCapability({ stack: detection.stack, test_files: referenceTestFiles(reference, detection.preparation_paths), requirements: requirements.content.requirements, suite, prepared });
			// What no existing control can decide is settled before any of them runs: the controls the
			// protocol may freeze are green on the reference, so none of them changes verdict when a
			// behaviour the reference does not have appears. Opening the preparation here spares the
			// qualification of sensors that would have to be qualified again after it.
			let diagnosis = diagnose(null);
			if (diagnosis.undiscriminated_requirements.length > 0 && detection.preparation_paths.length > 0) return await this.openPreparation(unit, cor, detection, refs, diagnosis);
			const qualified = await this.verification.qualify({ change_id: unit.state.change_id, reference, positive: handle, ordered, witnesses: { positive: detection.positive_witness, negative: detection.negative_witness, own_negative: detection.own_negative_witness, tests: detection.witness_tests }, prepared, requirement_refs: refs, prior_protocol_refs: unit.state.proposals.protocol ?? [] });
			diagnosis = diagnose(qualified.observation);
			if (diagnosis.undiscriminated_requirements.length > 0 && detection.preparation_paths.length > 0) return await this.openPreparation(unit, cor, detection, refs, diagnosis);
			// An analyser the target does not provide is an insufficiency the protocol records, not a
			// silence: a coverage measurement nobody produces never reads as covered code (QLT-02).
			if (detection.capability_missing.length > 0) diagnosis = { ...diagnosis, notes: [...diagnosis.notes, ...detection.capability_missing] };
			const protocol = this.verification.freeze({ change_id: unit.state.change_id, ordered, qualifications: qualified.qualifications, diagnosis, requirements: requirements.content, requirements_revision: requirements.ref.revision, prepared });
			const ref = await this.artifacts.store("protocol", unit.state.change_id, protocol.protocol_id, protocol, KERNEL_ACTOR.actor_id);
			unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "protocol", ref }, cor);
			unit = this.commit(unit, { type: "gate.evaluate", gate: "G2", at: this.now(), actor: KERNEL_ACTOR, protocol_ref: ref, protocol }, cor);
			if (unit.state.gates.G2?.verdict !== "PASS") {
				const g2 = unit.state.gates.G2!;
				const unqualified = Object.entries(qualified.qualifications).filter(([, q]) => !q.qualified).map(([id, q]) => `${id}: ${q.notes.join(", ")}`);
				throw new DomainError("CAPABILITY_MISSING", `protocol not frozen: ${[...new Set([...g2.reasons, ...unqualified])].join("; ")}`, { nextActions: ["prepare_capabilities", "fix_reference_tests"] });
			}
			return unit;
		} finally {
			await this.deps.workspace.closeWorkspace(handle.workspace_id, "delete");
		}
	}

	/**
	 * Opens the bounded preparation mandate the diagnosis calls for (SA-008). Two refused rounds are
	 * enough: a third spends the same budget on the same gap, and the change stops on a missing
	 * capability instead.
	 */
	private async openPreparation(unit: Unit, cor: string, detection: StackDetection, refs: RequirementRef[], diagnosis: ControlCapabilityDiagnosis): Promise<Unit> {
		const alreadyTried = (unit.state.proposals.preparation ?? []).filter((a) => a.artifact_id.startsWith("prep_")).length;
		if (alreadyTried >= 2) throw new DomainError("CAPABILITY_MISSING", `no discriminant test could be prepared after two preparation interventions: ${diagnosis.notes.join("; ")}`, { nextActions: ["prepare_capabilities", "assign_human_decision"] });
		const objective = preparationMandateObjective(detection.stack, detection.preparation_paths, diagnosis.undiscriminated_requirements);
		const mandate = { objective, allowed_paths: detection.preparation_paths, requirement_ids: refs.map((r) => r.requirement_id), stack: detection.stack };
		const ref = await this.artifacts.store("preparation", unit.state.change_id, this.id("prp"), { ...mandate, kind: "preparation-mandate", diagnosis }, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
		return this.commit(unit, { type: "preparation.open", at: this.now(), actor: KERNEL_ACTOR, mandate_ref: ref }, cor);
	}

	/** Preparation intervention, then kernel qualification of the proposed tests (SA-008, SA-009, PRE-03). */
	private async stepPrepare(unit: Unit, cor: string): Promise<Unit> {
		const reference = await this.artifacts.reference(unit.state);
		const mandateArt = await this.artifacts.latest<{ objective: string; allowed_paths: string[]; requirement_ids: string[]; stack: StackDetection["stack"] }>(unit.state, "preparation");
		if (!mandateArt) throw new DomainError("EVIDENCE_MISSING", "preparation mandate missing");
		const mandate = mandateArt.content;
		const previousRef = [...(unit.state.proposals.preparation ?? [])].reverse().find((ref) => ref.artifact_id.startsWith("prep_"));
		const previous = previousRef ? await this.artifacts.read<PreparationRecord>(previousRef) : null;
		const feedback = previous ? `The previous preparation was refused. Keep every change inside the allowed paths.\n${previous.notes.map((note) => `- ${note}`).join("\n")}` : null;
		const handle = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
		try {
			const detected = detectStack(handle.path, mandate.requirement_ids.map((id) => ({ requirement_id: id, revision: 1 })));
			if (detected.stack !== mandate.stack || !samePreparationPaths(mandate.allowed_paths, detected.preparation_paths)) {
				const record: PreparationRecord = { preparation_id: this.id("prc"), objective: mandate.objective, allowed_paths: mandate.allowed_paths, files: [], on_reference: "NOT_RUN", discriminant: false, loadable: false, qualified: false, notes: [`preparation mandate scope is stale; detected ${detected.stack} paths: ${detected.preparation_paths.join(", ") || "none"}`] };
				const ref = await this.artifacts.store("preparation", unit.state.change_id, record.preparation_id, record, KERNEL_ACTOR.actor_id);
				unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
				return this.commit(unit, { type: "preparation.close", at: this.now(), actor: KERNEL_ACTOR, qualified: false, capability_ids: [], adopted_ref: null }, cor);
			}
			const adoptedRequirements = await this.artifacts.latest<RequirementsDocument>(unit.state, "requirements").catch(() => null);
			const excerpts = await projectExcerpts(reference, handle.path, 10, focusOf(mandate.objective, adoptedRequirements?.content.requirements ?? []));
			const r = await this.runIntervention(unit, cor, "prepare", preparationObjective(mandate.objective, mandate.requirement_ids), handle.path, { adopted: ["mandate", "requirements"], untrusted: excerpts, feedback });
			unit = r.unit;
			if (unit.state.status === "blocked") return unit;
			const notes: string[] = [];
			if (r.result !== "completed") notes.push(`preparation intervention ${r.result}`);
			const manifest = await this.deps.workspace.snapshotCandidate(handle, reference, this.deps.workspacePolicy);
			const { files, out_of_scope } = preparedFilesFrom(manifest, mandate.allowed_paths);
			for (const p of out_of_scope) notes.push(`change outside the preparation mandate refused: ${p}`);
			if (files.length === 0) notes.push("no test file was produced");
			// loadability and discriminance against the bare reference
			const detection = detected;
			let onReference: PreparationRecord["on_reference"] = "NOT_RUN";
			let loadable = false;
			if (files.length > 0 && detection.controls[0]) {
				const control = detection.controls[0];
				const base = { control, protocol: { protocol_id: "preparation", revision: 0, content_digest: digestValue("preparation") }, candidate: { candidate_id: "preparation", manifest_digest: manifest.manifest_digest, base_digest: reference.tree_digest, workspace_id: handle.workspace_id }, subject: { kind: "fixture" as const, id: reference.reference_id, revision: 1, digest: reference.tree_digest }, workspace_path: handle.path, environment: this.deps.environment, requirement_refs: [], producer: EXECUTOR_ACTOR };
				const run = await this.deps.controls.runControl(base);
				onReference = run.evidence.verdict;
				const tests = Number(run.evidence.facts.tests ?? 0);
				loadable = onReference === "PASS" || (onReference === "FAIL" && tests > 0);
				if (onReference === "INDETERMINATE") notes.push(`prepared suite is not loadable or produced no test: ${run.evidence.limits.notes.join("; ")}`);
			}
			for (const f of files) {
				const bytes = await this.deps.objects.get(f.digest);
				if (!bytes) {
					const { readFile } = await import("node:fs/promises");
					await this.deps.objects.put(new Uint8Array(await readFile(join(handle.path, f.path))), "text/plain; charset=utf-8");
				}
			}
			const discriminant = onReference === "FAIL";
			if (!discriminant && onReference === "PASS") notes.push("prepared suite passes on the reference: it does not detect the absent feature (recorded, not adopted as discriminant)");
			const qualified = out_of_scope.length === 0 && files.length > 0 && loadable && discriminant;
			const record: PreparationRecord = { preparation_id: this.id("prep"), objective: mandate.objective, allowed_paths: mandate.allowed_paths, files, on_reference: onReference, discriminant, loadable, qualified, notes };
			const ref = await this.artifacts.store("preparation", unit.state.change_id, record.preparation_id, record, KERNEL_ACTOR.actor_id);
			unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
			return this.commit(unit, { type: "preparation.close", at: this.now(), actor: KERNEL_ACTOR, qualified, capability_ids: files.map((f) => f.path), adopted_ref: qualified ? ref : null }, cor);
		} finally {
			await this.deps.workspace.closeWorkspace(handle.workspace_id, "delete");
		}
	}

	private async stepDesign(unit: Unit, cor: string): Promise<Unit> {
		const spec = await this.artifacts.latest<SpecificationReport>(unit.state, "diagnostic");
		if (!spec) throw new DomainError("EVIDENCE_MISSING", "no specification report");
		const design: Design = { change_id: unit.state.change_id, summary: spec.content.design.summary, components: spec.content.design.components, interfaces: spec.content.design.interfaces, alternatives: [], risks: [...spec.content.risks, ...spec.content.design.risks], requirement_ids: unit.state.requirement_ids, compatible_with_mandate: true, executable: spec.content.design.summary.trim().length > 0 };
		const ref = await this.artifacts.store("design", unit.state.change_id, this.id("dsg"), design, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "design", ref }, cor);
		unit = this.commit(unit, { type: "gate.evaluate", gate: "G3", at: this.now(), actor: KERNEL_ACTOR, design_ref: ref, design }, cor);
		if (unit.state.gates.G3?.verdict === "FAIL") throw new DomainError("PRECONDITION_FAILED", `design rejected at G3: ${unit.state.gates.G3.reasons.join("; ")}`);
		return unit;
	}

	private async stepImplement(unit: Unit, cor: string): Promise<Unit> {
		const reference = await this.artifacts.reference(unit.state);
		const open = unit.state.attempts.find((a) => a.result === "open");
		const attemptId = open?.attempt_id ?? this.id("att");
		const existing = this.deps.ledger.listArtifacts(unit.state.change_id, "candidate").find((a) => a.ref.artifact_id === `ws_${attemptId}`);
		let workspaceId: string;
		let workspacePath: string;
		if (existing) {
			const rec = await this.artifacts.read<{ workspace_id: string; path: string }>(existing.ref);
			workspaceId = rec.workspace_id;
			workspacePath = rec.path;
		} else {
			const h = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
			workspaceId = h.workspace_id;
			workspacePath = h.path;
			await this.artifacts.materializePrepared(await this.artifacts.adoptedPreparation(unit.state), h.path);
			await this.artifacts.store("candidate", unit.state.change_id, `ws_${attemptId}`, { workspace_id: h.workspace_id, path: h.path }, KERNEL_ACTOR.actor_id);
		}
		const lastFeedback = unit.state.feedback.at(-1);
		const priorFeedback = lastFeedback ? await this.artifacts.read<string>({ artifact_id: `fb_${lastFeedback.attempt_id}`, revision: 1 }).catch(() => null) : null;
		const truncatedBefore = unit.state.interventions.filter((i) => i.attempt_id === attemptId && i.result === "truncated").length;
		const resume = resumeNote(truncatedBefore);
		const feedback = [resume, priorFeedback].filter((x): x is string => Boolean(x)).join("\n\n") || null;
		const mandate = await this.artifacts.latest<Mandate>(unit.state, "mandate");
		const objective = implementObjective(mandate?.content.objective ?? null);
		const adoptedRequirements = await this.artifacts.latest<RequirementsDocument>(unit.state, "requirements").catch(() => null);
		const excerpts = await projectExcerpts(reference, workspacePath, 10, focusOf(objective, adoptedRequirements?.content.requirements ?? []));
		const r = await this.runIntervention(unit, cor, "implement", objective, workspacePath, { adopted: ["mandate", "requirements", "protocol", "design"], feedback, attempt_id: attemptId, untrusted: excerpts });
		unit = r.unit;
		if (unit.state.status === "blocked") return unit;
		if (r.result === "cancelled") return this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "execution_error", detail: "producer intervention cancelled" }, cor);
		if (r.result === "truncated" && truncatedBefore < this.deps.policy.budgets.max_continuations) {
			// The attempt stays open on its workspace: the next step resumes there instead of
			// rebuilding from the reference, which would throw away everything just written.
			this.progress(`producer resumes on workspace ${workspaceId} (continuation ${truncatedBefore + 1}/${this.deps.policy.budgets.max_continuations}); the increment budget still bounds the whole change`);
			return unit;
		}
		if (r.result === "failed") {
			const failed = this.commit(unit, { type: "operation.fail", at: this.now(), actor: KERNEL_ACTOR, operation_key: `intervention:${attemptId}` }, cor);
			return failed;
		}
		this.progress("freezing the candidate");
		const wsHandle = { workspace_id: workspaceId, path: workspacePath, reference_id: reference.reference_id, created_at: this.now() };
		const manifest = await this.deps.workspace.snapshotCandidate(wsHandle, reference, this.deps.workspacePolicy);
		const manifestRef = await this.artifacts.store("candidate", unit.state.change_id, manifest.candidate_id, manifest, KERNEL_ACTOR.actor_id);
		// Keep the bytes of every changed file so that the dossier stays self-contained (EVD-01), and
		// keep them on both sides: without the reference text of a file the candidate modified, the
		// lines this change introduced could not be recomputed from the dossier alone (QLT-04).
		const changed = manifest.entries.filter((e) => e.kind === "file" && e.content_digest !== null && e.baseline_state !== "unchanged");
		// The reference side is read from the project the snapshot was taken from, and only for the paths
		// that snapshot holds as files: a path that became a symlink has no reference text to diff.
		const referenceFiles = new Set(reference.entries.filter((e) => e.kind === "file" && e.content_digest !== null).map((e) => e.path));
		const files = await this.artifacts.storeBytesOf(workspacePath, changed.filter((e) => e.baseline_state !== "deleted").map((e) => e.path));
		const baseFiles = await this.artifacts.storeBytesOf(reference.project_path, changed.filter((e) => e.baseline_state !== "added" && referenceFiles.has(e.path)).map((e) => e.path));
		await this.artifacts.store("candidate", unit.state.change_id, `files_${manifest.candidate_id}`, files, KERNEL_ACTOR.actor_id);
		await this.artifacts.store("candidate", unit.state.change_id, `base_files_${manifest.candidate_id}`, baseFiles, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "candidate", ref: manifestRef }, cor);
		const prepared = await this.artifacts.adoptedPreparation(unit.state);
		const scope = protectedPathsChanged(manifest, unit.state.protocol?.protected_paths ?? [], prepared?.files ?? [], (p) => mirrorsProductionResource(manifest, p));
		const producerReport = r.output_valid ? (r.output as ProducerReport) : null;
		const truncatedNote = r.result === "truncated" ? [`the producer was stopped by the duration budget ${truncatedBefore + 1} time(s) and never reported itself finished`] : [];
		unit = this.commit(unit, { type: "candidate.freeze", at: this.now(), actor: KERNEL_ACTOR, attempt_id: attemptId, facts: { candidate: { candidate_id: manifest.candidate_id, manifest_digest: manifest.manifest_digest, base_digest: manifest.base_digest, workspace_id: wsHandle.workspace_id }, entry_count: manifest.entries.length, changed_paths: scope.changed, out_of_scope_paths: [], altered_protected_paths: scope.altered, allowed_protected_paths: scope.allowed, complete: !manifest.limits.truncated, limits_notes: [...manifest.limits.notes, ...truncatedNote, ...(producerReport ? [] : ["producer output invalid or missing"])] } }, cor);
		return unit;
	}

	private async stepVerify(unit: Unit, cor: string): Promise<Unit> {
		const state = unit.state;
		if (!state.candidate || !state.protocol) throw new DomainError("PRECONDITION_FAILED", "candidate and protocol required");
		const protocol = await this.artifacts.latest<Protocol>(state, "protocol");
		const manifest = await this.artifacts.read<CandidateManifest>({ artifact_id: state.candidate.candidate_id, revision: 1 });
		if (!protocol) throw new DomainError("EVIDENCE_MISSING", "protocol document missing");
		const reference = await this.artifacts.reference(state);
		const opId = this.id("op");
		unit = this.commit(unit, { type: "verification.start", at: this.now(), actor: KERNEL_ACTOR, operation_id: opId, idempotency_key: `verify:${state.candidate.manifest_digest}:${state.evidence.length}` }, cor);
		const outcome = await this.verification.run({ change_id: state.change_id, protocol: protocol.content, protocol_ref: state.protocol.ref, candidate: state.candidate, manifest, reference, workspace_path: this.deps.workspace.workspacePath(state.candidate.workspace_id) });
		if (outcome.candidate_moved) {
			unit = this.commit(unit, { type: "verification.complete", at: this.now(), actor: KERNEL_ACTOR, operation_id: opId }, cor);
			return this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "execution_error", detail: "the frozen candidate was modified during verification; evidence not recorded" }, cor);
		}
		unit = this.commit(unit, { type: "verification.record", at: this.now(), actor: EXECUTOR_ACTOR, evidence: outcome.facts }, cor);
		return this.commit(unit, { type: "verification.complete", at: this.now(), actor: KERNEL_ACTOR, operation_id: opId }, cor);
	}

	private async stepReview(unit: Unit, cor: string): Promise<Unit> {
		const state = unit.state;
		if (!state.candidate || !state.protocol) throw new DomainError("PRECONDITION_FAILED", "candidate and protocol required");
		const workspacePath = this.deps.workspace.workspacePath(state.candidate.workspace_id);
		for (const role of state.protocol.required_reviews) {
			if (state.reviews.some((r) => r.valid && r.reviewer_role === role && r.subject_digest === state.candidate!.manifest_digest)) continue;
			const manifest = await this.artifacts.read<CandidateManifest>({ artifact_id: state.candidate.candidate_id, revision: 1 });
			const r = await this.runIntervention(unit, cor, "review", reviewObjective(role, manifest.selected_paths), workspacePath, { adopted: ["mandate", "requirements", "design"] });
			unit = r.unit;
			const report = r.result === "completed" && r.output_valid ? (r.output as ReviewReport) : null;
			const reviewId = this.id("rev");
			await this.artifacts.store("review", unit.state.change_id, reviewId, report ?? { invalid: true, result: r.result }, r.intervention_id);
			if (!report) continue;
			unit = this.commit(unit, { type: "review.record", at: this.now(), actor: { actor_id: r.intervention_id, actor_type: "agent", role: "reviewer_agent", origin: "model_output", authentication_level: "none" }, review_id: reviewId, reviewer_role: role, subject_digest: state.candidate.manifest_digest, conclusion: report.conclusion, blocking_findings: report.findings.filter((f) => f.severity === "blocker").length }, cor);
		}
		return this.commit(unit, { type: "review.complete", at: this.now(), actor: KERNEL_ACTOR }, cor);
	}

	private async stepDecide(unit: Unit, cor: string): Promise<Unit> {
		const g4 = unit.state.gates.G4;
		if (g4 && g4.verdict === "FAIL" && !unit.state.gates.G5) {
			return this.correctOrStop(unit, cor, `G4 failed: ${g4.reasons.join("; ")}`);
		}
		unit = this.commit(unit, { type: "gate.evaluate", gate: "G5", at: this.now(), actor: KERNEL_ACTOR, decision_id: null }, cor);
		const g5 = unit.state.gates.G5!;
		if (g5.verdict === "PASS") return unit;
		const language = this.language(unit.state);
		const subject: SubjectRef = { kind: "candidate", id: unit.state.candidate!.candidate_id, revision: 1, digest: unit.state.candidate!.manifest_digest };
		if (g5.next_action === "request_decision:IH-10") return this.requestDecision(unit, cor, "IH-10", subject, g5.reasons, null, undefined, undefined, language);
		if (g5.next_action === "request_decision:IH-08") return this.requestDecision(unit, cor, "IH-08", subject, g5.reasons, null, undefined, undefined, language);
		if (g5.next_action === "resolve_incident") {
			// Re-running a frozen candidate through a frozen protocol is a pure function: it can only
			// answer differently when the last observation was a transient incident. Anything else is
			// a property of the candidate, and spending the retry budget on it proves nothing.
			if (!retryCanDiffer(this.indeterminateObservations(unit.state))) {
				return this.correctOrStop(unit, cor, `${g5.reasons.join("; ")} — re-running the frozen candidate cannot change this observation`);
			}
			const key = `verify:${unit.state.candidate!.manifest_digest}`;
			const retried = this.commit(unit, { type: "operation.fail", at: this.now(), actor: KERNEL_ACTOR, operation_key: key }, cor);
			if (retried.state.status === "blocked") return retried;
			return this.commit(retried, { type: "verification.rerun", at: this.now(), actor: KERNEL_ACTOR, reason: `indeterminate controls: ${g5.indeterminate_requirements.join(", ")} (technical retry)` }, cor);
		}
		return this.correctOrStop(unit, cor, g5.reasons.join("; "));
	}

	/** The indeterminate observations recorded on the frozen candidate, oldest first. */
	private indeterminateObservations(state: ChangeState): Evidence[] {
		const digest = state.candidate?.manifest_digest;
		if (!digest) return [];
		return state.evidence
			.filter((e) => e.valid && e.subject_digest === digest && e.verdict === "INDETERMINATE")
			.map((e) => this.deps.ledger.getEvidence(e.evidence_id))
			.filter((e): e is Evidence => e !== null);
	}

	private async correctOrStop(unit: Unit, cor: string, why: string): Promise<Unit> {
		const state = unit.state;
		const feedback = await buildFeedback(state, why, this.feedbackSources());
		const attemptId = this.id("att");
		const current = state.attempts.at(-1);
		if (current) await this.artifacts.store("feedback", state.change_id, `fb_${current.attempt_id}`, feedback.text, KERNEL_ACTOR.actor_id);
		const next = this.commit(unit, { type: "correction.authorize", at: this.now(), actor: KERNEL_ACTOR, attempt_id: attemptId, feedback: { digest: digestBytes(feedback.text), bytes: feedback.bytes, truncated: feedback.truncated } }, cor);
		if (next.state.status === "blocked" && next.state.stop_reason === "attempts_exhausted") {
			return this.requestDecision(next, cor, "IH-07", subjectOfChange(next.state), [why], "stop", `${next.state.budgets.attempts_used}/${next.state.budgets.max_attempts}`, undefined, this.language(next.state));
		}
		return next;
	}

	private async stepIntegrate(unit: Unit, cor: string): Promise<Unit> {
		if (!this.deps.policy.integration_enabled) return this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "policy_denied", detail: "integration is disabled by policy" }, cor);
		if (!unit.state.integration_authorization_id) {
			const subject: SubjectRef = { kind: "candidate", id: unit.state.candidate!.candidate_id, revision: 1, digest: unit.state.candidate!.manifest_digest };
			return this.requestDecision(unit, cor, "IH-11", subject, [], "integrate", "the project branch", undefined, this.language(unit.state));
		}
		if (!this.integrator) return this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "capability_missing", detail: "no Git integrator configured" }, cor);
		return this.integrator(unit, cor);
	}

	/** Injected by the Git integration module (IT-4) to keep this controller free of Git details. */
	integrator: ((unit: Unit, cor: string) => Promise<Unit>) | null = null;

	// --- human decisions -----------------------------------------------------------------------------

	private async requestDecision(unit: Unit, cor: string, interaction: Exclude<HumanInteraction, "IH-03" | "IH-04" | "IH-05" | "IH-06" | "IH-09">, subject: SubjectRef, facts: string[], recommendation: string | null, arg?: string, decisionId?: string, language: "fr" | "en" = "fr"): Promise<Unit> {
		const request = buildDecisionRequest({ decision_id: decisionId ?? this.id("dec"), change_id: unit.state.change_id, interaction, subject, language, facts, recommendation, ...(arg !== undefined ? { arg } : {}), requested_at: this.now() });
		this.deps.ledger.putDecisionRequest(request);
		const next = this.commit(unit, { type: "decision.request", at: this.now(), actor: KERNEL_ACTOR, request }, cor);
		this.deps.onDecisionRequested?.(request);
		return next;
	}

	/** Opens a read-only review of the frozen candidate (or of the reference alone). Identical data in every Pi entry (RM-066). */
	async openReview(changeId: string, candidateId?: string): Promise<{ snapshot: ReviewSnapshot; changes(path: string, status: PathStatus, oldPath: string | null): Promise<ChangePage>; content(path: string, side: "old" | "new", start: number, limit: number): Promise<ContentPage> }> {
		const { state } = this.load(changeId);
		const reference = await this.artifacts.reference(state);
		const wanted = candidateId ?? state.candidate?.candidate_id ?? null;
		const manifest = wanted ? await this.artifacts.read<CandidateManifest>({ artifact_id: wanted, revision: 1 }).catch(() => null) : null;
		const workspacePath = manifest ? this.deps.workspace.workspacePath(manifest.workspace_id) : null;
		const findings: (Finding & { evidence_id: string })[] = [];
		for (const e of state.evidence.filter((x) => x.valid && manifest && x.subject_digest === manifest.manifest_digest)) {
			const ev = this.deps.ledger.getEvidence(e.evidence_id);
			if (ev) for (const f of ev.findings) findings.push({ ...f, evidence_id: ev.evidence_id });
		}
		const newer = manifest && state.candidate && state.candidate.candidate_id !== manifest.candidate_id ? state.candidate.candidate_id : null;
		const snapshot = buildSnapshot({ change_id: changeId, reference, manifest, findings, newer_candidate: newer, now: this.now() });
		const sources = { referencePath: reference.project_path, workspacePath, reference, manifest, maxBytes: FILE_READ_BUDGET_BYTES };
		return { snapshot, changes: (path, status, oldPath) => readChanges(sources, path, status, oldPath), content: (path, side, start, limit) => readContent(sources, path, side, { start_line: start, limit }) };
	}

	pendingDecisions(changeId: string): DecisionRequest[] {
		const unit = this.load(changeId);
		return unit.state.pending_decisions.map((d) => this.deps.ledger.getDecisionRequest(d.decision_id)).filter((d): d is DecisionRequest => d !== null);
	}

	/** Records a human decision; provenance is provided by the host adapter, never by the content (ADR-014). */
	answerDecision(changeId: string, response: DecisionResponse, origin: HumanOrigin): { view: StatusView; decision: HumanDecision | null; error: DomainError | null } {
		const cor = this.id("cor");
		let unit = this.load(changeId);
		const request = this.deps.ledger.getDecisionRequest(response.decision_id);
		if (!request) return { view: this.status(changeId), decision: null, error: new DomainError("UNKNOWN_REFERENCE", `decision ${response.decision_id} not found`) };
		const humanDecisionId = this.id("hd");
		const actor: ActorRef = origin.actor;
		const res = this.tryCommit(unit, { type: "decision.answer", at: this.now(), actor, human_decision_id: humanDecisionId, response, origin }, cor);
		unit = res.unit;
		if (res.error) return { view: this.status(changeId), decision: null, error: res.error };
		const decision: HumanDecision = { human_decision_id: humanDecisionId, request, response, origin, recorded_at: this.now(), revoked: false };
		this.deps.ledger.putHumanDecision(decision, changeId);
		if (request.interaction === "IH-01" && response.option_id === "abandon") unit = this.commit(unit, { type: "change.cancel", at: this.now(), actor, reason: "abandoned at clarification" }, cor);
		if (request.interaction === "IH-10" && response.option_id === "correct") {
			unit = this.commit(unit, { type: "gate.evaluate", gate: "G5", at: this.now(), actor: KERNEL_ACTOR, decision_id: humanDecisionId }, cor);
		}
		if (request.interaction === "IH-11" && (response.option_id === "export_only" || response.option_id === "cancel")) {
			unit = this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "policy_denied", detail: "integration declined by the change owner; the change stays accepted and exportable" }, cor);
		}
		if (request.interaction === "IH-02" && response.option_id === "refuse") {
			unit = this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "policy_denied", detail: `adoption refused by the change owner${response.free_text ? `: ${response.free_text}` : ""}` }, cor);
		}
		if (request.interaction === "IH-07" && response.option_id === "stop") {
			unit = this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "attempts_exhausted", detail: "budget extension refused" }, cor);
		}
		return { view: this.status(changeId), decision, error: null };
	}

	// --- explicit operations -------------------------------------------------------------------------

	async verify(changeId: string): Promise<AdvanceResult> {
		const cor = this.id("cor");
		let unit = this.load(changeId);
		if (unit.state.phase !== "verifying") {
			unit = this.commit(unit, { type: "verification.rerun", at: this.now(), actor: KERNEL_ACTOR, reason: "explicit re-verification requested" }, cor);
		}
		unit = await this.stepVerify(unit, cor);
		return { view: this.status(changeId), steps: ["verify"], stopped_because: unit.state.status === "blocked" ? "blocked" : "max_steps" };
	}

	pause(changeId: string, actor: ActorRef): StatusView {
		let unit = this.load(changeId);
		const running = runningIntervention(unit.state);
		if (running) unit = this.commit(unit, { type: "intervention.finish", at: this.now(), actor: KERNEL_ACTOR, intervention_id: running.intervention_id, result: "cancelled", counters: { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 }, detail: "paused" }, this.id("cor"));
		this.commit(unit, { type: "change.pause", at: this.now(), actor }, this.id("cor"));
		return this.status(changeId);
	}

	resume(changeId: string, actor: ActorRef): StatusView {
		const unit = this.load(changeId);
		const cor = this.id("cor");
		const running = runningIntervention(unit.state);
		let u = unit;
		if (running) u = this.commit(u, { type: "intervention.finish", at: this.now(), actor: KERNEL_ACTOR, intervention_id: running.intervention_id, result: "failed", counters: { tool_calls: 0, duration_ms: 0, tokens_known: 0, delegations: 0 }, detail: "intervention was running when the session stopped; treated as failed on resume" }, cor);
		if (u.state.operation && u.state.operation.kind === "verification") u = this.commit(u, { type: "verification.rerun", at: this.now(), actor: KERNEL_ACTOR, reason: "verification was interrupted; it will be re-run" }, cor);
		if (u.state.status === "paused") u = this.commit(u, { type: "change.resume", at: this.now(), actor }, cor);
		// A block whose cause the kernel declared retryable is lifted whatever its class: the change
		// goes back to the step that threw and redoes it. Declaring an error retryable and leaving no
		// entry able to act on it is what loses a change on an invalid structured output.
		else if (u.state.status === "blocked" && (u.state.stop_reason === "execution_error" || u.state.stop_retryable)) u = this.tryCommit(u, { type: "change.unblock", at: this.now(), actor: KERNEL_ACTOR }, cor).unit;
		return this.status(changeId);
	}

	cancel(changeId: string, actor: ActorRef, reason: string): StatusView {
		this.commit(this.load(changeId), { type: "change.cancel", at: this.now(), actor, reason }, this.id("cor"));
		return this.status(changeId);
	}
}
