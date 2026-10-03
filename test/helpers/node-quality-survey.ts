/**
 * A Node project that already violates the quality referential of its adapter: a JavaScript file with a
 * function of cyclomatic complexity 21, a function nothing calls and a private class field nothing
 * reads, and two TypeScript files that repeat a block of 105 tokens over 15 lines. For a survey of its
 * quality, npm and its registry are fakes, and so are ESLint and jscpd, whose reports the real readers read.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Clock } from "../../src/application/ids.ts";
import { emptyTrigger } from "../../src/application/stacks/stack.ts";
import type {
	ControlExecutionPort,
	ExecutableRequest,
	ProcessObservation,
	SandboxPort,
	SandboxProfile,
} from "../../src/ports/execution.ts";
import { HUMAN } from "./change-fixture.ts";
import { writeFiles } from "./fixtures.ts";
import { makeHarness, trackedProject } from "./harness-fixture.ts";
import { QUALITY_QUESTION, QUALITY_SPEC } from "./quality-survey.ts";

export const NODE_GRADER = "src/grader.js";

/** Twenty conditions on top of the function itself: a cyclomatic complexity of 21, one above the threshold. */
const CONDITIONS = Array.from(
	{ length: 20 },
	(_, i) => `  if (${["a", "b", "c"][i % 3]} > ${Math.floor(i / 3)}) r++;`,
).join("\n");

const NODE_GRADER_SOURCE = `export function grade(a, b, c) {
  let r = 0;
${CONDITIONS}
  return r;
}

function neverCalled() {
  return 1;
}

export class Holder {
  #unread = 1;
}
`;

/** The line of the grader that carries `text`. */
export const nodeLineOf = (text: string): number =>
	NODE_GRADER_SOURCE.split("\n").findIndex((line) => line.includes(text)) + 1;

/** A block of 105 tokens over 15 lines, as jscpd counts them. */
const DUPLICATED_BLOCK = `export function checksum(samples) {
  let sum = 17;
  for (let k = 0; k < samples.length; k++) {
    if (samples[k] % 3 === 1) {
      sum = sum * 31 + samples[k];
    } else {
      sum = sum * 37 - samples[k] / 5;
    }
    if (sum > 99991) {
      sum = sum % 99991;
    }
  }
  const label = "sum=" + sum + ";n=" + samples.length;
  return sum + label.length;
}
`;

export const CHECKSUM_A = "src/checksum-a.ts";
export const CHECKSUM_B = "src/checksum-b.ts";

export const NODE_QUALITY_SOURCES: Record<string, string> = {
	[NODE_GRADER]: NODE_GRADER_SOURCE,
	[CHECKSUM_A]: DUPLICATED_BLOCK,
	[CHECKSUM_B]: `const pad: number = 1;\n${DUPLICATED_BLOCK}`,
};

/** A file of a package under `node_modules/` that both analysers would report if they read it: the duplicated block and the grader's violations. */
const PACKAGED_SOURCE = `${DUPLICATED_BLOCK}\n${NODE_GRADER_SOURCE}`;

/** Files of the tree that would change the referential if an analyser read them: they must change nothing. */
export const TREE_CONFIGURATION: Record<string, string> = {
	"eslint.config.js": 'export default [{ rules: { complexity: "off" } }];\n',
	".jscpd.json": '{ "minTokens": 5000 }\n',
	"node_modules/p1/index.js": PACKAGED_SOURCE,
	"node_modules/p2/index.js": PACKAGED_SOURCE,
};

/** What the manifest of the surveyed project declares: a dependency and a development dependency, none of them an analyser. */
const DECLARED = { dependencies: { lodash: "4.17.21" }, devDependencies: { vitest: "4.0.0" } };

/** A lock of the packages the manifest declares, as npm writes it. */
const LOCK = {
	name: "graded",
	version: "1.0.0",
	lockfileVersion: 3,
	packages: {
		"": { name: "graded", version: "1.0.0", ...DECLARED },
		"node_modules/lodash": { version: "4.17.21", integrity: "sha512-fake-lodash" },
		"node_modules/vitest": { version: "4.0.0", integrity: "sha512-fake-vitest", dev: true },
	},
};

/**
 * A Node project, tracked by Git, that declares lodash and vitest and carries the sources above; locked
 * by npm unless `locked` is false, with what `manifest` adds to or replaces in its `package.json`.
 */
export function nodeQualityProject(locked = true, manifest: Record<string, unknown> = {}): string {
	return trackedProject((root) =>
		writeFiles(root, {
			"package.json": `${JSON.stringify({ name: "graded", version: "1.0.0", type: "module", ...DECLARED, ...manifest }, null, 2)}\n`,
			...(locked ? { "package-lock.json": `${JSON.stringify(LOCK, null, 2)}\n` } : {}),
			...NODE_QUALITY_SOURCES,
		}),
	);
}

/** The packages an install of the referential adds, as the lock names them. */
const ANALYSER_PACKAGES = [
	{ name: "eslint", version: "10.12.0", integrity: "sha512-fake-eslint" },
	{ name: "jscpd", version: "5.4.0", integrity: "sha512-fake-jscpd" },
];

