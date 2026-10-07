/** The suite of a Maven reactor: `mvn test`, read through its Surefire reports, and the witnesses that qualify every control. */
import type { ControlDefinition } from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { TestCapability } from "../../../../application/stacks/plugin.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import type { MavenProject } from "../project/maven-project.ts";
import type { MavenReactor } from "../project/reactor.ts";
import { witnessPrefix } from "../project/witness-layout.ts";
import { JACOCO_REPORT_NAME } from "../shared.ts";
import { measuredCodeWitness, negativeWitness, positiveWitness } from "./witnesses.ts";

/** `mvn test`, offline; it also provides the JaCoCo report when the reactor binds one to the test phase. */
function testControl(requirementRefs: RequirementRef[], reactor: MavenReactor, jacoco: boolean): ControlDefinition {
	return {
		...baseControl(requirementRefs),
		control_id: "maven-test",
		title: "mvn test (Surefire)",
		command: ["mvn", "-B", "-q", "-o", "test"],
		timeout_ms: 20 * 60_000,
		parser: "junit-xml",
		report_path: "**/target/surefire-reports",
		provides: ["surefire-reports", ...(jacoco ? [JACOCO_REPORT_NAME] : [])],
		writable_paths: reactor.target_paths,
		protected_paths: [...reactor.preparation_paths, ...reactor.pom_paths],
	};
}

export const MAVEN_TESTS: TestCapability<MavenProject> = {
	offer: ({ model, requirement_refs }) => ({
		kind: "available",
		controls: [testControl(requirement_refs, model.reactor, model.jacoco_report_bound)],
	}),
	positiveWitness: ({ model }) => positiveWitness(witnessPrefix(model.reactor)),
	negativeWitness: ({ model }) => negativeWitness(witnessPrefix(model.reactor)),
	measuredCodeWitness: ({ model }) => measuredCodeWitness(witnessPrefix(model.reactor)),
	preparationPaths: ({ model }) => model.reactor.preparation_paths,
	isTestFile: (path) => path.endsWith("Test.java"),
	// The Maven layout keeps `src/test/resources/x` beside `src/main/resources/x`.
	mirroredResource: (path) => {
		const resource = /^(.*)src\/test\/resources\/(.+)$/.exec(path);
		return resource ? `${resource[1]}src/main/resources/${resource[2]}` : null;
	},
};
