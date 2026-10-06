/**
 * The review `/495 review` opens in Pi draws a change with Pi's own `renderDiff`, in the colours of
 * the theme Pi has active, and draws it again in the new theme once Pi invalidates it.
 */
import "../helpers/force-color.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager, TUI_KEYBINDINGS, stripTerminalSequences } from "@earendil-works/pi-tui";
import type { ChangePage } from "../../src/application/review.ts";
import { diffLines, hunks } from "../../src/application/diff.ts";
import { openReviewTui } from "../../src/extension/review-command.ts";
import { FakeCustomUi } from "../helpers/fake-custom-ui.ts";
import { emptyQuery, threeFileChange } from "../helpers/review-change.ts";

const COLUMNS = 140;
const INVERSE = "\x1b[7m";
const INVERSE_OFF = "\x1b[27m";
const query = {
	...emptyQuery,
	async changes(path: string): Promise<ChangePage> {
		return {
			path,
			status: "modified",
			kind: "text",
			hunks: hunks(diffLines("a\nx = a + b;\ny = 1;\n", "a\nx = a - b;\ny = 1;\nz = 2;\n"), 3),
			intraline: {},
			metadata: {},
			notes: [],
		};
	},
};

/**
 * The theme Pi has active. `initTheme` installs it where Pi's own drawing reads it, and where a real
 * Pi hands it to `ctx.ui.custom()`; Pi exports no getter for it.
 */
function activeTheme(): Theme {
	const active = (globalThis as Record<symbol, Theme | undefined>)[Symbol.for("@earendil-works/pi-coding-agent:theme")];
	assert.ok(active, "Pi has an active theme");
	return active;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("the review in Pi draws a change with renderDiff in the active theme", () => {
	it("paints the removed and added lines in the dark theme's diff colours, then the removed one in light's", async () => {
		initTheme("dark");
		const dark = activeTheme();
		const ui = new FakeCustomUi(new KeybindingsManager(TUI_KEYBINDINGS));
		void openReviewTui(ui.context(), { snapshot: threeFileChange(), ...query }, "en");
		const review = ui.component!;
		review.handleInput!("\x1b[B");
		const row = (lines: string[], text: string) => lines.find((l) => stripTerminalSequences(l).includes(text));
		let lines = review.render(COLUMNS);
		for (let i = 0; i < 200 && row(lines, "-2 x = a + b;") === undefined; i++) {
			await tick();
			lines = review.render(COLUMNS);
		}
		const removed = row(lines, "-2 x = a + b;");
		const added = row(lines, "+2 x = a - b;");
		assert.ok(removed !== undefined && added !== undefined, "the removed and the added lines are drawn");
		assert.ok(
			removed.includes(`${dark.getFgAnsi("toolDiffRemoved")}-2 x = a `),
			`removed in toolDiffRemoved: ${JSON.stringify(removed)}`,
		);
		assert.ok(
			added.includes(`${dark.getFgAnsi("toolDiffAdded")}+2 x = a `),
			`added in toolDiffAdded: ${JSON.stringify(added)}`,
		);
		assert.ok(
			removed.includes(`${INVERSE}+${INVERSE_OFF}`),
			`the operator removed is shown in inverse video: ${JSON.stringify(removed)}`,
		);
		assert.ok(
			added.includes(`${INVERSE}-${INVERSE_OFF}`),
			`the operator added is shown in inverse video: ${JSON.stringify(added)}`,
		);

		initTheme("light");
		const light = activeTheme();
		assert.notEqual(
			light.getFgAnsi("toolDiffRemoved"),
			dark.getFgAnsi("toolDiffRemoved"),
			"the two themes paint a removed line differently",
		);
		review.invalidate();
		const redrawn = row(review.render(COLUMNS), "-2 x = a + b;");
		assert.ok(
			redrawn?.includes(`${light.getFgAnsi("toolDiffRemoved")}-2 x = a `),
			`redrawn in the light theme's toolDiffRemoved: ${JSON.stringify(redrawn)}`,
		);
	});
});
