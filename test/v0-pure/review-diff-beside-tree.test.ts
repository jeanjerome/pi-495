import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { ReviewSurface, stripSequences, visibleLength } from "../../src/presentation/tui/review-surface.ts";
import { buildSnapshot, type ChangePage, type ContentPage } from "../../src/application/review.ts";
import type { ReferenceSnapshot, CandidateManifest } from "../../src/contracts/v1/candidate.ts";
import { digestValue } from "../../src/contracts/digest.ts";
import { entry } from "../helpers/review-entry.ts";
import { diffLines, hunks } from "../../src/application/diff.ts";

const ESC = String.fromCharCode(27);
const WIDTH = 140;
const limits = { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] };
const reference: ReferenceSnapshot = {
	reference_id: "ref_1",
	kind: "git_clean_head",
	project_path: "/p",
	head_commit: "a".repeat(40),
	branch: "main",
	tree_digest: digestValue("t"),
	entries: [
		entry("src/a.js", "unchanged"),
		entry("src/b.js", "unchanged"),
		entry("src/far.js", "unchanged"),
		entry("src/long.js", "unchanged"),
	],
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
		entry("src/a.js", "modified"),
		entry("src/b.js", "deleted"),
		entry("src/c.js", "added"),
		entry("src/far.js", "modified"),
		entry("src/long.js", "modified"),
	],
	metadata_policy: "content_and_mode",
	manifest_digest: digestValue("m"),
	frozen_at: "t",
	limits,
};

const numbered = (n: number) => Array.from({ length: n }, (_, i) => `l${i + 1}`);
const FAR_OLD = numbered(30);
const FAR_NEW = FAR_OLD.map((l, i) => (i === 1 || i === 24 ? `${l} changed` : l));
const SIDES: Record<string, [string, string]> = {
	"src/a.js": ["a\nx = a + b;\ny = 1;\n", "a\nx = a - b;\ny = 1;\nz = 2;\n"],
	"src/far.js": [`${FAR_OLD.join("\n")}\n`, `${FAR_NEW.join("\n")}\n`],
	"src/long.js": ["short\n", `short\nconst long = "${"w".repeat(300)}";\n`],
};
const query = {
	async changes(path: string): Promise<ChangePage> {
		const [oldText, newText] = SIDES[path] ?? ["", ""];
		return {
			path,
			status: "modified",
			kind: "text",
			hunks: hunks(diffLines(oldText, newText), 3),
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
			lines: [],
			start_line: 1,
			total_lines: 0,
			truncated: false,
			metadata: {},
		};
	},
};

function surface(renderDiff?: (diffText: string) => string): ReviewSurface {
	const snapshot = buildSnapshot({
		change_id: "chg_1",
		reference,
		manifest,
		findings: [],
		newer_candidate: null,
		now: "t",
	});
	return new ReviewSurface({
		snapshot,
		query,
		rows: () => 40,
		onExit: () => {},
		requestRender: () => {},
		...(renderDiff ? { renderDiff } : {}),
	});
}

const tick = () => new Promise((r) => setTimeout(r, 5));
/** Renders until the change has been loaded: the query that reads it is asynchronous. */
async function opened(s: ReviewSurface, path: string): Promise<string[]> {
	s.selectPath(path);
	for (let i = 0; i < 200; i++) {
		const lines = s.render(WIDTH);
		if (!lines.join("\n").includes("chargement…")) return lines;
		await tick();
	}
	throw new Error(`the change of ${path} was never shown`);
}

/** What the reader shows on each row: the text right of the separator, or nothing on a row without one. */
const readerRows = (lines: string[]) =>
	lines.map((l) => stripSequences(l)).map((l) => (l.includes("│") ? l.slice(l.indexOf("│") + 1).trimEnd() : ""));

/** The rows of the reader below its title, the title being the row that names the open path. */
function readerBody(lines: string[], path: string): string[] {
	const rows = readerRows(lines);
	const title = rows.findIndex((r) => r.includes(`Modifications — ${path}`));
	assert.ok(title >= 0, `the reader names ${path} beside the tree, saw:\n${lines.map(stripSequences).join("\n")}`);
	return rows.slice(title + 1);
}

