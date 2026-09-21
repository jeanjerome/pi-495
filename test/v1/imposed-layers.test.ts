/**
 * What a provider writes above the instructions 495 composes, declared as a pure fact of the
 * domain (CTX-02, D-48, e23s02 task 1). No provider is asked and no package is read here: the
 * declaration is a lookup against what this harness has verified, checked separately by
 * `test/v3/provider-system-block.test.ts`.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { imposedLayersFor } from "../../src/domain/imposed-layers.ts";

describe("imposed layers (CTX-02, D-48)", () => {
	it("declares the layer a known provider imposes, verbatim and above local instructions", () => {
		const layers = imposedLayersFor("anthropic");
		assert.equal(layers.length, 1);
		assert.equal(layers[0]!.provider_id, "anthropic");
		assert.equal(layers[0]!.position, "above_local_instructions");
		assert.equal(layers[0]!.text, "You are Claude Code, Anthropic's official CLI for Claude.");
		assert.match(layers[0]!.condition, /subscription/);
	});

	it("declares nothing for a provider known to impose nothing (6a)", () => {
		assert.deepEqual(imposedLayersFor("omlx"), []);
	});

	it("declares nothing for a provider this harness has never verified (6c)", () => {
		assert.deepEqual(imposedLayersFor("some-future-provider"), []);
	});

	it("declares nothing for an empty identifier (6b)", () => {
		assert.deepEqual(imposedLayersFor(""), []);
	});
});
