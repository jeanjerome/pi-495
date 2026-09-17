/**
 * F-LARGE — the corpus the three deferred review parameters were decided on, and the trees and
 * files that exercise them (`specification-fonctionnelle.md` §16).
 *
 * The numbers are a measurement, not a guess: they come from the 495 repository itself at the
 * revision named below, which is the only tree this package has ever reviewed at size. They are
 * frozen here so the decisions stay reproducible; re-measuring a different corpus is a revision of
 * the decision, not a fix to a test.
 *
 *   git ls-files | awk '{print length($0)}'                       → paths
 *   git ls-files | xargs -n1 basename | awk '{print length($0)}'  → names
 *   git ls-files | awk -F/ '{print NF-1}'                         → depth
 *   git ls-files '*.ts' | xargs cat | awk '{print length($0)}'    → lines
 */
export const REVIEW_CORPUS = {
	revision: "d46e0d9",
	/** Tracked paths in the corpus. */
	paths: 170,
	/** Deepest path: `docs/amont/conception-technique.md` and its neighbours sit three levels down. */
	max_depth: 3,
	/** File name length, in characters. */
	name: { p50: 15, p90: 23, p95: 26, max: 39 },
	/** Source line length, in characters. */
	line: { p50: 43, p90: 130, p95: 169, max: 1156 },
} as const;

/** A name of exactly `length` characters, ending in a suffix a reviewer would have to read to tell two files apart. */
export function nameOfLength(length: number, suffix = "-adapter.ts"): string {
	return `${"x".repeat(Math.max(1, length - suffix.length))}${suffix}`;
}

/** A changed path as deep and as long as the corpus's 95th percentile: what the tree column must show whole. */
export function deepestChangedPath(): string {
	return `${Array.from({ length: REVIEW_CORPUS.max_depth }, (_, i) => `d${i}`).join("/")}/${nameOfLength(REVIEW_CORPUS.name.p95)}`;
}

/** A file of `count` lines, each at the corpus median width: the shape a paged reader walks through. */
export function tallFile(count: number, width = REVIEW_CORPUS.line.p50): string {
	return `${Array.from({ length: count }, (_, i) => `${String(i + 1).padStart(6, "0")} ${"y".repeat(Math.max(0, width - 7))}`).join("\n")}\n`;
}
