import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ReviewSurface, fit, stripSequences, visibleLength } from "../../src/presentation/tui/review-surface.ts";
import { buildSnapshot, type ChangePage, type ContentPage } from "../../src/application/review.ts";
import type { ManifestEntry, ReferenceSnapshot, CandidateManifest } from "../../src/contracts/v1/candidate.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { diffLines, hunks } from "../../src/application/diff.ts";

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
const limits = { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] };
const reference: ReferenceSnapshot = {
	reference_id: "ref_1",
	kind: "git_clean_head",
	project_path: "/p",
	head_commit: "a".repeat(40),
	branch: "main",
	tree_digest: digestValue("t"),
	entries: [entry("README.md", "unchanged"), entry("src/a.js", "unchanged"), entry("src/b.js", "unchanged")],
	exclusions: [],
	captured_at: "t",
	limits,
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
		entry(`bad${ESC}[2Jname.js`, "added"),
	],
	metadata_policy: "content_and_mode",
	manifest_digest: digestValue("m"),
	frozen_at: "t",
	limits,
};
const OLD = "a\nx = a + b;\ny = 1;\n";
const NEW = "a\nx = a - b;\ny = 1;\nz = 2;\n";
const query = {
	async changes(path: string): Promise<ChangePage> {
		return {
			path,
			status: "modified",
			kind: "text",
			hunks: hunks(diffLines(OLD, NEW), 3),
			intraline: {},
			metadata: {},
			notes: [],
		};
	},
	async content(path: string, side: "old" | "new"): Promise<ContentPage> {
		return {
			path,
			side,
			kind: "text",
			lines: (side === "old" ? OLD : NEW).split("\n"),
			start_line: 1,
			total_lines: 4,
			truncated: false,
			metadata: {},
		};
	},
};
function surface(rows = 20, narrowThreshold = 100, onExit = () => {}) {
	const snap = buildSnapshot({
		change_id: "chg_1",
		reference,
		manifest,
		findings: [],
		newer_candidate: null,
		now: "t",
	});
	let renders = 0;
	const s = new ReviewSurface({
		snapshot: snap,
		query,
		rows: () => rows,
		narrowThreshold,
		onExit,
		requestRender: () => {
			renders++;
		},
	});
	return { s, snap, renders: () => renders };
}
const visible = (lines: string[]) => lines.map((l) => visibleLength(l));
const tick = () => new Promise((r) => setTimeout(r, 5));

