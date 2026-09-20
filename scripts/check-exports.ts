/**
 * The exported surface of a module, compared with what is actually read.
 *
 * `export` states that something outside this module needs the name. When nothing does, the module
 * publishes a contract nobody holds it to: a reader cannot tell what may be changed freely from what
 * others depend on, and a definition that has stopped being read keeps looking alive. Both were
 * found in this tree — an ordering of the gates and a list of the active phases, each a second
 * statement of knowledge held elsewhere, neither read by anything, both free to drift in silence.
 *
 * `check-layers.ts` holds the direction of the dependencies between layers, and
 * `check-architecture.ts` the components and the absence of import cycles. This one holds what a
 * module offers.
 *
 * What it judges, and what it leaves alone:
 *
 * - `src/contracts/` is excluded. Its types are the published form of a dossier and of the emitted
 *   schemas; one that no module names is still what an auditor reads a dossier with.
 * - Only `function` and `const` declarations are judged. A type in the signature of an exported
 *   function belongs to that signature whether or not anything names it, and telling those apart
 *   asks for more than a reading of the declarations.
 * - A name is read when any other `.ts` of `src/`, `test/` or `scripts/` mentions it, a comment
 *   included. Deliberately coarse: a gate that cries wolf is a gate someone turns off, so this one
 *   refuses only a name that appears nowhere else at all.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const DECLARATION = /^export (?:async )?(?:function|const) (\w+)/gm;

function walk(dir: string, files: string[] = []): string[] {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return files;
	}
	for (const entry of entries) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) walk(p, files);
		else if (p.endsWith(".ts")) files.push(p);
	}
	return files;
}

/** Every `.ts` a consumer could live in: the sources, the suites and the scripts. */
const corpus = new Map<string, string>();
for (const dir of ["src", "test", "scripts"])
	for (const file of walk(join(root, dir))) corpus.set(file, readFileSync(file, "utf8"));

const unread: string[] = [];
for (const [file, text] of corpus) {
	const relative_path = relative(root, file);
	if (!relative_path.startsWith("src/") || relative_path.startsWith("src/contracts/")) continue;
	for (const match of text.matchAll(DECLARATION)) {
		const name = match[1]!;
		const mention = new RegExp(`\\b${name}\\b`);
		let readElsewhere = false;
		for (const [other, otherText] of corpus)
			if (other !== file && mention.test(otherText)) {
				readElsewhere = true;
				break;
			}
		if (readElsewhere) continue;
		// Whether the module still uses it says which repair applies: drop the `export` keyword, or
		// drop the definition. The gate does not choose; it says what it knows.
		const inside = (text.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length - 1;
		unread.push(
			`${relative_path}: ${name} — ${inside > 0 ? `used ${inside}× in its own module, so the export is what is unread` : "read nowhere at all, including here"}`,
		);
	}
}

if (unread.length > 0) {
	console.error(
		`exports nothing outside the module reads:\n  ${unread.join("\n  ")}\n` +
			"Drop the `export` keyword when the module still uses it, drop the definition when nothing does.",
	);
	process.exit(1);
}
console.log(
	`exported surface read back: ${corpus.size} modules, every exported function and constant is read elsewhere`,
);
