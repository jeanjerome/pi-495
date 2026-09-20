/**
 * FileReaderPane (§5.5): what the selection holds, in the mode the reader is in — the changes, the
 * new or the old content, the metadata, or the findings recorded on that path.
 *
 * Changed portions are shown as ANCIEN and NOUVEAU blocks, never as `+`/`-` prefixes or hunk
 * markers: a `+` belonging to the code must not be indistinguishable from one the display added
 * (§5.5, UX-09). The last line says how far into the body the reader sits when it does not all fit.
 */
import { neutralize, type ChangePage, type ContentPage } from "../../../application/review.ts";
import { LABEL, type PaneContext, type Selection } from "./view.ts";

export function renderReader(ctx: PaneContext, node: Selection, width: number, height: number): string[] {
	const L = ctx.labels;
	const view = ctx.view;
	const lines: string[] = [];
	const title = node ? `${L.modes[view.mode]} — ${neutralize(node.path)}` : L.modes[view.mode];
	lines.push(ctx.styles.header(ctx.fit(view.focus === "reader" ? ctx.styles.focus(title) : title, width)));
	const body: string[] = [];
	if (!node) body.push(L.noSelection);
	else if (node.kind === "directory") {
		body.push(`${L.directory} ${node.path || "/"}`);
		for (const [k, v] of Object.entries(node.aggregate)) body.push(`  ${LABEL[k as keyof typeof LABEL]}: ${v}`);
	} else if (view.mode === "metadata") {
		body.push(`${L.status}: ${LABEL[node.status]}`, `${L.kind}: ${node.kind}`, `${L.path}: ${node.path}`);
		if (node.old_path) body.push(`${L.from}: ${node.old_path}`);
		const page = ctx.pages.get(`changes:${node.path}`);
		if (page && "metadata" in page) for (const [side, meta] of Object.entries(page.metadata as Record<string, Record<string, unknown>>)) body.push(`${side}: ${JSON.stringify(meta)}`);
		for (const l of node.limits) body.push(ctx.styles.warn(`! ${l}`));
	} else if (view.mode === "findings") {
		const fs = ctx.snapshot.findings.filter((f) => f.path === node.path);
		if (fs.length === 0) body.push(L.noFindings);
		for (const f of fs) body.push(`${f.severity} ${f.rule_id}${f.region ? ` :${f.region.start_line}` : ""} — ${f.message} (${f.evidence_id})`);
	} else {
		const key = view.mode === "changes" ? `changes:${node.path}` : `${view.mode}:${node.path}`;
		const page = ctx.pages.get(key);
		if (!page) body.push(L.loading);
		else if ("error" in page) body.push(ctx.styles.warn(`${L.error}: ${page.error}`));
		else if ("hunks" in page) body.push(...renderChanges(ctx, page, width));
		else body.push(...renderContent(ctx, page, width));
	}
	if (view.readerScroll > Math.max(0, body.length - 1)) view.readerScroll = Math.max(0, body.length - 1);
	const visible = body.slice(view.readerScroll, view.readerScroll + height - 1);
	for (const b of visible) lines.push(ctx.fit(b, width));
	while (lines.length < height) lines.push(ctx.fit("", width));
	if (body.length > height - 1) lines[height - 1] = ctx.styles.dim(ctx.fit(`${L.lines} ${view.readerScroll + 1}-${Math.min(body.length, view.readerScroll + height - 1)}/${body.length}`, width));
	return lines;
}

function renderChanges(ctx: PaneContext, page: ChangePage, width: number): string[] {
	const out: string[] = [];
	if (page.kind !== "text") {
		out.push(ctx.styles.warn(`${page.kind}: ${page.notes.join("; ")}`));
		for (const [side, meta] of Object.entries(page.metadata as Record<string, Record<string, unknown>>)) out.push(`${side}: ${JSON.stringify(meta)}`);
		return out;
	}
	for (const n of page.notes) out.push(ctx.styles.dim(n));
	if (page.hunks.length === 0) out.push(ctx.styles.dim("aucune différence textuelle"));
	for (const h of page.hunks) {
		out.push(ctx.styles.dim(`── ${h.old_start}…${h.old_start + h.old_count - 1} → ${h.new_start}…${h.new_start + h.new_count - 1} ──`));
		for (const seg of h.segments) {
			if (seg.kind === "unchanged") {
				if (ctx.view.foldContext) {
					out.push(ctx.styles.dim(`  … ${seg.lines.length} ligne(s) inchangée(s)`));
					continue;
				}
				for (const l of seg.lines) out.push(`  ${neutralize(l)}`);
			} else if (seg.kind === "old") {
				out.push(ctx.styles.oldBlock("ANCIEN"));
				for (const l of seg.lines) out.push(ctx.styles.oldBlock(`  ${neutralize(l)}`));
			} else {
				out.push(ctx.styles.newBlock("NOUVEAU"));
				for (const l of seg.lines) out.push(ctx.styles.newBlock(`  ${neutralize(l)}`));
			}
		}
	}
	return out.map((l) => ctx.fit(l, width));
}

function renderContent(ctx: PaneContext, page: ContentPage, width: number): string[] {
	if (page.kind !== "text") return [ctx.styles.warn(`${page.kind}`), JSON.stringify(page.metadata)].map((l) => ctx.fit(l, width));
	const out = page.lines.map((l) => ctx.fit(neutralize(l), width));
	if (page.truncated) out.push(ctx.styles.warn(`… ${page.total_lines - page.start_line + 1 - page.lines.length} lignes non chargées`));
	return out;
}

/** Where each changed portion starts in the rendered body: what the change-to-change keys jump to. */
export function hunkStarts(page: ChangePage, fold: boolean): number[] {
	const starts: number[] = [];
	let line = page.notes.length;
	for (const h of page.hunks) {
		starts.push(line);
		line++;
		for (const seg of h.segments) line += seg.kind === "unchanged" ? (fold ? 1 : seg.lines.length) : seg.lines.length + 1;
	}
	return starts;
}
