/** Where the witnesses of a Node target are written, and how their tests are written for its runner (VER-05). */
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import type { SuiteRunner } from "../shared.ts";

/** How a witness test is written for a runner: where it goes, its extension, and how it imports and asserts. */
export interface WitnessTestLayout {
	directory: "test" | "tests";
	extension: "ts" | "mjs";
	/** The import of the function a test is declared with, as `it`. */
	runner_import: string;
	/** The imports of a test that asserts. */
	header: string;
	equal(actual: string, expected: number): string;
}

/**
 * The layout of the tests that call a witness module. A vitest test is a `.ts` file, as its unit witnesses
 * are: the `include` of a vitest configuration that names `*.test.ts` would never discover a `.mjs` one.
 */
export function witnessTestLayout(runner: SuiteRunner, view: ProjectView): WitnessTestLayout {
	const runnerImport =
		runner === "vitest" ? 'import { it } from "vitest";\n' : 'import { test as it } from "node:test";\n';
	return {
		directory: runner === "vitest" && view.exists("tests") ? "tests" : "test",
		extension: runner === "vitest" ? "ts" : "mjs",
		runner_import: runnerImport,
		header:
			runner === "vitest"
				? 'import { expect, it } from "vitest";\n'
				: `${runnerImport}import { strict as assert } from "node:assert";\n`,
		equal: (actual, expected) =>
			runner === "vitest" ? `expect(${actual}).toBe(${expected})` : `assert.equal(${actual}, ${expected})`,
	};
}
