/**
 * The layer a provider imposes, related to the module the pinned Pi packages actually run
 * (CTX-02, D-48). `src/domain/imposed-layers.ts` declares what a known provider writes above 495's
 * own instructions; this control reads the provider's own code and refuses when what it finds is
 * not what the declaration affirms.
 *
 * It reads the readable provider module — `@earendil-works/pi-ai/dist/api/anthropic-messages.js` —
 * and not the compressed bundle the provider's own command line executes. The harness loads Pi's
 * unbundled entry point, so the module graph resolved from there is what builds the request; the
 * bundle is a second copy that nothing in 495 ever loads. The readable form also keeps the
 * provider's own identifiers, which is what lets the imposed block be related to the condition
 * guarding it — a compressed form renames both.
 *
 * It reads the packages the dependency lock pins, never the ones installed elsewhere on the machine
 * — the story's §18 names that choice. A tree holds the module more than once, hoisted and nested;
 * every copy under the given root is read, they must agree, and a disagreement refuses rather than
 * electing one.
 *
 * **Nothing it reads is allowed to go unclassified.** That rule is the whole design, and it is what
 * a pattern-matching reader gets wrong by default: an expression recognises one shape and says
 * nothing at all about everything else, so silence reads as absence. Here, every occurrence of the
 * imposed block is counted rather than the first one taken (§14: exactly one, two or zero refuse);
 * every element of the imposed array is classified, and one that is not a readable text part refuses
 * instead of contributing nothing; and the guard's predicate must have exactly the shape that tests
 * the declared token, so a widened or neutralised condition refuses rather than passing on a literal
 * found somewhere in its body.
 *
 * What it establishes about the condition is a **name correspondence**, not a proof of dataflow: the
 * guard the block sits under and a module-level predicate of that name, whose body tests exactly the
 * token the declaration spells out. A rebuild that renames the guard away from its predicate refuses
 * — the safe direction, and the honest limit of reading code with expressions.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { imposedLayersFor } from "../src/domain/imposed-layers.ts";

const PROVIDER_ID = "anthropic";
/** Where a provider builds its request, inside whichever copy of its package a tree holds. */
const MODULE_SUFFIX = join("@earendil-works", "pi-ai", "dist", "api", "anthropic-messages.js");
/** Said wherever the means of checking is lost, so the distinction is worded once. */
const LOST = `this is the means of checking lost, not proof that ${PROVIDER_ID} imposes nothing`;

/**
 * The imposed array with the guard it sits under: `if (<guard>) { params.system = [ … ]; … push(`.
 * The append is inside the match, so the order — the provider's array first, 495's text pushed onto
 * it second — is read from the code rather than assumed. Global: occurrences are counted.
 */
const IMPOSED =
	/if\s*\(\s*(\w+)\s*\)\s*\{\s*params\.system\s*=\s*\[([\s\S]*?)\]\s*;[\s\S]{0,400}?params\.system\.push\s*\(/g;
/** A readable imposed part: a text element whose text is a double-quoted literal. */
const TEXT_ELEMENT = /^\s*\{\s*type:\s*"text"\s*,\s*text:\s*"((?:[^"\\]|\\.)*)"\s*(?:,[\s\S]*)?\}\s*$/;
/** The only predicate shape this control can read: one membership test against one literal. */
const PREDICATE_BODY = /^\s*return\s+\w+(?:\.\w+)*\.includes\(\s*"([^"]*)"\s*\)\s*;?\s*$/;
/** The token prefix the declared condition spells out, the one half of it this control can confirm. */
const DECLARED_TOKEN = /\b(sk-[a-z0-9-]+)/i;

function refuse(message: string): never {
	console.error(`provider system block: ${message}`);
	process.exit(1);
}

/** Every copy of the provider module under a tree, wherever a package manager nested it. */
function providerModules(root: string): string[] {
	const found: string[] = [];
	const walk = (dir: string, depth: number): void => {
		if (depth > 8) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const path = join(dir, entry.name);
			const candidate = join(path, MODULE_SUFFIX);
			if (existsSync(candidate)) found.push(candidate);
			walk(path, depth + 1);
		}
	};
	const here = join(root, MODULE_SUFFIX);
	if (existsSync(here)) found.push(here);
	if (existsSync(root) && statSync(root).isDirectory()) walk(root, 0);
	return [...new Set(found)].sort();
}

/**
 * The top-level elements of an array body, split on the commas that separate them rather than on
 * every comma: an element carries nested objects and strings of its own.
 */
