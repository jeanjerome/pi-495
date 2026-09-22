/**
 * What a model is described as being able to do, read from the host (CMP-INT, AGT-01, D-55).
 *
 * Pi carries the catalogue, the provider's authentication and the thinking levels each model
 * accepts, so those are read from it rather than restated here. Three kinds — streaming,
 * cancellation, sessions — are properties of the contract Pi publishes for every provider and not
 * of one model, so they are restated, with the note saying on what. One kind is reported by
 * nothing: neither `Model` (pi-ai 0.87.0) nor the model definition `models.json` accepts carries a
 * tool-calling field, and an OpenAI-compatible endpoint announces the dialect whether or not it
 * honours tool calls (AGT-02). It is therefore observed: one request, one trivial tool, and the
 * answer says whether the tool was called. Delete the observation the day the host reports it.
 */
import { getSupportedThinkingLevels, Type, type Api, type Model } from "@earendil-works/pi-ai";
import type { AgentCapabilities, CapabilityFact, ModelLimits, ModelSelection } from "../../ports/execution.ts";

/**
 * The part of Pi's model surface a description reads. `ModelRegistry` (pi-coding-agent 0.87.0)
 * satisfies it as it stands, and `ctx.modelRegistry` hands one to the extension.
 */
export interface PiModelCatalogue {
	find(provider: string, modelId: string): Model<Api> | undefined;
	hasConfiguredAuth(model: Model<Api>): boolean;
	complete(
		model: Model<Api>,
		context: {
			systemPrompt?: string;
			messages: { role: "user"; content: string; timestamp: number }[];
			tools?: { name: string; description: string; parameters: ReturnType<typeof Type.Object> }[];
		},
		options?: { maxTokens?: number; signal?: AbortSignal },
	): Promise<{ content: { type: string }[] }>;
}

/** The whole of what the observation sends: no project excerpt, no prompt, no path. */
const PROBE_TOOL = {
	name: "harness495_probe",
	description: "Report readiness. Call this tool with ready set to true.",
	parameters: Type.Object({ ready: Type.Boolean() }),
};
const PROBE_INSTRUCTION = "You qualify an endpoint. Call the tool you are given. Write no prose.";
const PROBE_REQUEST = "Call harness495_probe with ready set to true.";
const PROBE_MAX_TOKENS = 256;
const PROBE_TIMEOUT_MS = 30_000;

function fact<T>(value: T | null, origin: "reported" | "restated", note: string): CapabilityFact<T> {
	return { value, origin, note };
}

/** Said of a pair that could not be consulted: an absence is never an availability. */
function unconsulted(reasons: string[], selection: ModelSelection, note: string): AgentCapabilities {
	const nothing = <T>(): CapabilityFact<T> => fact<T>(null, "reported", note);
	return {
		provider_id: selection.provider_id,
		model_id: selection.model_id,
		available: false,
		reasons,
		tools: nothing<boolean>(),
		streaming: nothing<boolean>(),
		cancellation: nothing<boolean>(),
		sessions: nothing<boolean>(),
		thinking_levels: nothing<readonly string[]>(),
		limits: nothing<ModelLimits>(),
		result_shape: nothing<readonly string[]>(),
	};
}

/**
 * Describes the model of a selection from the host, and holds what it had to observe for as long as
 * the session lives: ten interventions on one model observe it once.
 */
export class PiModelDescription {
	private readonly observed = new Map<string, CapabilityFact<boolean>>();
	private readonly catalogue: PiModelCatalogue | null;
	private readonly probeTimeoutMs: number;
	constructor(catalogue: PiModelCatalogue | null, probeTimeoutMs: number = PROBE_TIMEOUT_MS) {
		this.catalogue = catalogue;
		this.probeTimeoutMs = probeTimeoutMs;
	}

	async describe(selection: ModelSelection): Promise<AgentCapabilities> {
		const pair = `${selection.provider_id}/${selection.model_id}`;
		if (!this.catalogue)
			return unconsulted(
				[`no model catalogue was given to the supervisor, so ${pair} could not be consulted`],
				selection,
				"the host was not reachable from the process that describes",
			);
		const model = this.catalogue.find(selection.provider_id, selection.model_id);
		if (!model)
			return unconsulted(
				[`${pair} is not configured in Pi; no fallback is attempted`],
				selection,
				"the pair is absent from the catalogue, so the host reports nothing of it",
			);
		if (!this.catalogue.hasConfiguredAuth(model))
			return unconsulted(
				[`${pair} has no complete authentication in Pi`],
				selection,
				"the provider is unauthenticated, so the endpoint was not asked",
			);
		return {
			provider_id: selection.provider_id,
			model_id: selection.model_id,
			available: true,
			reasons: [],
			tools: await this.toolCallFormat(this.catalogue, model, pair),
			streaming: fact(true, "restated", "every provider of pi-ai streams; no field says it of one model"),
			cancellation: fact(true, "restated", "a request carries an abort signal; no field says it of one model"),
			sessions: fact(true, "restated", "the host keeps the session; no field says it of one model"),
			thinking_levels: fact(getSupportedThinkingLevels(model), "reported", "as the host derives them for this model"),
			limits: fact(
				{
					context_window_tokens: model.contextWindow,
					max_output_tokens: model.maxTokens,
					max_request_bytes: model.inputLimits?.maxRequestBytes ?? null,
				},
				"reported",
				"as the model carries them in the catalogue",
			),
			result_shape: fact(
				model.reasoning ? ["text", "thinking", "tool_call"] : ["text", "tool_call"],
				"restated",
				"the content kinds one turn returns, from the stream contract; only reasoning is reported per model",
			),
		};
	}

	/** One request per pair. A pair already observed costs nothing; the answer is what it said then. */
	private async toolCallFormat(
		catalogue: PiModelCatalogue,
		model: Model<Api>,
		pair: string,
	): Promise<CapabilityFact<boolean>> {
		const held = this.observed.get(pair);
		if (held) return held;
		const abort = AbortSignal.timeout(this.probeTimeoutMs);
		let observation: CapabilityFact<boolean>;
		try {
			const answer = await catalogue.complete(
				model,
				{
					systemPrompt: PROBE_INSTRUCTION,
					messages: [{ role: "user", content: PROBE_REQUEST, timestamp: Date.now() }],
					tools: [PROBE_TOOL],
				},
				{ maxTokens: PROBE_MAX_TOKENS, signal: abort },
			);
			const called = answer.content.some((block) => block.type === "toolCall");
			observation = fact(
				called,
				"reported",
				called
					? "the endpoint called the tool it was given"
					: "the endpoint answered without calling the tool it was given",
			);
		} catch (error) {
			observation = fact<boolean>(
				null,
				"reported",
				`the tool-call format could not be observed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		this.observed.set(pair, observation);
		return observation;
	}
}
