/**
 * A frozen case that reads the text of a source passes the unit control and fails the initial run of the mutation
 * control, which runs the suite on sources it rewrote: the producer, who cannot change the case, and the examiner of
 * a contestation are told so, and the case is contested rather than left to exhaust the attempts.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildContext, type ContextInput } from "../../src/application/context.ts";

const input = (over: Partial<ContextInput>): ContextInput => ({
	role: "implement",
	objective: "o",
	language: "en",
	adopted: [],
	untrusted: [],
	feedback: null,
	tools: [],
	budget_bytes: 10_000,
	imposed_layers: [],
	...over,
});

const instruction = (over: Partial<ContextInput>) => buildContext(input(over)).manifest.trusted_instructions.join("\n");

describe("a frozen case that only the mutation control fails", () => {
	it("the producer is told to contest a case that passes the unit control and fails the initial run of the mutation control", () => {
		const told = instruction({ role: "implement" });

		assert.match(told, /passes[^.]*unit control[^.]*fails[^.]*initial run of the mutation control/, told);
		assert.match(told, /text of a source/, "it asserts the text of a source, not the behaviour");
	});

	it("the examiner answers test_correction for a case that reads the text of a source the mutation control rewrites", () => {
		const told = instruction({ role: "review", output_schema: "contestation-finding" });

		assert.match(told, /test_correction[^.]*reads the text of a source[^.]*mutation control[^.]*rewrites/, told);
	});
});
