/**
 * The bound the owner puts on the detected suite is appended to its command; only the technology knows whether that
 * command reads the patterns as the files it runs, which a preparation's test file must match to be retained.
 */
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { describe, it } from "node:test";
import { outputDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import { STACKS_OF_495 } from "../helpers/technologies.ts";

const cleanups = removedAfterEach();

const BOUND = ["./test/*.test.js", "test/unit/**/*.test.js"];

function detectionOf(scriptsTest: string) {
	const target = join(outputDir("suite-file-patterns-", cleanups), "target");
	writeFiles(target, {
		"package.json": JSON.stringify({ name: "t", type: "module", scripts: { test: scriptsTest } }),
		"node_modules/vitest/package.json": '{"name":"vitest","version":"3.2.4"}',
	});
	return STACKS_OF_495.recognise(target, [], process.execPath, [], undefined, BOUND);
}

describe("the files a bounded suite runs", () => {
	it("sous node --test, la borne se lit comme les fichiers que la suite lance, sans ./ en tête ; sous vitest, qui lit ses arguments comme des filtres, elle ne nomme aucun fichier", () => {
		assert.deepEqual(detectionOf("node --test").suite_file_patterns, ["test/*.test.js", "test/unit/**/*.test.js"]);
		assert.deepEqual(detectionOf("vitest run").suite_file_patterns, []);
	});
});
