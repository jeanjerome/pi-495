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
 * hold, a story called done while its spec was never written, and a story called done in
 * `execution-status.yaml` that carries no verification evidence.
 *
 * That last rule replaces one this repository was told it already had. `check-blind-spots.sh` of the
 * tool package advertises it as its first check, but the check cannot fire: the status table is read
 * with `re.match(r'\s+(\S+):\s*"([^"]*)"', stripped)` against a line already stripped of its
 * indentation, so the match never succeeds, the parsed table is always empty, and four of its seven
 * checks read an empty table without saying so. It reported zero findings on a tree where a story
 * was done with no evidence at all. A gate that cannot fail is not a gate — so this control refuses,
 * rather than passes vacuously, when its own inputs go missing: an absent `execution-status.yaml`,
 * or one whose `development_status:` table cannot be found, is refused rather than read as zero
 * stories done (review round 1, reviewer B, reproduced against both).
 *
 * The files are read with expressions rather than parsed: the repository carries no YAML reader, and
 * the shapes read here — a list of story ids, a handful of top-level keys, one block per task — are
 * the shapes `plan-work` writes. A file that drifts out of them is refused rather than guessed at.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const epicsPath = "specs/epics";
const statusPath = "specs/execution-status.yaml";
const verificationsPath = "specs/verifications";
/** `  e23s02: done`, with an optional trailing YAML comment, under `development_status:`. */
const DEV_STATUS = /^ {2}(e\d+s\d+):\s*"?([a-z_]+)"?\s*(?:#.*)?$/;

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

/**
 * The lines strictly inside a top-level `<name>:` block, or null when that section is not present.
 * Shared by every section this control scans — declared stories, tasks, development status — so the
 * "enter at the header, stop at the next column-0 key" rule is written once (review round 1,
 * reviewer B: the three copies were an unnamed duplication).
 */
function linesOfSection(text: string, name: string): string[] | null {
	const lines = text.split("\n");
	const start = lines.findIndex((l) => new RegExp(`^${name}:\\s*$`).test(l));
	if (start === -1) return null;
	const out: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^\S/.test(line)) break;
		out.push(line);
	}
	return out;
}

/** The story ids an epic declares, in the order it declares them. */
function declaredStories(text: string): string[] {
	const lines = linesOfSection(text, "stories") ?? [];
	return lines.flatMap((line) => {
		const m = STORY_ID.exec(line);
		return m ? [m[1]!] : [];
	});
}

/** A bare YAML block or folded scalar marker — `|`, `>`, with an optional chomp/indent modifier —
 * names a multi-line value with nothing on its own line, so it is not itself a runnable command. */
const BLOCK_SCALAR = /^[|>][+-]?\d*$/;

