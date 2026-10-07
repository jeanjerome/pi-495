/**
 * The mutation of a Maven target: whether its POMs declare PIT with a report a frozen control can read, the
 * control that runs it on the classes a candidate modified and the witness that proves it, or what the
 * target must change for it (VER-04).
 */
import {
	SCOPE_PLACEHOLDER,
	type ControlDefinition,
	type RecommendedComplement,
} from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { MutationCapability } from "../../../../application/stacks/plugin.ts";
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import { readPomsOutsideProfiles } from "../project/poms.ts";
import type { MavenProject } from "../project/maven-project.ts";
import type { MavenReactor } from "../project/reactor.ts";
import {
	WITNESS_PACKAGE,
	WITNESS_SOURCE_ROOT,
	WITNESS_TEST_ROOT,
	witnessClass,
	witnessPrefix,
} from "../project/witness-layout.ts";
import { CATALOGUE_DATE } from "../shared.ts";

/**
 * What the target must change so the mutants of its modified classes are observed: declare PIT when
 * it is absent, otherwise fix the one property or two that make its report unreadable.
 */
function mutationRecommendation(engine: MutationEngineConfiguration): RecommendedComplement {
	const pit = {
		test_type: "mutation",
		tool: "org.pitest:pitest-maven",
		version: "1.30.0",
		established_on: CATALOGUE_DATE,
		source: "pitest.org/quickstart/maven/",
	};
	if (!engine.declared)
		return {
			...pit,
			change:
				"in the POM, declare pitest-maven outside any profile with XML among its outputFormats and timestampedReports set to false",
		};
	const changes = [
		...(engine.xml_report ? [] : ["add XML to its outputFormats"]),
		...(engine.stable_report_path ? [] : ["set timestampedReports to false"]),
	];
	return { ...pit, change: `in the POM, in the pitest-maven declaration, ${changes.join(" and ")}` };
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

export function readsMutationReport(view: ProjectView, pomPaths: readonly string[]): MutationEngineConfiguration {
	const found = { declared: false, xml_report: false, stable_report_path: false };
	for (const pom of readPomsOutsideProfiles(view, pomPaths)) {
		if (!/pitest-maven/.test(pom)) continue;
		found.declared = true;
		if (/<outputFormats>[\s\S]*?\bXML\b[\s\S]*?<\/outputFormats>/i.test(pom)) found.xml_report = true;
		if (/<timestampedReports>\s*false\s*<\/timestampedReports>/i.test(pom)) found.stable_report_path = true;
	}
	return { ...found, usable: found.declared && found.xml_report && found.stable_report_path };
}

/** Why the mutants of the modified classes are not observed: what the target would have to declare for them to be. */
export function mutationCapabilityMissing(engine: MutationEngineConfiguration): string {
	if (!engine.declared) return "no mutation engine declared outside a profile (VER-04)";
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
function mutationControl(requirementRefs: RequirementRef[], reactor: MavenReactor): ControlDefinition {
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

/**
 * The tree that carries the defect the mutation control claims to detect (VER-05): a class the suite
 * executes and asserts nothing about. Its mutants are reached by a test and killed by none, which is
 * exactly what coverage cannot see and what this control exists for.
 */
function mutationNegativeWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Unasserted.java`]: witnessClass(
			"Witness495Unasserted",
			"half",
			"n / 2",
		),
		[`${witnessPrefix}${WITNESS_TEST_ROOT}NegativeMutationWitness495Test.java`]: `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\n\npublic class NegativeMutationWitness495Test {\n    @Test void executesWithoutAsserting() { new Witness495Unasserted().half(4); }\n}\n`,
	};
}

export const MAVEN_MUTATION: MutationCapability<MavenProject> = {
	offer: ({ model, view, requirement_refs }) => {
		const engine = readsMutationReport(view, model.reactor.pom_paths);
		if (!engine.usable)
			return {
				kind: "missing",
				reason: mutationCapabilityMissing(engine),
				recommendation: mutationRecommendation(engine),
			};
		return {
			kind: "available",
			controls: [mutationControl(requirement_refs, model.reactor)],
			// A mutant survives where a test executes a line without asserting anything about it. The
			// coverage witness does not exhibit that defect — the line is never executed there, which is the
			// other control's business — so this one introduces a class the suite calls and leaves unchecked.
			own_negative_witness: { mutation: mutationNegativeWitness(witnessPrefix(model.reactor)) },
		};
	},
};
