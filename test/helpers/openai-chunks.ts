/** The usage an OpenAI-compatible server reports on the last chunk of an answer. */
interface Usage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

/**
 * The chunks an OpenAI-compatible server streams for one answer: the role, the delta that carries
 * the answer, the end with its usage, then `[DONE]`.
 */
export function openaiChunks(
	head: { id: string; model: string },
	delta: Record<string, unknown>,
	usage: Usage,
	finish_reason = "stop",
): string[] {
	const chunk = { id: head.id, object: "chat.completion.chunk", created: 0, model: head.model };
	return [
		JSON.stringify({ ...chunk, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }),
		JSON.stringify({ ...chunk, choices: [{ index: 0, delta, finish_reason: null }] }),
		JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason }], usage }),
		"[DONE]",
	];
}
