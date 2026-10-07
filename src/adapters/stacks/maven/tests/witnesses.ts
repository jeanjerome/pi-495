/** The witnesses every control of a Maven target is qualified on, and the class a measured control must let through (VER-05). */
import { WITNESS_PACKAGE, WITNESS_SOURCE_ROOT, WITNESS_TEST_ROOT, witnessClass } from "../project/witness-layout.ts";

const ASSERTIONS_IMPORTS =
	"import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;";

/** The positive witness of every control of a Maven target: a passing test. */
export function positiveWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_TEST_ROOT}PositiveWitness495Test.java`]: `package ${WITNESS_PACKAGE};\n\n${ASSERTIONS_IMPORTS}\n\npublic class PositiveWitness495Test { @Test void runnerReportsAPassingTest() { assertEquals(1, 1); } }\n`,
	};
}

/**
 * The class the positive test calls and asserts on, written over the positive test with that one case more.
 * The witnesses of both differential sensors are introduced production code, not tests: a class the suite
 * calls and asserts on is what they must both let through. The defect each of them claims to detect is a
 * different treatment of that class, and a failing test exhibits neither — it would stop the build before
 * any report is written.
 */
export function measuredCodeWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_TEST_ROOT}PositiveWitness495Test.java`]: `package ${WITNESS_PACKAGE};\n\n${ASSERTIONS_IMPORTS}\n\npublic class PositiveWitness495Test {\n    @Test void runnerReportsAPassingTest() { assertEquals(1, 1); }\n    @Test void introducedCodeIsExercised() { assertEquals(4, new Witness495Covered().twice(2)); }\n}\n`,
		[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Covered.java`]: witnessClass(
			"Witness495Covered",
			"twice",
			"n * 2",
		),
	};
}

/** The negative witness the controls share: a failing test. */
export function negativeWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_TEST_ROOT}NegativeWitness495Test.java`]: `package ${WITNESS_PACKAGE};\n\n${ASSERTIONS_IMPORTS}\n\npublic class NegativeWitness495Test { @Test void injectedDefectMustBeDetected() { assertEquals(1, 2); } }\n`,
	};
}
