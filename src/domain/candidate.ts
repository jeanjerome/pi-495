/**
 * The frozen candidate, and what may touch it while it is measured (VER-03).
 *
 * Evidence is about the snapshot the protocol froze and about nothing else. A control that writes to
 * the tree during the measurement leaves a candidate that is no longer that one, so its facts prove
 * nothing about it — the requirement asks such a control to use a disposable space or to produce a
 * new candidate to verify again.
 *
 * What a control declares writable is not such a write: a build leaves its outputs there, and that
 * declaration is frozen with the protocol where the producer cannot reach it. Both sides of the
 * comparison are therefore read with those paths left out, and only a difference elsewhere counts.
 */
import { canonicalize } from "../contracts/canonical.ts";
import type { CandidateManifest } from "../contracts/v1/candidate.ts";
import type { ControlDefinition } from "../contracts/v1/protocol.ts";

/** What the controls of a frozen protocol declare writable, as directory prefixes. */
export function writablePrefixes(controls: readonly ControlDefinition[]): string[] {
	return controls.flatMap((c) => c.writable_paths.map((p) => (p.endsWith("/") ? p : `${p}/`)));
}

/** Paths and contents of a tree, the writable declarations left out: what two passes must agree on. */
function comparableTree(entries: CandidateManifest["entries"], writable: readonly string[]): string {
	return canonicalize(
		entries.filter((e) => !writable.some((w) => e.path.startsWith(w))).map((e) => [e.path, e.content_digest]),
	);
}

/**
 * Whether `observed` is a different tree from the candidate `frozen` identifies, once what the
 * controls declared writable is left out of both. A difference is only a mutation when it sits
 * outside those declarations. The digest comparison is a shortcut on the same answer, not a rule of
 * its own: two manifests with the same digest hold the same entries.
 */
export function candidateMoved(
	frozen: CandidateManifest,
	observed: CandidateManifest,
	writable: readonly string[],
): boolean {
	if (observed.manifest_digest === frozen.manifest_digest) return false;
	return comparableTree(observed.entries, writable) !== comparableTree(frozen.entries, writable);
}
