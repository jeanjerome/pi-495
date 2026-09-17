/**
 * ReviewSurface (§5.5, UX-06 to UX-10): tree on the left, reader on the right, header, context
 * zone and key help. Receives an immutable ReviewSnapshot and a read-only query; never touches the
 * workspace directly. Below `narrowThreshold` columns the same selection drives two alternating views.
 */
import { CONTENT_PAGE_LINES, flatten, neutralize, type ChangePage, type ContentPage, type PathStatus, type ReviewNode, type ReviewSnapshot } from "../../application/review.ts";

export interface ReviewQuery {
	changes(path: string, status: PathStatus, oldPath: string | null): Promise<ChangePage>;
	content(path: string, side: "old" | "new", start: number, limit: number): Promise<ContentPage>;
}

export interface Styles {
	added(s: string): string;
	modified(s: string): string;
	deleted(s: string): string;
	renamed(s: string): string;
	intact(s: string): string;
	selected(s: string): string;
	dim(s: string): string;
	header(s: string): string;
	oldBlock(s: string): string;
	newBlock(s: string): string;
	focus(s: string): string;
	warn(s: string): string;
}

export const PLAIN: Styles = { added: (s) => s, modified: (s) => s, deleted: (s) => s, renamed: (s) => s, intact: (s) => s, selected: (s) => s, dim: (s) => s, header: (s) => s, oldBlock: (s) => s, newBlock: (s) => s, focus: (s) => s, warn: (s) => s };

export type ReaderMode = "changes" | "new" | "old" | "metadata" | "findings";
const MODES: ReaderMode[] = ["changes", "new", "old", "metadata", "findings"];

const SYMBOL: Record<PathStatus, string> = { intact: "=", added: "A", modified: "M", deleted: "D", renamed: "R", "renamed?": "R?", special: "S", unknown: "?" };
const LABEL: Record<PathStatus, string> = { intact: "intact", added: "ajouté", modified: "modifié", deleted: "supprimé", renamed: "renommé", "renamed?": "renommé?", special: "spécial", unknown: "inconnu" };

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

/** Columns a tree row spends before the name: two per level, then the marker, the symbol and a space. */
export function treeRowOverhead(depth: number): number {
	return 2 * depth + 4;
}

export function fit(s: string, width: number): string {
	const chars = [...s];
	if (chars.length <= width) return s + " ".repeat(width - chars.length);
	if (width <= 1) return chars.slice(0, width).join("");
	return `${chars.slice(0, width - 1).join("")}…`;
}

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
}

export class ReviewSurface {
	readonly snapshot: ReviewSnapshot;
	private readonly query: ReviewQuery;
	private readonly st: Styles;
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
	private cache = new Map<string, ChangePage | ContentPage | { error: string }>();
	private loading: string | null = null;
	private cachedLines: string[] | null = null;
	private cachedWidth = -1;

	constructor(options: SurfaceOptions) {
		this.snapshot = options.snapshot;
		this.query = options.query;
		this.st = options.styles ?? PLAIN;
		this.opts = options;
		for (const row of flatten(this.snapshot.root, false)) if (row.node.kind === "directory") this.expanded.add(row.node.path);
		if (options.initialPath) this.selectPath(options.initialPath);
	}

	rows(): { node: ReviewNode; depth: number }[] {
		const all = flatten(this.snapshot.root, this.changedOnly, [], 0, this.expanded);
		return this.search ? all.filter((r) => r.node.path.toLowerCase().includes(this.search.toLowerCase())) : all;
	}
	current(): ReviewNode | null {
		return this.rows()[this.selected]?.node ?? null;
	}
	selectPath(path: string): void {
		const parts = path.split("/");
		for (let i = 1; i < parts.length; i++) this.expanded.add(parts.slice(0, i).join("/"));
		const idx = this.rows().findIndex((r) => r.node.path === path);
		if (idx >= 0) { this.selected = idx; this.readerScroll = 0; }
	}
	isNarrow(width: number): boolean {
		return width < (this.opts.narrowThreshold ?? NARROW_THRESHOLD);
	}
	invalidate(): void {
		this.cachedLines = null;
		this.cachedWidth = -1;
	}
	private changedFiles(): number[] {
		return this.rows().map((r, i) => (r.node.kind !== "directory" && r.node.status !== "intact" ? i : -1)).filter((i) => i >= 0);
	}

