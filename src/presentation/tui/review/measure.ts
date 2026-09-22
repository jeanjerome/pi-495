/**
 * What a line occupies once a theme has styled it, and how a line is cut to an announced width.
 * Every pane of the surface measures through here: a pane that counted escape sequences as
 * characters would pad its lines short and move the separator between the panes on every row.
 *
 * The measure is Pi's. A terminal cell is not a code point — an east-asian glyph takes two, a
 * combining mark takes none, and a joined emoji takes two however many code points it holds — so a
 * second implementation here would disagree with the host on exactly the lines that matter and
 * shift the separator it exists to hold. `pi-tui` is Pi's display library, and the review is
 * measured the same way as every other surface Pi draws.
 */

import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Columns a tree row spends before the name: two per level, then the marker, the symbol and a space. */
export function treeRowOverhead(depth: number): number {
	return 2 * depth + 4;
}

/**
 * Width below which the two panes become two alternating views (SA-025).
 *
 * Criterion: the two-pane layout is kept only while the tree column can show the name of a changed
 * path, at its depth, without the layout cutting it — a cut name makes two files indistinguishable,
 * and navigating the tree is the one thing the reader pane cannot do. On the corpus of
 * `test/fixtures/review-corpus.ts`, the deepest changed path sits at depth 3 and the 95th
 * percentile name is 26 characters, so the tree needs `2*3 + 4 + 26 = 36` columns; with the 0.4
 * split that takes 93. Rounded up to the next ten, 100 columns, which leaves the reader 60 — above
 * the median line of the same corpus.
 */
export const NARROW_THRESHOLD = 100;

/** Cells a line occupies once a theme has styled it: what is printed, not what is stored. */
export function visibleLength(s: string): number {
	return visibleWidth(s);
}

/** The same line stripped of every terminal sequence: what is left is exactly what is printed. */
export function stripSequences(s: string): string {
	return stripTerminalSequences(s);
}

/**
 * Pads or cuts a line to an announced width. A line that must be cut loses the styling that
 * straddled the cut rather than leaking a half-written escape sequence to the terminal.
 */
export function fit(s: string, width: number): string {
	return truncateToWidth(s, width, "…", true);
}
