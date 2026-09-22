/**
 * A bench for looking at the review inside a real Pi session.
 *
 * It registers `/bench-review`, which opens the review surface on a corpus made up here — no
 * workspace, no ledger, no model, nothing written anywhere. It exists to be looked at: what the
 * comparison looks like once `pix-pretty` has drawn it, at the terminal's real width, under the
 * theme the reader actually runs.
 *
 * It loads `dist/`, not `src/`, on purpose. What ships is compiled ESM that reaches the renderer
 * through a deferred `import()`, and how a host resolves that import is the one thing a test on
 * this machine cannot answer. Run `npm run build` first, then:
 *
 *     pi -e ./bench/review-bench.ts
 *     /bench-review
 *
 * The corpus is chosen to show the cases that have cost something before: a word changed inside a
 * line, `+` and `-` belonging to the code, a terminal escape sequence hidden in a reviewed file,
 * wide glyphs and combining accents, a line longer than the terminal, a deleted file, an added one
 * and a binary.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { diffLines, hunks } from "../dist/application/diff.js";
import { buildSnapshot, type ChangePage, type ContentPage } from "../dist/application/review.js";
import { digestValue } from "../dist/contracts/digest.js";
import type { CandidateManifest, ManifestEntry, ReferenceSnapshot } from "../dist/contracts/v1/candidate.js";
import { openReviewTui } from "../dist/extension/review-command.js";

const ESC = String.fromCharCode(27);

/** Two sides per path. The old side is what the reference holds, the new side what the candidate does. */
const SIDES: Record<string, { old: string; new: string }> = {
	"src/greet.ts": {
		old: [
			"export function greet(name: string): string {",
			"  return 'hello ' + name;",
			"}",
			"",
			"// budget = base + bonus - retenue",
			"export const budget = base + bonus - retenue;",
			"",
			"export const labels = ['naïve', 'coeur', 'résumé'];",
			"",
			"export const long = 'a line kept deliberately long so the renderer has to fold it somewhere, which is exactly what we want to look at';",
		].join("\n"),
		new: [
			"export function greet(name: string): string {",
			"  return `hello ${name}!`;",
			"}",
			"",
			"// budget = base + bonus - retenue - avance",
			"export const budget = base + bonus - retenue - avance;",
			"",
			"export const labels = ['naïve', 'cœur', 'résumé', '日本語', '🙂'];",
			"",
			"export const long = 'a line kept deliberately long so the renderer has to fold it somewhere, which is exactly what we want to look at, and now longer still';",
			"",
			`// ${ESC}[31mthis file tries to paint your terminal red${ESC}[0m`,
		].join("\n"),
	},
	"README.md": {
		old: ["# Projet", "", "Une phrase qui ne change pas.", "Une phrase qui change un seul mot."].join("\n"),
		new: ["# Projet", "", "Une phrase qui ne change pas.", "Une phrase qui change un autre mot."].join("\n"),
	},
	"src/removed.ts": { old: ["export const gone = true;", "export const alsoGone = 1;"].join("\n"), new: "" },
	"src/added.ts": { old: "", new: ["export const fresh = true;", "export const andMore = 2;"].join("\n") },
};

function entry(path: string, state: ManifestEntry["baseline_state"], over: Partial<ManifestEntry> = {}): ManifestEntry {
	return {
		path,
		kind: "file",
		content_digest: digestValue(path + state),
		size: 1,
		mode: "000644",
		symlink_target: null,
		baseline_state: state,
		origin: "unknown",
		limits: null,
		...over,
	};
}

const limits = { truncated: false, bytes_read: 0, bytes_total: 0, exclusions: [], unstable: false, notes: [] };

const reference: ReferenceSnapshot = {
	reference_id: "ref_bench",
	kind: "git_clean_head",
	project_path: "/bench",
	head_commit: "b".repeat(40),
	branch: "main",
	tree_digest: digestValue("bench"),
	entries: [
		entry("README.md", "unchanged"),
		entry("src/greet.ts", "unchanged"),
		entry("src/removed.ts", "unchanged"),
		entry("assets/logo.png", "unchanged"),
	],
	exclusions: [],
	captured_at: "2026-09-22T12:00:00Z",
	limits,
};

const manifest: CandidateManifest = {
	candidate_id: "cand_bench",
	workspace_id: "ws_bench",
	base_reference_id: reference.reference_id,
	base_digest: reference.tree_digest,
	selected_paths: [],
	exclusions: [],
	entries: [
		entry("README.md", "modified"),
		entry("src/greet.ts", "modified"),
		entry("src/removed.ts", "deleted"),
		entry("src/added.ts", "added"),
		entry("assets/logo.png", "modified"),
	],
	metadata_policy: "content_and_mode",
	manifest_digest: digestValue("manifest_bench"),
	frozen_at: "2026-09-22T12:05:00Z",
	limits,
};

const review = {
	snapshot: buildSnapshot({
		change_id: "chg_bench",
		reference,
		manifest,
		findings: [],
		newer_candidate: null,
		now: "2026-09-22T12:10:00Z",
	}),
	async changes(path: string): Promise<ChangePage> {
		if (path === "assets/logo.png")
			return {
				path,
				status: "modified",
				kind: "binary",
				hunks: [],
				intraline: {},
				metadata: { old: { size: 20_480 }, new: { size: 21_112 } },
				notes: ["contenu binaire : aucune comparaison textuelle"],
			};
		const sides = SIDES[path] ?? { old: "", new: "" };
		return {
			path,
			status: "modified",
			kind: "text",
			hunks: hunks(diffLines(sides.old, sides.new), 3),
			intraline: {},
			metadata: {},
			notes: [],
		};
	},
	async content(path: string, side: "old" | "new"): Promise<ContentPage> {
		const text = (SIDES[path] ?? { old: "", new: "" })[side];
		const lines = text === "" ? [] : text.split("\n");
		return {
			path,
			side,
			kind: path === "assets/logo.png" ? "binary" : "text",
			lines,
			start_line: 1,
			total_lines: lines.length,
			truncated: false,
			metadata: {},
		};
	},
};

export default function reviewBench(pi: ExtensionAPI): void {
	pi.registerCommand("bench-review", {
		description: "Opens the 495 review on a made-up corpus, to look at how a change is drawn",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("the bench needs the TUI: run it from an interactive pi session", "warning");
				return;
			}
			await openReviewTui(ctx, review, "fr");
		},
	});
}
