/**
 * Identity and composition of what is distributed (conception-verification §12, points 6 and 7).
 *
 * `package.json#pi.extensions` points Pi at `dist/`, not at `src/`: the code an installation runs is
 * the build, and nothing else tied it to the sources a reviewer reads. This control rebuilds the
 * sources into a scratch directory and compares the result byte for byte with `dist/`, so a stale
 * build is a failure rather than an installation that silently runs another version.
 *
 * It also holds the inventory: every external module the sources import is a declared peer with a
 * readable licence, every redistributed dependency is attributed in the NOTICE, the JSON contracts
 * beside the build match their sources, and every licence in the installed tree is on the
 * permissive allowlist.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const scratch = join(root, ".dist-check");

/**
 * The scratch build must sit at the same depth as `dist/`: a source map stores the path from itself
 * to its source, so a build placed elsewhere differs in its maps without differing in its code.
 */
const failures: string[] = [];
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
	license?: string;
	files?: string[];
	dependencies?: Record<string, string>;
	bundledDependencies?: string[];
	peerDependencies?: Record<string, string>;
	pi?: { extensions?: string[] };
};
const notice = readFileSync(join(root, "NOTICE"), "utf8");

function walk(dir: string, base: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) walk(p, base, out);
		else out.push(relative(base, p));
	}
	return out;
}

// 1. The build that is shipped is the build the current sources produce.
if (!existsSync(dist)) {
	failures.push("dist/ is absent: the package declares its entry point there (run `npm run build`)");
} else {
	rmSync(scratch, { recursive: true, force: true });
	try {
		execFileSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json", "--outDir", scratch], { cwd: root, stdio: "pipe" });
		const built = new Set(walk(scratch, scratch));
		const shipped = new Set(walk(dist, dist));
		const missing = [...built].filter((f) => !shipped.has(f)).sort();
		const extra = [...shipped].filter((f) => !built.has(f)).sort();
		const differing = [...built].filter((f) => shipped.has(f) && !readFileSync(join(scratch, f)).equals(readFileSync(join(dist, f)))).sort();
		const show = (label: string, list: string[]) => (list.length === 0 ? [] : [`  ${label} (${list.length}): ${list.slice(0, 8).join(", ")}${list.length > 8 ? ", …" : ""}`]);
		if (missing.length + extra.length + differing.length > 0) {
			failures.push(
				["dist/ is not what the sources build (run `npm run build`):", ...show("absent from dist", missing), ...show("no longer produced", extra), ...show("differing", differing)].join("\n"),
			);
		}
	} catch (error) {
		failures.push(`the build could not be reproduced: ${(error as Error).message.split("\n").slice(0, 3).join(" ")}`);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

// 2. A source map whose source is not in the package points at a file the reader does not have.
const maps = existsSync(dist) ? walk(dist, dist).filter((f) => f.endsWith(".map")) : [];
const opaque = maps.filter((f) => {
	const map = JSON.parse(readFileSync(join(dist, f), "utf8")) as { sourcesContent?: (string | null)[] };
	return !map.sourcesContent || map.sourcesContent.some((c) => c === null || c === undefined);
});
if (opaque.length > 0) {
	failures.push(`${opaque.length} source maps carry no inlined source, so they reference files the package does not ship (set "inlineSources" in tsconfig.build.json): ${opaque.slice(0, 5).join(", ")}`);
}

// 3. The JSON contracts shipped beside the build are the ones the sources define. They travel with
// the package and are what another implementation reads; a stale copy describes a protocol nobody
// speaks any more.
const registry = (await import(join(root, "src/contracts/registry.ts"))).CONTRACTS as Record<string, unknown>;
for (const [name, schema] of Object.entries(registry)) {
	const path = join(root, "contracts/v1", `${name}.json`);
	const expected = `${JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", ...JSON.parse(JSON.stringify(schema)) }, null, 2)}\n`;
	if (!existsSync(path)) failures.push(`contracts/v1/${name}.json is missing (run \`npm run contracts\`)`);
	else if (readFileSync(path, "utf8") !== expected) failures.push(`contracts/v1/${name}.json no longer matches the source contract (run \`npm run contracts\`)`);
}
const emitted = new Set(Object.keys(registry).map((name) => `${name}.json`));
for (const file of readdirSync(join(root, "contracts/v1")).filter((f) => f.endsWith(".json"))) {
	if (!emitted.has(file)) failures.push(`contracts/v1/${file} is shipped but no source contract produces it`);
}

// 4. Attribution follows redistribution. A runtime dependency travels inside the package, so
// Apache-2.0 §4(d) asks for its notice; a peer is provided by the Pi host and is not redistributed,
// so it is inventoried by its declaration and its licence, not by the NOTICE.
const bundled = Object.keys(pkg.dependencies ?? {}).concat(pkg.bundledDependencies ?? []);
const unattributed = bundled.filter((name) => !notice.includes(name));
if (unattributed.length > 0) failures.push(`redistributed dependencies the NOTICE does not name: ${unattributed.join(", ")}`);

// 5. Every external module the sources import is a declared peer, and every peer is installed and
// permissively licensed.
const peers = Object.keys(pkg.peerDependencies ?? {});
const imported = new Set<string>();
for (const file of walk(join(root, "src"), root).filter((f) => f.endsWith(".ts"))) {
	const text = readFileSync(join(root, file), "utf8");
	for (const line of text.split("\n")) {
		// Only real import statements: a module specifier quoted inside a template of witness code is not one.
		const m = /^\s*(?:import|export)\b[^"']*from\s+["']([^"']+)["']/.exec(line) ?? /^\s*import\s+["']([^"']+)["']/.exec(line);
		if (!m) continue;
		const specifier = m[1]!;
		if (specifier.startsWith(".") || specifier.startsWith("node:")) continue;
		imported.add(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!);
	}
}
const undeclared = [...imported].filter((name) => !peers.includes(name)).sort();
if (undeclared.length > 0) failures.push(`modules imported by src/ that no peerDependency declares: ${undeclared.join(", ")}`);
const peerLicences: string[] = [];
for (const name of peers) {
	try {
		const manifest = JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")) as { version: string; license?: string };
		peerLicences.push(`${name}@${manifest.version} ${manifest.license ?? "UNKNOWN"}`);
		if (!manifest.license) failures.push(`peer dependency ${name} declares no licence`);
	} catch {
		failures.push(`peer dependency ${name} is not installed, so its licence cannot be read`);
	}
}

// 6. Licences of the installed tree. Nothing here is redistributed, but a reviewer is entitled to
// the inventory, and a non-permissive licence entering the build must be a decision, not a surprise.
const ALLOWED = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "BlueOak-1.0.0", "CC0-1.0", "Unlicense", "Python-2.0"]);
const licences = new Map<string, string[]>();
function scanModules(dir: string): void {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir)) {
		if (entry.startsWith(".")) continue;
		const p = join(dir, entry);
		if (!statSync(p).isDirectory()) continue;
		if (entry.startsWith("@")) {
			scanModules(p);
			continue;
		}
		try {
			const manifest = JSON.parse(readFileSync(join(p, "package.json"), "utf8")) as { name: string; version: string; license?: string; licenses?: { type: string }[] };
			const licence = manifest.license ?? manifest.licenses?.map((l) => l.type).join(" OR ") ?? "UNKNOWN";
			if (!licences.has(licence)) licences.set(licence, []);
			licences.get(licence)!.push(`${manifest.name}@${manifest.version}`);
		} catch {
			// a directory without a manifest is not a package
		}
		scanModules(join(p, "node_modules"));
	}
}
scanModules(join(root, "node_modules"));
const foreign = [...licences].filter(([licence]) => !ALLOWED.has(licence));
if (foreign.length > 0) {
	failures.push(`licences outside the permissive allowlist:\n  ` + foreign.map(([licence, pkgs]) => `${licence}: ${pkgs.slice(0, 6).join(", ")}`).join("\n  "));
}

