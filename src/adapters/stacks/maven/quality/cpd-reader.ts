/**
 * The reader of the XML report of CPD, PMD's duplication detector: one finding per duplicated block,
 * naming the file and line of each of its places, over the whole tree.
 */
import type { ParsedFinding, ReportReader } from "../../../../ports/execution.ts";
import { pmdRuleset } from "./pmd-ruleset.ts";
import { childrenNamed, readQualityReports, type QualityReport } from "./pmd-reports.ts";

const CPD_REPORT: QualityReport = {
	label: "CPD report",
	file: "cpd.xml",
	root: "pmd-cpd",
	findingsOf(root) {
		const findings = childrenNamed(root, "duplication").map((duplication): ParsedFinding => {
			const [first, ...others] = childrenNamed(duplication, "file").map(
				(f) => `${f.attributes.path}:${f.attributes.line}`,
			);
			const { tokens, lines } = duplication.attributes;
			return {
				rule_id: "CPD",
				category: "quality",
				severity: "major",
				message: `${first}: duplicated block of ${tokens} tokens (${lines} lines), also at ${others.join(", ")}`,
				symbol: null,
			};
		});
		return { findings, notes: [] };
	},
};

/** The duplicated blocks of the duplication detector, over the whole tree. */
export const CPD_READER: ReportReader = {
	id: "cpd-xml",
	version: "1.0.0",
	nature: "style",
	differential: false,
	located: true,
	// The analyser judges the whole tree; what is read back is the report it left in the build directory of
	// each module, beside which the other analyser's report may lie.
	read: async (run) =>
		readQualityReports(
			CPD_REPORT,
			run.observation,
			await run.reports("application/xml"),
			`${run.stdout}\n${run.stderr}`,
		),
	ruleset: (control) => ({ name: "ruleset.xml", text: pmdRuleset(control.quality_rules ?? []) }),
};