function elementsOf(body: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let start = 0;
	for (let i = 0; i < body.length; i++) {
		const c = body[i]!;
		if (quote) {
			if (c === "\\") i++;
			else if (c === quote) quote = null;
			continue;
		}
		if (c === '"' || c === "'" || c === "`") quote = c;
		else if (c === "{" || c === "[" || c === "(") depth++;
		else if (c === "}" || c === "]" || c === ")") depth--;
		else if (c === "," && depth === 0) {
			out.push(body.slice(start, i));
			start = i + 1;
		}
	}
	out.push(body.slice(start));
	return out.filter((e) => e.trim() !== "");
}

/** Every imposed text, with an element this control cannot read refusing rather than contributing nothing. */
function textsOf(body: string, file: string): string[] {
	const texts: string[] = [];
	for (const element of elementsOf(body)) {
		const m = TEXT_ELEMENT.exec(element);
		if (!m)
			refuse(
				`${file}: an imposed element is not a text part this control can read — ${JSON.stringify(element.trim().slice(0, 80))} — ${LOST}`,
			);
		try {
			texts.push(JSON.parse(`"${m[1]!}"`) as string);
		} catch {
			refuse(
				`${file}: an imposed text carries an escape this control cannot decode — ${JSON.stringify(m[1]!.slice(0, 60))} — ${LOST}`,
			);
		}
	}
	return texts;
}

/**
 * The token a guard's predicate tests. The guard comes from `\w+`, so it carries no character a
 * pattern would read as syntax; the body must be exactly one membership test, so a predicate that
 * was widened, neutralised, or written another way refuses rather than yielding its first literal.
 */
function tokenOf(source: string, guard: string, file: string): string {
	const declared = new RegExp(`function\\s+${guard}\\s*\\([^)]*\\)\\s*\\{([^}]*)\\}`).exec(source);
	if (!declared)
		refuse(
			`${file}: the guard ${guard} has no module-level predicate of that name, so the declared condition could not be confirmed — ${LOST}`,
		);
	const body = PREDICATE_BODY.exec(declared[1]!);
	if (!body)
		refuse(
			`${file}: the predicate ${guard} is not one membership test this control can read — ${JSON.stringify(declared[1]!.trim().slice(0, 80))} — ${LOST}`,
		);
	return body[1]!;
}

/** What one copy of the module says the provider imposes, and under which condition. */
interface Reading {
	file: string;
	texts: string[];
	token: string;
}

function readImposedBlock(file: string): Reading {
	const source = readFileSync(file, "utf8");
	const blocks = [...source.matchAll(IMPOSED)];
	if (blocks.length === 0) refuse(`${file}: no imposed block of the shape this control reads — ${LOST}`);
	if (blocks.length > 1)
		refuse(
			`${file}: ${blocks.length} imposed blocks found, so the provider writes in more than one place and the one to trust is ambiguous`,
		);
	const block = blocks[0]!;
	return { file, texts: textsOf(block[2]!, file), token: tokenOf(source, block[1]!, file) };
}

const layers = imposedLayersFor(PROVIDER_ID);
if (layers.length !== 1)
	refuse(
		`src/domain/imposed-layers.ts declares ${layers.length} layer(s) for ${PROVIDER_ID}; this control reads one imposed array and cannot relate several to it`,
	);
const declared = layers[0]!;

const declaredToken = DECLARED_TOKEN.exec(declared.condition)?.[1];
if (!declaredToken)
	refuse(
		`the declared condition names no token prefix to look for: ${JSON.stringify(declared.condition)} — a condition this control cannot confirm is one it must not pass`,
	);

const root = process.argv[2] ?? join(process.cwd(), "node_modules");
const files = providerModules(root);
if (files.length === 0) refuse(`no copy of ${MODULE_SUFFIX} found under ${root} — ${LOST}`);

const readings = files.map(readImposedBlock);
const fingerprint = (r: Reading): string => JSON.stringify([r.texts, r.token]);
if (new Set(readings.map(fingerprint)).size > 1)
	refuse(
		`the copies of the provider module under ${root} do not agree, so the one to trust is ambiguous:\n${readings.map((r) => `  ${r.file}: ${fingerprint(r)}`).join("\n")}`,
	);

const found = readings[0]!;
if (found.texts.length !== 1 || found.texts[0] !== declared.text)
	refuse(
		`the block found in ${found.file} differs from the declaration\n  found:    ${found.texts.map((t) => JSON.stringify(t)).join("\n            ") || "(no text at all)"}\n  declared: ${JSON.stringify(declared.text)}`,
	);
if (found.token !== declaredToken)
	refuse(
		`${found.file} carries the declared text under another condition\n  found:    ${JSON.stringify(found.token)}\n  declared: ${JSON.stringify(declaredToken)}, from ${JSON.stringify(declared.condition)}`,
	);

const copies = files.length === 1 ? "the one copy" : `all ${files.length} copies`;
console.log(
	`provider system block held: ${PROVIDER_ID} matches the declaration in ${copies} of the module, read from ${found.file}`,
);
