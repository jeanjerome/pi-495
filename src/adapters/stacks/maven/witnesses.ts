/** The witness trees that qualify the controls of a Maven target (VER-05). */
import type { StructureRule } from "../../../contracts/v1/protocol.ts";

/**
 * The package the witnesses of a Maven target are written in, on both sides of the source root.
 * None of them sits in the default package: a mutation engine scopes the tests it runs to the
 * packages its test tree declares, so a witness test outside every package is never executed, and a
 * sensor proved on a witness nothing ran is not proved at all (VER-05).
 */
const WITNESS_PACKAGE = "witness495";
const WITNESS_SOURCE_ROOT = `src/main/java/${WITNESS_PACKAGE}/`;
const WITNESS_TEST_ROOT = `src/test/java/${WITNESS_PACKAGE}/`;

/** A witness class of one method, whose body is the single expression the mutators rewrite. */
function witnessClass(name: string, method: string, body: string): string {
	return `package ${WITNESS_PACKAGE};\n\npublic final class ${name} {\n    public int ${method}(int n) {\n        return ${body};\n    }\n}\n`;
}

/**
 * The tree that carries the defect the mutation control claims to detect (VER-05): a class the suite
 * executes and asserts nothing about. Its mutants are reached by a test and killed by none, which is
 * exactly what coverage cannot see and what this control exists for.
 */
export function mutationNegativeWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Unasserted.java`]: witnessClass(
			"Witness495Unasserted",
			"half",
			"n / 2",
		),
		[`${witnessPrefix}${WITNESS_TEST_ROOT}NegativeMutationWitness495Test.java`]: `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\n\npublic class NegativeMutationWitness495Test {\n    @Test void executesWithoutAsserting() { new Witness495Unasserted().half(4); }\n}\n`,
	};
}

/** A method whose cyclomatic complexity is 11: one more than the threshold of the referential. */
const COMPLEX_WITNESS = `package ${WITNESS_PACKAGE};

public final class Witness495Complex {
    private Witness495Complex() {}

    public static int grade(int a, int b, int c) {
        int r = 0;
        if (a > 0) r++;
        if (b > 0) r++;
        if (c > 0) r++;
        if (a > 1) r++;
        if (b > 1) r++;
        if (c > 1) r++;
        if (a > 2) r++;
        if (b > 2) r++;
        if (c > 2) r++;
        if (a > 3) r++;
        return r;
    }
}
`;

/** A class carrying a block of more than 100 tokens that only its twin witness repeats. */
function duplicateWitness(name: string): string {
	return `package ${WITNESS_PACKAGE};

public final class ${name} {
    private ${name}() {}

    public static long witness495Checksum(long[] samples) {
        long witness495Sum = 17L;
        for (int k = 0; k < samples.length; k++) {
            if (samples[k] % 3L == 1L) {
                witness495Sum = witness495Sum * 31L + samples[k];
            } else {
                witness495Sum = witness495Sum * 37L - samples[k] / 5L;
            }
            if (witness495Sum > 99_991L) {
                witness495Sum = witness495Sum % 99_991L;
            }
        }
        String witness495Label = "sum=" + witness495Sum + ";n=" + samples.length;
        return witness495Sum + witness495Label.length();
    }
}
`;
}

/**
 * The trees that carry the defects the quality controls claim to detect (VER-05): a method above the
 * complexity threshold for PMD, and a block two witness classes repeat for CPD. The project may already
 * carry both; a witness is judged by the findings in its own files.
 */
export function qualityNegativeWitnesses(witnessPrefix: string): Record<string, Record<string, string>> {
	const root = `${witnessPrefix}${WITNESS_SOURCE_ROOT}`;
	return {
		pmd: { [`${root}Witness495Complex.java`]: COMPLEX_WITNESS },
		cpd: {
			[`${root}Witness495DuplicateA.java`]: duplicateWitness("Witness495DuplicateA"),
			[`${root}Witness495DuplicateB.java`]: duplicateWitness("Witness495DuplicateB"),
		},
	};
}

/**
 * The tree that carries the defect the structural control claims to detect (VER-05). The shared
 * negative witness of a Maven target is a failing test, which says nothing about a boundary: this
 * one is a source of a module importing exactly what that module declares no dependency on. It is
 * never compiled — a boundary is read in the declarations, not in a build.
 */
export function structureNegativeWitness(rules: readonly StructureRule[]): Record<string, string> {
	const boundary = rules.find(
		(rule) => rule.kind === "forbidden_dependency" && rule.scope.length > 0 && rule.forbidden.length > 0,
	);
	if (boundary) {
		const forbidden = `${boundary.forbidden[0]!.replace(/\.$/, "")}.Witness495Forbidden`;
		return {
			[`${boundary.scope[0]}witness495/Witness495Boundary.java`]: `package witness495;\n\nimport ${forbidden};\n\npublic final class Witness495Boundary {\n    private Witness495Boundary() {}\n}\n`,
		};
	}
	const cycle = rules.find((rule) => rule.kind === "no_cycle" && rule.scope.length > 0);
	if (!cycle) return {};
	return {
		[`${cycle.scope[0]}witness495/a/Witness495CycleA.java`]:
			"package witness495.a;\n\nimport witness495.b.Witness495CycleB;\n\npublic final class Witness495CycleA {\n    private Witness495CycleA() {}\n}\n",
		[`${cycle.scope[0]}witness495/b/Witness495CycleB.java`]:
			"package witness495.b;\n\nimport witness495.a.Witness495CycleA;\n\npublic final class Witness495CycleB {\n    private Witness495CycleB() {}\n}\n",
	};
}

/**
 * The positive witness of every control of a Maven target: a passing test, and, when a sensor of the
 * introduced lines is declared, a class that test calls and asserts on. The witnesses of both differential
 * sensors are introduced production code, not tests: a class the suite calls and asserts on is what they
 * must both let through. The defect each of them claims to detect is a different treatment of that class,
 * and a failing test exhibits neither — it would stop the build before any report is written.
 */
export function positiveWitness(witnessPrefix: string, measuresIntroducedCode: boolean): Record<string, string> {
	const positive: Record<string, string> = {
		[`${witnessPrefix}${WITNESS_TEST_ROOT}PositiveWitness495Test.java`]: measuresIntroducedCode
			? `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\npublic class PositiveWitness495Test {\n    @Test void runnerReportsAPassingTest() { assertEquals(1, 1); }\n    @Test void introducedCodeIsExercised() { assertEquals(4, new Witness495Covered().twice(2)); }\n}\n`
			: `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\npublic class PositiveWitness495Test { @Test void runnerReportsAPassingTest() { assertEquals(1, 1); } }\n`,
	};
	if (measuresIntroducedCode)
		positive[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Covered.java`] = witnessClass(
			"Witness495Covered",
			"twice",
			"n * 2",
		);
	return positive;
}

/** The negative witness the controls share: a failing test. */
export function negativeWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_TEST_ROOT}NegativeWitness495Test.java`]: `package ${WITNESS_PACKAGE};\n\nimport org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\npublic class NegativeWitness495Test { @Test void injectedDefectMustBeDetected() { assertEquals(1, 2); } }\n`,
	};
}

/** The tree that carries the defect the coverage control claims to detect: a class no test calls. */
export function coverageNegativeWitness(witnessPrefix: string): Record<string, string> {
	return {
		[`${witnessPrefix}${WITNESS_SOURCE_ROOT}Witness495Uncovered.java`]: witnessClass(
			"Witness495Uncovered",
			"half",
			"n / 2",
		),
	};
}
