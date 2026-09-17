/**
 * Review query model (CMP-REV, ADR-010): the union of reference and candidate paths, per-path
 * status readable without colour, paged content and typed change segments. Independent of any
 * TUI component and identical for every Pi entry (RM-066, UX-11).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { digestValue } from "../contracts/digest.ts";
import type { CandidateManifest, ManifestEntry, ReferenceSnapshot } from "../contracts/v1/candidate.ts";
import type { Finding } from "../contracts/v1/evidence.ts";
import { diffLines, hunks, intraline, similarity, splitLines, type Hunk } from "./diff.ts";

export type PathStatus = "intact" | "added" | "modified" | "deleted" | "renamed" | "renamed?" | "special" | "unknown";

export interface ReviewNode {
	path: string;
	name: string;
	kind: "file" | "directory" | "symlink" | "submodule" | "special";
	status: PathStatus;
	old_path: string | null;
	children: ReviewNode[];
	/** Aggregated statuses of descendants for directories. */
	aggregate: Partial<Record<PathStatus, number>>;
	limits: string[];
}

export interface ReviewSnapshot {
	snapshot_id: string;
	change_id: string;
	reference: { reference_id: string; kind: string; head_commit: string | null; tree_digest: string };
	candidate: { candidate_id: string; manifest_digest: string; frozen_at: string } | null;
	created_at: string;
	fresh: boolean;
	newer_candidate: string | null;
	complete: boolean;
	limits: string[];
	root: ReviewNode;
	counts: Record<PathStatus, number>;
	findings: (Finding & { evidence_id: string })[];
}

export interface ContentPage {
	path: string;
	side: "old" | "new";
	kind: "text" | "binary" | "symlink" | "missing" | "special" | "too_large";
	lines: string[];
	start_line: number;
	total_lines: number;
	truncated: boolean;
	metadata: Record<string, unknown>;
}

export interface ChangePage {
	path: string;
	status: PathStatus;
	kind: "text" | "binary" | "symlink" | "missing" | "special" | "too_large";
	hunks: Hunk[];
	intraline: Record<string, { old: [number, number]; new: [number, number] }>;
	metadata: Record<string, unknown>;
	notes: string[];
}

export interface ReviewSources {
	referencePath: string;
	workspacePath: string | null;
	reference: ReferenceSnapshot;
	manifest: CandidateManifest | null;
	maxBytes: number;
}

/**
 * Bytes of one file 495 will hold in memory to compare or display it (`specification-fonctionnelle.md`
 * §16, "Pagination et budgets des grands fichiers").
 *
 * Criterion: a file above the budget is never read, and never disappears either — it keeps its
 * path, its status and its size and is typed `too_large`, in the TUI as in every structured entry.
 * The value is set against the workspace budget it sits under: the manifest walks files up to 8 MiB
 * and records, without digesting, anything above. Reading is stricter on purpose, because a
 * comparison holds both sides plus their line maps; at 2 MiB that is about 6 MiB of live data for
 * one path. Between the two budgets a file is inventoried but not read, which is what the review
 * must be able to say.
 */
export const FILE_READ_BUDGET_BYTES = 2 * 1024 * 1024;

/**
 * Lines of one page of progressive loading (§10.5).
 *
 * Criterion: every limit stays visible and the reader can reach past it. A page must outrun one
 * screen by enough that scrolling never waits on a load — ten screens of the tallest terminal we
 * render — and stay a bounded read: at the 95th-percentile line of the corpus in
 * `test/fixtures/review-corpus.ts`, one page is about 330 KB, so seven pages cover the largest file
 * the read budget allows.
 */
export const CONTENT_PAGE_LINES = 2000;

function isBinary(bytes: Uint8Array): boolean {
	const n = Math.min(bytes.byteLength, 8000);
	for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
	return false;
}

