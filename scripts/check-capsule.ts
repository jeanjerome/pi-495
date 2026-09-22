/**
 * Wiring of an epic capsule (CONVENTIONS.md § `specs/` — the documentation surface): a capsule holds
 * one epic, a tasks file per story it declares, and the story spec each of those names. Stories are
 * planned one at a time, so a capsule is normally half-planned: this control refuses what is wired
 * wrong, never what is not wired yet. Slicing writes an epic's entry and the story's tasks file
 * together, so a story declared with no tasks file is a mistake; the spec is the half that
 * legitimately arrives later, and its absence is refused only once the story calls itself done.
 *
 * That distinction is the whole reason it exists. A control demanding a written spec for every story
 * an epic declares cannot be green on a capsule filled story by story, which is how this repository
 * plans; it would refuse the method instead of a mistake, and a control nobody can be green under is
 * one that gets bypassed. What is refused here is a story an epic declares and no tasks file
 * carries, a tasks file whose story its epic never declared, a spec named but absent, a spec that
 * belongs to another story, a spec present that nothing names, a task with no command to run, a task
 * whose state is not one a ledger can hold, a story called done while its spec was never written,
 * and a story called done in `execution-status.yaml` that carries no verification evidence.
 *
 * That last rule replaces one this repository was told it already had. `check-blind-spots.sh` of the
 * tool package advertises it as its first check, but the check cannot fire: the status table is read
 * with `re.match(r'\s+(\S+):\s*"([^"]*)"', stripped)` against a line already stripped of its
 * indentation, so the match never succeeds, the parsed table is always empty, and four of its seven
 * checks read an empty table without saying so. It reported zero findings on a tree where a story
 * was done with no evidence at all.
 *
 * A gate that cannot fail is not a gate, so nothing here is allowed to read as zero. Every input
 * this control depends on is refused when it goes missing or stops being readable: an absent
 * `execution-status.yaml`, a status table that cannot be found, a table found but holding no row
 * this control can parse, a single line inside it that does not parse, a list item under `stories:`
 * or `tasks:` that is not the entry it should be. Reading nothing is never taken for finding
 * nothing.
 *
 * The files are read with expressions rather than parsed: the repository carries no YAML reader, and
 * the shapes read here — a list of story ids, a handful of top-level keys, one block per task — are
 * the shapes `plan-work` writes. A file that drifts out of them is refused rather than guessed at.
 *
 * The tree it judges is given as an argument and defaults to the working directory, so a test can
 * hand it a fixture rather than the repository it happens to run in.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const epicsPath = "specs/epics";
const statusPath = "specs/execution-status.yaml";
const verificationsPath = "specs/verifications";

/** `  e23s02: done` or `  e23: in_progress`, quoted or not, with an optional trailing comment. */
const STATUS_ROW = /^ {2}(\w+):\s*["']?([a-z_]+)["']?\s*(?:#.*)?$/;
/** The rows of a status table that name a story rather than an epic. */
const STORY_KEY = /^e\d+s\d+$/;
/** `e23s02-tasks.yaml` — the runnable half of one story. */
const TASKS_FILE = /^(e\d+s\d+)-tasks\.yaml$/;
/** `e23s02-le-manifeste-declare-la-strate.md` — the written half. */
const SPEC_FILE = /^(e\d+s\d+)-.+\.md$/;
/** `  - id: e23s02` under `stories:` of an epic.yaml. */
const STORY_ID = /^ {2}- id:\s*(e\d+s\d+)\s*(?:#.*)?$/;
/** `  - id: 3` under `tasks:` of a tasks file. */
const TASK_ID = /^ {2}- id:\s*(\d+)\s*(?:#.*)?$/;
/** Any list item at the depth entries sit at, so one this control cannot read is refused, not skipped. */
const LIST_ITEM = /^ {2}- /;
/** The states a task ledger holds; a task is born failing and only flips on an exit code of 0. */
const TASK_STATES = ["failing", "passing"] as const;
/** A story status that claims the work is behind it, so its spec cannot still be unwritten. */
const SETTLED = ["passing", "done"];
/** `|`, `>`, and their chomp and indent modifiers in either order: a multi-line value, not a command. */
const BLOCK_SCALAR = /^[|>][0-9+-]*$/;

/** A line that carries nothing a reader of this shape has to account for. */
function isBlankOrComment(line: string): boolean {
	return line.trim() === "" || line.trim().startsWith("#");
}

/** A top-level `<name>:` scalar of a capsule file, or null when the file does not carry it. */
function fieldOf(text: string, name: string): string | null {
	const m = new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(text);
	return m ? m[1]!.replace(/^["']|["']$/g, "").trim() : null;
}

/**
 * The lines strictly inside a top-level `<name>:` block, or null when that section is not present.
 * A blank line and a comment at column zero belong to the block they sit in — stopping at one would
 * cut a table short and leave the rest of it unread, which is how a check stops being able to fail.
 */
function linesOfSection(text: string, name: string): string[] | null {
	const lines = text.split("\n");
	const start = lines.findIndex((l) => new RegExp(`^${name}:\\s*$`).test(l));
	if (start === -1) return null;
	const out: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^[^\s#]/.test(line)) break;
		out.push(line);
	}
	return out;
}

/** The story ids an epic declares, and a refusal for every list item that is not one. */
function declaredStories(text: string, where: string): { stories: string[]; failures: string[] } {
	const lines = linesOfSection(text, "stories") ?? [];
	const stories: string[] = [];
	const failures: string[] = [];
	for (const line of lines) {
		const m = STORY_ID.exec(line);
		if (m) stories.push(m[1]!);
		else if (LIST_ITEM.test(line)) failures.push(`${where}: ${line.trim()} is not a story id this control can read`);
	}
	for (const [i, story] of stories.entries())
		if (stories.indexOf(story) !== i) failures.push(`${where}: story ${story} is declared more than once`);
	return { stories, failures };
}

/** One entry per task, holding what the control judges: its command and its state. */
interface Task {
	id: string;
	verify: string | null;
	status: string | null;
}

/** One line inside a task block: the command it runs, or the state a ledger would hold for it. */
function readTaskField(task: Task, line: string): void {
	const verify = /^ {4}verify:[ \t]*(.+?)[ \t]*$/.exec(line);
	if (verify) {
		const raw = verify[1]!.replace(/^["']|["']$/g, "").trim();
		task.verify = raw === "" || BLOCK_SCALAR.test(raw) ? null : raw;
	}
	const status = /^ {4}status:[ \t]*(\S+)[ \t]*$/.exec(line);
	if (status) task.status = status[1]!;
}

/** The tasks a file declares, and a refusal for every list item that is not one. */
function tasksOf(text: string, where: string): { tasks: Task[]; failures: string[] } {
	const tasks: Task[] = [];
	const failures: string[] = [];
	let current: Task | null = null;
	for (const line of linesOfSection(text, "tasks") ?? []) {
		const started = TASK_ID.exec(line);
		if (started) {
			current = { id: started[1]!, verify: null, status: null };
			tasks.push(current);
		} else if (LIST_ITEM.test(line)) {
			failures.push(`${where}: ${line.trim()} is not a task id this control can read`);
			current = null;
		} else if (current) readTaskField(current, line);
	}
	return { tasks, failures };
}

/** What one capsule is judged against: where it is, what it holds, and the stories it declares. */
interface Capsule {
	where: string;
	dir: string;
	entries: string[];
	declared: string[];
}

/** The tasks a file declares: each needs a unique id, a command to run and a state a ledger can hold. */
function checkTasks(capsule: Capsule, entry: string, text: string): string[] {
	const { tasks, failures } = tasksOf(text, `${capsule.where}/${entry}`);
	if (tasks.length === 0) failures.push(`${capsule.where}/${entry}: carries no task`);
	const seen = new Set<string>();
	for (const task of tasks) {
		if (seen.has(task.id)) failures.push(`${capsule.where}/${entry}: task ${task.id} is declared more than once`);
		seen.add(task.id);
		if (!task.verify) failures.push(`${capsule.where}/${entry}: task ${task.id} carries no verify command`);
		if (!task.status || !(TASK_STATES as readonly string[]).includes(task.status))
			failures.push(
				`${capsule.where}/${entry}: task ${task.id} is ${task.status ?? "(nothing)"}, not one of ${TASK_STATES.join(" or ")}`,
			);
	}
	return failures;
}

/** The spec a tasks file names: present in the capsule, and belonging to the story that names it. */
function checkSpec(
	capsule: Capsule,
	entry: string,
	story: string,
	text: string,
): { spec: string | null; failures: string[] } {
	const where = `${capsule.where}/${entry}`;
	const spec = fieldOf(text, "spec");
	if (spec === null) {
		// A story with no spec is one `plan-work` has not reached. That is the normal state of a
		// capsule, and the only thing it forbids is calling the story finished.
		const status = fieldOf(text, "status");
		if (status && SETTLED.includes(status))
			return { spec: null, failures: [`${where}: story ${story} is ${status} while no spec was ever written for it`] };
		return { spec: null, failures: [] };
	}
	if (!spec.startsWith(`${story}-`))
		return { spec: null, failures: [`${where}: names the spec ${spec}, which belongs to another story`] };
	if (!capsule.entries.includes(spec))
		return { spec: null, failures: [`${where}: names the spec ${spec}, which is not in the capsule`] };
	return { spec, failures: [] };
}

/** One tasks file against its epic, and the spec it names — or null when it has not been planned. */
function checkTasksFile(capsule: Capsule, entry: string, story: string): { spec: string | null; failures: string[] } {
	const text = readFileSync(join(capsule.dir, entry), "utf8");
	const failures: string[] = [];
	const storyId = fieldOf(text, "story_id");
	if (storyId !== story)
		failures.push(`${capsule.where}/${entry}: carries story_id ${storyId ?? "(none)"}, but its name says ${story}`);
	if (!capsule.declared.includes(story))
		failures.push(`${capsule.where}/${entry}: story ${story} is not one the epic declares`);
	failures.push(...checkTasks(capsule, entry, text));
	const spec = checkSpec(capsule, entry, story, text);
	return { spec: spec.spec, failures: [...failures, ...spec.failures] };
}

/** Every tasks file of a capsule: the stories they carry, the specs they name, and what is wrong. */
function checkTasksFiles(capsule: Capsule): { namedSpecs: Set<string>; carried: Set<string>; failures: string[] } {
	const namedSpecs = new Set<string>();
	const carried = new Set<string>();
	const failures: string[] = [];
	for (const entry of capsule.entries) {
		const m = TASKS_FILE.exec(entry);
		if (!m) continue;
		carried.add(m[1]!);
		const checked = checkTasksFile(capsule, entry, m[1]!);
		failures.push(...checked.failures);
		if (checked.spec) namedSpecs.add(checked.spec);
	}
	return { namedSpecs, carried, failures };
}

function checkCapsule(root: string, name: string): string[] {
	const dir = join(root, epicsPath, name);
	const where = `${epicsPath}/${name}`;
	const epicPath = join(dir, "epic.yaml");
	if (!existsSync(epicPath)) return [`${where}: no epic.yaml, so nothing says which stories this capsule carries`];

	const declared = declaredStories(readFileSync(epicPath, "utf8"), `${where}/epic.yaml`);
	const failures = [...declared.failures];
	if (declared.stories.length === 0) failures.push(`${where}/epic.yaml declares no story`);
	const capsule: Capsule = { where, dir, entries: readdirSync(dir), declared: declared.stories };

	const { namedSpecs, carried, failures: wiring } = checkTasksFiles(capsule);
	failures.push(...wiring);

	for (const story of declared.stories)
		if (!carried.has(story)) failures.push(`${where}/epic.yaml declares ${story}, and no tasks file carries it`);
	for (const entry of capsule.entries)
		if (SPEC_FILE.test(entry) && !namedSpecs.has(entry))
			failures.push(`${where}/${entry}: a story spec no tasks file names, so nothing runs it`);
	return failures;
}

/**
 * A story's verification evidence. Existence alone let a file of nothing at all stand as proof, and
 * so does a file that only names its story: what is asked here is that the evidence say when it was
 * taken and carry phases that passed. A verification whose own phases record a failure is not one a
 * story can be called done on.
 */
function checkEvidence(root: string, story: string): string[] {
	const evidence = join(verificationsPath, `${story}-verify.yaml`);
	const proof = existsSync(join(root, evidence)) ? readFileSync(join(root, evidence), "utf8") : null;
	if (proof === null) return [`${statusPath}: ${story} is done and ${evidence} does not exist, so nothing verified it`];
	if (!new RegExp(`^story_id:\\s*["']?${story}["']?\\s*$`, "m").test(proof))
		return [`${statusPath}: ${story} is done and ${evidence} does not name story_id: ${story}, so nothing verified it`];
	if (!fieldOf(proof, "verified_at")) return [`${evidence}: names no verified_at, so nothing says when it was taken`];
	const phases = linesOfSection(proof, "phases");
	const passed = phases?.flatMap((l) => /^\s+passed:\s*(true|false)\s*$/.exec(l)?.[1] ?? []) ?? [];
	if (passed.length === 0) return [`${evidence}: carries no phase that passed, so it verifies nothing`];
	if (passed.includes("false"))
		return [`${evidence}: carries a phase that did not pass, so ${story} cannot be done on it`];
	return [];
}

/** The status each story carries under `stories:`, the second table the same file keeps. */
function storyStatuses(text: string): Map<string, string> {
	const out = new Map<string, string>();
	let current: string | null = null;
	for (const line of linesOfSection(text, "stories") ?? []) {
		const story = /^ {2}(e\d+s\d+):\s*(?:#.*)?$/.exec(line);
		if (story) {
			current = story[1]!;
			continue;
		}
		const status = /^ {4}status:\s*["']?([a-z_]+)["']?\s*(?:#.*)?$/.exec(line);
		if (status && current) out.set(current, status[1]!);
	}
	return out;
}

/**
 * The status each story carries under `development_status:`. A line that does not parse is a
 * refusal of its own, and a table that yields no story at all is refused rather than counted as
 * none: reading nothing is what makes a gate stop being able to fail.
 */
function readStatusTable(lines: string[]): { status: Map<string, string>; failures: string[] } {
	const failures: string[] = [];
	const status = new Map<string, string>();
	for (const line of lines) {
		if (isBlankOrComment(line)) continue;
		const m = STATUS_ROW.exec(line);
		if (!m) failures.push(`${statusPath}: ${JSON.stringify(line)} is not a status row this control can read`);
		else if (STORY_KEY.test(m[1]!)) status.set(m[1]!, m[2]!);
	}
	if (status.size === 0)
		failures.push(
			`${statusPath}: the development_status: table holds no story this control could read, so it judges nothing`,
		);
	return { status, failures };
}

/** Every story the status file calls done, with a refusal for anything that stops it being readable. */
function doneStories(root: string): { done: string[]; failures: string[] } {
	const path = join(root, statusPath);
	if (!existsSync(path))
		return { done: [], failures: [`${statusPath} does not exist, so no story's status can be judged`] };
	const text = readFileSync(path, "utf8");
	const lines = linesOfSection(text, "development_status");
	if (!lines)
		return {
			done: [],
			failures: [`${statusPath}: no development_status: table found, so no story's status can be judged`],
		};

	const { status, failures } = readStatusTable(lines);
	for (const [story, second] of storyStatuses(text))
		if (status.has(story) && status.get(story) !== second)
			failures.push(
				`${statusPath}: ${story} is ${status.get(story)} under development_status: and ${second} under stories:`,
			);

	return { done: [...status].filter(([, s]) => s === "done").map(([story]) => story), failures };
}

const root = process.argv[2] ?? process.cwd();
if (!existsSync(join(root, epicsPath))) {
	console.error(`capsule violations:\n  ${epicsPath} is missing, and nothing else says what is being built`);
	process.exit(1);
}

const capsules = readdirSync(join(root, epicsPath), { withFileTypes: true })
	.filter((e) => e.isDirectory() && e.name !== "archive")
	.map((e) => e.name)
	.sort();

const failures = capsules.flatMap((c) => checkCapsule(root, c));
const status = doneStories(root);
failures.push(...status.failures, ...status.done.flatMap((s) => checkEvidence(root, s)));

if (failures.length > 0) {
	console.error(`capsule violations:\n${failures.map((f) => `  ${f}`).join("\n")}`);
	process.exit(1);
}
const planned = capsules.reduce(
	(n, c) => n + readdirSync(join(root, epicsPath, c)).filter((e) => SPEC_FILE.test(e)).length,
	0,
);
console.log(
	`capsules wired: ${capsules.length} capsule(s), ${planned} story/ies planned, every task runnable, ${status.done.length} done and verified`,
);
