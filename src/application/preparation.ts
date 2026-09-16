/**
 * Preparation of verification means (PF-06 steps 3-5, PRE-01 to PRE-03, SA-008, SA-009):
 * a `prepare` intervention proposes tests in the target technology; the kernel checks scope,
 * loadability and discriminance, then adopts (or not) the prepared files. The producer never
 * adopts its own proposal.
 */
import type { CandidateManifest, ReferenceSnapshot } from "../contracts/v1/candidate.ts";

export interface PreparedFile {
	path: string;
	digest: string;
	size_bytes: number;
}

export interface PreparationRecord {
	preparation_id: string;
	objective: string;
	allowed_paths: string[];
	files: PreparedFile[];
	/** Verdict of the prepared suite on the bare reference: FAIL means it detects the absent feature. */
	on_reference: "PASS" | "FAIL" | "INDETERMINATE" | "NOT_RUN" | "NOT_APPLICABLE";
	discriminant: boolean;
	loadable: boolean;
	qualified: boolean;
	notes: string[];
}

export const PREPARATION_PATHS: Record<"node" | "maven" | "unknown", string[]> = { node: ["test/", "tests/"], maven: ["src/test/"], unknown: [] };

export function preparedFilesFrom(manifest: CandidateManifest, allowed: string[]): { files: PreparedFile[]; out_of_scope: string[] } {
	const files: PreparedFile[] = [];
	const out: string[] = [];
	for (const e of manifest.entries) {
		if (e.baseline_state === "unchanged") continue;
		const inScope = allowed.some((a) => e.path.startsWith(a));
		if (!inScope) { out.push(e.path); continue; }
		if (e.baseline_state === "deleted" || e.kind !== "file" || !e.content_digest) { out.push(`${e.path} (${e.baseline_state})`); continue; }
		files.push({ path: e.path, digest: e.content_digest, size_bytes: e.size });
	}
	return { files, out_of_scope: out };
}

export function isProtectedPrepared(path: string, prepared: PreparationRecord | null, digest: string | null): boolean {
	if (!prepared) return false;
	const f = prepared.files.find((x) => x.path === path);
	return Boolean(f && f.digest === digest);
}

export function referenceHasTests(reference: ReferenceSnapshot, stack: "node" | "maven" | "unknown"): boolean {
	const dirs = PREPARATION_PATHS[stack];
	return reference.entries.some((e) => e.kind === "file" && dirs.some((d) => e.path.startsWith(d)) && /\.(test|spec)\.[cm]?[jt]s$|Test\.java$|_test\.[jt]s$/.test(e.path));
}
