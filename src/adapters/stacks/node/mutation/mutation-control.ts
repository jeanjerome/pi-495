/**
 * The mutation of a Node target: the Stryker control of a target that installed it, run on the lines a
 * candidate introduced, with the witness that proves it, or why there is none and what would give one (VER-04).
 */
import type { MutationCapability } from "../../../../application/stacks/plugin.ts";
import type { ProjectView } from "../../../../application/stacks/project-view.ts";
import {
	SCOPE_PLACEHOLDER,
	type ControlDefinition,
	type RecommendedComplement,
} from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { NodeProject } from "../project/node-project.ts";
import { witnessTestLayout } from "../project/witness-layout.ts";
import { CATALOGUE_DATE, STRYKER_REPORT_PATH, type SuiteRunner, VITEST_OWN_PATHS } from "../shared.ts";
import { unitControl } from "../tests/unit-controls.ts";
import { measuredCodeWitness } from "../tests/witnesses.ts";

/** What Stryker is installed as. */
const STRYKER_PACKAGE = "@stryker-mutator/core";

const STRYKER_RECOMMENDATION: RecommendedComplement = {
	test_type: "mutation",
	tool: STRYKER_PACKAGE,
	version: "10.0.0",
	established_on: CATALOGUE_DATE,
	source: "stryker-mutator.io/docs/stryker-js/getting-started/",
	change: `install ${STRYKER_PACKAGE} as a devDependency`,
};

const UNASSERTED_MODULE = "src/witness495/unasserted.mjs";

/**
 * The tree that carries the defect the mutation control claims to detect: a module its test calls without
 * asserting, which coverage cannot see — every line of it is executed, and no test would notice if it changed.
 */
function unassertedWitness(runner: SuiteRunner, view: ProjectView): Record<string, string> {
	const { directory, extension, runner_import } = witnessTestLayout(runner, view);
	return {
		[UNASSERTED_MODULE]: "export function half(n) {\n  return n / 2;\n}\n",
		[`${directory}/495-unasserted-witness.test.${extension}`]: `${runner_import}import { half } from "../${UNASSERTED_MODULE}";\n\nit("495 mutation witness: the function is called and nothing is asserted", () => {\n  half(4);\n});\n`,
	};
}

/** `argument` as one word of a POSIX shell, whatever it carries. */
const shellWord = (argument: string) => `'${argument.replaceAll("'", "'\\''")}'`;

/**
 * The program the control runs Stryker by, through its API: Stryker is imported from the copy's `node_modules`, the
 * eval resolving it from the working directory, and reads the configuration the target chose, under the options
 * given here, which win over it. It receives the scope the runner appends, `--mutate=<ranges>`, comma-separated, a
 * range never carrying a comma. Its working copy under `.stryker-tmp` is removed whatever the outcome, a failed
 * initial run included, where the next control of the same copy would read it. Stryker 10 rewrites the
 * `tsconfig.json` of its working copy through `ts.parseConfigFileTextToJson`, which TypeScript 7 no longer has: on
 * such a copy it is named a file outside the copy, and the target's is copied as is. `boundedSuite`, when the owner
 * bounds the suite, is the command of the suite followed by that bound, which Stryker runs in place of the runner and
 * command the target chose.
 */
function strykerLauncher(boundedSuite: readonly string[] | null): string {
	const options = {
		reporters: ["json"],
		concurrency: 1,
		cleanTempDir: "always",
		...(boundedSuite === null
			? {}
			: { testRunner: "command", commandRunner: { command: boundedSuite.map(shellWord).join(" ") } }),
	};
	return [
		'import { existsSync, readFileSync } from "node:fs";',
		`const { Stryker } = await import(${JSON.stringify(STRYKER_PACKAGE)});`,
		'const scope = process.argv.find((argument) => argument.startsWith("--mutate="));',
		`const options = ${JSON.stringify(options)};`,
		'if (scope !== undefined) options.mutate = scope.slice("--mutate=".length).split(",");',
		'const typescript = "node_modules/typescript/package.json";',
		'const major = existsSync(typescript) ? Number.parseInt(JSON.parse(readFileSync(typescript, "utf8")).version, 10) : 0;',
		'if (major >= 7) options.tsconfigFile = "/dev/null";',
		"await new Stryker(options).runMutationTest();",
	].join("\n");
}

