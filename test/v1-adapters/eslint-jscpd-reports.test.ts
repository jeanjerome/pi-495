/**
 * The JSON reports of ESLint and jscpd, read by the runner: one finding per ESLint message with its
 * rule, its file and its line, one finding per jscpd duplication naming both places the block sits. A
 * report that is absent or cannot be read concludes nothing, and neither does a file ESLint could not
 * parse. The reports below are shaped as ESLint 10.12.0 and jscpd 5.4.0 write them.
 */
import { strict as assert } from "node:assert";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import { GenericControlRunner } from "../../src/adapters/execution/runner.ts";
import { CasObjectStore } from "../../src/adapters/object-store/cas.ts";
import { UnconfinedSandbox } from "../../src/adapters/sandbox/backends.ts";
import type { ControlDefinition, ParserId } from "../../src/contracts/v1/protocol.ts";
import { controlOf, invocationBase } from "../helpers/execution-fixture.ts";
import { removedAfterEach, tempDir, writeFiles } from "../helpers/fixtures.ts";

let root: string;
let workspace: string;
const cleanups = removedAfterEach();
beforeEach(() => {
	root = tempDir("495-eslint-jscpd-reports-", cleanups);
	workspace = join(root, "ws");
	writeFiles(workspace, { "package.json": "{}\n" });
	// ESLint names each file by its absolute, resolved path.
	workspace = realpathSync(workspace);
});

const GRADER = "src/grader.js";
const ESLINT_REPORT = "target/495-eslint.json";
const JSCPD_REPORT = "target/495-jscpd/jscpd-report.json";

function eslintMessage(ruleId: string, line: number, message: string): Record<string, unknown> {
	return { ruleId, severity: 2, message, line, column: 10, messageId: "x", endLine: line, endColumn: 21 };
}

function eslintReport(base: string, messages: Record<string, unknown>[]): string {
	return JSON.stringify([
		{
			filePath: `${base}/src/clean.js`,
			messages: [],
			suppressedMessages: [],
			errorCount: 0,
			fatalErrorCount: 0,
			warningCount: 0,
			fixableErrorCount: 0,
			fixableWarningCount: 0,
			usedDeprecatedRules: [],
		},
		{
			filePath: `${base}/${GRADER}`,
			messages,
			suppressedMessages: [],
			errorCount: messages.length,
			fatalErrorCount: messages.filter((m) => m.fatal === true).length,
			warningCount: 0,
			fixableErrorCount: 0,
			fixableWarningCount: 0,
			source: "export function grade() {}\n",
			usedDeprecatedRules: [],
		},
	]);
}

const VIOLATIONS = [
	eslintMessage("complexity", 1, "Function 'grade' has a complexity of 21. Maximum allowed is 20."),
	eslintMessage("no-unused-vars", 26, "'neverCalled' is defined but never used."),
	eslintMessage("no-unused-private-class-members", 31, "'#unread' is defined but never used."),
];

const place = (name: string, start: number, end: number) => ({
	name,
	start,
	end,
	startLoc: { line: start, column: 0, position: 0 },
	endLoc: { line: end, column: 1, position: 365 },
});

function jscpdReport(): string {
	return JSON.stringify({
		duplicates: [
			{
				format: "typescript",
				lines: 15,
				tokens: 105,
				kind: "exact",
				isNew: false,
				fragment: "export function checksum(samples) {\n}",
				firstFile: place("src/a.ts", 1, 15),
				secondFile: place("src/b.ts", 2, 16),
			},
		],
		statistics: { total: { lines: 63, tokens: 400, sources: 3, clones: 1 } },
	});
}

/** A control whose command ends with `exitCode` and that reads the report the workspace holds, as `parser` reads it. */
function reader(controlId: string, parser: ParserId, reportPath: string, exitCode = 0): ControlDefinition {
	return controlOf({
		control_id: controlId,
		parser,
		report_path: reportPath,
		command: [process.execPath, "-e", `process.exit(${exitCode})`],
	});
}

async function run(control: ControlDefinition) {
	const runner = new GenericControlRunner(new UnconfinedSandbox(), new CasObjectStore(join(root, "objects")));
	return (await runner.runControl({ ...invocationBase(), control, workspace_path: workspace })).evidence;
}

