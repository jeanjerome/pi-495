/**
 * In Pi's fullscreen mode, its default, the review `/495 review` opens in place of Pi's editor, below
 * the conversation and above the footer: its header and its help line both reach the terminal.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
	Container,
	KeybindingsManager,
	ScrollView,
	Spacer,
	TUI_KEYBINDINGS,
	Text,
	TuiAltScreen,
	TuiMainScreen,
	VStack,
} from "@earendil-works/pi-tui";
import { openReviewTui } from "../../src/extension/review-command.ts";
import { FakeCustomUi } from "../helpers/fake-custom-ui.ts";
import { FakeTerminal } from "../helpers/fake-terminal.ts";
import { emptyQuery, threeFileChange } from "../helpers/review-change.ts";

const HELP =
	"↑↓ move  ⏎ open  tab focus  c filter  m mode  n/p file  ]/[ change  x context  +/- width  / search  q back";
const COLUMNS = 160;

/** What a terminal of `rows` lines receives once the review opens in a screen laid out as Pi's. */
function reviewInFullscreen(rows: number): { received: string; header: string } {
	const conversation = new Container();
	for (let i = 0; i < 60; i++) conversation.addChild(new Text(`conversation ${i}`, 0, 0));
	const editor = new Container();
	const footer = new Container();
	footer.addChild(new Text("~/project (main)", 0, 0));
	footer.addChild(new Text("↑12k ↓3k $0.010", 0, 0));
	// The line of extension statuses `footer.js` adds once a status is set, which 495 sets from
	// `session_start` on, so a real Pi with 495 loaded always shows it.
	footer.addChild(new Text("495 —", 0, 0));
	// The layout of `chat-viewport.js` in pi-coding-agent 1.0.4: the conversation keeps one line at
	// least, the spacer Pi puts above its editor when no widget is set, the editor, the footer.
	const root = new VStack([
		{
			component: new ScrollView(conversation, { follow: "end", primary: true }),
			basis: 0,
			grow: 1,
			shrink: 1,
			minSize: 1,
		},
		{
			component: new VStack([
				{ component: new Spacer(1), shrink: 1, minSize: 0 },
				{ component: editor, shrink: 1, minSize: 3 },
				{ component: footer, shrink: 1, minSize: 0 },
			]),
			basis: "auto",
			grow: 0,
			shrink: 1,
			minSize: 1,
		},
	]);
	const terminal = new FakeTerminal(COLUMNS, rows);
	const tui = new TuiAltScreen(terminal);
	tui.setLayoutRoot(root);
	tui.start();
	try {
		const ui = new FakeCustomUi(new KeybindingsManager(TUI_KEYBINDINGS), {
			tui,
			mount: (component) => editor.addChild(component),
		});
		void openReviewTui(ui.context(), { snapshot: threeFileChange(), ...emptyQuery }, "en");
		tui.renderNow();
		const header = ui.component!.render(COLUMNS)[0]!.trimEnd();
		return { received: terminal.text(), header };
	} finally {
		tui.stop();
	}
}

describe("the review in Pi's fullscreen and regular modes", () => {
	for (const rows of [30, 24, 50]) {
		it(`sends its header and its help line to a terminal of ${rows} rows`, () => {
			const { received, header } = reviewInFullscreen(rows);
			assert.ok(received.includes(header), `the terminal receives the first line of the review: ${header}`);
			assert.ok(received.includes(HELP), "the terminal receives the help line, from ↑↓ move to q back");
		});
	}

	it("keeps the height of the terminal less two rows in Pi's regular mode", () => {
		const tui = new TuiMainScreen(new FakeTerminal(COLUMNS, 30));
		const ui = new FakeCustomUi(new KeybindingsManager(TUI_KEYBINDINGS), {
			tui,
			mount: (component) => tui.addChild(component),
		});
		void openReviewTui(ui.context(), { snapshot: threeFileChange(), ...emptyQuery }, "en");
		assert.equal(ui.component!.render(COLUMNS).length, 28);
	});
});
