/**
 * Mutation of the lines a candidate wrote, read from the report Stryker writes (VER-04). The sensor is
 * the generic runner plus a reader, so a Stryker report is an input like any other and no Stryker run
 * is needed to exercise it: what is checked here is what the control decides.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
	analyzeMutation,
	MUTATION_RULE_SURVIVED,
	MUTATION_RULE_UNCOVERED,
	type MutationScope,
} from "../../src/adapters/execution/mutation.ts";
import { STRYKER_ENGINE, strykerScopeOf } from "../../src/adapters/stacks/node/stryker-reader.ts";
import { observation as obs } from "../helpers/execution-fixture.ts";

const CALC = "src/calc.js";

interface StrykerMutantSpec {
	status: string;
	line: number;
	mutator?: string;
	replacement?: string;
	statusReason?: string;
}

/** A `mutation.json` as Stryker writes it: one entry per mutated file, each mutant located by its lines. */
function strykerReport(files: Record<string, StrykerMutantSpec[]>): string {
	const entries = Object.entries(files).map(([path, mutants]) => [
		path,
		{
			language: "javascript",
			source: "",
			mutants: mutants.map((m, index) => ({
				id: `${index}`,
				mutatorName: m.mutator ?? "ArithmeticOperator",
				replacement: m.replacement ?? "a / b",
				location: { start: { line: m.line, column: 10 }, end: { line: m.line, column: 15 } },
				status: m.status,
				...(m.statusReason ? { statusReason: m.statusReason } : {}),
			})),
		},
	]);
	return JSON.stringify({ schemaVersion: "2", thresholds: { high: 80, low: 60 }, files: Object.fromEntries(entries) });
}

function doc(text: string) {
	return [{ name: "reports/mutation/mutation.json", text }];
}

/** The scope a run on `paths` was given: one range per source, as the runner hands it to Stryker. */
function scopeOf(...paths: string[]): MutationScope {
	return { classes: paths.map((path) => `${path}:5-6`), paths, notes: [], unaddressable: [] };
}

function judge(files: Record<string, StrykerMutantSpec[]>, introduced: Record<string, number[]>, over = obs()) {
	return analyzeMutation(
		over,
		doc(strykerReport(files)),
		introduced,
		scopeOf(...Object.keys(introduced)),
		"",
		STRYKER_ENGINE,
	);
}

describe("surviving mutants on the lines a candidate wrote, read from a Stryker report (VER-04)", () => {
	it("given recorded Stryker reports, then a Survived or NoCoverage mutant on an introduced line is a blocking finding naming file, line and operator, Killed and Timeout are detected, CompileError is excluded, RuntimeError leaves the verdict INDETERMINATE, a config-ignored mutant is no finding, and a survivor off the introduced lines is counted as debt and never opposed", () => {
		const survived = judge(
			{
				[CALC]: [
					{ status: "Killed", line: 5 },
					{ status: "Survived", line: 6, mutator: "EqualityOperator", replacement: "a >= b" },
				],
			},
			{ [CALC]: [5, 6] },
		);
		assert.equal(survived.verdict, "FAIL", JSON.stringify(survived.notes));
		assert.equal(survived.findings?.length, 1, "the killed mutant of line 5 gives no finding");
		const finding = survived.findings![0]!;
		assert.ok(finding.message.startsWith(`${CALC}:6 `), finding.message);
		assert.ok(finding.message.includes("EqualityOperator"), finding.message);
		assert.deepEqual(
			[finding.rule_id, finding.category, finding.severity],
			[MUTATION_RULE_SURVIVED, "quality", "blocker"],
		);
		assert.deepEqual(
			[survived.facts.introduced_mutants, survived.facts.killed_mutants, survived.facts.surviving_mutants],
			[2, 1, 1],
		);

		const untouched = judge(
			{
				[CALC]: [
					{ status: "NoCoverage", line: 5 },
					{ status: "Timeout", line: 6 },
				],
			},
			{ [CALC]: [5, 6] },
		);
		assert.equal(untouched.verdict, "FAIL");
		assert.deepEqual(
			untouched.findings?.map((f) => [f.rule_id, f.message.split(" ")[0]]),
			[[MUTATION_RULE_UNCOVERED, `${CALC}:5`]],
			"the expired mutant is detected and has no finding",
		);
		assert.equal(untouched.facts.killed_mutants, 1);

		const excluded = judge({ [CALC]: [{ status: "CompileError", line: 5 }] }, { [CALC]: [5] });
		assert.equal(excluded.verdict, "PASS", JSON.stringify(excluded.notes));
		assert.equal(excluded.facts.excluded_mutants, 1);

		const undecided = judge({ [CALC]: [{ status: "RuntimeError", line: 5 }] }, { [CALC]: [5] });
		assert.equal(undecided.verdict, "INDETERMINATE");
		assert.equal(undecided.facts.undecided_mutants, 1);
		assert.ok(
			undecided.notes.some((n) => n.includes(`${CALC}:5`) && n.includes("RUN_ERROR")),
			JSON.stringify(undecided.notes),
		);

		const ignored = judge(
			{ [CALC]: [{ status: "Ignored", line: 5, statusReason: "Ignored by excludedMutations" }] },
			{ [CALC]: [5] },
		);
		assert.equal(ignored.verdict, "PASS", JSON.stringify(ignored.notes));
		assert.deepEqual(ignored.findings, []);
		assert.equal(ignored.facts.ignored_mutants, 1);

		const debt = judge({ [CALC]: [{ status: "Survived", line: 40 }] }, { [CALC]: [5] });
		assert.equal(debt.verdict, "PASS", JSON.stringify(debt.notes));
		assert.deepEqual(debt.findings, []);
		assert.equal(debt.facts.inherited_survivors, 1);
		assert.ok(debt.notes.some((n) => n.includes("this subject did not write")));
	});
});