	handleInput(data: string): void {
		const key = decodeKey(data);
		if (this.searching) {
			if (key === "escape") { this.searching = false; this.search = ""; }
			else if (key === "enter") this.searching = false;
			else if (key === "backspace") this.search = this.search.slice(0, -1);
			else if (data.length === 1 && data >= " ") this.search += data;
			this.selected = Math.min(this.selected, Math.max(0, this.rows().length - 1));
			this.invalidate();
			this.opts.requestRender();
			return;
		}
		const rows = this.rows();
		const node = this.current();
		switch (key) {
			case "q":
			case "escape":
				this.opts.onExit();
				return;
			case "tab":
				this.focus = this.focus === "tree" ? "reader" : "tree";
				this.narrowPane = this.focus;
				break;
			case "up":
				if (this.focus === "tree") { this.selected = Math.max(0, this.selected - 1); this.readerScroll = 0; }
				else this.readerScroll = Math.max(0, this.readerScroll - 1);
				break;
			case "down":
				if (this.focus === "tree") { this.selected = Math.min(rows.length - 1, this.selected + 1); this.readerScroll = 0; }
				else this.readerScroll++;
				break;
			case "pageup":
				this.readerScroll = Math.max(0, this.readerScroll - 20);
				break;
			case "pagedown":
				this.readerScroll += 20;
				break;
			case "enter":
			case "right":
				if (node?.kind === "directory") { if (this.expanded.has(node.path)) this.expanded.delete(node.path); else this.expanded.add(node.path); }
				else if (key === "enter") { this.focus = "reader"; this.narrowPane = "reader"; }
				break;
			case "left":
				if (node?.kind === "directory" && this.expanded.has(node.path)) this.expanded.delete(node.path);
				else if (node) { const parent = node.path.includes("/") ? node.path.slice(0, node.path.lastIndexOf("/")) : ""; if (parent) this.selectPath(parent); }
				break;
			case "c":
				this.changedOnly = !this.changedOnly;
				this.selected = Math.min(this.selected, Math.max(0, this.rows().length - 1));
				break;
			case "m":
				this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]!;
				this.readerScroll = 0;
				break;
			case "n": {
				const next = this.changedFiles().find((i) => i > this.selected);
				if (next !== undefined) { this.selected = next; this.readerScroll = 0; }
				break;
			}
			case "p": {
				const prev = this.changedFiles().reverse().find((i) => i < this.selected);
				if (prev !== undefined) { this.selected = prev; this.readerScroll = 0; }
				break;
			}
			case "]":
			case "[": {
				const page = node ? this.cache.get(`changes:${node.path}`) : undefined;
				if (page && "hunks" in page) {
					const starts = hunkStarts(page as ChangePage, this.foldContext);
					const target = key === "]" ? starts.find((s) => s > this.readerScroll) : [...starts].reverse().find((s) => s < this.readerScroll);
					if (target !== undefined) this.readerScroll = target;
				}
				break;
			}
			case "x":
				this.foldContext = !this.foldContext;
				break;
			case "+":
				this.split = Math.min(0.7, this.split + 0.05);
				break;
			case "-":
				this.split = Math.max(0.2, this.split - 0.05);
				break;
			case "/":
				this.searching = true;
				this.search = "";
				break;
			case "r":
				if (this.snapshot.newer_candidate && this.opts.onRefresh) this.opts.onRefresh();
				break;
			default:
				return;
		}
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

