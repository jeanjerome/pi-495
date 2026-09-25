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
/** A reviewed file that tries to paint the reader's terminal: the drawing must render it inert. */
const HOSTILE_OLD = "const banner = 'plain';\n";
const HOSTILE_NEW = `const banner = '${ESC}[2J${ESC}[31mwiped${ESC}[0m';\n`;
const query = {
	async changes(path: string): Promise<ChangePage> {
		if (path.includes(ESC))
			return {
				path,
				status: "added",
				kind: "text",
				hunks: hunks(diffLines(HOSTILE_OLD, HOSTILE_NEW), 3),
				intraline: {},
				metadata: {},
				notes: [],
			};
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
function surface(rows = 20, narrowThreshold = 100, onExit = () => {}, language: "fr" | "en" = "fr") {
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
		language,
		requestRender: () => {
			renders++;
		},
	});
	return { s, snap, renders: () => renders };
}
const visible = (lines: string[]) => lines.map((l) => visibleLength(l));
const tick = () => new Promise((r) => setTimeout(r, 5));
/** Renders until the change body has arrived: the renderer that draws it is asynchronous. */
async function drawn(s: ReviewSurface, width: number): Promise<string> {
	for (let i = 0; i < 200; i++) {
		const text = s.render(width).join("\n");
		if (!text.includes("chargement…")) return text;
		await tick();
	}
	throw new Error("the change body was never drawn");
}

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
	it("names each path status in the language of the surface (UX-06)", () => {
		const { s } = surface(20, 100, () => {}, "en");
		const shown = [s.render(120).join("\n")];
		for (const key of ["down", "down", "down"]) {
			s.handleInput(key);
			shown.push(s.render(120).join("\n"));
		}
		const text = shown.join("\n");
		assert.match(text, /modified/);
		assert.doesNotMatch(text, /ajouté|modifié|supprimé|renommé|spécial|inconnu/);
	});

	it("draws a change in a gutter, keeping the operators the code holds (UX-07)", async () => {
		const { s } = surface(30);
		s.selectPath("src/a.js");
		const text = stripSequences(await drawn(s, 140));
		// The comparison sits left of the separator — sign and line number — and the code right of it,
		// so a `+` the program holds is still a character of the program.
		assert.match(text, /[-+]\s*│.*x = a \+ b;/, "the old line keeps its literal +");
		assert.match(text, /[-+]\s*│.*x = a - b;/, "the new line is drawn too");
		assert.match(text, /\d+\s*[-+]\s*│/, "signs and line numbers sit in the gutter");
		assert.ok(!text.includes("@@"), "no patch headers");
	});
	it("renders a terminal sequence held in a reviewed file inert (UX-10)", async () => {
		const { s } = surface(30);
		s.selectPath(`bad${ESC}[2Jname.js`);
		const text = await drawn(s, 140);
		// The renderer paints what it is handed and inspects nothing, so what reaches it is neutralized
		// first. `\u241b` is the visible stand-in a neutralized escape leaves behind.
		assert.match(text, /\u241b/, "the sequence from the file is shown as an inert glyph");
		assert.ok(!text.includes(`${ESC}[2J`), "and never reaches the terminal as a clear-screen");
		assert.match(stripSequences(text), /wiped/, "while the text around it stays readable");
	});
	it("draws the comparison 495 computed, never one the renderer made up (UX-07)", async () => {
		const { s } = surface(30);
		s.selectPath("src/a.js");
		const text = stripSequences(await drawn(s, 140));
		// `y = 1;` is unchanged, between a changed line and an added one. A renderer handed the two
		// sides re-pairs them its own way and answers "removed, then added again"; the record says
		// unchanged, and a drawing that disagreed with it would be a second opinion in its clothes.
		const rows = text.split("\n").filter((l) => l.includes("y = 1;"));
		assert.equal(rows.length, 1, `an unchanged line is drawn once, saw ${rows.length}`);
		assert.ok(!/[-+]\s*│.*y = 1;/.test(text), "and drawn as context, with no sign against it");
	});
	it("says how many lines a fold hides, and puts them back (UX-07)", async () => {
		const { s } = surface(30);
		s.selectPath("src/a.js");
		const open = stripSequences(await drawn(s, 140));
		assert.match(open, /y = 1;/, "the unchanged context is shown when nothing is folded");
		s.handleInput("x");
		const folded = stripSequences(await drawn(s, 140));
		assert.match(folded, /… \d+ ligne\(s\) inchangée\(s\)/, "a fold says what it hides");
		assert.ok(!folded.includes("y = 1;"), "the context is actually folded away");
		s.handleInput("x");
		assert.match(stripSequences(await drawn(s, 140)), /y = 1;/, "and the fold is reversible");
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
		s.handleInput("m");
		const wide = s.render(120);
		assert.ok(
			wide.some((l) => l.includes("│")),
			"two panes side by side outside the change view",
		);
		s.handleInput("m");
		s.handleInput("m");
		s.handleInput("m");
		s.handleInput("m");
		assert.equal(s.render(120)[2]?.includes("Modifications"), true, "back on the change view");
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
		const top = await drawn(s, 140);
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
		await drawn(s, 120);
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
