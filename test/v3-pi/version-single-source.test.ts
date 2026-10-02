import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { VERSION_495 } from "../../src/extension/session.ts";

describe("the version 495 announces", () => {
	it("given the version of package.json, then the extension announces that one", () => {
		const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
			version: string;
		};
		assert.equal(VERSION_495, manifest.version);
	});
});
