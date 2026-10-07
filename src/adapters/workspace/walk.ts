/**
 * Candidate observer (CMP-CAN, §9.3): the complete manifest of a tree — additions, deletions, modes,
 * links and untracked files — and the identity derived from it.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import type { ManifestEntry } from "../../contracts/v1/candidate.ts";
import type { Limits } from "../../contracts/v1/evidence.ts";
import { inInstalledDependencies, matchesScope } from "../../domain/gates/g4.ts";
import { messageOf } from "../../domain/errors.ts";
import { git } from "./git.ts";

export interface WalkOptions {
	exclusions: string[];
	installed_dependencies: readonly string[];
	max_file_bytes: number;
	max_entries: number;
}

export interface WalkResult {
	entries: ManifestEntry[];
	limits: Limits;
}

function toPosix(p: string): string {
	return sep === "/" ? p : p.split(sep).join(posix.sep);
}

/**
 * Whether `path` is left out of a copy by `exclusions`. `installedDependencies` are the directories the technologies
 * of the list install their dependencies in.
 */
export function isExcluded(path: string, exclusions: string[], installedDependencies: readonly string[]): boolean {
	if (path.split("/").some((segment) => segment === ".DS_Store" || segment.startsWith("._"))) return true;
	return exclusions.some((pattern) => {
		if (matchesScope(path, pattern)) return true;
		const normalized = pattern.replace(/^\.\//, "");
		if (!normalized.endsWith("/")) return false;
		const directory = normalized.slice(0, -1);
		if (!directory || directory.includes("/") || directory.includes("*")) return false;
		// A dependency ships its own `dist/` or `build/`, which its imports resolve to: the name only
		// excludes a project directory, so it stops applying below the installed dependencies. Their directory
		// itself is the one name that still matches at the segment that opens them.
		const segments = path.split("/");
		const dependencies = segments.findIndex((segment) => installedDependencies.includes(segment));
		const inProject =
			dependencies === -1 ? segments : segments.slice(0, dependencies + (directory === segments[dependencies] ? 1 : 0));
		return inProject.includes(directory);
	});
}

/** Filters persisted snapshot entries with the active exclusion semantics. */
export function includedEntries(
	entries: readonly ManifestEntry[],
	exclusions: string[],
	installedDependencies: readonly string[],
): ManifestEntry[] {
	return entries.filter((entry) => !isExcluded(entry.path, exclusions, installedDependencies));
}

/** Removes obsolete limit diagnostics that refer exclusively to excluded paths. */
export function includedLimits(
	entries: readonly ManifestEntry[],
	limits: Limits,
	exclusions: string[],
	installedDependencies: readonly string[],
): Limits {
	const limitPath = (note: string): string | null =>
		note.match(/^(.+) exceeds \d+ bytes$/)?.[1] ?? note.match(/^unreadable directory (.+?): /)?.[1] ?? null;
	const notes = limits.notes.filter((note) => {
		const path = limitPath(note);
		return path === null || !isExcluded(path, exclusions, installedDependencies);
	});
	const retainedEntryLimit = includedEntries(entries, exclusions, installedDependencies).some(
		(entry) => entry.limits?.truncated,
	);
	const retainedGlobalLimit = limits.truncated && (limits.notes.length === 0 || notes.length > 0);
	return { ...limits, truncated: Boolean(retainedEntryLimit || retainedGlobalLimit), notes };
}

/**
 * Deterministic inventory of a directory: sorted by normalised path, each entry with kind, digest,
 * size, mode, symlink target. No `.git`, at any depth, is part of the application content (§9.1). A file above
 * the size limit, outside the installed dependencies, is inventoried without digest and the limit is reported
 * (AT-12).
 */
export async function walkTree(root: string, options: WalkOptions): Promise<WalkResult> {
	const entries: ManifestEntry[] = [];
	const limits: Limits = {
		truncated: false,
		bytes_read: 0,
		bytes_total: 0,
		exclusions: [...options.exclusions],
		unstable: false,
		notes: [],
	};
	const stack: string[] = [root];
	while (stack.length > 0) {
		const dir = stack.pop()!;
		let names: string[];
		try {
			names = await readdir(dir);
		} catch (error) {
			limits.notes.push(`unreadable directory ${toPosix(relative(root, dir))}: ${messageOf(error)}`);
			limits.truncated = true;
			continue;
		}
		for (const name of names.sort()) {
			const abs = join(dir, name);
			const rel = toPosix(relative(root, abs));
			// A `.git`, at the root or below it — a submodule's file pointing into the parent repository, a
			// nested repository's directory — is Git's plumbing, never application content.
			if (name === ".git") continue;
			if (isExcluded(rel, options.exclusions, options.installed_dependencies)) continue;
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
				entries.push({
					path: rel,
					kind: "symlink",
					content_digest: `sha256:${createHash("sha256").update(target).digest("hex")}`,
					size: Buffer.byteLength(target),
					mode,
					symlink_target: target,
					baseline_state: "unchanged",
					origin: "unknown",
					limits: null,
				});
				continue;
			}
			if (st.isDirectory()) {
				if (existsSync(join(abs, ".git"))) entries.push(await submoduleEntry(rel, abs, mode));
				stack.push(abs);
				continue;
			}
			// A special file has no content to leave out: its kind, mode and state are observed whole.
			if (!st.isFile()) {
				entries.push({
					path: rel,
					kind: "special",
					content_digest: null,
					size: 0,
					mode,
					symlink_target: null,
					baseline_state: "unchanged",
					origin: "unknown",
					limits: {
						truncated: false,
						bytes_read: 0,
						bytes_total: null,
						exclusions: [],
						unstable: false,
						notes: ["special file: not read"],
					},
				});
				continue;
			}
			limits.bytes_total = (limits.bytes_total ?? 0) + st.size;
			// An installed dependency ships native binaries and bundles that are read whole; the entry
			// limit still bounds how many files it adds.
			if (st.size > options.max_file_bytes && !inInstalledDependencies(rel, options.installed_dependencies)) {
				entries.push({
					path: rel,
					kind: "file",
					content_digest: null,
					size: st.size,
					mode,
					symlink_target: null,
					baseline_state: "unchanged",
					origin: "unknown",
					limits: {
						truncated: true,
						bytes_read: 0,
						bytes_total: st.size,
						exclusions: [],
						unstable: false,
						notes: [`file exceeds ${options.max_file_bytes} bytes; not digested`],
					},
				});
				limits.truncated = true;
				limits.notes.push(`${rel} exceeds ${options.max_file_bytes} bytes`);
				continue;
			}
			const bytes = await readFile(abs);
			limits.bytes_read += bytes.byteLength;
			entries.push({
				path: rel,
				kind: "file",
				content_digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
				size: bytes.byteLength,
				mode,
				symlink_target: null,
				baseline_state: "unchanged",
				origin: "unknown",
				limits: null,
			});
		}
	}
	entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { entries, limits };
}

