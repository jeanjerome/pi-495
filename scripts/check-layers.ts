/**
 * Dependency direction (conception §2.2): domain -> contracts only; application -> domain, ports,
 * contracts; adapters -> ports, contracts, domain types; extension/presentation -> application.
 * The kernel of requirements and decisions — domain/, contracts/, ports/, application/ and export/ —
 * may not import Pi packages: that is what lets it be tested with no network and no real model
 * (NFR-07), and it is the rule NFR-07 names. presentation/ is not part of that kernel and may use
 * Pi's display library, which is a widget toolkit and not the agent API.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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
	// presentation/structured/, which this rule does not reach. Forbidding Pi's widget toolkit here
	// guarded nothing and cost the surface a hand-written copy of what pi-tui already publishes.
	{
		layer: "presentation",
		forbidden: [/\.\.\/(extension|adapters)\//, /\.\.\/\.\.\/(extension|adapters)\//],
	},
	{ layer: "export", forbidden: [/\.\.\/(extension|presentation)\//, /@earendil-works/] },
];

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
		const src = readFileSync(file, "utf8");
		for (const line of src.split("\n")) {
			if (!/^\s*(import|export)\b.*from\s+["']/.test(line) && !/import\(/.test(line)) continue;
			for (const re of rule.forbidden)
				if (re.test(line)) violations.push(`${relative(process.cwd(), file)}: ${line.trim()}`);
		}
	}
}
if (violations.length > 0) {
	console.error(`layer violations:\n${violations.join("\n")}`);
	process.exit(1);
}
console.log("layer rules satisfied");
