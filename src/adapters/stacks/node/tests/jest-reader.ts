/**
 * The reader of the JSON report jest writes to a file: one case per assertion result, a skipped or todo
 * case never counted as a pass.
 */
import type { ParsedReport, ProcessObservation, ReportReader } from "../../../../ports/execution.ts";
import { messageOf } from "../../../../domain/errors.ts";
import {
	exitedOutsideTests,
	incidentOf,
	incidentReport,
	MAX_FAILURES,
	MAX_REPORT_BYTES,
} from "../../../execution/parsers.ts";

interface JestTestResult {
	/** Path of the test file. */
	name: string;
	status: string;
	assertionResults: { fullName: string; status: string }[];
}

interface JestSummary {
	tests: number;
	failures: number;
	skipped: number;
	todo: number;
	failed_cases: string[];
}

const SKIPPED_STATUSES = ["pending", "skipped", "disabled"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** The test files a jest JSON report holds; throws when the document is not one, so it is never read as a success. */
function readJestReport(document: string): JestTestResult[] {
	if (Buffer.byteLength(document, "utf8") > MAX_REPORT_BYTES)
		throw new Error(`the report exceeds ${MAX_REPORT_BYTES} bytes`);
	const report: unknown = JSON.parse(document);
	if (!isRecord(report) || !Array.isArray(report.testResults)) throw new Error("no testResults list");
	return report.testResults.map((result: unknown) => {
		if (!isRecord(result) || typeof result.name !== "string" || typeof result.status !== "string")
			throw new Error("a test file result lacks its name or status");
		if (!Array.isArray(result.assertionResults)) throw new Error("a test file result lacks its assertion results");
		const assertionResults = result.assertionResults.map((assertion: unknown) => {
			if (!isRecord(assertion) || typeof assertion.fullName !== "string" || typeof assertion.status !== "string")
				throw new Error("an assertion result lacks its name or status");
			return { fullName: assertion.fullName, status: assertion.status };
		});
		return { name: result.name, status: result.status, assertionResults };
	});
}

/**
 * Every assertion is one test, counted from the assertions and not from the aggregate counters an
 * emitter may fill as it likes. A file that failed without any failed assertion did not load, or failed
 * in a hook: it is a failure named by its file.
 */
function summarizeJest(files: JestTestResult[]): JestSummary {
	const summary: JestSummary = { tests: 0, failures: 0, skipped: 0, todo: 0, failed_cases: [] };
	const failed = (name: string): void => {
		if (summary.failed_cases.length < MAX_FAILURES) summary.failed_cases.push(name);
	};
	for (const file of files) {
		let failedInFile = 0;
		for (const assertion of file.assertionResults) {
			summary.tests += 1;
			if (assertion.status === "failed") {
				failedInFile += 1;
				summary.failures += 1;
				failed(`${file.name} > ${assertion.fullName}`);
			} else if (SKIPPED_STATUSES.includes(assertion.status)) summary.skipped += 1;
			else if (assertion.status === "todo") summary.todo += 1;
		}
		if (file.status === "failed" && failedInFile === 0) {
			summary.failures += 1;
			failed(`${file.name} > test suite failed to run`);
		}
	}
	return summary;
}

/** Jest's JSON report, read from the file the control declared, and the exit of the process that wrote it. */
function parseJestJson(obs: ProcessObservation, documents: string[] | null): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return incidentReport(obs, incident);
	const broke = obs.exit_code !== 0;
	const outside = (facts: Record<string, unknown>, note: string): ParsedReport => exitedOutsideTests(obs, facts, note);
	const unreadable = (reason: string): ParsedReport => {
		const facts = { exit_code: obs.exit_code, reports: documents?.length ?? 0 };
		if (broke)
			return outside(facts, `the runner exited with ${obs.exit_code} before writing a readable report: ${reason}`);
		return { verdict: "INDETERMINATE", facts, notes: [`no readable jest report: ${reason}`], failures: [] };
	};
	if (!documents || documents.length === 0) return unreadable("no report at the declared path");
	let summary: JestSummary;
	try {
		summary = summarizeJest(readJestReport(documents[0]!));
	} catch (error) {
		return unreadable(messageOf(error).split("\n")[0]!.slice(0, 200));
	}
	const facts = { exit_code: obs.exit_code, ...summary };
	if (summary.failures > 0) return { verdict: "FAIL", facts, notes: [], failures: summary.failed_cases };
	if (summary.tests === 0) {
		if (broke) return outside(facts, `the runner exited with ${obs.exit_code} and the report contains no test`);
		return { verdict: "INDETERMINATE", facts, notes: ["the jest report contains no test"], failures: [] };
	}
	if (summary.skipped + summary.todo > 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`${summary.skipped} skipped and ${summary.todo} todo tests: a skip is not a pass (RM-017)`],
			failures: [],
		};
	if (broke)
		return outside(
			facts,
			`the report is green but the runner exited with ${obs.exit_code}: the failure is outside the tests that ran`,
		);
	return { verdict: "PASS", facts, notes: [], failures: [] };
}

export const JEST_READER: ReportReader = {
	id: "jest-json",
	version: "1.0.0",
	nature: "behaviour",
	differential: false,
	located: false,
	read: async (run) =>
		parseJestJson(
			run.observation,
			(await run.reports("application/json")).map((d) => d.text),
		),
};
