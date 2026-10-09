/**
 * The verification that a Node package declares in `package.json` the dependencies its code uses, and uses those
 * it declares (`specs/adr/D-87`): once Knip 6.40.0 is installed in the copy beside the analysers of the map, the
 * control that runs it with the network closed under the configuration 495 writes, and the witness that uses a
 * package `package.json` does not declare.
 */
import type { CapabilityQuestion, WitnessFiles } from "../../../../application/stacks/plugin.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import { type ControlDefinition, RULESET_PLACEHOLDER } from "../../../../contracts/v1/protocol.ts";
import type { NodeProject } from "../project/node-project.ts";
import { analysersInstalledIn, DEPENDENCIES_ANALYSER, MAP_ANALYSERS } from "./map-analysers.ts";

/** The gaps the rule is about: declarations no source uses, and uses `package.json` does not declare. */
const COMPARED_GAPS = ["dependencies", "devDependencies", "optionalPeerDependencies", "unlisted"];

/**
 * The tree that carries a use `package.json` does not declare (VER-05): a source of test that imports a package
 * no package declares, which Knip reports at that source whether or not it is installed.
 */
const DEPENDENCIES_NEGATIVE_WITNESS: WitnessFiles = {
	"test/witness495-undeclared.test.mjs": 'import "witness495-undeclared-package";\n',
};

/** What the adopted map adds to check the dependencies of the package: its control and its witness, once the copy carries Knip; nothing otherwise. */
export function dependenciesVerification({
	view,
	requirement_refs,
	node_binary,
	architecture_map,
}: CapabilityQuestion<NodeProject>): { control: ControlDefinition; witness: WitnessFiles } | null {
	if (architecture_map === undefined || !analysersInstalledIn(view, [...MAP_ANALYSERS, DEPENDENCIES_ANALYSER]))
		return null;
	return {
		control: {
			...baseControl(requirement_refs),
			control_id: "dependencies",
			title: "the dependencies package.json declares are those the code uses, checked by Knip",
			// Run from the copy's `node_modules`, never from the host's PATH, with the configuration the runner writes
			// outside the copy: no configuration of Knip the package carries is read, and none is run.
			command: [
				node_binary,
				"node_modules/knip/bin/knip.js",
				"--config",
				RULESET_PLACEHOLDER,
				"--include",
				COMPARED_GAPS.join(","),
				"--reporter",
				"json",
				"--no-progress",
				"--no-config-hints",
			],
			timeout_ms: 10 * 60_000,
			parser: "knip-json",
			report_path: null,
			provides: [],
			writable_paths: [],
			protected_paths: ["package.json", "node_modules/"],
		},
		witness: DEPENDENCIES_NEGATIVE_WITNESS,
	};
}
