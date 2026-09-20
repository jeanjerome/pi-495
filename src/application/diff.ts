/**
 * Line diff (Myers) and intraline highlighting (common prefix/suffix), decision D-06.
 * Segments are typed; presenters render OLD/NEW blocks without `+`/`-` prefixes (UX-07).
 */
export type Segment =
	| { kind: "unchanged"; old_start: number; new_start: number; lines: string[] }
	| { kind: "old"; old_start: number; lines: string[] }
	| { kind: "new"; new_start: number; lines: string[] };

export interface Hunk {
	old_start: number;
	old_count: number;
	new_start: number;
	new_count: number;
	segments: Segment[];
}

export function splitLines(text: string): string[] {
	if (text === "") return [];
	const lines = text.split("\n");
	if (lines[lines.length - 1] === "") lines.pop();
	return lines;
}

type Op = { type: "eq" | "del" | "ins"; a: number; b: number };

/** Myers O(ND) diff producing an edit script over lines. */
export function myers(a: readonly string[], b: readonly string[]): Op[] {
	const n = a.length;
	const m = b.length;
	const max = n + m;
	const v = new Map<number, number>();
	v.set(1, 0);
	const trace: Map<number, number>[] = [];
	outer: for (let d = 0; d <= max; d++) {
		const snapshot = new Map(v);
		trace.push(snapshot);
		for (let k = -d; k <= d; k += 2) {
			let x: number;
			if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) x = v.get(k + 1) ?? 0;
			else x = (v.get(k - 1) ?? 0) + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}
			v.set(k, x);
			if (x >= n && y >= m) break outer;
		}
	}
	const ops: Op[] = [];
	let x = n;
	let y = m;
	for (let d = trace.length - 1; d >= 0; d--) {
		const vd = trace[d]!;
		const k = x - y;
		let prevK: number;
		if (k === -d || (k !== d && (vd.get(k - 1) ?? 0) < (vd.get(k + 1) ?? 0))) prevK = k + 1;
		else prevK = k - 1;
		const prevX = vd.get(prevK) ?? 0;
		const prevY = prevX - prevK;
		while (x > prevX && y > prevY) {
			ops.push({ type: "eq", a: x - 1, b: y - 1 });
			x--;
			y--;
		}
		if (d > 0) {
			if (x === prevX) {
				ops.push({ type: "ins", a: x, b: y - 1 });
				y--;
			} else {
				ops.push({ type: "del", a: x - 1, b: y });
				x--;
			}
		}
	}
	return ops.reverse();
}

export function diffLines(oldText: string, newText: string): Segment[] {
	const a = splitLines(oldText);
	const b = splitLines(newText);
	const ops = myers(a, b);
	const segments: Segment[] = [];
	let i = 0;
	while (i < ops.length) {
		const op = ops[i]!;
		if (op.type === "eq") {
			const seg: Segment = { kind: "unchanged", old_start: op.a + 1, new_start: op.b + 1, lines: [] };
			while (i < ops.length && ops[i]!.type === "eq") {
				seg.lines.push(a[ops[i]!.a]!);
				i++;
			}
			segments.push(seg);
			continue;
		}
		const dels: Op[] = [];
		const inss: Op[] = [];
		while (i < ops.length && ops[i]!.type !== "eq") {
			(ops[i]!.type === "del" ? dels : inss).push(ops[i]!);
			i++;
		}
		if (dels.length) segments.push({ kind: "old", old_start: dels[0]!.a + 1, lines: dels.map((d) => a[d.a]!) });
		if (inss.length) segments.push({ kind: "new", new_start: inss[0]!.b + 1, lines: inss.map((d) => b[d.b]!) });
	}
	return segments;
}

/** Groups segments into hunks with `context` unchanged lines around each change. */
export function hunks(segments: Segment[], context = 3): Hunk[] {
	const out: Hunk[] = [];
	let current: Hunk | null = null;
	const close = () => {
		if (current) {
			out.push(current);
			current = null;
		}
	};
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i]!;
		if (seg.kind === "unchanged") {
			if (!current) {
				const next = segments[i + 1];
				if (!next) break;
				const tail = seg.lines.slice(Math.max(0, seg.lines.length - context));
				current = {
					old_start: seg.old_start + seg.lines.length - tail.length,
					old_count: 0,
					new_start: seg.new_start + seg.lines.length - tail.length,
					new_count: 0,
					segments: [],
				};
				if (tail.length)
					current.segments.push({
						kind: "unchanged",
						old_start: current.old_start,
						new_start: current.new_start,
						lines: tail,
					});
				current.old_count += tail.length;
				current.new_count += tail.length;
			} else if (seg.lines.length > context * 2) {
				const head = seg.lines.slice(0, context);
				current.segments.push({ kind: "unchanged", old_start: seg.old_start, new_start: seg.new_start, lines: head });
				current.old_count += head.length;
				current.new_count += head.length;
				close();
				const next = segments[i + 1];
				if (!next) break;
				const tail = seg.lines.slice(seg.lines.length - context);
				current = {
					old_start: seg.old_start + seg.lines.length - context,
					old_count: tail.length,
					new_start: seg.new_start + seg.lines.length - context,
					new_count: tail.length,
					segments: [
						{
							kind: "unchanged",
							old_start: seg.old_start + seg.lines.length - context,
							new_start: seg.new_start + seg.lines.length - context,
							lines: tail,
						},
					],
				};
			} else {
				current.segments.push(seg);
				current.old_count += seg.lines.length;
				current.new_count += seg.lines.length;
			}
			continue;
		}
		if (!current)
			current = {
				old_start: seg.kind === "old" ? seg.old_start : 1,
				old_count: 0,
				new_start: seg.kind === "new" ? seg.new_start : 1,
				new_count: 0,
				segments: [],
			};
		current.segments.push(seg);
		if (seg.kind === "old") current.old_count += seg.lines.length;
		else current.new_count += seg.lines.length;
	}
	close();
	return out;
}

/** Intraline: common prefix/suffix of a replaced line pair; only reported when the change is a small middle span. */
export function intraline(oldLine: string, newLine: string): { old: [number, number]; new: [number, number] } | null {
	let p = 0;
	while (p < oldLine.length && p < newLine.length && oldLine[p] === newLine[p]) p++;
	let s = 0;
	while (
		s < oldLine.length - p &&
		s < newLine.length - p &&
		oldLine[oldLine.length - 1 - s] === newLine[newLine.length - 1 - s]
	)
		s++;
	const oldSpan = oldLine.length - p - s;
	const newSpan = newLine.length - p - s;
	if (p + s === 0) return null;
	if (oldSpan > oldLine.length * 0.6 && newSpan > newLine.length * 0.6) return null;
	return { old: [p, oldLine.length - s], new: [p, newLine.length - s] };
}

/** Similarity ratio of two texts by common lines (rename heuristic). */
export function similarity(a: string, b: string): number {
	const la = splitLines(a);
	const lb = splitLines(b);
	if (la.length === 0 && lb.length === 0) return 1;
	const eq = myers(la, lb).filter((o) => o.type === "eq").length;
	return (2 * eq) / (la.length + lb.length);
}
