/**
 * What a provider writes above the instructions 495 composes, declared as a pure fact of the
 * domain (CTX-02, D-48). No provider is asked and no package is read here: the declaration is the
 * expectation, a lookup against what this harness once verified, and what a request actually showed
 * is held against it by `test/v2/imposed-layers-divergence.test.ts`.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildContext } from "../../src/application/context.ts";
import { imposedLayersFor } from "../../src/domain/imposed-layers.ts";

describe("imposed layers (CTX-02, D-48)", () => {
	it("declares the layer a known provider imposes, verbatim and above local instructions", () => {
		const layers = imposedLayersFor("anthropic");
		assert.equal(layers.length, 1);
		assert.equal(layers[0]!.provider_id, "anthropic");
		assert.equal(layers[0]!.position, "above_local_instructions");
		assert.equal(layers[0]!.text, "You are Claude Code, Anthropic's official CLI for Claude.");
		assert.equal(layers[0]!.condition, "the OAuth subscription path is used (an access token prefixed sk-ant-oat)");
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

	// An object literal inherits Object.prototype: a plain index lookup would resolve one of these
	// to an inherited member instead of to nothing, and provider_id is owner-configured, not a
	// constant, so the identifier reaching this lookup is not one this harness chose.
	it("declares nothing for a provider identifier that names an inherited object member", () => {
		for (const name of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"])
			assert.deepEqual(imposedLayersFor(name), [], `${name} must not resolve to an inherited member`);
	});
});

describe("the manifest names imposed layers, never merged into trusted instructions", () => {
	const base = {
		role: "implement" as const,
		objective: "do the thing",
		language: "en" as const,
		adopted: [],
		untrusted: [],
		feedback: null,
		tools: [],
		budget_bytes: 10_000,
		imposed_layers: [],
	};

	it("carries an empty list when the context is built with none (field always present)", () => {
		const { manifest } = buildContext(base);
		assert.deepEqual(manifest.imposed_layers, []);
	});

	it("carries the layers given, distinct from trusted_instructions and absent from the record", () => {
		const layers = imposedLayersFor("anthropic");
		const { manifest, system_prompt, prompt } = buildContext({ ...base, imposed_layers: layers });
		assert.deepEqual(manifest.imposed_layers, layers);
		assert.ok(
			!manifest.trusted_instructions.some((i) => i.includes(layers[0]!.text)),
			"the imposed layer must not be folded into the instructions 495 composes",
		);
		assert.ok(!system_prompt.includes(layers[0]!.text), "495 does not emit a layer it does not compose");
		assert.ok(!prompt.includes(layers[0]!.text));
	});
});
