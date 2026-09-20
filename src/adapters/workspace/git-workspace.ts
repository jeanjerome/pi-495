/**
 * Workspace repository (CMP-WSP, §9.1, §9.2): captures the reference, creates the isolated copy the
 * producer writes in, freezes a candidate from it and closes the space. The project is never written.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { chmod, cp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { canonicalize } from "../../contracts/canonical.ts";
import { digestBytes, digestValue } from "../../contracts/digest.ts";
import type { CandidateManifest, ManifestEntry, ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import { DomainError } from "../../domain/errors.ts";
import type { WorkspaceHandle, WorkspacePolicy, WorkspacePort } from "../../ports/execution.ts";
import { diffEntries, includedEntries, includedLimits, isExcluded, walkTree } from "./walk.ts";

const execFileAsync = promisify(execFile);

export const DEFAULT_WORKSPACE_POLICY: WorkspacePolicy = {
	exclusions: ["target/", "dist/", ".pi/", "__pycache__/", "build/"],
	max_file_bytes: 8 * 1024 * 1024,
	max_entries: 50_000,
};

export interface GitInfo {
	is_repo: boolean;
	head: string | null;
	branch: string | null;
	dirty_paths: string[];
}

export async function git(
	cwd: string,
	args: string[],
	allowFailure = false,
): Promise<{ stdout: string; stderr: string; code: number }> {
	try {
		const { stdout, stderr } = await execFileAsync("git", args, {
			cwd,
			maxBuffer: 64 * 1024 * 1024,
			env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
		});
		return { stdout, stderr, code: 0 };
	} catch (error) {
		const e = error as { stdout?: string; stderr?: string; code?: number };
		if (allowFailure)
			return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: typeof e.code === "number" ? e.code : 1 };
		throw error;
	}
}

export async function inspectGit(path: string): Promise<GitInfo> {
	const inside = await git(path, ["rev-parse", "--is-inside-work-tree"], true);
	if (inside.code !== 0 || inside.stdout.trim() !== "true")
		return { is_repo: false, head: null, branch: null, dirty_paths: [] };
	const top = await git(path, ["rev-parse", "--show-toplevel"], true);
	if (top.code !== 0 || realpathSync(top.stdout.trim()) !== realpathSync(path))
		return { is_repo: false, head: null, branch: null, dirty_paths: [] };
	const head = await git(path, ["rev-parse", "--verify", "HEAD"], true);
	const branch = await git(path, ["symbolic-ref", "--short", "-q", "HEAD"], true);
	const status = await git(path, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], true);
	const dirty = status.stdout
		.split("\0")
		.filter(Boolean)
		.map((line) => line.slice(3))
		.map((p) => p.split(" -> ").pop()!);
	return {
		is_repo: true,
		head: head.code === 0 ? head.stdout.trim() : null,
		branch: branch.code === 0 ? branch.stdout.trim() : null,
		dirty_paths: dirty,
	};
}

let wsCounter = 0;

/**
 * Workspace adapter: captures the reference (five entry situations of §9.1), materialises an
 * isolated copy and freezes the candidate from a complete inventory (ADR-011).
 */
export class GitWorkspace implements WorkspacePort {
	readonly root: string;
	private readonly legacyRoots: string[];
	constructor(root: string, legacyRoots: string[] = []) {
		this.root = root;
		this.legacyRoots = [...new Set(legacyRoots.filter((legacy) => resolve(legacy) !== resolve(root)))];
		mkdirSync(root, { recursive: true });
	}

	workspacePath(workspaceId: string): string {
		const current = join(this.root, workspaceId);
		if (existsSync(current)) return current;
		for (const legacy of this.legacyRoots) {
			const previous = join(legacy, workspaceId);
			if (existsSync(previous)) return previous;
		}
		return current;
	}

