/**
 * Intervention supervisor, application side (CMP-INT): it refuses an intervention the sandbox
 * backend or the model cannot carry, materializes the permission profile of the role, drives one
 * bounded agent session to its terminal event and reports what it observed.
 *
 * It commits nothing and reads no change state. Whether the budget allows another tool call is
 * asked of the caller, which holds the ledger; the answer ends the session when it is a refusal.
 * The confined Pi worker this drives is the adapter side of the same component.
 */
import type { InterventionRole } from "../contracts/v1/common.ts";
import { TOOLS_FOR_ROLE } from "../contracts/v1/reports.ts";
import { DomainError } from "../domain/errors.ts";
import type { ActivePolicy } from "../domain/policy.ts";
import type {
	AgentPort,
	ContextManifest,
	InterventionEvent,
	InterventionMandate,
	ModelSelection,
	SandboxProfile,
	SandboxSelection,
} from "../ports/execution.ts";
import { outputSchemaFor } from "./context.ts";

export interface InterventionDeps {
	agent: AgentPort;
	sandbox: SandboxSelection;
	model: ModelSelection;
	policy: ActivePolicy;
	now(): string;
	progress(message: string): void;
}

export interface InterventionRequest {
	intervention_id: string;
	change_id: string;
	role: InterventionRole;
	objective: string;
	workspace_path: string;
	prompt: string;
	system_prompt: string;
	context: ContextManifest;
}

export interface InterventionReport {
	/** `truncated` is a session the duration budget ended: the producer was still working. */
	result: "completed" | "failed" | "cancelled" | "truncated";
	output: unknown;
	output_valid: boolean;
	counters: { tool_calls: number; duration_ms: number; tokens_known: number; delegations: number };
	/** The terminal event, synthesized when the session ended without producing one. */
	terminal: InterventionEvent;
	/** What the dossier keeps of the session: model chatter left out, bounded. */
	events: InterventionEvent[];
	/** Why the session ended, when that is not simply "it finished". */
	detail: string | null;
}

/** Asked after each tool call: the refusal it returns ends the session. */
export type ToolCallBudget = () => DomainError | null;

export class InterventionSupervisor {
	private readonly deps: InterventionDeps;
	private active: { abort(reason: string): Promise<void> } | null = null;
	constructor(deps: InterventionDeps) {
		this.deps = deps;
	}

	/**
	 * Whether the sandbox backend carries this role. A role that writes needs the confinement the
	 * backend claims to have; a role that only reads is bounded by the tools it is given.
	 */
	qualifiedFor(role: InterventionRole): boolean {
		return this.deps.sandbox.qualification.qualified || role === "observe" || role === "specify" || role === "review";
	}

	/**
	 * Refuses, before anything is committed, when the destination, the sandbox or the model cannot
	 * carry the role. The destination is judged first: a provider the policy has not declared is
	 * refused without being reached, so nothing is handed to it in order to find out (SEC-05).
	 */
	async requireCapable(role: InterventionRole): Promise<void> {
		const declared = this.deps.policy.egress;
		if (!declared.some((d) => d.provider_id === this.deps.model.provider_id))
			throw new DomainError(
				"POLICY_DENIED",
				`${this.deps.model.provider_id} is not a declared egress destination: ${declared
					.map((d) => d.provider_id)
					.join(", ")}`,
				{ nextActions: ["configure_model"] },
			);
		if (!this.qualifiedFor(role))
			throw new DomainError(
				"CAPABILITY_MISSING",
				`sandbox backend ${this.deps.sandbox.backend.backend} is not qualified: ${this.deps.sandbox.qualification.reasons.join("; ")}`,
				{ nextActions: ["qualify_capability"] },
			);
		const capabilities = await this.deps.agent.describeCapabilities(this.deps.model);
		if (!capabilities.available)
			throw new DomainError(
				"CAPABILITY_MISSING",
				`model ${this.deps.model.provider_id}/${this.deps.model.model_id} unavailable: ${capabilities.reasons.join("; ")}`,
				{ nextActions: ["configure_model"] },
			);
	}

	/** Cancels the intervention currently running, if any (§12.3). */
	async abortCurrent(reason: string): Promise<boolean> {
		if (!this.active) return false;
		await this.active.abort(reason);
		return true;
	}

	/** Drives one session to its terminal event and reports what it observed. */
	async run(request: InterventionRequest, budget: ToolCallBudget): Promise<InterventionReport> {
		const role = request.role;
		const mandate: InterventionMandate = {
			intervention_id: request.intervention_id,
			change_id: request.change_id,
			role,
			objective: request.objective,
			prompt: request.prompt,
			system_prompt: request.system_prompt,
			context: request.context,
			tools: TOOLS_FOR_ROLE[role],
			profile: this.profileFor(role, request.workspace_path),
			workspace_path: request.workspace_path,
			model: this.deps.model,
			budgets: {
				duration_ms: this.deps.policy.budgets.intervention_ms,
				tool_calls: this.deps.policy.budgets.tool_calls_per_intervention,
			},
			output_schema: outputSchemaFor(role),
		};
		this.deps.progress(`intervention ${role} started (${this.deps.model.provider_id}/${this.deps.model.model_id})`);
		const handle = await this.deps.agent.startIntervention(mandate);
		this.active = handle;
		let terminal: InterventionEvent | null = null;
		let toolCalls = 0;
		const events: InterventionEvent[] = [];
		for await (const event of handle.events) {
			events.push(event);
			if (event.type === "tool_finished") {
				toolCalls++;
				const refused = budget();
				if (refused) await handle.abort(refused.message);
			}
			if (event.type === "completed" || event.type === "failed" || event.type === "cancelled") {
				terminal = event;
				break;
			}
		}
		this.active = null;
		const t = terminal ?? {
			type: "failed" as const,
			at: this.deps.now(),
			error: "no terminal event",
			counters: { tool_calls: toolCalls, duration_ms: 0, tokens_known: 0, delegations: 0 },
		};
		// The tool calls the caller already counted one by one are not counted a second time.
		const counters = { ...t.counters, tool_calls: Math.max(0, t.counters.tool_calls - toolCalls) };
		// A session ended by the duration budget is not a proposal: the producer was still working.
		const truncated = t.type === "completed" && t.truncated === true;
		const result = truncated ? ("truncated" as const) : t.type;
		if (truncated) this.deps.progress(`intervention ${role} interrupted by the duration budget`);
		return {
			result,
			output: t.type === "completed" ? t.output : null,
			output_valid: t.type === "completed" ? t.output_valid : false,
			counters,
			terminal: t,
			events: events.filter((e) => e.type !== "model_event").slice(0, 500),
			detail:
				t.type === "failed"
					? t.error
					: truncated
						? `stopped by the ${this.deps.policy.budgets.intervention_ms} ms duration budget; the workspace keeps the unfinished work`
						: null,
		};
	}

	/** The permissions a role runs under: only a role that writes is given a writable path. */
	private profileFor(role: InterventionMandate["role"], workspacePath: string): SandboxProfile {
		const writes = role === "implement" || role === "prepare" ? [workspacePath] : [];
		return {
			profile_id: role,
			read_paths: [workspacePath],
			write_paths: writes,
			network: "denied",
			env_allowlist: ["PATH", "HOME", "TMPDIR", "LANG"],
			env: {},
		};
	}
}
