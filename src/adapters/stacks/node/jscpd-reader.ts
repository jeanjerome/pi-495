/**
 * The reader of the JSON report of jscpd: one finding per duplicated block, naming the file and line of
 * both its places, over the whole tree.
 */
import type { ParsedFinding, ReportReader } from "../../../ports/execution.ts";
import { jscpdConfig } from "./jscpd-config.ts";
import { readRelativized, type JsonQualityReport } from "./json-quality-reports.ts";

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

/** The duplicated blocks of the JSON report of jscpd, over the whole tree. */
export const JSCPD_READER: ReportReader = {
	id: "jscpd-json",
	version: "1.0.0",
	nature: "style",
	differential: false,
	located: true,
	read: (run) => readRelativized(run, JSCPD_REPORT),
	ruleset: (rules) => ({ name: "jscpd.json", text: jscpdConfig(rules) }),
};
