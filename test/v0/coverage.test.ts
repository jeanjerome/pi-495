import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
	introducedByAddedFiles,
	introducedLines,
	introducedLinesOf,
	linesOfAddedFile,
	MAX_DIFFED_BYTES,
} from "../../src/application/coverage.ts";
import { candidateShape } from "../../src/domain/baseline.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { CandidateManifest, ManifestEntry } from "../../src/contracts/v1/candidate.ts";

function entry(
	path: string,
	baseline_state: ManifestEntry["baseline_state"],
	content: string,
	size = content.length,
): ManifestEntry {
	return {
		path,
		kind: "file",
		content_digest: digestValue(content),
		size,
		mode: "100644",
		symlink_target: null,
		baseline_state,
		origin: "agent",
		limits: null,
	};
}

function manifestOf(entries: ManifestEntry[]): CandidateManifest {
	return {
		candidate_id: "cand_1",
		workspace_id: "ws_1",
		base_reference_id: "ref_1",
		base_digest: digestValue("base"),
		selected_paths: entries.map((e) => e.path),
		exclusions: [],
		entries,
		metadata_policy: "content_and_mode",
		manifest_digest: digestValue(entries),
		frozen_at: "2026-09-17T10:00:00.000Z",
		limits: { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] },
	};
}

function source(texts: Record<string, string | Uint8Array>) {
	return async (path: string) => {
		const value = texts[path];
		if (value === undefined) return null;
		return typeof value === "string" ? new TextEncoder().encode(value) : value;
	};
}

describe("introduced lines of a candidate (QLT-04)", () => {
	it("names the lines the candidate wrote, not the lines it kept", () => {
		const before = "a\nb\nc\n";
		const after = "a\nB1\nB2\nc\n";
		assert.deepEqual(introducedLines(before, after), [2, 3]);
		assert.deepEqual(introducedLines(before, before), [], "an untouched file introduces nothing");
		assert.deepEqual(introducedLines("", "x\ny\n"), [1, 2], "an added file introduces every line");
		assert.deepEqual(introducedLines("a\nb\nc\n", "a\nc\n"), [], "a deletion introduces nothing");
		assert.deepEqual(linesOfAddedFile("x\ny\n"), [1, 2]);
		assert.deepEqual(introducedByAddedFiles({ "A.java": "x\ny\n", "B.java": "" }), { "A.java": [1, 2] });
	});

	it("a modification introduces its new lines and a pure rename introduces none (QLT-04: a move hides no debt and creates none)", async () => {
		const kept = "package p;\nclass Moved {}\n";
		const manifest = manifestOf([
			entry("src/main/java/Edited.java", "modified", "class Edited { int a() { return 1; } int b() { return 2; } }\n"),
			entry("src/main/java/old/Moved.java", "deleted", kept),
			entry("src/main/java/new/Moved.java", "added", kept),
			entry("src/main/java/Fresh.java", "added", "class Fresh {\n  int c() { return 3; }\n}\n"),
			entry("README.md", "unchanged", "# doc\n"),
		]);
		const shape = candidateShape(manifest);
		assert.deepEqual([...shape.renames], [["src/main/java/old/Moved.java", "src/main/java/new/Moved.java"]]);
		const result = await introducedLinesOf(
			manifest,
			shape.renames,
			source({
				"src/main/java/Edited.java": "class Edited { int a() { return 1; } }\n",
				"src/main/java/old/Moved.java": kept,
			}),
			source({
				"src/main/java/Edited.java": "class Edited { int a() { return 1; } int b() { return 2; } }\n",
				"src/main/java/new/Moved.java": kept,
				"src/main/java/Fresh.java": "class Fresh {\n  int c() { return 3; }\n}\n",
			}),
		);
		assert.deepEqual(result.lines, { "src/main/java/Edited.java": [1], "src/main/java/Fresh.java": [1, 2, 3] });
		assert.equal(result.notes.length, 0);
		assert.equal(
			"src/main/java/new/Moved.java" in result.lines,
			false,
			"the renamed file is diffed against its former name",
		);
	});

	it("reports what it could not diff instead of reading it as an empty change", async () => {
		const manifest = manifestOf([
			entry("src/main/java/Big.java", "modified", "x", MAX_DIFFED_BYTES + 1),
			entry("bin/data.bin", "added", "binary"),
			entry("src/main/java/Lost.java", "modified", "class Lost {}\n"),
		]);
		const result = await introducedLinesOf(
			manifest,
			new Map(),
			source({}),
			source({
				"src/main/java/Big.java": "x",
				"bin/data.bin": new Uint8Array([1, 0, 2]),
				"src/main/java/Lost.java": "class Lost {}\n",
			}),
		);
		assert.deepEqual(
			result.lines,
			{ "src/main/java/Lost.java": [1] },
			"a file whose reference text is gone is read as an addition",
		);
		assert.ok(result.notes.some((n) => n.includes("src/main/java/Big.java") && n.includes("diff limit")));
		assert.ok(result.notes.some((n) => n.includes("src/main/java/Lost.java") && n.includes("read as an addition")));
		assert.equal("bin/data.bin" in result.lines, false, "binary content carries no lines");
	});
});
