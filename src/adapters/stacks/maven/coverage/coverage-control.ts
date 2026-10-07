/**
 * The coverage of a Maven target: whether `mvn test` leaves a JaCoCo report, the control that judges the
 * introduced lines from it and the witness that proves it, or the recommendation that would bind it (QLT-04).
 */
import type { ControlDefinition, RecommendedComplement } from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { CoverageCapability } from "../../../../application/stacks/plugin.ts";
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { baseControl, emptyTrigger } from "../../../../application/stacks/stack.ts";
import { withPluginEdit } from "../project/plugin-declaration.ts";
import { readPomsOutsideProfiles } from "../project/poms.ts";
import type { MavenProject } from "../project/maven-project.ts";
import type { MavenReactor } from "../project/reactor.ts";
import { WITNESS_SOURCE_ROOT, witnessClass, witnessPrefix } from "../project/witness-layout.ts";
import { CATALOGUE_DATE, JACOCO_REPORT_NAME } from "../shared.ts";

const JACOCO_PLUGIN_VERSION = "0.8.15";

/**
 * The declaration of JaCoCo as it is inserted into a POM, one line per entry, each nested level marked
 * by a leading tab: `prepare-agent` attaches the agent to the tests, and `report` is bound to the test
 * phase so that `mvn test` leaves the report the control reads.
 */
const JACOCO_DECLARATION = [
	"<plugin>",
	"\t<groupId>org.jacoco</groupId>",
	"\t<artifactId>jacoco-maven-plugin</artifactId>",
	`\t<version>${JACOCO_PLUGIN_VERSION}</version>`,
	"\t<executions>",
	"\t\t<execution>",
	"\t\t\t<id>prepare-agent</id>",
	"\t\t\t<goals><goal>prepare-agent</goal></goals>",
	"\t\t</execution>",
	"\t\t<execution>",
	"\t\t\t<id>report</id>",
	"\t\t\t<phase>test</phase>",
	"\t\t\t<goals><goal>report</goal></goals>",
	"\t\t</execution>",
	"\t</executions>",
	"</plugin>",
];

/** Recommends JaCoCo, with the edit and the resolution that adopt it when the root POM takes the declaration. */
function jacocoRecommendation(view: ProjectView): RecommendedComplement {
	return withPluginEdit(
		view,
		{
			test_type: "coverage",
			tool: "org.jacoco:jacoco-maven-plugin",
			version: JACOCO_PLUGIN_VERSION,
			established_on: CATALOGUE_DATE,
			source: "www.jacoco.org/jacoco/trunk/doc/maven.html",
			change:
				"in the POM, declare jacoco-maven-plugin outside any profile with the prepare-agent goal and the report goal bound to the test phase",
		},
		"jacoco-maven-plugin",
		JACOCO_DECLARATION,
	);
}

/**
 * Whether `mvn test` leaves a coverage report behind: the JaCoCo plugin with its `report` goal bound
 * outside any profile. Inside a profile, the report exists only when that profile is activated, which
 * the control cannot assume — and a sensor that silently finds no measurement is worth nothing.
 */
export function bindsJacocoReport(view: ProjectView, pomPaths: readonly string[]): boolean {
	for (const pom of readPomsOutsideProfiles(view, pomPaths))
		if (/jacoco-maven-plugin/.test(pom) && /<goal>\s*report\s*<\/goal>/.test(pom)) return true;
	return false;
}

/**
 * The measurement is the one `mvn test` already writes: JaCoCo binds `report` to that phase, so this
 * sensor runs no command of its own and reads the report left in the workspace. It names that report
 * rather than relying on where it sits among the controls: the qualification runs the producer in each of
 * its witness workspaces, and the verification runs them in that order.
 */
function coverageControl(
	requirementRefs: RequirementRef[],
	reactor: MavenReactor,
	nodeBinary: string,
): ControlDefinition {
	return {
		...baseControl(requirementRefs),
		control_id: "coverage",
		title: "introduced-line coverage, read from the JaCoCo report of mvn test",
		command: emptyTrigger(nodeBinary),
		timeout_ms: 60_000,
		parser: "jacoco-xml",
		report_path: "**/target/site/jacoco",
		provides: [],
		requires: [JACOCO_REPORT_NAME],
		protected_paths: [...reactor.pom_paths],
	};
}

/** The tree that carries the defect the coverage control claims to detect: a class no test calls. */
function coverageNegativeWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Uncovered.java`]: witnessClass(
			"Witness495Uncovered",
			"half",
			"n / 2",
		),
	};
}

export const MAVEN_COVERAGE: CoverageCapability<MavenProject> = {
	offer: ({ model, view, requirement_refs, node_binary }) =>
		model.jacoco_report_bound
			? {
					kind: "available",
					controls: [coverageControl(requirement_refs, model.reactor, node_binary)],
					own_negative_witness: { coverage: coverageNegativeWitness(witnessPrefix(model.reactor)) },
				}
			: {
					kind: "missing",
					reason: "no JaCoCo report bound outside a profile (QLT-04)",
					recommendation: jacocoRecommendation(view),
				},
};
