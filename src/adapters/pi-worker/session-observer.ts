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
 */
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
