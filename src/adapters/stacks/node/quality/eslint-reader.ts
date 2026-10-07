/**
 * The reader of the JSON report ESLint writes: one finding per message, named by its rule, its file and
 * its line, over the whole tree.
 */
import type { ParsedFinding, ReportReader } from "../../../../ports/execution.ts";
import { readRelativized, type JsonQualityReport } from "./json-quality-reports.ts";

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

/** The messages of the JSON report ESLint writes, over the whole tree. */
export const ESLINT_READER: ReportReader = {
	id: "eslint-json",
	version: "1.0.0",
	nature: "style",
	differential: false,
	located: true,
	read: (run) => readRelativized(run, ESLINT_REPORT),
};
