/**
 * V3 — the control that holds an epic capsule's wiring together, and refuses a story called done
 * without the evidence that verified it (D-54). It reads a tree and nothing else, so every case
 * here is a fixture tree of its own: the control is handed a root, never the repository it happens
 * to run in.
 *
 * What is exercised is both halves of a gate. The refusals, one per rule — and equally the passes,
 * because a control that refuses a capsule filled story by story would refuse the method this
 * repository plans with, and a control nobody can be green under is one that gets bypassed.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

const SCRIPT = join(process.cwd(), "scripts", "check-capsule.ts");

function run(root: string): { code: number | null; stdout: string; stderr: string } {
	const r = spawnSync(process.execPath, [SCRIPT, root], { encoding: "utf8", timeout: 20_000 });
	return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const EPIC = `id: e01
stories:
  - id: e01s01
    title: "A story"
`;
const TASKS = `story_id: e01s01
status: done
spec: e01s01-a-story.md
tasks:
  - id: 1
    verify: "npm test"
    status: passing
`;
const SPEC = "# A story\n";
const STATUS = `development_status:
  e01: in_progress
  e01s01: done

stories:
  e01s01:
    status: done
    title: "A story"
`;
const EVIDENCE = `story_id: e01s01
verified_at: "2026-09-21T00:00:00Z"

phases:
  build:
    passed: true
`;

/** The files of a tree the control accepts, each one replaceable — or removable with null. */
interface Tree {
	"specs/epics/e01-a/epic.yaml": string | null;
	"specs/epics/e01-a/e01s01-tasks.yaml": string | null;
	"specs/epics/e01-a/e01s01-a-story.md": string | null;
	"specs/execution-status.yaml": string | null;
	"specs/verifications/e01s01-verify.yaml": string | null;
	[extra: string]: string | null;
}

const WIRED: Tree = {
	"specs/epics/e01-a/epic.yaml": EPIC,
	"specs/epics/e01-a/e01s01-tasks.yaml": TASKS,
	"specs/epics/e01-a/e01s01-a-story.md": SPEC,
	"specs/execution-status.yaml": STATUS,
	"specs/verifications/e01s01-verify.yaml": EVIDENCE,
};

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "495-capsule-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A wired tree with the given files replaced or, when null, left out. */
function tree(over: Partial<Tree> = {}): string {
	for (const [path, content] of Object.entries({ ...WIRED, ...over })) {
		if (typeof content !== "string") continue;
		const full = join(root, path);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	}
	return root;
}

function refuses(over: Partial<Tree>, pattern: RegExp): void {
	const result = run(tree(over));
	assert.notEqual(result.code, 0, `expected a refusal, got: ${result.stdout}`);
	assert.match(result.stderr, pattern);
}

function passes(over: Partial<Tree> = {}): string {
	const result = run(tree(over));
	assert.equal(result.code, 0, result.stderr);
	return result.stdout;
}

describe("capsule control — what it accepts (D-54)", () => {
	it("accepts a wired capsule and counts what it verified", () => {
		assert.match(passes(), /1 capsule\(s\), 1 story\/ies planned, every task runnable, 1 done and verified/);
	});

	// A capsule is filled story by story: the spec of a story nobody has planned yet is simply
	// absent, and refusing that would refuse the method rather than a mistake.
	it("accepts a story that has a tasks file but no spec yet, while it is not called finished", () => {
		passes({
			"specs/epics/e01-a/epic.yaml": `${EPIC}  - id: e01s02\n    title: "Unplanned"\n`,
			"specs/epics/e01-a/e01s02-tasks.yaml":
				'story_id: e01s02\nstatus: backlog\ntasks:\n  - id: 1\n    verify: "npm test"\n    status: failing\n',
		});
	});

	it("accepts a trailing comment on a story id, a task id and a status row", () => {
		passes({
			"specs/epics/e01-a/epic.yaml": 'id: e01\nstories:\n  - id: e01s01   # first\n    title: "A story"\n',
			"specs/epics/e01-a/e01s01-tasks.yaml": TASKS.replace("  - id: 1", "  - id: 1   # the only one"),
			"specs/execution-status.yaml": STATUS.replace("  e01s01: done", "  e01s01: done   # shipped"),
		});
	});

	it("accepts a status table carrying a comment at column zero, and still reads the rows under it", () => {
		refuses(
			{
				"specs/execution-status.yaml": STATUS.replace("development_status:", "development_status:\n# delivered so far"),
				"specs/verifications/e01s01-verify.yaml": null,
			},
			/e01s01 is done and .* does not exist/,
		);
	});

	it("accepts a quoted status value and a quoted story_id in the evidence", () => {
		passes({
			"specs/execution-status.yaml": STATUS.replace("  e01s01: done", "  e01s01: 'done'"),
			"specs/verifications/e01s01-verify.yaml": EVIDENCE.replace("story_id: e01s01", 'story_id: "e01s01"'),
		});
	});
});

