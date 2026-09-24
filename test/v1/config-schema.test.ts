import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CONTRACTS } from "../../src/contracts/registry.ts";
import { HarnessConfigFile } from "../../src/contracts/v1/config.ts";
import { check } from "../../src/contracts/validate.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";

const accepted = (file: unknown): boolean => check(HarnessConfigFile, file);

/** Every key the reader accepts, at a permitted value: the defaults, written out as a file would. */
const EVERY_KEY = {
	$schema: "https://example.invalid/harness-config.json",
	policy: structuredClone(DEFAULT_POLICY),
	isolation: { allow_unconfined: false },
	human_origin: { rpc_actor_env: "HARNESS495_RPC_HUMAN_ACTOR" },
	workspace_exclusions: ["target/", "dist/"],
	language: "en",
};

describe("the contract of config.json (SEC-05)", () => {
	it("accepts every key the reader accepts, at a permitted value", () => {
		assert.equal(
			accepted(EVERY_KEY),
			true,
			"a setting of the default policy the schema does not name would be refused",
		);
	});

	it("accepts an empty file, and any section written in part", () => {
		assert.equal(accepted({}), true, "every key is optional; an absent one takes its default");
		assert.equal(accepted({ policy: { budgets: { max_attempts: 5 } } }), true);
		assert.equal(
			accepted({ policy: { baseline: { tolerance: "block_any" } } }),
			true,
			"baseline is merged on its default",
		);
		assert.equal(accepted({ policy: { adoption: { design: "human" } } }), true);
	});

	it("refuses an unknown key at every level", () => {
		const unknownAt: Record<string, unknown> = {
			"the file": { polcy: {} },
			policy: { policy: { adoptoin: {} } },
			"policy.egress": { policy: { egress: [] } },
			"policy.budgets": { policy: { budgets: { max_attempt: 2 } } },
			"policy.adoption": { policy: { adoption: { specification: "human" } } },
			"policy.baseline": { policy: { baseline: { strict: true } } },
			isolation: { isolation: { allow_confined: true } },
			human_origin: { human_origin: { actor: "me" } },
		};
		for (const [level, file] of Object.entries(unknownAt))
			assert.equal(accepted(file), false, `an unknown key under ${level} must be refused`);
	});

	it("refuses the four values of the wrong type the defect registry records", () => {
		assert.equal(
			accepted({ policy: { adoption: { design: "Human" } } }),
			false,
			"only kernel or human decide a design",
		);
		assert.equal(accepted({ policy: { integration_enabled: "false" } }), false, "a non-empty string is truthy");
		assert.equal(accepted({ isolation: { allow_unconfined: "no" } }), false);
		assert.equal(accepted({ policy: { baseline: "x" } }), false);
	});

	it("keeps the adoption of the protocol with the kernel", () => {
		assert.equal(accepted({ policy: { adoption: { protocol: "kernel" } } }), true);
		assert.equal(
			accepted({ policy: { adoption: { protocol: "human" } } }),
			false,
			"the kernel always adopts the protocol",
		);
	});

	it("refuses a value outside those permitted", () => {
		assert.equal(accepted({ language: "de" }), false);
		assert.equal(accepted({ policy: { revision: 0 } }), false);
		assert.equal(accepted({ policy: { required_reviews: "security" } }), false);
		assert.equal(accepted({ workspace_exclusions: "dist/" }), false);
		assert.equal(accepted({ human_origin: { rpc_actor_env: "" } }), false, "an empty name identifies no one");
	});

	it("bounds each budget at its minimum, and only to whole numbers", () => {
		for (const bound of ["max_attempts", "intervention_ms", "increment_ms", "tool_calls_per_intervention"]) {
			assert.equal(accepted({ policy: { budgets: { [bound]: 1 } } }), true, `${bound} at 1`);
			assert.equal(accepted({ policy: { budgets: { [bound]: 0 } } }), false, `${bound} at 0 would allow nothing`);
		}
		for (const bound of ["max_technical_retries", "max_continuations", "feedback_bytes"]) {
			assert.equal(accepted({ policy: { budgets: { [bound]: 0 } } }), true, `${bound} at 0`);
			assert.equal(accepted({ policy: { budgets: { [bound]: -1 } } }), false, `${bound} below 0`);
		}
		assert.equal(accepted({ policy: { budgets: { max_attempts: 2.5 } } }), false);
		assert.equal(
			accepted({ policy: { stagnation_identical_candidates: 0 } }),
			true,
			"0 turns stagnation detection off",
		);
		assert.equal(accepted({ policy: { stagnation_identical_candidates: -1 } }), false);
	});

	it("is published with the other contracts, as JSON Schema 2020-12", () => {
		assert.equal(CONTRACTS["harness-config"], HarnessConfigFile);
		const published = JSON.parse(readFileSync(join(process.cwd(), "contracts", "v1", "harness-config.json"), "utf8"));
		assert.equal(published.$schema, "https://json-schema.org/draft/2020-12/schema");
		assert.equal(published.additionalProperties, false);
	});
});
