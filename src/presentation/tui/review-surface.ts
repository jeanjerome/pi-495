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
import {
	CONTENT_PAGE_LINES,
	type ChangePage,
	flatten,
	type ReviewNode,
	type ReviewSnapshot,
} from "../../application/review.ts";
import { renderHeader } from "./review/header.ts";
import { handleKey, renderKeyHelp } from "./review/keymap.ts";
import { NARROW_THRESHOLD, fit } from "./review/measure.ts";
import { renderReader } from "./review/reader-pane.ts";
import { renderContext } from "./review/context-pane.ts";
import { type RenderedDiff, renderHunks } from "./review/diff-view.ts";
import { changedFiles, currentNode, renderTree, selectPath, treeWidthNeeded, visibleRows } from "./review/tree-pane.ts";
import {
	EN,
	FR,
	PLAIN,
	type LoadedPage,
	type PaneContext,
	type ReaderMode,
	type ReviewQuery,
	type ReviewView,
	type Styles,
} from "./review/view.ts";

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
	private cachedRows = -1;
	private diffs = new Map<string, RenderedDiff>();
	private drawing = new Set<string>();
	/** The width the last render was asked for: what a key press measures against, between renders. */
	private lastWidth = 0;

	constructor(options: SurfaceOptions) {
		this.snapshot = options.snapshot;
		this.query = options.query;
		this.st = options.styles ?? PLAIN;
		this.fitLine = options.fit ?? fit;
		this.opts = options;
		for (const row of flatten(this.snapshot.root, false))
			if (row.node.kind === "directory") this.expanded.add(row.node.path);
		if (options.initialPath) this.selectPath(options.initialPath);
	}

	/** What a pane is allowed to see of this surface. */
	private pane(): PaneContext {
		return {
			snapshot: this.snapshot,
			view: this,
			pages: this.cache,
			styles: this.st,
			labels: this.opts.language === "en" ? EN : FR,
			fit: this.fitLine,
			diff: (page) => this.diffFor(page),
		};
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
		this.cachedRows = -1;
	}

	handleInput(data: string): void {
		const moved = handleKey(this.pane(), data, {
			exit: () => this.opts.onExit(),
			refresh: () => this.opts.onRefresh?.(),
		});
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
		this.settle(
			key,
			this.query
				.content(node.path, this.mode, loaded.start_line + loaded.lines.length, CONTENT_PAGE_LINES)
				.then((next) => ({ ...loaded, lines: [...loaded.lines, ...next.lines], truncated: next.truncated })),
		);
	}

	/**
	 * The change body, drawn once per path, fold and width. Drawing is asynchronous and the renderer
	 * reads the terminal's width itself, so the width the surface was last asked for belongs to the
	 * key: a body drawn for a wider terminal is folded where the reader no longer is.
	 */
	private diffFor(page: ChangePage): RenderedDiff | null {
		const key = `${page.path}|${this.foldContext}|${this.lastWidth}`;
		const drawn = this.diffs.get(key);
		if (drawn) return drawn;
		if (this.drawing.has(key)) return null;
		this.drawing.add(key);
		renderHunks(page, this.foldContext)
			.then(
				(result) => {
					this.diffs.set(key, result);
				},
				(error: Error) => {
					this.diffs.set(key, { lines: [], starts: [], error: error.message });
				},
			)
			.finally(() => {
				this.drawing.delete(key);
				this.invalidate();
				this.opts.requestRender();
			});
		return null;
	}

	private settle(key: string, page: Promise<LoadedPage>): void {
		page
			.then(
				(p) => {
					this.cache.set(key, p);
				},
				(error: Error) => {
					this.cache.set(key, { error: error.message });
				},
			)
			.finally(() => {
				this.loading = null;
				this.invalidate();
				this.opts.requestRender();
			});
	}

	render(width: number): string[] {
		// The height is read at every render and belongs to the key with the width: a terminal resized
		// in height alone keeps its width, and a cache kept under the width alone would answer with
		// the height it had before — short of the terminal, or past its last line.
		const rows = Math.max(8, this.opts.rows());
		if (this.cachedLines && this.cachedWidth === width && this.cachedRows === rows) return this.cachedLines;
		this.lastWidth = width;
		const narrow = this.isNarrow(width);
		const ctx = this.pane();
		const out = renderHeader(ctx, width);
		const bodyRows = rows - 4;
		const node = currentNode(ctx);
		if (node) this.ensureLoaded(node, bodyRows);
		// A change is read on the whole screen. The renderer that draws it takes no width from its
		// caller and folds its lines for the terminal's own, so a change shown beside the tree would be
		// folded for a width it does not have. The tree steps aside while a change is open, and comes
		// back with every other mode. Below the threshold nothing changes: the panes already alternate,
		// and taking the reader's turn away would remove the only way to navigate.
		const whole = !narrow && this.mode === "changes" && node !== null && node.kind !== "directory";
		if (narrow || whole) {
			const single =
				whole || this.narrowPane === "reader"
					? renderReader(ctx, node, width, bodyRows)
					: renderTree(ctx, width, bodyRows).lines;
			for (let i = 0; i < bodyRows; i++) out.push(single[i] ?? this.fitLine("", width));
		} else {
			// The split is an arrangement, not a way to hide the change: whatever the reviewer asks for
			// with `+` and `-`, the tree keeps the columns its changed names need, up to the share a
			// reader can spare. One column of the share goes to the separator, so what the tree draws in
			// is one less than what the split asks for; the floor is compared against that drawn width,
			// not against the share.
			const asked = Math.max(20, Math.floor(width * this.split)) - 1;
			const treeWidth = Math.min(Math.max(asked, treeWidthNeeded(ctx)), Math.floor(width * 0.7) - 1);
			const tree = renderTree(ctx, treeWidth, bodyRows);
			const readerWidth = width - tree.width - 1;
			const reader = renderReader(ctx, node, readerWidth, bodyRows);
			for (let i = 0; i < bodyRows; i++)
				out.push(`${tree.lines[i] ?? this.fitLine("", tree.width)}│${reader[i] ?? this.fitLine("", readerWidth)}`);
		}
		out.push(renderContext(ctx, node, width));
		out.push(renderKeyHelp(ctx, width, narrow));
		this.cachedLines = out.slice(0, rows);
		this.cachedWidth = width;
		this.cachedRows = rows;
		return this.cachedLines;
	}
}
