/**
 * Structural contract of a story spec (specs/references/countable-story-format.md: twenty sections,
 * fixed names, fixed order). `plan-work` writes one `.md` story spec per story inside an epic
 * capsule, in a format written and maintained outside this repository. The bigpowers package
 * installed under `.claude/skills/` ships the procedures without the documents they cite, so that
 * format exists on this machine only as the pinned copy this control reads.
 *
 * Reading the copy is what gives the control its power to refuse. The twenty section names are not
 * restated here: they are extracted from the document itself, so a story and the format it claims
 * to follow cannot drift apart without one of the two being edited.
 *
 * A section is present when its heading appears verbatim, at its rank, carrying an approval state —
 * `[draft]`, `[reviewed]` or `[locked]`. Sections 14 to 16 carry `*NFR*` as part of their name, so
 * a story that drops the tag reads as a story that renamed the section. The header block and the
 * Fibonacci sizing are part of the format but are not checked here.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const formatPath = "specs/references/countable-story-format.md";
const epicsPath = "specs/epics";

/** `e23s01-qualifier-un-second-fournisseur.md` — a story spec inside an epic capsule. */
const STORY_FILE = /^e\d+s\d+-.+\.md$/;
/** `### 5. Main flow and business logic` — the rank of a section, then its name. */
const SECTION = /^### (\d+)\. (.+)$/;
/** The approval state a story adds to a section name, which the format itself does not carry. */
const APPROVAL = /\s*\[(?:draft|reviewed|locked)\]\s*$/;

const failures: string[] = [];

interface Section {
	rank: number;
	name: string;
}

/**
 * Headings inside a fenced block belong to the worked example, which reproduces the twenty sections
 * as a story would carry them; counting those would read forty sections in a document that has
 * twenty. A story's own fenced blocks — Gherkin scenarios, interface element lists — are skipped
 * for the same reason.
 */
function sections(markdown: string): Section[] {
	const found: Section[] = [];
	let fenced = false;
	for (const line of markdown.split("\n")) {
		if (line.startsWith("```")) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		const m = SECTION.exec(line);
		if (m) found.push({ rank: Number(m[1]), name: m[2]!.trim() });
	}
	return found;
}

/** Story specs of every capsule but the archive, which holds epics that are closed. */
function storySpecs(): string[] {
	if (!existsSync(join(root, epicsPath))) return [];
	const specs: string[] = [];
	for (const capsule of readdirSync(join(root, epicsPath), { withFileTypes: true })) {
		if (!capsule.isDirectory() || capsule.name === "archive") continue;
		for (const entry of readdirSync(join(root, epicsPath, capsule.name))) {
			if (STORY_FILE.test(entry)) specs.push(join(epicsPath, capsule.name, entry));
		}
	}
	return specs.sort();
}

if (!existsSync(join(root, formatPath))) {
	console.error(`story format violations:\n  ${formatPath} is missing, and nothing else states the format`);
	process.exit(1);
}

const reference = sections(readFileSync(join(root, formatPath), "utf8"));
if (reference.length !== 20 || reference.some((s, i) => s.rank !== i + 1)) {
	failures.push(
		`${formatPath} no longer reads as twenty sections ranked 1 to 20: ${reference.map((s) => s.rank).join(", ")}`,
	);
}

const specs = storySpecs();
for (const spec of specs) {
	const found = sections(readFileSync(join(root, spec), "utf8"));
	let aligned = true;
	for (const [i, expected] of reference.entries()) {
		const actual = found[i];
		if (!actual) {
			failures.push(`${spec}: section ${expected.rank}. ${expected.name} is missing`);
			aligned = false;
			break;
		}
		const name = actual.name.replace(APPROVAL, "");
		if (actual.rank !== expected.rank || name !== expected.name) {
			// The order is fixed, so every section past a divergence is read against the wrong one:
			// reporting them all would bury the single edit that puts the story back in step.
			failures.push(
				`${spec}: section ${expected.rank}. ${expected.name} expected at rank ${i + 1}, read ${actual.rank}. ${name}`,
			);
			aligned = false;
			break;
		}
		if (!APPROVAL.test(actual.name)) {
			failures.push(`${spec}: section ${expected.rank}. ${expected.name} carries no approval state`);
		}
	}
	if (aligned && found.length > reference.length) {
		failures.push(`${spec}: ${found.length - reference.length} section(s) beyond the twenty the format declares`);
	}
}

if (failures.length > 0) {
	console.error(`story format violations:\n${failures.map((f) => `  ${f}`).join("\n")}`);
	process.exit(1);
}
console.log(
	`story format held: ${reference.length} sections read from ${formatPath}, ${specs.length} story spec(s) checked`,
);