	private settle(key: string, page: Promise<ChangePage | ContentPage>): void {
		page.then((p) => { this.cache.set(key, p); }, (error: Error) => { this.cache.set(key, { error: error.message }); }).finally(() => { this.loading = null; this.invalidate(); this.opts.requestRender(); });
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const rows = Math.max(8, this.opts.rows());
		const narrow = this.isNarrow(width);
		const out: string[] = [];
		const s = this.snapshot;
		const L = this.opts.language === "en" ? EN : FR;
		const head = `${L.review} ${s.change_id} · ${L.ref} ${s.reference.head_commit ? s.reference.head_commit.slice(0, 10) : s.reference.kind} → ${L.cand} ${s.candidate ? `${s.candidate.candidate_id} (${s.candidate.manifest_digest.slice(7, 19)})` : L.none} · ${s.fresh ? L.fresh : this.st.warn(`${L.newer} ${s.newer_candidate} (r)`)}${s.complete ? "" : this.st.warn(` · ${L.incomplete}`)}`;
		out.push(this.st.header(fit(neutralize(head), width)));
		const counts = `${L.counts}: A${s.counts.added} M${s.counts.modified} D${s.counts.deleted} R${s.counts.renamed + s.counts["renamed?"]} =${s.counts.intact} · ${this.changedOnly ? L.changedOnly : L.allPaths}${this.search ? ` · /${this.search}` : ""}`;
		out.push(this.st.dim(fit(counts, width)));
		const bodyRows = rows - 4;
		const node = this.current();
		if (node) this.ensureLoaded(node, bodyRows);
		const treeLines = this.renderTree(narrow ? width : Math.max(20, Math.floor(width * this.split)) - 1, bodyRows);
		const readerWidth = narrow ? width : width - treeLines.width - 1;
		const readerLines = this.renderReader(node, readerWidth, bodyRows, L);
		for (let i = 0; i < bodyRows; i++) {
			if (narrow) out.push(this.narrowPane === "tree" ? (treeLines.lines[i] ?? fit("", width)) : (readerLines[i] ?? fit("", width)));
			else out.push(`${treeLines.lines[i] ?? fit("", treeLines.width)}│${readerLines[i] ?? fit("", readerWidth)}`);
		}
		const ctx = node ? `${LABEL[node.status]} · ${node.path}${node.old_path ? ` (${L.from} ${node.old_path})` : ""}${node.limits.length ? ` · ${this.st.warn(node.limits.join("; "))}` : ""}` : L.noSelection;
		out.push(this.st.dim(fit(neutralize(ctx), width)));
		// No review operation may vanish (`specification-fonctionnelle.md` §16). The labelled help is
		// 123 columns wide, so any terminal narrower than that would have actions cut off its end.
		// The compact form names the same keys without their labels: it is used whenever the labelled
		// one does not fit, rather than letting the display drop the last actions.
		const prefix = this.searching ? `/${this.search}▏ ` : "";
		const pane = narrow ? ` [${this.narrowPane === "tree" ? L.tree : L.reader}]` : "";
		const labelled = `${prefix}${L.help}${pane}`;
		out.push(this.st.dim(fit([...labelled].length <= width ? labelled : `${prefix}${L.helpKeys}${pane}`, width)));
		this.cachedLines = out.slice(0, rows);
		this.cachedWidth = width;
		return this.cachedLines;
	}

	private renderTree(width: number, height: number): { lines: string[]; width: number } {
		const rows = this.rows();
		if (this.selected >= rows.length) this.selected = Math.max(0, rows.length - 1);
		if (this.selected < this.treeScroll) this.treeScroll = this.selected;
		if (this.selected >= this.treeScroll + height) this.treeScroll = this.selected - height + 1;
		const lines: string[] = [];
		for (let i = this.treeScroll; i < Math.min(rows.length, this.treeScroll + height); i++) {
			const r = rows[i]!;
			const n = r.node;
			const marker = n.kind === "directory" ? (this.expanded.has(n.path) ? "▾ " : "▸ ") : "  ";
			const sym = n.kind === "directory" ? (n.status === "intact" ? " " : "*") : SYMBOL[n.status];
			const agg = n.kind === "directory" ? this.st.dim(` ${Object.entries(n.aggregate).filter(([k]) => k !== "intact").map(([k, v]) => `${SYMBOL[k as PathStatus]}${v}`).join(" ")}`) : "";
			const text = `${"  ".repeat(r.depth)}${marker}${sym} ${neutralize(n.name)}${n.kind === "directory" ? "/" : ""}${n.old_path ? this.st.dim(` ← ${neutralize(n.old_path)}`) : ""}${agg}`;
			const colored = n.kind === "directory" ? text : this.color(n.status, text);
			const line = fit(colored, width);
			lines.push(i === this.selected ? (this.focus === "tree" ? this.st.selected(this.st.focus(line)) : this.st.selected(line)) : line);
		}
		while (lines.length < height) lines.push(fit("", width));
		if (rows.length === 0) lines[0] = fit(this.st.dim("(vide)"), width);
		return { lines, width };
	}

