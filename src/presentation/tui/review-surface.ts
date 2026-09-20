/**
 * ReviewSurface (§5.5): the layout of the review, and nothing of what it shows.
 *
 * It holds the view state, loads the pages the reader is about to need, places the five components
 * the design declares — `ReviewHeader`, `ProjectTreePane`, `FileReaderPane`, `ReviewContextPane`
 * and `ReviewKeymap`, one module each under `review/` — and decides where they sit. Below
 * `narrowThreshold` columns the two panes become two alternating views driven by the same
 * selection, and no action disappears.
 *
 * It receives an immutable `ReviewSnapshot` and a read-only query; it never touches the workspace.
 */
import { CONTENT_PAGE_LINES, flatten, type ReviewNode, type ReviewSnapshot } from "../../application/review.ts";
import { renderHeader } from "./review/header.ts";
import { handleKey, renderKeyHelp } from "./review/keymap.ts";
import { NARROW_THRESHOLD, fit } from "./review/measure.ts";
import { renderReader } from "./review/reader-pane.ts";
import { renderContext } from "./review/context-pane.ts";
import { changedFiles, currentNode, renderTree, selectPath, visibleRows } from "./review/tree-pane.ts";
import { EN, FR, PLAIN, type LoadedPage, type PaneContext, type ReaderMode, type ReviewQuery, type ReviewView, type Styles } from "./review/view.ts";

export { decodeKey } from "./review/keymap.ts";
export { NARROW_THRESHOLD, fit, stripSequences, treeRowOverhead, visibleLength } from "./review/measure.ts";
export { PLAIN, type ReaderMode, type ReviewQuery, type Styles } from "./review/view.ts";

export interface SurfaceOptions {
	snapshot: ReviewSnapshot;
	query: ReviewQuery;
	styles?: Styles;
	rows: () => number;
	narrowThreshold?: number;
	onExit: () => void;
	onRefresh?: () => void;
	requestRender: () => void;
	initialPath?: string | null;
	language?: "fr" | "en";
	/** How the host measures and pads a styled line; defaults to `fit`. */
	fit?: (text: string, width: number) => string;
}

export class ReviewSurface implements ReviewView {
	readonly snapshot: ReviewSnapshot;
	private readonly query: ReviewQuery;
	private readonly st: Styles;
	private readonly fitLine: (text: string, width: number) => string;
	private readonly opts: SurfaceOptions;
	expanded = new Set<string>();
	changedOnly = true;
	focus: "tree" | "reader" = "tree";
	selected = 0;
	treeScroll = 0;
	readerScroll = 0;
	mode: ReaderMode = "changes";
	split = 0.4;
	foldContext = false;
	narrowPane: "tree" | "reader" = "tree";
	search = "";
	searching = false;
	private cache = new Map<string, LoadedPage>();
	private loading: string | null = null;
	private cachedLines: string[] | null = null;
	private cachedWidth = -1;

	constructor(options: SurfaceOptions) {
		this.snapshot = options.snapshot;
		this.query = options.query;
		this.st = options.styles ?? PLAIN;
		this.fitLine = options.fit ?? fit;
		this.opts = options;
		for (const row of flatten(this.snapshot.root, false)) if (row.node.kind === "directory") this.expanded.add(row.node.path);
		if (options.initialPath) this.selectPath(options.initialPath);
	}

	/** What a pane is allowed to see of this surface. */
	private pane(): PaneContext {
		return { snapshot: this.snapshot, view: this, pages: this.cache, styles: this.st, labels: this.opts.language === "en" ? EN : FR, fit: this.fitLine };
	}

	rows(): { node: ReviewNode; depth: number }[] {
		return visibleRows(this.pane());
	}
	current(): ReviewNode | null {
		return currentNode(this.pane());
	}
	selectPath(path: string): void {
		selectPath(this.pane(), path);
	}
	changedFiles(): number[] {
		return changedFiles(this.pane());
	}
	isNarrow(width: number): boolean {
		return width < (this.opts.narrowThreshold ?? NARROW_THRESHOLD);
	}
	invalidate(): void {
		this.cachedLines = null;
		this.cachedWidth = -1;
	}

	handleInput(data: string): void {
		const moved = handleKey(this.pane(), data, { exit: () => this.opts.onExit(), refresh: () => this.opts.onRefresh?.() });
		if (!moved) return;
		this.invalidate();
		this.opts.requestRender();
	}

	/**
	 * Loads what the reader is about to show. A file longer than one page arrives page by page
	 * (§10.5): the next one is asked for when the reader comes within a screen of the end of what is
	 * loaded, and the pages already read are kept, so scrolling back costs nothing. Loading never
	 * blocks the surface — the reader stays navigable while a page is on its way.
	 */
	private ensureLoaded(node: ReviewNode, rows: number): void {
		if (node.kind === "directory") return;
		if (this.mode === "changes") {
			const key = `changes:${node.path}`;
			if (this.cache.has(key) || this.loading === key) return;
			this.loading = key;
			this.settle(key, this.query.changes(node.path, node.status, node.old_path));
			return;
		}
		if (this.mode !== "new" && this.mode !== "old") return;
		const key = `${this.mode}:${node.path}`;
		if (this.loading === key) return;
		const loaded = this.cache.get(key);
		if (loaded === undefined) {
			this.loading = key;
			this.settle(key, this.query.content(node.path, this.mode, 1, CONTENT_PAGE_LINES));
			return;
		}
		if ("error" in loaded || !("lines" in loaded) || !loaded.truncated) return;
		if (this.readerScroll + rows < loaded.lines.length) return;
		this.loading = key;
		this.settle(key, this.query.content(node.path, this.mode, loaded.start_line + loaded.lines.length, CONTENT_PAGE_LINES).then((next) => ({ ...loaded, lines: [...loaded.lines, ...next.lines], truncated: next.truncated })));
	}

	private settle(key: string, page: Promise<LoadedPage>): void {
		page.then((p) => { this.cache.set(key, p); }, (error: Error) => { this.cache.set(key, { error: error.message }); }).finally(() => { this.loading = null; this.invalidate(); this.opts.requestRender(); });
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const rows = Math.max(8, this.opts.rows());
		const narrow = this.isNarrow(width);
		const ctx = this.pane();
		const out = renderHeader(ctx, width);
		const bodyRows = rows - 4;
		const node = currentNode(ctx);
		if (node) this.ensureLoaded(node, bodyRows);
		const tree = renderTree(ctx, narrow ? width : Math.max(20, Math.floor(width * this.split)) - 1, bodyRows);
		const readerWidth = narrow ? width : width - tree.width - 1;
		const reader = renderReader(ctx, node, readerWidth, bodyRows);
		for (let i = 0; i < bodyRows; i++) {
			if (narrow) out.push(this.narrowPane === "tree" ? (tree.lines[i] ?? this.fitLine("", width)) : (reader[i] ?? this.fitLine("", width)));
			else out.push(`${tree.lines[i] ?? this.fitLine("", tree.width)}│${reader[i] ?? this.fitLine("", readerWidth)}`);
		}
		out.push(renderContext(ctx, node, width));
		out.push(renderKeyHelp(ctx, width, narrow));
		this.cachedLines = out.slice(0, rows);
		this.cachedWidth = width;
		return this.cachedLines;
	}
}
