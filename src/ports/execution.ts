import type { ActorRef, CandidateRef, EnvironmentRef, InterventionRole, ProtocolRef, SubjectRef } from "../contracts/v1/common.ts";
import type { CandidateManifest, ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { EvidenceCandidate, Limits, RequirementRef } from "../contracts/v1/evidence.ts";
import type { ControlDefinition } from "../contracts/v1/protocol.ts";

// --- sandbox (§8.5) ------------------------------------------------------------------------------

export type SandboxProfileId = "observe" | "specify" | "prepare" | "implement" | "verify" | "review" | "integrate";

export interface SandboxProfile {
	profile_id: SandboxProfileId;
	/** absolute paths readable */
	read_paths: string[];
	/** absolute paths writable */
	write_paths: string[];
	network: "denied" | "allowed";
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
	snapshotCandidate(handle: WorkspaceHandle, reference: ReferenceSnapshot, policy: WorkspacePolicy): Promise<CandidateManifest>;
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

export interface ControlExecutionPort {
	/** Runs the control on a frozen candidate and normalises the observation. Always resolves. */
	runControl(invocation: ControlInvocation, signal?: AbortSignal): Promise<{ evidence: EvidenceCandidate; observation: ProcessObservation | null }>;
}

// --- agent interventions (§8.4) -------------------------------------------------------------------

export interface ModelSelection {
	provider_id: string;
	model_id: string;
	thinking_level: string;
}

export interface ContextManifest {
	role: InterventionRole;
	objective: string;
	output_schema: string;
	trusted_instructions: string[];
	adopted_refs: { kind: string; artifact_id: string; revision: number; digest: string }[];
	untrusted_excerpts: { source: string; digest: string; bytes: number }[];
	tools: string[];
	exclusions: string[];
	input_budget_bytes: number;
	output_reserve_tokens: number;
	truncations: string[];
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
	output_schema: "producer-report" | "review-report" | "observation-report" | "specification-report";
}

export type InterventionEvent =
	| { type: "started"; at: string }
	| { type: "model_event"; at: string; kind: "text" | "thinking" | "usage"; text?: string; tokens?: number }
	| { type: "tool_started"; at: string; tool: string; call_id: string; args_digest: string }
	| { type: "tool_finished"; at: string; tool: string; call_id: string; is_error: boolean; blocked: boolean }
	| { type: "checkpointed"; at: string }
	/** `truncated` means the duration budget ended the session: the workspace holds unfinished work. */
	| { type: "completed"; at: string; output: unknown; output_valid: boolean; truncated?: boolean; counters: { tool_calls: number; duration_ms: number; tokens_known: number; delegations: number } }
	| { type: "failed"; at: string; error: string; counters: { tool_calls: number; duration_ms: number; tokens_known: number; delegations: number } }
	| { type: "cancelled"; at: string; counters: { tool_calls: number; duration_ms: number; tokens_known: number; delegations: number } };

export interface AgentCapabilities {
	provider_id: string;
	model_id: string;
	available: boolean;
	reasons: string[];
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

export const EMPTY_LIMITS: Limits = { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] };
