/**
 * The body of the change view, in the form Pi's edit tool gives its own changes.
 *
 * Each line carries its sign and its number before the code — `-` and the old number for a removed
 * line, `+` and the new number for an added one, a space and the old number for an unchanged one —
 * with the numbers aligned on the widest of the page. That is the text Pi's `renderDiff` reads, and
 * the host's drawing is handed it as is: it paints removed and added lines in the active theme and
 * picks out the words changed in a line replaced by another (`D-82`). The sign and the number lead
 * the line, so a `+` or a `-` that belongs to the program stays a character of the program, and old
 * and new stay distinct without asking the reader to see a colour.
 *
 * **The comparison drawn is the one 495 computed.** The text is built here from the segments `D-06`
 * produced, already classed removed, added or unchanged: the drawing paints them and decides nothing
 * about what changed. A drawing that could disagree with the record would be a second opinion
 * wearing the first one's clothes.
 *
 * Every line handed over is neutralized first (UX-10): the drawing colours what it is given and
 * would pass an escape sequence held in a reviewed file straight to the terminal.
 */
import { type ChangePage, neutralize } from "../../../application/review.ts";

/** A rendered change, and where each of its hunks starts in the lines. */
export interface RenderedDiff {
	lines: string[];
	starts: number[];
}

/** How the host draws a comparison: the text of `renderDiff` in, its lines coloured and joined by `\n` out. */
export type DrawDiff = (diffText: string) => string;

type Hunk = ChangePage["hunks"][number];
type Segment = Hunk["segments"][number];

/** The number a segment's first line is shown with: the new one for an added line, the old one otherwise. */
function firstNumber(segment: Segment): number {
	return segment.kind === "new" ? segment.new_start : segment.old_start;
}

/** The digits of the widest line number the page shows: every number is aligned on it, as Pi aligns its own. */
function numberDigits(page: ChangePage): number {
	let widest = 0;
	for (const hunk of page.hunks)
		for (const segment of hunk.segments) widest = Math.max(widest, firstNumber(segment) + segment.lines.length - 1);
	return String(widest).length;
}

/**
 * One hunk's lines, in the text the drawing reads. Folding drops the unchanged lines here: what is
 * hidden is then exactly what the record calls unchanged, and its count is exact.
 */
function hunkText(hunk: Hunk, fold: boolean, digits: number): { lines: string[]; hidden: number } {
	const lines: string[] = [];
	let hidden = 0;
	for (const segment of hunk.segments) {
		if (segment.kind === "unchanged" && fold) {
			hidden += segment.lines.length;
			continue;
		}
		const sign = segment.kind === "old" ? "-" : segment.kind === "new" ? "+" : " ";
		const start = firstNumber(segment);
		for (const [i, line] of segment.lines.entries())
			lines.push(`${sign}${String(start + i).padStart(digits, " ")} ${neutralize(line)}`);
	}
	return { lines, hidden };
}

/**
 * `note` says how many unchanged lines a fold hides, and `skip` how many lines of the old file lie
 * between two portions. A fold or a gap passed over silently would leave the reader unable to tell a
 * short change from a change shown short, or two distant lines from two that follow (UX-07), as Pi's
 * edit tool marks its own gaps. Both are lines of 495, not of the comparison, so they are not handed
 * to the drawing. The skip goes before the portion's start, so the change-to-change keys still land
 * on the portion.
 */
export function renderHunks(
	page: ChangePage,
	fold: boolean,
	note: (hidden: number) => string,
	skip: (skipped: number) => string,
	draw: DrawDiff,
): RenderedDiff {
	const digits = numberDigits(page);
	const lines: string[] = [];
	const starts: number[] = [];
	let previous: Hunk | undefined;
	for (const hunk of page.hunks) {
		const skipped = previous ? hunk.old_start - (previous.old_start + previous.old_count) : 0;
		if (skipped > 0) lines.push(skip(skipped));
		previous = hunk;
		starts.push(lines.length);
		const { lines: rows, hidden } = hunkText(hunk, fold, digits);
		if (hidden > 0) lines.push(note(hidden));
		if (rows.length > 0) lines.push(...draw(rows.join("\n")).split("\n"));
	}
	return { lines, starts };
}