export function buildSnapshot(args: { change_id: string; reference: ReferenceSnapshot; manifest: CandidateManifest | null; findings: (Finding & { evidence_id: string })[]; newer_candidate: string | null; now: string }): ReviewSnapshot {
	const entries: ManifestEntry[] = args.manifest?.entries ?? args.reference.entries.map((e) => ({ ...e, baseline_state: "unchanged" }));
	const root: ReviewNode = { path: "", name: "", kind: "directory", status: "intact", old_path: null, children: [], aggregate: {}, limits: [] };
	const counts: Record<PathStatus, number> = { intact: 0, added: 0, modified: 0, deleted: 0, renamed: 0, "renamed?": 0, special: 0, unknown: 0 };
	const limits: string[] = [...args.reference.limits.notes, ...(args.manifest?.limits.notes ?? [])];
	// rename detection: deleted + added with same digest (certain) or high similarity (hypothesis)
	const deleted = entries.filter((e) => e.baseline_state === "deleted" && e.kind === "file");
	const added = entries.filter((e) => e.baseline_state === "added" && e.kind === "file");
	const renamedFrom = new Map<string, { old: string; certain: boolean }>();
	const consumed = new Set<string>();
	for (const a of added) {
		const exact = deleted.find((d) => d.content_digest && d.content_digest === a.content_digest && !consumed.has(d.path));
		if (exact) { renamedFrom.set(a.path, { old: exact.path, certain: true }); consumed.add(exact.path); }
	}
	for (const e of entries) {
		let status: PathStatus;
		const rn = renamedFrom.get(e.path);
		if (rn) status = rn.certain ? "renamed" : "renamed?";
		else if (consumed.has(e.path)) continue;
		else if (e.kind === "special" || e.kind === "submodule") status = "special";
		else if (e.content_digest === null && e.kind === "file") status = "unknown";
		else status = e.baseline_state === "unchanged" ? "intact" : e.baseline_state === "added" ? "added" : e.baseline_state === "deleted" ? "deleted" : "modified";
		counts[status]++;
		insert(root, e, status, rn?.old ?? null);
	}
	aggregate(root);
	return { snapshot_id: `rvw_${digestValue([args.reference.tree_digest, args.manifest?.manifest_digest ?? null]).slice(7, 19)}`, change_id: args.change_id, reference: { reference_id: args.reference.reference_id, kind: args.reference.kind, head_commit: args.reference.head_commit, tree_digest: args.reference.tree_digest }, candidate: args.manifest ? { candidate_id: args.manifest.candidate_id, manifest_digest: args.manifest.manifest_digest, frozen_at: args.manifest.frozen_at } : null, created_at: args.now, fresh: args.newer_candidate === null, newer_candidate: args.newer_candidate, complete: !(args.reference.limits.truncated || args.manifest?.limits.truncated), limits, root, counts, findings: args.findings };
}

function insert(root: ReviewNode, e: ManifestEntry, status: PathStatus, oldPath: string | null): void {
	const parts = e.path.split("/");
	let node = root;
	for (let i = 0; i < parts.length - 1; i++) {
		const name = parts[i]!;
		let child = node.children.find((c) => c.name === name && c.kind === "directory");
		if (!child) { child = { path: parts.slice(0, i + 1).join("/"), name, kind: "directory", status: "intact", old_path: null, children: [], aggregate: {}, limits: [] }; node.children.push(child); }
		node = child;
	}
	node.children.push({ path: e.path, name: parts[parts.length - 1]!, kind: e.kind === "directory" ? "directory" : e.kind, status, old_path: oldPath, children: [], aggregate: {}, limits: e.limits?.notes ?? [] });
}

function aggregate(node: ReviewNode): Partial<Record<PathStatus, number>> {
	if (node.kind !== "directory") return { [node.status]: 1 };
	node.children.sort((a, b) => (a.kind === "directory") === (b.kind === "directory") ? (a.name < b.name ? -1 : 1) : a.kind === "directory" ? -1 : 1);
	const agg: Partial<Record<PathStatus, number>> = {};
	for (const c of node.children) for (const [k, v] of Object.entries(aggregate(c))) agg[k as PathStatus] = (agg[k as PathStatus] ?? 0) + (v ?? 0);
	node.aggregate = agg;
	const changed = Object.entries(agg).filter(([k, v]) => k !== "intact" && (v ?? 0) > 0);
	node.status = changed.length === 0 ? "intact" : "modified";
	return agg;
}

export function flatten(node: ReviewNode, changedOnly: boolean, out: { node: ReviewNode; depth: number }[] = [], depth = 0, expanded?: Set<string>): { node: ReviewNode; depth: number }[] {
	for (const c of node.children) {
		if (changedOnly && c.status === "intact" && c.kind === "directory" && !(c.aggregate.added || c.aggregate.modified || c.aggregate.deleted || c.aggregate.renamed || c.aggregate["renamed?"])) continue;
		if (changedOnly && c.status === "intact" && c.kind !== "directory") continue;
		out.push({ node: c, depth });
		if (c.kind === "directory" && (!expanded || expanded.has(c.path))) flatten(c, changedOnly, out, depth + 1, expanded);
	}
	return out;
}

export function findNode(root: ReviewNode, path: string): ReviewNode | null {
	for (const c of root.children) {
		if (c.path === path) return c;
		if (c.kind === "directory" && path.startsWith(`${c.path}/`)) return findNode(c, path);
	}
	return null;
}

