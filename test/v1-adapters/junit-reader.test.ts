import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parseJUnit, summarizeJUnit } from "../../src/adapters/execution/parsers.ts";
import type { ProcessObservation } from "../../src/ports/execution.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

function recorded(name: string): string {
	return readFileSync(new URL(`../fixtures/junit/${name}`, import.meta.url), "utf8");
}

function exited(code: number): ProcessObservation {
	return {
		exit_code: code,
		signal: null,
		timed_out: false,
		spawn_error: null,
		stdout: new Uint8Array(),
		stderr: new Uint8Array(),
		stdout_truncated: false,
		stderr_truncated: false,
		started_at: "t",
		ended_at: "t",
		duration_ms: 1,
	};
}

describe("the JUnit reader counts from the test cases of the report", () => {
	it("given a report recorded from the node:test junit reporter with two nested suites and three passing tests, then the summary counts three tests", () => {
		const report = parseJUnit(exited(0), [recorded("node-test-nested.xml")]);
		assert.equal(report.verdict, "PASS", JSON.stringify(report.notes));
		assert.equal(report.facts.tests, 3);
		assert.equal(summarizeJUnit([recorded("node-test-nested.xml")]).tests, 3);
	});

	it('given a suite declaring tests="0" and two test cases one of which has a failure child, then the summary counts two tests, one failed, and names it', () => {
		const document =
			'<testsuites><testsuite name="S" tests="0" failures="0"><testcase name="passes" classname="S"/>' +
			'<testcase name="breaks" classname="S"><failure message="boom">trace</failure></testcase></testsuite></testsuites>';
		const summary = summarizeJUnit([document]);
		assert.deepEqual([summary.tests, summary.failures + summary.errors, summary.failed_cases], [2, 1, ["S.breaks"]]);
		const report = parseJUnit(exited(1), [document]);
		assert.equal(report.verdict, "FAIL");
		assert.deepEqual(report.failures, ["S.breaks"]);
		assert.equal(report.facts.tests, 2);
	});

	it("given a test case with an error child and one with a failure child, then both are counted failed, each named, the error apart from the failure", () => {
		const document =
			'<testsuite name="S"><testcase name="passes" classname="S"/>' +
			'<testcase name="crashes" classname="S"><error type="java.lang.IllegalStateException">trace</error></testcase>' +
			'<testcase name="breaks" classname="S"><failure message="boom">trace</failure></testcase></testsuite>';
		const summary = summarizeJUnit([document]);
		assert.deepEqual(
			[summary.tests, summary.failures, summary.errors, summary.failed_cases],
			[3, 1, 1, ["S.crashes", "S.breaks"]],
		);
		const report = parseJUnit(exited(1), [document]);
		assert.equal(report.verdict, "FAIL");
		assert.deepEqual(report.failures, ["S.crashes", "S.breaks"]);
	});

	it("given a passing, an erroring, a failing and a skipped case, then each executed case is reported with its outcome, a failure as an assertion and an error otherwise", () => {
		const document =
			'<testsuite name="S"><testcase name="r1_passes" classname="S"/>' +
			'<testcase name="r2_crashes" classname="S"><error type="java.lang.IllegalStateException">trace</error></testcase>' +
			'<testcase name="r3_breaks" classname="S"><failure message="boom" type="java.lang.AssertionError">trace</failure></testcase>' +
			'<testcase name="r4_later" classname="S"><skipped/></testcase></testsuite>';
		assert.deepEqual(summarizeJUnit([document]).cases, [
			{ name: "S.r1_passes", outcome: "passed" },
			{ name: "S.r2_crashes", outcome: "failed_otherwise" },
			{ name: "S.r3_breaks", outcome: "failed_assertion" },
		]);
	});

	it("given vitest and mocha failures thrown before the assertion or by a file that does not load, then each is a failure otherwise, and only one whose error is an assertion is a failed assertion", () => {
		const vitest =
			'<testsuites><testsuite name="test/R1.test.js">' +
			'<testcase classname="test/R1.test.js" name="R1 shout upper-cases"><failure message="shout is not a function" type="TypeError">TypeError: shout is not a function</failure></testcase>' +
			'<testcase classname="test/R2.test.js" name="R2 whisper lower-cases"><failure message="expected &apos;x&apos; to be &apos;X&apos;" type="AssertionError">AssertionError: expected</failure></testcase>' +
			'<testcase classname="test/R3.test.js" name="test/R3.test.js"><failure message="Cannot find module" type="Error">Error: Cannot find module</failure></testcase>' +
			"</testsuite></testsuites>";
		// Mocha's xunit reporter writes no type: the message, then the stack its error opens with its name.
		const mocha =
			'<testsuite name="Mocha Tests"><testcase classname="Greeting" name="R4 shout upper-cases"><failure>shout is not a function\n' +
			"TypeError: shout is not a function\n    at Context.&lt;anonymous&gt; (test/greeting.test.js:4:12)</failure></testcase>" +
			'<testcase classname="Greeting" name="R5 whisper lower-cases"><failure>Expected values to be strictly equal:\n\n1 !== 2\n\n' +
			"AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n\n1 !== 2\n\n    at Context.&lt;anonymous&gt; (test/greeting.test.js:8:12)</failure></testcase></testsuite>";
		assert.deepEqual(summarizeJUnit([vitest, mocha]).cases, [
			{ name: "test/R1.test.js.R1 shout upper-cases", outcome: "failed_otherwise" },
			{ name: "test/R2.test.js.R2 whisper lower-cases", outcome: "failed_assertion" },
			{ name: "test/R3.test.js.test/R3.test.js", outcome: "failed_otherwise" },
			{ name: "Greeting.R4 shout upper-cases", outcome: "failed_otherwise" },
			{ name: "Greeting.R5 whisper lower-cases", outcome: "failed_assertion" },
		]);
		const recordedFailures = ["vitest-5.0.0-failing.xml", "surefire-3.5.2-red.xml", "mocha-12.0.2-red.xml"];
		for (const file of recordedFailures)
			assert.deepEqual(
				summarizeJUnit([recorded(file)])
					.cases.filter((c) => c.outcome !== "passed")
					.map((c) => c.outcome),
				["failed_assertion"],
				file,
			);
	});
	it("given recorded vitest, Surefire and mocha reports, then the counts and the failed case names are those the regular-expression reader gave", () => {
		const cases: { file: string; exit: number; verdict: string; tests: number; failed: string[] }[] = [
			{ file: "vitest-5.0.0-green.xml", exit: 0, verdict: "PASS", tests: 1, failed: [] },
			{
				file: "vitest-5.0.0-failing.xml",
				exit: 1,
				verdict: "FAIL",
				tests: 2,
				failed: ["tests/sum.test.ts.given two numbers, when subtracted, then they differ"],
			},
			{ file: "surefire-3.5.2-green.xml", exit: 0, verdict: "PASS", tests: 1, failed: [] },
			{ file: "surefire-3.5.2-red.xml", exit: 1, verdict: "FAIL", tests: 2, failed: ["demo.SumTest.subtracts"] },
			{ file: "surefire-3.5.2-skip.xml", exit: 0, verdict: "INDETERMINATE", tests: 2, failed: [] },
			{ file: "mocha-12.0.2-green.xml", exit: 0, verdict: "PASS", tests: 1, failed: [] },
			{ file: "mocha-12.0.2-red.xml", exit: 1, verdict: "FAIL", tests: 2, failed: ["Sum.subtracts"] },
			{ file: "mocha-12.0.2-skip.xml", exit: 0, verdict: "INDETERMINATE", tests: 2, failed: [] },
		];
		for (const c of cases) {
			const report = parseJUnit(exited(c.exit), [recorded(c.file)]);
			assert.equal(report.verdict, c.verdict, `${c.file}: ${JSON.stringify(report.notes)}`);
			assert.equal(report.facts.tests, c.tests, c.file);
			assert.deepEqual(summarizeJUnit([recorded(c.file)]).failed_cases, c.failed, c.file);
			if (c.verdict === "INDETERMINATE") assert.match(report.notes.join(" "), /a skip is not a pass/, c.file);
		}
	});
});