	private color(status: PathStatus, text: string): string {
		switch (status) {
			case "added": return this.st.added(text);
			case "modified": return this.st.modified(text);
			case "deleted": return this.st.deleted(text);
			case "renamed": case "renamed?": return this.st.renamed(text);
			default: return this.st.intact(text);
		}
	}

	private renderReader(node: ReviewNode | null, width: number, height: number, L: typeof FR): string[] {
		const lines: string[] = [];
		const title = node ? `${L.modes[this.mode]} — ${neutralize(node.path)}` : L.modes[this.mode];
		lines.push(this.st.header(fit(this.focus === "reader" ? this.st.focus(title) : title, width)));
		const body: string[] = [];
		if (!node) body.push(L.noSelection);
		else if (node.kind === "directory") {
			body.push(`${L.directory} ${node.path || "/"}`);
			for (const [k, v] of Object.entries(node.aggregate)) body.push(`  ${LABEL[k as PathStatus]}: ${v}`);
		} else if (this.mode === "metadata") {
			body.push(`${L.status}: ${LABEL[node.status]}`, `${L.kind}: ${node.kind}`, `${L.path}: ${node.path}`);
			if (node.old_path) body.push(`${L.from}: ${node.old_path}`);
			const page = this.cache.get(`changes:${node.path}`);
			if (page && "metadata" in page) for (const [side, meta] of Object.entries(page.metadata as Record<string, Record<string, unknown>>)) body.push(`${side}: ${JSON.stringify(meta)}`);
			for (const l of node.limits) body.push(this.st.warn(`! ${l}`));
		} else if (this.mode === "findings") {
			const fs = this.snapshot.findings.filter((f) => f.path === node.path);
			if (fs.length === 0) body.push(L.noFindings);
			for (const f of fs) body.push(`${f.severity} ${f.rule_id}${f.region ? ` :${f.region.start_line}` : ""} — ${f.message} (${f.evidence_id})`);
		} else {
			const key = this.mode === "changes" ? `changes:${node.path}` : `${this.mode}:${node.path}`;
			const page = this.cache.get(key);
			if (!page) body.push(L.loading);
			else if ("error" in page) body.push(this.st.warn(`${L.error}: ${page.error}`));
			else if ("hunks" in page) body.push(...this.renderChanges(page, width));
			else body.push(...this.renderContent(page, width));
		}
		if (this.readerScroll > Math.max(0, body.length - 1)) this.readerScroll = Math.max(0, body.length - 1);
		const visible = body.slice(this.readerScroll, this.readerScroll + height - 1);
		for (const b of visible) lines.push(fit(b, width));
		while (lines.length < height) lines.push(fit("", width));
		if (body.length > height - 1) lines[height - 1] = this.st.dim(fit(`${L.lines} ${this.readerScroll + 1}-${Math.min(body.length, this.readerScroll + height - 1)}/${body.length}`, width));
		return lines;
	}

