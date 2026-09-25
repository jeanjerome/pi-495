/**
 * ReviewContextPane (§5.5): what the selection is — its status, its path, the path it came from
 * when it was renamed — and the limits the comparison ran into on it. A limit is never dropped
 * from the line: a path the diff could not read must not look like a path with nothing to show.
 */
import { neutralize } from "../../../application/review.ts";
import type { PaneContext, Selection } from "./view.ts";

export function renderContext(ctx: PaneContext, node: Selection, width: number): string {
	const L = ctx.labels;
	const text = node
		? `${L.statuses[node.status]} · ${node.path}${node.old_path ? ` (${L.from} ${node.old_path})` : ""}${node.limits.length ? ` · ${ctx.styles.warn(node.limits.join("; "))}` : ""}`
		: L.noSelection;
	return ctx.styles.dim(ctx.fit(neutralize(text), width));
}
