/**
 * The reading of the JSON reports the quality analysers of a Node target write, which the ESLint and the
 * jscpd readers share: the report the control declared, judged as one set of findings, its notes named
 * relative to the workspace. A report that is absent or that cannot be read concludes nothing, and
 * neither does a file the analyser could not parse: a part of the tree nothing measured never reads as
 * clean code.
 */
import { messageOf } from "../../../../domain/errors.ts";
import type { ParsedFinding, ParsedReport, ProcessObservation, ReaderRun } from "../../../../ports/execution.ts";
import { buildErrors, incidentOf, incidentReport, judgedQualityFindings } from "../../../execution/parsers.ts";

/** What a JSON report of one analyser is, and the findings it carries. */
export interface JsonQualityReport {
	/** What the report is, as a note names it. */
	label: string;
	/** The exit codes of a run that read the tree: ESLint ends with 1 when it reports a violation. */
	read_exit_codes: readonly number[];
	/** The findings of the parsed report, and what the analyser said it could not read; throws on a report of another shape. */
	findingsOf(report: unknown): { findings: ParsedFinding[]; notes: string[] };
}

function readJsonQualityReport(
	kind: JsonQualityReport,
	obs: ProcessObservation,
	documents: readonly { name: string; text: string }[],
	output: string,
): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return incidentReport(obs, incident);
	const facts = { exit_code: obs.exit_code, reports: documents.length };
	if (obs.exit_code === null || !kind.read_exit_codes.includes(obs.exit_code))
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [
				`the analyser exited with ${obs.exit_code}: ${buildErrors(output, 3).join("; ") || "no error was named"}`,
			],
			failures: [],
		};
	const [document] = documents;
	if (document === undefined)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`no ${kind.label} found at the declared report path`],
			failures: [],
		};
	let read: { findings: ParsedFinding[]; notes: string[] };
	try {
		read = kind.findingsOf(JSON.parse(document.text));
	} catch (error) {
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`the ${kind.label} ${document.name} cannot be read: ${messageOf(error).split("\n")[0]?.slice(0, 200)}`],
			failures: [],
		};
	}
	if (read.notes.length > 0) return { verdict: "INDETERMINATE", facts, notes: read.notes, failures: [] };
	return judgedQualityFindings(facts, read.findings);
}

/**
 * The report read by `readJsonQualityReport`, its notes relativized: ESLint names each file by its absolute path, a file
 * it could not parse included, and the note that names it does so relative to the workspace, as a
 * finding does.
 */
export async function readRelativized(run: ReaderRun, kind: JsonQualityReport): Promise<ParsedReport> {
	const parsed = readJsonQualityReport(
		kind,
		run.observation,
		await run.reports("application/json"),
		`${run.stdout}\n${run.stderr}`,
	);
	return { ...parsed, notes: parsed.notes.map((note) => run.relativize(note)) };
}