	private renderChanges(page: ChangePage, width: number): string[] {
		const out: string[] = [];
		if (page.kind !== "text") {
			out.push(this.st.warn(`${page.kind}: ${page.notes.join("; ")}`));
			for (const [side, meta] of Object.entries(page.metadata as Record<string, Record<string, unknown>>)) out.push(`${side}: ${JSON.stringify(meta)}`);
			return out;
		}
		for (const n of page.notes) out.push(this.st.dim(n));
		if (page.hunks.length === 0) out.push(this.st.dim("aucune différence textuelle"));
		for (const h of page.hunks) {
			out.push(this.st.dim(`── ${h.old_start}…${h.old_start + h.old_count - 1} → ${h.new_start}…${h.new_start + h.new_count - 1} ──`));
			for (const seg of h.segments) {
				if (seg.kind === "unchanged") {
					if (this.foldContext) { out.push(this.st.dim(`  … ${seg.lines.length} ligne(s) inchangée(s)`)); continue; }
					for (const l of seg.lines) out.push(`  ${neutralize(l)}`);
				} else if (seg.kind === "old") {
					out.push(this.st.oldBlock("ANCIEN"));
					for (const l of seg.lines) out.push(this.st.oldBlock(`  ${neutralize(l)}`));
				} else {
					out.push(this.st.newBlock("NOUVEAU"));
					for (const l of seg.lines) out.push(this.st.newBlock(`  ${neutralize(l)}`));
				}
			}
		}
		return out.map((l) => fit(l, width));
	}

	private renderContent(page: ContentPage, width: number): string[] {
		if (page.kind !== "text") return [this.st.warn(`${page.kind}`), JSON.stringify(page.metadata)].map((l) => fit(l, width));
		const out = page.lines.map((l) => fit(neutralize(l), width));
		if (page.truncated) out.push(this.st.warn(`… ${page.total_lines - page.start_line + 1 - page.lines.length} lignes non chargées`));
		return out;
	}
}

function hunkStarts(page: ChangePage, fold: boolean): number[] {
	const starts: number[] = [];
	let line = page.notes.length;
	for (const h of page.hunks) {
		starts.push(line);
		line++;
		for (const seg of h.segments) line += seg.kind === "unchanged" ? (fold ? 1 : seg.lines.length) : seg.lines.length + 1;
	}
	return starts;
}

export function decodeKey(data: string): string {
	const map: Record<string, string> = { "\r": "enter", "\n": "enter", "\t": "tab", "\x1b": "escape", "\x7f": "backspace", "\b": "backspace", "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[5~": "pageup", "\x1b[6~": "pagedown", "\x1bOA": "up", "\x1bOB": "down", "\x1bOC": "right", "\x1bOD": "left" };
	return map[data] ?? data;
}

const FR = { review: "Revue", ref: "référence", cand: "candidat", none: "aucun", fresh: "à jour", newer: "candidat plus récent :", incomplete: "comparaison incomplète", counts: "Statuts", changedOnly: "changements uniquement", allPaths: "arbre complet", from: "depuis", noSelection: "aucune sélection", tree: "arbre", reader: "lecteur", help: "↑↓ naviguer  ⏎ ouvrir  tab focus  c filtre  m mode  n/p fichier  ]/[ modif  x contexte  +/- largeur  / rechercher  q retour", helpKeys: "↑↓ ⏎ tab c m n/p ]/[ x +/- / q", modes: { changes: "Modifications", new: "Contenu (nouveau)", old: "Contenu (ancien)", metadata: "Métadonnées", findings: "Constats" }, directory: "Répertoire", status: "État", kind: "Type", path: "Chemin", noFindings: "aucun constat sur ce chemin", loading: "chargement…", error: "erreur", lines: "lignes" };
const EN = { ...FR, review: "Review", ref: "reference", cand: "candidate", none: "none", fresh: "up to date", newer: "newer candidate:", incomplete: "incomplete comparison", counts: "Statuses", changedOnly: "changes only", allPaths: "full tree", from: "from", noSelection: "no selection", tree: "tree", reader: "reader", help: "↑↓ move  ⏎ open  tab focus  c filter  m mode  n/p file  ]/[ change  x context  +/- width  / search  q back", helpKeys: "↑↓ ⏎ tab c m n/p ]/[ x +/- / q", modes: { changes: "Changes", new: "Content (new)", old: "Content (old)", metadata: "Metadata", findings: "Findings" }, directory: "Directory", status: "Status", kind: "Kind", path: "Path", noFindings: "no finding on this path", loading: "loading…", error: "error", lines: "lines" };
