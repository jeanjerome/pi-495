/**
 * Comparison of the declared architecture with the realized one, applied to 495 itself.
 * `docs/amont/conception-technique.md` §4.1 catalogues the components the product is made of; a
 * component whose identifier no module claims has an unknown realization, and an identifier claimed
 * in `src/` that the catalogue does not declare is a component nobody decided. Import cycles are
 * refused for the same reason `structure` refuses them on a target: two modules that import each
 * other are one module, whatever the catalogue says.
 *
 * `check-layers.ts` holds the complementary rule — the direction of the dependencies between layers.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const root = process.cwd();
const catalogue = join(root, "docs/amont/conception-technique.md");
const srcDir = join(root, "src");

const COMPONENT = /CMP-[A-Z]{2,4}/g;

const failures: string[] = [];

function walk(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) walk(p, files);
		else if (p.endsWith(".ts")) files.push(p);
	}
	return files;
}

/** `| `CMP-PI` | **Pi Host Adapter** | … |` — the first cell of every catalogue row. */
function declaredComponents(markdown: string): Map<string, string> {
	const declared = new Map<string, string>();
	for (const line of markdown.split("\n")) {
		const m = /^\|\s*`(CMP-[A-Z]{2,4})`\s*\|\s*\*\*([^*]+)\*\*/.exec(line);
		if (m) declared.set(m[1]!, m[2]!.trim());
	}
	return declared;
}

const files = walk(srcDir);
const declared = declaredComponents(readFileSync(catalogue, "utf8"));
if (declared.size === 0) failures.push("no component catalogue found in docs/amont/conception-technique.md §4.1");

const claimedBy = new Map<string, string[]>();
const sources = new Map<string, string>();
for (const file of files) {
	const text = readFileSync(file, "utf8");
	sources.set(file, text);
	for (const id of new Set(text.match(COMPONENT) ?? [])) {
		if (!claimedBy.has(id)) claimedBy.set(id, []);
		claimedBy.get(id)!.push(relative(root, file));
	}
}

const unrealized = [...declared.keys()].filter((id) => !claimedBy.has(id));
if (unrealized.length > 0) {
	failures.push(
		`declared components no module claims (their realization is unknown):\n  ` +
			unrealized.map((id) => `${id} ${declared.get(id)}`).join("\n  "),
	);
}

const undeclared = [...claimedBy.keys()].filter((id) => !declared.has(id));
if (undeclared.length > 0) {
	failures.push(
		`component identifiers claimed in src/ that the catalogue does not declare:\n  ${undeclared.join(", ")}`,
	);
}

/** Resolves `./x.ts` and `../y/z.ts` against the importing file; anything else is external. */
function localImports(file: string, text: string): string[] {
	const out: string[] = [];
	for (const m of text.matchAll(/(?:from|import\()\s*["'](\.[^"']+)["']/g))
		out.push(normalize(join(dirname(file), m[1]!)));
	return out;
}

const graph = new Map<string, string[]>();
for (const [file, text] of sources)
	graph.set(
		file,
		localImports(file, text).filter((p) => sources.has(p)),
	);

const cycles: string[] = [];
const state = new Map<string, 1 | 2>();
function visit(node: string, stack: string[]): void {
	state.set(node, 1);
	stack.push(node);
	for (const next of graph.get(node) ?? []) {
		if (state.get(next) === 1)
			cycles.push([...stack.slice(stack.indexOf(next)), next].map((p) => relative(root, p)).join(" -> "));
		else if (!state.has(next)) visit(next, stack);
	}
	stack.pop();
	state.set(node, 2);
}
for (const file of files) if (!state.has(file)) visit(file, []);
if (cycles.length > 0) failures.push(`import cycles in src/:\n  ${[...new Set(cycles)].join("\n  ")}`);

if (failures.length > 0) {
	console.error(`architecture violations:\n${failures.join("\n")}`);
	process.exit(1);
}

/**
 * A module carrying several components is not refused: the catalogue separates responsibilities the
 * code may still hold in one file. It is named, because it is the divergence between the declared
 * and the realized architecture that ARC-01 asks to be able to read.
 */
const merged = [...new Set([...claimedBy.values()].flat())]
	.map((file) => ({ file, ids: [...claimedBy].filter(([, fs]) => fs.includes(file)).map(([id]) => id) }))
	.filter((m) => m.ids.length > 1);
for (const m of merged) console.log(`divergence: ${m.file} carries ${m.ids.sort().join(", ")}`);
console.log(
	`architecture read back: ${declared.size} declared components, all claimed; ${files.length} modules, no import cycle`,
);
