import type { Verdict } from "../../contracts/v1/common.ts";
import type { ProcessObservation } from "../../ports/execution.ts";

export interface ParsedReport {
	verdict: Verdict;
	facts: Record<string, unknown>;
	notes: string[];
	/** Failing test names or messages, bounded. */
	failures: string[];
}

export const PARSER_VERSIONS = { "exit-code": "1.0.0", "node-test": "1.0.0", "junit-xml": "1.0.0" } as const;

const MAX_FAILURES = 50;

/** Verdict from the incident dimension only: timeout, spawn error, signal. */
export function incidentOf(obs: ProcessObservation): string | null {
	if (obs.spawn_error) return `spawn error: ${obs.spawn_error}`;
	if (obs.timed_out) return `timeout after ${obs.duration_ms} ms`;
	if (obs.exit_code === null) return `terminated by signal ${obs.signal ?? "unknown"}`;
	return null;
}

/** Contract: exit code 0 means PASS, any other exit code means FAIL, an incident means INDETERMINATE (RM-016). */
export function parseExitCode(obs: ProcessObservation): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return { verdict: "INDETERMINATE", facts: { exit_code: obs.exit_code, incident }, notes: [incident], failures: [] };
	return { verdict: obs.exit_code === 0 ? "PASS" : "FAIL", facts: { exit_code: obs.exit_code }, notes: [], failures: obs.exit_code === 0 ? [] : [`exit code ${obs.exit_code}`] };
}

/** TAP output of `node --test --test-reporter=tap`. Skipped or todo tests never count as PASS (§6.5). */
export function parseNodeTestTap(obs: ProcessObservation, stdout: string): ParsedReport {
	const incident = incidentOf(obs);
	const lines = stdout.split(/\r?\n/);
	let tests: number | null = null;
	let pass: number | null = null;
	let fail: number | null = null;
	let skipped: number | null = null;
	let todo: number | null = null;
	const failures: string[] = [];
	for (const raw of lines) {
		const line = raw.trim();
		const m = /^#\s+(tests|pass|fail|skipped|todo)\s+(\d+)$/.exec(line);
		if (m) {
			const n = Number.parseInt(m[2]!, 10);
			if (m[1] === "tests") tests = n;
			else if (m[1] === "pass") pass = n;
			else if (m[1] === "fail") fail = n;
			else if (m[1] === "skipped") skipped = n;
			else todo = n;
			continue;
		}
		const nok = /^not ok\s+\d+\s*-?\s*(.*)$/.exec(line);
		if (nok && failures.length < MAX_FAILURES) failures.push(nok[1] ?? "unnamed test");
	}
	const facts = { exit_code: obs.exit_code, tests, pass, fail, skipped, todo, stdout_truncated: obs.stdout_truncated };
	if (incident) return { verdict: "INDETERMINATE", facts: { ...facts, incident }, notes: [incident], failures };
	if (tests === null || pass === null || fail === null) return { verdict: "INDETERMINATE", facts, notes: ["TAP summary not found in the output" + (obs.stdout_truncated ? " (output truncated)" : "")], failures };
	if (tests === 0) return { verdict: "INDETERMINATE", facts, notes: ["no test was executed: a suite without assertion proves nothing"], failures };
	if (fail > 0) return { verdict: "FAIL", facts, notes: [], failures };
	if ((skipped ?? 0) > 0 || (todo ?? 0) > 0) return { verdict: "INDETERMINATE", facts, notes: [`${skipped ?? 0} skipped and ${todo ?? 0} todo tests: a skip is not a pass (RM-017)`], failures };
	if (obs.exit_code !== 0) return { verdict: "INDETERMINATE", facts, notes: [`all tests passed but the runner exited with ${obs.exit_code}`], failures };
	return { verdict: "PASS", facts, notes: [], failures: [] };
}

export interface JUnitSummary {
	tests: number;
	failures: number;
	errors: number;
	skipped: number;
	failed_cases: string[];
	files: number;
}

/** Minimal JUnit/Surefire XML reader: counts from `<testsuite>` attributes and `<testcase>` children. */
export function summarizeJUnit(documents: string[]): JUnitSummary {
	const s: JUnitSummary = { tests: 0, failures: 0, errors: 0, skipped: 0, failed_cases: [], files: documents.length };
	for (const doc of documents) {
		for (const suite of doc.matchAll(/<testsuite\b([^>]*)>/g)) {
			const attrs = suite[1] ?? "";
			s.tests += intAttr(attrs, "tests");
			s.failures += intAttr(attrs, "failures");
			s.errors += intAttr(attrs, "errors");
			s.skipped += intAttr(attrs, "skipped");
		}
		for (const tc of doc.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
			const body = tc[3] ?? "";
			if (/<(failure|error)\b/.test(body) && s.failed_cases.length < MAX_FAILURES) {
				const name = /name="([^"]*)"/.exec(tc[1] ?? "")?.[1] ?? "unnamed";
				const cls = /classname="([^"]*)"/.exec(tc[1] ?? "")?.[1];
				s.failed_cases.push(cls ? `${cls}.${name}` : name);
			}
		}
	}
	return s;
}

function intAttr(attrs: string, name: string): number {
	const m = new RegExp(`\\b${name}="(\\d+)"`).exec(attrs);
	return m ? Number.parseInt(m[1]!, 10) : 0;
}

export function parseJUnit(obs: ProcessObservation, documents: string[] | null): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return { verdict: "INDETERMINATE", facts: { exit_code: obs.exit_code, incident }, notes: [incident], failures: [] };
	if (!documents || documents.length === 0) return { verdict: "INDETERMINATE", facts: { exit_code: obs.exit_code, reports: 0 }, notes: ["no JUnit report found at the declared report path"], failures: [] };
	const s = summarizeJUnit(documents);
	const facts = { exit_code: obs.exit_code, ...s };
	if (s.tests === 0) return { verdict: "INDETERMINATE", facts, notes: ["JUnit reports contain no test"], failures: [] };
	if (s.failures + s.errors > 0) return { verdict: "FAIL", facts, notes: [], failures: s.failed_cases };
	if (s.skipped > 0) return { verdict: "INDETERMINATE", facts, notes: [`${s.skipped} skipped tests: a skip is not a pass (RM-017)`], failures: [] };
	if (obs.exit_code !== 0) return { verdict: "INDETERMINATE", facts, notes: [`reports are green but the build exited with ${obs.exit_code}`], failures: [] };
	return { verdict: "PASS", facts, notes: [], failures: [] };
}
