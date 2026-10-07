import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Protocol } from "../../src/contracts/v1/protocol.ts";
import type { RequirementRef } from "../../src/contracts/v1/evidence.ts";
import type { StackAdapter, StackDetection } from "../../src/application/stacks/stack.ts";
import { MAVEN_ADAPTER } from "../../src/adapters/stacks/maven/maven.ts";
import { NODE_ADAPTER } from "../../src/adapters/stacks/node/node.ts";
import type { ParsedReport, ReportReader } from "../../src/ports/execution.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { writeFiles } from "../helpers/fixtures.ts";
import { makeHarness, specReport, trackedProject } from "../helpers/harness-fixture.ts";

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

/** The reader of the `fict-lines` format: one line `PASS <case>` or `FAIL <case>: <reason>` per case. */
const FICT_LINES_READER: ReportReader = {
	id: "fict-lines",
	version: "1.0.0",
	nature: "behaviour",
	differential: false,
	located: false,
	async read(run) {
		if (run.observation.spawn_error !== null || run.observation.timed_out)
			return incident("the fictitious runner did not run");
		const [report] = await run.reports("text/plain; charset=utf-8");
		if (report === undefined) return incident("no fict-lines report");
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

/** A technology 495 does not carry: a project that holds `fict.toml`, whose tests are `cases/*.case`. */
const FICT_ADAPTER: StackAdapter = {
	stack: "fict",
	signal_files: ["fict.toml"],
	readers: [FICT_LINES_READER],
	detect(_projectPath: string, requirementRefs: RequirementRef[], nodeBinary: string): StackDetection {
		return {
			stack: "fict",
			facts: {},
			controls: [
				{
					control_id: "fict-tests",
					version: "1",
					title: "fictitious test cases",
					command: [nodeBinary, "-e", FICT_RUNNER],
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
					requirement_refs: requirementRefs,
					protected: true,
					protected_paths: ["cases/"],
				},
			],
			lint_control_ids: [],
			positive_witness: { "cases/495-witness.case": "495-witness.txt=ok\n", "495-witness.txt": "ok\n" },
			witness_tests: 1,
			negative_witness: { "495-witness.txt": "ko\n" },
			own_negative_witness: {},
			preparation_paths: [],
			capability_missing: [],
			recommendations: [],
		};
	},
};

const GREETING = "Hello\n";

describe("a technology declared in one file, with its own report format", () => {
	it("given a project carrying only fict.toml and the list of 495 followed by a fictitious technology, when a scripted agent drives a change, then the fictitious control is qualified by its fict-lines reader, the candidate evidence passes under 1+fict-lines@1.0.0, and the change is accepted", async () => {
		const project = trackedProject((root) =>
			writeFiles(root, {
				"fict.toml": "[project]\nname = 'greeting'\n",
				"src/greeting.txt": GREETING,
				"cases/greeting.case": "src/greeting.txt=Hello\n",
			}),
		);
		const t = makeHarness({
			stacks: [MAVEN_ADAPTER, NODE_ADAPTER, FICT_ADAPTER],
			defaultScript: {
				steps: [
					{
						kind: "complete",
						output: specReport({
							objective: "src/greeting.txt keeps saying Hello",
							facts: ["the greeting is in src/greeting.txt"],
							requirements: [
								{
									requirement_id: "R1",
									statement: "src/greeting.txt says Hello",
									mandatory: true,
									criterion: "the fictitious cases pass",
									category: "functional",
									satisfied_by_reference: true,
								},
							],
							design: {
								summary: "rewrite src/greeting.txt with the same greeting",
								components: ["greeting"],
								interfaces: ["src/greeting.txt"],
								risks: [],
							},
						}),
					},
				],
			},
			scripts: {
				implement: {
					steps: [
						{ kind: "write", path: "src/greeting.txt", content: GREETING },
						{ kind: "write", path: "src/farewell.txt", content: "Goodbye\n" },
						{
							kind: "complete",
							output: { summary: "done", changed_paths: ["src/farewell.txt"], tests_claimed: true, notes: [] },
						},
					],
				},
			},
		});
		const { change } = await t.harness.start({
			project_path: project,
			request_text: "Add a farewell next to the greeting",
			actor: HUMAN,
		});
		const result = await t.harness.advance(change.change_id);
		const state = t.ledger.loadChange(change.change_id)!.state;
		const protocol = await t.harness.artifacts.latest<Protocol>(state, "protocol");
		const qualification = protocol?.content.qualifications["fict-tests"];
		assert.deepEqual(
			qualification && {
				qualified: qualification.qualified,
				positive: qualification.positive,
				negative: qualification.negative,
			},
			{ qualified: true, positive: "PASS", negative: "FAIL" },
			`${state.stop_reason ?? ""}: ${state.stop_detail ?? ""} | ${result.steps.join(" | ")}`,
		);
		const candidate = t.ledger
			.listEvidence(change.change_id)
			.filter((e) => e.subject.kind === "candidate" && e.control_id === "fict-tests");
		assert.deepEqual(
			candidate.map((e) => [e.verdict, e.control_version]),
			[["PASS", "1+fict-lines@1.0.0"]],
		);
		assert.equal(result.stopped_because, "closed", result.steps.join(" | "));
		assert.equal(result.view.change!.outcome, "accepted");
	});
});
