/**
 * The body of the change view, drawn by `pix-pretty`.
 *
 * The comparison is shown as a gutter — line numbers, a sign column and a rule, then the code on a
 * tinted row — with the word that changed inside a line picked out, and the file's language
 * coloured. What the gutter carries is chrome: it sits left of the separator, so a `+` or a `-` that
 * belongs to the program stays a character of the program, and the sign, the numbers and the rule
 * distinguish old from new without asking the reader to see a colour.
 *
 * Every line handed to the renderer is neutralized first (UX-10): the package colours what it is
 * given and would pass an escape sequence held in a reviewed file straight to the terminal.
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

/** A rendered change, and where each of its hunks starts in the lines. */
export interface RenderedDiff {
	lines: string[];
	starts: number[];
	/** Why nothing was drawn, when the renderer could not be reached or failed on this change. */
	error?: string;
}

type DiffModule = typeof import("@xynogen/pix-pretty/diff");
type DiffRenderModule = typeof import("@xynogen/pix-pretty/diff-render");
type LangModule = typeof import("@xynogen/pix-pretty/lang");

const jiti = createJiti(import.meta.url);

let modules: Promise<{ diff: DiffModule; render: DiffRenderModule; lang: LangModule }> | null = null;

/** Loaded once, on the first change a reader opens: nothing else in the surface needs the package. */
function load(): Promise<{ diff: DiffModule; render: DiffRenderModule; lang: LangModule }> {
	modules ??= (async () => ({
		diff: await jiti.import<DiffModule>("@xynogen/pix-pretty/diff"),
		render: await jiti.import<DiffRenderModule>("@xynogen/pix-pretty/diff-render"),
		lang: await jiti.import<LangModule>("@xynogen/pix-pretty/lang"),
	}))();
	return modules;
}

/**
 * Renders one hunk's two sides. The segments already carry the hunk's own context, so the renderer
 * is handed the two texts and re-pairs them; folding asks it for no context at all rather than
 * hiding lines after the fact.
 */
function sides(hunk: ChangePage["hunks"][number]): { old: string; new: string } {
	const old: string[] = [];
	const fresh: string[] = [];
	for (const segment of hunk.segments) {
		const lines = segment.lines.map(neutralize);
		if (segment.kind === "unchanged") {
			old.push(...lines);
			fresh.push(...lines);
		} else if (segment.kind === "old") old.push(...lines);
		else fresh.push(...lines);
	}
	return { old: old.join("\n"), new: fresh.join("\n") };
}

export async function renderHunks(page: ChangePage, fold: boolean): Promise<RenderedDiff> {
	const { diff, render, lang } = await load();
	const language = lang.lang(page.path);
	const lines: string[] = [];
	const starts: number[] = [];
	for (const hunk of page.hunks) {
		starts.push(lines.length);
		const both = sides(hunk);
		const parsed = diff.parseDiff(both.old, both.new, fold ? 0 : 3, hunk.old_start);
		const drawn = await render.renderUnified(parsed, language);
		if (drawn !== "") lines.push(...drawn.split("\n"));
	}
	return { lines, starts };
}
