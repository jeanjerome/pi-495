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
import { type InterventionCost, unknownCost } from "../domain/change/state.ts";
import type { ObservedLayers } from "../domain/imposed-layers.ts";
import { DomainError } from "../domain/errors.ts";
import type { ActivePolicy } from "../domain/policy.ts";
import type {
	AgentCapabilities,
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
	/** What the host totalled for the session, or why that is not known. */
	cost: InterventionCost;
	/** The terminal event, synthesized when the session ended without producing one. */
	terminal: InterventionEvent;
	/** What the dossier keeps of the session: model chatter left out, bounded. */
	events: InterventionEvent[];
	/** What each request that differed showed of the layers around the harness instructions, in order. */
	imposed_layers_observed: ObservedLayers[];
	/** Why the session ended, when that is not simply "it finished". */
	detail: string | null;
	/**
	 * The kernel's refusal of a tool call past the intervention's budget, or `null` when none was
	 * refused. It decides whatever the session reported last: the worker applies the same bound on
	 * its side and may end the session before the abort reaches it.
	 */
	budget_refusal: string | null;
}

/**
 * What the session's requests showed of the layers around the harness instructions. A session that
 * reported no observation says why, and never reads as a request that showed nothing imposed.
 */
function requestsObserved(events: readonly InterventionEvent[], tokensKnown: number): ObservedLayers[] {
	const observed = events.flatMap((e) => (e.type === "imposed_layers_observed" ? [e.observation] : []));
	if (observed.length > 0) return observed;
	const usage = tokensKnown > 0 ? "yet the session reported model usage" : "and the session reported no model usage";
	return [{ status: "not_observed", reason: `no provider request reached the observer, ${usage}` }];
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
	 * Refuses, before anything is committed, when the sandbox or the model cannot carry the role. The
	 * destination is not judged: choosing the model in Pi is what admits its provider (SEC-05).
	 */
	async requireCapable(role: InterventionRole): Promise<void> {
		if (!this.qualifiedFor(role))
			throw new DomainError(
				"CAPABILITY_MISSING",
				`sandbox backend ${this.deps.sandbox.backend.backend} is not qualified: ${this.deps.sandbox.qualification.reasons.join("; ")}`,
				{ nextActions: ["qualify_capability"] },
			);
		const capabilities = await this.deps.agent.describeCapabilities(this.deps.model);
		const unmet = this.unmetCapabilities(capabilities);
		if (unmet.length > 0)
			throw new DomainError(
				"CAPABILITY_MISSING",
				`model ${this.deps.model.provider_id}/${this.deps.model.model_id} cannot carry this intervention: ${unmet.join("; ")}`,
				{ nextActions: ["configure_model"] },
			);
	}

	/**
	 * What the described model cannot carry, read against the intervention that is about to open
	 * (AGT-01). Every role in `TOOLS_FOR_ROLE` receives tools, so a tool-call format that is not
	 * established refuses them all and the rule does not branch on the role. A thinking level the
	 * model does not accept is refused rather than sent: the host would silently clamp it to the
	 * nearest one it accepts, and the dossier would keep the level that was asked for.
	 */
	private unmetCapabilities(capabilities: AgentCapabilities): string[] {
		if (!capabilities.available)
			return capabilities.reasons.length > 0 ? capabilities.reasons : ["the model was not described as available"];
		const unmet: string[] = [];
		const levels = capabilities.thinking_levels.value;
		const asked = this.deps.model.thinking_level;
		if (levels && !levels.includes(asked))
			unmet.push(`thinking level ${asked} is not accepted by this model (accepted: ${levels.join(", ")})`);
		if (capabilities.tools.value !== true) unmet.push(capabilities.tools.note);
		return unmet;
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
		let budgetRefusal: string | null = null;
		const events: InterventionEvent[] = [];
		for await (const event of handle.events) {
			events.push(event);
			if (event.type === "tool_finished") {
				toolCalls++;
				const refused = budget();
				if (refused) {
					budgetRefusal ??= refused.message;
					await handle.abort(refused.message);
				}
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
			cost: unknownCost("the session ended without a terminal event reporting the host's total"),
		};
		// The tool calls the caller already counted one by one are not counted a second time.
		const counters = { ...t.counters, tool_calls: Math.max(0, t.counters.tool_calls - toolCalls) };
		const kept = events.filter((e) => e.type !== "model_event").slice(0, 500);
		const observed = requestsObserved(events, t.counters.tokens_known);
		// A session the kernel stopped on its tool-call budget was aborted, whatever it reported last: a
		// report written after the refused call is not a proposal the budget allowed.
		if (budgetRefusal !== null) {
			this.deps.progress(`intervention ${role} stopped by the tool call budget`);
			// Only the producer resumes on what it left: the other roles keep nothing between two runs.
			const onResume =
				role === "implement"
					? "the workspace keeps the unfinished work"
					: `a resume runs the ${role} intervention again from the start`;
			return {
				result: "cancelled",
				output: null,
				output_valid: false,
				counters,
				cost: t.cost,
				terminal: t,
				events: kept,
				imposed_layers_observed: observed,
				detail: `stopped by the tool call budget: ${budgetRefusal}; ${onResume}`,
				budget_refusal: budgetRefusal,
			};
		}
		// A session ended by the duration budget is not a proposal: the producer was still working.
		const truncated = t.type === "completed" && t.truncated === true;
		const result = truncated ? ("truncated" as const) : t.type;
		if (truncated) this.deps.progress(`intervention ${role} interrupted by the duration budget`);
		return {
			result,
			output: t.type === "completed" ? t.output : null,
			output_valid: t.type === "completed" ? t.output_valid : false,
			counters,
			cost: t.cost,
			terminal: t,
			events: kept,
			imposed_layers_observed: observed,
			detail:
				t.type === "failed"
					? t.error
					: truncated
						? `stopped by the ${this.deps.policy.budgets.intervention_ms} ms duration budget; the workspace keeps the unfinished work`
						: null,
			budget_refusal: null,
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
