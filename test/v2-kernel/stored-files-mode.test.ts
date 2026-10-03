/**
 * Files written into a tree from the object store keep the mode they were recorded with: an executable
 * an install left stays executable, nothing else becomes so, and a file recorded without a mode gets the
 * default one.
 */
import { strict as assert } from "node:assert";
import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { writeStoredFiles } from "../../src/application/artifacts.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const executable = (path: string): boolean => (statSync(path).mode & 0o111) !== 0;

describe("writing stored files into a tree", () => {
	it("given a file recorded with mode 100755, one with 100644 and one with no mode, then the first is written executable and the other two are not", async () => {
		const root = tempDir("495-stored-files-mode-", cleanups);
		const objects = new CasObjectStore(join(root, "objects"));
		const { digest } = await objects.put(new TextEncoder().encode("#!/bin/sh\n"), "application/octet-stream");
		const tree = join(root, "tree");
		await writeStoredFiles(
			objects,
			[
				{ path: "bin/tool", digest, mode: "100755" },
				{ path: "lib/plain", digest, mode: "100644" },
				{ path: "lib/unrecorded", digest },
			],
			tree,
		);
		assert.ok(executable(join(tree, "bin/tool")), "the file recorded executable is written executable");
		assert.equal(statSync(join(tree, "bin/tool")).mode & 0o777, 0o755);
		assert.equal(statSync(join(tree, "lib/plain")).mode & 0o777, 0o644);
		assert.ok(!executable(join(tree, "lib/unrecorded")), "a file recorded without a mode does not become executable");
	});
});
