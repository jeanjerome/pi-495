/** The control that runs the suite of a Maven reactor: `mvn test`, read through its Surefire reports. */
import type { ControlDefinition } from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import { baseControl } from "../../../application/stacks/stack.ts";
import type { MavenReactor } from "./reactor.ts";
import { JACOCO_REPORT_NAME } from "./shared.ts";

/** `mvn test`, offline; it also provides the JaCoCo report when the reactor binds one to the test phase. */
export function testControl(
	requirementRefs: RequirementRef[],
	reactor: MavenReactor,
	jacoco: boolean,
): ControlDefinition {
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
