/**
 * The three review parameters the functional specification deferred to the L0 qualification
 * (§16): the narrow-terminal threshold, the pagination of large files and the large-file budgets.
 * Each one is decided against a criterion, and this is where the criterion is the test.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { CONTENT_PAGE_LINES, FILE_READ_BUDGET_BYTES, buildSnapshot, findNode, readChanges, readContent, type ChangePage, type ContentPage } from "../../src/application/review.ts";
import { MAX_DIFFED_BYTES } from "../../src/application/coverage.ts";
import { NARROW_THRESHOLD, ReviewSurface, treeRowOverhead } from "../../src/presentation/tui/review-surface.ts";
import { summarizeReview } from "../../src/presentation/structured/review-text.ts";
import { DEFAULT_WORKSPACE_POLICY } from "../../src/adapters/workspace/git-workspace.ts";
import type { CandidateManifest, ManifestEntry, ReferenceSnapshot } from "../../src/contracts/v1/candidate.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { splitLines } from "../../src/application/diff.ts";
import { REVIEW_CORPUS, deepestChangedPath, nameOfLength, tallFile } from "../fixtures/review-corpus.ts";

const noLimits = { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] };
function entry(path: string, state: ManifestEntry["baseline_state"], over: Partial<ManifestEntry> = {}): ManifestEntry {
	return { path, kind: "file", content_digest: digestValue(path + state), size: 1, mode: "000644", symlink_target: null, baseline_state: state, origin: "unknown", limits: null, ...over };
}
function snapshotOf(entries: ManifestEntry[]) {
	const reference: ReferenceSnapshot = { reference_id: "ref_1", kind: "git_clean_head", project_path: "/p", head_commit: "a".repeat(40), branch: "main", tree_digest: digestValue("t"), entries: entries.map((e) => ({ ...e, baseline_state: "unchanged" })), exclusions: [], captured_at: "t", limits: noLimits };
	const manifest: CandidateManifest = { candidate_id: "cand_1", workspace_id: "ws", base_reference_id: "ref_1", base_digest: reference.tree_digest, selected_paths: [], exclusions: [], entries, metadata_policy: "content_and_mode", manifest_digest: digestValue("m"), frozen_at: "t", limits: noLimits };
	return { reference, manifest, snapshot: buildSnapshot({ change_id: "chg_1", reference, manifest, findings: [], newer_candidate: null, now: "t" }) };
}
/** A reader whose pages come from `text`, recording what width of page it was asked for. */
function pagedQuery(text: string) {
	const asked: { start: number; limit: number }[] = [];
	const lines = splitLines(text);
	return {
		asked,
		async changes(path: string): Promise<ChangePage> { return { path, status: "modified", kind: "text", hunks: [], intraline: {}, metadata: {}, notes: [] }; },
		async content(path: string, side: "old" | "new", start: number, limit: number): Promise<ContentPage> {
			asked.push({ start, limit });
			const slice = lines.slice(start - 1, start - 1 + limit);
			return { path, side, kind: "text", lines: slice, start_line: start, total_lines: lines.length, truncated: start - 1 + slice.length < lines.length, metadata: {} };
		},
	};
}
const tick = () => new Promise((r) => setTimeout(r, 10));