describe("a Stryker report that cannot be checked complete is never a success (VER-04)", () => {
	const introduced = { [CALC]: [5, 6] };
	const killed = strykerReport({ [CALC]: [{ status: "Killed", line: 5 }] });
	const run = (
		over: ReturnType<typeof obs>,
		documents: { name: string; text: string; oversized_bytes?: number }[] | null,
		output = "",
	) => analyzeMutation(over, documents, introduced, scopeOf(CALC), output, STRYKER_ENGINE);

	it("given no report after a failing initial run, a run ended by its budget, a truncated report, an oversized report and a report without files, then the first is FAIL with the output kept and the four others are INDETERMINATE naming what is missing", () => {
		const output = "12:00:01 (77) ERROR Initial test run failed\n12:00:01 (77) ERROR npm test exited with code 1\n";
		const failing = run(obs({ exit_code: 1 }), null, output);
		assert.equal(failing.verdict, "FAIL");
		assert.ok(
			failing.notes.some((n) => n.includes("initial test run")),
			JSON.stringify(failing.notes),
		);
		assert.ok(
			failing.failures.some((f) => f.includes("Initial test run failed")),
			JSON.stringify(failing.failures),
		);

		const budget = run(obs({ timed_out: true, exit_code: null, duration_ms: 1_800_000 }), null);
		assert.equal(budget.verdict, "INDETERMINATE");
		assert.ok(budget.notes.some((n) => n.includes("mutation budget")));

		const truncated = run(obs(), doc(killed.slice(0, killed.length / 2)));
		assert.equal(truncated.verdict, "INDETERMINATE");
		assert.ok(
			truncated.notes.some((n) => n.includes("not valid JSON")),
			JSON.stringify(truncated.notes),
		);

		const oversized = run(obs(), [{ name: "reports/mutation/mutation.json", text: "", oversized_bytes: 10 ** 12 }]);
		assert.equal(oversized.verdict, "INDETERMINATE");
		assert.ok(
			oversized.notes.some((n) => n.includes("read bound")),
			JSON.stringify(oversized.notes),
		);

		const withoutFiles = run(obs(), doc(JSON.stringify({ schemaVersion: "2", thresholds: { high: 80, low: 60 } })));
		assert.equal(withoutFiles.verdict, "INDETERMINATE");
		assert.ok(
			withoutFiles.notes.some((n) => n.includes("no files")),
			JSON.stringify(withoutFiles.notes),
		);

		const silent = run(obs(), null);
		assert.equal(silent.verdict, "INDETERMINATE", "no report and a zero exit is not a run that killed everything");
		assert.ok(
			silent.notes.some((n) => n.includes("reports/mutation/mutation.json")),
			JSON.stringify(silent.notes),
		);

		const nothingToSay = run(obs(), doc(strykerReport({ [CALC]: [{ status: "Survived", line: 40 }] })));
		assert.equal(nothingToSay.verdict, "PASS");
		assert.ok(
			nothingToSay.notes.some((n) => n.includes("nothing to conclude")),
			JSON.stringify(nothingToSay.notes),
		);
	});
});

