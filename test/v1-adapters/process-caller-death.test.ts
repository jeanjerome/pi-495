import { strict as assert } from "node:assert";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { runProcess, WATCHDOG } from "../../src/adapters/sandbox/process.ts";
import { outputDir, removedAfterEach } from "../helpers/fixtures.ts";

const NODE = process.execPath;
const PROCESS_MODULE = new URL("../../src/adapters/sandbox/process.ts", import.meta.url).href;
const cleanups = removedAfterEach();
const started: number[] = [];
let root: string;

beforeEach(() => {
	root = outputDir("caller-death-", cleanups);
	mkdirSync(root, { recursive: true });
});
afterEach(() => {
	for (const pid of started.splice(0)) {
		if (Number.isInteger(pid) && pid > 1 && ownedByThisTest(pid)) process.kill(pid, "SIGKILL");
	}
});

/** Whether `pid` still names a process this test started: its command line carries the test's own directory. */
function ownedByThisTest(pid: number): boolean {
	const line = spawnSync("/bin/ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).stdout;
	return line.includes(root);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean, boundMs: number): Promise<boolean> {
	for (const limit = Date.now() + boundMs; Date.now() < limit; await sleep(50)) if (condition()) return true;
	return condition();
}

/** Whether `pid` names a process that still runs; a zombie waiting for its parent is gone. */
function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
	} catch {
		return false;
	}
	const state = spawnSync("/bin/ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
	return state !== "" && !state.startsWith("Z");
}

/** The pids of the `node -e` processes whose last argument is `leader`: the watchdogs guarding that group. */
function watchdogsOf(leader: number): number[] {
	return spawnSync("/bin/ps", ["-Ao", "pid=,command="], { encoding: "utf8" })
		.stdout.split("\n")
		.map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
		.filter((m) => m?.[2]?.endsWith(` ${leader}`))
		.map((m) => Number(m?.[1]));
}

/**
 * Starts a caller, in a process group of its own, that runs a command which records its pid and never ends; resolves
 * with the caller's pid and the command's, once the command runs.
 */
async function callerOfALongCommand(): Promise<{ caller: number; command: number }> {
	const pidFile = join(root, "command.pid");
	const script = join(root, "caller.ts");
	writeFileSync(
		script,
		`import { runProcess } from ${JSON.stringify(PROCESS_MODULE)};
await runProcess(
	{
		command: [process.execPath, "-e", 'require("fs").writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)', ${JSON.stringify(pidFile)}],
		cwd: ${JSON.stringify(root)},
		env: {},
	},
	{ command: [], cwd: ${JSON.stringify(root)}, timeout_ms: 60000, max_output_bytes: 1024 },
);
`,
	);
	const caller = spawn(NODE, [script], { detached: true, stdio: "ignore" });
	assert.ok(caller.pid);
	started.push(caller.pid);
	assert.ok(await waitUntil(() => existsSync(pidFile) && readFileSync(pidFile, "utf8") !== "", 10000));
	const command = Number(readFileSync(pidFile, "utf8"));
	started.push(command);
	return { caller: caller.pid, command };
}

describe("a command the process runner starts ends with the process that started it", () => {
	it("when that process is killed", async () => {
		const { caller, command } = await callerOfALongCommand();
		assert.ok(alive(command));
		process.kill(caller, "SIGKILL");
		assert.ok(await waitUntil(() => !alive(command), 5000), "the command outlived its killed caller");
	});

	it("when the whole process group of that process is killed", async () => {
		const { caller, command } = await callerOfALongCommand();
		process.kill(-caller, "SIGKILL");
		assert.ok(await waitUntil(() => !alive(command), 5000), "the command outlived its killed caller group");
	});

	it("and leaves nothing behind when the command ends by itself", async () => {
		const observation = await runProcess(
			{ command: [NODE, "-e", "console.log(process.pid)"], cwd: root, env: {} },
			{ command: [], cwd: root, timeout_ms: 10000, max_output_bytes: 1024 },
		);
		const leader = Number(Buffer.from(observation.stdout).toString().trim());
		assert.ok(Number.isInteger(leader) && leader > 1);
		assert.ok(await waitUntil(() => watchdogsOf(leader).length === 0, 5000), "a watchdog outlived the command");
	});
});

describe("the watchdog signals a process group only for a pid that names one", () => {
	/**
	 * Runs the watchdog with `argument` as its pid and its stdin closed at once, in a process whose `process.kill` only
	 * records the pid it is given: nothing is ever signalled, whatever the watchdog decides. Returns the recorded pids.
	 */
	function signalledBy(argument: string): number[] {
		const log = join(root, `kill-${argument.replace(/\W/g, "_")}.log`);
		const preload = join(root, "record-kill.cjs");
		writeFileSync(
			preload,
			`process.kill = (pid) => { require("fs").appendFileSync(${JSON.stringify(log)}, pid + "\\n"); };`,
		);
		spawnSync(NODE, ["--require", preload, "-e", WATCHDOG, argument], { input: "", timeout: 10000 });
		return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean).map(Number) : [];
	}

	it("signals the group of a pid that names one", () => {
		assert.deepEqual(signalledBy("4000000"), [-4000000]);
	});

	for (const argument of ["1", "0", "-1", "NaN", "", "1.5"]) {
		it(`signals nothing for the pid ${JSON.stringify(argument)}`, () => {
			assert.deepEqual(signalledBy(argument), []);
		});
	}
});

describe("a watchdog that cannot start", () => {
	it("leaves the run it was to guard unaffected", () => {
		const script = join(root, "no-watchdog.ts");
		writeFileSync(
			script,
			`import { runProcess } from ${JSON.stringify(PROCESS_MODULE)};
process.execPath = "/nonexistent/node";
const observation = await runProcess(
	{ command: [${JSON.stringify(NODE)}, "-e", "console.log('ran')"], cwd: ${JSON.stringify(root)}, env: {} },
	{ command: [], cwd: ${JSON.stringify(root)}, timeout_ms: 10000, max_output_bytes: 1024 },
);
console.log(Buffer.from(observation.stdout).toString().trim());
`,
		);
		const run = spawnSync(NODE, [script], { encoding: "utf8", timeout: 20000 });
		assert.equal(run.status, 0, run.stderr);
		assert.equal(run.stdout.trim(), "ran");
	});
});
