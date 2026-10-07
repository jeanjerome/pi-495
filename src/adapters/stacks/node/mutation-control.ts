/**
 * The mutation sensor of a Node target: the Stryker control of a target that installed it, run on the
 * lines a candidate introduced, or why there is none and what would give one (VER-04).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	SCOPE_PLACEHOLDER,
	type ControlDefinition,
	type RecommendedComplement,
} from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import {
	CATALOGUE_DATE,
	STRYKER_REPORT_PATH,
	VITEST_OWN_PATHS,
	type SensorOutcome,
	type SuiteRunner,
} from "./shared.ts";

/** What Stryker is installed as. */
const STRYKER_PACKAGE = "@stryker-mutator/core";

const MUTATION_NOT_MEASURED = "the mutation of the introduced lines is not measured on this target";

const STRYKER_RECOMMENDATION: RecommendedComplement = {
	test_type: "mutation",
	tool: STRYKER_PACKAGE,
	version: "10.0.0",
	established_on: CATALOGUE_DATE,
	source: "stryker-mutator.io/docs/stryker-js/getting-started/",
	change: `install ${STRYKER_PACKAGE} as a devDependency`,
};

/**
 * The mutation control of a target that installed Stryker, or why it has none. Stryker is run from the
 * copy's `node_modules` and never from the host's PATH, with the configuration the target chose and
 * `npm test` as its command unless that configuration says otherwise; 495 installs nothing. The runners
 * whose qualification witnesses 495 writes are the ones it can qualify the control on.
 */
export function mutationOutcome(
	projectPath: string,
	runner: SuiteRunner,
	unit: ControlDefinition,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
): SensorOutcome {
	if (runner !== "node-test" && runner !== "vitest")
		return { missing: [`${MUTATION_NOT_MEASURED}: 495 writes no qualification witness for ${runner}`] };
	if (!existsSync(join(projectPath, "node_modules", STRYKER_PACKAGE)))
		return {
			missing: [`${MUTATION_NOT_MEASURED}: ${STRYKER_PACKAGE} is not installed`],
			recommendation: STRYKER_RECOMMENDATION,
		};
	return {
		control: {
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
		},
	};
}
