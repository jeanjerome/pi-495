import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";
import { loadConfig } from "../../src/extension/config.ts";

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "egress-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function configured(policy: unknown): string {
	writeFileSync(join(root, "config.json"), JSON.stringify({ policy }));
	return root;
}

describe("declared egress to the model provider (SEC-05, D-11, D-46)", () => {
	it("declares by default only destinations that sit on the machine, so nothing leaves it unasked", () => {
		assert.ok(DEFAULT_POLICY.egress.length > 0, "an empty declaration would refuse every intervention");
		assert.deepEqual(
			DEFAULT_POLICY.egress.filter((d) => d.location === "off_machine"),
			[],
			"a destination off the machine is a decision, never a default",
		);
		assert.deepEqual(
			DEFAULT_POLICY.egress.map((d) => d.provider_id),
			["omlx"],
			"the one provider this machine has configured today",
		);
	});
});

describe("the declared egress a configuration carries (SEC-05)", () => {
	it("keeps the declaration when a configuration names the policy without naming it", () => {
		const { config } = loadConfig(configured({ budgets: { max_attempts: 5 } }));
		assert.deepEqual(
			config.policy.egress,
			DEFAULT_POLICY.egress,
			"an unrelated setting must not empty the declaration, which would refuse every intervention",
		);
		assert.equal(config.policy.budgets.max_attempts, 5, "the setting it did name still applies");
	});

	it("replaces the declaration entirely when a configuration names it", () => {
		const declared = [
			{ provider_id: "omlx", location: "on_machine" },
			{ provider_id: "anthropic", location: "off_machine" },
		];
		const { config } = loadConfig(configured({ egress: declared }));
		assert.deepEqual(config.policy.egress, declared, "a declaration is written whole, never merged entry by entry");
	});
});
