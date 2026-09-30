/**
 * The edit of a recommended complement applied to the file of the target: the text obtained differs
 * from the original by the value the edit replaces and by nothing else, or nothing is applied.
 */
import { strict as assert } from "node:assert";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { applyRecommendedEdits, applyScriptsTestEdit, editedFile } from "../../src/application/complement.ts";
import { digestBytes } from "../../src/contracts/digest.ts";
import type { FileEdit, RecommendedComplement } from "../../src/contracts/v1/protocol.ts";
import { tempDir, writeFiles } from "../helpers/fixtures.ts";

const EDIT: FileEdit = {
	path: "package.json",
	current: "node --test",
	wanted: "node --test --experimental-test-coverage",
};

/** The bytes of `before` and `after` that lie between their common prefix and their common suffix. */
function changedSpan(before: string, after: string): { removed: string; added: string } {
	let prefix = 0;
	while (prefix < before.length && before[prefix] === after[prefix]) prefix++;
	let suffix = 0;
	while (
		suffix < before.length - prefix &&
		suffix < after.length - prefix &&
		before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
	)
		suffix++;
	return { removed: before.slice(prefix, before.length - suffix), added: after.slice(prefix, after.length - suffix) };
}

describe("applying the edit of scripts.test to a package.json", () => {
	const original = `{
  "name": "target",
  "version": "1.0.0",
  "description": "a \\"quoted\\" word, a \\u00e9 and a tab\\t",
  "scripts": {
    "build": "tsc",
    "test": "node --test",
    "lint": "biome check"
  },
  "devDependencies": {
    "test": "node --test"
  },
  "files": ["dist"]
}
`;

	it("given a package.json of two-space indentation with keys before and after scripts, then the result differs from the original by the bytes of the scripts.test value only", () => {
		const result = applyScriptsTestEdit(original, EDIT);
		assert.ok(result !== null, "the edit applies");
		assert.deepEqual(changedSpan(original, result), { removed: "", added: " --experimental-test-coverage" });
		assert.equal(result.length, original.length + " --experimental-test-coverage".length);
		assert.equal(JSON.parse(result).scripts.test, EDIT.wanted);
		assert.equal(JSON.parse(result).devDependencies.test, "node --test", "another key named test is left alone");
	});

	it("given a current value the edit does not describe, then nothing is applied", () => {
		assert.equal(applyScriptsTestEdit(original, { ...EDIT, current: "node --test test/" }), null);
		assert.equal(applyScriptsTestEdit(original.replace('"test": "node --test",', '"test": 1,'), EDIT), null);
		assert.equal(applyScriptsTestEdit(original.replace(/"scripts": \{[^}]*\},/, ""), EDIT), null, "no scripts");
		assert.equal(applyScriptsTestEdit("{ not json", EDIT), null);
	});

	it("given scripts.test appearing twice, then nothing is applied", () => {
		const twice = original.replace('"lint": "biome check"', '"test": "node --test"');
		assert.equal(applyScriptsTestEdit(twice, EDIT), null);
		const scriptsTwice = original.replace('"files"', '"scripts": {"test": "node --test"}, "files"');
		assert.equal(applyScriptsTestEdit(scriptsTwice, EDIT), null);
	});
});

describe("applying the edits of the recommended complements to a copy of the target", () => {
	const cleanups: string[] = [];
	afterEach(() => {
		for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
	});
	const packageJson = '{\n  "scripts": {\n    "test": "node --test"\n  }\n}\n';
	const recommendation: RecommendedComplement = {
		test_type: "coverage",
		tool: "node --experimental-test-coverage",
		version: "24.21.0",
		established_on: "2026-09-30",
		source: "nodejs.org/docs/latest-v24.x/api/test.html#collecting-code-coverage",
		change: "in package.json, add --experimental-test-coverage to scripts.test",
		edit: EDIT,
	};
	const copy = (files: Record<string, string>): string => {
		const dir = tempDir("495-complement-");
		cleanups.push(dir);
		writeFiles(dir, files);
		return dir;
	};

	it("given a recommendation whose edit applies, then the file is written and its digest returned, and given one whose edit does not apply or that carries none, then nothing is written", () => {
		const dir = copy({ "package.json": packageJson });
		const applied = applyRecommendedEdits(dir, [
			{
				test_type: "coverage",
				tool: "without an edit",
				version: "1",
				established_on: "2026-09-30",
				source: "s",
				change: "c",
			},
			{ ...recommendation, tool: "another value", edit: { ...EDIT, current: "node --test test/" } },
			recommendation,
		]);
		const written = readFileSync(join(dir, "package.json"), "utf8");
		assert.equal(JSON.parse(written).scripts.test, EDIT.wanted);
		assert.deepEqual(applied, [
			{
				path: "package.json",
				digest: digestBytes(written),
				test_type: "coverage",
				tool: "node --experimental-test-coverage",
			},
		]);
	});

	it("given a copy without the file the edit names, then the edit does not apply and the copy is left as it is", () => {
		const dir = copy({ "other.json": "{}" });
		assert.equal(editedFile(dir, EDIT), null);
		assert.deepEqual(applyRecommendedEdits(dir, [recommendation]), []);
	});
});
