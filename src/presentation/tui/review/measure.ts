/**
 * What a line occupies once a theme has styled it, and how a line is cut to an announced width.
 * Every pane of the surface measures through here: a pane that counted escape sequences as
 * characters would pad its lines short and move the separator between the panes on every row.
 */

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

/**
 * Columns a line actually occupies once a theme has styled it. The escape sequences a style wraps
 * around a value are not printed: counting them as characters pads the line short by their length,
 * and the separator between the two panes then lands at a different column on every row — ten
 * columns of drift for a single colour, which no test on unstyled lines can see (UX-08).
 */
export function visibleLength(s: string): number {
	let count = 0;
	for (let i = 0; i < s.length; i++) {
		const skipped = sequenceLength(s, i);
		if (skipped > 0) {
			i += skipped - 1;
			continue;
		}
		if (s.codePointAt(i)! > 0xffff) i++;
		count++;
	}
	return count;
}

/** Length of the terminal sequence starting at `i`, or 0 when nothing starts there. */
function sequenceLength(s: string, i: number): number {
	if (s.charCodeAt(i) !== 0x1b) return 0;
	const next = s[i + 1];
	if (next === "[") {
		let j = i + 2;
		while (j < s.length && (s.charCodeAt(j) < 0x40 || s.charCodeAt(j) > 0x7e)) j++;
		return Math.min(j + 1, s.length) - i;
	}
	if (next === "]") {
		let j = i + 2;
		while (j < s.length && s.charCodeAt(j) !== 0x07 && !(s.charCodeAt(j) === 0x1b && s[j + 1] === "\\")) j++;
		return Math.min(j + (s.charCodeAt(j) === 0x1b ? 2 : 1), s.length) - i;
	}
	return 1;
}

/** The same line stripped of every terminal sequence: what is left is exactly what is printed. */
export function stripSequences(s: string): string {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const skipped = sequenceLength(s, i);
		if (skipped > 0) {
			i += skipped - 1;
			continue;
		}
		out += s[i];
	}
	return out;
}

/**
 * Pads or cuts a line to an announced width. Cutting inside an escape sequence would leak it to the
 * terminal, so a line that must be cut is cut on its visible text and loses the styling that
 * straddled the cut. What this measures is code points, not terminal cells: a host that knows its
 * own terminal — graphemes, east-asian widths, hyperlinks — injects its measure through
 * `SurfaceOptions.fit`, and `extension/review-command.ts` passes the one Pi uses for every other
 * surface. The invariant itself stays here, so it holds whatever the host injects.
 */
export function fit(s: string, width: number): string {
	const visible = visibleLength(s);
	if (visible <= width) return s + " ".repeat(width - visible);
	const chars = [...stripSequences(s)];
	if (width <= 1) return chars.slice(0, width).join("");
	return `${chars.slice(0, width - 1).join("")}…`;
}
