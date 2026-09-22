/**
 * The body of the change view, drawn by `pix-pretty`.
 *
 * The comparison is shown as a gutter — line numbers, a sign column and a rule, then the code on a
 * tinted row — with the word that changed inside a line picked out, and the file's language
 * coloured. What the gutter carries is chrome: it sits left of the separator, so a `+` or a `-` that
 * belongs to the program stays a character of the program, and the sign, the numbers and the rule
 * distinguish old from new without asking the reader to see a colour.
 *
 * **The comparison drawn is the one 495 computed.** The package can compare two texts itself, and
 * handing it the two sides was the obvious way to call it — but its pairing is its own, and on a
 * line unchanged between two changed ones it answered "removed, then added again". The rows are
 * therefore built here from the segments `D-06` produced: the package places and paints them, and
 * decides nothing about what changed. A drawing that could disagree with the record would be a
 * second opinion wearing the first one's clothes.
 *
 * Every line handed over is neutralized first (UX-10): the package colours what it is given and
 * would pass an escape sequence held in a reviewed file straight to the terminal.
 *
 * The package renders at the width it reads from the terminal itself and takes no width from its
 * caller, which is why the change view is given the whole screen. It also publishes TypeScript
 * sources rather than a build, so the declarations the compiler reads are ours, under
 * `types/pix-pretty/`, and the loading is done by `jiti` rather than by the runtime: Node refuses to
 * strip types from a file under `node_modules`, and nothing guarantees a host has installed a
 * loader that would. Asking for one here is what makes the change draw under Pi, under `node --test`
 * and under any other host, rather than only where a global hook happens to be registered.
 */
import { createJiti } from "jiti";
import { type ChangePage, neutralize } from "../../../application/review.ts";
import type { DiffLine, ParsedDiff } from "@xynogen/pix-pretty/diff";

/** A rendered change, and where each of its hunks starts in the lines. */
export interface RenderedDiff {
	lines: string[];
	starts: number[];
	/** Why nothing was drawn, when the renderer could not be reached or failed on this change. */
	error?: string;
}

type DiffRenderModule = typeof import("@xynogen/pix-pretty/diff-render");
type LangModule = typeof import("@xynogen/pix-pretty/lang");

const jiti = createJiti(import.meta.url);

let modules: Promise<{ render: DiffRenderModule; lang: LangModule }> | null = null;

/** Loaded once, on the first change a reader opens: nothing else in the surface needs the package. */
function load(): Promise<{ render: DiffRenderModule; lang: LangModule }> {
	modules ??= (async () => ({
		render: await jiti.import<DiffRenderModule>("@xynogen/pix-pretty/diff-render"),
		lang: await jiti.import<LangModule>("@xynogen/pix-pretty/lang"),
	}))();
	return modules;
}

/**
 * One hunk's rows, in the shape the renderer places. Folding drops the unchanged rows here rather
 * than asking the renderer for less context: what is hidden is then exactly what the record calls
 * unchanged, and its count is exact.
 */
function rows(hunk: ChangePage["hunks"][number], fold: boolean): { diff: ParsedDiff; hidden: number } {
	const lines: DiffLine[] = [];
	let added = 0;
	let removed = 0;
	let hidden = 0;
	for (const segment of hunk.segments) {
		if (segment.kind === "unchanged") {
			if (fold) {
				hidden += segment.lines.length;
				continue;
			}
			for (const [i, line] of segment.lines.entries())
				lines.push({
					type: "ctx",
					oldNum: segment.old_start + i,
					newNum: segment.new_start + i,
					content: neutralize(line),
				});
		} else if (segment.kind === "old") {
			removed += segment.lines.length;
			for (const [i, line] of segment.lines.entries())
				lines.push({ type: "del", oldNum: segment.old_start + i, newNum: null, content: neutralize(line) });
		} else {
			added += segment.lines.length;
			for (const [i, line] of segment.lines.entries())
				lines.push({ type: "add", oldNum: null, newNum: segment.new_start + i, content: neutralize(line) });
		}
	}
	const chars = lines.reduce((n, line) => n + line.content.length, 0);
	return { diff: { lines, added, removed, chars }, hidden };
}

/**
 * `note` says how many unchanged lines a fold hides. A fold that hid them silently would leave the
 * reader unable to tell a short change from a change shown short (UX-07).
 */
export async function renderHunks(
	page: ChangePage,
	fold: boolean,
	note: (hidden: number) => string,
): Promise<RenderedDiff> {
	const { render, lang } = await load();
	const language = lang.lang(page.path);
	const lines: string[] = [];
	const starts: number[] = [];
	for (const hunk of page.hunks) {
		starts.push(lines.length);
		const { diff, hidden } = rows(hunk, fold);
		if (hidden > 0) lines.push(note(hidden));
		const drawn = await render.renderUnified(diff, language);
		if (drawn !== "") lines.push(...drawn.split("\n"));
	}
	return { lines, starts };
}