describe("narrow-terminal threshold (SA-025, §16)", () => {
	const path = deepestChangedPath();
	const { snapshot } = snapshotOf([entry(path, "modified"), entry("README.md", "unchanged")]);
	function surface(narrowThreshold: number) {
		return new ReviewSurface({ snapshot, query: pagedQuery("a\n"), rows: () => 20, narrowThreshold, onExit: () => {}, requestRender: () => {} });
	}
	/** The tree row of the only changed path, without the padding `fit` adds. */
	function treeRow(lines: string[]): string {
		return lines.slice(2, -2).map((l) => l.split("│")[0] ?? l).find((l) => l.includes("-adapter.ts") || l.includes("…"))!.trimEnd();
	}

	it("is the smallest width at which the tree column still shows the corpus's deepest changed name whole", () => {
		// Criterion: a name the layout cut makes two files indistinguishable, and the tree is the only
		// pane that can navigate. `narrowThreshold: 0` keeps two panes at any width so the criterion
		// can be measured on the split itself.
		const needed = treeRowOverhead(REVIEW_CORPUS.max_depth) + REVIEW_CORPUS.name.p95;
		assert.equal(needed, 36, "2*3 + 4 + 26 columns for the deepest p95 name");
		let smallest = 0;
		for (let width = 40; width <= 200; width++) {
			if (treeRow(surface(0).render(width)).includes("…")) continue;
			smallest = width;
			break;
		}
		assert.equal(smallest, 93, "the 0.4 split reaches 36 tree columns at 93");
		assert.ok(NARROW_THRESHOLD >= smallest, `${NARROW_THRESHOLD} is at or above the measured minimum ${smallest}`);
		assert.equal(NARROW_THRESHOLD, Math.ceil(smallest / 10) * 10, "rounded up to the next ten");
	});

	it("keeps the name readable on both sides of the threshold: split above, alternating below", () => {
		const wide = surface(NARROW_THRESHOLD).render(NARROW_THRESHOLD);
		assert.ok(wide.some((l) => l.includes("│")), "two panes at the threshold");
		assert.ok(!treeRow(wide).includes("…"), treeRow(wide));
		const narrow = surface(NARROW_THRESHOLD).render(NARROW_THRESHOLD - 1);
		assert.ok(!narrow.slice(2, -2).some((l) => l.includes("│")), "one pane below it");
		assert.ok(!treeRow(narrow).includes("…"), "the full width shows the name the split could not");
	});

	it("names every action at every width: nothing a reviewer can do disappears from the help (§16)", () => {
		// The labelled help is 123 columns wide. Cut to fit, it would silently drop its last actions.
		const actions = ["↑↓", "⏎", "tab", "c", "m", "n/p", "]/[", "x", "+/-", "/", "q"];
		for (const width of [40, 60, 79, 80, 99, 100, 120, 122, 123, 124, 200]) {
			const help = surface(NARROW_THRESHOLD).render(width).at(-1)!;
			assert.ok(!help.includes("…"), `the help is not cut at ${width}: ${help}`);
			for (const action of actions) assert.ok(help.includes(action), `${action} is named at ${width}: ${help}`);
		}
	});
});

describe("pagination of large files (§10.5, §16)", () => {
	const path = "src/tall.ts";
	const { snapshot } = snapshotOf([entry(path, "modified")]);
	const total = CONTENT_PAGE_LINES * 2 + 5;

	it("loads one page at a time, says what is not loaded yet, and reaches the end by reading on", async () => {
		const query = pagedQuery(tallFile(total));
		const surface = new ReviewSurface({ snapshot, query, rows: () => 30, onExit: () => {}, requestRender: () => {} });
		surface.selectPath(path);
		surface.handleInput("m"); // changes → new: the reader shows the content itself
		surface.render(120);
		await tick();
		assert.deepEqual(query.asked, [{ start: 1, limit: CONTENT_PAGE_LINES }], "the first page is one page, not the whole file");

		// Reading to the edge of what is loaded shows what is not, then brings the next page in.
		surface.focus = "reader";
		for (let page = 1; page <= 2; page++) {
			surface.readerScroll = CONTENT_PAGE_LINES * page - 5;
			surface.invalidate();
			assert.match(surface.render(120).join("\n"), new RegExp(`${total - CONTENT_PAGE_LINES * page} lignes non chargées`), `the limit left after ${page} page(s) is visible`);
			await tick();
		}
		assert.deepEqual(query.asked.map((a) => a.start), [1, CONTENT_PAGE_LINES + 1, CONTENT_PAGE_LINES * 2 + 1]);
		assert.ok(query.asked.every((a) => a.limit === CONTENT_PAGE_LINES), "no page is ever larger than the budget");
		surface.readerScroll = total - 5;
		surface.invalidate();
		const text = surface.render(120).join("\n");
		assert.ok(!text.includes("lignes non chargées"), "the notice goes away once the file is fully read");
		assert.match(text, new RegExp(String(total).padStart(6, "0")), "the last line of the file is reachable");
	});

	it("a page outruns a screen by ten, so scrolling never waits on a load", () => {
		// The tallest terminal body this surface renders is bounded by its rows; ten screens of a
		// 200-row terminal is the margin the value was chosen for.
		assert.ok(CONTENT_PAGE_LINES >= 10 * 200, `${CONTENT_PAGE_LINES} lines is ten screens of a 200-row terminal`);
		assert.equal(Math.ceil(FILE_READ_BUDGET_BYTES / (CONTENT_PAGE_LINES * REVIEW_CORPUS.line.p95)), 7, "seven pages cover the largest readable file");
	});
});