/** The native binary an install of jscpd leaves, which a control can only run if it stays executable. */
export const JSCPD_BINARY = "node_modules/jscpd/bin/jscpd";

/** What npm says when the registry cannot be reached. */
const UNREACHABLE_REGISTRY =
	"npm error code ENOTFOUND\nnpm error network request to the registry failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org";

function observation(exit_code: number, stdout = "", stderr = ""): ProcessObservation {
	return {
		exit_code,
		signal: null,
		timed_out: false,
		spawn_error: null,
		stdout: new TextEncoder().encode(stdout),
		stderr: new TextEncoder().encode(stderr),
		stdout_truncated: false,
		stderr_truncated: false,
		started_at: "2026-10-03T00:00:00.000Z",
		ended_at: "2026-10-03T00:00:01.000Z",
		duration_ms: 1000,
	};
}

/**
 * Stands for npm and its registry: it answers what npm answers about its cache, and leaves in the copy
 * what an install of ESLint and jscpd leaves there, the binary of jscpd executable, without the files it
 * was told to remove, or fails like a registry that cannot be reached.
 * Every other command runs on the sandbox it wraps. Each command is recorded with the network its
 * profile granted.
 */
class FakeAnalyserNpm implements SandboxPort {
	readonly backend: string;
	readonly runs: { command: string[]; network: SandboxProfile["network"] }[] = [];
	private readonly inner: SandboxPort;
	private readonly reachable: boolean;
	private readonly removes: readonly string[];
	constructor(inner: SandboxPort, reachable: boolean, removes: readonly string[]) {
		this.inner = inner;
		this.backend = inner.backend;
		this.reachable = reachable;
		this.removes = removes;
	}
	qualify(profile: SandboxProfile): ReturnType<SandboxPort["qualify"]> {
		return this.inner.qualify(profile);
	}
	installs(): number {
		return this.runs.filter((r) => r.command[0] === "npm" && r.command[1] === "install").length;
	}
	async run(profile: SandboxProfile, request: ExecutableRequest, signal?: AbortSignal): Promise<ProcessObservation> {
		this.runs.push({ command: request.command, network: profile.network });
		if (request.command[0] !== "npm") return this.inner.run(profile, request, signal);
		if (request.command[1] === "config") return observation(0, "/machine/npm-cache\n");
		if (!this.reachable) return observation(1, "", UNREACHABLE_REGISTRY);
		const write = (path: string, text: string) => {
			mkdirSync(dirname(join(request.cwd, path)), { recursive: true });
			writeFileSync(join(request.cwd, path), text);
		};
		const read = (path: string) => JSON.parse(readFileSync(join(request.cwd, path), "utf8"));
		const manifest = read("package.json");
		const lock = read("package-lock.json");
		for (const { name, version, integrity } of ANALYSER_PACKAGES) {
			manifest.devDependencies = { ...manifest.devDependencies, [name]: version };
			lock.packages = { ...lock.packages, [`node_modules/${name}`]: { version, integrity, dev: true } };
			write(`node_modules/${name}/package.json`, `${JSON.stringify({ name, version })}\n`);
		}
		write(JSCPD_BINARY, "#!/usr/bin/env node\n");
		chmodSync(join(request.cwd, JSCPD_BINARY), 0o755);
		write("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
		write("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
		write("node_modules/.package-lock.json", `${JSON.stringify(lock)}\n`);
		for (const path of this.removes) rmSync(join(request.cwd, path));
		return observation(0);
	}
}

/** The sources of a tree ESLint or jscpd would read, outside `node_modules/`, by their path relative to it. */
function sourcesOf(root: string, extensions: RegExp): string[] {
	const found: string[] = [];
	const walk = (relative: string): void => {
		for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
			const path = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.isDirectory() && !["node_modules", ".git", "target"].includes(entry.name)) walk(path);
			else if (entry.isFile() && extensions.test(path)) found.push(path);
		}
	};
	walk("");
	return found.sort();
}

/**
 * The messages ESLint gives a JavaScript source under the referential: a function of more than 20
 * conditions plus one, a function declared and never named again, and a private field never named again.
 */