describe("capsule control — the wiring it refuses (D-54)", () => {
	it("refuses a capsule with no epic.yaml", () => {
		refuses({ "specs/epics/e01-a/epic.yaml": null }, /no epic\.yaml/);
	});

	it("refuses an epic that declares no story", () => {
		refuses({ "specs/epics/e01-a/epic.yaml": "id: e01\nstories:\n" }, /declares no story/);
	});

	it("refuses a story an epic declares that no tasks file carries", () => {
		refuses(
			{ "specs/epics/e01-a/epic.yaml": `${EPIC}  - id: e01s02\n    title: "Dropped"\n` },
			/declares e01s02, and no tasks file carries it/,
		);
	});

	it("refuses the same story id declared twice", () => {
		refuses(
			{ "specs/epics/e01-a/epic.yaml": `${EPIC}  - id: e01s01\n    title: "Again"\n` },
			/story e01s01 is declared more than once/,
		);
	});

	it("refuses a tasks file whose story the epic never declared", () => {
		refuses(
			{
				"specs/epics/e01-a/e01s02-tasks.yaml":
					'story_id: e01s02\ntasks:\n  - id: 1\n    verify: "npm test"\n    status: failing\n',
			},
			/story e01s02 is not one the epic declares/,
		);
	});

	it("refuses a tasks file whose story_id disagrees with its own name", () => {
		refuses(
			{ "specs/epics/e01-a/e01s01-tasks.yaml": TASKS.replace("story_id: e01s01", "story_id: e01s09") },
			/carries story_id e01s09/,
		);
	});

	it("refuses a spec that is named but absent from the capsule", () => {
		refuses({ "specs/epics/e01-a/e01s01-a-story.md": null }, /which is not in the capsule/);
	});

	// A tasks file pointing at a sibling's spec would otherwise satisfy both the "spec present"
	// lookup and the rule forbidding a finished story with no spec of its own.
	it("refuses a spec that belongs to another story", () => {
		refuses(
			{
				"specs/epics/e01-a/epic.yaml": `${EPIC}  - id: e01s02\n    title: "Second"\n`,
				"specs/epics/e01-a/e01s02-tasks.yaml": `story_id: e01s02\nstatus: done\nspec: e01s01-a-story.md\ntasks:\n  - id: 1\n    verify: "npm test"\n    status: passing\n`,
			},
			/which belongs to another story/,
		);
	});

	it("refuses a story spec no tasks file names, so nothing runs it", () => {
		refuses({ "specs/epics/e01-a/e01s09-orphan.md": "# Orphan\n" }, /a story spec no tasks file names/);
	});

	it("refuses a story called finished while no spec was ever written for it", () => {
		refuses(
			{
				"specs/epics/e01-a/e01s01-tasks.yaml": TASKS.replace("spec: e01s01-a-story.md\n", ""),
				"specs/epics/e01-a/e01s01-a-story.md": null,
			},
			/is done while no spec was ever written/,
		);
	});
});

