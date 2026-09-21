import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_POLICY } from "../../src/domain/policy.ts";

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
