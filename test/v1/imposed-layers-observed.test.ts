/**
 * What a provider wrote around 495's instructions, read out of the request payload the host hands
 * over once the provider has built it (CTX-02, D-55). The payloads below reproduce the two shapes
 * Pi 0.87.0 builds: `anthropic-messages` puts the system part in a list of text blocks, the imposed
 * one first on the subscription path; `openai-completions` puts it in the leading messages. Pi
 * passes the payload untyped, so a shape the reader does not know is never taken for an absence.
 *
 * Two texts locate the harness's part of the request: the instructions 495 composed, and the system
 * prompt the host built from them, which Pi reports as it is sent and which carries sections of its
 * own. What surrounds the host's prompt was written by the provider; what the host's prompt holds
 * besides 495's instructions was added by the host.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readImposedLayers } from "../../src/adapters/pi-worker/provider-request.ts";

const LOCAL = "You are the specification role of the 495 harness.";
const CWD = "\n\n<cwd>\n/workspace/candidate\n</cwd>";
const HOST = `${LOCAL}${CWD}`;
/** The host's prompt when it adds nothing to 495's instructions. */
const BARE = { host: LOCAL, local: LOCAL };
const IMPOSED = "You are Claude Code, Anthropic's official CLI for Claude.";
const EXCERPT = "project excerpt: an untrusted line the model reads";
const TOOL_RESULT = "tool result: the content of src/greet.js";

function anthropicPayload(system: unknown): Record<string, unknown> {
	return {
		model: "claude-sonnet-5",
		system,
		messages: [
			{ role: "user", content: [{ type: "text", text: EXCERPT }] },
			{ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: TOOL_RESULT }] },
		],
		max_tokens: 1024,
		stream: true,
	};
}

function openaiPayload(leading: unknown[]): Record<string, unknown> {
	return {
		model: "qwen3.8-27b-oq8e",
		messages: [...leading, { role: "user", content: EXCERPT }, { role: "tool", content: TOOL_RESULT }],
		stream: true,
	};
}

const text = (t: string) => ({ type: "text", text: t, cache_control: { type: "ephemeral" } });

