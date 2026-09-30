import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { COVERAGE_RULE_PARTIAL, COVERAGE_RULE_UNCOVERED } from "../../src/adapters/execution/parsers.ts";
import { judgeCoverage, LCOV_REPORT, lcovControl, recordedLcov, workspaceWith } from "../helpers/lcov-control.ts";

const CALC = "src/calc.mjs";

let root: string;
beforeEach(() => {
	mkdirSync(join(process.cwd(), "test-output"), { recursive: true });
	root = mkdtempSync(join(process.cwd(), "test-output", "lcov-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("the lcov reader judges the lines a change introduces", () => {
	it("given recorded LCOV reports and a change introducing three lines one of which is never executed, then the verdict is FAIL with a finding at that file and line and the earlier unexecuted line is named as tolerated", async () => {
		const cases = [
			{ report: "node-24.21.0-calc.info", tolerated: "6, 7, 17, 18" },
			{ report: "vitest-5.0.2-calc.info", tolerated: "6, 17" },
		];
		for (const c of cases) {
			const workspace = workspaceWith(root, c.report, { [LCOV_REPORT]: recordedLcov(c.report) });
			const evidence = await judgeCoverage(root, workspace, { [CALC]: [10, 11, 13] });
			assert.equal(evidence.verdict, "FAIL", c.report);
			assert.equal(evidence.control_version, "1+lcov@1.0.0");
			const blockers = evidence.findings.filter((f) => f.severity === "blocker");
			assert.equal(blockers.length, 1, c.report);
			assert.deepEqual(
				[blockers[0]!.rule_id, blockers[0]!.path, blockers[0]!.region?.start_line],
				[COVERAGE_RULE_UNCOVERED, CALC, 13],
				c.report,
			);
			assert.ok(
				evidence.limits.notes.some((note) =>
					note.includes(`${CALC}: lines ${c.tolerated} were unexecuted before this change`),
				),
				`${c.report}: ${JSON.stringify(evidence.limits.notes)}`,
			);
		}
	});

	it("given an introduced line executed with a branch never taken, then the verdict is PASS with a major finding at that line", async () => {
		const cases = [
			{ report: "node-24.21.0-calc.info", introduced: [12], line: 12 },
			{ report: "vitest-5.0.2-calc.info", introduced: [10, 11], line: 10 },
		];
		for (const c of cases) {
			const workspace = workspaceWith(root, c.report, { [LCOV_REPORT]: recordedLcov(c.report) });
			const evidence = await judgeCoverage(root, workspace, { [CALC]: c.introduced });
			assert.equal(evidence.verdict, "PASS", c.report);
			assert.equal(evidence.findings.length, 1, c.report);
			const finding = evidence.findings[0]!;
			assert.deepEqual(
				[finding.rule_id, finding.severity, finding.path, finding.region?.start_line],
				[COVERAGE_RULE_PARTIAL, "major", CALC, c.line],
				c.report,
			);
		}
	});

	it("given a file that appears in two records, then a line executed in either counts as executed", async () => {
		const report = [
			"TN:",
			"SF:src/twice.mjs",
			"DA:1,0",
			"DA:2,0",
			"end_of_record",
			"TN:",
			"SF:src/twice.mjs",
			"DA:1,3",
			"DA:2,0",
			"end_of_record",
			"",
		].join("\n");
		const workspace = workspaceWith(root, "two-records", { [LCOV_REPORT]: report });
		const evidence = await judgeCoverage(root, workspace, { "src/twice.mjs": [1, 2] });
		assert.equal(evidence.verdict, "FAIL");
		assert.deepEqual(
			evidence.findings.map((f) => [f.severity, f.region?.start_line]),
			[["blocker", 2]],
		);
	});
});

describe("the lcov reader expects in the report only the files a coverage runner measures", () => {
	it("given changes introducing a test, a vitest configuration, a declaration file and one source file, then only the source file is expected in the report", async () => {
		const workspace = workspaceWith(root, "expected", { [LCOV_REPORT]: recordedLcov("node-24.21.0-calc.info") });
		const evidence = await judgeCoverage(root, workspace, {
			"test/calc.test.mjs": [1, 2],
			"vitest.config.ts": [1],
			"index.d.ts": [1],
			"package.json": [1],
			"README.md": [1],
			[CALC]: [13],
		});
		assert.equal(evidence.verdict, "FAIL", JSON.stringify(evidence.limits.notes));
		assert.deepEqual(
			[evidence.facts.introduced_files, evidence.facts.measurable_files],
			[6, 1],
			"the source file alone is expected in the report",
		);
		assert.deepEqual(
			evidence.findings.map((f) => f.path),
			[CALC],
		);
		// A change that introduces nothing a runner measures needs no report at all.
		const bare = workspaceWith(root, "no-report", {});
		const onlyTests = await judgeCoverage(root, bare, { "test/calc.test.mjs": [1, 2], "vitest.config.ts": [1] });
		assert.equal(onlyTests.verdict, "PASS", JSON.stringify(onlyTests.limits.notes));
		assert.equal(onlyTests.facts.measurable_files, 0);
	});

	it("given an introduced source file the report does not cite, an absent report and an unknown introduced set, then each verdict is INDETERMINATE and the first names the file", async () => {
		const workspace = workspaceWith(root, "cited", { [LCOV_REPORT]: recordedLcov("node-24.21.0-calc.info") });
		const uncited = await judgeCoverage(root, workspace, { [CALC]: [1], "src/other.mjs": [1, 2] });
		assert.equal(uncited.verdict, "INDETERMINATE");
		assert.ok(
			uncited.limits.notes.some((note) => note.includes("src/other.mjs") && !note.includes(CALC)),
			JSON.stringify(uncited.limits.notes),
		);
		const absent = await judgeCoverage(root, workspaceWith(root, "absent", {}), { [CALC]: [13] });
		assert.equal(absent.verdict, "INDETERMINATE");
		assert.ok(
			absent.limits.notes.some((note) => note.includes("no LCOV report found")),
			JSON.stringify(absent.limits.notes),
		);
		const unknown = await judgeCoverage(root, workspace, null);
		assert.equal(unknown.verdict, "INDETERMINATE");
		assert.ok(
			unknown.limits.notes.some((note) => note.includes("no introduced-line set was given")),
			JSON.stringify(unknown.limits.notes),
		);
	});

	it("given a reference pass that introduces nothing, then no report is looked for and the verdict is PASS", async () => {
		const workspace = workspaceWith(root, "reference", { [LCOV_REPORT]: recordedLcov("node-24.21.0-calc.info") });
		const evidence = await judgeCoverage(root, workspace, {});
		assert.equal(evidence.verdict, "PASS");
		assert.deepEqual(evidence.findings, []);
		assert.equal(evidence.facts.reports, 0);
		assert.deepEqual(
			evidence.artifacts.filter((a) => a.name.startsWith("report:")),
			[],
			"the pass keeps no report as evidence",
		);
	});

	it("given a coverage sensor that exits non-zero, then the verdict is INDETERMINATE without a report being read", async () => {
		const workspace = workspaceWith(root, "exited", { [LCOV_REPORT]: recordedLcov("node-24.21.0-calc.info") });
		const evidence = await judgeCoverage(
			root,
			workspace,
			{ [CALC]: [13] },
			lcovControl({ command: [process.execPath, "-e", "process.exit(3)"] }),
		);
		assert.equal(evidence.verdict, "INDETERMINATE");
		assert.deepEqual(evidence.findings, []);
	});
});

describe("the lcov reader treats a report as the output of the project it judges", () => {
	it("given the report Node 24.21.0 wrote for a directory whose name embeds a second SF record and a change adding that file, then the verdict is INDETERMINATE naming the path and src/victim.js is not judged covered", async () => {
		const forged = "evil\nSF:src/victim.js";
		const workspace = workspaceWith(root, "forged", { [LCOV_REPORT]: recordedLcov("node-24.21.0-forged-path.info") });
		// The report reads as two records, the second declaring src/victim.js executed: the change also
		// adds that file, which no test loads.
		const evidence = await judgeCoverage(root, workspace, { [forged]: [1, 2, 3], "src/victim.js": [1, 2, 3] });
		assert.equal(evidence.verdict, "INDETERMINATE");
		assert.deepEqual(evidence.findings, []);
		assert.ok(
			evidence.limits.notes.some((note) => note.includes("control character") && note.includes(JSON.stringify(forged))),
			JSON.stringify(evidence.limits.notes),
		);
		assert.equal(evidence.facts.measured_lines, undefined, "no line of the forged records is judged");
		// A path the change moved without writing a line in it stays in the introduced set with no line.
		const moved = await judgeCoverage(root, workspace, { [forged]: [], "src/victim.js": [1, 2, 3] });
		assert.equal(moved.verdict, "INDETERMINATE");
		assert.equal(moved.facts.measured_lines, undefined);
		// A path that only a test carries can forge the same record.
		const test = await judgeCoverage(root, workspace, { "test/a\nb.test.mjs": [1] });
		assert.equal(test.verdict, "INDETERMINATE");
	});
});
