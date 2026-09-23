/**
 * What a provider wrote around 495's instructions, read out of the request payload Pi hands to
 * `before_provider_request` once the provider has built it (CMP-INT, CTX-02, D-55).
 *
 * Confirmed against Pi 0.87.0: `pi-ai/dist/api/anthropic-messages.js` adds the subscription block in
 * `buildParams`, while it serializes the request — after `context_with_system` has run, which
 * therefore never carries it. Only this payload holds what the provider actually wrote.
 *
 * Pi passes the payload untyped (`BeforeProviderRequestEvent.payload: unknown`). Each shape read here
 * is the one that version builds; anything else is reported as not observed, with its reason.
 */
import type { LoadExtensionsResult, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ObservedLayers } from "../../domain/imposed-layers.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** The system part is a list of text blocks, left out altogether when there is nothing to put in it. */
function anthropicSystemTexts(payload: Record<string, unknown>): string[] {
	if (payload.system === undefined) return [];
	if (!Array.isArray(payload.system)) throw new Error("the system part is not a list of blocks");
	return payload.system.map((block: unknown) => {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string")
			throw new Error("a system block is not a text block");
		return block.text;
	});
}

/** The instructions are the leading `system` or `developer` messages, each carrying a text string. */
function openaiSystemTexts(payload: Record<string, unknown>): string[] {
	if (!Array.isArray(payload.messages)) throw new Error("the messages are not a list");
	const texts: string[] = [];
	for (const message of payload.messages as unknown[]) {
		if (!isRecord(message) || (message.role !== "system" && message.role !== "developer")) break;
		if (typeof message.content !== "string") throw new Error("a leading instruction message carries no text string");
		texts.push(message.content);
	}
	return texts;
}

// A Map, not an object literal: the api name comes from the owner's model configuration, and an
// inherited member such as `toString` must resolve to no reader rather than to a function.
const SYSTEM_TEXT_READERS: ReadonlyMap<string, (payload: Record<string, unknown>) => string[]> = new Map([
	["anthropic-messages", anthropicSystemTexts],
	["openai-completions", openaiSystemTexts],
]);

/**
 * `prompts.host` is the system prompt the host reports for the request — what it built from
 * `prompts.local`, the instructions 495 composed. The provider wrote what surrounds the first; the
 * host added what the first holds besides the second.
 */
export function readImposedLayers(
	api: string,
	payload: unknown,
	prompts: { readonly host: string; readonly local: string },
): ObservedLayers {
	const read = SYSTEM_TEXT_READERS.get(api);
	if (!read) return { status: "not_observed", reason: `a request of api ${api} is not a shape this harness reads` };
	let texts: string[];
	try {
		if (!isRecord(payload)) throw new Error("the payload is not an object");
		texts = read(payload);
	} catch (error) {
		return {
			status: "not_observed",
			reason: `the ${api} request is not the shape this harness reads: ${(error as Error).message}`,
		};
	}
	const at = texts.indexOf(prompts.host);
	const within = prompts.host.indexOf(prompts.local);
	if (at < 0 || within < 0) return { status: "local_instructions_not_found", api, system_texts: texts };
	return {
		status: "observed",
		api,
		above_local_instructions: texts.slice(0, at),
		below_local_instructions: texts.slice(at + 1),
		added_by_host: [prompts.host.slice(0, within), prompts.host.slice(within + prompts.local.length)].filter(
			(added) => added.length > 0,
		),
	};
}

/**
 * Reads each request a session sends and reports what the provider wrote around 495's instructions:
 * the first request, then each one that differs from the last reported. It always returns
 * `undefined`, and Pi leaves a payload unchanged when a handler returns nothing
 * (`docs/extensions.md` § before_provider_request): the request leaves as the provider built it.
 */
export class RequestLayerObserver {
	private readonly api: string;
	private readonly localInstructions: string;
	private readonly report: (observation: ObservedLayers) => void;
	private lastReported: string | null = null;

	constructor(api: string, localInstructions: string, report: (observation: ObservedLayers) => void) {
		this.api = api;
		this.localInstructions = localInstructions;
		this.report = report;
	}

	/** `hostSystemPrompt` reads what the host reports for this request; it is asked once, here. */
	observe(payload: unknown, hostSystemPrompt: () => string): undefined {
		let observation: ObservedLayers;
		try {
			observation = readImposedLayers(this.api, payload, { host: hostSystemPrompt(), local: this.localInstructions });
		} catch (error) {
			observation = {
				status: "not_observed",
				reason: `the system prompt the host reports could not be read: ${(error as Error).message}`,
			};
		}
		const key = JSON.stringify(observation);
		if (key === this.lastReported) return undefined;
		this.lastReported = key;
		this.report(observation);
		return undefined;
	}
}

/**
 * The extensions a worker session loads: the request observer, and nothing else.
 *
 * Pi 0.87.0 builds an inline extension only inside its own loader — `loadExtensionFromFactory` is
 * not exported — so that loader hosts it, with every discovery switched off (project and agent
 * extensions, skills, prompts, themes, context files) and the worker's in-memory settings, so no
 * package a project declares is resolved. `pi` is the module the worker imported, which is the Pi
 * installed on the machine and may not be the one this repository pins.
 */
export async function loadRequestObserver(
	pi: typeof import("@earendil-works/pi-coding-agent"),
	where: { cwd: string; agentDir: string; settingsManager: SettingsManager },
	observer: RequestLayerObserver,
): Promise<LoadExtensionsResult> {
	const loader = new pi.DefaultResourceLoader({
		...where,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		extensionFactories: [
			{
				name: "495-request-observer",
				factory: (extension) => {
					extension.on("before_provider_request", (event, ctx) =>
						observer.observe(event.payload, () => ctx.getSystemPrompt()),
					);
				},
			},
		],
	});
	await loader.reload();
	return loader.getExtensions();
}