describe("imposed layers read out of the provider request (CTX-02, D-55)", () => {
	it("relates the block the provider wrote above 495's instructions on the subscription path", () => {
		const observed = readImposedLayers("anthropic-messages", anthropicPayload([text(IMPOSED), text(LOCAL)]), BARE);
		assert.deepEqual(observed, {
			status: "observed",
			api: "anthropic-messages",
			above_local_instructions: [IMPOSED],
			below_local_instructions: [],
			added_by_host: [],
		});
	});

	it("observes nothing around 495's instructions when the provider imposes nothing (6a)", () => {
		assert.deepEqual(readImposedLayers("anthropic-messages", anthropicPayload([text(LOCAL)]), BARE), {
			status: "observed",
			api: "anthropic-messages",
			above_local_instructions: [],
			below_local_instructions: [],
			added_by_host: [],
		});
		assert.deepEqual(
			readImposedLayers("openai-completions", openaiPayload([{ role: "system", content: LOCAL }]), BARE),
			{
				status: "observed",
				api: "openai-completions",
				above_local_instructions: [],
				below_local_instructions: [],
				added_by_host: [],
			},
		);
	});

	it("relates what a provider writes below 495's instructions as well", () => {
		const observed = readImposedLayers("anthropic-messages", anthropicPayload([text(LOCAL), text("appended")]), BARE);
		assert.deepEqual(observed, {
			status: "observed",
			api: "anthropic-messages",
			above_local_instructions: [],
			below_local_instructions: ["appended"],
			added_by_host: [],
		});
	});

	it("reads the leading instruction messages of a compatible endpoint, whatever their role", () => {
		const observed = readImposedLayers(
			"openai-completions",
			openaiPayload([
				{ role: "system", content: "an endpoint preamble" },
				{ role: "developer", content: LOCAL },
			]),
			BARE,
		);
		assert.deepEqual(observed, {
			status: "observed",
			api: "openai-completions",
			above_local_instructions: ["an endpoint preamble"],
			below_local_instructions: [],
			added_by_host: [],
		});
	});

	it("keeps nothing of the payload but the system texts", () => {
		for (const [api, payload] of [
			["anthropic-messages", anthropicPayload([text(IMPOSED), text(LOCAL)])],
			["openai-completions", openaiPayload([{ role: "system", content: LOCAL }])],
		] as const) {
			const kept = JSON.stringify(readImposedLayers(api, payload, BARE));
			assert.ok(!kept.includes(EXCERPT), `${api}: a project excerpt was kept`);
			assert.ok(!kept.includes(TOOL_RESULT), `${api}: a tool result was kept`);
			assert.ok(!kept.includes(LOCAL), `${api}: 495's own instructions were kept`);
		}
	});

	it("names 495's instructions as not found when the provider rewrote them, and keeps the texts unplaced (6e)", () => {
		assert.deepEqual(
			readImposedLayers("anthropic-messages", anthropicPayload([text(IMPOSED), text("a rewritten prompt")]), BARE),
			{
				status: "local_instructions_not_found",
				api: "anthropic-messages",
				system_texts: [IMPOSED, "a rewritten prompt"],
			},
		);
		// The provider leaves the system part out altogether when it has nothing to put there.
		assert.deepEqual(readImposedLayers("anthropic-messages", anthropicPayload(undefined), BARE), {
			status: "local_instructions_not_found",
			api: "anthropic-messages",
			system_texts: [],
		});
		assert.deepEqual(readImposedLayers("openai-completions", openaiPayload([]), BARE), {
			status: "local_instructions_not_found",
			api: "openai-completions",
			system_texts: [],
		});
	});

	it("tells what the host added to 495's instructions apart from what the provider wrote around them", () => {
		const observed = readImposedLayers("anthropic-messages", anthropicPayload([text(IMPOSED), text(HOST)]), {
			host: HOST,
			local: LOCAL,
		});
		assert.deepEqual(observed, {
			status: "observed",
			api: "anthropic-messages",
			above_local_instructions: [IMPOSED],
			below_local_instructions: [],
			added_by_host: [CWD],
		});
		const leading = readImposedLayers(
			"openai-completions",
			openaiPayload([{ role: "system", content: `preface${HOST}` }]),
			{
				host: `preface${HOST}`,
				local: LOCAL,
			},
		);
		assert.deepEqual(leading, {
			status: "observed",
			api: "openai-completions",
			above_local_instructions: [],
			below_local_instructions: [],
			added_by_host: ["preface", CWD],
		});
	});

	it("names 495's instructions as not found when the host's prompt no longer holds them (6e)", () => {
		assert.deepEqual(
			readImposedLayers("anthropic-messages", anthropicPayload([text("a prompt the host rewrote")]), {
				host: "a prompt the host rewrote",
				local: LOCAL,
			}),
			{
				status: "local_instructions_not_found",
				api: "anthropic-messages",
				system_texts: ["a prompt the host rewrote"],
			},
		);
	});

	it("does not observe a payload of an api it cannot read, and never reports it as empty (6d)", () => {
		const observed = readImposedLayers("openai-responses", { instructions: LOCAL, input: [] }, BARE);
		assert.equal(observed.status, "not_observed");
		assert.match(observed.status === "not_observed" ? observed.reason : "", /openai-responses/);
	});

	it("does not observe a known api whose payload no longer has the shape it reads (6d)", () => {
		const unreadable: Array<[string, unknown]> = [
			["anthropic-messages", null],
			["anthropic-messages", "a string"],
			["anthropic-messages", anthropicPayload(LOCAL)],
			["anthropic-messages", anthropicPayload([{ type: "image", source: {} }, text(LOCAL)])],
			["anthropic-messages", anthropicPayload([{ type: "text", text: 42 }])],
			["openai-completions", { messages: "not a list" }],
			["openai-completions", openaiPayload([{ role: "system", content: [{ type: "text", text: LOCAL }] }])],
		];
		for (const [api, payload] of unreadable) {
			const observed = readImposedLayers(api, payload, BARE);
			assert.equal(observed.status, "not_observed", `${api} ${JSON.stringify(payload)?.slice(0, 80)}`);
			assert.ok(observed.status === "not_observed" && observed.reason.length > 0);
		}
	});
});
