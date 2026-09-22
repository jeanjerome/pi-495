/**
 * ReviewKeymap (§5.5): navigation, focus, mode change and the way back to the conversation.
 *
 * It decides nothing about what is shown — it moves the view, and the panes render what the view
 * says. Every review operation the specification names has a key here, and the help line names
 * every one of them: an action that does not fit the width is shown in its compact form rather
 * than dropped from the end of the line (`specification-fonctionnelle.md` §16).
 */
import { parseKey } from "@earendil-works/pi-tui";
import { visibleLength } from "./measure.ts";
import { hunkStarts } from "./reader-pane.ts";
import { changedFiles, currentNode, selectPath, visibleRows } from "./tree-pane.ts";
import { MODES, type PaneContext } from "./view.ts";

/** What a key press may ask of the surface itself, beyond moving the view. */
export interface KeymapActions {
	/** Leaves the review and gives the terminal back to the conversation. */
	exit(): void;
	/** Reloads the surface on the newer candidate the header announces. */
	refresh(): void;
}

/**
 * The name Pi gives a key press. Pi decodes its own terminal — arrows, page keys, home and end,
 * delete, and the modified forms a terminal sends for ctrl and shift — so the review answers to the
 * same presses as every other surface Pi draws. What Pi does not name is passed through unchanged:
 * a printable character types itself into the search, and a bracketed paste or a terminal's reply
 * falls to the default and moves nothing.
 */
export function decodeKey(data: string): string {
	return parseKey(data) ?? data;
}

/** Applies one key press to the view. Returns whether anything moved and must be drawn again. */
export function handleKey(ctx: PaneContext, data: string, actions: KeymapActions): boolean {
	const view = ctx.view;
	const key = decodeKey(data);
	if (view.searching) {
		if (key === "escape") {
			view.searching = false;
			view.search = "";
		} else if (key === "enter") view.searching = false;
		else if (key === "backspace") view.search = view.search.slice(0, -1);
		else if (data.length === 1 && data >= " ") view.search += data;
		view.selected = Math.min(view.selected, Math.max(0, visibleRows(ctx).length - 1));
		return true;
	}
	const rows = visibleRows(ctx);
	const node = currentNode(ctx);
	switch (key) {
		case "q":
		case "escape":
			actions.exit();
			return false;
		case "tab":
			view.focus = view.focus === "tree" ? "reader" : "tree";
			view.narrowPane = view.focus;
			break;
		case "up":
			if (view.focus === "tree") {
				view.selected = Math.max(0, view.selected - 1);
				view.readerScroll = 0;
			} else view.readerScroll = Math.max(0, view.readerScroll - 1);
			break;
		case "down":
			if (view.focus === "tree") {
				view.selected = Math.min(rows.length - 1, view.selected + 1);
				view.readerScroll = 0;
			} else view.readerScroll++;
			break;
		case "pageUp":
			view.readerScroll = Math.max(0, view.readerScroll - 20);
			break;
		case "pageDown":
			view.readerScroll += 20;
			break;
		case "enter":
		case "right":
			if (node?.kind === "directory") {
				if (view.expanded.has(node.path)) view.expanded.delete(node.path);
				else view.expanded.add(node.path);
			} else if (key === "enter") {
				view.focus = "reader";
				view.narrowPane = "reader";
			}
			break;
		case "left":
			if (node?.kind === "directory" && view.expanded.has(node.path)) view.expanded.delete(node.path);
			else if (node) {
				const parent = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : "";
				if (parent) selectPath(ctx, parent);
			}
			break;
		case "c":
			view.changedOnly = !view.changedOnly;
			view.selected = Math.min(view.selected, Math.max(0, visibleRows(ctx).length - 1));
			break;
		case "m":
			view.mode = MODES[(MODES.indexOf(view.mode) + 1) % MODES.length]!;
			view.readerScroll = 0;
			break;
		case "n": {
			const next = changedFiles(ctx).find((i) => i > view.selected);
			if (next !== undefined) {
				view.selected = next;
				view.readerScroll = 0;
			}
			break;
		}
		case "p": {
			const prev = changedFiles(ctx)
				.reverse()
				.find((i) => i < view.selected);
			if (prev !== undefined) {
				view.selected = prev;
				view.readerScroll = 0;
			}
			break;
		}
		case "]":
		case "[": {
			const page = node ? ctx.pages.get(`changes:${node.path}`) : undefined;
			if (page && "hunks" in page) {
				const starts = hunkStarts(ctx, page);
				const target =
					key === "]"
						? starts.find((s) => s > view.readerScroll)
						: [...starts].reverse().find((s) => s < view.readerScroll);
				if (target !== undefined) view.readerScroll = target;
			}
			break;
		}
		case "x":
			view.foldContext = !view.foldContext;
			break;
		case "+":
			view.split = Math.min(0.7, view.split + 0.05);
			break;
		case "-":
			view.split = Math.max(0.2, view.split - 0.05);
			break;
		case "/":
			view.searching = true;
			view.search = "";
			break;
		case "r":
			if (ctx.snapshot.newer_candidate) actions.refresh();
			break;
		default:
			return false;
	}
	return true;
}

/**
 * The key help. The labelled form is 123 columns wide, so any terminal narrower than that would
 * have actions cut off its end. The compact form names the same keys without their labels: it is
 * used whenever the labelled one does not fit, rather than letting the display drop the last
 * actions.
 */
export function renderKeyHelp(ctx: PaneContext, width: number, narrow: boolean): string {
	const L = ctx.labels;
	const prefix = ctx.view.searching ? `/${ctx.view.search}▏ ` : "";
	const pane = narrow ? ` [${ctx.view.narrowPane === "tree" ? L.tree : L.reader}]` : "";
	const labelled = `${prefix}${L.help}${pane}`;
	return ctx.styles.dim(ctx.fit(visibleLength(labelled) <= width ? labelled : `${prefix}${L.helpKeys}${pane}`, width));
}
