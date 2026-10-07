/** The witnesses every control of a Node target is qualified on, and the module a measured control must let through (VER-05). */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import { witnessTestLayout } from "../project/witness-layout.ts";
import type { SuiteRunner } from "../shared.ts";

function nodeTestWitnesses(): Witnesses {
	return {
		positive: {
			"test/495-positive-witness.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 positive witness: the runner reports a passing test", () => { assert.equal(1, 1); });\n',
		},
		negative: {
			"test/495-negative-witness.test.js":
				'import { test } from "node:test";\nimport { strict as assert } from "node:assert";\ntest("495 negative witness: an injected defect must be detected", () => { assert.equal(1, 2); });\n',
		},
	};
}

export type Witnesses = { positive: Record<string, string>; negative: Record<string, string> };

/**
 * Witness tests placed where the target keeps its tests: the runner's own discovery decides whether
 * they run. Mocha lends a test file no assertion, so its witnesses pass or fail by throwing; jest
 * and vitest lend `expect`, which vitest has to import.
 */
function testDirectoryWitnesses(
	view: ProjectView,
	extension: "js" | "ts",
	sources: { positive: string; negative: string },
): Witnesses {
	const directory = view.exists("tests") ? "tests" : "test";
	return {
		positive: { [`${directory}/495-positive-witness.test.${extension}`]: sources.positive },
		negative: { [`${directory}/495-negative-witness.test.${extension}`]: sources.negative },
	};
}

const POSITIVE_TITLE = "495 positive witness: the runner reports a passing test";
const NEGATIVE_TITLE = "495 negative witness: an injected defect must be detected";

const WITNESS_SOURCES = {
	vitest: {
		extension: "ts",
		positive: `import { expect, it } from "vitest";\nit("${POSITIVE_TITLE}", () => { expect(1).toBe(1); });\n`,
		negative: `import { expect, it } from "vitest";\nit("${NEGATIVE_TITLE}", () => { expect(1).toBe(2); });\n`,
	},
	mocha: {
		extension: "js",
		positive: `it("${POSITIVE_TITLE}", () => { if (1 !== 1) throw new Error("1 is not 1"); });\n`,
		negative: `it("${NEGATIVE_TITLE}", () => { if (1 !== 2) throw new Error("1 is not 2"); });\n`,
	},
	jest: {
		extension: "js",
		positive: `test("${POSITIVE_TITLE}", () => { expect(1).toBe(1); });\n`,
		negative: `test("${NEGATIVE_TITLE}", () => { expect(1).toBe(2); });\n`,
	},
} as const;

export function witnessesOf(runner: SuiteRunner, view: ProjectView): Witnesses {
	if (runner === "node-test") return nodeTestWitnesses();
	const { extension, ...sources } = WITNESS_SOURCES[runner];
	return testDirectoryWitnesses(view, extension, sources);
}

const COVERED_MODULE = "src/witness495/covered.mjs";

/**
 * A module its test calls in full and asserts every result of: what the sensors of the introduced lines must
 * let through.
 */
export function measuredCodeWitness(runner: SuiteRunner, view: ProjectView): Record<string, string> {
	const { directory, extension, header, equal } = witnessTestLayout(runner, view);
	return {
		[COVERED_MODULE]:
			"export function twice(n) {\n  return n * 2;\n}\n\nexport function thrice(n) {\n  return n * 3;\n}\n",
		[`${directory}/495-covered-witness.test.${extension}`]: `${header}import { thrice, twice } from "../${COVERED_MODULE}";\n\nit("495 coverage witness: every function of the module is called", () => {\n  ${equal("twice(2)", 4)};\n  ${equal("thrice(2)", 6)};\n});\n`,
	};
}

/** The negative witness every Node target shares beside its failing test: a source file a linter refuses. */
export const LINT_NEGATIVE_WITNESS: Record<string, string> = { "src/495-negative-witness.js": "var forbidden = 1;\n" };
