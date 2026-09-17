/**
 * Application controller (CMP-APP): coordinates the use cases, opens units of work, calls the
 * ports and commits results. It never computes a verdict itself (AT-01): every normative change
 * goes through the domain reducer and is appended atomically to the ledger.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Value } from "typebox/value";
import { canonicalize } from "../contracts/canonical.ts";
import { digestBytes, digestValue } from "../contracts/digest.ts";
import { validate } from "../contracts/validate.ts";
import type { ActorRef, ArtifactRef, EnvironmentRef, HumanInteraction, SubjectRef } from "../contracts/v1/common.ts";
import type { CandidateManifest, ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { DecisionRequest, DecisionResponse, HumanDecision, HumanOrigin } from "../contracts/v1/decision.ts";
import { Evidence, EvidenceCandidate, evidenceDigest } from "../contracts/v1/evidence.ts";
import { Mandate as MandateSchema, RequirementsDocument as RequirementsDocumentSchema, type Design, type Mandate, type Protocol, type RequirementsDocument, type Obligation, type ControlDefinition } from "../contracts/v1/protocol.ts";
import { OUTPUT_SCHEMAS, TOOLS_FOR_ROLE, type ProducerReport, type ReviewReport, type SpecificationReport } from "../contracts/v1/reports.ts";
import { apply } from "../domain/change/apply.ts";
import type { ChangeCommand, EvidenceFact } from "../domain/change/commands.ts";
import type { ChangeEvent } from "../domain/change/events.ts";
import { decide } from "../domain/change/decide.ts";
import { runningIntervention, subjectOfChange, type ArtifactKind, type ChangeState } from "../domain/change/state.ts";
import { DomainError } from "../domain/errors.ts";
import type { ActivePolicy } from "../domain/policy.ts";
import { decideProgram, type ProgramCommand, type ProgramState } from "../domain/program/program.ts";
import type { LedgerPort } from "../ports/ledger.ts";
import type { ObjectStorePort } from "../ports/object-store.ts";
import type { AgentPort, ControlExecutionPort, InterventionEvent, InterventionMandate, ModelSelection, SandboxProfile, SandboxSelection, WorkspacePolicy, WorkspacePort } from "../ports/execution.ts";
import { qualifyControlDetailed } from "./qualification.ts";
import { buildContext, outputSchemaFor } from "./context.ts";
import { buildDecisionRequest } from "./decisions.ts";
import type { Clock, IdSource } from "./ids.ts";
import { detectStack, type StackDetection } from "./target.ts";
import { isProtectedPrepared, preparedFilesFrom, referenceHasTests, samePreparationPaths, type PreparationRecord } from "./preparation.ts";
import { statusView, type StatusView } from "./views.ts";
import { buildSnapshot, readChanges, readContent, type ChangePage, type ContentPage, type PathStatus, type ReviewSnapshot } from "./review.ts";
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
	model: ModelSelection;
	instance_id: string;
	/** Absolute paths never readable by workers (data dir). */
	denied_read_paths: string[];
	/** Called when a decision is requested (presentation hook, never authoritative). */
	onDecisionRequested?: (request: DecisionRequest) => void;
	onProgress?: (message: string) => void;
}