describe("capsule control — the tasks it refuses (D-54)", () => {
	it("refuses a tasks file carrying no task at all", () => {
		refuses(
			{ "specs/epics/e01-a/e01s01-tasks.yaml": "story_id: e01s01\nspec: e01s01-a-story.md\ntasks:\n" },
			/carries no task/,
		);
	});

	it("refuses the same task id declared twice", () => {
		refuses(
			{ "specs/epics/e01-a/e01s01-tasks.yaml": `${TASKS}  - id: 1\n    verify: "npm test"\n    status: passing\n` },
			/task 1 is declared more than once/,
		);
	});

	it("refuses a task with no verify command", () => {
		refuses(
			{ "specs/epics/e01-a/e01s01-tasks.yaml": TASKS.replace('    verify: "npm test"\n', "") },
			/task 1 carries no verify command/,
		);
	});

	// A bare block or folded scalar marker names a multi-line value with nothing on its own line,
	// in either order of chomp and indent indicator, so it is not itself a command to run.
	for (const marker of ["|", ">", "|-", "|2-", ">2-", "|1+"])
		it(`refuses a verify of ${marker}, which names a value rather than a command`, () => {
			refuses(
				{ "specs/epics/e01-a/e01s01-tasks.yaml": TASKS.replace('"npm test"', marker) },
				/task 1 carries no verify command/,
			);
		});

	it("refuses a verify of whitespace only", () => {
		refuses(
			{ "specs/epics/e01-a/e01s01-tasks.yaml": TASKS.replace('"npm test"', '"   "') },
			/task 1 carries no verify command/,
		);
	});

	it("refuses a task state no ledger can hold", () => {
		refuses(
			{ "specs/epics/e01-a/e01s01-tasks.yaml": TASKS.replace("status: passing", "status: abandoned") },
			/task 1 is abandoned, not one of failing or passing/,
		);
	});

	it("refuses a task with no state at all", () => {
		refuses(
			{ "specs/epics/e01-a/e01s01-tasks.yaml": TASKS.replace("    status: passing\n", "") },
			/task 1 is \(nothing\)/,
		);
	});

	// A list item that does not parse must not be skipped: its fields would be read as the previous
	// task's, and the control would then report a state no task declares.
	it("refuses a list item under tasks: that is not a task id", () => {
		refuses(
			{ "specs/epics/e01-a/e01s01-tasks.yaml": `${TASKS}  - name: stray\n    status: failing\n` },
			/is not a task id this control can read/,
		);
	});

	it("refuses a list item under stories: that is not a story id", () => {
		refuses({ "specs/epics/e01-a/epic.yaml": `${EPIC}  - name: stray\n` }, /is not a story id this control can read/);
	});
});

describe("capsule control — a gate that cannot read refuses rather than counts zero (D-54)", () => {
	it("refuses when specs/epics is missing entirely", () => {
		refuses(
			{
				"specs/epics/e01-a/epic.yaml": null,
				"specs/epics/e01-a/e01s01-tasks.yaml": null,
				"specs/epics/e01-a/e01s01-a-story.md": null,
			},
			/specs\/epics is missing, and nothing else says what is being built/,
		);
	});

	it("refuses when execution-status.yaml does not exist", () => {
		refuses({ "specs/execution-status.yaml": null }, /does not exist, so no story's status can be judged/);
	});

	it("refuses when no development_status table can be found", () => {
		refuses(
			{ "specs/execution-status.yaml": "epics:\n  e01:\n    status: in_progress\n" },
			/no development_status: table found/,
		);
	});

	it("refuses a status table that holds no row it can read, rather than counting zero done", () => {
		refuses(
			{ "specs/execution-status.yaml": "development_status:\n  not a row at all\n" },
			/holds no story this control could read/,
		);
	});

	for (const [name, row] of [
		["a capitalised value", "  e01s01: Done"],
		["a value with a suffix", "  e01s01: done-v2"],
		["a quoted key", '  "e01s01": done'],
		["a row nested under its epic", "  e01:\n    e01s01: done"],
	] as const)
		it(`refuses ${name}, rather than reading past it`, () => {
			refuses(
				{ "specs/execution-status.yaml": `development_status:\n${row}\n` },
				/is not a status row this control can read/,
			);
		});

	it("refuses when the two status tables of the same file disagree", () => {
		refuses(
			{ "specs/execution-status.yaml": STATUS.replace("  e01s01: done", "  e01s01: backlog") },
			/is backlog under development_status: and done under stories:/,
		);
	});
});

describe("capsule control — the evidence it refuses (D-54)", () => {
	it("refuses a story called done whose evidence file does not exist", () => {
		refuses({ "specs/verifications/e01s01-verify.yaml": null }, /does not exist, so nothing verified it/);
	});

	it("refuses evidence that does not name the story it is supposed to verify", () => {
		refuses(
			{ "specs/verifications/e01s01-verify.yaml": EVIDENCE.replace("story_id: e01s01", "story_id: e01s09") },
			/does not name story_id: e01s01/,
		);
	});

	// Naming its own story is what a file of nothing at all can be made to do in one line; saying
	// when it was taken and which phases passed is what it cannot.
	it("refuses evidence that is nothing but its own story id", () => {
		refuses({ "specs/verifications/e01s01-verify.yaml": "story_id: e01s01\n" }, /names no verified_at/);
	});

	it("refuses evidence carrying no phase at all", () => {
		refuses(
			{ "specs/verifications/e01s01-verify.yaml": 'story_id: e01s01\nverified_at: "2026-09-21T00:00:00Z"\n' },
			/carries no phase that passed/,
		);
	});

	it("refuses evidence whose own phases record a failure", () => {
		refuses(
			{ "specs/verifications/e01s01-verify.yaml": EVIDENCE.replace("passed: true", "passed: false") },
			/carries a phase that did not pass/,
		);
	});
});
