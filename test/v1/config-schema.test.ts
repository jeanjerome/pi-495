import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CONTRACTS } from "../../src/contracts/registry.ts";
import { HarnessConfigFile } from "../../src/contracts/v1/config.ts";
import { check } from "../../src/contracts/validate.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import { loadConfig } from "../../src/extension/config.ts";

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

describe("the reading of config.json against its contract (SEC-05)", () => {
	let root: string;
	beforeEach(() => {
		mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
		root = mkdtempSync(join(process.cwd(), "test-output", "config-schema-"));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	const written = (file: unknown): string => {
		writeFileSync(join(root, "config.json"), JSON.stringify(file));
		return root;
	};
	/** The refusal of a file the contract does not accept: it stops every change, as an unreadable one does. */
	const refusal = (file: unknown): string => {
		try {
			loadConfig(written(file), {});
		} catch (error) {
			assert.ok(error instanceof DomainError, String(error));
			assert.equal(error.code, "CONFIGURATION_ERROR");
			assert.match(error.message, /^config\.json cannot be read: /);
			assert.match(error.message, /no change runs until it is fixed or removed/);
			return error.message;
		}
		assert.fail(`${JSON.stringify(file)} was loaded`);
	};

	it("loads a file that holds every key as the reader loaded it before, and announces nothing (6f)", () => {
		const { config, diagnostics } = loadConfig(
			written({
				$schema: "https://example.invalid/harness-config.json",
				policy: {
					policy_id: "owner",
					revision: 4,
					budgets: { max_attempts: 5, feedback_bytes: 0 },
					adoption: { design: "human", protocol: "kernel" },
					g5_human_acceptance: true,
					integration_enabled: true,
					stagnation_identical_candidates: 0,
					required_reviews: ["security"],
				},
				isolation: { allow_unconfined: true },
				human_origin: { rpc_actor_env: "OWNER_ACTOR" },
				workspace_exclusions: ["out/"],
				language: "en",
			}),
			{},
		);
		assert.deepEqual(diagnostics, []);
		assert.deepEqual(config, {
			policy: {
				...DEFAULT_POLICY,
				policy_id: "owner",
				revision: 4,
				budgets: { ...DEFAULT_POLICY.budgets, max_attempts: 5, feedback_bytes: 0 },
				adoption: { ...DEFAULT_POLICY.adoption, design: "human" },
				g5_human_acceptance: true,
				integration_enabled: true,
				stagnation_identical_candidates: 0,
				required_reviews: ["security"],
			},
			isolation: { allow_unconfined: true },
			human_origin: { rpc_actor_env: "OWNER_ACTOR" },
			workspace_exclusions: ["out/"],
			language: "en",
		});
	});

	it("merges a baseline written in part over the default comparison, which stays on (6e)", () => {
		const { config } = loadConfig(written({ policy: { baseline: { tolerance: "block_any" } } }), {});
		assert.deepEqual(config.policy.baseline, { ...DEFAULT_POLICY.baseline, tolerance: "block_any" });
	});

	it("refuses an unknown key at any level, naming where it lies (6b)", () => {
		assert.match(refusal({ policy: { adoptoin: { design: "human" } } }), /: policy\.adoptoin is not a known setting;/);
		assert.match(refusal({ polcy: {} }), /: polcy is not a known setting;/);
		assert.match(
			refusal({ policy: { baseline: { strict: true } } }),
			/: policy\.baseline\.strict is not a known setting;/,
		);
	});

	it("names an unknown key only when it is a short identifier, and its section otherwise", () => {
		for (const key of ["two words", "é", "k".repeat(41), "a.b", ""]) {
			const said = refusal({ policy: { [key]: true } });
			assert.match(said, /: policy holds a key that is not a known setting;/, JSON.stringify(key));
			if (key) assert.equal(said.includes(key), false, `${JSON.stringify(key)} is echoed: ${said}`);
		}
		assert.match(refusal({ "not a key": 1 }), /: the file holds a key that is not a known setting;/);
		assert.match(refusal({ policy: { ["k".repeat(40)]: 1 } }), new RegExp(`: policy\\.${"k".repeat(40)} is not`));
	});

	it("refuses a value of the wrong type or outside those permitted, naming what is expected (6c, 6d)", () => {
		const expected: [unknown, string][] = [
			[{ policy: { adoption: { design: "Human" } } }, "policy.adoption.design must be kernel or human"],
			[{ policy: { adoption: { protocol: "human" } } }, "policy.adoption.protocol must be kernel"],
			[{ policy: { integration_enabled: "false" } }, "policy.integration_enabled must be a boolean"],
			[{ isolation: { allow_unconfined: "no" } }, "isolation.allow_unconfined must be a boolean"],
			[{ policy: { baseline: "x" } }, "policy.baseline must be an object"],
			[{ policy: { budgets: { max_attempts: 0 } } }, "policy.budgets.max_attempts must be at least 1"],
			[{ policy: { budgets: { max_attempts: 2.5 } } }, "policy.budgets.max_attempts must be a whole number"],
			[{ policy: { required_reviews: "security" } }, "policy.required_reviews must be a list"],
			[{ human_origin: { rpc_actor_env: "" } }, "human_origin.rpc_actor_env must be at least 1 character long"],
			[{ language: "de" }, "language must be fr or en"],
			[[], "the file must be an object"],
		];
		for (const [file, said] of expected) assert.ok(refusal(file).includes(`: ${said};`), `${said}: ${refusal(file)}`);
		assert.equal(refusal({ policy: { adoption: { design: "Human" } } }).includes("Human"), false);
	});

	it("names the first three deviations and counts the others", () => {
		const unknown = (count: number): Record<string, number> =>
			Object.fromEntries(Array.from({ length: count }, (_, i) => [`unknown_${i}`, i]));
		const three = refusal(unknown(3));
		assert.match(three, /: unknown_0 is not a known setting; unknown_1 is not a known setting; unknown_2 is not/);
		assert.doesNotMatch(three, /more/);
		const four = refusal(unknown(4));
		assert.match(four, /unknown_2 is not a known setting; and 1 more; no change runs/);
		assert.equal(four.includes("unknown_3"), false);
		// The validator stops at eight deviations, so a count it cut short is a lower bound, said as one.
		assert.match(refusal(unknown(6)), /; and 3 more; no change runs/);
		assert.match(refusal(unknown(9)), /; and at least 5 more; no change runs/);
	});

	it("reproduces no value the file holds, whatever the form of the deviation", () => {
		const marker = "q8v2x7";
		const deviations: unknown[] = [
			{ policy: { adoptoin: marker } },
			{ [`${marker} key`]: 1 },
			{ policy: { [`${marker}${"k".repeat(40)}`]: 1 } },
			{ polcy: { [marker]: marker } },
			{ policy: { adoption: { design: marker } } },
			{ policy: { integration_enabled: marker } },
			{ policy: { baseline: marker } },
			{ policy: { budgets: { max_attempts: marker } } },
			{ policy: { policy_id: marker.repeat(40) } },
			{ policy: { required_reviews: [marker, 7] } },
			{ workspace_exclusions: marker },
			{ language: marker },
			[marker],
		];
		for (const file of deviations) {
			const said = refusal(file);
			assert.equal(said.includes(marker), false, `${JSON.stringify(file)} is echoed: ${said}`);
			assert.equal(said.includes(root), false, `the path reaches the model's context: ${said}`);
		}
	});
});
