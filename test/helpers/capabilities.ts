import type { AgentCapabilities, CapabilityFact, ModelSelection } from "../../src/ports/execution.ts";

const written = <T>(value: T | null, note = "written by a test"): CapabilityFact<T> => ({
	value,
	origin: "restated",
	note,
});

/**
 * A model description a test writes whole, so each test narrows only the kind it is about and no
 * kind is left unanswered by accident.
 */
export function describedAs(model: ModelSelection, over: Partial<AgentCapabilities> = {}): AgentCapabilities {
	const available = Boolean(model.provider_id && model.model_id);
	return {
		provider_id: model.provider_id,
		model_id: model.model_id,
		available,
		reasons: available ? [] : [`${model.provider_id}/${model.model_id} is not configured`],
		tools: written(true),
		streaming: written(true),
		cancellation: written(true),
		sessions: written(true),
		thinking_levels: written<readonly string[]>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]),
		limits: written({ context_window_tokens: 131072, max_output_tokens: 32768, max_request_bytes: null }),
		result_shape: written<readonly string[]>(["text", "tool_call"]),
		...over,
	};
}
