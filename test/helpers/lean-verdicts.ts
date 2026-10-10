import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Verdict } from "../../src/contracts/v1/common.ts";
import { outputDir } from "./fixtures.ts";
import type { CombinationMode } from "./g5-combination.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");
/** The approved Lean project of the verdict combination of G5. */
const LEAN_PROJECT = join(REPOSITORY, "specs", "formal", "verdicts");
const LEAN_MANIFEST = join(LEAN_PROJECT, "manifest.json");
const CHECK_LEAN = join(REPOSITORY, "scripts", "check-lean.ts");
/** The toolchain the manifest approves, read from it so that the tests follow the manifest to another version. */
const LEAN_TOOLCHAIN_NAME = (JSON.parse(readFileSync(LEAN_MANIFEST, "utf8")) as { toolchain: { name: string } })
	.toolchain.name;
/** Where elan keeps that toolchain: `leanprover/lean4:v4.34.1` lives in `leanprover--lean4---v4.34.1`. */
const LEAN_TOOLCHAIN = join(
	process.env.ELAN_HOME ?? join(homedir(), ".elan"),
	"toolchains",
	LEAN_TOOLCHAIN_NAME.replace("/", "--").replace(":", "---"),
);

/** Why a test that runs the real Lean is skipped on this machine, or false when it runs. */
export const leanMissing: string | false =
	!existsSync(join(LEAN_TOOLCHAIN, "bin", "lean")) &&
	`no Lean toolchain at ${LEAN_TOOLCHAIN}: elan toolchain install ${LEAN_TOOLCHAIN_NAME}`;

interface LeanTheoremReport {
	theorem: string;
	statement: string;
	kind: string;
	states_approved: boolean;
	axioms: string[];
	refused: string[];
}

export interface LeanReport {
	verdict: "proved" | "refused" | "error";
	reasons: string[];
	protected: { file: string; approved: string; before: string | null; after: string | null }[];
	theorems: LeanTheoremReport[];
	replay: { tool: string; passed: boolean } | null;
	allowed_axioms: string[];
}

/**
 * Runs the Lean check on a project, against the approved manifest unless another is given, and reads back the
 * report it prints. The check runs while the test's event loop stays free, to serve what the test listens on.
 */
export async function checkLean(
	project: string = LEAN_PROJECT,
	options: { manifest?: string; toolchain?: string } = {},
): Promise<{ status: number | null; output: string; report: LeanReport | null }> {
	const child = spawn(
		process.execPath,
		[
			CHECK_LEAN,
			options.manifest ?? LEAN_MANIFEST,
			"--project",
			project,
			"--toolchain",
			options.toolchain ?? LEAN_TOOLCHAIN,
		],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8").on("data", (d: string) => {
		stdout += d;
	});
	child.stderr.setEncoding("utf8").on("data", (d: string) => {
		stderr += d;
	});
	const status = await new Promise<number | null>((done) => child.on("close", done));
	let report: LeanReport | null = null;
	try {
		report = JSON.parse(stdout) as LeanReport;
	} catch {
		// What the check printed is not a report: the caller's assertion names the output.
	}
	return { status, output: stdout + stderr, report };
}

/** A disposable copy of the approved project, without what an earlier build left in it. */
export function projectCopy(prefix: string, cleanups: string[]): string {
	const copy = outputDir(prefix, cleanups);
	cpSync(LEAN_PROJECT, copy, { recursive: true, filter: (source) => !source.includes(`${LEAN_PROJECT}/.lake`) });
	return copy;
}

/**
 * Builds a target of a project with the approved toolchain, outside any sandbox, with `env` added to the test's
 * environment; what it built stays in `.lake/`.
 */
export function lakeBuild(
	project: string,
	target: string,
	env: Record<string, string> = {},
): { status: number | null; output: string } {
	const bin = join(LEAN_TOOLCHAIN, "bin");
	const environment = { ...process.env, ...env, PATH: `${bin}:${process.env.PATH ?? ""}` };
	const build = spawnSync(join(bin, "lake"), ["build", target], { cwd: project, env: environment, encoding: "utf8" });
	return { status: build.status, output: build.stdout + build.stderr };
}

/** One case the Lean reference evaluates: a rule and the verdicts of the controls of one obligation. */
export interface CombinationCase {
	mode: CombinationMode;
	verdicts: readonly Verdict[];
}

/**
 * The verdict the Lean reference gives each case: the approved definitions built in a disposable copy, then
 * `Reference.lean` run as a program that reads one case per line and prints the verdict `combine` gives it.
 * `verdicts` is null when the reference could not be built or run, and `output` says why.
 */
export function leanCombine(
	cases: readonly CombinationCase[],
	cleanups: string[],
): { verdicts: Verdict[] | null; output: string } {
	const copy = projectCopy("lean-reference-", cleanups);
	const build = lakeBuild(copy, "Verdicts.Defs");
	if (build.status !== 0) return { verdicts: null, output: build.output };
	const run = spawnSync(join(LEAN_TOOLCHAIN, "bin", "lean"), ["--run", join(copy, "Reference.lean")], {
		cwd: copy,
		env: {
			...process.env,
			PATH: `${join(LEAN_TOOLCHAIN, "bin")}:${process.env.PATH ?? ""}`,
			LEAN_PATH: join(copy, ".lake", "build", "lib", "lean"),
		},
		input: `${cases.map((c) => [c.mode, ...c.verdicts].join(" ")).join("\n")}\n`,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	const output = run.stdout + run.stderr;
	if (run.status !== 0) return { verdicts: null, output };
	return { verdicts: run.stdout.trimEnd().split("\n") as Verdict[], output };
}
