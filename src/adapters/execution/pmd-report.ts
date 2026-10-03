/**
 * The reports of PMD and of its duplication detector CPD, as `maven-pmd-plugin` writes them: one
 * finding per violation of a rule, named by its rule, its file and its line, and one finding per
 * duplicated block, naming every place the block sits. A report that is absent or that cannot be read
 * concludes nothing: an analyser that left no readable measurement never reads as clean code.
 */
import { XmlElement } from "@rgrove/parse-xml";
import { basename } from "node:path";
import { messageOf } from "../../domain/errors.ts";
import type { ProcessObservation } from "../../ports/execution.ts";
import {
	buildErrors,
	incidentOf,
	incidentReport,
	judgedQualityFindings,
	parseReport,
	type ParsedFinding,
	type ParsedReport,
} from "./parsers.ts";

interface QualityReport {
	/** What the report is, as a note names it. */
	label: string;
	/** The file the plugin writes in each module's build directory. */
	file: string;
	/** The root element of a report of this analyser. */
	root: string;
	findingsOf(root: XmlElement): { findings: ParsedFinding[]; notes: string[] };
}

const childrenNamed = (element: XmlElement, name: string): XmlElement[] =>
	element.children.filter((child): child is XmlElement => child instanceof XmlElement && child.name === name);

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

function readQualityReports(
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

/** PMD's XML report: one finding per violation, with its rule, its file and its line. */
export function parsePmdXml(
	obs: ProcessObservation,
	documents: readonly { name: string; text: string }[],
	output: string,
	introduced: (finding: ParsedFinding) => boolean,
): ParsedReport {
	return readQualityReports(PMD_REPORT, obs, documents, output, introduced);
}

/** CPD's XML report: one finding per duplicated block, naming the file and line of each of its places. */
export function parseCpdXml(
	obs: ProcessObservation,
	documents: readonly { name: string; text: string }[],
	output: string,
): ParsedReport {
	return readQualityReports(CPD_REPORT, obs, documents, output);
}
