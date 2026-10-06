/**
 * The help of the review `/495 review` opens in Pi's terminal names the keys of the manager Pi hands
 * to `ctx.ui.custom()`, even when 495 resolves its own copy of Pi, whose global manager keeps the keys
 * `pi-tui` ships.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { keyText } from "@earendil-works/pi-coding-agent";
import { getKeybindings, KeybindingsManager, setKeybindings, TUI_KEYBINDINGS } from "@earendil-works/pi-tui";
import { openReviewTui } from "../../src/extension/review-command.ts";
import { FakeCustomUi } from "../helpers/fake-custom-ui.ts";
import { emptyQuery, threeFileChange } from "../helpers/review-change.ts";

describe("the review help names the keys of the manager Pi hands it", () => {
	it("names k, j and space while the global manager of pi-tui keeps the default keys", () => {
		const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, {
			"tui.select.up": "k",
			"tui.select.down": "j",
			"tui.select.confirm": "space",
		});
		assert.notEqual(getKeybindings(), keybindings);
		assert.deepEqual(
			getKeybindings().getKeys("tui.select.down"),
			["down"],
			"the global manager keeps the default keys",
		);
		const ui = new FakeCustomUi(keybindings);
		void openReviewTui(ui.context(), { snapshot: threeFileChange(), ...emptyQuery }, "en");
		const review = ui.component!;
		const help = review.render(200).at(-1)!;
		assert.ok(help.startsWith("k/j move  space open  tab focus"), help);
		review.handleInput!("j");
		assert.match(review.render(200).join("\n"), /Changes — src\/a\.js/, "j passes the selection to the next path");
	});

	it("writes a key as Pi's own help writes it", () => {
		const keybindings = new KeybindingsManager(TUI_KEYBINDINGS, { "tui.select.down": "alt+j" });
		const ui = new FakeCustomUi(keybindings);
		void openReviewTui(ui.context(), { snapshot: threeFileChange(), ...emptyQuery }, "en");
		const help = ui.component!.render(200).at(-1)!;
		const previous = getKeybindings();
		setKeybindings(keybindings);
		try {
			assert.ok(help.startsWith(`↑/${keyText("tui.select.down")} move`), help);
		} finally {
			setKeybindings(previous);
		}
	});
});
