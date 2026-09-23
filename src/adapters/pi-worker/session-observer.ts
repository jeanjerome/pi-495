/**
 * What a Pi session reports of itself, turned into what the kernel is told (CMP-INT, CTX-02, D-55).
 *
 * The worker read one event out of the session — the assistant's answer — and counted its tokens.
 * Pi reports a second thing that changes the intervention: when the conversation no longer fits the
 * window, it replaces an older part of it with a summary, and the request that writes that summary
 * is billed like any other. Both were leaving the session unread, so a manifest sealed at the start
 * stayed the dossier's only word on what the model held, and the token counter ignored the summary.
 *
 * The events are read here rather than in the worker's subscriber so a test can hold them without
 * a subprocess. `compaction_start` says nothing `compaction_end` does not, and is not read.
 *
 * The cost is read the same way, once, when the session ends. The host totals it over every entry
 * of the session, summaries and cache refreshes included, at the rates of its own catalogue; 495
 * keeps no price table and only says where the amount comes from (AGT-07).
 */
import { type InterventionCost, unknownCost } from "../../domain/change/state.ts";
import type { InterventionEvent } from "../../ports/execution.ts";

/**
 * The part of a session event this reads (pi-coding-agent 0.87.0). Pi's own union carries more; the
 * worker hands it over as it hands over the assistant message, naming the fields it uses.
 */
export interface SessionEventRead {
	type: string;
	message?: {
		role?: string;
		usage?: { totalTokens?: number };
		content?: { type: string; text?: string }[];
		errorMessage?: string;
		stopReason?: string;
	};
	reason?: "manual" | "threshold" | "overflow";
	/** Pi carries the field on every `compaction_end`, and leaves it undefined when nothing was written. */
	result?: { tokensBefore?: number; estimatedTokensAfter?: number; usage?: { totalTokens?: number } } | undefined;
	aborted?: boolean;
	errorMessage?: string;
}

export interface Observation {
	/** Tokens to add to what the intervention is known to have consumed. */
	tokens: number;
	/** What the kernel is told. Empty for an event the worker does not read. */
	events: InterventionEvent[];
	/** The assistant's text, when this event carried one. */
	text?: string;
	/** The error the assistant's answer ended on, when it did. */
	error?: string;
}

const nothing: Observation = { tokens: 0, events: [] };

/**
 * Why a rewrite did not happen, or `null` when it did. An aborted compaction and a failed one both
 * leave the context as it was, which is what the kernel needs to know: the window that forced the
 * summary is still full.
 */
function unwritten(event: SessionEventRead): string | null {
	if (event.aborted === true) return "aborted";
	if (event.result === undefined) return event.errorMessage ?? "no summary was produced";
	return null;
}

export function observeSessionEvent(event: SessionEventRead, at: string): Observation {
	if (event.type === "message_end") {
		const message = event.message;
		if (message?.role !== "assistant") return nothing;
		const tokens = message.usage?.totalTokens ?? 0;
		const text = (message.content ?? [])
			.filter((block) => block.type === "text")
			.map((block) => block.text ?? "")
			.join("");
		const observation: Observation = {
			tokens,
			events: [{ type: "model_event", at, kind: "usage", tokens }],
		};
		if (text.trim()) observation.text = text;
		if (message.stopReason === "error") observation.error = message.errorMessage ?? "model error";
		return observation;
	}
	if (event.type === "compaction_end") {
		const why = unwritten(event);
		const summaryTokens = event.result?.usage?.totalTokens ?? 0;
		return {
			tokens: summaryTokens,
			events: [
				{
					type: "context_compacted",
					at,
					reason: event.reason ?? "threshold",
					tokens_before: why === null ? (event.result?.tokensBefore ?? null) : null,
					tokens_after: why === null ? (event.result?.estimatedTokensAfter ?? null) : null,
					summary_tokens: summaryTokens,
					unwritten: why,
				},
			],
		};
	}
	return nothing;
}

/** The part of the host's session this reads for the cost (pi-coding-agent 0.87.0, `getSessionStats`). */
export interface SessionTotalsRead {
	getSessionStats(): { tokens: { total: number }; cost: number };
}

/** The part of the host's model runtime that says how a provider is reached. */
export interface SubscriptionRead {
	isUsingSubscription(providerId: string): boolean;
}

interface CatalogueRates {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** The catalogue entry of the session's model: its rates, per million tokens, tiers included. */
export interface CatalogueEntryRead {
	provider: string;
	id: string;
	cost: CatalogueRates & { tiers?: CatalogueRates[] };
}

/**
 * What the session cost, as the host totals it (AGT-07). A catalogue that declares no rate is read
 * by the host as zero everywhere, so the amount it computes is zero whatever was consumed: that is
 * an unknown cost, never a free one (NFR-06). A session that reported no usage has nothing to
 * price either.
 */
export function readSessionCost(
	session: SessionTotalsRead,
	runtime: SubscriptionRead,
	model: CatalogueEntryRead,
): InterventionCost {
	const subscription = runtime.isUsingSubscription(model.provider);
	const rates = [model.cost, ...(model.cost.tiers ?? [])];
	if (!rates.some((r) => r.input > 0 || r.output > 0 || r.cacheRead > 0 || r.cacheWrite > 0))
		return unknownCost(`the host catalogue has no rate for ${model.provider}/${model.id}`, subscription);
	const stats = session.getSessionStats();
	if (stats.tokens.total === 0) return unknownCost("the session reported no usage", subscription);
	return { usd: stats.cost, unknown_reason: null, basis: "host_catalogue", subscription };
}
