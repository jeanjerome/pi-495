/**
 * The JSON reports of ESLint and of the duplication detector jscpd, as the quality controls of a Node
 * target have them written: one finding per ESLint message, named by its rule, its file and its line,
 * and one finding per duplicated block, naming both places it sits. A report that is absent or that
 * cannot be read concludes nothing, and neither does a file ESLint could not parse: a part of the tree
 * nothing measured never reads as clean code.
 */
import { messageOf } from "../../domain/errors.ts";
import type { ProcessObservation } from "../../ports/execution.ts";
import {
	buildErrors,
	incidentOf,
	incidentReport,
	judgedQualityFindings,
	type ParsedFinding,
	type ParsedReport,
} from "./parsers.ts";

interface JsonQualityReport {
	/** What the report is, as a note names it. */
	label: string;
	/** The exit codes of a run that read the tree: ESLint ends with 1 when it reports a violation. */
	read_exit_codes: readonly number[];
	/** The findings of the parsed report, and what the analyser said it could not read; throws on a report of another shape. */
	findingsOf(report: unknown): { findings: ParsedFinding[]; notes: string[] };
}

interface EslintMessage {
	ruleId?: string | null;
	fatal?: boolean;
	message?: string;
	line?: number;
}

const ESLINT_REPORT: JsonQualityReport = {
	label: "ESLint report",
	read_exit_codes: [0, 1],
	findingsOf(report) {
		if (!Array.isArray(report)) throw new Error("it is not a list of file results");
		const findings: ParsedFinding[] = [];
		const unparsed: string[] = [];
		for (const file of report as { filePath?: unknown; messages?: unknown }[]) {
			if (typeof file?.filePath !== "string" || !Array.isArray(file.messages))
				throw new Error("a file result names no file or no messages");
			for (const message of file.messages as EslintMessage[]) {
				// A fatal message is a file ESLint could not parse, which no rule was applied to.
				if (message.fatal === true) {
					unparsed.push(`${file.filePath}: ${message.message ?? ""}`);
					continue;
				}
				const rule = message.ruleId ?? "unnamed";
				findings.push({
					rule_id: rule,
					category: "quality",
					severity: "major",
					message: `${file.filePath}:${message.line}: ${rule}: ${message.message ?? ""}`,
					symbol: null,
				});
			}
		}
		return { findings, notes: unparsed.length > 0 ? [`ESLint could not analyse ${unparsed.join("; ")}`] : [] };
	},
};

interface JscpdPlace {
	name?: unknown;
	start?: unknown;
}

const JSCPD_REPORT: JsonQualityReport = {
	label: "jscpd report",
	read_exit_codes: [0],
	findingsOf(report) {
		const duplicates = (report as { duplicates?: unknown } | null)?.duplicates;
		if (!Array.isArray(duplicates)) throw new Error("it carries no list of duplicates");
		const placeOf = (place: JscpdPlace | undefined): string => {
			if (typeof place?.name !== "string" || typeof place.start !== "number")
				throw new Error("a duplicate does not name its two places");
			return `${place.name}:${place.start}`;
		};
		const findings = (
			duplicates as { firstFile?: JscpdPlace; secondFile?: JscpdPlace; tokens?: unknown; lines?: unknown }[]
		).map(
			(duplicate): ParsedFinding => ({
				rule_id: "jscpd",
				category: "quality",
				severity: "major",
				message: `${placeOf(duplicate.firstFile)}: duplicated block of ${duplicate.tokens} tokens (${duplicate.lines} lines), also at ${placeOf(duplicate.secondFile)}`,
				symbol: null,
			}),
		);
		return { findings, notes: [] };
	},
};

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

/** ESLint's JSON report: one finding per message, with its rule, its file and its line. */
export function parseEslintJson(
	obs: ProcessObservation,
	documents: readonly { name: string; text: string }[],
	output: string,
): ParsedReport {
	return readJsonQualityReport(ESLINT_REPORT, obs, documents, output);
}

/** jscpd's JSON report: one finding per duplicated block, naming the file and line of both its places. */
export function parseJscpdJson(
	obs: ProcessObservation,
	documents: readonly { name: string; text: string }[],
	output: string,
): ParsedReport {
	return readJsonQualityReport(JSCPD_REPORT, obs, documents, output);
}
