import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { digestValue } from "../../contracts/digest.ts";
import type {
	AgentCapabilities,
	AgentPort,
	CapabilityFact,
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
	/** What a real observation would find of the endpoint: whether it calls the tools it is given. */
	calls_tools?: boolean;
	/** The thinking levels the simulated model accepts. */
	thinking_levels?: string[];
}

/** Every level Pi knows, which is what a scripted model accepts unless a script narrows it. */
const SCRIPTED_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

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
		const callsTools = this.defaultScript.calls_tools ?? true;
		// The rule that reads this description lives in the kernel; only the observations are scripted.
		const scripted = <T>(value: T): CapabilityFact<T> => ({ value, origin: "restated", note: "written by a script" });
		return {
			provider_id: model.provider_id,
			model_id: model.model_id,
			available,
			reasons: available ? [] : ["scripted provider unavailable"],
			tools: {
				value: callsTools,
				origin: "restated",
				note: callsTools
					? "the scripted endpoint calls the tools it is given"
					: "the scripted endpoint answers without calling the tool it was given",
			},
			streaming: scripted(true),
			cancellation: scripted(true),
			sessions: scripted(true),
			thinking_levels: scripted<readonly string[]>(this.defaultScript.thinking_levels ?? SCRIPTED_LEVELS),
			limits: scripted({ context_window_tokens: 131072, max_output_tokens: 32768, max_request_bytes: null }),
			result_shape: scripted<readonly string[]>(["text", "tool_call"]),
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
