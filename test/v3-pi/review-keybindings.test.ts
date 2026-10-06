/**
 * The review `/495 review` opens in Pi's terminal answers to the keybindings manager Pi hands to
 * `ctx.ui.custom()`, and its help names the keys that manager holds.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { getKeybindings, KeybindingsManager, setKeybindings, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { openReviewTui } from "../../src/extension/review-command.ts";
import { FakeCustomUi } from "../helpers/fake-custom-ui.ts";
import { emptyQuery, threeFileChange } from "../helpers/review-change.ts";

describe("the review opened in Pi reads the user's keybindings", () => {
	it("moves the selection on the key Pi gives tui.select.down, and names it in the help", () => {
		const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.down": "j" });
		// Pi installs the manager it hands to `ctx.ui.custom()` as the one its own help reads.
		const previous = getKeybindings();
		setKeybindings(keybindings);
		try {
			const ui = new FakeCustomUi(keybindings);
			void openReviewTui(ui.context(), { snapshot: threeFileChange(), ...emptyQuery }, "en");
			const review = ui.component!;
			assert.doesNotMatch(review.render(200).join("\n"), /Changes — src\/a\.js/);
			review.handleInput!("j");
			assert.match(review.render(200).join("\n"), /Changes — src\/a\.js/, "j passes the selection to the next path");
			const help = review.render(200).at(-1)!;
			assert.ok(help.startsWith("↑/j move"), help);
			review.handleInput!("q");
			assert.equal(ui.closed, true);
		} finally {
			setKeybindings(previous);
		}
	});
});
