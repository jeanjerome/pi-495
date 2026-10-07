import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { SeatbeltSandbox } from "../../src/adapters/sandbox/backends.ts";
import { detectStack } from "../../src/application/target.ts";
import type { ControlDefinition } from "../../src/contracts/v1/protocol.ts";
import { darwinOnly, tempDir, writeFiles, removedAfterEach, outputDir } from "../helpers/fixtures.ts";
import { invocationBase } from "../helpers/execution-fixture.ts";
import { judgeCoverage, LCOV_REPORT, recordedLcov, workspaceWith } from "../helpers/lcov-control.ts";
import { READERS_OF_495, STACKS_OF_495 } from "../helpers/technologies.ts";

let root: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = outputDir("lcov-control-", cleanups);
});

/** An LCOV report that cites `file` and holds a `DA` record for each executed line given. */
function reportOf(...files: { file: string; executed: number[] }[]): string {
	return `${files
		.map(
			({ file, executed }) =>
				`TN:\nSF:${file}\n${executed.map((nr) => `DA:${nr},1`).join("\n")}\nLH:${executed.length}\nLF:${executed.length}\nend_of_record`,
		)
		.join("\n")}\n`;
}

const SILENCED = "coverage:silence-comment-introduced";

describe("a comment that silences the coverage of the lines under it", () => {
	it("given introduced files carrying v8 ignore start, istanbul ignore next and node:coverage disable, then the evidence is FAIL with a blocking finding at each comment, and a comment already present before the change is named as tolerated", async () => {
		const workspace = workspaceWith(root, "silenced", {
			"src/v8.mjs":
				"export function f() {\n  return 1;\n}\n/* v8 ignore start */\nexport function g() {\n  return 2;\n}\n",
			"src/istanbul.mjs": "export function f(x) {\n  /* istanbul ignore next */\n  if (x) return 1;\n  return 0;\n}\n",
			"src/node.mjs":
				"export function f() {\n  return 1;\n}\n// node:coverage disable\nexport function g() {\n  return 2;\n}\n// node:coverage enable\n",
			"src/old.mjs":
				"/* c8 ignore next */\nexport function old() {\n  return 0;\n}\nexport function added() {\n  return 1;\n}\n",
			[LCOV_REPORT]: reportOf(
				{ file: "src/v8.mjs", executed: [1, 2, 3] },
				{ file: "src/istanbul.mjs", executed: [1, 4, 5] },
				{ file: "src/node.mjs", executed: [1, 2, 3] },
				{ file: "src/old.mjs", executed: [5, 6, 7] },
			),
		});
		const evidence = await judgeCoverage(root, workspace, {
			"src/v8.mjs": [1, 2, 3, 4, 5, 6, 7],
			"src/istanbul.mjs": [1, 2, 3, 4, 5],
			"src/node.mjs": [1, 2, 3, 4, 5, 6, 7, 8],
			"src/old.mjs": [5, 6, 7],
		});
		assert.equal(evidence.verdict, "FAIL", JSON.stringify(evidence.limits.notes));
		assert.deepEqual(
			evidence.findings
				.filter((f) => f.rule_id === SILENCED)
				.map((f) => [f.path, f.region?.start_line, f.severity])
				.sort(),
			[
				["src/istanbul.mjs", 2, "blocker"],
				["src/node.mjs", 4, "blocker"],
				["src/v8.mjs", 4, "blocker"],
			],
		);
		assert.ok(
			evidence.limits.notes.some((note) => note.includes("src/old.mjs:1") && note.includes("tolerated")),
			JSON.stringify(evidence.limits.notes),
		);
	});
});

describe("the derived controls under the verification sandbox", darwinOnly, () => {
	const REFS = [{ requirement_id: "R1", revision: 1 }];
	const NODE = process.execPath;
	const CALC = "src/calc.mjs";
	const runners = [
		{
			name: "node:test",
			recorded: "node-24.21.0-calc.info",
			files: { "package.json": '{"name":"t","scripts":{"test":"node --test --experimental-test-coverage"}}' },
			// The TAP summary node:test writes on the standard output, which the node-test reader counts.
			standIn: () => 'console.log("# tests 1\\n# pass 1\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0");',
		},
		{
			name: "vitest",
			recorded: "vitest-5.0.2-calc.info",
			files: {
				"package.json": '{"name":"t","scripts":{"test":"vitest run"}}',
				"node_modules/@vitest/coverage-v8/package.json": '{"name":"provider"}',
			},
			// The JUnit report vitest writes to the declared output file, creating its directory.
			standIn: (unit: ControlDefinition) =>
				`const out = ${JSON.stringify(unit.report_path)}; fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, ${JSON.stringify(readFileSync(new URL("../fixtures/junit/vitest-5.0.0-green.xml", import.meta.url), "utf8"))});`,
		},
	];
	it("given the derived unit control of each runner run under the verification sandbox against a stand-in that writes the recorded LCOV report at the declared path, then coverage reads and judges it, and a stand-in that writes it elsewhere under the root of the copy fails under the sandbox", async () => {
		// No temporary directory is granted: the test tree may itself live under $TMPDIR, where a write
		// would succeed whatever the control declares writable.
		const runner = new GenericControlRunner(
			new SeatbeltSandbox({ temp_paths: [] }),
			new CasObjectStore(join(root, "objects")),
			READERS_OF_495,
		);
		for (const target of runners) {
			const project = tempDir("495-lcov-sandbox-", cleanups);
			writeFiles(project, target.files);
			const detection = detectStack(STACKS_OF_495, project, REFS, NODE);
			const unit = detection.controls.find((c) => c.control_id === "unit")!;
			const coverage = detection.controls.find((c) => c.control_id === "coverage");
			assert.ok(coverage?.report_path, `${target.name}: the detection declares a coverage control`);
			const reportPath = coverage.report_path;
			const run = async (control: ControlDefinition, workspace: string) =>
				(
					await runner.runControl({
						...invocationBase(),
						control,
						workspace_path: workspace,
						introduced_lines: { [CALC]: [10, 11, 13] },
					})
				).evidence;
			const standIn = (writeTo: string): ControlDefinition => ({
				...unit,
				command: [
					NODE,
					"-e",
					`const fs = require("node:fs"); const path = require("node:path"); ${target.standIn(unit)} const report = ${JSON.stringify(writeTo)}; fs.mkdirSync(path.dirname(report), { recursive: true }); fs.writeFileSync(report, ${JSON.stringify(recordedLcov(target.recorded))});`,
				],
			});
			const declared = workspaceWith(root, `${target.name}-declared`, {});
			const produced = await run(standIn(reportPath), declared);
			assert.equal(produced.verdict, "PASS", `${target.name}: ${JSON.stringify(produced.limits.notes)}`);
			const judged = await run(coverage, declared);
			assert.equal(judged.verdict, "FAIL", `${target.name}: ${JSON.stringify(judged.limits.notes)}`);
			assert.deepEqual(
				judged.findings.filter((f) => f.severity === "blocker").map((f) => [f.path, f.region?.start_line]),
				[[CALC, 13]],
				target.name,
			);
			const elsewhere = workspaceWith(root, `${target.name}-elsewhere`, {});
			const refused = await run(standIn("elsewhere-lcov.info"), elsewhere);
			assert.equal(
				existsSync(join(elsewhere, "elsewhere-lcov.info")),
				false,
				`${target.name}: the sandbox refused the write`,
			);
			assert.notEqual(refused.verdict, "PASS", target.name);
			assert.equal((await run(coverage, elsewhere)).verdict, "INDETERMINATE", target.name);
		}
	});
});
