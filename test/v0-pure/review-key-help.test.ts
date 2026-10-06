/**
 * The help line of the review names the keys that act: those the user gave Pi's actions, then the
 * review's own letters.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { type KeybindingsConfig, KeybindingsManager, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { ReviewSurface } from "../../src/presentation/tui/review-surface.ts";
import { emptyQuery, threeFileChange } from "../helpers/review-change.ts";

/** A review of three changed files under the given Pi keybindings, in the given language. */
function review(language: "fr" | "en", config?: KeybindingsConfig) {
	return new ReviewSurface({
		snapshot: threeFileChange(),
		query: emptyQuery,
		rows: () => 20,
		onExit: () => {},
		requestRender: () => {},
		language,
		...(config ? { keybindings: new KeybindingsManager(TUI_KEYBINDINGS, config) } : {}),
	});
}
const help = (surface: ReviewSurface, width: number) => surface.render(width).at(-1)!;

describe("the help of the review names the keys set in Pi", () => {
	const set = { "tui.select.up": "k", "tui.select.down": "j", "tui.select.confirm": "space" } as const;

	it("names the keys given to moving and opening, in the labelled and the short form, in either language", () => {
		const labelled = help(review("en", set), 200);
		assert.ok(labelled.startsWith("k/j move  space open  tab focus"), labelled);
		const short = help(review("en", set), 60);
		assert.ok(short.startsWith("k/j space tab"), short);
		const french = help(review("fr", set), 200);
		assert.ok(french.startsWith("k/j naviguer  space ouvrir  tab focus"), french);
	});

	it("no longer names an action the user disabled in Pi, nor opens the file with Enter", () => {
		const surface = review("en", { "tui.select.confirm": [] });
		const line = help(surface, 200);
		assert.ok(line.startsWith("↑↓ move  tab focus"), line);
		surface.selectPath("src/a.js");
		surface.handleInput("\r");
		assert.equal(surface.focus, "tree", "Enter no longer opens the selected file");
	});

	it("keeps today's help when no key is set", () => {
		assert.equal(
			help(review("en"), 200).trimEnd(),
			"↑↓ move  ⏎ open  tab focus  c filter  m mode  n/p file  ]/[ change  x context  +/- width  / search  q back",
		);
	});
});
