/**
 * What a model provider writes above the instructions 495 composes (CTX-02, D-48, D-55). A pure
 * lookup: it asks no provider, reads no package, opens no connection. A provider absent here is one
 * this harness has never verified, and it is declared nothing rather than guessed at.
 *
 * This table is an **expectation**, not an observation. It states what 495 once verified about a
 * provider's package, not what that provider put in front of the model on a given call. The source
 * of the second is the request itself: the worker reads it from the payload Pi hands to
 * `before_provider_request`, and `compareImposedLayers` holds that observation against this table.
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

/** One way the request departed from what the manifest expected. */
export type LayerDisagreement =
	| { readonly kind: "expected_not_observed"; readonly text: string; readonly condition: string }
	| {
			readonly kind: "observed_not_expected";
			readonly position: "above_local_instructions" | "below_local_instructions";
			readonly text: string;
	  }
	| { readonly kind: "local_instructions_not_found"; readonly system_texts: readonly string[] };

/**
 * An observation held against the manifest's expectation. What the host added to 495's instructions
 * is not held against anything: the expectation speaks of providers, and the observation keeps the
 * host's part on its own. A missing observation is `not_compared`, since there is nothing to hold.
 */
export type LayerComparison =
	| { readonly verdict: "agrees" }
	| { readonly verdict: "disagrees"; readonly disagreements: readonly LayerDisagreement[] }
	| { readonly verdict: "not_compared" };

/** What the dossier keeps of one request: the observation, and how it compares with the manifest. */
export interface ImposedLayersRecord {
	readonly observed_in_request: ObservedLayers;
	readonly compared_with_manifest: LayerComparison;
}

/**
 * A block whose text changed is named twice — the expected text not observed, the observed text not
 * expected — so both texts reach the dossier without a third kind to pair them.
 */
export function compareImposedLayers(expected: readonly ImposedLayer[], observed: ObservedLayers): LayerComparison {
	if (observed.status === "not_observed") return { verdict: "not_compared" };
	if (observed.status === "local_instructions_not_found")
		return {
			verdict: "disagrees",
			disagreements: [{ kind: "local_instructions_not_found", system_texts: observed.system_texts }],
		};
	const expectedTexts = new Set(expected.map((layer) => layer.text));
	const disagreements: LayerDisagreement[] = [
		...expected
			.filter((layer) => !observed.above_local_instructions.includes(layer.text))
			.map((layer) => ({ kind: "expected_not_observed" as const, text: layer.text, condition: layer.condition })),
		...observed.above_local_instructions
			.filter((text) => !expectedTexts.has(text))
			.map((text) => ({ kind: "observed_not_expected" as const, position: "above_local_instructions" as const, text })),
		...observed.below_local_instructions.map((text) => ({
			kind: "observed_not_expected" as const,
			position: "below_local_instructions" as const,
			text,
		})),
	];
	return disagreements.length === 0 ? { verdict: "agrees" } : { verdict: "disagrees", disagreements };
}

export function recordImposedLayers(expected: readonly ImposedLayer[], observed: ObservedLayers): ImposedLayersRecord {
	return { observed_in_request: observed, compared_with_manifest: compareImposedLayers(expected, observed) };
}

/** The record of an intervention the kernel ended itself, before its session reported any request. */
export function unobservedEnd(reason: string): ImposedLayersRecord {
	return recordImposedLayers([], { status: "not_observed", reason });
}
