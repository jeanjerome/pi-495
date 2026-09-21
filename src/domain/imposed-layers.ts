/**
 * What a model provider writes above the instructions 495 composes, before any of them ever run
 * (CTX-02, D-48). A pure lookup: it asks no provider, reads no package, opens no connection — that
 * is the control's job (`scripts/check-provider-system-block.ts`), not this one's. A provider
 * absent here is one this harness has never verified, and it is declared nothing rather than
 * guessed at.
 */

/** `above_local_instructions` is the one position observed to date; D-48 is the sole prior art. */
export interface ImposedLayer {
	provider_id: string;
	position: "above_local_instructions";
	condition: string;
	text: string;
}

const IMPOSED: Readonly<Record<string, ImposedLayer>> = Object.freeze({
	anthropic: Object.freeze({
		provider_id: "anthropic",
		position: "above_local_instructions",
		condition: "the OAuth subscription path is used (an access token prefixed sk-ant-oat)",
		text: "You are Claude Code, Anthropic's official CLI for Claude.",
	}),
});

/**
 * The layers a provider imposes, or an empty list for a provider that imposes nothing, an unknown
 * provider, or an empty identifier (§6a–§6c of e23s02). 495 declares only what it has verified
 * against the provider's own package; it does not infer a layer from a name it has never checked.
 */
export function imposedLayersFor(providerId: string): ImposedLayer[] {
	if (!providerId) return [];
	const layer = IMPOSED[providerId];
	return layer ? [layer] : [];
}
