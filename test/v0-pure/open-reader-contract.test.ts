import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { validate } from "../../src/contracts/validate.ts";
import { ControlDefinition } from "../../src/contracts/v1/protocol.ts";

const published = JSON.parse(
	readFileSync(new URL("../../contracts/v1/control-definition.json", import.meta.url), "utf8"),
) as { properties: { parser: Record<string, unknown> } };

const fictitious = {
	control_id: "fict-tests",
	version: "1",
	title: "fictitious test suite",
	command: ["fict", "test"],
	cwd: ".",
	env_allowlist: ["PATH"],
	env: {},
	timeout_ms: 1000,
	parser: "fict-lines",
	report_path: "fict-report.txt",
	structure_rules: [],
	provides: [],
	requires: [],
	scope_argument: null,
	network: "denied",
	writable_paths: ["fict-report.txt"],
	requirement_refs: [{ requirement_id: "R1", revision: 1 }],
	protected: true,
	protected_paths: ["tests/"],
};

describe("the contract of a control accepts a reader it does not know", () => {
	it("given the published control-definition contract, then its parser is a non-empty string with no enum, and a definition whose parser is fict-lines is valid", () => {
		const parser = published.properties.parser;
		assert.equal(parser.enum, undefined);
		assert.equal(parser.type, "string");
		assert.equal(parser.minLength, 1);
		assert.deepEqual(validate(ControlDefinition, fictitious), fictitious);
	});
});