describe("ReviewSurface rendering (UX-06, UX-07, UX-08, SA-023, SA-025, SA-028)", () => {
	it("never exceeds the width nor the terminal rows and shows textual statuses", async () => {
		const { s } = surface(14);
		const lines = s.render(120);
		assert.equal(lines.length, 14);
		assert.ok(
			visible(lines).every((n) => n <= 120),
			JSON.stringify(visible(lines)),
		);
		const text = lines.join("\n");
		assert.match(text, /M a\.js/);
		assert.match(text, /D b\.js/);
		assert.match(text, /A c\.js/);
		assert.ok(!text.includes(ESC), "control sequences neutralized in display");
		assert.match(text, /changements uniquement/);
		assert.ok(!text.includes("README"), "changed-only hides intact files");
		s.handleInput("c");
		assert.match(s.render(120).join("\n"), /README/);
	});
	it("renders OLD/NEW blocks without +/- prefixes, hunk markers or line numbers, preserving literal operators", async () => {
		const { s } = surface(30);
		s.selectPath("src/a.js");
		s.render(140);
		await tick();
		const text = s.render(140).join("\n");
		assert.match(text, /ANCIEN/);
		assert.match(text, /NOUVEAU/);
		assert.match(text, /x = a \+ b;/);
		assert.match(text, /x = a - b;/);
		assert.ok(!/^[+-]x = /m.test(text), "no patch prefixes");
		assert.ok(!text.includes("@@"), "no hunk markers");
		assert.ok(!/│\s*\d+\s+x = /.test(text), "no line number column");
	});
	it("keyboard navigation keeps selection and focus, exits on q without side effects", () => {
		let exited = 0;
		const { s } = surface(20, 100, () => {
			exited++;
		});
		s.render(120);
		const first = s.current()?.path;
		s.handleInput("\x1b[B");
		assert.notEqual(s.current()?.path, first);
		s.handleInput("\t");
		assert.equal(s.focus, "reader");
		s.handleInput("\t");
		assert.equal(s.focus, "tree");
		s.handleInput("n");
		assert.ok(s.current() && s.current()!.status !== "intact");
		s.handleInput("m");
		assert.equal(s.mode, "new");
		s.handleInput("/");
		for (const ch of "c.js") s.handleInput(ch);
		s.handleInput("\r");
		assert.equal(s.current()?.path, "src/c.js");
		s.handleInput("q");
		assert.equal(exited, 1);
	});
	it("below the width threshold alternates tree and reader with the same selection and all actions", () => {
		const { s } = surface(16, 100);
		s.selectPath("src/a.js");
		const wide = s.render(120);
		assert.ok(
			wide.some((l) => l.includes("│")),
			"two panes side by side",
		);
		const narrow = s.render(60);
		assert.ok(visible(narrow).every((n) => n <= 60));
		assert.ok(!narrow.slice(2, 12).some((l) => l.includes("│")), "one pane at a time");
		assert.match(narrow.join("\n"), /\[arbre\]/);
		s.handleInput("\t");
		const reader = s.render(60);
		assert.match(reader.join("\n"), /\[lecteur\]/);
		assert.match(reader.join("\n"), /Modifications — src\/a\.js/);
		assert.equal(s.current()?.path, "src/a.js", "selection unchanged across views");
	});
	it("answers the page, home and end keys the terminal actually sends (UX-08)", async () => {
		const { s } = surface(30);
		s.selectPath("src/a.js");
		s.handleInput("\t");
		s.render(140);
		await tick();
		const top = s.render(140).join("\n");
		s.handleInput("\x1b[6~");
		const down = s.render(140).join("\n");
		assert.notEqual(down, top, "page down moves the reader");
		s.handleInput("\x1b[5~");
		assert.equal(s.render(140).join("\n"), top, "page up comes back");
		// Pi names these; the review has no action for them, so they must leave the surface as it was
		// rather than reach the search or the tree as raw bytes.
		const before = s.render(140).join("\n");
		for (const key of ["\x1b[H", "\x1b[F", "\x1b[3~", "\x1b[1;5A"]) {
			s.handleInput(key);
			assert.equal(s.render(140).join("\n"), before, `${JSON.stringify(key)} moves nothing`);
		}
		assert.equal(s.current()?.path, "src/a.js", "selection survives unhandled keys");
	});
	it("follows the terminal height when only the height changed (UX-08)", () => {
		// A terminal can be resized in height alone. The surface reads its rows at every render, so a
		// render that answered from a cache kept under the width would draw the height it had before —
		// short of the terminal, or past its last line.
		let rows = 20;
		const snap = buildSnapshot({
			change_id: "chg_1",
			reference,
			manifest,
			findings: [],
			newer_candidate: null,
			now: "t",
		});
		const s = new ReviewSurface({
			snapshot: snap,
			query,
			rows: () => rows,
			narrowThreshold: 100,
			onExit: () => {},
			requestRender: () => {},
		});
		assert.equal(s.render(120).length, 20);
		rows = 30;
		assert.equal(s.render(120).length, 30, "a taller terminal is filled");
		rows = 12;
		assert.equal(s.render(120).length, 12, "a shorter terminal is not overdrawn");
	});

	it("fit truncates by visible characters", () => {
		assert.equal(visibleLength(fit("héllo wörld", 5)), 5);
		assert.equal(stripSequences(fit("héllo wörld", 5)), "héll…");
		assert.equal(fit("ab", 4), "ab  ");
	});
	it("fit measures the text a theme styled, not the escape sequences it wrapped around it", () => {
		const styled = `${ESC}[31mabc${ESC}[39m`;
		assert.equal(visibleLength(styled), 3, "three printed characters");
		assert.equal(visibleLength(fit(styled, 10)), 10, "padded to the announced width");
		assert.equal(stripSequences(fit(styled, 2)), "a…", "a line cut on its visible text");
		assert.equal(visibleLength(fit(styled, 2)), 2, "a cut line occupies the width announced");
		assert.equal(
			visibleLength(`${ESC}]8;;https://example.invalid${ESC}\\link${ESC}]8;;${ESC}\\`),
			4,
			"a hyperlink prints its label only",
		);
	});
	it("pads every row to the announced width once a theme has styled it, so the panes stay aligned (UX-08)", async () => {
		const paint = (code: string) => (s: string) => `${ESC}[${code}m${s}${ESC}[39m`;
		const styles = {
			added: paint("32"),
			modified: paint("33"),
			deleted: paint("31"),
			renamed: paint("36"),
			intact: paint("90"),
			selected: paint("7"),
			dim: paint("90"),
			header: paint("1"),
			oldBlock: paint("31"),
			newBlock: paint("32"),
			focus: paint("1"),
			warn: paint("33"),
		};
		const snap = buildSnapshot({
			change_id: "chg_1",
			reference,
			manifest,
			findings: [],
			newer_candidate: null,
			now: "t",
		});
		const s = new ReviewSurface({
			snapshot: snap,
			query,
			styles,
			rows: () => 14,
			onExit: () => {},
			requestRender: () => {},
		});
		s.selectPath("src/a.js");
		s.render(120);
		await tick();
		s.invalidate();
		const lines = s.render(120);
		assert.deepEqual(
			[...new Set(lines.map((l) => visibleLength(l)))],
			[120],
			"every row is padded to the width it was asked for",
		);
		const columns = [...new Set(lines.map((l) => stripSequences(l).indexOf("│")).filter((c) => c >= 0))];
		assert.equal(columns.length, 1, `the separator sits at one column, saw ${JSON.stringify(columns)}`);
	});
});
