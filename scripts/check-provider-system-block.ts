/**
 * The layer a provider imposes, related to the package this repository actually depends on
 * (CTX-02, D-48, e23s02 task 4). `src/domain/imposed-layers.ts` declares what a known provider
 * writes above 495's own instructions; this control reads the provider's own code and refuses when
 * what it finds is not what the declaration affirms.
 *
 * It reads the package the dependency lock pins — `node_modules/@earendil-works/pi-coding-agent`
 * by default, or a directory given on the command line, which is how the test fixtures this
 * control's own refusals. It never reads the package installed elsewhere on a machine (D-54's
 * choice, for the reasons D-54 gives): reproducible over accurate to whatever this machine happens
 * to run.
 *
 * A single regular expression stands for three of the declaration's four facts at once: the text is
 * captured, and the surrounding shape — a ternary on the OAuth path, the provider's block written
 * first, 495's own system text pushed second — is what proves the condition and the position. That
 * shape is minifier output, tied to exact variable names as much as to structure; a change to
 * either reads as the block no longer being relevable, not as a distinguishable position or
 * condition failure. Finer detection would cost more than the distinction is worth: either fact
 * drifting is a fact for a human to look at, and this control's whole job is to make that moment
 * impossible to miss, not to say in advance what changed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { imposedLayersFor } from "../src/domain/imposed-layers.ts";

const PROVIDER_ID = "anthropic";
/** Conditional on the OAuth path, the provider's block first, 495's own instructions pushed second. */
const BLOCK =
	/isOAuthToken\w*\?\(params\.system=\[\{type:"text",text:"((?:[^"\\]|\\.)*)"[^\]]*\}\],initialSystemText&&params\.system\.push\(/g;

function jsFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...jsFiles(path));
		else if (entry.name.endsWith(".js")) out.push(path);
	}
	return out;
}

const packageDir = process.argv[2] ?? join(process.cwd(), "node_modules", "@earendil-works", "pi-coding-agent");
if (!existsSync(packageDir) || !statSync(packageDir).isDirectory()) {
	console.error(`provider system block: ${packageDir} is not a directory`);
	process.exit(1);
}
const distDir = existsSync(join(packageDir, "dist")) ? join(packageDir, "dist") : packageDir;

const declared = imposedLayersFor(PROVIDER_ID)[0];
if (!declared) {
	console.error(`provider system block: src/domain/imposed-layers.ts declares nothing for ${PROVIDER_ID}`);
	process.exit(1);
}

const hits: { file: string; text: string }[] = [];
for (const file of jsFiles(distDir)) {
	const source = readFileSync(file, "utf8");
	for (const m of source.matchAll(BLOCK)) hits.push({ file, text: m[1]!.replace(/\\(.)/g, "$1") });
}

if (hits.length === 0) {
	console.error(
		`provider system block: no relevable block found under ${distDir} — this is the means of checking lost, not proof that ${PROVIDER_ID} imposes nothing`,
	);
	process.exit(1);
}
if (hits.length > 1) {
	console.error(
		`provider system block: ${hits.length} relevable blocks found under ${distDir}, so the one to trust is ambiguous:\n${hits.map((h) => `  ${h.file}: ${JSON.stringify(h.text)}`).join("\n")}`,
	);
	process.exit(1);
}
const found = hits[0]!;
if (found.text !== declared.text) {
	console.error(
		`provider system block: the block found in ${found.file} differs from the declaration\n  found:    ${JSON.stringify(found.text)}\n  declared: ${JSON.stringify(declared.text)}`,
	);
	process.exit(1);
}
console.log(`provider system block held: ${PROVIDER_ID} matches the declaration, found in ${found.file}`);
