/**
 * What a model provider writes above the instructions 495 composes, before any of them ever run
 * (CTX-02, D-48). A pure lookup: it asks no provider, reads no package, opens no connection — that
 * is the control's job (`scripts/check-provider-system-block.ts`), not this one's. A provider
 * absent here is one this harness has never verified, and it is declared nothing rather than
 * guessed at.
 *
 * This table is an **expectation**, not an observation. It states what 495 has verified about a
 * provider's package, not what that provider put in front of the model on a given call. Pi
 * publishes `before_provider_request`, which hands over the request payload after the provider
 * built it; `e23s06` is open to read the imposed layer from there, at which point this table
 * becomes something an observation can be held against rather than the source (`D-55`).
 */

/**
 * `above_local_instructions` is the one position observed to date; D-48 is the sole prior art.
 *
 * `condition` is prose a reader reads back out of an exported dossier, so it is written to survive
 * that journey: the export redacts anything shaped like a secret, and a token prefix spelled out
 * far enough would be rewritten on its way out, leaving the dossier asserting a condition nobody
 * declared. Name the prefix, never a whole token.
 */
export interface ImposedLayer {
	readonly provider_id: string;
	readonly position: "above_local_instructions";
	readonly condition: string;
	readonly text: string;
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
 *
 * `IMPOSED` is an object literal and so inherits `Object.prototype`: a plain `IMPOSED[providerId]`
 * would resolve `providerId` values like `toString` or `__proto__` to an inherited member rather
 * than to nothing, which is exactly the false manifest this module exists to prevent. `providerId`
 * is not a constant — it comes from the owner's Pi model configuration — so this is a real
 * boundary, not a theoretical one.
 */
export function imposedLayersFor(providerId: string): ImposedLayer[] {
	if (!providerId || !Object.hasOwn(IMPOSED, providerId)) return [];
	return [IMPOSED[providerId]!];
}

/**
 * What a provider wrote around 495's instructions in one request, read out of the payload the host
 * handed over once the provider had built it (CTX-02, D-55). This is an **observation**, the
 * counterpart of `ImposedLayer`'s expectation.
 *
 * Above and below are relative to the system prompt the host built from 495's instructions, and
 * what the provider wrote is what surrounds it. `added_by_host` is what that prompt holds besides
 * 495's instructions: Pi 0.87.0 closes it with a section naming the session's working directory.
 *
 * `not_observed` carries its reason and never an empty list: not seeing is not seeing that nothing
 * was imposed. `local_instructions_not_found` keeps the system texts unplaced, because without 495's
 * own instructions in the request there is no above or below to put them in.
 */
export type ObservedLayers =
	| {
			readonly status: "observed";
			readonly api: string;
			readonly above_local_instructions: readonly string[];
			readonly below_local_instructions: readonly string[];
			readonly added_by_host: readonly string[];
	  }
	| { readonly status: "local_instructions_not_found"; readonly api: string; readonly system_texts: readonly string[] }
	| { readonly status: "not_observed"; readonly reason: string };
