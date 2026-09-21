/**
 * Wiring of an epic capsule (CONVENTIONS.md § `specs/` — the documentation surface): a capsule holds
 * one epic, a tasks file per story it declares, and the story spec each of those names. Stories are
 * planned one at a time, so a capsule is normally half-planned: this control refuses what is wired
 * wrong, never what is not wired yet.
 *
 * That distinction is the whole reason it exists. A control demanding a written spec for every story
 * an epic declares cannot be green on a capsule filled story by story, which is how this repository
 * plans; it would refuse the method instead of a mistake, and a control nobody can be green under is
 * one that gets bypassed. What is refused here is a story an epic declares and no tasks file
 * carries, a tasks file whose story its epic never declared, a spec named but absent, a spec present
 * that nothing names, a task with no command to run, a task whose state is not one a ledger can
 * hold, and a story called done while its spec was never written.
 *
 * The files are read with expressions rather than parsed: the repository carries no YAML reader, and
 * the shapes read here — a list of story ids, a handful of top-level keys, one block per task — are
 * the shapes `plan-work` writes. A file that drifts out of them is refused rather than guessed at.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const epicsPath = "specs/epics";

/** `e23s02-tasks.yaml` — the runnable half of one story. */
const TASKS_FILE = /^(e\d+s\d+)-tasks\.yaml$/;
/** `e23s02-le-manifeste-declare-la-strate.md` — the written half. */
const SPEC_FILE = /^(e\d+s\d+)-.+\.md$/;
/** `  - id: e23s02` under `stories:` of an epic.yaml. */
const STORY_ID = /^ {2}- id:\s*(e\d+s\d+)\s*$/;
/** `  - id: 3` under `tasks:` of a tasks file. */
const TASK_ID = /^ {2}- id:\s*(\d+)\s*$/;
/** The states a task ledger holds; a task is born failing and only flips on an exit code of 0. */
const TASK_STATES = ["failing", "passing"] as const;
/** A story status that claims the work is behind it, so its spec cannot still be unwritten. */
const SETTLED = ["passing", "done"];

const failures: string[] = [];

/** A top-level key of a capsule file, or null when the file does not carry it. */
function key(text: string, name: string): string | null {
	const m = new RegExp(`^${name}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(text);
	return m ? m[1]!.replace(/^["']|["']$/g, "") : null;
}

/** The story ids an epic declares, in the order it declares them. */
function declaredStories(text: string): string[] {
	const out: string[] = [];
	let inStories = false;
	for (const line of text.split("\n")) {
		if (/^stories:\s*$/.test(line)) {
			inStories = true;
			continue;
		}
		if (inStories && /^\S/.test(line)) break;
		const m = STORY_ID.exec(line);
		if (inStories && m) out.push(m[1]!);
	}
	return out;
}

/** One entry per task, holding what the control judges: its command and its state. */
function tasks(text: string): { id: string; verify: string | null; status: string | null }[] {
	const out: { id: string; verify: string | null; status: string | null }[] = [];
	let inTasks = false;
	let current: { id: string; verify: string | null; status: string | null } | null = null;
	for (const line of text.split("\n")) {
		if (/^tasks:\s*$/.test(line)) {
			inTasks = true;
			continue;
		}
		if (!inTasks) continue;
		if (/^\S/.test(line)) break;
		const started = TASK_ID.exec(line);
		if (started) {
			if (current) out.push(current);
			current = { id: started[1]!, verify: null, status: null };
			continue;
		}
		if (!current) continue;
		const verify = /^ {4}verify:[ \t]*(.+?)[ \t]*$/.exec(line);
		if (verify) current.verify = verify[1]!.replace(/^["']|["']$/g, "");
		const status = /^ {4}status:[ \t]*(\S+)[ \t]*$/.exec(line);
		if (status) current.status = status[1]!;
	}
	if (current) out.push(current);
	return out;
}

function checkCapsule(capsule: string): void {
	const dir = join(root, epicsPath, capsule);
	const where = `${epicsPath}/${capsule}`;
	const epicPath = join(dir, "epic.yaml");
	if (!existsSync(epicPath)) {
		failures.push(`${where}: no epic.yaml, so nothing says which stories this capsule carries`);
		return;
	}
	const entries = readdirSync(dir);
	const declared = declaredStories(readFileSync(epicPath, "utf8"));
	if (declared.length === 0) failures.push(`${where}/epic.yaml declares no story`);

	const namedSpecs = new Set<string>();
	const carried = new Set<string>();
	for (const entry of entries) {
		const m = TASKS_FILE.exec(entry);
		if (!m) continue;
		const fromName = m[1]!;
		const text = readFileSync(join(dir, entry), "utf8");
		const storyId = key(text, "story_id");
		carried.add(fromName);
		if (storyId !== fromName)
			failures.push(`${where}/${entry}: carries story_id ${storyId ?? "(none)"}, but its name says ${fromName}`);
		if (!declared.includes(fromName))
			failures.push(`${where}/${entry}: story ${fromName} is not one the epic declares`);

		const spec = key(text, "spec");
		if (spec !== null) {
			namedSpecs.add(spec);
			if (!entries.includes(spec))
				failures.push(`${where}/${entry}: names the spec ${spec}, which is not in the capsule`);
		} else {
			// A story with no spec is one `plan-work` has not reached. That is the normal state of a
			// capsule, and the only thing it forbids is calling the story finished.
			const status = key(text, "status");
			if (status && SETTLED.includes(status))
				failures.push(`${where}/${entry}: story ${fromName} is ${status} while no spec was ever written for it`);
		}

		const taskList = tasks(text);
		if (taskList.length === 0) failures.push(`${where}/${entry}: carries no task`);
		for (const task of taskList) {
			if (!task.verify) failures.push(`${where}/${entry}: task ${task.id} carries no verify command`);
			if (!task.status || !TASK_STATES.includes(task.status as (typeof TASK_STATES)[number]))
				failures.push(
					`${where}/${entry}: task ${task.id} is ${task.status ?? "(nothing)"}, not one of ${TASK_STATES.join(" or ")}`,
				);
		}
	}

	for (const story of declared)
		if (!carried.has(story)) failures.push(`${where}/epic.yaml declares ${story}, and no tasks file carries it`);
	for (const entry of entries) {
		if (!SPEC_FILE.test(entry) || namedSpecs.has(entry)) continue;
		failures.push(`${where}/${entry}: a story spec no tasks file names, so nothing runs it`);
	}
}

if (!existsSync(join(root, epicsPath))) {
	console.error(`capsule violations:\n  ${epicsPath} is missing, and nothing else says what is being built`);
	process.exit(1);
}

const capsules = readdirSync(join(root, epicsPath), { withFileTypes: true })
	.filter((e) => e.isDirectory() && e.name !== "archive")
	.map((e) => e.name)
	.sort();
for (const capsule of capsules) checkCapsule(capsule);

if (failures.length > 0) {
	console.error(`capsule violations:\n${failures.map((f) => `  ${f}`).join("\n")}`);
	process.exit(1);
}
const planned = capsules.reduce(
	(n, c) => n + readdirSync(join(root, epicsPath, c)).filter((e) => SPEC_FILE.test(e)).length,
	0,
);
console.log(`capsules wired: ${capsules.length} capsule(s), ${planned} story/ies planned, every task runnable`);