function eslintMessages(text: string): { ruleId: string; line: number; message: string }[] {
	const lines = text.split("\n");
	const messages: { ruleId: string; line: number; message: string }[] = [];
	const once = (name: string) => text.split(name).length === 2;
	lines.forEach((line, index) => {
		const declared = /^(export )?function (\w+)\(/.exec(line);
		if (declared) {
			const end = lines.findIndex((l, i) => i > index && l === "}");
			const complexity = lines.slice(index, end).filter((l) => /\bif \(/.test(l)).length + 1;
			if (complexity > 20)
				messages.push({
					ruleId: "complexity",
					line: index + 1,
					message: `Function '${declared[2]}' has a complexity of ${complexity}. Maximum allowed is 20.`,
				});
			if (!declared[1] && once(declared[2]!))
				messages.push({
					ruleId: "no-unused-vars",
					line: index + 1,
					message: `'${declared[2]}' is defined but never used.`,
				});
		}
		const field = /^\s+(#\w+) =/.exec(line);
		if (field && once(field[1]!))
			messages.push({
				ruleId: "no-unused-private-class-members",
				line: index + 1,
				message: `'${field[1]}' is defined but never used.`,
			});
	});
	return messages;
}

/** The first run of at least 5 identical lines and 50 tokens that two sources share, with where it starts in each. */
function sharedBlock(a: string, b: string): { first: number; second: number; lines: number; tokens: number } | null {
	const left = a.split("\n");
	const right = b.split("\n");
	for (let i = 0; i < left.length; i++)
		for (let j = 0; j < right.length; j++) {
			let n = 0;
			while (i + n < left.length && j + n < right.length && left[i + n] === right[j + n] && left[i + n] !== "") n++;
			const tokens =
				left
					.slice(i, i + n)
					.join("\n")
					.match(/\w+|[^\s\w]/g)?.length ?? 0;
			if (n >= 5 && tokens >= 50) return { first: i + 1, second: j + 1, lines: n, tokens };
		}
	return null;
}

/** Writes the reports ESLint and jscpd would write in `workspace`, as the referential runs them. */
function writeAnalyserReports(workspace: string, parser: string, reportPath: string): void {
	const text = (path: string) => readFileSync(join(workspace, path), "utf8");
	if (parser === "eslint-json") {
		const results = sourcesOf(workspace, /\.(js|mjs|cjs)$/).map((path) => ({
			filePath: join(workspace, path),
			messages: eslintMessages(text(path)).map((m) => ({ ...m, severity: 2, column: 1 })),
		}));
		writeFiles(workspace, { [reportPath]: JSON.stringify(results) });
		return;
	}
	const sources = sourcesOf(workspace, /\.(js|mjs|cjs|jsx|ts|tsx)$/);
	const duplicates = sources.flatMap((first, index) =>
		sources.slice(index + 1).flatMap((second) => {
			const block = sharedBlock(text(first), text(second));
			return block
				? [
						{
							format: "javascript",
							lines: block.lines,
							tokens: block.tokens,
							firstFile: { name: first, start: block.first, end: block.first + block.lines - 1 },
							secondFile: { name: second, start: block.second, end: block.second + block.lines - 1 },
						},
					]
				: [];
		}),
	);
	writeFiles(workspace, { [reportPath]: JSON.stringify({ duplicates, statistics: {} }) });
}

/**
 * Stands for an ESLint and a jscpd that the machine running the suite need not have installed: each
 * leaves the report it would write, from the sources of the tree, which the real reader then reads, and
 * records whether the binary of jscpd is executable in the copy it runs in. Every other control, and the
 * broken command of an incident witness, runs for real.
 */
class FakeAnalyserControls implements ControlExecutionPort {
	/** For each run of jscpd, whether its binary is executable in the copy the run sees. */
	readonly jscpdExecutable: boolean[] = [];
	private readonly real: ControlExecutionPort;
	constructor(real: ControlExecutionPort) {
		this.real = real;
	}
	async runControl(
		invocation: Parameters<ControlExecutionPort["runControl"]>[0],
		signal?: AbortSignal,
	): ReturnType<ControlExecutionPort["runControl"]> {
		const { parser, report_path, command } = invocation.control;
		// The incident witness runs a broken command for real: it must end without a report.
		if (
			(parser !== "eslint-json" && parser !== "jscpd-json") ||
			report_path === null ||
			command.some((part) => part.includes("495-broken-runner"))
		)
			return this.real.runControl(invocation, signal);
		if (parser === "jscpd-json") {
			const binary = join(invocation.workspace_path, JSCPD_BINARY);
			this.jscpdExecutable.push(existsSync(binary) && (statSync(binary).mode & 0o111) !== 0);
		}
		writeAnalyserReports(invocation.workspace_path, parser, report_path);
		const control = { ...invocation.control, command: emptyTrigger(process.execPath) };
		return this.real.runControl({ ...invocation, control }, signal);
	}
}

/**
 * A survey of the quality of `project`, conducted until it stops, with a registry that `reachable` says can be
 * reached and an install that removes the files `removes` names from the copy.
 */
export async function nodeSurveyed(
	project: string,
	options: { reachable?: boolean; removes?: readonly string[]; clock?: Clock } = {},
) {
	let npm: FakeAnalyserNpm | undefined;
	let analysers: FakeAnalyserControls | undefined;
	const t = makeHarness({
		...(options.clock ? { clock: options.clock } : {}),
		defaultScript: { steps: [{ kind: "complete", output: QUALITY_SPEC }] },
		backend: (real) => {
			npm = new FakeAnalyserNpm(real, options.reachable ?? true, options.removes ?? []);
			return npm;
		},
		controls: (real) => {
			analysers = new FakeAnalyserControls(real);
			return analysers;
		},
	});
	const { change } = await t.harness.start({
		project_path: project,
		request_text: QUALITY_QUESTION,
		actor: HUMAN,
		deliverable: "state",
	});
	const first = await t.harness.advance(change.change_id, { max_steps: 40 });
	return { t, npm: npm!, analysers: analysers!, changeId: change.change_id, first };
}
