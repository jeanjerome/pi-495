/**
 * Completeness of the traceability matrix (docs/README.md: `TRACEABILITY.md` names every upstream
 * requirement, covered or explicitly not covered). Every `[P0]` identifier declared in
 * docs/amont/expression-besoins.md — `####` for functional requirements, `###` for NFR-01..08 —
 * must appear in the first column of one of the two tables of docs/TRACEABILITY.md. A requirement
 * absent from both tables has no known state, which is the condition this control refuses.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const upstreamPath = join(root, "docs/amont/expression-besoins.md");
const matrixPath = join(root, "docs/TRACEABILITY.md");

/** `AGT-06`, `NFR-01`, `UX-05` — two letters or more, then a zero-padded number. */
const ID = "[A-Z]{2,}-[0-9]{2,}";
/** `UX-06..UX-10` and `RM-006..009` both denote a closed interval on the numeric part. */
const RANGE = new RegExp(`\\b(${ID})\\.\\.(?:([A-Z]{2,})-)?([0-9]{2,})|\\b(${ID})\\b`, "g");

const failures: string[] = [];

function splitId(id: string): { prefix: string; digits: string } {
	const cut = id.lastIndexOf("-");
	return { prefix: id.slice(0, cut), digits: id.slice(cut + 1) };
}

/** Expands every identifier and range notation found in a matrix cell. */
function idsIn(cell: string): string[] {
	const out: string[] = [];
	for (const m of cell.matchAll(RANGE)) {
		const [, start, endPrefix, endDigits, single] = m;
		if (single) {
			out.push(single);
			continue;
		}
		const { prefix, digits } = splitId(start!);
		if (endPrefix && endPrefix !== prefix) {
			failures.push(`range across two prefixes in TRACEABILITY.md: ${m[0]}`);
			continue;
		}
		const from = Number(digits);
		const to = Number(endDigits);
		if (to < from) {
			failures.push(`descending range in TRACEABILITY.md: ${m[0]}`);
			continue;
		}
		for (let n = from; n <= to; n++) out.push(`${prefix}-${String(n).padStart(digits.length, "0")}`);
	}
	return out;
}

/** `#### BES-01 — Enregistrer une intention [P0]` and `### NFR-01 — … [P0]`. */
function requiredIds(markdown: string): { functional: string[]; nonFunctional: string[] } {
	const functional: string[] = [];
	const nonFunctional: string[] = [];
	const heading = new RegExp(`^(###|####) (${ID})\\b.*\\[P0\\]\\s*$`);
	for (const line of markdown.split("\n")) {
		const m = heading.exec(line);
		if (!m) continue;
		(m[1] === "####" ? functional : nonFunctional).push(m[2]!);
	}
	return { functional, nonFunctional };
}

/**
 * The two tables are recognised by a header row whose first column is `Exigence`; their rows are
 * every following line until the table ends.
 */
function matrixIds(markdown: string): { ids: Set<string>; tables: number } {
	const ids = new Set<string>();
	const lines = markdown.split("\n");
	let tables = 0;
	for (let i = 0; i < lines.length; i++) {
		if (!/^\|\s*Exigence\b/.test(lines[i]!)) continue;
		tables++;
		for (let j = i + 2; j < lines.length && lines[j]!.startsWith("|"); j++) {
			const cell = lines[j]!.split("|")[1] ?? "";
			for (const id of idsIn(cell)) ids.add(id);
		}
	}
	return { ids, tables };
}

const upstream = readFileSync(upstreamPath, "utf8");
const matrix = readFileSync(matrixPath, "utf8");
const { functional, nonFunctional } = requiredIds(upstream);
const { ids, tables } = matrixIds(matrix);

if (tables !== 2) failures.push(`expected the covered and the uncovered table in TRACEABILITY.md, found ${tables}`);

const missing = [...functional, ...nonFunctional].filter((id) => !ids.has(id));
if (missing.length > 0) {
	failures.push(
		`[P0] requirements with no row in TRACEABILITY.md (neither covered nor explicitly uncovered):\n  ` +
			missing.join(", "),
	);
}

/** The matrix states its own totals; a stale count is a matrix that no longer describes the upstream. */
const announced = /porte (\d+) exigences fonctionnelles `\[P0\]`[^.]*?et (\d+) exigences non\s+fonctionnelles[^.]*?soit (\d+)\./.exec(matrix);
if (!announced) {
	failures.push("TRACEABILITY.md no longer states how many [P0] requirements the upstream carries");
} else {
	const [, fn, nfr, total] = announced;
	const expected = [functional.length, nonFunctional.length, functional.length + nonFunctional.length];
	const stated = [Number(fn), Number(nfr), Number(total)];
	if (stated.join("/") !== expected.join("/")) {
		failures.push(`TRACEABILITY.md announces ${stated.join("/")} [P0] requirements, the upstream carries ${expected.join("/")}`);
	}
}

if (failures.length > 0) {
	console.error(`traceability violations:\n${failures.join("\n")}`);
	process.exit(1);
}
console.log(`traceability complete: ${functional.length} functional + ${nonFunctional.length} non-functional [P0] requirements, all present in the matrix`);
