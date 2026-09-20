import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { digestValue } from "../../contracts/digest.ts";
import type {
	AgentCapabilities,
	AgentPort,
	InterventionEvent,
	InterventionHandle,
	InterventionMandate,
	ModelSelection,
} from "../../ports/execution.ts";

export type ScriptStep =
	| { kind: "write"; path: string; content: string }
	| { kind: "delete"; path: string }
	| { kind: "tool"; tool: string; blocked?: boolean; is_error?: boolean }
	| { kind: "text"; text: string }
	| { kind: "complete"; output: unknown; output_valid?: boolean }
	/** The duration budget ended the session: whatever was written stays in the workspace. */
	| { kind: "truncate"; output?: unknown }
	| { kind: "fail"; error: string }
	| { kind: "hang" };

export interface AgentScript {
	steps: ScriptStep[];
	available?: boolean;
	tokens?: number;
}

/**
 * Deterministic agent simulator (F-AGENTS, ADR-004 tests): replays scripted actions in the
 * workspace and emits closed-set events. Used for V0–V3 without any model.
 */
export class ScriptedAgent implements AgentPort {
	readonly scripts: Map<string, AgentScript>;
	readonly started: InterventionMandate[] = [];
	private readonly defaultScript: AgentScript;
	constructor(defaultScript: AgentScript, scripts: Record<string, AgentScript> = {}) {
		this.defaultScript = defaultScript;
		this.scripts = new Map(Object.entries(scripts));
	}
	async describeCapabilities(model: ModelSelection): Promise<AgentCapabilities> {
		const available = this.defaultScript.available ?? true;
		return {
			provider_id: model.provider_id,
			model_id: model.model_id,
			available,
			reasons: available ? [] : ["scripted provider unavailable"],
		};
	}
	async startIntervention(mandate: InterventionMandate): Promise<InterventionHandle> {
		this.started.push(mandate);
		const script = this.scripts.get(mandate.role) ?? this.defaultScript;
		let aborted = false;
		const self = this;
		const events: AsyncIterable<InterventionEvent> = {
			async *[Symbol.asyncIterator]() {
				const started = Date.now();
				let toolCalls = 0;
				const counters = () => ({
					tool_calls: toolCalls,
					duration_ms: Date.now() - started,
					tokens_known: script.tokens ?? 0,
					delegations: 0,
				});
				yield { type: "started", at: new Date().toISOString() };
				for (const step of script.steps) {
					if (aborted) {
						yield { type: "cancelled", at: new Date().toISOString(), counters: counters() };
						return;
					}
					switch (step.kind) {
						case "write": {
							toolCalls++;
							const allowed = self.allowedTools(mandate).has("write");
							yield {
								type: "tool_started",
								at: new Date().toISOString(),
								tool: "write",
								call_id: `call_${toolCalls}`,
								args_digest: digestValue(step),
							};
							if (allowed && toolCalls <= mandate.budgets.tool_calls) {
								const target = join(mandate.workspace_path, step.path);
								await mkdir(dirname(target), { recursive: true });
								await writeFile(target, step.content);
								yield {
									type: "tool_finished",
									at: new Date().toISOString(),
									tool: "write",
									call_id: `call_${toolCalls}`,
									is_error: false,
									blocked: false,
								};
							} else
								yield {
									type: "tool_finished",
									at: new Date().toISOString(),
									tool: "write",
									call_id: `call_${toolCalls}`,
									is_error: true,
									blocked: true,
								};
							break;
						}
						case "delete": {
							toolCalls++;
							yield {
								type: "tool_started",
								at: new Date().toISOString(),
								tool: "bash",
								call_id: `call_${toolCalls}`,
								args_digest: digestValue(step),
							};
							if (self.allowedTools(mandate).has("bash")) {
								await rm(join(mandate.workspace_path, step.path), { force: true });
								yield {
									type: "tool_finished",
									at: new Date().toISOString(),
									tool: "bash",
									call_id: `call_${toolCalls}`,
									is_error: false,
									blocked: false,
								};
							} else
								yield {
									type: "tool_finished",
									at: new Date().toISOString(),
									tool: "bash",
									call_id: `call_${toolCalls}`,
									is_error: true,
									blocked: true,
								};
							break;
						}
						case "tool":
							toolCalls++;
							yield {
								type: "tool_started",
								at: new Date().toISOString(),
								tool: step.tool,
								call_id: `call_${toolCalls}`,
								args_digest: digestValue(step),
							};
							yield {
								type: "tool_finished",
								at: new Date().toISOString(),
								tool: step.tool,
								call_id: `call_${toolCalls}`,
								is_error: step.is_error ?? false,
								blocked: step.blocked ?? !self.allowedTools(mandate).has(step.tool),
							};
							break;
						case "text":
							yield { type: "model_event", at: new Date().toISOString(), kind: "text", text: step.text };
							break;
						case "complete":
							yield {
								type: "completed",
								at: new Date().toISOString(),
								output: step.output,
								output_valid: step.output_valid ?? true,
								counters: counters(),
							};
							return;
						case "truncate":
							yield {
								type: "completed",
								at: new Date().toISOString(),
								output: step.output ?? { raw: "" },
								output_valid: false,
								truncated: true,
								counters: counters(),
							};
							return;
						case "fail":
							yield { type: "failed", at: new Date().toISOString(), error: step.error, counters: counters() };
							return;
						case "hang":
							while (!aborted) await new Promise((r) => setTimeout(r, 20));
							yield { type: "cancelled", at: new Date().toISOString(), counters: counters() };
							return;
					}
				}
				yield {
					type: "completed",
					at: new Date().toISOString(),
					output: { raw: "" },
					output_valid: false,
					counters: counters(),
				};
			},
		};
		return {
			intervention_id: mandate.intervention_id,
			events,
			abort: async () => {
				aborted = true;
			},
		};
	}
	allowedTools(mandate: InterventionMandate): Set<string> {
		return new Set(mandate.tools);
	}
}
