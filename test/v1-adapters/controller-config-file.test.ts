import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { ControllerConfigFile } from "../../src/extension/config.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

/**
 * A data directory whose `config.json` gives the control `unit` one directory, beside other settings, written on one
 * line: a file written back, even unchanged, would read otherwise.
 */
function dataDir(): { root: string; text: string } {
	const root = outputDir("controller-config-", cleanups);
	const text = JSON.stringify({
		policy: { policy_id: "owner", writable_paths: { unit: ["coverage/"] } },
		language: "en",
	});
	writeFileSync(join(root, "config.json"), text);
	return { root, text };
}

describe("the controller's configuration a grant of a writable directory writes", () => {
	it("adds each directory once beside those the control already has, keeps every other setting, and returns the policy read back", () => {
		const { root } = dataDir();
		const policy = new ControllerConfigFile(root, {}).grantWritable("unit", [
			"test-output/",
			"coverage/",
			"test-output/",
		]);
		assert.deepEqual(JSON.parse(readFileSync(join(root, "config.json"), "utf8")), {
			policy: { policy_id: "owner", writable_paths: { unit: ["coverage/", "test-output/"] } },
			language: "en",
		});
		assert.deepEqual(
			{ id: policy.policy_id, unit: policy.writable_paths.unit },
			{ id: "owner", unit: ["coverage/", "test-output/"] },
		);
	});

	it("leaves the file as it was when every directory is already given", () => {
		const { root, text } = dataDir();
		new ControllerConfigFile(root, {}).grantWritable("unit", ["coverage/"]);
		assert.equal(readFileSync(join(root, "config.json"), "utf8"), text);
	});

	it("refuses a file that cannot be read, naming the setting at fault, and leaves it as it was", () => {
		const root = outputDir("controller-config-", cleanups);
		const text = JSON.stringify({ policy: { writable_paths: { unit: ["coverage/"] } }, bogus: true });
		writeFileSync(join(root, "config.json"), text);
		assert.throws(
			() => new ControllerConfigFile(root, {}).grantWritable("unit", ["test-output/"]),
			(error: Error) => error.message.includes("config.json cannot be read") && error.message.includes("bogus"),
		);
		assert.equal(readFileSync(join(root, "config.json"), "utf8"), text);
	});

	it("writes a config.json that gives the control the directories when the data directory holds none", () => {
		const root = outputDir("controller-config-", cleanups);
		const policy = new ControllerConfigFile(root, {}).grantWritable("unit", ["test-output/"]);
		assert.deepEqual(JSON.parse(readFileSync(join(root, "config.json"), "utf8")), {
			policy: { writable_paths: { unit: ["test-output/"] } },
		});
		assert.deepEqual(policy.writable_paths.unit, ["test-output/"]);
	});
});
