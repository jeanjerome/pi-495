/**
 * The Node technology (CMP-TGT): a project whose root holds a `package.json`, modelled by its manifest and the
 * suite `scripts.test` declares, and the capabilities each directory here implements on it, found without
 * executing anything. The suite runs under `node --test` unless `scripts.test` declares vitest, mocha or jest
 * run without an argument, each read through the report it writes; a `scripts.test` that names a runner 495
 * cannot read leaves no control at all. Its structure is the folders of its main sources, which an
 * architecture map divides; a package lays out no modules whose dependency direction it could oppose to a
 * change, so only the map the owner adopted is checked on it.
 */
import type { StackPlugin } from "../../../application/stacks/plugin.ts";
import { NODE_COVERAGE, NODE_LCOV_READER } from "./coverage/coverage-control.ts";
import { NPM_INSTALL } from "./install/npm-install.ts";
import { NODE_MUTATION } from "./mutation/mutation-control.ts";
import { STRYKER_READER } from "./mutation/stryker-reader.ts";
import { type NodeProject, readNodeProject } from "./project/node-project.ts";
import { ESLINT_READER } from "./quality/eslint-reader.ts";
import { JSCPD_READER } from "./quality/jscpd-reader.ts";
import { NODE_QUALITY } from "./quality/quality-controls.ts";
import { JEST_READER } from "./tests/jest-reader.ts";
import { NODE_TEST_READER } from "./tests/node-test-reader.ts";
import { NODE_TESTS } from "./tests/unit-controls.ts";
import { NODE_OUTPUTS } from "./shared.ts";
import { DEPENDENCY_CRUISER_READER } from "./structure/dependency-cruiser-reader.ts";
import { NODE_STRUCTURE } from "./structure/node-structure.ts";

export const NODE_PLUGIN: StackPlugin<NodeProject> = {
	id: "node",
	signal_files: ["package.json"],
	recognise: (view) => (view.exists("package.json") ? readNodeProject(view) : null),
	facts: ({ model, view }) => ({
		scripts: Object.keys(model.manifest.scripts ?? {}),
		has_test_dir: view.exists("test"),
	}),
	readers: [
		NODE_TEST_READER,
		JEST_READER,
		NODE_LCOV_READER,
		ESLINT_READER,
		JSCPD_READER,
		STRYKER_READER,
		DEPENDENCY_CRUISER_READER,
	],
	capabilities: {
		tests: NODE_TESTS,
		coverage: NODE_COVERAGE,
		mutation: NODE_MUTATION,
		quality: NODE_QUALITY,
		structure: NODE_STRUCTURE,
		// Only an adopted complement writes under `node_modules`, so any other file added there is a dependency
		// the producer slipped into the project.
		workspace: { outputs: NODE_OUTPUTS, installed_dependencies: "node_modules" },
		install: NPM_INSTALL,
	},
};
