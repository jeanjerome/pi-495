import { buildSnapshot, type ChangePage, type ContentPage, type ReviewSnapshot } from "../../src/application/review.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import type { CandidateManifest, ManifestEntry, ReferenceSnapshot } from "../../src/contracts/v1/candidate.ts";
import { entry } from "./review-entry.ts";

const noLimits = { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] };

/** A change whose candidate holds `entries`, with the reference and the frozen manifest the review reads it from. */
export function snapshotOf(entries: ManifestEntry[]): {
	reference: ReferenceSnapshot;
	manifest: CandidateManifest;
	snapshot: ReviewSnapshot;
} {
	const reference: ReferenceSnapshot = {
		reference_id: "ref_1",
		kind: "git_clean_head",
		project_path: "/p",
		head_commit: "a".repeat(40),
		branch: "main",
		tree_digest: digestValue("t"),
		entries: entries.map((e) => ({ ...e, baseline_state: "unchanged" })),
		exclusions: [],
		captured_at: "t",
		limits: noLimits,
	};
	const manifest: CandidateManifest = {
		candidate_id: "cand_1",
		workspace_id: "ws",
		base_reference_id: "ref_1",
		base_digest: reference.tree_digest,
		selected_paths: [],
		exclusions: [],
		entries,
		metadata_policy: "content_and_mode",
		manifest_digest: digestValue("m"),
		frozen_at: "t",
		limits: noLimits,
	};
	return {
		reference,
		manifest,
		snapshot: buildSnapshot({ change_id: "chg_1", reference, manifest, findings: [], newer_candidate: null, now: "t" }),
	};
}

/** A change of three files under `src/`: the tree shows `src`, then `src/a.js`, `src/b.js` and `src/c.js`. */
export function threeFileChange(): ReviewSnapshot {
	return snapshotOf([
		entry("README.md", "unchanged"),
		entry("src/a.js", "modified"),
		entry("src/b.js", "modified"),
		entry("src/c.js", "added"),
	]).snapshot;
}

/** A read-only query that answers every path with an empty change and a one-line content. */
export const emptyQuery = {
	async changes(path: string): Promise<ChangePage> {
		return { path, status: "modified", kind: "text", hunks: [], intraline: {}, metadata: {}, notes: [] };
	},
	async content(path: string, side: "old" | "new"): Promise<ContentPage> {
		return { path, side, kind: "text", lines: ["a"], start_line: 1, total_lines: 1, truncated: false, metadata: {} };
	},
};
