/** The witness trees that qualify the controls of a Node target (VER-05). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SuiteRunner } from "./shared.ts";

/** Twenty conditions on top of the function itself: a cyclomatic complexity of 21, one above the threshold. */
const COMPLEX_WITNESS = `export function witness495Grade(a, b, c) {
  let r = 0;
${Array.from({ length: 20 }, (_, i) => `  if (${["a", "b", "c"][i % 3]} > ${Math.floor(i / 3)}) r++;`).join("\n")}
  return r;
}
`;

/** A block of more than 50 tokens over more than 5 lines that only its twin witness repeats. */
const DUPLICATE_WITNESS = `export function witness495Checksum(samples) {
  let witness495Sum = 17;
  for (let k = 0; k < samples.length; k++) {
    if (samples[k] % 3 === 1) {
      witness495Sum = witness495Sum * 31 + samples[k];
    } else {
      witness495Sum = witness495Sum * 37 - samples[k] / 5;
    }
  }
  return witness495Sum;
}
`;

/**
 * The trees that carry the defects the quality controls claim to detect (VER-05): a function above the
 * complexity threshold for ESLint, and a block two witness modules repeat for jscpd. The project may
 * already carry both; a witness is judged by the findings in its own files.
 */
export const QUALITY_NEGATIVE_WITNESSES: Record<string, Record<string, string>> = {
	eslint: { "src/witness495/complex.mjs": COMPLEX_WITNESS },
	jscpd: {
		"src/witness495/duplicate-a.mjs": DUPLICATE_WITNESS,
		"src/witness495/duplicate-b.mjs": DUPLICATE_WITNESS,
	},
};

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
	projectPath: string,
	extension: "js" | "ts",
	sources: { positive: string; negative: string },
): Witnesses {
	const directory = existsSync(join(projectPath, "tests")) ? "tests" : "test";
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

export function witnessesOf(runner: SuiteRunner, projectPath: string): Witnesses {
	if (runner === "node-test") return nodeTestWitnesses();
	const { extension, ...sources } = WITNESS_SOURCES[runner];
	return testDirectoryWitnesses(projectPath, extension, sources);
}

const COVERED_MODULE = "src/witness495/covered.mjs";
const UNCOVERED_MODULE = "src/witness495/uncovered.mjs";
const UNASSERTED_MODULE = "src/witness495/unasserted.mjs";

/**
 * What the sensors of the introduced lines are qualified on. The positive witness adds a module its
 * test calls in full and asserts every result of. The coverage sensor's own negative witness adds one
 * its test loads and leaves a function of uncalled, which a failing test cannot show: a suite that
 * fails stops before the report exists, and a line nothing executes is not a failure. The mutation
 * sensor's own negative witness adds one its test calls without asserting, which coverage cannot see
 * either: every line of it is executed, and no test would notice if it changed.
 */
export function moduleWitnesses(
	runner: SuiteRunner,
	projectPath: string,
): { positive: Record<string, string>; uncovered: Record<string, string>; unasserted: Record<string, string> } {
	const directory = runner === "vitest" && existsSync(join(projectPath, "tests")) ? "tests" : "test";
	// A vitest test is a `.ts` file, as its unit witnesses are: the `include` of a vitest configuration
	// that names `*.test.ts` would never discover a `.mjs` one.
	const testExtension = runner === "vitest" ? "ts" : "mjs";
	const runnerImport =
		runner === "vitest" ? 'import { it } from "vitest";\n' : 'import { test as it } from "node:test";\n';
	const header =
		runner === "vitest"
			? 'import { expect, it } from "vitest";\n'
			: `${runnerImport}import { strict as assert } from "node:assert";\n`;
	const equal = (actual: string, expected: number): string =>
		runner === "vitest" ? `expect(${actual}).toBe(${expected})` : `assert.equal(${actual}, ${expected})`;
	return {
		positive: {
			[COVERED_MODULE]:
				"export function twice(n) {\n  return n * 2;\n}\n\nexport function thrice(n) {\n  return n * 3;\n}\n",
			[`${directory}/495-covered-witness.test.${testExtension}`]: `${header}import { thrice, twice } from "../${COVERED_MODULE}";\n\nit("495 coverage witness: every function of the module is called", () => {\n  ${equal("twice(2)", 4)};\n  ${equal("thrice(2)", 6)};\n});\n`,
		},
		uncovered: {
			[UNCOVERED_MODULE]:
				"export function called(n) {\n  return n + 1;\n}\n\nexport function neverCalled(n) {\n  return n - 1;\n}\n",
			[`${directory}/495-uncovered-witness.test.${testExtension}`]: `${header}import { called } from "../${UNCOVERED_MODULE}";\n\nit("495 coverage witness: the module is loaded and one function is called", () => {\n  ${equal("called(1)", 2)};\n});\n`,
		},
		unasserted: {
			[UNASSERTED_MODULE]: "export function half(n) {\n  return n / 2;\n}\n",
			[`${directory}/495-unasserted-witness.test.${testExtension}`]: `${runnerImport}import { half } from "../${UNASSERTED_MODULE}";\n\nit("495 mutation witness: the function is called and nothing is asserted", () => {\n  half(4);\n});\n`,
		},
	};
}

/** The negative witness every Node target shares beside its failing test: a source file a linter refuses. */
export const LINT_NEGATIVE_WITNESS: Record<string, string> = { "src/495-negative-witness.js": "var forbidden = 1;\n" };