describe("a comment that silences Stryker, written by the candidate, blocks the control (VER-04)", () => {
	it("given introduced files carrying Stryker disable, Stryker disable next-line and a block comment Stryker disable, then the evidence is FAIL with a blocking finding at each comment even when the report is complete and without survivor, a comment already present before the change is named as tolerated, and a test file, a declaration file, a README and the words Stryker disabled in a string are not read", async () => {
		const silencing = [
			"export function add(a, b) {",
			"\t// Stryker disable next-line all",
			"\treturn a + b;",
			"}",
			"// Stryker disable",
			"export const zero = 0;",
			"/* Stryker disable */",
			"export const label = 'Stryker disabled';",
			"// stryker restore",
		].join("\n");
		const introduced = {
			"src/new.js": [1, 2, 3, 4, 5, 6, 7, 8, 9],
			"src/old.js": [4, 5],
			"test/new.test.js": [1],
			"src/new.d.ts": [1],
			"README.md": [1],
		};
		const sources = new Map([
			["src/new.js", silencing],
			[
				"src/old.js",
				"export const a = 1;\n// Stryker disable next-line\nexport const b = a + 1;\nexport const c = b;\nexport const d = c;",
			],
			["test/new.test.js", "// Stryker disable\n"],
			["src/new.d.ts", "// Stryker disable\n"],
			["README.md", "// Stryker disable\n"],
		]);
		const scope = strykerScopeOf(introduced);
		const complete = doc(
			strykerReport({
				"src/new.js": [{ status: "Ignored", line: 3, statusReason: "Ignored by a Stryker comment" }],
				"src/old.js": [{ status: "Killed", line: 4 }],
			}),
		);
		const parsed = analyzeMutation(obs(), complete, introduced, scope, "", STRYKER_ENGINE, sources);
		assert.equal(parsed.verdict, "FAIL", JSON.stringify(parsed.notes));
		assert.deepEqual(
			parsed.findings?.map((f) => [f.rule_id, f.category, f.severity, f.message.split(" ")[0]]),
			[
				["mutation:silence-comment-introduced", "quality", "blocker", "src/new.js:2"],
				["mutation:silence-comment-introduced", "quality", "blocker", "src/new.js:5"],
				["mutation:silence-comment-introduced", "quality", "blocker", "src/new.js:7"],
			],
			"the three comments, and neither the string, the restore comment nor the three files that are not code",
		);
		assert.ok(
			parsed.notes.some((n) => n.includes("src/old.js:2") && n.includes("tolerated")),
			JSON.stringify(parsed.notes),
		);
		assert.equal(parsed.facts.surviving_mutants, 0, "the report holds no survivor");
	});
});

describe("a word next to the Stryker directive is not a silencing comment (VER-04)", () => {
	it("given an introduced source carrying the text Stryker disable in a string with no comment marker, and a comment whose word is Stryker disabled, then each is read by its own boundary and neither is a finding", async () => {
		const source = [
			"export const bare = 'Stryker disable';",
			"export const word = 1; // Stryker disabled",
			"/* Stryker disabled */",
		].join("\n");
		const introduced = { "src/words.js": [1, 2, 3] };
		const scope = strykerScopeOf(introduced);
		const complete = doc(strykerReport({ "src/words.js": [{ status: "Killed", line: 1 }] }));
		const parsed = analyzeMutation(
			obs(),
			complete,
			introduced,
			scope,
			"",
			STRYKER_ENGINE,
			new Map([["src/words.js", source]]),
		);
		assert.deepEqual(
			parsed.findings?.filter((f) => f.rule_id === "mutation:silence-comment-introduced"),
			[],
			JSON.stringify(parsed.findings),
		);
	});
});

describe("a Stryker directive alone on its line inside a block comment silences the control (VER-04)", () => {
	it("given an introduced source whose block comment opens on one line, carries Stryker disable all alone on the next line and closes on a third, above a line whose mutant the complete report marks Ignored, then the evidence is FAIL with one blocking finding located at the line of the directive and not at the opening of the block, the same directive alone on a line outside any comment or after a block has closed, Stryker disabled alone in a block and the directive preceded by a word in a block are not findings, and the directive alone in a block of a file already present before the change is named as tolerated", async () => {
		const silencing = [
			"/*",
			"Stryker disable all",
			"*/",
			"export const zero = 0 + 1;",
			"/*",
			"Stryker disable",
			"*/",
			"export const one = 0 + 1;",
		].join("\n");
		const bare = "Stryker disable all\nexport const one = 1;\n";
		const neighbours = [
			"/*",
			"Stryker disabled",
			"stryker restore",
			"see Stryker disable all",
			"*/",
			"export const two = 2;",
		].join("\n");
		const after = [
			"/* a */",
			"Stryker disable all",
			"export const five = 5;",
			"/*",
			"b",
			"*/",
			"Stryker disable all",
			"export const six = 6;",
		].join("\n");
		const old = ["/*", "Stryker disable", "*/", "export const three = 3;", "export const four = 4;"].join("\n");
		const introduced = {
			"src/block.js": [1, 2, 3, 4, 5, 6, 7, 8],
			"src/bare.js": [1, 2],
			"src/neighbours.js": [1, 2, 3, 4, 5, 6],
			"src/after.js": [1, 2, 3, 4, 5, 6, 7, 8],
			"src/old.js": [4, 5],
		};
		const sources = new Map([
			["src/block.js", silencing],
			["src/bare.js", bare],
			["src/neighbours.js", neighbours],
			["src/after.js", after],
			["src/old.js", old],
		]);
		const scope = strykerScopeOf(introduced);
		const complete = doc(
			strykerReport({
				"src/block.js": [
					{ status: "Ignored", line: 4, statusReason: "Ignored by a Stryker comment" },
					{ status: "Ignored", line: 8, statusReason: "Ignored by a Stryker comment" },
				],
				"src/bare.js": [{ status: "Killed", line: 2 }],
				"src/neighbours.js": [{ status: "Killed", line: 6 }],
				"src/after.js": [{ status: "Killed", line: 3 }],
				"src/old.js": [{ status: "Killed", line: 4 }],
			}),
		);
		const parsed = analyzeMutation(obs(), complete, introduced, scope, "", STRYKER_ENGINE, sources);
		assert.equal(parsed.verdict, "FAIL", JSON.stringify(parsed.notes));
		assert.deepEqual(
			parsed.findings?.map((f) => [f.rule_id, f.severity, f.message.split(" ")[0]]),
			[
				["mutation:silence-comment-introduced", "blocker", "src/block.js:2"],
				["mutation:silence-comment-introduced", "blocker", "src/block.js:6"],
			],
			"one finding at each directive line, with or without all: neither the opening of a block, nor the bare line, nor the neighbouring words, nor the directive alone on a line after a block has closed",
		);
		assert.ok(
			parsed.notes.some((n) => n.includes("src/old.js:2") && n.includes("tolerated")),
			JSON.stringify(parsed.notes),
		);
	});
});

