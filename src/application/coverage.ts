/**
 * Lines the candidate introduces (QLT-04).
 *
 * A ratio over a whole tree measures the hygiene of a repository, not a change: it blocks a
 * component that was already below the line whatever the candidate does, and lets an untested
 * addition through as soon as the rest compensates. What a change owes is stated on the lines it
 * wrote, so that is what is computed here and handed to the differential controls.
 *
 * The computation is offline and reproducible: both sides come from the content-addressed store —
 * the candidate bytes of `files_<candidate_id>` and the reference bytes of
 * `base_files_<candidate_id>` — so an exported dossier can be replayed without the project, the
 * workspace or a model.
 */
import type { CandidateManifest } from "../contracts/v1/candidate.ts";
import type { IntroducedLines } from "../ports/execution.ts";
import { diffLines, splitLines } from "./diff.ts";

/** Bytes above this are not diffed: a line map of a multi-megabyte file is not worth its cost. */
export const MAX_DIFFED_BYTES = 2 * 1024 * 1024;

export interface IntroducedLinesResult {
	lines: IntroducedLines;
	/** Paths left out, with the reason: the control must know what was not measured. */
	notes: string[];
}

/** A file the candidate added: every line of it is introduced. */
export function linesOfAddedFile(text: string): number[] {
	const count = splitLines(text).length;
	return Array.from({ length: count }, (_line, index) => index + 1);
}

/** Introduced lines of the files a witness workspace writes on top of the reference. */
export function introducedByAddedFiles(files: Record<string, string>): IntroducedLines {
	const out: IntroducedLines = {};
	for (const [path, text] of Object.entries(files)) {
		const lines = linesOfAddedFile(text);
		if (lines.length > 0) out[path] = lines;
	}
	return out;
}

/** Lines of `candidateText` that no line of `referenceText` accounts for, ascending. */
export function introducedLines(referenceText: string, candidateText: string): number[] {
	const out: number[] = [];
	for (const segment of diffLines(referenceText, candidateText)) {
		if (segment.kind !== "new") continue;
		for (let i = 0; i < segment.lines.length; i++) out.push(segment.new_start + i);
	}
	return out;
}

/** A tree carries bytes that are not text; a diff of them would be meaningless, not empty. */
function isBinary(bytes: Uint8Array): boolean {
	const n = Math.min(bytes.byteLength, 8000);
	for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
	return false;
}

export interface BytesSource {
	/** The bytes of a path on one side, or null when that side does not hold it. */
	(path: string): Promise<Uint8Array | null>;
}

/**
 * The introduced lines of a frozen candidate, path by path.
 *
 * A file the manifest proves was moved without a byte changing is diffed against its former name,
 * so a rename introduces nothing — QLT-04 forbids a move from hiding a debt, and equally forbids it
 * from manufacturing one. A rename the manifest cannot prove leaves the file read as an addition:
 * the limit is reported, never guessed.
 */
export async function introducedLinesOf(manifest: CandidateManifest, renames: ReadonlyMap<string, string>, reference: BytesSource, candidate: BytesSource): Promise<IntroducedLinesResult> {
	const formerName = new Map([...renames].map(([from, to]) => [to, from] as const));
	const lines: IntroducedLines = {};
	const notes: string[] = [];
	for (const entry of manifest.entries) {
		if (entry.kind !== "file" || entry.content_digest === null) continue;
		// `type_changed` is a file the reference held as something else — a symlink turned into source:
		// it has no reference text, so every one of its lines is introduced, like an addition.
		if (entry.baseline_state !== "added" && entry.baseline_state !== "modified" && entry.baseline_state !== "type_changed") continue;
		if (entry.size > MAX_DIFFED_BYTES) { notes.push(`${entry.path}: ${entry.size} bytes, above the ${MAX_DIFFED_BYTES} byte diff limit`); continue; }
		const candidateBytes = await candidate(entry.path);
		if (!candidateBytes) { notes.push(`${entry.path}: candidate bytes unavailable`); continue; }
		if (isBinary(candidateBytes)) continue;
		const former = formerName.get(entry.path) ?? (entry.baseline_state === "modified" ? entry.path : null);
		const referenceBytes = former === null ? null : await reference(former);
		if (former !== null && !referenceBytes) { notes.push(`${entry.path}: reference bytes of ${former} unavailable, read as an addition`); }
		if (referenceBytes && isBinary(referenceBytes)) continue;
		const introduced = introducedLines(referenceBytes ? new TextDecoder().decode(referenceBytes) : "", new TextDecoder().decode(candidateBytes));
		if (introduced.length > 0) lines[entry.path] = introduced;
	}
	return { lines, notes };
}
