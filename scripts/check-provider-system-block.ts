/**
 * The layer a provider imposes, related to the package this repository actually depends on
 * (CTX-02, D-48, e23s02 task 4). `src/domain/imposed-layers.ts` declares what a known provider
 * writes above 495's own instructions; this control reads the provider's own code and refuses when
 * what it finds is not what the declaration affirms.
 *
 * It reads the package the dependency lock pins — `node_modules/@earendil-works/pi-coding-agent`
 * by default, or a directory given on the command line, which is how the test fixtures this
 * control's own refusals. It never reads the package installed elsewhere on a machine — the story's
 * own §18 names that choice — reproducible over accurate to whatever this machine happens to run.
 *
 * The text and the position are established by one regular expression each: the text is captured
 * exactly, and the surrounding shape — a ternary, the provider's block written into `params.system`
 * first, 495's own system text pushed second — is structural proof that the provider's block comes
 * before 495's. The shape names no identifier: review round 1 (both reviewers) showed that
 * anchoring on the minifier's name for the ternary's condition (`isOAuthToken2`) made a semantics-
 * preserving rebuild of the same package refuse for no real reason, which is brittle in the wrong
 * place — a rename is not a fact this control exists to catch. The condition itself — the OAuth
 * token prefix the provider's own check is written against — is a second, independent search for
 * that literal in the same file, added for the same round: without it, the declared condition was
 * never read at all, so it could drift with the control staying green.
 *
 * A version drift is still not silently absorbed. Should the shape or the token prefix stop being
 * findable, the control refuses rather than passes: that loss of the means of checking is a fact
 * for a human to look at, not a fact this control resolves on its own.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { imposedLayersFor } from "../src/domain/imposed-layers.ts";

const PROVIDER_ID = "anthropic";
/** The OAuth token prefix `condition` names; independent of BLOCK, so a drifted condition refuses. */
const CONDITION_LITERAL = "sk-ant-oat";
/** A ternary of any name, the provider's block written into `params.system` first, 495's pushed second. */
const BLOCK =
	/\w+\?\(params\.system=\[\{type:"text",text:"((?:[^"\\]|\\.)*)"[^\]]*\}\],initialSystemText&&params\.system\.push\(/g;

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
	for (const m of source.matchAll(BLOCK)) hits.push({ file, text: JSON.parse(`"${m[1]}"`) });
}

if (hits.length === 0) {
	console.error(
		`provider system block: no detectable block found under ${distDir} — this is the means of checking lost, not proof that ${PROVIDER_ID} imposes nothing`,
	);
	process.exit(1);
}
if (hits.length > 1) {
	console.error(
		`provider system block: ${hits.length} detectable blocks found under ${distDir}, so the one to trust is ambiguous:\n${hits.map((h) => `  ${h.file}: ${JSON.stringify(h.text)}`).join("\n")}`,
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
if (!readFileSync(found.file, "utf8").includes(CONDITION_LITERAL)) {
	console.error(
		`provider system block: ${found.file} carries the declared text but not ${JSON.stringify(CONDITION_LITERAL)} — the condition the declaration names could not be confirmed`,
	);
	process.exit(1);
}
console.log(`provider system block held: ${PROVIDER_ID} matches the declaration, found in ${found.file}`);
