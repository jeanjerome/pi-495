import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { offeredWritableDirectories } from "../../src/domain/writable-proposal.ts";

describe("the directories of the copy offered from the paths a suite wrote", () => {
	it("offers the first level under the copy of each write in the copy, once, and nothing for a write outside it", () => {
		assert.deepEqual(
			offeredWritableDirectories(["test-output/run/a", "test-output/run/b", "coverage", "/Users/x/.cache/y"], []),
			["test-output/", "coverage/"],
		);
	});

	it("offers no directory the policy already gives the control, written with or without its trailing slash", () => {
		assert.deepEqual(
			offeredWritableDirectories(["test-output/a", "build/b", "coverage/c"], ["test-output/", "build"]),
			["coverage/"],
		);
	});

	it("offers nothing without a written path, nor for the root of the copy itself", () => {
		assert.deepEqual(offeredWritableDirectories([], []), []);
		assert.deepEqual(offeredWritableDirectories([".", ""], []), []);
	});

	it("never offers the parent of the copy, whatever path below it the write names", () => {
		assert.deepEqual(offeredWritableDirectories(["..", "../x", "../../y"], []), []);
	});
});