/**
 * The boundary of a repository below the root — a submodule, or a nested repository — with the commit
 * it has checked out. Its files belong to that repository, and stay inventoried as files of their own.
 */
async function submoduleEntry(rel: string, abs: string, mode: string): Promise<ManifestEntry> {
	let note: string;
	let commit: string | null = null;
	try {
		const { stdout } = await git(abs, ["rev-parse", "--verify", "HEAD"]);
		commit = stdout.trim();
		note = `submodule at commit ${commit}`;
	} catch (error) {
		note = `submodule without a readable commit: ${messageOf(error)}`;
	}
	return {
		path: rel,
		kind: "submodule",
		content_digest: commit === null ? null : `sha256:${createHash("sha256").update(commit).digest("hex")}`,
		size: 0,
		mode,
		symlink_target: null,
		baseline_state: "unchanged",
		origin: "unknown",
		limits: { truncated: false, bytes_read: 0, bytes_total: null, exclusions: [], unstable: false, notes: [note] },
	};
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
		else if (
			r.content_digest !== c.content_digest ||
			r.symlink_target !== c.symlink_target ||
			(r.content_digest === null && c.content_digest === null && r.size !== c.size)
		)
			out.push({ ...c, baseline_state: "modified", origin: "agent" });
		else if (r.mode !== c.mode) out.push({ ...c, baseline_state: "mode_changed", origin: "agent" });
		else out.push({ ...c, baseline_state: "unchanged", origin: r.origin });
	}
	for (const r of reference) if (!seen.has(r.path)) out.push({ ...r, baseline_state: "deleted", origin: "agent" });
	out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return out;
}
