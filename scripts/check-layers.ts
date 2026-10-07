/**
 * Dependency direction (conception §2.2): domain -> contracts only; application -> domain, ports,
 * contracts; adapters -> ports, contracts, domain types; extension/presentation -> application.
 * The kernel of requirements and decisions — domain/, contracts/, ports/, application/ and export/ —
 * may not import Pi packages: that is what lets it be tested with no network and no real model
 * (NFR-07), and it is the rule NFR-07 names. presentation/ is not part of that kernel and may use
 * Pi's display library, pi-tui, which is a widget toolkit and not the agent API; what the review
 * needs from the Pi application itself — theme, keybindings, the drawing of a comparison — is
 * injected from extension/ (D-81).
 * A technology is one directory under adapters/stacks/: no module outside it imports it, another
 * technology included, but the composition root that mounts the list of technologies, extension/runtime.ts;
 * what the technologies share sits beside those directories and stays importable (D-86).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = join(process.cwd(), "src");
const rules: Array<{ layer: string; forbidden: RegExp[] }> = [
	{
		layer: "contracts",
		forbidden: [/\.\.\/(domain|ports|application|adapters|extension|presentation|export)\//, /@earendil-works/],
	},
	{
		layer: "domain",
		forbidden: [
			/\.\.\/(ports|application|adapters|extension|presentation|export)\//,
			/@earendil-works/,
			/node:(fs|child_process|net|http|sqlite)/,
		],
	},
	{ layer: "ports", forbidden: [/\.\.\/(application|adapters|extension|presentation|export)\//, /@earendil-works/] },
	{ layer: "application", forbidden: [/\.\.\/(adapters|extension|presentation)\//, /@earendil-works/] },
	{ layer: "adapters", forbidden: [/\.\.\/(extension|presentation)\//, /\.\.\/\.\.\/(extension|presentation)\//] },
	// What keeps the same review readable from RPC, JSON, print and an SDK host is that the review
	// data does not depend on any view (ADR-010, UX-11) — and that data lives in application/ and
	// presentation/structured/. Forbidding Pi's widget toolkit here guarded nothing and cost the
	// surface a hand-written copy of what pi-tui already publishes; the agent and application
	// packages stay out, so a view can be rendered without a running Pi (D-81).
	{
		layer: "presentation",
		forbidden: [
			/\.\.\/(extension|adapters)\//,
			/\.\.\/\.\.\/(extension|adapters)\//,
			/@earendil-works\/(?!pi-tui["'/])/,
		],
	},
	{ layer: "export", forbidden: [/\.\.\/(extension|presentation)\//, /@earendil-works/] },
];

/**
 * Every module a file imports or re-exports: a static import or export, on one line or spread over
 * several as the formatter writes a long list, an import kept for its side effects, and a dynamic
 * import. Reading line by line saw only the first form, so a split import crossed a layer unseen.
 */
function specifiers(source: string): string[] {
	const found: string[] = [];
	for (const re of [
		/(?:^|\n)\s*(?:import|export)\b[^;"'`]*?\bfrom\s*["']([^"']+)["']/g,
		/(?:^|\n)\s*import\s*["']([^"']+)["']/g,
		/\bimport\(\s*["']([^"']+)["']\s*\)/g,
	])
		for (const m of source.matchAll(re)) found.push(m[1] ?? "");
	return found;
}

const violations: string[] = [];
function walk(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) walk(p, files);
		else if (p.endsWith(".ts")) files.push(p);
	}
	return files;
}
for (const rule of rules) {
	const dir = join(root, rule.layer);
	let files: string[] = [];
	try {
		files = walk(dir);
	} catch {
		continue;
	}
	for (const file of files) {
		for (const specifier of specifiers(readFileSync(file, "utf8")))
			for (const re of rule.forbidden)
				if (re.test(`"${specifier}"`)) violations.push(`${relative(process.cwd(), file)}: ${specifier}`);
	}
}
const STACKS = join(root, "adapters", "stacks");
const COMPOSITION_ROOT = join(root, "extension", "runtime.ts");

/** The technology whose directory holds `path`, or null for a path outside every technology directory. */
function technologyOf(path: string): string | null {
	const [technology, ...below] = relative(STACKS, path).split(sep);
	return technology === undefined || technology === ".." || below.length === 0 ? null : technology;
}

let sources: string[] = [];
try {
	sources = walk(root);
} catch {
	// a tree without src/ imports nothing
}
for (const file of sources) {
	if (file === COMPOSITION_ROOT) continue;
	const own = technologyOf(file);
	for (const specifier of specifiers(readFileSync(file, "utf8"))) {
		if (!specifier.startsWith(".")) continue;
		const imported = technologyOf(resolve(dirname(file), specifier));
		if (imported !== null && imported !== own) violations.push(`${relative(process.cwd(), file)}: ${specifier}`);
	}
}

if (violations.length > 0) {
	console.error(`layer violations:\n${violations.join("\n")}`);
	process.exit(1);
}
console.log("layer rules satisfied");