// 7. The licence travels as a copy, not as an address. Apache-2.0 §4(a) asks for a copy of the
// License with the work, and a package meant to be verifiable offline cannot answer with a URL.
const licenceFile = readFileSync(join(root, "LICENSE"), "utf8");
if (pkg.license === "Apache-2.0" && !(licenceFile.includes("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION") && licenceFile.includes("END OF TERMS AND CONDITIONS"))) {
	failures.push("package.json declares Apache-2.0 but LICENSE does not carry the terms, only a reference to them");
}

// 8. The files the package ships, and nothing the platform left in them.
for (const required of ["LICENSE", "NOTICE", "README.md"]) {
	if (!(pkg.files ?? []).includes(required)) failures.push(`package.json#files does not ship ${required}`);
}
const noise = (pkg.files ?? [])
	.filter((f) => existsSync(join(root, f)) && statSync(join(root, f)).isDirectory())
	.flatMap((f) => walk(join(root, f), root))
	.filter((f) => /(^|\/)(\.DS_Store|\._[^/]*)$/.test(f));
if (noise.length > 0) failures.push(`platform files inside the shipped directories: ${noise.join(", ")}`);

if (failures.length > 0) {
	console.error("distribution violations:\n" + failures.join("\n"));
	process.exit(1);
}
const total = [...licences.values()].reduce((n, l) => n + l.length, 0);
console.log(`distribution consistent: dist/ reproduces the sources, ${bundled.length} dependencies redistributed, ${peers.length} provided by the host (${peerLicences.join(", ")}), ${total} packages installed under ${[...licences.keys()].sort().join(", ")}`);
