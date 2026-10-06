/**
 * The review answers to the keys the user gave Pi's lists in Pi's keybindings, as `/tree` does, and
 * keeps its own letters for the gestures Pi names no action for.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { type KeybindingsConfig, KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { ReviewSurface } from "../../src/presentation/tui/review-surface.ts";
import { emptyQuery, threeFileChange } from "../helpers/review-change.ts";

const DOWN = "\x1b[B";
const PAGE_DOWN = "\x1b[6~";
const ENTER = "\r";
const TAB = "\t";
const ESCAPE = "\x1b";
const CTRL_C = "\x03";
const CTRL_G = "\x07";
const CTRL_T = "\x14";

/** A review of three changed files under the given Pi keybindings; `exits` counts the times it closed. */
function review(config?: KeybindingsConfig) {
	let exits = 0;
	const surface = new ReviewSurface({
		snapshot: threeFileChange(),
		query: emptyQuery,
		rows: () => 20,
		onExit: () => {
			exits++;
		},
		requestRender: () => {},
		...(config ? { keybindings: new KeybindingsManager(TUI_KEYBINDINGS, config) } : {}),
	});
	surface.render(120);
	return { surface, exits: () => exits };
}

describe("the review answers to the keys the user set in Pi", () => {
	it("moves the selection with the keys given to tui.select.up and tui.select.down, and no longer with the arrow", () => {
		const { surface } = review({ "tui.select.up": "k", "tui.select.down": "j" });
		const [first, second] = surface.rows().map((r) => r.node.path);
		assert.equal(surface.current()?.path, first);
		surface.handleInput("j");
		assert.equal(surface.current()?.path, second, "j passes the selection to the next path of the tree");
		surface.handleInput("k");
		assert.equal(surface.current()?.path, first, "k brings it back to the first path");
		surface.handleInput(DOWN);
		assert.equal(surface.current()?.path, first, "the down arrow no longer moves the selection");
	});

	it("opens, passes the focus, pages, folds and unfolds with the keys set in Pi, and no longer with Enter and Tab", () => {
		const { surface } = review({
			"tui.select.confirm": "space",
			"tui.input.tab": "ctrl+t",
			"tui.select.pageUp": "b",
			"tui.select.pageDown": "f",
			"tui.editor.cursorLeft": "h",
			"tui.editor.cursorRight": "l",
		});
		surface.handleInput("h");
		assert.equal(surface.expanded.has("src"), false, "h folds the selected directory");
		surface.handleInput("l");
		assert.equal(surface.expanded.has("src"), true, "l unfolds it");
		surface.selectPath("src/a.js");
		surface.handleInput(ENTER);
		assert.equal(surface.focus, "tree", "Enter no longer opens the file");
		surface.handleInput(TAB);
		assert.equal(surface.focus, "tree", "Tab no longer passes the focus");
		surface.handleInput(" ");
		assert.equal(surface.focus, "reader", "space opens the file of the tree in the reader");
		surface.focus = "tree";
		surface.handleInput(CTRL_T);
		assert.equal(surface.focus, "reader", "ctrl+t passes the focus from the tree to the reader");
		const paged = review().surface;
		paged.handleInput(PAGE_DOWN);
		surface.handleInput("f");
		assert.ok(surface.readerScroll > 0, "f moves the reader down");
		assert.equal(surface.readerScroll, paged.readerScroll, "by one page, as Page Down does without settings");
		surface.handleInput("b");
		assert.equal(surface.readerScroll, 0, "b moves it back up");
	});

	it("closes on ctrl+c with no keys set, as Pi's lists do", () => {
		const { surface, exits } = review();
		surface.handleInput(CTRL_C);
		assert.equal(exits(), 1, "ctrl+c closes the review");
	});

	it("closes on the key given to tui.select.cancel, no longer on Escape, and always on q", () => {
		const cancelled = review({ "tui.select.cancel": "ctrl+g" });
		cancelled.surface.handleInput(CTRL_G);
		assert.equal(cancelled.exits(), 1, "ctrl+g closes the review");
		const escaped = review({ "tui.select.cancel": "ctrl+g" });
		escaped.surface.handleInput(ESCAPE);
		assert.equal(escaped.exits(), 0, "Escape no longer closes it");
		const quit = review({ "tui.select.cancel": "ctrl+g" });
		quit.surface.handleInput("q");
		assert.equal(quit.exits(), 1, "q closes it");
	});

	it("ends a search with the confirm key and cancels it with the cancel key, the review staying open", () => {
		const { surface, exits } = review({ "tui.select.cancel": "ctrl+g" });
		surface.handleInput("/");
		for (const ch of "c.js") surface.handleInput(ch);
		surface.handleInput(ENTER);
		assert.equal(surface.searching, false, "Enter ends the search");
		assert.equal(surface.current()?.path, "src/c.js", "with the selection on src/c.js");
		surface.handleInput("/");
		surface.handleInput("a");
		surface.handleInput(CTRL_G);
		assert.equal(surface.searching, false, "ctrl+g cancels the search");
		assert.equal(surface.search, "", "and empties its text");
		assert.equal(exits(), 0, "and the review stays open");
	});
});
