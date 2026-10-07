/**
 * The reader of PMD's XML report: one finding per violation of a frozen quality rule, named by its rule,
 * its file and its line, over the whole tree.
 */
import { locate } from "../../../domain/findings.ts";
import type { ParsedFinding, ReportReader } from "../../../ports/execution.ts";
import { childrenNamed, readQualityReports, type QualityReport } from "./pmd-reports.ts";
import { pmdRuleset } from "./pmd-ruleset.ts";

const PMD_REPORT: QualityReport = {
	label: "PMD report",
	file: "pmd.xml",
	root: "pmd",
	findingsOf(root) {
		const findings: ParsedFinding[] = [];
		for (const file of childrenNamed(root, "file"))
			for (const violation of childrenNamed(file, "violation")) {
				const rule = violation.attributes.rule ?? "unnamed";
				findings.push({
					rule_id: rule,
					category: "quality",
					severity: "major",
					message: `${file.attributes.name}:${violation.attributes.beginline}: ${rule}: ${violation.text.trim()}`,
					symbol: null,
				});
			}
		// A file PMD could not analyse is a part of the tree nothing measured.
		const errors = childrenNamed(root, "error").map((e) => `${e.attributes.filename}: ${e.attributes.msg ?? ""}`);
		return { findings, notes: errors.length > 0 ? [`PMD could not analyse ${errors.join("; ")}`] : [] };
	},
};

/** The violations of the frozen quality rules, over the whole tree. */
export const PMD_READER: ReportReader = {
	id: "pmd-xml",
	version: "1.0.0",
	nature: "style",
	differential: false,
	located: true,
	async read(run) {
		// The analyser judges the whole tree; what is read back is the report it left in the build
		// directory of each module, beside which the other analyser's report may lie.
		const docs = await run.reports("application/xml");
		// A PMD finding on a line the run introduced, a witness's own included, is kept past the bound of
		// a report, however many findings the tree already carries; one on an older line of an edited
		// file is bounded as the reference run bounds it.
		const introduced = run.introduced_lines ?? {};
		const onIntroducedLine = (f: ParsedFinding) => {
			const { path, region } = locate(run.relativize(f.message));
			return path !== null && region !== null && (introduced[path] ?? []).includes(region.start_line);
		};
		return readQualityReports(PMD_REPORT, run.observation, docs, `${run.stdout}\n${run.stderr}`, onIntroducedLine);
	},
	ruleset: (rules) => ({ name: "ruleset.xml", text: pmdRuleset(rules) }),
};