describe("a change is read beside the tree, in lines drawn the way Pi draws its edit tool's changes", () => {
	it("keeps the tree on the left, naming b.js and c.js before │, and shows each line with its sign and number", async () => {
		const s = surface();
		const lines = (await opened(s, "src/a.js")).map(stripSequences);
		for (const name of ["b.js", "c.js"]) {
			const row = lines.find((l) => l.includes(name));
			assert.ok(row !== undefined, `the tree still names ${name} while src/a.js is open`);
			assert.ok(
				row.includes("│") && row.indexOf(name) < row.indexOf("│"),
				`${name} sits left of the separator: ${JSON.stringify(row)}`,
			);
		}
		const body = readerBody(lines, "src/a.js").filter((r) => r !== "");
		assert.deepEqual(
			body.slice(0, 5),
			[" 1 a", "-2 x = a + b;", "+2 x = a - b;", " 3 y = 1;", "+4 z = 2;"],
			"context, removed, added, context and added lines, each with its sign and number, in that order",
		);
		assert.equal(body.filter((r) => r.includes("y = 1;")).length, 1, "the unchanged line is drawn once");
	});

	it("cuts a line wider than the reader at its edge by …, with no row past 140 columns and │ in one column", async () => {
		const s = surface();
		const lines = await opened(s, "src/long.js");
		const plain = lines.map(stripSequences);
		const long = plain.find((l) => l.includes("const long"));
		assert.ok(long !== undefined, "the long line is shown");
		assert.ok(long.includes("│") && long.indexOf("│") < long.indexOf("const long"), "beside the tree");
		assert.ok(long.trimEnd().endsWith("…"), `cut at the reader's edge by …: ${JSON.stringify(long)}`);
		assert.ok(
			lines.every((l) => visibleLength(l) <= WIDTH),
			"no row is wider than the terminal",
		);
		const columns = [...new Set(plain.map((l) => l.indexOf("│")).filter((c) => c >= 0))];
		assert.equal(columns.length, 1, `the separator sits at one column, saw ${JSON.stringify(columns)}`);
	});

	it("redraws the change in the colours of the new theme once invalidated", async () => {
		const theme = { removed: "31" };
		const paint = (text: string) =>
			text
				.split("\n")
				.map((l) => (l.startsWith("-") ? `${ESC}[${theme.removed}m${l}${ESC}[39m` : l))
				.join("\n");
		const s = surface(paint);
		const removedRow = (lines: string[]) => lines.find((l) => stripSequences(l).includes("-2 x = a + b;"));
		const before = removedRow(await opened(s, "src/a.js"));
		assert.ok(before?.includes(`${ESC}[31m-2 x = a + b;`), `drawn in the first theme: ${JSON.stringify(before)}`);
		theme.removed = "91";
		s.invalidate();
		const after = removedRow(s.render(WIDTH));
		assert.ok(after?.includes(`${ESC}[91m-2 x = a + b;`), `drawn in the new theme: ${JSON.stringify(after)}`);
	});

	it("jumps with ] to the first line of the second portion, and back with [ to the first", async () => {
		const s = surface();
		const first = readerBody(await opened(s, "src/far.js"), "src/far.js")[0];
		assert.equal(first, "  1 l1", "the reader opens on the first line of the first portion");
		s.handleInput("]");
		assert.equal(
			readerBody(s.render(WIDTH), "src/far.js")[0],
			" 22 l22",
			"] brings the first line of the second portion to the top of the reader",
		);
		s.handleInput("[");
		assert.equal(readerBody(s.render(WIDTH), "src/far.js")[0], "  1 l1", "[ brings the first portion back");
	});
	it("says on folding the exact count of unchanged lines each portion hides: 4, then 8", async () => {
		const s = surface();
		await opened(s, "src/far.js");
		s.handleInput("x");
		const notes = readerBody(s.render(WIDTH), "src/far.js").filter((r) => r.includes("…"));
		// The first portion holds l1 and l3..l5 unchanged around l2, the second l22..l24 and l26..l30
		// around l25: a count per segment rather than per line would announce 2 and 2.
		assert.deepEqual(
			notes.map((r) => r.trim()),
			["… 4 ligne(s) inchangée(s)", "… 8 ligne(s) inchangée(s)"],
			"each fold names how many unchanged lines it hides",
		);
	});
});
