/**
 * Structural contract of a story (cycle/format-de-story.md): a three-line header, five sections
 * with fixed names and order, promises written as scenarios, and tasks that each say what holds
 * them. The section names are not restated here: they are read from the format, so a story and the
 * format it claims to follow cannot drift apart without one of the two being edited.
 *
 * A story marked `versée` is history and is not judged: nothing new is written in it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const formatPath = "cycle/format-de-story.md";
const storiesPath = "specs/stories";

/** `e01s05-la-decision-est-ecrite.md` — a story file. */
const STORY_FILE = /^e\d+s\d+-.+\.md$/;
/** `## 2. Promesses` — the rank of a section, then its name. */
const SECTION = /^## (\d+)\. (.+)$/;
/** `### Tâche 1 — Le noyau repose la question` — one task. */
const TASK = /^### Tâche (\d+) — .+$/;
const STATUSES = ["à faire", "en cours", "versée"];
const TASK_LINES = ["Vérifie :", "Tient :", "Rouge :"];

const failures: string[] = [];

interface Section {
	rank: number;
	name: string;
	body: string[];
}

/** Headings inside a fenced block belong to the format's example, or to a story's Gherkin. */
function sections(markdown: string): Section[] {
	const found: Section[] = [];
	let fenced = false;
	for (const line of markdown.split("\n")) {
		if (line.startsWith("```")) fenced = !fenced;
		if (fenced) continue;
		const m = SECTION.exec(line);
		if (m) found.push({ rank: Number(m[1]), name: m[2]!.trim(), body: [] });
		else found.at(-1)?.body.push(line);
	}
	return found;
}

/** A header line, read before the first section only. */
function header(markdown: string, key: string): string | null {
	const preamble = markdown.split("\n## ")[0]!;
	const m = new RegExp(`^${key} : (.+)$`, "m").exec(preamble);
	return m ? m[1]!.trim() : null;
}

function storyFiles(): string[] {
	if (!existsSync(join(root, storiesPath))) return [];
	const files: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) walk(path);
			else if (STORY_FILE.test(entry)) files.push(path.slice(root.length + 1));
		}
	};
	walk(join(root, storiesPath));
	return files.sort();
}

/** Every task carries the three lines that say what holds it; a manual check stands for `Vérifie :`. */
function checkTasks(story: string, body: string[]): void {
	let task: string | null = null;
	let seen: string[] = [];
	let count = 0;
	const close = (): void => {
		if (task === null) return;
		for (const label of TASK_LINES) {
			if (!seen.includes(label)) failures.push(`${story}: ${task} carries no line "- ${label}"`);
		}
	};
	for (const line of body) {
		const m = TASK.exec(line);
		if (m) {
			close();
			count += 1;
			task = `tâche ${m[1]}`;
			seen = [];
			if (Number(m[1]) !== count) failures.push(`${story}: ${task} read where tâche ${count} was expected`);
			continue;
		}
		if (line.startsWith("- Vérifie à la main :")) seen.push("Vérifie :");
		const label = TASK_LINES.find((l) => line.startsWith(`- ${l}`));
		if (label) seen.push(label);
	}
	close();
	if (count === 0 && !body.some((l) => l.startsWith("Sans objet"))) {
		failures.push(`${story}: no task, and not "Sans objet"`);
	}
}

if (!existsSync(join(root, formatPath))) {
	console.error(`story format violations:\n  ${formatPath} is missing, and nothing else states the format`);
	process.exit(1);
}

const reference = sections(readFileSync(join(root, formatPath), "utf8"));
if (reference.length !== 5 || reference.some((s, i) => s.rank !== i + 1)) {
	failures.push(
		`${formatPath} no longer reads as five sections ranked 1 to 5: ${reference.map((s) => s.rank).join(", ")}`,
	);
}

const stories = storyFiles();
let judged = 0;
for (const story of stories) {
	const markdown = readFileSync(join(root, story), "utf8");
	const status = header(markdown, "Statut");
	if (status === "versée") continue;
	judged += 1;
	if (status === null || !STATUSES.includes(status)) {
		failures.push(`${story}: Statut is ${status ?? "missing"}, not one of ${STATUSES.join(", ")}`);
	}
	const id = story.split("/").at(-1)!.split("-")[0]!;
	const epic = id.split("s")[0]!;
	if (header(markdown, "Story") !== id) failures.push(`${story}: header "Story : ${id}" is missing`);
	if (header(markdown, "Epic") !== epic) failures.push(`${story}: header "Epic : ${epic}" is missing`);
	const found = sections(markdown);
	let aligned = true;
	for (const [i, expected] of reference.entries()) {
		const actual = found[i];
		if (!actual) {
			failures.push(`${story}: section ${expected.rank}. ${expected.name} is missing`);
			aligned = false;
			break;
		}
		if (actual.rank !== expected.rank || actual.name !== expected.name) {
			// The order is fixed, so every section past a divergence is read against the wrong one.
			failures.push(
				`${story}: section ${expected.rank}. ${expected.name} expected at rank ${i + 1}, read ${actual.rank}. ${actual.name}`,
			);
			aligned = false;
			break;
		}
	}
	if (!aligned) continue;
	if (found.length > reference.length) {
		failures.push(`${story}: ${found.length - reference.length} section(s) beyond the five the format declares`);
	}
	if (!found[1]!.body.some((l) => l.startsWith("Scenario:")))
		failures.push(`${story}: no promise written as a Scenario`);
	checkTasks(story, found[3]!.body);
}

if (failures.length > 0) {
	console.error(`story format violations:\n${failures.map((f) => `  ${f}`).join("\n")}`);
	process.exit(1);
}
console.log(
	`story format held: ${reference.length} sections read from ${formatPath}, ${judged} story(ies) judged, ${stories.length - judged} versée(s)`,
);
