/**
 * ProjectTreePane (§5.5): the tree of the change — virtualized to the visible height, filtered to
 * the changed paths or not, searchable, each directory carrying the aggregate of what it holds.
 *
 * It is the only pane that can move the selection, so it is also the one that keeps the selection
 * on screen: the scroll follows the selection rather than the other way round.
 */
import { flatten, neutralize, type PathStatus, type ReviewNode } from "../../../application/review.ts";
import { SYMBOL, type PaneContext, type Selection } from "./view.ts";

/** The rows the tree shows, in order: the filter and the search both apply here and nowhere else. */
export function visibleRows(ctx: PaneContext): { node: ReviewNode; depth: number }[] {
	const all = flatten(ctx.snapshot.root, ctx.view.changedOnly, [], 0, ctx.view.expanded);
	return ctx.view.search ? all.filter((r) => r.node.path.toLowerCase().includes(ctx.view.search.toLowerCase())) : all;
}

/** The node the selection sits on, or nothing when the tree shows no row. */
export function currentNode(ctx: PaneContext): Selection {
	return visibleRows(ctx)[ctx.view.selected]?.node ?? null;
}

/** Opens every directory on the way to a path and puts the selection on it. */
export function selectPath(ctx: PaneContext, path: string): void {
	const parts = path.split("/");
	for (let i = 1; i < parts.length; i++) ctx.view.expanded.add(parts.slice(0, i).join("/"));
	const idx = visibleRows(ctx).findIndex((r) => r.node.path === path);
	if (idx >= 0) {
		ctx.view.selected = idx;
		ctx.view.readerScroll = 0;
	}
}

/** Row indices of the files this change touched: what the file-to-file keys jump between. */
export function changedFiles(ctx: PaneContext): number[] {
	return visibleRows(ctx).map((r, i) => (r.node.kind !== "directory" && r.node.status !== "intact" ? i : -1)).filter((i) => i >= 0);
}

export function renderTree(ctx: PaneContext, width: number, height: number): { lines: string[]; width: number } {
	const view = ctx.view;
	const rows = visibleRows(ctx);
	if (view.selected >= rows.length) view.selected = Math.max(0, rows.length - 1);
	if (view.selected < view.treeScroll) view.treeScroll = view.selected;
	if (view.selected >= view.treeScroll + height) view.treeScroll = view.selected - height + 1;
	const lines: string[] = [];
	for (let i = view.treeScroll; i < Math.min(rows.length, view.treeScroll + height); i++) {
		const r = rows[i]!;
		const n = r.node;
		const marker = n.kind === "directory" ? (view.expanded.has(n.path) ? "▾ " : "▸ ") : "  ";
		const sym = n.kind === "directory" ? (n.status === "intact" ? " " : "*") : SYMBOL[n.status];
		const agg = n.kind === "directory" ? ctx.styles.dim(` ${Object.entries(n.aggregate).filter(([k]) => k !== "intact").map(([k, v]) => `${SYMBOL[k as PathStatus]}${v}`).join(" ")}`) : "";
		const text = `${"  ".repeat(r.depth)}${marker}${sym} ${neutralize(n.name)}${n.kind === "directory" ? "/" : ""}${n.old_path ? ctx.styles.dim(` ← ${neutralize(n.old_path)}`) : ""}${agg}`;
		const colored = n.kind === "directory" ? text : color(ctx, n.status, text);
		const line = ctx.fit(colored, width);
		lines.push(i === view.selected ? (view.focus === "tree" ? ctx.styles.selected(ctx.styles.focus(line)) : ctx.styles.selected(line)) : line);
	}
	while (lines.length < height) lines.push(ctx.fit("", width));
	if (rows.length === 0) lines[0] = ctx.fit(ctx.styles.dim("(vide)"), width);
	return { lines, width };
}

function color(ctx: PaneContext, status: PathStatus, text: string): string {
	switch (status) {
		case "added":
			return ctx.styles.added(text);
		case "modified":
			return ctx.styles.modified(text);
		case "deleted":
			return ctx.styles.deleted(text);
		case "renamed":
		case "renamed?":
			return ctx.styles.renamed(text);
		default:
			return ctx.styles.intact(text);
	}
}