describe("large-file budgets (§10.5, §16)", () => {
	const big = "assets/big.bin";
	const between = "assets/inventoried.bin";
	const sources = (entries: ManifestEntry[]) => {
		const { reference, manifest } = snapshotOf(entries);
		return { referencePath: "/p", workspacePath: "/w", reference, manifest, maxBytes: FILE_READ_BUDGET_BYTES };
	};

	it("a file above the read budget is typed, sized and never read", async () => {
		const entries = [entry(big, "modified", { size: FILE_READ_BUDGET_BYTES + 1 })];
		const page = await readContent(sources(entries), big, "new", { start_line: 1, limit: CONTENT_PAGE_LINES });
		assert.equal(page.kind, "too_large");
		assert.deepEqual(page.lines, [], "nothing was read");
		assert.equal((page.metadata as { size: number }).size, FILE_READ_BUDGET_BYTES + 1, "its size is still known");
		const changes = await readChanges(sources(entries), big, "modified", null);
		assert.equal(changes.kind, "too_large");
		assert.deepEqual(changes.hunks, []);
	});

	it("it still appears in the tree and in the structured review, with its status", async () => {
		const entries = [entry(big, "modified", { size: FILE_READ_BUDGET_BYTES + 1 })];
		const { snapshot } = snapshotOf(entries);
		assert.ok(findNode(snapshot.root, big), "the path is in the tree, not dropped");
		assert.equal(findNode(snapshot.root, big)!.status, "modified");
		const review = { snapshot, changes: (p: string, s: never, o: string | null) => readChanges(sources(entries), p, s, o), content: (p: string, side: "old" | "new", start: number, limit: number) => readContent(sources(entries), p, side, { start_line: start, limit }) };
		const text = await summarizeReview(review, big, "fr");
		assert.match(text, /modified\s+assets\/big\.bin/);
		assert.match(text, /too_large/);
	});

	it("sits under the workspace budget on purpose: between the two, a file is inventoried but not read", async () => {
		assert.ok(FILE_READ_BUDGET_BYTES < DEFAULT_WORKSPACE_POLICY.max_file_bytes, "reading is stricter than walking");
		const size = Math.trunc((FILE_READ_BUDGET_BYTES + DEFAULT_WORKSPACE_POLICY.max_file_bytes) / 2);
		const entries = [entry(between, "modified", { size })];
		const { snapshot } = snapshotOf(entries);
		// Walked and digested by the manifest, so the candidate is complete...
		assert.equal(snapshot.complete, true);
		assert.ok(findNode(snapshot.root, between)!.status === "modified");
		// ...and refused by the reader, which says so rather than showing an empty comparison.
		assert.equal((await readContent(sources(entries), between, "new", { start_line: 1, limit: CONTENT_PAGE_LINES })).kind, "too_large");
	});

	it("the differential coverage refuses the same bytes as the review", () => {
		// A line map of a file 495 will not display would measure what nobody can look at.
		assert.equal(MAX_DIFFED_BYTES, FILE_READ_BUDGET_BYTES);
	});

	it("a name at the corpus maximum is still what the fixture says it is", () => {
		assert.equal([...nameOfLength(REVIEW_CORPUS.name.max)].length, REVIEW_CORPUS.name.max);
	});
});