describe("the reports of ESLint and jscpd are read", () => {
	it("un rapport ESLint donne un constat par message avec sa règle, son fichier et sa ligne", async () => {
		writeFiles(workspace, { [ESLINT_REPORT]: eslintReport(workspace, VIOLATIONS) });
		// ESLint ends with 1 when it reports a violation: the tree was read, and the report says what it found.
		const evidence = await run(reader("eslint", "eslint-json", ESLINT_REPORT, 1));
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.deepEqual(
			evidence.findings.map((f) => [f.rule_id, f.path, f.region?.start_line]),
			[
				["complexity", GRADER, 1],
				["no-unused-vars", GRADER, 26],
				["no-unused-private-class-members", GRADER, 31],
			],
			"one finding per message, with its rule, its file and its line",
		);
		assert.match(evidence.findings[0]!.message, /complexity of 21/);
		assert.ok(
			evidence.findings.every((f) => !f.message.includes(workspace)),
			"the file is named relative to the workspace",
		);

		writeFiles(workspace, { [ESLINT_REPORT]: eslintReport(workspace, []) });
		const clean = await run(reader("eslint", "eslint-json", ESLINT_REPORT));
		assert.equal(clean.verdict, "PASS", "a report without message passes");
		assert.deepEqual(clean.findings, []);
	});

	it("un rapport jscpd donne un constat par duplication qui nomme ses deux emplacements", async () => {
		writeFiles(workspace, { [JSCPD_REPORT]: jscpdReport() });
		const evidence = await run(reader("jscpd", "jscpd-json", JSCPD_REPORT));
		assert.equal(evidence.verdict, "FAIL", evidence.limits.notes.join("; "));
		assert.equal(evidence.findings.length, 1, "one finding per duplication");
		const [duplication] = evidence.findings;
		assert.equal(duplication?.rule_id, "jscpd");
		assert.equal(duplication?.path, "src/a.ts");
		assert.equal(duplication?.region?.start_line, 1);
		assert.ok(duplication?.message.includes("src/b.ts:2"), "the second place is named");
		assert.match(duplication?.message ?? "", /\b105 tokens\b/);

		writeFiles(workspace, { [JSCPD_REPORT]: JSON.stringify({ duplicates: [], statistics: {} }) });
		const clean = await run(reader("jscpd", "jscpd-json", JSCPD_REPORT));
		assert.equal(clean.verdict, "PASS", "a report without duplication passes");
	});

	it("un rapport absent ou illisible, ou un message fatal d'ESLint, rend INDETERMINATE", async () => {
		for (const [controlId, parser, reportPath] of [
			["eslint", "eslint-json", ESLINT_REPORT],
			["jscpd", "jscpd-json", JSCPD_REPORT],
		] as const) {
			const absent = await run(reader(controlId, parser, reportPath));
			assert.equal(absent.verdict, "INDETERMINATE", `${parser}: absent`);
			assert.match(absent.limits.notes.join("; "), /no .*report/i, `${parser}: the note says the report is absent`);

			writeFiles(workspace, { [reportPath]: '[{"filePath": ' });
			const unreadable = await run(reader(controlId, parser, reportPath));
			assert.equal(unreadable.verdict, "INDETERMINATE", `${parser}: unreadable`);
			assert.match(
				unreadable.limits.notes.join("; "),
				/cannot be read/i,
				`${parser}: the note says the report cannot be read`,
			);
		}

		const fatal = { ruleId: null, fatal: true, severity: 2, message: "Parsing error: Unexpected token <", line: 1 };
		writeFiles(workspace, { [ESLINT_REPORT]: eslintReport(workspace, [...VIOLATIONS, fatal]) });
		const unparsed = await run(reader("eslint", "eslint-json", ESLINT_REPORT, 1));
		assert.equal(
			unparsed.verdict,
			"INDETERMINATE",
			"a file ESLint could not parse is a part of the tree nothing measured",
		);
		assert.match(unparsed.limits.notes.join("; "), /ESLint could not analyse src\/grader\.js: Parsing error/);

		// ESLint ends with 2 on a configuration it refuses: nothing of the tree was read.
		writeFiles(workspace, { [ESLINT_REPORT]: eslintReport(workspace, []) });
		const refused = await run(reader("eslint", "eslint-json", ESLINT_REPORT, 2));
		assert.equal(refused.verdict, "INDETERMINATE", "an ESLint that ended with 2 concludes nothing");
	});
});
