/**
 * The reader of the TAP stream `node --test --test-reporter=tap` writes on its standard output: one case
 * per test, a skipped or todo test never counted as a pass (§6.5).
 */
import type { ParsedReport, ProcessObservation, ReportReader } from "../../../../ports/execution.ts";
import { exitedOutsideTests, incidentOf, MAX_FAILURES } from "../../../execution/parsers.ts";

/**
 * TAP output of `node --test --test-reporter=tap`. Skipped or todo tests never count as PASS (§6.5).
 * A failing test is followed by the file its diagnostics locate it in, without line or column: a
 * finding whose test name carries no path then points at the file of the test, and one whose name
 * carries a path keeps pointing at that path. A passing test carries no location, so it is reported by
 * its name alone, in `passing_cases`; a suite is not a case. The message the failing test reports
 * closes the line: a test that keeps failing for another reason is then another finding, and one that
 * fails the same way on both passes is the same.
 *
 * node:test reports a test file that declares no case as one passing top-level test named after the
 * file. Such an entry runs code without asserting anything, so it is not counted as a test.
 *
 * One pass over the TAP lines, whose state — the failure being located and described, the block message being
 * read, the passing case awaiting its type — carries from one line to the next and is cohesive for that reason.
 */
export function parseNodeTestTap(obs: ProcessObservation, stdout: string): ParsedReport {
	const incident = incidentOf(obs);
	const lines = stdout.split(/\r?\n/);
	let tests: number | null = null;
	let pass: number | null = null;
	let fail: number | null = null;
	let skipped: number | null = null;
	let todo: number | null = null;
	const failures: string[] = [];
	// Whether the diagnostics being read belong to the failure last named, which they then locate and describe.
	let locating = false;
	let describing = false;
	// The name of the passing test whose diagnostics are being read, kept once they say it is a test.
	let passingName: string | null = null;
	const passingCases: string[] = [];
	// The lines of a block `error` field being read, and the indentation of its key.
	let message: { indent: number; lines: string[] } | null = null;
	const describeLastFailure = (text: string) => {
		failures[failures.length - 1] = `${failures.at(-1)}: ${text.replace(/\s+/g, " ").trim()}`;
	};
	let caseless = 0;
	for (const raw of lines) {
		if (message !== null) {
			if (raw.trim() === "" || raw.length - raw.trimStart().length > message.indent) {
				message.lines.push(raw);
				continue;
			}
			describeLastFailure(message.lines.join(" "));
			message = null;
		}
		const fileWithoutCases = /^ok\s+\d+\s*-\s*\S+\.[cm]?[jt]sx?\s*$/.test(raw);
		if (fileWithoutCases) caseless++;
		const line = raw.trim();
		if (passingName !== null && /^type:\s*'(test|suite)'$/.test(line)) {
			if (line.endsWith("'test'")) passingCases.push(passingName);
			passingName = null;
			continue;
		}
		const location = /^location:\s*'(.+?)(?::\d+){0,2}'$/.exec(line);
		if (location && locating && failures.length > 0) {
			failures[failures.length - 1] = `${failures.at(-1)} (${location[1]})`;
			locating = false;
			continue;
		}
		const error = /^(\s*)error:\s*(.*)$/.exec(raw);
		if (error && describing) {
			describing = false;
			if (/^[|>][-+]?$/.test(error[2]!)) message = { indent: error[1]!.length, lines: [] };
			else describeLastFailure(error[2]!.replace(/^'(.*)'$/, "$1").replaceAll("''", "'"));
			continue;
		}
		if (/^(not )?ok\s+\d+/.test(line)) {
			locating = false;
			describing = false;
			const ok = /^ok\s+\d+\s*-?\s*(.*)$/.exec(line);
			passingName = ok && !fileWithoutCases && !/#\s*(SKIP|TODO)\b/i.test(ok[1]!) ? ok[1]! : null;
		}
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
		if (nok && failures.length < MAX_FAILURES) {
			failures.push(nok[1] ?? "unnamed test");
			locating = true;
			describing = true;
		}
	}
	if (message !== null) describeLastFailure(message.lines.join(" "));
	if (tests !== null) tests -= caseless;
	if (pass !== null) pass -= caseless;
	const facts = {
		exit_code: obs.exit_code,
		tests,
		pass,
		fail,
		skipped,
		todo,
		files_without_cases: caseless,
		passing_cases: passingCases,
		stdout_truncated: obs.stdout_truncated,
	};
	if (incident) return { verdict: "INDETERMINATE", facts: { ...facts, incident }, notes: [incident], failures };
	const broke = obs.exit_code !== 0;
	const outside = (note: string): ParsedReport => exitedOutsideTests(obs, facts, note, stdout, failures);
	if (tests === null || pass === null || fail === null) {
		// A truncated stream is a reading limit, not a property of the candidate.
		if (obs.stdout_truncated)
			return {
				verdict: "INDETERMINATE",
				facts,
				notes: ["TAP summary not found in the output (output truncated)"],
				failures,
			};
		if (broke) return outside(`the runner exited with ${obs.exit_code} without emitting a TAP summary`);
		return { verdict: "INDETERMINATE", facts, notes: ["TAP summary not found in the output"], failures };
	}
	if (tests === 0) {
		if (broke) return outside(`the runner exited with ${obs.exit_code} and executed no test`);
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: ["no test was executed: a suite without assertion proves nothing"],
			failures,
		};
	}
	if (fail > 0) return { verdict: "FAIL", facts, notes: [], failures };
	if ((skipped ?? 0) > 0 || (todo ?? 0) > 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`${skipped ?? 0} skipped and ${todo ?? 0} todo tests: a skip is not a pass (RM-017)`],
			failures,
		};
	if (broke)
		return outside(
			`every test passed but the runner exited with ${obs.exit_code}: the failure is outside the tests that ran`,
		);
	return { verdict: "PASS", facts, notes: [], failures: [] };
}

export const NODE_TEST_READER: ReportReader = {
	id: "node-test",
	version: "1.0.0",
	nature: "behaviour",
	differential: false,
	located: false,
	read: async (run) => parseNodeTestTap(run.observation, run.stdout),
};
