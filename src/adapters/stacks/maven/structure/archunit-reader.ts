/**
 * The reader of the report Surefire writes for the architecture rules 495 runs with ArchUnit: one finding per
 * violation, named by the rule of the adopted map it breaks, the main source it sits in and its line, over the
 * whole tree. ArchUnit names a violation by the class it starts from and the file name of its source; the file
 * is found in the copy from the package of that class. A report that is absent or cannot be read concludes
 * nothing: a build that left no readable report never reads as an architecture kept.
 */
import { basename } from "node:path";
import { messageOf } from "../../../../domain/errors.ts";
import type {
	ParsedFinding,
	ParsedReport,
	ReportDocument,
	ReportReader,
	WorkspaceFiles,
} from "../../../../ports/execution.ts";
import { buildErrors, incidentOf, incidentReport, parseReport } from "../../../execution/parsers.ts";
import { childrenNamed } from "../quality/pmd-reports.ts";
import { ARCHUNIT_CONFIGURATION } from "./archunit-declaration.ts";
import { ARCHITECTURE_TEST_CLASS, architectureRules } from "./archunit-rules.ts";

const REPORT_FILE = `TEST-${ARCHITECTURE_TEST_CLASS}.xml`;

/** The rule a failure of ArchUnit names, as its description was written from the map. */
const RULE = /Rule '([\s\S]*?)' was violated/;

/** A line of a violation: the member or class it starts from, and the source file and line ArchUnit locates it at; 0 when it has no line. */
const VIOLATION = /<([^<>]+(?:<(?:init|clinit)>[^<>]*)?)>.*\bin \(([^()\s:]+\.java):(\d+)\)\s*$/;

interface Violation {
	rule: string;
	origin: string;
	file: string;
	line: number;
	text: string;
}

/** The violations a failure message of ArchUnit lists, each under the rule it names. */
function violationsOf(message: string): Violation[] {
	const rule = RULE.exec(message)?.[1];
	if (rule === undefined) return [];
	return message.split("\n").flatMap((raw) => {
		const m = VIOLATION.exec(raw);
		if (!m) return [];
		return [{ rule, origin: m[1]!, file: m[2]!, line: Number(m[3]), text: raw.trim().replace(/^- /, "") }];
	});
}

/**
 * The path, relative to the copy, of the main source that declares the class a violation starts from: the
 * package of the class, before the top-level type its file is named after, under any source root of the copy
 * other than a test one; the package path alone when no such file is found.
 */
async function sourceOf(files: WorkspaceFiles, violation: Violation, found: Map<string, string[]>): Promise<string> {
	const type = violation.file.slice(0, -".java".length);
	const at = violation.origin.search(new RegExp(`(^|\\.)${type}(?=[.$(]|$)`));
	const pkg = at <= 0 ? "" : violation.origin.slice(0, at);
	const suffix = `${pkg === "" ? "" : `${pkg.replaceAll(".", "/")}/`}${violation.file}`;
	let paths = found.get(violation.file);
	if (paths === undefined) {
		paths = (await files.tree([""], violation.file)).files.map((f) => f.path);
		found.set(violation.file, paths);
	}
	return paths.find((p) => (p === suffix || p.endsWith(`/${suffix}`)) && !p.includes("/src/test/")) ?? suffix;
}

/**
 * The violations the reports list, and the rules ArchUnit could not evaluate; or why a report cannot be read.
 */
function ruleOutcomes(
	reports: readonly ReportDocument[],
): { violations: Violation[]; errors: string[] } | { unreadable: string } {
	const violations: Violation[] = [];
	const errors: string[] = [];
	for (const report of reports) {
		try {
			const root = parseReport(report.text).root;
			if (root?.name !== "testsuite") throw new Error("its root element is not <testsuite>");
			for (const testcase of childrenNamed(root, "testcase")) {
				for (const failure of childrenNamed(testcase, "failure"))
					violations.push(...violationsOf(failure.attributes.message ?? failure.text));
				for (const error of childrenNamed(testcase, "error"))
					errors.push(`${testcase.attributes.name}: ${(error.attributes.message ?? "").split("\n")[0]}`);
			}
		} catch (error) {
			return {
				unreadable: `the report of the architecture rules ${report.name} cannot be read: ${messageOf(error).split("\n")[0]?.slice(0, 200)}`,
			};
		}
	}
	return { violations, errors };
}

/** A report that concludes nothing about the architecture, with why. */
const concludesNothing = (facts: Record<string, unknown>, note: string): ParsedReport => ({
	verdict: "INDETERMINATE",
	facts,
	notes: [note],
	failures: [],
});

/** The violations of the rules of the adopted map, over the whole tree. */
export const ARCHUNIT_READER: ReportReader = {
	id: "archunit-xml",
	version: "1.0.0",
	nature: "structure",
	differential: false,
	located: true,
	async read(run) {
		const incident = incidentOf(run.observation);
		if (incident) return incidentReport(run.observation, incident);
		const reports = (await run.reports("application/xml")).filter((d) => basename(d.name) === REPORT_FILE);
		const facts = { exit_code: run.observation.exit_code, reports: reports.length };
		// Maven exits non-zero when a rule fails; without the report, the failure is the build's.
		if (reports.length === 0)
			return concludesNothing(
				facts,
				`no report of the architecture rules found at the declared report path${run.observation.exit_code === 0 ? "" : `: the build exited with ${run.observation.exit_code}: ${buildErrors(`${run.stdout}\n${run.stderr}`, 3).join("; ") || "no error was named"}`}`,
			);
		const outcomes = ruleOutcomes(reports);
		if ("unreadable" in outcomes) return concludesNothing(facts, outcomes.unreadable);
		// A rule ArchUnit could not evaluate measured nothing of the part it is about.
		if (outcomes.errors.length > 0)
			return concludesNothing(facts, `ArchUnit could not evaluate ${outcomes.errors.join("; ")}`);
		const found = new Map<string, string[]>();
		const findings: ParsedFinding[] = [];
		for (const v of outcomes.violations) {
			const path = await sourceOf(run, v, found);
			findings.push({
				rule_id: v.rule,
				category: "structure",
				severity: "major",
				message: `${path}${v.line > 0 ? `:${v.line}` : ""}: ${v.rule}: ${v.text}`,
				symbol: null,
			});
		}
		return {
			verdict: findings.length > 0 ? "FAIL" : "PASS",
			facts: { ...facts, findings: findings.length },
			notes: [],
			failures: [],
			findings,
		};
	},
	// The rules are the test class written from the map the control froze, compiled from outside the copy, and
	// beside them the files of configuration ArchUnit looks up, empty, which the declaration puts ahead of any
	// file of the project so that none silences or changes a rule of the map.
	ruleset: (control) => ({
		name: `${ARCHITECTURE_TEST_CLASS}.java`,
		text: architectureRules(control.architecture_map ?? { parts: [], relations: [] }),
		beside: Object.fromEntries(ARCHUNIT_CONFIGURATION.map((file) => [file, ""])),
	}),
};