async function readSide(sources: ReviewSources, path: string, side: "old" | "new"): Promise<{ kind: ContentPage["kind"]; text: string; bytes: number; metadata: Record<string, unknown> }> {
	const entries = side === "old" ? sources.reference.entries : (sources.manifest?.entries ?? sources.reference.entries);
	const entry = entries.find((e) => e.path === path && (side === "old" ? true : e.baseline_state !== "deleted"));
	if (!entry) return { kind: "missing", text: "", bytes: 0, metadata: {} };
	const meta = { kind: entry.kind, size: entry.size, mode: entry.mode, digest: entry.content_digest, origin: entry.origin, baseline_state: entry.baseline_state, symlink_target: entry.symlink_target };
	if (entry.kind === "symlink") return { kind: "symlink", text: entry.symlink_target ?? "", bytes: entry.size, metadata: meta };
	if (entry.kind !== "file") return { kind: "special", text: "", bytes: entry.size, metadata: meta };
	if (entry.size > Math.min(sources.maxBytes, FILE_READ_BUDGET_BYTES)) return { kind: "too_large", text: "", bytes: entry.size, metadata: meta };
	const base = side === "old" ? sources.referencePath : (sources.workspacePath ?? sources.referencePath);
	if (side === "new" && !sources.workspacePath && sources.manifest) return { kind: "missing", text: "", bytes: 0, metadata: { ...meta, note: "workspace no longer available" } };
	try {
		const bytes = new Uint8Array(await readFile(join(base, path)));
		if (isBinary(bytes)) return { kind: "binary", text: "", bytes: bytes.byteLength, metadata: meta };
		return { kind: "text", text: new TextDecoder("utf-8", { fatal: false }).decode(bytes), bytes: bytes.byteLength, metadata: meta };
	} catch (error) {
		return { kind: "missing", text: "", bytes: 0, metadata: { ...meta, error: (error as Error).message } };
	}
}

export async function readContent(sources: ReviewSources, path: string, side: "old" | "new", page: { start_line: number; limit: number }): Promise<ContentPage> {
	const r = await readSide(sources, path, side);
	const lines = r.kind === "text" ? splitLines(r.text) : [];
	const start = Math.max(1, page.start_line);
	const slice = lines.slice(start - 1, start - 1 + page.limit);
	return { path, side, kind: r.kind, lines: slice, start_line: start, total_lines: lines.length, truncated: start - 1 + slice.length < lines.length, metadata: r.metadata };
}

export async function readChanges(sources: ReviewSources, path: string, status: PathStatus, oldPath: string | null, context = 3): Promise<ChangePage> {
	const oldSide = await readSide(sources, oldPath ?? path, "old");
	const newSide = await readSide(sources, path, "new");
	const notes: string[] = [];
	const kind: ChangePage["kind"] = oldSide.kind === "text" || newSide.kind === "text" ? ([oldSide.kind, newSide.kind].some((k) => k === "binary") ? "binary" : [oldSide.kind, newSide.kind].some((k) => k === "too_large") ? "too_large" : "text") : oldSide.kind === "missing" ? newSide.kind : oldSide.kind;
	const metadata = { old: oldSide.metadata, new: newSide.metadata };
	if (kind !== "text") return { path, status, kind, hunks: [], intraline: {}, metadata, notes: [`no textual comparison for ${kind} content`] };
	if (status === "renamed?" && oldPath) notes.push(`rename hypothesis: similarity ${similarity(oldSide.text, newSide.text).toFixed(2)} with ${oldPath}`);
	const segs = diffLines(oldSide.text, newSide.text);
	const h = hunks(segs, context);
	const intra: ChangePage["intraline"] = {};
	for (const hk of h) for (let i = 0; i + 1 < hk.segments.length; i++) {
		const a = hk.segments[i]!;
		const b = hk.segments[i + 1]!;
		if (a.kind === "old" && b.kind === "new" && a.lines.length === b.lines.length) for (let j = 0; j < a.lines.length; j++) {
			const r = intraline(a.lines[j]!, b.lines[j]!);
			if (r) intra[`${a.old_start + j}:${b.new_start + j}`] = r;
		}
	}
	return { path, status, kind, hunks: h, intraline: intra, metadata, notes };
}

/** Strips terminal control sequences for display only; stored bytes are never altered (RM-046). */
export function neutralize(s: string): string {
	let out = "";
	for (const ch of s) {
		const c = ch.codePointAt(0)!;
		if (c === 0x1b) out += "␛";
		else if (c < 0x20 && c !== 0x09) out += `^${String.fromCharCode(c + 64)}`;
		else if (c === 0x7f) out += "^?";
		else if (c >= 0x80 && c <= 0x9f) out += "�";
		else out += ch;
	}
	return out.replace(/\t/g, "    ");
}
