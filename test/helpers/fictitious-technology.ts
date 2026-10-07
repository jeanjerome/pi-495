/**
 * A technology 495 does not carry: a project that holds `fict.toml`, whose tests are `cases/*.case`, whose
 * tools write under `fict-out/`, whose dependencies are installed under `fict_modules/` and whose toolchain is
 * found through `FICT_HOME`. It declares its recognition, its reader, its tests and its workspace, and no
 * other capability; a test adds the capabilities it exercises.
 */
import type { StackPlugin } from "../../src/application/stacks/plugin.ts";
import type { ParsedReport, ReportReader } from "../../src/ports/execution.ts";
import { writeFiles } from "./fixtures.ts";
import { trackedProject } from "./harness-fixture.ts";

/**
 * The command of the fictitious test control: each line `<path>=<expected>` of a `cases/*.case` file
 * is one case, which passes when the file at `<path>` holds `<expected>`. It writes one line per case
 * to `fict-report.txt`, `PASS <case>` or `FAIL <case>: <reason>`.
 */
const FICT_RUNNER = `
const fs = require("node:fs");
const lines = [];
for (const file of fs.readdirSync("cases").filter((name) => name.endsWith(".case")).sort())
	for (const line of fs.readFileSync("cases/" + file, "utf8").split("\\n").filter(Boolean)) {
		const [path, expected] = line.split("=");
		let actual;
		try { actual = fs.readFileSync(path, "utf8").trim(); } catch { actual = "<missing>"; }
		lines.push(actual === expected ? "PASS " + path : "FAIL " + path + ": expected " + expected + ", got " + actual);
	}
fs.writeFileSync("fict-report.txt", lines.join("\\n") + "\\n");
process.exitCode = lines.some((line) => line.startsWith("FAIL")) ? 1 : 0;
`;

function incident(note: string): ParsedReport {
	return { verdict: "INDETERMINATE", facts: {}, notes: [note], failures: [] };
}

/** A reader of one line `PASS <case>` or `FAIL <case>: <reason>` per case, judging the nature it is given. */
export function linesReader(id: string, nature: ReportReader["nature"]): ReportReader {
	return {
		id,
		version: "1.0.0",
		nature,
		differential: false,
		located: false,
		async read(run) {
			if (run.observation.spawn_error !== null || run.observation.timed_out)
				return incident("the fictitious runner did not run");
			const [report] = await run.reports("text/plain; charset=utf-8");
			if (report === undefined) return incident(`no ${id} report`);
			const cases = report.text.split("\n").filter((line) => line.length > 0);
			const failures = cases.filter((line) => line.startsWith("FAIL ")).map((line) => line.slice("FAIL ".length));
			const passed = cases.filter((line) => line.startsWith("PASS ")).length;
			if (passed + failures.length !== cases.length) return incident("a line of the report is not a case");
			return {
				verdict: failures.length > 0 ? "FAIL" : passed > 0 ? "PASS" : "INDETERMINATE",
				facts: { tests: cases.length, failures: failures.length },
				notes: [],
				failures,
			};
		},
	};
}

/** The reader of the `fict-lines` format the fictitious test cases are reported in. */
const FICT_LINES_READER = linesReader("fict-lines", "behaviour");

export const FICT_PLUGIN: StackPlugin<true> = {
	id: "fict",
	signal_files: ["fict.toml"],
	recognise: (view) => (view.exists("fict.toml") ? true : null),
	readers: [FICT_LINES_READER],
	capabilities: {
		tests: {
			offer: ({ requirement_refs, node_binary }) => ({
				kind: "available",
				controls: [
					{
						control_id: "fict-tests",
						version: "1",
						title: "fictitious test cases",
						command: [node_binary, "-e", FICT_RUNNER],
						cwd: ".",
						env_allowlist: ["PATH"],
						env: {},
						timeout_ms: 30_000,
						parser: "fict-lines",
						report_path: "fict-report.txt",
						structure_rules: [],
						provides: [],
						requires: [],
						scope_argument: null,
						network: "denied",
						writable_paths: ["fict-report.txt"],
						requirement_refs,
						protected: true,
						protected_paths: ["cases/"],
					},
				],
			}),
			positiveWitness: () => ({ "cases/495-witness.case": "495-witness.txt=ok\n", "495-witness.txt": "ok\n" }),
			negativeWitness: () => ({ "495-witness.txt": "ko\n" }),
			preparationPaths: () => ["cases/"],
			isTestFile: (path: string) => path.startsWith("cases/") && path.endsWith(".case"),
		},
		workspace: { outputs: ["fict-out/"], installed_dependencies: "fict_modules", env: ["FICT_HOME"] },
	},
};

export const GREETING = "Hello\n";

/** A project carrying `fict.toml`, the greeting, the case that checks it and `files`. */
export function greetingProject(files: Record<string, string> = {}): string {
	return trackedProject((root) =>
		writeFiles(root, {
			"fict.toml": "[project]\nname = 'greeting'\n",
			"src/greeting.txt": GREETING,
			"cases/greeting.case": "src/greeting.txt=Hello\n",
			...files,
		}),
	);
}