	async captureReference(projectPath: string, policy: WorkspacePolicy): Promise<ReferenceSnapshot> {
		const path = resolve(projectPath);
		if (!existsSync(path)) throw new DomainError("CONFIGURATION_ERROR", `project path does not exist: ${path}`);
		const info = await inspectGit(path);
		const walked = await walkTree(path, policy);
		const names = (await readdir(path)).filter((n) => n !== ".git");
		let kind: ReferenceSnapshot["kind"];
		if (!info.is_repo) kind = names.length === 0 ? "empty_directory" : "non_git_directory";
		else if (!info.head) kind = "git_no_head";
		else kind = info.dirty_paths.length === 0 ? "git_clean_head" : "git_dirty_head";
		const dirty = info.dirty_paths.map((p) => p.replace(/\/$/, ""));
		const entries: ManifestEntry[] = walked.entries.map((e) => {
			const isDirty = dirty.some((d) => e.path === d || e.path.startsWith(`${d}/`));
			const state: ManifestEntry["baseline_state"] =
				kind === "git_clean_head"
					? "unchanged"
					: kind === "git_dirty_head"
						? isDirty
							? "modified"
							: "unchanged"
						: "added";
			return {
				...e,
				baseline_state: state,
				origin: kind === "git_clean_head" ? "unknown" : state === "unchanged" ? "unknown" : "user",
			};
		});
		const treeDigest = digestValue(entries.map((e) => [e.path, e.kind, e.content_digest, e.mode, e.symlink_target]));
		return {
			reference_id: `ref_${treeDigest.slice(7, 19)}`,
			kind,
			project_path: path,
			head_commit: info.head,
			branch: info.branch,
			tree_digest: treeDigest,
			entries,
			exclusions: policy.exclusions,
			captured_at: new Date().toISOString(),
			limits: walked.limits,
		};
	}

	async createWorkspace(reference: ReferenceSnapshot, policy: WorkspacePolicy): Promise<WorkspaceHandle> {
		wsCounter++;
		const workspaceId = `ws_${Date.now().toString(36)}_${wsCounter.toString(36)}`;
		const path = this.workspacePath(workspaceId);
		await mkdir(path, { recursive: true });
		for (const e of reference.entries) {
			const target = join(path, e.path);
			if (isExcluded(e.path, policy.exclusions)) continue;
			await mkdir(dirname(target), { recursive: true });
			if (e.kind === "symlink" && e.symlink_target !== null) await symlink(e.symlink_target, target);
			else if (e.kind === "file") {
				await cp(join(reference.project_path, e.path), target, { force: true, dereference: false });
				await chmod(target, Number.parseInt(e.mode, 8));
			}
		}
		await git(path, ["init", "-q"], true);
		await writeFile(join(path, ".git", "info", "495-reference"), `${reference.reference_id}\n`).catch(() => undefined);
		return {
			workspace_id: workspaceId,
			path,
			reference_id: reference.reference_id,
			created_at: new Date().toISOString(),
		};
	}

	async snapshotCandidate(
		handle: WorkspaceHandle,
		reference: ReferenceSnapshot,
		policy: WorkspacePolicy,
	): Promise<CandidateManifest> {
		const walked = await walkTree(handle.path, policy);
		const referenceEntries = includedEntries(reference.entries, policy.exclusions);
		const referenceLimits = includedLimits(reference.entries, reference.limits, policy.exclusions);
		const entries = diffEntries(referenceEntries, walked.entries);
		const selected = entries.filter((e) => e.baseline_state !== "unchanged").map((e) => e.path);
		const digest = digestBytes(
			canonicalize({
				base_ref: reference.tree_digest,
				selected_paths: selected,
				exclusions: policy.exclusions,
				entries: entries.map((e) => [e.path, e.kind, e.content_digest, e.mode, e.symlink_target, e.baseline_state]),
				metadata_policy: "content_and_mode",
			}),
		);
		return {
			candidate_id: `cand_${digest.slice(7, 19)}`,
			workspace_id: handle.workspace_id,
			base_reference_id: reference.reference_id,
			base_digest: reference.tree_digest,
			selected_paths: selected,
			exclusions: policy.exclusions,
			entries,
			metadata_policy: "content_and_mode",
			manifest_digest: digest,
			frozen_at: new Date().toISOString(),
			limits: mergeLimits(referenceLimits, walked.limits),
		};
	}

	async closeWorkspace(workspaceId: string, retention: "keep" | "delete"): Promise<void> {
		if (retention === "delete") await rm(this.workspacePath(workspaceId), { recursive: true, force: true });
	}
}

function mergeLimits(a: ReferenceSnapshot["limits"], b: ReferenceSnapshot["limits"]): ReferenceSnapshot["limits"] {
	return {
		truncated: a.truncated || b.truncated,
		bytes_read: b.bytes_read,
		bytes_total: b.bytes_total,
		exclusions: [...new Set([...a.exclusions, ...b.exclusions])],
		unstable: a.unstable || b.unstable,
		notes: [...a.notes, ...b.notes],
	};
}