describe("the JUnit reader reads a report as wide as the program wrote it", () => {
	it("given a suite holding one hundred and thirty thousand passing test cases, then the summary counts them all and the verdict is PASS", () => {
		const document = `<testsuite name="S">${'<testcase name="t" classname="S"/>'.repeat(130_000)}</testsuite>`;
		const report = parseJUnit(exited(0), [document]);
		assert.equal(report.verdict, "PASS", report.notes.join(" "));
		assert.equal(report.facts.tests, 130_000);
	});
});

/** The verdict the reader gives on one document, or `threw` when reading it raised instead of giving one. */
function verdictOn(code: number, document: string): { verdict: string; notes: string[]; text: string } {
	try {
		const report = parseJUnit(exited(code), [document]);
		return { verdict: report.verdict, notes: report.notes, text: JSON.stringify(report) };
	} catch (error) {
		return { verdict: "threw", notes: [`${(error as Error).name}: ${(error as Error).message}`], text: "" };
	}
}

const GREEN_BODY = '<testsuite name="S" tests="1"><testcase name="passes" classname="S"/></testsuite>';
const cleanups = removedAfterEach();

describe("the JUnit reader never takes a hostile or unreadable document for a success", () => {
	it("given a report with a public and a system DOCTYPE, then it is read and no entity is resolved, and one whose DOCTYPE references an external file yields none of that file's content", () => {
		const jacocoStyle =
			'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">' +
			GREEN_BODY;
		assert.equal(verdictOn(0, jacocoStyle).verdict, "PASS");

		const secret = join(tempDir("junit-reader-", cleanups), "secret.txt");
		writeFileSync(secret, "CONTENT-OF-A-FILE-OF-THE-MACHINE");
		const external =
			`<?xml version="1.0"?><!DOCTYPE report [<!ENTITY leak SYSTEM "file://${secret}">]>` +
			'<testsuite name="S" tests="1"><testcase name="&leak;" classname="S"/></testsuite>';
		const read = verdictOn(0, external);
		assert.notEqual(read.verdict, "PASS");
		assert.equal(read.verdict, "INDETERMINATE", read.notes.join(" "));
		assert.ok(!read.text.includes("CONTENT-OF-A-FILE-OF-THE-MACHINE"));
	});

	it("given a truncated report, nested entity declarations, two hundred thousand levels of nesting and a report over 16 MiB, then the verdict is INDETERMINATE when the program exits 0 and FAIL saying the report is not readable when it exits with an error", () => {
		const nestedEntities =
			'<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">' +
			'<!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">' +
			'<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">]>' +
			'<testsuite name="S" tests="1"><testcase name="&lol3;" classname="S"/></testsuite>';
		const oversized = `<testsuite name="S" tests="1"><testcase name="passes"/><!--${"x".repeat(16 * 1024 * 1024)}--></testsuite>`;
		const documents: Record<string, string> = {
			truncated: '<testsuite name="S" tests="1"><testcase name="passes" classname="S"/><testcase name=',
			"nested entities": nestedEntities,
			"two hundred thousand levels": `${"<a>".repeat(200_000)}${"</a>".repeat(200_000)}`,
			"over 16 MiB": oversized,
		};
		for (const [label, document] of Object.entries(documents)) {
			const clean = verdictOn(0, document);
			assert.equal(clean.verdict, "INDETERMINATE", `${label}, exit 0: ${clean.notes.join(" ").slice(0, 200)}`);
			const broken = verdictOn(1, document);
			assert.equal(broken.verdict, "FAIL", `${label}, exit 1: ${broken.notes.join(" ").slice(0, 200)}`);
			assert.match(broken.notes.join(" "), /not readable/, label);
		}
	});
});
