/**
 * Dependency direction (conception §2.2): domain -> contracts only; application -> domain, ports,
 * contracts; adapters -> ports, contracts, domain types; extension/presentation -> application.
 * Nothing under domain/, contracts/, ports/, application/, presentation/ or export/ may import Pi
 * packages: the Pi API enters the sources through extension/ and adapters/pi-worker/ only.
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
	// A view that imported Pi would tie the review to a component; what keeps the same review data
	// readable from RPC, JSON, print and an SDK host is that no view depends on one (ADR-010, UX-11).
	{
		layer: "presentation",
		forbidden: [/\.\.\/(extension|adapters)\//, /\.\.\/\.\.\/(extension|adapters)\//, /@earendil-works/],
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
