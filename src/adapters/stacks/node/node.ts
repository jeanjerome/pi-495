/**
 * The Node technology (CMP-TGT): a project whose root holds a `package.json`, modelled by its manifest and the
 * suite `scripts.test` declares, and the capabilities each directory here implements on it, found without
 * executing anything. The suite runs under `node --test` unless `scripts.test` declares vitest, mocha or jest
 * run without an argument, each read through the report it writes; a `scripts.test` that names a runner 495
 * cannot read leaves no control at all. Node declares no structure: a package lays out no modules whose
 * dependency direction it could oppose to a change.
 */
import type { StackPlugin } from "../../../application/stacks/plugin.ts";
import { NODE_COVERAGE } from "./coverage/coverage-control.ts";
import { NODE_MUTATION } from "./mutation/mutation-control.ts";
import { STRYKER_READER } from "./mutation/stryker-reader.ts";
import { type NodeProject, readNodeProject } from "./project/node-project.ts";
import { ESLINT_READER } from "./quality/eslint-reader.ts";
import { JSCPD_READER } from "./quality/jscpd-reader.ts";
import { NODE_QUALITY } from "./quality/quality-controls.ts";
import { JEST_READER } from "./tests/jest-reader.ts";
import { NODE_TEST_READER } from "./tests/node-test-reader.ts";
import { NODE_TESTS } from "./tests/unit-controls.ts";

export const NODE_PLUGIN: StackPlugin<NodeProject> = {
	id: "node",
	signal_files: ["package.json"],
	recognise: (view) => (view.exists("package.json") ? readNodeProject(view) : null),
	facts: ({ model, view }) => ({
		scripts: Object.keys(model.manifest.scripts ?? {}),
		has_test_dir: view.exists("test"),
	}),
	readers: [NODE_TEST_READER, JEST_READER, ESLINT_READER, JSCPD_READER, STRYKER_READER],
	capabilities: {
		tests: NODE_TESTS,
		coverage: NODE_COVERAGE,
		mutation: NODE_MUTATION,
		quality: NODE_QUALITY,
	},
};