export const KERNEL_ACTOR: ActorRef = { actor_id: "495-kernel", actor_type: "kernel", role: "kernel", origin: "kernel", authentication_level: "host_qualified" };
export const EXECUTOR_ACTOR: ActorRef = { actor_id: "495-executor", actor_type: "executor", role: "executor", origin: "executor", authentication_level: "host_qualified" };

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
	private activeHandle: { abort(reason: string): Promise<void> } | null = null;
	constructor(deps: HarnessDeps) {
		this.deps = deps;
	}

	/** Cancels the intervention currently supervised, if any (§12.3). */
	async abortCurrent(reason: string): Promise<boolean> {
		if (!this.activeHandle) return false;
		await this.activeHandle.abort(reason);
		return true;
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

	async storeArtifact(kind: ArtifactKind, changeId: string, artifactId: string, content: unknown, producerId: string): Promise<ArtifactRef> {
		const obj = await this.deps.objects.put(new TextEncoder().encode(typeof content === "string" ? content : canonicalize(content)), typeof content === "string" ? "text/plain; charset=utf-8" : "application/json");
		return this.deps.ledger.putArtifact(kind, changeId, artifactId, obj, producerId, this.now());
	}

	private storeEvidence(changeId: string, candidate: EvidenceCandidate, evidenceId: string): Evidence {
		validate(EvidenceCandidate, candidate, "evidence-candidate");
		const evidence: Evidence = { evidence_id: evidenceId, requirement_refs: candidate.requirement_refs, control_id: candidate.control_id, control_version: candidate.control_version, subject: candidate.subject, protocol_revision: candidate.protocol_revision, environment_digest: candidate.environment.digest, inputs_digest: candidate.inputs_digest, started_at: candidate.started_at, ended_at: candidate.ended_at, verdict: candidate.verdict, facts: candidate.facts, findings: candidate.findings, artifacts: candidate.artifacts, limits: candidate.limits, producer: candidate.producer, integrity: { content_digest: "", chained_to: null } };
		evidence.integrity.content_digest = evidenceDigest(evidence);
		validate(Evidence, evidence, "evidence");
		this.deps.ledger.putEvidence(evidence, changeId);
		return evidence;
	}

	async readArtifact<T>(ref: Pick<ArtifactRef, "artifact_id" | "revision">): Promise<T> {
		const stored = this.deps.ledger.getArtifact(ref);
		if (!stored) throw new DomainError("EVIDENCE_MISSING", `artifact ${ref.artifact_id} r${ref.revision} is missing from the ledger`);
		const bytes = await this.deps.objects.get(stored.object);
		if (!bytes) throw new DomainError("EVIDENCE_MISSING", `object ${stored.object.digest} is missing from the store`);
		const text = new TextDecoder().decode(bytes);
		if (digestBytes(bytes) !== stored.object.digest) throw new DomainError("EVIDENCE_STALE", `object ${stored.object.digest} is corrupted`);
		return (stored.object.media_type.startsWith("application/json") ? JSON.parse(text) : text) as T;
	}

	async latestArtifact<T>(state: ChangeState, kind: ArtifactKind): Promise<{ ref: ArtifactRef; content: T } | null> {
		const adopted = state.adopted[kind];
		const ref = adopted?.ref ?? state.proposals[kind]?.at(-1);
		if (!ref) return null;
		return { ref, content: await this.readArtifact<T>(ref) };
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
		const requestRef = await this.storeArtifact("request", changeId, this.id("req"), args.request_text, args.actor.actor_id);
		const referenceRef = await this.storeArtifact("reference", changeId, this.id("ref"), reference, KERNEL_ACTOR.actor_id);
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
					const blocked = this.tryCommit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: error.code === "CAPABILITY_MISSING" ? "capability_missing" : error.code === "CONFIGURATION_ERROR" ? "configuration_error" : error.code === "POLICY_DENIED" ? "policy_denied" : "execution_error", detail: `${error.code}: ${error.message}` }, cor);
					unit = blocked.unit;
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

	private profileFor(role: InterventionMandate["role"], workspacePath: string): SandboxProfile {
		const writes = role === "implement" || role === "prepare" ? [workspacePath] : [];
		return { profile_id: role, read_paths: [workspacePath], write_paths: writes, network: "denied", env_allowlist: ["PATH", "HOME", "TMPDIR", "LANG"], env: {} };
	}

	private async runIntervention(unit: Unit, cor: string, role: InterventionMandate["role"], objective: string, workspacePath: string, extra: { adopted?: ArtifactKind[]; untrusted?: { source: string; text: string }[]; feedback?: string | null; attempt_id?: string | null }): Promise<{ unit: Unit; output: unknown; output_valid: boolean; result: "completed" | "failed" | "cancelled"; intervention_id: string }> {
		const qualified = this.deps.sandbox.qualification.qualified || role === "observe" || role === "specify" || role === "review";
		if (!qualified) throw new DomainError("CAPABILITY_MISSING", `sandbox backend ${this.deps.sandbox.backend.backend} is not qualified: ${this.deps.sandbox.qualification.reasons.join("; ")}`, { nextActions: ["qualify_capability"] });
		const capabilities = await this.deps.agent.describeCapabilities(this.deps.model);
		if (!capabilities.available) throw new DomainError("CAPABILITY_MISSING", `model ${this.deps.model.provider_id}/${this.deps.model.model_id} unavailable: ${capabilities.reasons.join("; ")}`, { nextActions: ["configure_model"] });
		const interventionId = this.id("int");
		const attemptId = extra.attempt_id ?? (role === "implement" || role === "prepare" ? this.id("att") : null);
		unit = this.commit(unit, { type: "intervention.start", at: this.now(), actor: KERNEL_ACTOR, intervention_id: interventionId, role, attempt_id: attemptId, model: this.deps.model, profile_id: role, profile_qualified: qualified }, cor);
		if (unit.state.status === "blocked") return { unit, output: null, output_valid: false, result: "failed", intervention_id: interventionId };
		const adopted: { kind: string; artifact_id: string; revision: number; digest: string; text: string }[] = [];
		for (const kind of extra.adopted ?? []) {
			const a = await this.latestArtifact<unknown>(unit.state, kind);
			if (a) adopted.push({ kind, artifact_id: a.ref.artifact_id, revision: a.ref.revision, digest: a.ref.content_digest, text: typeof a.content === "string" ? a.content : JSON.stringify(a.content, null, 2) });
		}
		const ctx = buildContext({ role, objective, language: this.language(unit.state), adopted, untrusted: extra.untrusted ?? [], feedback: extra.feedback ?? null, tools: TOOLS_FOR_ROLE[role], budget_bytes: 60_000 });
		const contextRef = await this.storeArtifact("context", unit.state.change_id, this.id("ctx"), ctx.manifest, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "context", ref: contextRef }, cor);
		const mandate: InterventionMandate = { intervention_id: interventionId, change_id: unit.state.change_id, role, objective, prompt: ctx.prompt, system_prompt: ctx.system_prompt, context: ctx.manifest, tools: TOOLS_FOR_ROLE[role], profile: this.profileFor(role, workspacePath), workspace_path: workspacePath, model: this.deps.model, budgets: { duration_ms: this.deps.policy.budgets.intervention_ms, tool_calls: this.deps.policy.budgets.tool_calls_per_intervention }, output_schema: outputSchemaFor(role) };
		this.progress(`intervention ${role} started (${this.deps.model.provider_id}/${this.deps.model.model_id})`);
		const handle = await this.deps.agent.startIntervention(mandate);
		this.activeHandle = handle;
		let terminal: InterventionEvent | null = null;
		let toolCalls = 0;
		const events: InterventionEvent[] = [];
		for await (const event of handle.events) {
			events.push(event);
			if (event.type === "tool_finished") {
				toolCalls++;
				const consumed = this.tryCommit(unit, { type: "budget.consume", at: this.now(), actor: KERNEL_ACTOR, intervention_id: interventionId, counters: { tool_calls: 1, duration_ms: 0, tokens_known: 0, delegations: 0 } }, cor);
				unit = consumed.unit;
				if (consumed.error) {
					await handle.abort(consumed.error.message);
				}
			}
			if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
				terminal = event;
				break;
			}
		}
		this.activeHandle = null;
		const t = terminal ?? { type: "failed" as const, at: this.now(), error: "no terminal event", counters: { tool_calls: toolCalls, duration_ms: 0, tokens_known: 0, delegations: 0 } };
		const counters = { ...t.counters, tool_calls: Math.max(0, t.counters.tool_calls - toolCalls) };
		const outputRef = await this.storeArtifact("output", unit.state.change_id, this.id("out"), { intervention_id: interventionId, role, terminal: t, events: events.filter((e) => e.type !== "model_event").slice(0, 500) }, interventionId);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: { actor_id: interventionId, actor_type: "agent", role: role === "review" ? "reviewer_agent" : "producer_agent", origin: "model_output", authentication_level: "none" }, kind: "output", ref: outputRef }, cor);
		unit = this.commit(unit, { type: "intervention.finish", at: this.now(), actor: KERNEL_ACTOR, intervention_id: interventionId, result: t.type, counters, detail: t.type === "failed" ? t.error : null }, cor);
		return { unit, output: t.type === "completed" ? t.output : null, output_valid: t.type === "completed" ? t.output_valid : false, result: t.type, intervention_id: interventionId };
	}

	private async projectExcerpts(reference: ReferenceSnapshot, workspacePath: string, max = 12): Promise<{ source: string; text: string }[]> {
		const out: { source: string; text: string }[] = [];
		const interesting = reference.entries.filter((e) => e.kind === "file" && /(^|\/)(package\.json|pom\.xml|README(\.md)?|AGENTS\.md)$/.test(e.path) || /^(src|test)\/[^/]+\.(js|ts|java)$/.test(e.path)).slice(0, max);
		for (const e of interesting) {
			try {
				const { readFile } = await import("node:fs/promises");
				out.push({ source: e.path, text: (await readFile(join(workspacePath, e.path), "utf8")).slice(0, 6000) });
			} catch {
				/* unreadable excerpt is simply absent */
			}
		}
		return out;
	}

	private async referenceOf(state: ChangeState): Promise<ReferenceSnapshot> {
		const a = await this.latestArtifact<ReferenceSnapshot>(state, "reference");
		if (!a) throw new DomainError("EVIDENCE_MISSING", "reference snapshot missing");
		return a.content;
	}

	// --- phase steps -----------------------------------------------------------------------------

	private async stepClarify(unit: Unit, cor: string): Promise<Unit> {
		const reference = await this.referenceOf(unit.state);
		const request = await this.readArtifact<string>(unit.state.request);
		const spec = await this.latestArtifact<SpecificationReport>(unit.state, "diagnostic");
		let report: SpecificationReport;
		if (spec && unit.state.open_questions.every((q) => !q.material || q.answer !== null)) {
			report = spec.content;
		} else {
			const handle = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
			try {
				const excerpts = await this.projectExcerpts(reference, handle.path);
				const answered = unit.state.open_questions.filter((q) => q.answer !== null && q.id !== "language").map((q) => `Q ${q.id}: ${q.question} -> ${q.answer}`);
				const objective = `${request}${answered.length ? `\n\nAnswered questions:\n${answered.join("\n")}` : ""}`;
				const r = await this.runIntervention(unit, cor, "specify", objective, handle.path, { untrusted: excerpts });
				unit = r.unit;
				if (r.result !== "completed" || !r.output_valid || !Value.Check(OUTPUT_SCHEMAS["specification-report"], r.output)) {
					throw new DomainError("CONFIGURATION_ERROR", `specification intervention ${r.result}${r.result === "completed" ? " with an invalid structured output" : ""}`, { retryable: true, nextActions: ["retry_specification"] });
				}
				report = r.output as SpecificationReport;
			} finally {
				await this.deps.workspace.closeWorkspace(handle.workspace_id, "delete");
			}
			const diagRef = await this.storeArtifact("diagnostic", unit.state.change_id, this.id("dia"), report, KERNEL_ACTOR.actor_id);
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
		const mandateRef = await this.storeArtifact("mandate", unit.state.change_id, this.id("mnd"), mandate, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "mandate", ref: mandateRef }, cor);
		return this.commit(unit, { type: "gate.evaluate", gate: "G0", at: this.now(), actor: KERNEL_ACTOR, mandate_ref: mandateRef, mandate }, cor);
	}

	private async stepSpecify(unit: Unit, cor: string): Promise<Unit> {
		const spec = await this.latestArtifact<SpecificationReport>(unit.state, "diagnostic");
		if (!spec) throw new DomainError("EVIDENCE_MISSING", "no specification report");
		const doc: RequirementsDocument = { change_id: unit.state.change_id, requirements: spec.content.requirements.map((r) => ({ requirement_id: r.requirement_id, statement: r.statement, category: r.category, mandatory: r.mandatory, criterion: r.criterion, source: "specification intervention over the original request", contract_family: null })), assumptions: spec.content.assumptions, contract_families: {} };
		const issues: string[] = [];
		try {
			validate(RequirementsDocumentSchema, doc, "requirements");
		} catch (error) {
			issues.push((error as Error).message);
		}
		const ref = await this.storeArtifact("requirements", unit.state.change_id, this.id("rqs"), doc, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "requirements", ref }, cor);
		unit = this.commit(unit, { type: "gate.evaluate", gate: "G1", at: this.now(), actor: KERNEL_ACTOR, requirements_ref: ref, requirements: doc, report: { valid: issues.length === 0, issues } }, cor);
		if (unit.state.gates.G1?.verdict === "FAIL") throw new DomainError("PRECONDITION_FAILED", `requirements rejected at G1: ${unit.state.gates.G1.reasons.join("; ")}`, { nextActions: ["revise_requirements"] });
		return unit;
	}

	private async materializePrepared(prepared: PreparationRecord | null, workspacePath: string): Promise<void> {
		if (!prepared) return;
		for (const f of prepared.files) {
			const bytes = await this.deps.objects.get(f.digest);
			if (!bytes) throw new DomainError("EVIDENCE_MISSING", `prepared file ${f.path} (${f.digest}) is missing from the store`);
			const target = join(workspacePath, f.path);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, bytes);
		}
	}

	private async adoptedPreparation(state: ChangeState): Promise<PreparationRecord | null> {
		const a = state.adopted.preparation ? await this.latestArtifact<PreparationRecord>(state, "preparation") : null;
		return a && a.content.qualified ? a.content : null;
	}

	private async stepVerificationDesign(unit: Unit, cor: string): Promise<Unit> {
		const reference = await this.referenceOf(unit.state);
		const requirements = await this.latestArtifact<RequirementsDocument>(unit.state, "requirements");
		if (!requirements) throw new DomainError("EVIDENCE_MISSING", "requirements missing");
		const refs = requirements.content.requirements.map((r) => ({ requirement_id: r.requirement_id, revision: requirements.ref.revision }));
		const prepared = await this.adoptedPreparation(unit.state);
		const positive = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
		const negative = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
		try {
			const detection = detectStack(positive.path, refs);
			if (detection.controls.length === 0) throw new DomainError("CAPABILITY_MISSING", detection.capability_missing.join("; ") || "no control available", { nextActions: ["prepare_capabilities"] });
			const hasTests = referenceHasTests(reference, detection.preparation_paths) || (prepared?.files.length ?? 0) > 0;
			if (!hasTests && detection.preparation_paths.length > 0) {
				const alreadyTried = (unit.state.proposals.preparation ?? []).filter((a) => a.artifact_id.startsWith("prep_")).length;
				if (alreadyTried >= 2) throw new DomainError("CAPABILITY_MISSING", "no discriminant test could be prepared after two preparation interventions", { nextActions: ["prepare_capabilities", "assign_human_decision"] });
				const mandate = { objective: `Write automated tests for the adopted requirements in the target technology (${detection.stack}); only files under ${detection.preparation_paths.join(", ")} may be created or modified.`, allowed_paths: detection.preparation_paths, requirement_ids: refs.map((r) => r.requirement_id), stack: detection.stack };
				const ref = await this.storeArtifact("preparation", unit.state.change_id, this.id("prp"), { ...mandate, kind: "preparation-mandate" }, KERNEL_ACTOR.actor_id);
				unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
				return this.commit(unit, { type: "preparation.open", at: this.now(), actor: KERNEL_ACTOR, mandate_ref: ref }, cor);
			}
			// The witnesses qualify the sensor mechanism on the reference (PRE-03); the prepared discriminant
			// suite is judged separately (`on_reference`) and joins the protocol as a protected oracle.
			for (const [ws, files] of [[positive.path, detection.positive_witness], [negative.path, { ...detection.positive_witness, ...detection.negative_witness }]] as const) {
				for (const [rel, content] of Object.entries(files)) {
					const target = join(ws, rel);
					await mkdir(dirname(target), { recursive: true });
					await writeFile(target, content);
				}
			}
			const qualifications: Protocol["qualifications"] = {};
			const base = { protocol: { protocol_id: "qualification", revision: 1, content_digest: digestValue("qualification") } as const, candidate: { candidate_id: "qualification", manifest_digest: reference.tree_digest, base_digest: reference.tree_digest, workspace_id: positive.workspace_id }, subject: { kind: "fixture" as const, id: reference.reference_id, revision: 1, digest: reference.tree_digest }, environment: this.deps.environment, requirement_refs: refs, producer: EXECUTOR_ACTOR };
			for (const control of detection.controls) {
				this.progress(`qualifying control ${control.control_id}`);
				const detailed = await qualifyControlDetailed(this.deps.controls, control, { positive_path: positive.path, negative_path: negative.path }, base);
				const evidenceIds = {
					positive: this.id("evq"),
					negative: this.id("evq"),
					incident: this.id("evq"),
				};
				this.storeEvidence(unit.state.change_id, detailed.evidence.positive, evidenceIds.positive);
				this.storeEvidence(unit.state.change_id, detailed.evidence.negative, evidenceIds.negative);
				this.storeEvidence(unit.state.change_id, detailed.evidence.incident, evidenceIds.incident);
				qualifications[control.control_id] = { ...detailed.qualification, evidence_ids: evidenceIds };
				if (!detailed.qualification.qualified) qualifications[control.control_id]!.notes.push(`qualification evidence: positive=${evidenceIds.positive}, negative=${evidenceIds.negative}, incident=${evidenceIds.incident}`);
				if (prepared) qualifications[control.control_id]!.notes.push(`prepared suite on the bare reference: ${prepared.on_reference} (${prepared.discriminant ? "discriminant" : "not discriminant"})`);
			}
			const controls: ControlDefinition[] = detection.controls.map((c) => ({ ...c, protected_paths: [...new Set([...c.protected_paths, ...(prepared?.files.map((f) => f.path) ?? [])])] }));
			const obligations: Obligation[] = requirements.content.requirements.map((r) => {
				const preferred = r.category.toLowerCase().includes("quality") || r.category.toLowerCase().includes("lint") ? controls.filter((c) => c.control_id === "lint") : controls.filter((c) => c.control_id !== "lint");
				const chosen = (preferred.length > 0 ? preferred : controls).map((c) => c.control_id);
				return { requirement: { requirement_id: r.requirement_id, revision: requirements.ref.revision }, mandatory: r.mandatory, control_ids: chosen, combination: "all_pass", human_interaction: null, not_applicable_reason: null };
			});
			const protocol: Protocol = { protocol_id: this.id("prt"), change_id: unit.state.change_id, controls, qualifications, obligations, required_reviews: [...this.deps.policy.required_reviews], arbitration: "human_decision", environment_digest: this.deps.environment.digest };
			const ref = await this.storeArtifact("protocol", unit.state.change_id, protocol.protocol_id, protocol, KERNEL_ACTOR.actor_id);
			unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "protocol", ref }, cor);
			unit = this.commit(unit, { type: "gate.evaluate", gate: "G2", at: this.now(), actor: KERNEL_ACTOR, protocol_ref: ref, protocol }, cor);
			if (unit.state.gates.G2?.verdict !== "PASS") {
				const g2 = unit.state.gates.G2!;
				const unqualified = Object.entries(qualifications).filter(([, q]) => !q.qualified).map(([id, q]) => `${id}: ${q.notes.join(", ")}`);
				throw new DomainError("CAPABILITY_MISSING", `protocol not frozen: ${[...new Set([...g2.reasons, ...unqualified])].join("; ")}`, { nextActions: ["prepare_capabilities", "fix_reference_tests"] });
			}
			return unit;
		} finally {
			await this.deps.workspace.closeWorkspace(positive.workspace_id, "delete");
			await this.deps.workspace.closeWorkspace(negative.workspace_id, "delete");
		}
	}

	/** Preparation intervention, then kernel qualification of the proposed tests (SA-008, SA-009, PRE-03). */
	private async stepPrepare(unit: Unit, cor: string): Promise<Unit> {
		const reference = await this.referenceOf(unit.state);
		const mandateArt = await this.latestArtifact<{ objective: string; allowed_paths: string[]; requirement_ids: string[]; stack: StackDetection["stack"] }>(unit.state, "preparation");
		if (!mandateArt) throw new DomainError("EVIDENCE_MISSING", "preparation mandate missing");
		const mandate = mandateArt.content;
		const previousRef = [...(unit.state.proposals.preparation ?? [])].reverse().find((ref) => ref.artifact_id.startsWith("prep_"));
		const previous = previousRef ? await this.readArtifact<PreparationRecord>(previousRef) : null;
		const feedback = previous ? `The previous preparation was refused. Keep every change inside the allowed paths.\n${previous.notes.map((note) => `- ${note}`).join("\n")}` : null;
		const handle = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
		try {
			const detected = detectStack(handle.path, mandate.requirement_ids.map((id) => ({ requirement_id: id, revision: 1 })));
			if (detected.stack !== mandate.stack || !samePreparationPaths(mandate.allowed_paths, detected.preparation_paths)) {
				const record: PreparationRecord = { preparation_id: this.id("prc"), objective: mandate.objective, allowed_paths: mandate.allowed_paths, files: [], on_reference: "NOT_RUN", discriminant: false, loadable: false, qualified: false, notes: [`preparation mandate scope is stale; detected ${detected.stack} paths: ${detected.preparation_paths.join(", ") || "none"}`] };
				const ref = await this.storeArtifact("preparation", unit.state.change_id, record.preparation_id, record, KERNEL_ACTOR.actor_id);
				unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
				return this.commit(unit, { type: "preparation.close", at: this.now(), actor: KERNEL_ACTOR, qualified: false, capability_ids: [], adopted_ref: null }, cor);
			}
			const r = await this.runIntervention(unit, cor, "prepare", `${mandate.objective}\nRequirements to cover: ${mandate.requirement_ids.join(", ")}. Do not implement the feature itself; only add tests that will fail until it exists.`, handle.path, { adopted: ["mandate", "requirements"], untrusted: await this.projectExcerpts(reference, handle.path, 6), feedback });
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
			const ref = await this.storeArtifact("preparation", unit.state.change_id, record.preparation_id, record, KERNEL_ACTOR.actor_id);
			unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
			return this.commit(unit, { type: "preparation.close", at: this.now(), actor: KERNEL_ACTOR, qualified, capability_ids: files.map((f) => f.path), adopted_ref: qualified ? ref : null }, cor);
		} finally {
			await this.deps.workspace.closeWorkspace(handle.workspace_id, "delete");
		}
	}

	private async stepDesign(unit: Unit, cor: string): Promise<Unit> {
		const spec = await this.latestArtifact<SpecificationReport>(unit.state, "diagnostic");
		if (!spec) throw new DomainError("EVIDENCE_MISSING", "no specification report");
		const design: Design = { change_id: unit.state.change_id, summary: spec.content.design.summary, components: spec.content.design.components, interfaces: spec.content.design.interfaces, alternatives: [], risks: [...spec.content.risks, ...spec.content.design.risks], requirement_ids: unit.state.requirement_ids, compatible_with_mandate: true, executable: spec.content.design.summary.trim().length > 0 };
		const ref = await this.storeArtifact("design", unit.state.change_id, this.id("dsg"), design, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "design", ref }, cor);
		unit = this.commit(unit, { type: "gate.evaluate", gate: "G3", at: this.now(), actor: KERNEL_ACTOR, design_ref: ref, design }, cor);
		if (unit.state.gates.G3?.verdict === "FAIL") throw new DomainError("PRECONDITION_FAILED", `design rejected at G3: ${unit.state.gates.G3.reasons.join("; ")}`);
		return unit;
	}

	private async stepImplement(unit: Unit, cor: string): Promise<Unit> {
		const reference = await this.referenceOf(unit.state);
		const open = unit.state.attempts.find((a) => a.result === "open");
		const attemptId = open?.attempt_id ?? this.id("att");
		const existing = this.deps.ledger.listArtifacts(unit.state.change_id, "candidate").find((a) => a.ref.artifact_id === `ws_${attemptId}`);
		let workspaceId: string;
		let workspacePath: string;
		if (existing) {
			const rec = await this.readArtifact<{ workspace_id: string; path: string }>(existing.ref);
			workspaceId = rec.workspace_id;
			workspacePath = rec.path;
		} else {
			const h = await this.deps.workspace.createWorkspace(reference, this.deps.workspacePolicy);
			workspaceId = h.workspace_id;
			workspacePath = h.path;
			await this.materializePrepared(await this.adoptedPreparation(unit.state), h.path);
			await this.storeArtifact("candidate", unit.state.change_id, `ws_${attemptId}`, { workspace_id: h.workspace_id, path: h.path }, KERNEL_ACTOR.actor_id);
		}
		const lastFeedback = unit.state.feedback.at(-1);
		const feedback = lastFeedback ? await this.readArtifact<string>({ artifact_id: `fb_${lastFeedback.attempt_id}`, revision: 1 }).catch(() => null) : null;
		const mandate = await this.latestArtifact<Mandate>(unit.state, "mandate");
		const r = await this.runIntervention(unit, cor, "implement", mandate?.content.objective ?? "implement the adopted design", workspacePath, { adopted: ["mandate", "requirements", "design"], feedback, attempt_id: attemptId, untrusted: await this.projectExcerpts(reference, workspacePath, 6) });
		unit = r.unit;
		if (unit.state.status === "blocked") return unit;
		if (r.result === "cancelled") return this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "execution_error", detail: "producer intervention cancelled" }, cor);
		if (r.result === "failed") {
			const failed = this.commit(unit, { type: "operation.fail", at: this.now(), actor: KERNEL_ACTOR, operation_key: `intervention:${attemptId}` }, cor);
			return failed;
		}
		this.progress("freezing the candidate");
		const wsHandle = { workspace_id: workspaceId, path: workspacePath, reference_id: reference.reference_id, created_at: this.now() };
		const manifest = await this.deps.workspace.snapshotCandidate(wsHandle, reference, this.deps.workspacePolicy);
		const manifestRef = await this.storeArtifact("candidate", unit.state.change_id, manifest.candidate_id, manifest, KERNEL_ACTOR.actor_id);
		// keep the bytes of every changed file so that the dossier stays self-contained (EVD-01)
		const files: Record<string, { digest: string; size_bytes: number; media_type: string }> = {};
		for (const e of manifest.entries) {
			if (e.baseline_state === "unchanged" || e.baseline_state === "deleted" || e.kind !== "file" || e.content_digest === null) continue;
			try {
				const { readFile } = await import("node:fs/promises");
				const bytes = new Uint8Array(await readFile(join(workspacePath, e.path)));
				const ref = await this.deps.objects.put(bytes, "application/octet-stream");
				files[e.path] = { digest: ref.digest, size_bytes: ref.size_bytes, media_type: ref.media_type };
			} catch {
				/* unreadable file: the manifest already carries the limit */
			}
		}
		await this.storeArtifact("candidate", unit.state.change_id, `files_${manifest.candidate_id}`, files, KERNEL_ACTOR.actor_id);
		unit = this.commit(unit, { type: "artifact.propose", at: this.now(), actor: KERNEL_ACTOR, kind: "candidate", ref: manifestRef }, cor);
		const changed = manifest.entries.filter((e) => e.baseline_state !== "unchanged").map((e) => e.path);
		const protectedPaths = unit.state.protocol?.protected_paths ?? [];
		const prepared = await this.adoptedPreparation(unit.state);
		const allowedProtected = changed.filter((p) => isProtectedPrepared(p, prepared, manifest.entries.find((e) => e.path === p)?.content_digest ?? null));
		const altered = changed.filter((p) => protectedPaths.some((pp) => (pp.endsWith("/") ? p.startsWith(pp) : p === pp)) && !allowedProtected.includes(p));
		const producerReport = r.output_valid ? (r.output as ProducerReport) : null;
		unit = this.commit(unit, { type: "candidate.freeze", at: this.now(), actor: KERNEL_ACTOR, attempt_id: attemptId, facts: { candidate: { candidate_id: manifest.candidate_id, manifest_digest: manifest.manifest_digest, base_digest: manifest.base_digest, workspace_id: wsHandle.workspace_id }, entry_count: manifest.entries.length, changed_paths: changed, out_of_scope_paths: [], altered_protected_paths: altered, allowed_protected_paths: allowedProtected, complete: !manifest.limits.truncated, limits_notes: [...manifest.limits.notes, ...(producerReport ? [] : ["producer output invalid or missing"])] } }, cor);
		return unit;
	}

	private async stepVerify(unit: Unit, cor: string): Promise<Unit> {
		const state = unit.state;
		if (!state.candidate || !state.protocol) throw new DomainError("PRECONDITION_FAILED", "candidate and protocol required");
		const protocol = await this.latestArtifact<Protocol>(state, "protocol");
		const manifest = await this.readArtifact<CandidateManifest>({ artifact_id: state.candidate.candidate_id, revision: 1 });
		if (!protocol) throw new DomainError("EVIDENCE_MISSING", "protocol document missing");
		const workspacePath = this.deps.workspace.workspacePath(state.candidate.workspace_id);
		const opId = this.id("op");
		unit = this.commit(unit, { type: "verification.start", at: this.now(), actor: KERNEL_ACTOR, operation_id: opId, idempotency_key: `verify:${state.candidate.manifest_digest}:${state.evidence.length}` }, cor);
		const facts: EvidenceFact[] = [];
		const reference = await this.referenceOf(state);
		for (const control of protocol.content.controls) {
			this.progress(`running control ${control.control_id}`);
			const { evidence: candidate } = await this.deps.controls.runControl({ control, protocol: state.protocol.ref, candidate: state.candidate, subject: { kind: "candidate", id: state.candidate.candidate_id, revision: 1, digest: state.candidate.manifest_digest }, workspace_path: workspacePath, environment: this.deps.environment, requirement_refs: control.requirement_refs, producer: EXECUTOR_ACTOR });
			const evidenceId = this.id("evd");
			const evidence = this.storeEvidence(state.change_id, candidate, evidenceId);
			facts.push({ evidence_id: evidenceId, control_id: evidence.control_id, control_version: evidence.control_version, requirement_ids: evidence.requirement_refs.map((r) => r.requirement_id), subject_digest: evidence.subject.digest, protocol_revision: evidence.protocol_revision.revision, environment_digest: evidence.environment_digest, verdict: evidence.verdict, findings_blocking: evidence.findings.filter((f) => f.severity === "blocker").length });
		}
		const after = await this.deps.workspace.snapshotCandidate({ workspace_id: state.candidate.workspace_id, path: workspacePath, reference_id: reference.reference_id, created_at: this.now() }, reference, { ...this.deps.workspacePolicy, exclusions: [...this.deps.workspacePolicy.exclusions, ...protocol.content.controls.flatMap((c) => c.writable_paths.map((p) => (p.endsWith("/") ? p : `${p}/`)))] });
		const mutated = after.manifest_digest !== manifest.manifest_digest && canonicalize(after.entries.map((e) => [e.path, e.content_digest])) !== canonicalize(manifest.entries.filter((e) => !protocol.content.controls.some((c) => c.writable_paths.some((w) => e.path.startsWith(w.replace(/\/?$/, "/"))))).map((e) => [e.path, e.content_digest]));
		if (mutated) {
			unit = this.commit(unit, { type: "verification.complete", at: this.now(), actor: KERNEL_ACTOR, operation_id: opId }, cor);
			return this.commit(unit, { type: "change.block", at: this.now(), actor: KERNEL_ACTOR, reason: "execution_error", detail: "the frozen candidate was modified during verification; evidence not recorded" }, cor);
		}
		unit = this.commit(unit, { type: "verification.record", at: this.now(), actor: EXECUTOR_ACTOR, evidence: facts }, cor);
		return this.commit(unit, { type: "verification.complete", at: this.now(), actor: KERNEL_ACTOR, operation_id: opId }, cor);
	}

	private async stepReview(unit: Unit, cor: string): Promise<Unit> {
		const state = unit.state;
		if (!state.candidate || !state.protocol) throw new DomainError("PRECONDITION_FAILED", "candidate and protocol required");
		const workspacePath = this.deps.workspace.workspacePath(state.candidate.workspace_id);
		for (const role of state.protocol.required_reviews) {
			if (state.reviews.some((r) => r.valid && r.reviewer_role === role && r.subject_digest === state.candidate!.manifest_digest)) continue;
			const manifest = await this.readArtifact<CandidateManifest>({ artifact_id: state.candidate.candidate_id, revision: 1 });
			const r = await this.runIntervention(unit, cor, "review", `Review the candidate as the ${role} reviewer. Changed paths: ${manifest.selected_paths.join(", ")}`, workspacePath, { adopted: ["mandate", "requirements", "design"] });
			unit = r.unit;
			const report = r.result === "completed" && r.output_valid ? (r.output as ReviewReport) : null;
			const reviewId = this.id("rev");
			await this.storeArtifact("review", unit.state.change_id, reviewId, report ?? { invalid: true, result: r.result }, r.intervention_id);
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
			const key = `verify:${unit.state.candidate!.manifest_digest}`;
			const retried = this.commit(unit, { type: "operation.fail", at: this.now(), actor: KERNEL_ACTOR, operation_key: key }, cor);
			if (retried.state.status === "blocked") return retried;
			return this.commit(retried, { type: "verification.rerun", at: this.now(), actor: KERNEL_ACTOR, reason: `indeterminate controls: ${g5.indeterminate_requirements.join(", ")} (technical retry)` }, cor);
		}
		return this.correctOrStop(unit, cor, g5.reasons.join("; "));
	}

	private async correctOrStop(unit: Unit, cor: string, why: string): Promise<Unit> {
		const state = unit.state;
		const feedback = await this.buildFeedback(state, why);
		const attemptId = this.id("att");
		const current = state.attempts.at(-1);
		if (current) await this.storeArtifact("feedback", state.change_id, `fb_${current.attempt_id}`, feedback.text, KERNEL_ACTOR.actor_id);
		const next = this.commit(unit, { type: "correction.authorize", at: this.now(), actor: KERNEL_ACTOR, attempt_id: attemptId, feedback: { digest: digestBytes(feedback.text), bytes: feedback.bytes, truncated: feedback.truncated } }, cor);
		if (next.state.status === "blocked" && next.state.stop_reason === "attempts_exhausted") {
			return this.requestDecision(next, cor, "IH-07", subjectOfChange(next.state), [why], "stop", `${next.state.budgets.attempts_used}/${next.state.budgets.max_attempts}`, undefined, this.language(next.state));
		}
		return next;
	}

	/** Bounded feedback (DEC-02): requirement, expected, observed, location, evidence reference. */
	private async buildFeedback(state: ChangeState, why: string): Promise<{ text: string; bytes: number; truncated: boolean }> {
		const lines: string[] = [`Verdict: ${state.gates.G5?.verdict ?? state.gates.G4?.verdict ?? "FAIL"}`, `Reasons: ${why}`];
		for (const g of [state.gates.G4, state.gates.G5]) if (g) for (const r of g.reasons) lines.push(`- ${g.gate}: ${r}`);
		for (const entry of state.evidence.filter((e) => e.valid && e.subject_digest === state.candidate?.manifest_digest && e.verdict !== "PASS")) {
			const ev = this.deps.ledger.getEvidence(entry.evidence_id);
			if (!ev) continue;
			lines.push(`\nControl ${ev.control_id} -> ${ev.verdict} (evidence ${ev.evidence_id})`);
			for (const f of ev.findings.slice(0, 20)) lines.push(`  * ${f.severity} ${f.message}${f.path ? ` at ${f.path}${f.region ? `:${f.region.start_line}` : ""}` : ""}`);
			for (const n of ev.limits.notes) lines.push(`  ! ${n}`);
			const stderr = ev.artifacts.find((a) => a.name === "stderr") ?? ev.artifacts.find((a) => a.name === "stdout");
			if (stderr) {
				const bytes = await this.deps.objects.get(stderr.ref, { offset: 0, length: 8000 });
				if (bytes) lines.push("  output excerpt:\n" + new TextDecoder().decode(bytes).split("\n").slice(-40).map((l) => `    ${l}`).join("\n"));
			}
		}
		let text = lines.join("\n");
		const max = this.deps.policy.budgets.feedback_bytes;
		let truncated = false;
		if (Buffer.byteLength(text) > max) {
			text = `${Buffer.from(text).subarray(0, max - 60).toString()}\n[feedback truncated by 495; full evidence in the dossier]`;
			truncated = true;
		}
		return { text, bytes: Buffer.byteLength(text), truncated };
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

	private async requestDecision(unit: Unit, cor: string, interaction: Exclude<HumanInteraction, "IH-02" | "IH-03" | "IH-04" | "IH-05" | "IH-06" | "IH-09">, subject: SubjectRef, facts: string[], recommendation: string | null, arg?: string, decisionId?: string, language: "fr" | "en" = "fr"): Promise<Unit> {
		const request = buildDecisionRequest({ decision_id: decisionId ?? this.id("dec"), change_id: unit.state.change_id, interaction, subject, language, facts, recommendation, ...(arg !== undefined ? { arg } : {}), requested_at: this.now() });
		this.deps.ledger.putDecisionRequest(request);
		const next = this.commit(unit, { type: "decision.request", at: this.now(), actor: KERNEL_ACTOR, request }, cor);
		this.deps.onDecisionRequested?.(request);
		return next;
	}

	/** Opens a read-only review of the frozen candidate (or of the reference alone). Identical data in every Pi entry (RM-066). */
	async openReview(changeId: string, candidateId?: string): Promise<{ snapshot: ReviewSnapshot; changes(path: string, status: PathStatus, oldPath: string | null): Promise<ChangePage>; content(path: string, side: "old" | "new", start: number, limit: number): Promise<ContentPage> }> {
		const { state } = this.load(changeId);
		const reference = await this.referenceOf(state);
		const wanted = candidateId ?? state.candidate?.candidate_id ?? null;
		const manifest = wanted ? await this.readArtifact<CandidateManifest>({ artifact_id: wanted, revision: 1 }).catch(() => null) : null;
		const workspacePath = manifest ? this.deps.workspace.workspacePath(manifest.workspace_id) : null;
		const findings: (Finding & { evidence_id: string })[] = [];
		for (const e of state.evidence.filter((x) => x.valid && manifest && x.subject_digest === manifest.manifest_digest)) {
			const ev = this.deps.ledger.getEvidence(e.evidence_id);
			if (ev) for (const f of ev.findings) findings.push({ ...f, evidence_id: ev.evidence_id });
		}
		const newer = manifest && state.candidate && state.candidate.candidate_id !== manifest.candidate_id ? state.candidate.candidate_id : null;
		const snapshot = buildSnapshot({ change_id: changeId, reference, manifest, findings, newer_candidate: newer, now: this.now() });
		const sources = { referencePath: reference.project_path, workspacePath, reference, manifest, maxBytes: 2 * 1024 * 1024 };
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
		else if (u.state.status === "blocked" && u.state.stop_reason === "execution_error") u = this.tryCommit(u, { type: "change.unblock", at: this.now(), actor: KERNEL_ACTOR }, cor).unit;
		return this.status(changeId);
	}

	cancel(changeId: string, actor: ActorRef, reason: string): StatusView {
		this.commit(this.load(changeId), { type: "change.cancel", at: this.now(), actor, reason }, this.id("cor"));
		return this.status(changeId);
	}
}
