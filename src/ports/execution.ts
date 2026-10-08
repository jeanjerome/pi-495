import type {
	ActorRef,
	CandidateRef,
	EnvironmentRef,
	InterventionRole,
	ProtocolRef,
	SubjectRef,
	Verdict,
} from "../contracts/v1/common.ts";
import type { CandidateManifest, ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { EvidenceCandidate, Finding, RequirementRef } from "../contracts/v1/evidence.ts";
import type { ControlDefinition } from "../contracts/v1/protocol.ts";
import type { OutputSchemaId } from "../contracts/v1/reports.ts";
import type { ImposedLayer, ObservedLayers } from "../domain/imposed-layers.ts";
import type { ModelLocation } from "../domain/policy.ts";
import type { ReaderTraits } from "../domain/survey.ts";
import type { AttemptCounters, InterventionCost } from "../domain/change/state.ts";

// --- sandbox (§8.5) ------------------------------------------------------------------------------

export type SandboxProfileId =
	| "observe"
	| "specify"
	| "prepare"
	| "implement"
	| "verify"
	| "review"
	| "integrate"
	| "install";

export interface SandboxProfile {
	profile_id: SandboxProfileId;
	/** absolute paths readable */
	read_paths: string[];
	/** absolute paths writable */
	write_paths: string[];
	/** Those of `write_paths` that name a file, the report a control writes, rather than a directory. */
	write_files?: string[];
	/**
	 * `denied` grants no socket at all; `loopback` lets a process reach itself and nothing else, which
	 * is what a tool that forks workers and talks to them over a socket needs; `allowed` is a mandate.
	 */
	network: ControlDefinition["network"];
	env_allowlist: string[];
	env: Record<string, string>;
}

export interface QualificationResult {
	backend: string;
	platform: string;
	qualified: boolean;
	capabilities: { filesystem_confinement: boolean; network_confinement: boolean; process_group_termination: boolean };
	reasons: string[];
}

export interface ExecutableRequest {
	command: string[];
	cwd: string;
	timeout_ms: number;
	stdin?: string | null;
	max_output_bytes: number;
}

export interface ProcessObservation {
	exit_code: number | null;
	signal: string | null;
	timed_out: boolean;
	spawn_error: string | null;
	stdout: Uint8Array;
	stderr: Uint8Array;
	stdout_truncated: boolean;
	stderr_truncated: boolean;
	started_at: string;
	ended_at: string;
	duration_ms: number;
}

export interface SandboxSelection {
	backend: SandboxPort;
	qualification: QualificationResult;
}

export interface SandboxPort {
	qualify(profile: SandboxProfile): QualificationResult;
	/** Runs one command under the profile. Never uses a shell. Rejects only on programming errors. */
	run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation>;
	readonly backend: string;
}

// --- workspace and candidate (§8.6) -------------------------------------------------------------

export interface WorkspacePolicy {
	exclusions: string[];
	/** The directories the technologies of the list install their dependencies in, whichever recognises the project. */
	installed_dependencies: readonly string[];
	max_file_bytes: number;
	max_entries: number;
}

export interface WorkspaceHandle {
	workspace_id: string;
	path: string;
	reference_id: string;
	created_at: string;
}

export interface WorkspacePort {
	captureReference(projectPath: string, policy: WorkspacePolicy): Promise<ReferenceSnapshot>;
	createWorkspace(reference: ReferenceSnapshot, policy: WorkspacePolicy): Promise<WorkspaceHandle>;
	snapshotCandidate(
		handle: WorkspaceHandle,
		reference: ReferenceSnapshot,
		policy: WorkspacePolicy,
	): Promise<CandidateManifest>;
	closeWorkspace(workspaceId: string, retention: "keep" | "delete"): Promise<void>;
	workspacePath(workspaceId: string): string;
}

// --- control execution (§8.7) ---------------------------------------------------------------------

/**
 * Lines the tree under `workspace_path` introduces relative to the reference, per workspace-relative
 * path, ascending. A differential control judges these and nothing else (QLT-04). An empty map says
 * the subject introduces nothing — what the reference pass carries; `null` says nobody computed it,
 * which is not the same thing and never reads as coverage.
 */
export type IntroducedLines = Record<string, number[]>;

export interface ControlInvocation {
	control: ControlDefinition;
	protocol: ProtocolRef;
	candidate: CandidateRef;
	subject: SubjectRef;
	workspace_path: string;
	environment: EnvironmentRef;
	requirement_refs: RequirementRef[];
	producer: ActorRef;
	introduced_lines?: IntroducedLines | null;
}

/**
 * A defect a parser names itself, when `${control}:failure` would say the wrong thing about it. The
 * runner still derives the path, the line and the fingerprint from the message, exactly as it does
 * for a failing test.
 */
export interface ParsedFinding {
	rule_id: string;
	category: Finding["category"];
	severity: Finding["severity"];
	message: string;
	symbol: string | null;
}

export interface ParsedReport {
	verdict: Verdict;
	facts: Record<string, unknown>;
	notes: string[];
	/** Failing test names or messages, bounded. */
	failures: string[];
	/** Typed defects replacing `failures` when the parser knows their rule, category and severity. */
	findings?: ParsedFinding[];
}

/** A report file as a reader is given it, read by the runner. */
export interface ReportDocument {
	/** Workspace-relative path of the report, which names the module it comes from. */
	name: string;
	text: string;
	/** Size of a report left unread because it passed the read bound: its `text` is then empty. */
	oversized_bytes?: number;
}

/** How the report files a control declares are read. */
export interface ReportReading {
	/**
	 * A file past the read bound is returned unread with its size. Without it, a file past the bound fails
	 * the reading: no report past the bound is ever loaded.
	 */
	oversized_unread?: boolean;
	/** The report path names one file strictly inside the workspace; a directory names no report. */
	single_file?: boolean;
}

/** The source files under some roots of the workspace, read within the bounds of a source tree. */
export interface SourceTree {
	files: { path: string; text: string }[];
	/** What was not read, and why. */
	notes: string[];
}

/**
 * The files of the workspace a reader may read, read by the runner: a path outside the copy is never
 * read, and a report past the read bound is returned unread with its size. A reader reads nothing on
 * its own, spawns nothing, writes nothing into the copy and reads no environment variable.
 */
export interface WorkspaceFiles {
	/** The report files the control declares; each one read is kept in the object store under `media_type`. */
	reports(mediaType: string, reading?: ReportReading): Promise<ReportDocument[]>;
	/**
	 * The text of the given files, keyed by path. A file absent or outside the copy has nothing to read;
	 * one past the bound throws, an error rather than a silent gap.
	 */
	sources(paths: readonly string[]): Promise<Map<string, string>>;
	/** The text of one file; it throws when the file is absent, unreadable or outside the copy. */
	text(path: string): Promise<string>;
	/** The files whose name ends with `suffix` under the given workspace-relative roots, build output and caches aside. */
	tree(roots: readonly string[], suffix: string): Promise<SourceTree>;
}

/** What one run of a control hands the reader its definition names. */
export interface ReaderRun extends WorkspaceFiles {
	control: ControlDefinition;
	observation: ProcessObservation;
	stdout: string;
	stderr: string;
	/** What the subject introduced, line by line; null when nobody computed it. */
	introduced_lines: IntroducedLines | null;
	/** The message without the workspace this run happened to use, so a finding pairs across the two trees. */
	relativize(message: string): string;
}

/** What a reader decides before its control is spawned: a report that needs no run, or the arguments that scope the run. */
export type ReaderPreparation = { decided: ParsedReport } | { arguments: readonly string[] };

/**
 * A report reader a technology brings: the format a control names by `parser`, the version recorded
 * with it in the `control_version` of each evidence it produced, what it measures, which the kernel
 * reads here instead of in a table of its own, and the reading of what a run of the control left.
 */
export interface ReportReader extends ReaderTraits {
	version: string;
	/**
	 * Whether it judges the whole tree and locates each finding it reports: its witnesses are then
	 * judged by the findings sitting in the witnesses' own files, so a defect the target already
	 * carries does not stand for the witness, in either direction.
	 */
	located: boolean;
	read(run: ReaderRun): Promise<ParsedReport>;
	/**
	 * The rule set the analyser applies, written from the frozen rules of the control, which the runner
	 * puts outside the workspace in place of `{ruleset}` in the command, its directory in place of
	 * `{ruleset_directory}`, with the files the analyser also looks up `beside` it, by name, in that
	 * directory; absent for a reader whose analyser takes none.
	 */
	ruleset?(control: ControlDefinition): { name: string; text: string; beside?: Record<string, string> };
	/**
	 * Scopes the run to what the subject introduced before anything is spawned; absent for a reader whose
	 * control judges the whole run.
	 */
	prepare?(
		control: ControlDefinition,
		introduced: IntroducedLines | null,
		files: WorkspaceFiles,
	): Promise<ReaderPreparation>;
}

export interface ControlExecutionPort {
	/** The report readers it runs controls through: a control naming none of them concludes nothing. */
	readonly readers: readonly ReportReader[];
	/** Runs the control on a frozen candidate and normalises the observation. Always resolves. */
	runControl(
		invocation: ControlInvocation,
		signal?: AbortSignal,
	): Promise<{ evidence: EvidenceCandidate; observation: ProcessObservation | null }>;
}

// --- agent interventions (§8.4) -------------------------------------------------------------------

export interface ModelSelection {
	provider_id: string;
	model_id: string;
	thinking_level: string;
	/** Read from the address Pi holds for the model, which is never carried here (SEC-05). */
	location: ModelLocation;
}

/** A skill an intervention receives, as the manifest of its context names it: the published skills it was adapted from, at their commits. */
export interface ContextSkill {
	name: string;
	/** The date it was adapted from its sources. */
	adapted_on: string;
	sources: readonly { repository: string; skill: string; commit: string; committed_on: string; license: string }[];
}

export interface ContextManifest {
	role: InterventionRole;
	objective: string;
	output_schema: OutputSchemaId;
	trusted_instructions: string[];
	/** The skills of 495 the intervention receives; never one of the project. */
	skills: readonly ContextSkill[];
	/** What a provider writes above `trusted_instructions` on its own, never composed here (CTX-02). */
	imposed_layers: readonly ImposedLayer[];
	adopted_refs: { kind: string; artifact_id: string; revision: number; digest: string }[];
	untrusted_excerpts: { source: string; digest: string; bytes: number }[];
	tools: string[];
	exclusions: string[];
	input_budget_bytes: number;
	output_reserve_tokens: number;
	truncations: string[];
	/**
	 * Addresses the exact text handed to the model — system prompt and prompt — in the object store.
	 * Without it a dossier holds the instructions and the objective but not the project excerpts,
	 * which are the bulk of what was read, so it cannot say what produced a report.
	 */
	prompt_digest: string | null;
}

export interface InterventionMandate {
	intervention_id: string;
	change_id: string;
	role: InterventionRole;
	objective: string;
	prompt: string;
	system_prompt: string;
	context: ContextManifest;
	tools: string[];
	profile: SandboxProfile;
	workspace_path: string;
	model: ModelSelection;
	budgets: { duration_ms: number; tool_calls: number };
	output_schema: OutputSchemaId;
	/** The SKILL.md files the resource loader of Pi is handed, and no other: a skill of the project is never loaded. */
	skills: readonly string[];
}

export type InterventionEvent =
	| { type: "started"; at: string }
	| { type: "model_event"; at: string; kind: "text" | "thinking" | "usage"; text?: string; tokens?: number }
	/**
	 * The context of the agent's session after an answer, as the host counts it against the model's
	 * window: `tokens` is null when the host does not know it, as right after a compaction.
	 */
	| { type: "model_event"; at: string; kind: "context"; tokens: number | null; context_window: number }
	| { type: "tool_started"; at: string; tool: string; call_id: string; args_digest: string }
	| { type: "tool_finished"; at: string; tool: string; call_id: string; is_error: boolean; blocked: boolean }
	| { type: "checkpointed"; at: string }
	/**
	 * What the provider wrote around 495's instructions in a request, read from the payload the host
	 * handed over once the provider had built it (CTX-02): an observation, where the manifest's
	 * imposed layers are an expectation. Sent for the first request, then for each one that differs.
	 */
	| { type: "imposed_layers_observed"; at: string; observation: ObservedLayers }
	/**
	 * Pi replaced an older part of the conversation with a summary to fit the window (CTX-02). What
	 * the model holds from here on is no longer what the manifest sealed, and writing the summary
	 * cost what `summary_tokens` says. `unwritten` names why the rewrite did not happen when it did
	 * not: the window that forced it is still full.
	 */
	| {
			type: "context_compacted";
			at: string;
			reason: "manual" | "threshold" | "overflow";
			tokens_before: number | null;
			tokens_after: number | null;
			summary_tokens: number;
			unwritten: string | null;
	  }
	/**
	 * `truncated` means the duration budget ended the session: the workspace holds unfinished work.
	 * Every terminal event carries what the host totalled for the session, read before it closed.
	 */
	| {
			type: "completed";
			at: string;
			output: unknown;
			output_valid: boolean;
			truncated?: boolean;
			counters: AttemptCounters;
			cost: InterventionCost;
	  }
	| {
			type: "failed";
			at: string;
			error: string;
			counters: AttemptCounters;
			cost: InterventionCost;
	  }
	| {
			type: "cancelled";
			at: string;
			counters: AttemptCounters;
			cost: InterventionCost;
	  };

/** What the agent's session counts of its context after an answer, as a model event carries it. */
export type AgentContext = Pick<Extract<InterventionEvent, { kind: "context" }>, "tokens" | "context_window">;

/**
 * Where a capability value comes from: reported by the host, or restated by 495. Where the host
 * reports a value, that report is the source and a restated value is only an expectation.
 */
export type CapabilityOrigin = "reported" | "restated";

/**
 * One of the capability kinds AGT-01 enumerates. `value` is null when nothing establishes it — an
 * absence, never a default — and `note` then says what was looked for and not found.
 */
export interface CapabilityFact<T> {
	value: T | null;
	origin: CapabilityOrigin;
	note: string;
}

/** The ceilings a model reports of itself. Bytes are null where the host publishes none. */
export interface ModelLimits {
	context_window_tokens: number;
	max_output_tokens: number;
	max_request_bytes: number | null;
}

/**
 * What a model is described as being able to do (AGT-01). `available` says only that the pair is
 * configured and its provider authenticated, so a session can open at all; what the model can then
 * do is carried by the facts, each of which says where its value comes from.
 */
export interface AgentCapabilities {
	provider_id: string;
	model_id: string;
	available: boolean;
	reasons: string[];
	/** The model calls the tools its mandate gives it. */
	tools: CapabilityFact<boolean>;
	streaming: CapabilityFact<boolean>;
	cancellation: CapabilityFact<boolean>;
	sessions: CapabilityFact<boolean>;
	/** The thinking levels the model accepts, `off` included. */
	thinking_levels: CapabilityFact<readonly string[]>;
	limits: CapabilityFact<ModelLimits>;
	/** The content kinds one turn can return. */
	result_shape: CapabilityFact<readonly string[]>;
}

export interface InterventionHandle {
	intervention_id: string;
	events: AsyncIterable<InterventionEvent>;
	abort(reason: string): Promise<void>;
}

export interface AgentPort {
	describeCapabilities(model: ModelSelection): Promise<AgentCapabilities>;
	startIntervention(mandate: InterventionMandate): Promise<InterventionHandle>;
}
