import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import fc from "fast-check";
import { diffLines, hunks, intraline, myers, splitLines, similarity } from "../../src/application/diff.ts";
import { buildSnapshot, flatten, neutralize } from "../../src/application/review.ts";
import type { ManifestEntry, ReferenceSnapshot, CandidateManifest } from "../../src/contracts/v1/candidate.ts";
import { digestValue } from "../../src/contracts/digest.ts";

function entry(path: string, state: ManifestEntry["baseline_state"], over: Partial<ManifestEntry> = {}): ManifestEntry {
	return {
		path,
		kind: "file",
		content_digest: digestValue(path + state),
		size: 1,
		mode: "000644",
		symlink_target: null,
		baseline_state: state,
		origin: "unknown",
		limits: null,
		...over,
	};
}
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

describe("line diff (UX-07, SA-023)", () => {
	it("keeps source lines exact, including literal + and - operators, and types segments", () => {
		const oldText = "a\n  x = a + b;\n  y = c - d;\nend\n";
		const newText = "a\n  x = a + b;\n  y = c - d + 1;\nend\n";
		const segs = diffLines(oldText, newText);
		assert.deepEqual(
			segs.map((s) => s.kind),
			["unchanged", "old", "new", "unchanged"],
		);
		assert.deepEqual((segs[1] as { lines: string[] }).lines, ["  y = c - d;"]);
		assert.deepEqual((segs[2] as { lines: string[] }).lines, ["  y = c - d + 1;"]);
		const h = hunks(segs, 1);
		assert.equal(h.length, 1);
		assert.equal(h[0]!.old_start, 2);
		assert.deepEqual(intraline("  y = c - d;", "  y = c - d + 1;"), { old: [11, 11], new: [11, 15] });
		assert.equal(intraline("abc", "xyz"), null);
	});
	it("edit script reconstructs the new text for random inputs", () => {
		fc.assert(
			fc.property(
				fc.array(fc.constantFrom("a", "b", "c", "d"), { maxLength: 30 }),
				fc.array(fc.constantFrom("a", "b", "c", "d"), { maxLength: 30 }),
				(a, b) => {
					const ops = myers(a, b);
					const rebuilt = ops.filter((o) => o.type !== "del").map((o) => (o.type === "eq" ? a[o.a] : b[o.b]));
					assert.deepEqual(rebuilt, b);
					const old = ops.filter((o) => o.type !== "ins").map((o) => a[o.a]);
					assert.deepEqual(old, a);
				},
			),
		);
		assert.deepEqual(splitLines("x\ny\n"), ["x", "y"]);
		assert.equal(similarity("a\nb\nc\n", "a\nb\nd\n") > 0.6, true);
	});
});

describe("review snapshot (SA-022, RM-058 to RM-061, SA-026, SA-028)", () => {
	const reference: ReferenceSnapshot = {
		reference_id: "ref_1",
		kind: "git_clean_head",
		project_path: "/p",
		head_commit: "a".repeat(40),
		branch: "main",
		tree_digest: digestValue("t"),
		entries: [
			entry("README.md", "unchanged"),
			entry("src/a.js", "unchanged"),
			entry("src/b.js", "unchanged"),
			entry("src/old.js", "unchanged", { content_digest: digestValue("same") }),
			entry("bin/x.bin", "unchanged"),
		],
		exclusions: [],
		captured_at: "t",
		limits: { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] },
	};
	const manifest: CandidateManifest = {
		candidate_id: "cand_1",
		workspace_id: "ws",
		base_reference_id: "ref_1",
		base_digest: reference.tree_digest,
		selected_paths: [],
		exclusions: [],
		entries: [
			entry("README.md", "unchanged"),
			entry("src/a.js", "modified"),
			entry("src/b.js", "deleted"),
			entry("src/c.js", "added"),
			entry("src/old.js", "deleted", { content_digest: digestValue("same") }),
			entry("src/new.js", "added", { content_digest: digestValue("same") }),
			entry("bin/x.bin", "unchanged"),
			entry("link", "added", { kind: "symlink", symlink_target: "../etc" }),
			entry(`hostile${ESC}[31m.txt`, "added"),
		],
		metadata_policy: "content_and_mode",
		manifest_digest: digestValue("m"),
		frozen_at: "t",
		limits: { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] },
	};
	it("builds the union of paths with textual statuses, keeps deleted files at their old place and detects a certain rename by digest", () => {
		const snap = buildSnapshot({
			change_id: "chg",
			reference,
			manifest,
			findings: [],
			newer_candidate: null,
			now: "t",
		});
		const all = flatten(snap.root, false).map((x) => `${x.node.path}:${x.node.status}`);
		assert.ok(all.includes("src/b.js:deleted"));
		assert.ok(all.includes("src/c.js:added"));
		assert.ok(all.includes("src/a.js:modified"));
		assert.ok(all.includes("README.md:intact"));
		assert.ok(all.includes("src/new.js:renamed"));
		assert.ok(
			!all.some((x) => x.startsWith("src/old.js")),
			"the renamed source is presented once, at its new path with the old path attached",
		);
		assert.equal(flatten(snap.root, false).find((x) => x.node.path === "src/new.js")?.node.old_path, "src/old.js");
		assert.equal(snap.counts.renamed, 1);
		assert.equal(snap.counts.intact, 2);
		const changedOnly = flatten(snap.root, true).map((x) => x.node.path);
		assert.ok(!changedOnly.includes("README.md"));
		assert.ok(changedOnly.includes("src"));
		assert.equal(snap.fresh, true);
		const srcDir = snap.root.children.find((c) => c.name === "src")!;
		assert.equal(srcDir.status, "modified");
		assert.deepEqual(srcDir.aggregate, { modified: 1, deleted: 1, added: 1, renamed: 1 });
	});
	it("signals a newer candidate without replacing the snapshot and neutralizes hostile names for display only", () => {
		const snap = buildSnapshot({
			change_id: "chg",
			reference,
			manifest,
			findings: [],
			newer_candidate: "cand_2",
			now: "t",
		});
		assert.equal(snap.fresh, false);
		assert.equal(snap.newer_candidate, "cand_2");
		assert.equal(snap.candidate?.candidate_id, "cand_1");
		const hostile = flatten(snap.root, false).find((x) => x.node.path.includes(ESC))!;
		assert.ok(hostile.node.path.includes(ESC), "stored path keeps its bytes");
		assert.equal(neutralize(hostile.node.name).includes(ESC), false);
		assert.equal(neutralize(`a${ESC}[31mb`), "a␛[31mb");
		assert.equal(neutralize(`x${BEL}y`), "x^Gy");
	});
});
