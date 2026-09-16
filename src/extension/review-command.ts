import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ChangePage, ContentPage, PathStatus, ReviewSnapshot } from "../application/review.ts";
import { ReviewSurface, type Styles } from "../presentation/tui/review-surface.ts";

type Review = { snapshot: ReviewSnapshot; changes(path: string, status: PathStatus, oldPath: string | null): Promise<ChangePage>; content(path: string, side: "old" | "new", start: number, limit: number): Promise<ContentPage> };

/** Opens the two-pane review with `ctx.ui.custom()` (no experimental overlay, ADR-010). Purely read-only. */
export async function openReviewTui(ctx: ExtensionCommandContext, review: Review, lang: "fr" | "en"): Promise<void> {
	await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
		const styles: Styles = { added: (s) => theme.fg("success", s), modified: (s) => theme.fg("warning", s), deleted: (s) => theme.fg("error", s), renamed: (s) => theme.fg("accent", s), intact: (s) => theme.fg("muted", s), selected: (s) => theme.bg("selectedBg", s), dim: (s) => theme.fg("dim", s), header: (s) => theme.bold(s), oldBlock: (s) => theme.fg("toolDiffRemoved", s), newBlock: (s) => theme.fg("toolDiffAdded", s), focus: (s) => theme.bold(s), warn: (s) => theme.fg("warning", s) };
		const surface = new ReviewSurface({ snapshot: review.snapshot, query: { changes: review.changes, content: review.content }, styles, rows: () => Math.max(10, (tui.terminal.rows ?? 24) - 2), onExit: () => done(), requestRender: () => tui.requestRender(), language: lang });
		return { render: (w) => surface.render(w), invalidate: () => surface.invalidate(), handleInput: (d) => surface.handleInput(d) };
	});
}
