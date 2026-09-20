import {
	flatten,
	neutralize,
	type ChangePage,
	type ContentPage,
	type PathStatus,
	type ReviewSnapshot,
} from "../../application/review.ts";

/** Textual review for print/JSON/RPC (UX-11, §10.6): same identities, statuses, portions and limits; no widget. */
export async function summarizeReview(
	review: {
		snapshot: ReviewSnapshot;
		changes(path: string, status: PathStatus, oldPath: string | null): Promise<ChangePage>;
		content(path: string, side: "old" | "new", start: number, limit: number): Promise<ContentPage>;
	},
	path: string | null,
	lang: "fr" | "en",
): Promise<string> {
	const s = review.snapshot;
	const L =
		lang === "fr"
			? {
					review: "Revue",
					reference: "référence",
					candidate: "candidat",
					none: "aucun",
					newer: "candidat plus récent",
					incomplete: "comparaison incomplète",
					old: "ANCIEN",
					new: "NOUVEAU",
					unchanged: "contexte",
					limits: "limites",
				}
			: {
					review: "Review",
					reference: "reference",
					candidate: "candidate",
					none: "none",
					newer: "newer candidate",
					incomplete: "incomplete comparison",
					old: "OLD",
					new: "NEW",
					unchanged: "context",
					limits: "limits",
				};
	const lines = [
		`${L.review} ${s.change_id} — ${L.reference} ${s.reference.head_commit?.slice(0, 10) ?? s.reference.kind} → ${L.candidate} ${s.candidate ? `${s.candidate.candidate_id} ${s.candidate.manifest_digest}` : L.none}${s.newer_candidate ? ` (${L.newer}: ${s.newer_candidate})` : ""}${s.complete ? "" : ` (${L.incomplete})`}`,
	];
	for (const r of flatten(s.root, true))
		if (r.node.kind !== "directory")
			lines.push(
				`${r.node.status.padEnd(9)} ${neutralize(r.node.path)}${r.node.old_path ? ` <- ${neutralize(r.node.old_path)}` : ""}${r.node.limits.length ? ` [${r.node.limits.join("; ")}]` : ""}`,
			);
	if (s.limits.length) lines.push(`${L.limits}: ${s.limits.join("; ")}`);
	if (path) {
		const node = flatten(s.root, false).find((r) => r.node.path === path)?.node;
		if (!node) lines.push(`${path}: not in the comparison`);
		else {
			const page = await review.changes(node.path, node.status, node.old_path);
			lines.push("", `${neutralize(node.path)} (${node.status}, ${page.kind})`);
			for (const n of page.notes) lines.push(`  ${n}`);
			for (const h of page.hunks) {
				lines.push(
					`  -- ${h.old_start}..${h.old_start + h.old_count - 1} -> ${h.new_start}..${h.new_start + h.new_count - 1}`,
				);
				for (const seg of h.segments) {
					lines.push(`  ${seg.kind === "old" ? L.old : seg.kind === "new" ? L.new : L.unchanged}:`);
					for (const l of seg.lines) lines.push(`    ${neutralize(l)}`);
				}
			}
		}
	}
	return lines.join("\n");
}
