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

/**
 * The mutation control of a target that installed Stryker, or why it has none. Stryker is run from the
 * copy's `node_modules` and never from the host's PATH, with the configuration the target chose and
 * `npm test` as its command unless that configuration says otherwise; 495 installs nothing. The runners
 * whose qualification witnesses 495 writes are the ones it can qualify the control on.
 */
export const NODE_MUTATION: MutationCapability<NodeProject> = {
	offer({ model, view, requirement_refs: requirementRefs, node_binary: nodeBinary }) {
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
			controls: [strykerControl(unit, runner, requirementRefs, nodeBinary)],
		};
	},
};

/** Stryker run on the lines a candidate wrote, read from its JSON report. */
function strykerControl(
	unit: ControlDefinition,
	runner: "node-test" | "vitest",
	requirementRefs: RequirementRef[],
	nodeBinary: string,
): ControlDefinition {
	return {
		...unit,
		control_id: "mutation",
		title: "surviving mutants on the lines the candidate wrote, read from the Stryker JSON report",
		command: [
			nodeBinary,
			`node_modules/${STRYKER_PACKAGE}/bin/stryker.js`,
			"run",
			"--reporters",
			"json",
			"--concurrency",
			"1",
		],
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
		protected_paths: [...unit.protected_paths, "stryker.conf.*", "stryker.config.*"],
	};
}
