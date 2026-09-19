import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Value } from "typebox/value";
import { OUTPUT_SCHEMAS, extractJsonOutput, normalizeOutput, retainedRefusedText } from "../../src/contracts/v1/reports.ts";

describe("structured output extraction (AGT-06)", () => {
	it("skips earlier code blocks of other languages and takes the last json block", () => {
		const text = "Analyse.\n```js\nexport function shout(n) { return n; }\n```\nCritères.\n```json\n{\"objective\":\"x\",\"facts\":[],\"assumptions\":[],\"questions\":[],\"answers\":[],\"out_of_scope\":[],\"risks\":[],\"requirements\":[],\"design\":{\"summary\":\"s\",\"components\":[],\"interfaces\":[],\"risks\":[]}}\n```\n";
		const out = extractJsonOutput(text);
		assert.ok(out && typeof out === "object");
		assert.equal(Value.Check(OUTPUT_SCHEMAS["specification-report"], out), true);
	});
	it("normalizes a report with missing arrays and unknown keys without inventing content", () => {
		const raw = { summary: "done", changed_paths: ["a"], extra: "ignored" };
		const norm = normalizeOutput(OUTPUT_SCHEMAS["producer-report"], raw) as Record<string, unknown>;
		assert.deepEqual(norm, { summary: "done", changed_paths: ["a"], tests_claimed: false, notes: [] });
		assert.equal(Value.Check(OUTPUT_SCHEMAS["producer-report"], norm), true);
		const spec = normalizeOutput(OUTPUT_SCHEMAS["specification-report"], { objective: "o", requirements: [{ requirement_id: "R1", statement: "s", mandatory: true, criterion: "c", category: "f", note: "x" }], design: { summary: "d" } });
		assert.equal(Value.Check(OUTPUT_SCHEMAS["specification-report"], spec), true);
		assert.equal(Value.Check(OUTPUT_SCHEMAS["specification-report"], normalizeOutput(OUTPUT_SCHEMAS["specification-report"], { facts: [] })), false, "a missing objective stays invalid");
	});

	// A report refused on its schema was diagnosed from its head alone, where the nine keys were
	// present and well formed; what ends the object is at the other end of the text.
	it("keeps both ends of a refused output, and says where the cut is", () => {
		const text = `HEAD${"x".repeat(50_000)}TAIL`;
		const kept = retainedRefusedText(text, 20_000, 8_000);
		assert.ok(kept.startsWith("HEAD"), "the head identifies the report");
		assert.ok(kept.endsWith("TAIL"), "the tail is where a schema refusal is explained");
		assert.ok(kept.includes(`${text.length - 20_000} characters elided`), kept.slice(7_900, 8_200));
		assert.equal(kept.split("elided by the harness").length - 1, 1, "the cut is named once");
		assert.equal(retainedRefusedText("short", 20_000), "short", "a text that fits is kept whole");
	});
});
