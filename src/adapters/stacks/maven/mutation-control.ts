/**
 * The mutation sensor of a Maven target: whether its POMs declare PIT with a report a frozen control can
 * read, the control that runs it on the classes a candidate modified, or what the target must change for
 * it (VER-04).
 */
import {
	SCOPE_PLACEHOLDER,
	type ControlDefinition,
	type RecommendedComplement,
} from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import { baseControl } from "../../../application/stacks/stack.ts";
import { readPomsOutsideProfiles } from "./poms.ts";
import type { MavenReactor } from "./reactor.ts";
import { CATALOGUE_DATE } from "./shared.ts";

/**
 * What the target must change so the mutants of its modified classes are observed: declare PIT when
 * it is absent, otherwise fix the one property or two that make its report unreadable.
 */
export function mutationRecommendation(engine: MutationEngineConfiguration): RecommendedComplement[] {
	if (engine.usable) return [];
	const pit = {
		test_type: "mutation",
		tool: "org.pitest:pitest-maven",
		version: "1.30.0",
		established_on: CATALOGUE_DATE,
		source: "pitest.org/quickstart/maven/",
	};
	if (!engine.declared)
		return [
			{
				...pit,
				change:
					"in the POM, declare pitest-maven outside any profile with XML among its outputFormats and timestampedReports set to false",
			},
		];
	const changes = [
		...(engine.xml_report ? [] : ["add XML to its outputFormats"]),
		...(engine.stable_report_path ? [] : ["set timestampedReports to false"]),
	];
	return [{ ...pit, change: `in the POM, in the pitest-maven declaration, ${changes.join(" and ")}` }];
}

/**
 * What a target declares about its mutation engine. Three properties make its report readable by a
 * control, and each is checked on its own so that the one that is missing can be named: the plugin
 * declared outside any profile, an XML report among its output formats, and a report path carrying
 * no timestamp. A run whose report lands in a directory named after the minute it started is not a
 * report a frozen control can read, and a measurement a sensor silently fails to find is worth
 * nothing (QLT-02).
 */
export interface MutationEngineConfiguration {
	declared: boolean;
	xml_report: boolean;
	stable_report_path: boolean;
	/** The three together: the report of a scoped run can be found and read. */
	usable: boolean;
}

export function readsMutationReport(projectPath: string, pomPaths: readonly string[]): MutationEngineConfiguration {
	const found = { declared: false, xml_report: false, stable_report_path: false };
	for (const pom of readPomsOutsideProfiles(projectPath, pomPaths)) {
		if (!/pitest-maven/.test(pom)) continue;
		found.declared = true;
		if (/<outputFormats>[\s\S]*?\bXML\b[\s\S]*?<\/outputFormats>/i.test(pom)) found.xml_report = true;
		if (/<timestampedReports>\s*false\s*<\/timestampedReports>/i.test(pom)) found.stable_report_path = true;
	}
	return { ...found, usable: found.declared && found.xml_report && found.stable_report_path };
}

/** What the target would have to declare for the mutants of its modified classes to be observed. */
export function mutationCapabilityMissing(engine: MutationEngineConfiguration): string {
	if (!engine.declared)
		return "no mutation engine declared outside a profile: whether a test would notice a change to the introduced lines is not observed on this target (VER-04)";
	const missing = [
		...(engine.xml_report ? [] : ["no XML report among its output formats"]),
		...(engine.stable_report_path ? [] : ["timestamped report directories, which no frozen control can name"]),
	];
	return `a mutation engine is declared on this target but its report cannot be read: ${missing.join(" and ")} (VER-04)`;
}

/**
 * Mutation is the one question coverage cannot answer, and the one control that runs a build of its own.
 * It is declared last and given a budget of its own, and it is scoped at each run to the classes the
 * frozen candidate modified: the engine mutates those and nothing else, so what it costs follows the size
 * of the change rather than the size of the target (VER-04).
 */
export function mutationControl(requirementRefs: RequirementRef[], reactor: MavenReactor): ControlDefinition {
	return {
		...baseControl(requirementRefs),
		control_id: "mutation",
		title: "surviving mutants on the classes the candidate modified, read from the PITest XML report",
		command: [
			"mvn",
			"-B",
			"-q",
			"-o",
			"test-compile",
			"org.pitest:pitest-maven:mutationCoverage",
			"-DfailWhenNoMutations=false",
			"-Dthreads=1",
		],
		timeout_ms: 30 * 60_000,
		parser: "pitest-xml",
		report_path: "**/target/pit-reports",
		provides: ["pit-reports"],
		scope_argument: `-DtargetClasses=${SCOPE_PLACEHOLDER}`,
		network: "loopback",
		writable_paths: reactor.target_paths,
		protected_paths: [...reactor.pom_paths],
	};
}