describe("the scope Stryker is given comes from the lines the candidate wrote (VER-04)", () => {
	it("given introduced lines in two sources, a test, a declaration file and a README, then the scope names the line ranges of the two sources only, and given src/[id].js, src/a,b.js and src/!x.js, then each is refused by name and the verdict is INDETERMINATE", async () => {
		const scope = strykerScopeOf({
			"src/calc.js": [5, 6, 9],
			"src/other.mjs": [10],
			"test/calc.test.js": [1, 2],
			"src/calc.d.ts": [1],
			"README.md": [1],
		});
		assert.deepEqual(scope.classes, ["src/calc.js:5-6", "src/calc.js:9-9", "src/other.mjs:10-10"]);
		assert.deepEqual(scope.paths, ["src/calc.js", "src/other.mjs"]);
		assert.deepEqual(scope.unaddressable, []);

		for (const path of ["src/[id].js", "src/a,b.js", "src/!x.js"]) {
			const introduced = { [path]: [3], [CALC]: [5] };
			const refused = strykerScopeOf(introduced);
			assert.deepEqual(refused.unaddressable, [path]);
			const parsed = analyzeMutation(obs(), null, introduced, refused, "", STRYKER_ENGINE);
			assert.equal(parsed.verdict, "INDETERMINATE", path);
			assert.ok(
				parsed.notes.some((n) => n.includes(path)),
				JSON.stringify(parsed.notes),
			);
		}
	});
});

describe("a path no scope can designate to Stryker is never run as an empty scope (VER-04)", () => {
	it("given a source whose name carries a control character and no line range, then it is refused by name, the verdict is INDETERMINATE and no empty scope is handed to Stryker", async () => {
		const path = "src/a\u0001b.js";
		const introduced = { [path]: [] as number[] };
		const refused = strykerScopeOf(introduced);
		assert.deepEqual(refused.unaddressable, [path]);
		const parsed = analyzeMutation(obs(), null, introduced, refused, "", STRYKER_ENGINE);
		assert.equal(parsed.verdict, "INDETERMINATE");
		assert.ok(
			parsed.notes.some((n) => n.includes(path)),
			JSON.stringify(parsed.notes),
		);
	});
});

describe("the output Stryker leaves when its initial run fails (VER-04)", () => {
	it("given the colored, timestamped lines Stryker logs, then the failures keep the message and drop the color codes, the time and the process number that would make two runs differ", () => {
		const output =
			"\u001b[91m23:46:41 (63309) ERROR DryRunExecutor\u001b[39m One or more tests failed in the initial test run:\n" +
			"\u001b[32m23:46:41 (63309) INFO Stryker\u001b[39m fine\n" +
			"\u001b[91m23:46:41 (63309) ERROR Stryker\u001b[39m There were failed tests in the initial test run.\n";
		const parsed = analyzeMutation(obs({ exit_code: 1 }), null, { [CALC]: [5] }, scopeOf(CALC), output, STRYKER_ENGINE);
		assert.deepEqual(parsed.failures, [
			"ERROR DryRunExecutor One or more tests failed in the initial test run:",
			"ERROR Stryker There were failed tests in the initial test run.",
		]);
	});
});
