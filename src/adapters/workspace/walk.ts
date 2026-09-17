import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import type { ManifestEntry } from "../../contracts/v1/candidate.ts";
import type { Limits } from "../../contracts/v1/evidence.ts";
import { matchesScope } from "../../domain/gates/g4.ts";

export interface WalkOptions {
	exclusions: string[];
	max_file_bytes: number;
	max_entries: number;
}

export interface WalkResult {
	entries: ManifestEntry[];
	limits: Limits;
}

export function toPosix(p: string): string {
	return sep === "/" ? p : p.split(sep).join(posix.sep);
}

export function isExcluded(path: string, exclusions: string[]): boolean {
	return exclusions.some((pattern) => {
		if (matchesScope(path, pattern)) return true;
		const normalized = pattern.replace(/^\.\//, "");
		if (!normalized.endsWith("/")) return false;
		const directory = normalized.slice(0, -1);
		if (!directory || directory.includes("/") || directory.includes("*")) return false;
		return path.split("/").includes(directory);
	});
}

/** Filters persisted snapshot entries with the active exclusion semantics. */
export function includedEntries(entries: readonly ManifestEntry[], exclusions: string[]): ManifestEntry[] {
	return entries.filter((entry) => !isExcluded(entry.path, exclusions));
}

/**
 * Deterministic inventory of a directory: sorted by normalised path, each entry with kind, digest,
 * size, mode, symlink target. `.git` is never part of the application content (§9.1). A file above
 * the size limit is inventoried without digest and the limit is reported (AT-12).
 */
export async function walkTree(root: string, options: WalkOptions): Promise<WalkResult> {
	const entries: ManifestEntry[] = [];
	const limits: Limits = { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [...options.exclusions], unstable: false, notes: [] };
	const stack: string[] = [root];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let names: string[];
		try {
			names = await readdir(dir);
		} catch (error) {
			limits.notes.push(`unreadable directory ${toPosix(relative(root, dir))}: ${(error as Error).message}`);
			limits.truncated = true;
			continue;
		}
		for (const name of names.sort()) {
			// Finder metadata is host noise: it is neither reference content nor an agent change.
			if (name === ".DS_Store" || name.startsWith("._")) continue;
			const abs = join(dir, name);
			const rel = toPosix(relative(root, abs));
			if (rel === ".git" || rel.startsWith(".git/")) continue;
			if (isExcluded(rel, options.exclusions)) continue;
			if (entries.length >= options.max_entries) {
				limits.truncated = true;
				limits.notes.push(`entry limit ${options.max_entries} reached`);
				stack.length = 0;
				break;
			}
			const st = await lstat(abs);
			const mode = (st.mode & 0o777).toString(8).padStart(6, "0");
			if (st.isSymbolicLink()) {
				const target = await readlink(abs);
				entries.push({ path: rel, kind: "symlink", content_digest: `sha256:${createHash("sha256").update(target).digest("hex")}`, size: Buffer.byteLength(target), mode, symlink_target: target, baseline_state: "unchanged", origin: "unknown", limits: null });
				continue;
			}
			if (st.isDirectory()) {
				stack.push(abs);
				continue;
			}
			if (!st.isFile()) {
				entries.push({ path: rel, kind: "special", content_digest: null, size: 0, mode, symlink_target: null, baseline_state: "unchanged", origin: "unknown", limits: { truncated: true, bytes_read: 0, bytes_total: null, exclusions: [], unstable: false, notes: ["special file: not read"] } });
				continue;
			}
			limits.bytes_total = (limits.bytes_total ?? 0) + st.size;
			if (st.size > options.max_file_bytes) {
				entries.push({ path: rel, kind: "file", content_digest: null, size: st.size, mode, symlink_target: null, baseline_state: "unchanged", origin: "unknown", limits: { truncated: true, bytes_read: 0, bytes_total: st.size, exclusions: [], unstable: false, notes: [`file exceeds ${options.max_file_bytes} bytes; not digested`] } });
				limits.truncated = true;
				limits.notes.push(`${rel} exceeds ${options.max_file_bytes} bytes`);
				continue;
			}
			const bytes = await readFile(abs);
			limits.bytes_read += bytes.byteLength;
			entries.push({ path: rel, kind: "file", content_digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, size: bytes.byteLength, mode, symlink_target: null, baseline_state: "unchanged", origin: "unknown", limits: null });
		}
	}
	entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { entries, limits };
}

/** Diff two inventories: marks each candidate entry relative to the reference, adds deletions. */
export function diffEntries(reference: readonly ManifestEntry[], candidate: readonly ManifestEntry[]): ManifestEntry[] {
	const ref = new Map(reference.map((e) => [e.path, e] as const));
	const out: ManifestEntry[] = [];
	const seen = new Set<string>();
	for (const c of candidate) {
		seen.add(c.path);
		const r = ref.get(c.path);
		if (!r) out.push({ ...c, baseline_state: "added", origin: "agent" });
		else if (r.kind !== c.kind) out.push({ ...c, baseline_state: "type_changed", origin: "agent" });
		else if (r.content_digest !== c.content_digest || r.symlink_target !== c.symlink_target || (r.content_digest === null && c.content_digest === null && r.size !== c.size)) out.push({ ...c, baseline_state: "modified", origin: "agent" });
		else if (r.mode !== c.mode) out.push({ ...c, baseline_state: "mode_changed", origin: "agent" });
		else out.push({ ...c, baseline_state: "unchanged", origin: r.origin });
	}
	for (const r of reference) if (!seen.has(r.path)) out.push({ ...r, baseline_state: "deleted", origin: "agent" });
	out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return out;
}
