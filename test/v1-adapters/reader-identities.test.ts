import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { READERS_OF_495 } from "../helpers/technologies.ts";

/**
 * The identifier and the version of every reader 495 brings, as a dossier written before records them in
 * the `control_version` of its evidence: a change to either and that dossier no longer verifies the same.
 */
const RECORDED = {
	"exit-code": "1.0.0",
	"node-test": "1.0.0",
	"junit-xml": "1.0.0",
	"jest-json": "1.0.0",
	lcov: "1.0.0",
	"jacoco-xml": "1.0.0",
	"java-imports": "1.0.0",
	"pitest-xml": "1.0.0",
	"stryker-json": "1.0.0",
	"pmd-xml": "1.0.0",
	"cpd-xml": "1.0.0",
	"eslint-json": "1.0.0",
	"jscpd-json": "1.0.0",
};

describe("the readers of Maven, Node and the common formats", () => {
	it("keep the identifiers and the versions a dossier written before records", () => {
		assert.deepEqual(Object.fromEntries(READERS_OF_495.map((reader) => [reader.id, reader.version])), RECORDED);
		assert.equal(READERS_OF_495.length, Object.keys(RECORDED).length, "no identifier is brought twice");
	});
});
