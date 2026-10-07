/**
 * The Node stack (CMP-TGT): this module declares the technology and assembles its detection from the
 * sensors of this directory. The detection is the controls a `package.json` offers, found without
 * executing anything. The suite runs under `node --test` unless `scripts.test` declares vitest, mocha or jest
 * run without an argument, each read through the report it writes. A declared lint script becomes a
 * control of its own, refused rather than guessed when it needs a shell. A `scripts.test` that names
 * a runner 495 cannot read leaves no control at all, lint included, and offers no quality referential,
 * so the change stops on that runner rather than freezing a protocol without it. A target that asks
 * its runner for coverage receives a control that judges the lines a change introduces from the LCOV
 * report the runner writes; one that does not is told so instead (QLT-04). A target that installed Stryker
 * receives a control that judges the mutants of the lines a change introduces; one that did not is
 * recommended to (VER-04). A target that declares neither ESLint nor jscpd is offered a quality
 * referential that installs both in a copy (QLT-01); one that declares either is told why not. In a copy
 * where the adopted install put the referential, and there alone, ESLint and jscpd are the quality controls.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ControlDefinition, InstalledPackage } from "../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../contracts/v1/evidence.ts";
import type { StackAdapter, StackDetection } from "../../../application/stacks/stack.ts";
import { ESLINT_READER } from "./eslint-reader.ts";
import { JEST_READER } from "./jest-reader.ts";
import { JSCPD_READER } from "./jscpd-reader.ts";
import { lintControl, lintOf } from "./lint-control.ts";
import { mutationOutcome } from "./mutation-control.ts";
import { NODE_TEST_READER } from "./node-test-reader.ts";
import { readManifest } from "./package-manifest.ts";
import { qualityControls } from "./quality-controls.ts";
import { analyserDeclaration, qualityOffer } from "./quality-referential.ts";
import { STRYKER_READER } from "./stryker-reader.ts";
import { suiteOf } from "./test-runner.ts";
import { LINT_NEGATIVE_WITNESS, moduleWitnesses, QUALITY_NEGATIVE_WITNESSES, witnessesOf } from "./witnesses.ts";

export const NODE_ADAPTER: StackAdapter = {
	stack: "node",
	signal_files: ["package.json"],
	readers: [NODE_TEST_READER, JEST_READER, ESLINT_READER, JSCPD_READER, STRYKER_READER],
	detect: detectNodeStack,
};

function detectNodeStack(
	projectPath: string,
	requirementRefs: RequirementRef[],
	nodeBinary: string,
	referentialPackages: readonly InstalledPackage[],
): StackDetection {
	const pkg = readManifest(projectPath);
	const scripts = pkg.scripts ?? {};
	const suite = suiteOf(
		projectPath,
		typeof scripts.test === "string" ? scripts.test : undefined,
		requirementRefs,
		nodeBinary,
	);
	// A runner 495 cannot read leaves no control at all: a protocol frozen on the lint alone would
	// judge nothing of the behaviour the refused runner was there to judge.
	const controls: ControlDefinition[] = suite.control ? [suite.control] : [];
	if (suite.coverage?.control) controls.push(suite.coverage.control);
	const lintScript = typeof scripts.lint === "string" ? scripts.lint : undefined;
	const lint = lintScript && !suite.refusal ? lintOf(lintScript, nodeBinary) : {};
	if (lintScript && lint.command) controls.push(lintControl(requirementRefs, lintScript, lint.command));
	const mutation = suite.runner
		? mutationOutcome(projectPath, suite.runner, suite.control, requirementRefs, nodeBinary)
		: {};
	if (mutation.control) controls.push(mutation.control);
	// Nor is a quality referential offered then: the analysers its adoption would install could never be
	// declared, and a project that declares one itself would see it installed over its own.
	const analysers = suite.refusal ? null : analyserDeclaration(pkg, referentialPackages);
	if (analysers?.by === "495") controls.push(...qualityControls(requirementRefs, nodeBinary));
	const witnesses = witnessesOf(suite.runner ?? "node-test", projectPath);
	const measured =
		suite.runner && (suite.coverage?.control || mutation.control) ? moduleWitnesses(suite.runner, projectPath) : null;
	return {
		stack: "node",
		facts: { scripts: Object.keys(scripts), has_test_dir: existsSync(join(projectPath, "test")) },
		controls,
		lint_control_ids: [...(lint.command ? ["lint"] : []), ...(analysers?.by === "495" ? ["eslint", "jscpd"] : [])],
		positive_witness: { ...witnesses.positive, ...measured?.positive },
		witness_tests: measured ? 2 : 1,
		own_negative_witness: {
			...(suite.coverage?.control && measured ? { coverage: measured.uncovered } : {}),
			...(mutation.control && measured ? { mutation: measured.unasserted } : {}),
			...(analysers?.by === "495" ? QUALITY_NEGATIVE_WITNESSES : {}),
		},
		negative_witness: { ...witnesses.negative, ...LINT_NEGATIVE_WITNESS },
		preparation_paths: ["test/", "tests/"],
		capability_missing: suite.refusal
			? [suite.refusal]
			: [...(suite.coverage?.missing ?? []), ...(mutation.missing ?? []), ...(lint.refusal ? [lint.refusal] : [])],
		recommendations: [suite.coverage?.recommendation, mutation.recommendation].filter((r) => r !== undefined),
		...(analysers ? { quality_referential: qualityOffer(pkg, analysers) } : {}),
	};
}
