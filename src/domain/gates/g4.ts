import type { CandidateManifest } from "../../contracts/v1/candidate.ts";
import type { CandidateFacts } from "../change/commands.ts";
import type { ChangeState } from "../change/state.ts";

export interface G4Result {
	verdict: "PASS" | "FAIL";
	reasons: string[];
	next_action: string;
}

/** G4 — the candidate is complete, in scope and did not alter a protected control (SEC-03, RM-043). */
export function evaluateG4(state: ChangeState, facts: CandidateFacts): G4Result {
	const reasons: string[] = [];
	if (!facts.complete) reasons.push(`candidate observation incomplete: ${facts.limits_notes.join("; ") || "unknown limit"}`);
	for (const p of facts.altered_protected_paths) reasons.push(`protected path altered by the producer: ${p}`);
	const allowed = state.mandate?.allowed_paths ?? [];
	const outOfScope = new Set(facts.out_of_scope_paths);
	if (allowed.length > 0) for (const p of facts.changed_paths) if (!allowed.some((a) => matchesScope(p, a))) outOfScope.add(p);
	for (const p of outOfScope) reasons.push(`path outside the mandate scope: ${p}`);
	const allowedProtected = new Set(facts.allowed_protected_paths);
	if (state.protocol) for (const p of facts.changed_paths) if (state.protocol.protected_paths.some((pp) => matchesScope(p, pp)) && !facts.altered_protected_paths.includes(p) && !allowedProtected.has(p)) reasons.push(`protected path altered by the producer: ${p}`);
	if (reasons.length === 0) return { verdict: "PASS", reasons: [], next_action: "verify" };
	return { verdict: "FAIL", reasons: [...new Set(reasons)], next_action: "correct_or_reject" };
}

/** Scope entries are directory prefixes (`src/`), exact files, or simple `*` globs on one segment. */
export function matchesScope(path: string, pattern: string): boolean {
	if (pattern === "" || pattern === "." || pattern === "**") return true;
	if (pattern.endsWith("/")) return path === pattern.slice(0, -1) || path.startsWith(pattern);
	if (pattern.includes("*")) {
		const re = new RegExp(`^${pattern.split("**").map((p) => p.split("*").map(escapeRe).join("[^/]*")).join(".*")}$`);
		return re.test(path);
	}
	return path === pattern || path.startsWith(`${pattern}/`);
}

function escapeRe(s: string): string {
	return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

export interface ProtectedPaths {
	/** Every path this candidate changed, whatever it is. */
	changed: string[];
	/** Changes to a protected path the frozen protocol allows. */
	allowed: string[];
	/** Changes to a protected path nothing allows: the producer altered an oracle. */
	altered: string[];
}

/**
 * Splits what a candidate changed against the paths the frozen protocol protects (SEC-03, RM-043).
 * Three changes to a protected path are allowed: a prepared file put back exactly as the kernel
 * adopted it, which the producer did not touch; a file added under a protected directory, which
 * took nothing away from an oracle that already stood; and whatever `alsoAllowed` recognizes, which
 * is where a target's own layout conventions are read rather than written into the kernel.
 */
export function protectedPathsChanged(manifest: CandidateManifest, protectedPaths: readonly string[], preparedFiles: readonly { path: string; digest: string }[], alsoAllowed: (path: string) => boolean = () => false): ProtectedPaths {
	const entryOf = (path: string) => manifest.entries.find((e) => e.path === path);
	const changed = manifest.entries.filter((e) => e.baseline_state !== "unchanged").map((e) => e.path);
	const allowed = changed.filter((p) => {
		const entry = entryOf(p);
		const prepared = preparedFiles.find((f) => f.path === p);
		if (prepared && prepared.digest === (entry?.content_digest ?? null)) return true;
		if (entry?.baseline_state === "added" && protectedPaths.some((pattern) => pattern.endsWith("/") && matchesScope(p, pattern))) return true;
		return alsoAllowed(p);
	});
	const altered = changed.filter((p) => protectedPaths.some((pattern) => matchesScope(p, pattern) && (!pattern.endsWith("/") || entryOf(p)?.baseline_state !== "added")) && !allowed.includes(p));
	return { changed, allowed, altered };
}