/** One entry per task, holding what the control judges: its command and its state. */
function tasks(text: string): { id: string; verify: string | null; status: string | null }[] {
	const lines = linesOfSection(text, "tasks") ?? [];
	const out: { id: string; verify: string | null; status: string | null }[] = [];
	let current: { id: string; verify: string | null; status: string | null } | null = null;
	for (const line of lines) {
		const started = TASK_ID.exec(line);
		if (started) {
			if (current) out.push(current);
			current = { id: started[1]!, verify: null, status: null };
			continue;
		}
		if (!current) continue;
		const verify = /^ {4}verify:[ \t]*(.+?)[ \t]*$/.exec(line);
		if (verify) {
			const raw = verify[1]!.replace(/^["']|["']$/g, "");
			current.verify = BLOCK_SCALAR.test(raw) ? null : raw;
		}
		const status = /^ {4}status:[ \t]*(\S+)[ \t]*$/.exec(line);
		if (status) current.status = status[1]!;
	}
	if (current) out.push(current);
	return out;
}

/** What one capsule is judged against: where it is, what it holds, and the stories it declares. */
interface Capsule {
	where: string;
	dir: string;
	entries: string[];
	declared: string[];
}

/** The tasks a file declares: each needs a unique id, a command to run and a state a ledger can hold. */
function checkTasks(capsule: Capsule, entry: string, text: string): void {
	const taskList = tasks(text);
	if (taskList.length === 0) failures.push(`${capsule.where}/${entry}: carries no task`);
	const seen = new Set<string>();
	for (const task of taskList) {
		if (seen.has(task.id)) failures.push(`${capsule.where}/${entry}: task ${task.id} is declared more than once`);
		seen.add(task.id);
		if (!task.verify) failures.push(`${capsule.where}/${entry}: task ${task.id} carries no verify command`);
		if (!task.status || !(TASK_STATES as readonly string[]).includes(task.status))
			failures.push(
				`${capsule.where}/${entry}: task ${task.id} is ${task.status ?? "(nothing)"}, not one of ${TASK_STATES.join(" or ")}`,
			);
	}
}

/** One tasks file against its epic, and the spec it names — or null when it has not been planned. */
function checkTasksFile(capsule: Capsule, entry: string, story: string): string | null {
	const text = readFileSync(join(capsule.dir, entry), "utf8");
	const storyId = key(text, "story_id");
	if (storyId !== story)
		failures.push(`${capsule.where}/${entry}: carries story_id ${storyId ?? "(none)"}, but its name says ${story}`);
	if (!capsule.declared.includes(story))
		failures.push(`${capsule.where}/${entry}: story ${story} is not one the epic declares`);
	checkTasks(capsule, entry, text);

	const spec = key(text, "spec");
	if (spec === null) {
		// A story with no spec is one `plan-work` has not reached. That is the normal state of a
		// capsule, and the only thing it forbids is calling the story finished.
		const status = key(text, "status");
		if (status && SETTLED.includes(status))
			failures.push(`${capsule.where}/${entry}: story ${story} is ${status} while no spec was ever written for it`);
		return null;
	}
	if (!capsule.entries.includes(spec))
		failures.push(`${capsule.where}/${entry}: names the spec ${spec}, which is not in the capsule`);
	return spec;
}

function checkCapsule(name: string): void {
	const dir = join(root, epicsPath, name);
	const where = `${epicsPath}/${name}`;
	const epicPath = join(dir, "epic.yaml");
	if (!existsSync(epicPath)) {
		failures.push(`${where}: no epic.yaml, so nothing says which stories this capsule carries`);
		return;
	}
	const declared = declaredStories(readFileSync(epicPath, "utf8"));
	if (declared.length === 0) failures.push(`${where}/epic.yaml declares no story`);
	const capsule: Capsule = { where, dir, entries: readdirSync(dir), declared };

	const namedSpecs = new Set<string>();
	const carried = new Set<string>();
	for (const entry of capsule.entries) {
		const m = TASKS_FILE.exec(entry);
		if (!m) continue;
		carried.add(m[1]!);
		const spec = checkTasksFile(capsule, entry, m[1]!);
		if (spec) namedSpecs.add(spec);
	}

	for (const story of declared)
		if (!carried.has(story)) failures.push(`${where}/epic.yaml declares ${story}, and no tasks file carries it`);
	for (const entry of capsule.entries)
		if (SPEC_FILE.test(entry) && !namedSpecs.has(entry))
			failures.push(`${where}/${entry}: a story spec no tasks file names, so nothing runs it`);
}

/**
 * Stories `execution-status.yaml` calls done, which must each carry their verification evidence.
 * A missing file or an unreadable table refuses rather than reads as zero stories: a gate that
 * cannot fail is not a gate, and this is the exact defect this control's docstring names in the
 * tool it replaces (review round 1, reviewer B, reproduced against both).
 */
/**
 * A story's evidence file: existence alone let a zero-byte file stand as evidence (review round 1,
 * reviewer A); requiring the file to name its own story settles that without a YAML reader.
 */
function checkEvidence(story: string): void {
	const evidence = join(verificationsPath, `${story}-verify.yaml`);
	const evidencePath = join(root, evidence);
	const proof = existsSync(evidencePath) ? readFileSync(evidencePath, "utf8") : null;
	if (proof === null || !new RegExp(`^story_id:\\s*${story}\\s*$`, "m").test(proof))
		failures.push(
			`${statusPath}: ${story} is done and ${evidence} ${proof === null ? "does not exist" : `does not name story_id: ${story}`}, so nothing verified it`,
		);
}

function checkVerified(): number {
	const path = join(root, statusPath);
	if (!existsSync(path)) {
		failures.push(`${statusPath} does not exist, so no story's status can be judged`);
		return 0;
	}
	const lines = linesOfSection(readFileSync(path, "utf8"), "development_status");
	if (!lines) {
		failures.push(`${statusPath}: no development_status: table found, so no story's status can be judged`);
		return 0;
	}
	let done = 0;
	for (const line of lines) {
		const m = DEV_STATUS.exec(line);
		if (!m) continue;
		if (m[2] !== "done") continue;
		done++;
		checkEvidence(m[1]!);
	}
	return done;
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
const verified = checkVerified();

if (failures.length > 0) {
	console.error(`capsule violations:\n${failures.map((f) => `  ${f}`).join("\n")}`);
	process.exit(1);
}
const planned = capsules.reduce(
	(n, c) => n + readdirSync(join(root, epicsPath, c)).filter((e) => SPEC_FILE.test(e)).length,
	0,
);
console.log(
	`capsules wired: ${capsules.length} capsule(s), ${planned} story/ies planned, every task runnable, ${verified} done and verified`,
);
