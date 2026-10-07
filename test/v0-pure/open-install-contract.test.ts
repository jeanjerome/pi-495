import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { validate } from "../../src/contracts/validate.ts";
import { PackageInstall } from "../../src/contracts/v1/protocol.ts";

interface Published {
	properties: {
		capability_diagnosis: {
			properties: {
				recommendations: { items: { properties: { install: { properties: { manager: Record<string, unknown> } } } } };
			};
		};
	};
}

const published = JSON.parse(
	readFileSync(new URL("../../contracts/v1/protocol.json", import.meta.url), "utf8"),
) as Published;

describe("the contract of an install accepts a package manager it does not know", () => {
	it("given the published protocol contract, then the manager of an install is a non-empty string with no enum, and an install by fictpm is valid as one by npm or maven is", () => {
		const manager =
			published.properties.capability_diagnosis.properties.recommendations.items.properties.install.properties.manager;
		assert.equal(manager.enum, undefined);
		assert.equal(manager.type, "string");
		assert.equal(manager.minLength, 1);
		for (const name of ["fictpm", "npm", "maven"]) {
			const install = { package: "fict-style", version: "1.0.0", manager: name };
			assert.deepEqual(validate(PackageInstall, install), install);
		}
	});
});