/**
 * The mutation control of a target that installed Stryker, or why it has none. Stryker is run from the
 * copy's `node_modules` and never from the host's PATH, with the configuration the target chose and
 * `npm test` as its command unless that configuration says otherwise, or the suite under the owner's bound
 * and the tests of its own witnesses when they bound it; 495 installs nothing. The runners whose qualification witnesses 495 writes are the
 * ones it can qualify the control on.
 */
export const NODE_MUTATION: MutationCapability<NodeProject> = {
	offer({ model, view, requirement_refs: requirementRefs, node_binary: nodeBinary, suite_paths: suitePaths }) {
		const { suite } = model;
		if (suite.runner === null) return { kind: "refused", reason: suite.refusal };
		const runner = suite.runner;
		if (runner !== "node-test" && runner !== "vitest")
			return { kind: "missing", reason: `495 writes no qualification witness for ${runner}` };
		if (!view.exists(`node_modules/${STRYKER_PACKAGE}`))
			return {
				kind: "missing",
				reason: `${STRYKER_PACKAGE} is not installed`,
				recommendation: STRYKER_RECOMMENDATION,
			};
		const unit = unitControl(suite, requirementRefs, nodeBinary);
		return {
			kind: "available",
			own_negative_witness: { mutation: unassertedWitness(runner, view) },
			controls: [
				strykerControl(unit, runner, requirementRefs, nodeBinary, [
					...suitePaths,
					...(suitePaths.length === 0 ? [] : witnessTests(runner, view)),
				]),
			],
		};
	},
};

/**
 * The tests of the witnesses the control is qualified on, which a bound naming only the owner's test files would
 * leave out: their lines would then survive every mutant. A candidate run has no such file and `node --test`
 * passes over a named file it does not find as long as another pattern finds one.
 */
function witnessTests(runner: "node-test" | "vitest", view: ProjectView): string[] {
	const trees = [measuredCodeWitness(runner, view), unassertedWitness(runner, view)];
	return trees.flatMap((tree) => Object.keys(tree).filter((path) => !path.startsWith("src/")));
}

/**
 * Stryker run on the lines a candidate wrote, read from its JSON report, on the suite `suitePaths` bounds when it
 * names any.
 */
function strykerControl(
	unit: ControlDefinition,
	runner: "node-test" | "vitest",
	requirementRefs: RequirementRef[],
	nodeBinary: string,
	suitePaths: readonly string[],
): ControlDefinition {
	const launcher = strykerLauncher(suitePaths.length === 0 ? null : [...unit.command, ...suitePaths]);
	return {
		...unit,
		control_id: "mutation",
		title: "surviving mutants on the lines the candidate wrote, read from the Stryker JSON report",
		command: [nodeBinary, "--input-type=module", "-e", launcher, "--"],
		timeout_ms: 30 * 60_000,
		parser: "stryker-json",
		report_path: STRYKER_REPORT_PATH,
		provides: [],
		requires: [],
		scope_argument: `--mutate=${SCOPE_PLACEHOLDER}`,
		// Stryker listens on every interface to talk to its test processes: without the loopback profile
		// it fails with `listen EPERM`.
		network: "loopback",
		// Stryker runs the suite in a copy under `.stryker-tmp` whose `node_modules` links back to the
		// copy's own, so the directories vitest writes in, `VITEST_OWN_PATHS`, are written through that link.
		writable_paths: ["reports/mutation", ".stryker-tmp", ...(runner === "vitest" ? VITEST_OWN_PATHS : [])],
		requirement_refs: requirementRefs,
		// A narrowed `mutate`, an added exclusion or another reporter would make the control pass on less.
		// Stryker reads its configuration under each name with or without a leading dot.
		protected_paths: [
			...unit.protected_paths,
			"stryker.conf.*",
			"stryker.config.*",
			".stryker.conf.*",
			".stryker.config.*",
		],
	};
}
