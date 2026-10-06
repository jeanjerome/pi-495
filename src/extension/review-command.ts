import { type ExtensionCommandContext, renderDiff } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { ReviewQuery, ReviewSnapshot } from "../application/review.ts";
import { ReviewSurface, type Styles } from "../presentation/tui/review-surface.ts";

type Review = ReviewQuery & { snapshot: ReviewSnapshot };

/**
 * The rows Pi's fullscreen layout keeps around the component `ctx.ui.custom()` mounts in place of its
 * editor: one line of conversation at least, the spacer above the editor, and the footer's two lines
 * plus the line of extension statuses, which 495's own status fills (pi-coding-agent 1.0.4,
 * `chat-viewport.js`, `renderWidgetContainer`, `footer.js`). Pi reports no height for that component,
 * and `pi-tui` keeps only the first lines of one taller than its place, so the help line, the last,
 * would never reach the terminal.
 */
const FULLSCREEN_RESERVE = 5;

/** Opens the two-pane review with `ctx.ui.custom()` (no experimental overlay, ADR-010). Purely read-only. */
export async function openReviewTui(ctx: ExtensionCommandContext, review: Review, lang: "fr" | "en"): Promise<void> {
	await ctx.ui.custom<void>((tui, theme, keybindings, done) => {
		const styles: Styles = {
			added: (s) => theme.fg("success", s),
			modified: (s) => theme.fg("warning", s),
			deleted: (s) => theme.fg("error", s),
			renamed: (s) => theme.fg("accent", s),
			intact: (s) => theme.fg("muted", s),
			selected: (s) => theme.bg("selectedBg", s),
			dim: (s) => theme.fg("dim", s),
			header: (s) => theme.bold(s),
			focus: (s) => theme.bold(s),
			warn: (s) => theme.fg("warning", s),
		};
		// The columns a styled line occupies are the host's business, not the view's: Pi measures its
		// own surfaces with graphemes, east-asian widths and hyperlinks in mind, and the review is
		// measured the same way rather than by a second implementation that would drift from it.
		const surface = new ReviewSurface({
			snapshot: review.snapshot,
			query: { changes: review.changes, content: review.content },
			styles,
			fit: (text, width) => truncateToWidth(text, width, "…", true),
			rows: () => Math.max(10, (tui.terminal.rows ?? 24) - (tui.mode === "fullscreen" ? FULLSCREEN_RESERVE : 2)),
			onExit: () => done(),
			requestRender: () => tui.requestRender(),
			language: lang,
			// The review answers to the keys the user set in Pi, and its help names them from the manager
			// Pi hands over. Pi's `keyText` reads the global manager of the copy of Pi this module resolves,
			// which is that manager only in a managed install (`npm install --omit=peer`): loaded from a
			// folder whose `node_modules` carries its own Pi, it would name the default keys.
			keybindings,
			keyText: (action) => keybindings.getKeys(action).map(writeKey).join("/"),
			// A change is drawn the way Pi draws its edit tool's, in the theme Pi has active (`D-82`).
			renderDiff,
		});
		return {
			render: (w) => surface.render(w),
			invalidate: () => surface.invalidate(),
			handleInput: (d) => surface.handleInput(d),
		};
	});
}

/**
 * A key as Pi's help writes it: `alt` reads `option` on macOS. Mirrors `formatKeyText` of
 * pi-coding-agent 1.0.4 (`keybinding-hints.js`), which Pi does not export.
 */
function writeKey(key: string): string {
	return key
		.split("+")
		.map((part) => (process.platform === "darwin" && part.toLowerCase() === "alt" ? "option" : part))
		.join("+");
}
