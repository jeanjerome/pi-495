/**
 * The kernel rule on a frozen candidate (VER-03): given the tree the protocol froze and the tree the
 * controls left behind, what counts as the candidate having been written to. No workspace, no clock,
 * no port — the rule alone.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { digestValue } from "../../src/contracts/digest.ts";
import type { CandidateManifest, ManifestEntry } from "../../src/contracts/v1/candidate.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { candidateMoved, writablePrefixes } from "../../src/domain/candidate.ts";

function entry(path: string, content: string): ManifestEntry {
	return {
		path,
		kind: "file",
		content_digest: digestValue({ content }),
		size: content.length,
		mode: "100644",
		symlink_target: null,
		baseline_state: "modified",
		origin: "agent",
		limits: null,
	};
}

/** A manifest whose digest follows its entries, as a frozen one does. */
function manifest(entries: ManifestEntry[]): CandidateManifest {
	return {
		candidate_id: "cnd_1",
		workspace_id: "wsp_1",
		base_reference_id: "ref_1",
		base_digest: digestValue({ base: true }),
		selected_paths: [],
		exclusions: [],
		entries,
		metadata_policy: "content_and_mode",
		manifest_digest: digestValue(entries.map((e) => [e.path, e.content_digest])),
		frozen_at: "2026-09-20T12:00:00.000Z",
		limits: { truncated: false, bytes_read: 0, bytes_total: null, exclusions: [], unstable: false, notes: [] },
	};
}

const control = (writable: string[]): ControlDefinition =>
	({ control_id: "c1", writable_paths: writable }) as ControlDefinition;

describe("the tree a frozen candidate must still be, once the controls have run (VER-03)", () => {
	it("reads a writable declaration as a directory prefix, whether or not it was written as one", () => {
		assert.deepEqual(writablePrefixes([control(["target", "domain/target/"])]), ["target/", "domain/target/"]);
		assert.deepEqual(writablePrefixes([control([])]), [], "a control that declares nothing contributes nothing");
	});

	it("an identical manifest is not a mutation", () => {
		const frozen = manifest([entry("src/a.js", "one")]);
		assert.equal(candidateMoved(frozen, frozen, []), false);
	});

	it("a content change outside the writable declarations is a mutation of the candidate", () => {
		const frozen = manifest([entry("src/a.js", "one")]);
		const after = manifest([entry("src/a.js", "formatted")]);
		assert.equal(candidateMoved(frozen, after, ["out/"]), true);
	});

	it("an added path outside them is one too", () => {
		const frozen = manifest([entry("src/a.js", "one")]);
		const after = manifest([entry("src/a.js", "one"), entry("src/b.js", "two")]);
		assert.equal(candidateMoved(frozen, after, ["out/"]), true);
	});

	it("a difference confined to the writable declarations is not", () => {
		const frozen = manifest([entry("src/a.js", "one"), entry("out/report.xml", "before")]);
		const after = manifest([entry("src/a.js", "one"), entry("out/report.xml", "after")]);
		assert.equal(
			candidateMoved(frozen, after, ["out/"]),
			false,
			"the two manifests differ, and everything that differs is what a control declared it writes",
		);
	});

	it("the same difference is a mutation when no control declared that path", () => {
		const frozen = manifest([entry("src/a.js", "one"), entry("out/report.xml", "before")]);
		const after = manifest([entry("src/a.js", "one"), entry("out/report.xml", "after")]);
		assert.equal(candidateMoved(frozen, after, []), true);
	});
});
