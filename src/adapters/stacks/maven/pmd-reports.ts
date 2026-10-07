/**
 * The reading of the XML reports `maven-pmd-plugin` writes, which the PMD and the CPD readers share: the
 * report of the analyser in each module's build directory, judged as one set of findings. A report that is
 * absent or that cannot be read concludes nothing: an analyser that left no readable measurement never
 * reads as clean code.
 */
import { XmlElement } from "@rgrove/parse-xml";
import { basename } from "node:path";
import { messageOf } from "../../../domain/errors.ts";
import type { ParsedFinding, ParsedReport, ProcessObservation } from "../../../ports/execution.ts";
import {
	buildErrors,
	incidentOf,
	incidentReport,
	judgedQualityFindings,
	parseReport,
} from "../../execution/parsers.ts";

/** What a report of one analyser of the plugin is, and the findings its root element carries. */
export interface QualityReport {
	/** What the report is, as a note names it. */
	label: string;
	/** The file the plugin writes in each module's build directory. */
	file: string;
	/** The root element of a report of this analyser. */
	root: string;
	findingsOf(root: XmlElement): { findings: ParsedFinding[]; notes: string[] };
}

export const childrenNamed = (element: XmlElement, name: string): XmlElement[] =>
	element.children.filter((child): child is XmlElement => child instanceof XmlElement && child.name === name);

export function readQualityReports(
	kind: QualityReport,
	obs: ProcessObservation,
	documents: readonly { name: string; text: string }[],
	output: string,
	introduced?: (finding: ParsedFinding) => boolean,
): ParsedReport {
	const incident = incidentOf(obs);
	if (incident) return incidentReport(obs, incident);
	const own = documents.filter((d) => basename(d.name) === kind.file);
	const facts = { exit_code: obs.exit_code, reports: own.length };
	if (obs.exit_code !== 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [
				`the analyser exited with ${obs.exit_code}: ${buildErrors(output, 3).join("; ") || "no error was named"}`,
			],
			failures: [],
		};
	if (own.length === 0)
		return {
			verdict: "INDETERMINATE",
			facts,
			notes: [`no ${kind.label} found at the declared report path`],
			failures: [],
		};
	const findings: ParsedFinding[] = [];
	const notes: string[] = [];
	for (const document of own) {
		let read: { findings: ParsedFinding[]; notes: string[] };
		try {
			const root = parseReport(document.text).root;
			if (root?.name !== kind.root) throw new Error(`its root element is not <${kind.root}>`);
			read = kind.findingsOf(root);
		} catch (error) {
			return {
				verdict: "INDETERMINATE",
				facts,
				notes: [`the ${kind.label} ${document.name} cannot be read: ${messageOf(error).split("\n")[0]?.slice(0, 200)}`],
				failures: [],
			};
		}
		findings.push(...read.findings);
		notes.push(...read.notes);
	}
	if (notes.length > 0) return { verdict: "INDETERMINATE", facts, notes, failures: [] };
	return judgedQualityFindings(facts, findings, introduced);
}
