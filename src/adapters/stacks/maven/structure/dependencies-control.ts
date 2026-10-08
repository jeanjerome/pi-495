/**
 * The verification that each module of a Maven reactor declares in its POM the dependencies its code uses, and
 * uses those it declares (`specs/adr/D-87`): once the copy declares ArchUnit for an adopted map, the control that
 * runs `dependency:analyze` with the network closed, and the witness that uses a dependency its module does not
 * declare.
 */
import type { WitnessFiles } from "../../../../application/stacks/plugin.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { ControlDefinition } from "../../../../contracts/v1/protocol.ts";
import { WITNESS_PACKAGE, WITNESS_TEST_ROOT, witnessPrefix } from "../project/witness-layout.ts";
import type { MavenReactor } from "../project/reactor.ts";
import {
	DEPENDENCIES_EXECUTION,
	DEPENDENCIES_PROPERTY,
	DEPENDENCY_PLUGIN,
	DEPENDENCY_PLUGIN_VERSION,
} from "../shared.ts";

/**
 * The control that compares, module by module, the dependencies the POMs declare to those the compiled classes
 * use, by the execution of the profile 495 declares in each POM, whose parameters replace the project's. A
 * dependency declared for the runtime alone is used by no class, and is not given as unused; each gap names the
 * classes it is about, which locate a use at the imports that make it.
 */
export function dependenciesControl(requirementRefs: RequirementRef[], reactor: MavenReactor): ControlDefinition {
	return {
		...baseControl(requirementRefs),
		control_id: "dependencies",
		title: "the dependencies each module declares are those its code uses, checked by dependency:analyze",
		command: [
			"mvn",
			"-B",
			"-o",
			`-D${DEPENDENCIES_PROPERTY}`,
			"test-compile",
			`${DEPENDENCY_PLUGIN}:${DEPENDENCY_PLUGIN_VERSION}:analyze@${DEPENDENCIES_EXECUTION}`,
		],
		timeout_ms: 20 * 60_000,
		parser: "dependency-analyze",
		report_path: null,
		provides: [],
		writable_paths: reactor.target_paths,
		protected_paths: [...reactor.pom_paths],
	};
}

/**
 * The tree that carries a use its module does not declare (VER-05): a test that uses the exception JUnit's
 * assertions throw, which the module receives from JUnit without declaring the library that defines it. It
 * compiles wherever the module's tests run on JUnit 5 or later.
 */
export function dependenciesNegativeWitness(reactor: MavenReactor): WitnessFiles {
	return {
		[`${witnessPrefix(reactor)}${WITNESS_TEST_ROOT}Witness495UndeclaredTest.java`]: `package ${WITNESS_PACKAGE};\n\nimport org.opentest4j.AssertionFailedError;\n\npublic final class Witness495UndeclaredTest {\n    Throwable undeclared() {\n        return new AssertionFailedError("used without being declared");\n    }\n}\n`,
	};
}
