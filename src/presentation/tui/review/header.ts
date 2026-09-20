/**
 * ReviewHeader (§5.5): which change is being read, which reference it is compared to, which
 * candidate carries it, and whether what is shown is still current. A candidate newer than the one
 * on screen is said, with the key that reloads it, rather than silently showing stale work.
 */
import { neutralize } from "../../../application/review.ts";
import type { PaneContext } from "./view.ts";

export function renderHeader(ctx: PaneContext, width: number): string[] {
	const s = ctx.snapshot;
	const L = ctx.labels;
	const head = `${L.review} ${s.change_id} · ${L.ref} ${s.reference.head_commit ? s.reference.head_commit.slice(0, 10) : s.reference.kind} → ${L.cand} ${s.candidate ? `${s.candidate.candidate_id} (${s.candidate.manifest_digest.slice(7, 19)})` : L.none} · ${s.fresh ? L.fresh : ctx.styles.warn(`${L.newer} ${s.newer_candidate} (r)`)}${s.complete ? "" : ctx.styles.warn(` · ${L.incomplete}`)}`;
	const counts = `${L.counts}: A${s.counts.added} M${s.counts.modified} D${s.counts.deleted} R${s.counts.renamed + s.counts["renamed?"]} =${s.counts.intact} · ${ctx.view.changedOnly ? L.changedOnly : L.allPaths}${ctx.view.search ? ` · /${ctx.view.search}` : ""}`;
	return [ctx.styles.header(ctx.fit(neutralize(head), width)), ctx.styles.dim(ctx.fit(counts, width))];
}
