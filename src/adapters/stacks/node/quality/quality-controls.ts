/**
 * The quality of a Node target: the control its own `scripts.lint` becomes, the ESLint and jscpd controls that
 * apply the adopted quality referential to the package, with their witnesses, and the referential offered to
 * the owner (QLT-01).
 */
import { RULESET_PLACEHOLDER, type ControlDefinition, type QualityRule } from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import type { QualityCapability } from "../../../../application/stacks/plugin.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import type { NodeProject } from "../project/node-project.ts";
import { lintControl, lintOf } from "./lint-control.ts";
import { analyserDeclaration, NODE_QUALITY_REFERENTIAL, qualityOffer } from "./quality-referential.ts";
import { QUALITY_NEGATIVE_WITNESSES } from "./quality-witnesses.ts";
import { REPORT_DIRECTORY } from "../shared.ts";

/** Where ESLint writes its JSON report, and where jscpd writes its own. */
const ESLINT_REPORT_PATH = `${REPORT_DIRECTORY}/495-eslint.json`;
const JSCPD_OUTPUT = `${REPORT_DIRECTORY}/495-jscpd`;

/** The source formats jscpd is given: JavaScript and TypeScript, with and without JSX. */
const JSCPD_FORMATS = "javascript,jsx,typescript,tsx";

/** The ESLint rules of the referential as its `--rule` option takes them: each at error, with the options its threshold needs. */
function eslintRules(rules: readonly QualityRule[]): string {
	const entries = rules.flatMap((rule) => {
		if (rule.reference === null) return [];
		const options = Object.entries(rule.properties).map(([name, value]) => [name, Number(value)] as const);
		return [[rule.reference, options.length === 0 ? "error" : ["error", Object.fromEntries(options)]] as const];
	});
	return JSON.stringify(Object.fromEntries(entries));
}

/**
 * The controls of the referential, once it was installed in the copy they run in: one per analyser, each
 * run from the copy's `node_modules` and never from the host's PATH, with the network closed, applying the
 * rules of the referential it is the oracle of. ESLint looks up no configuration and is given its rules on
 * its command line; jscpd reads the configuration the runner writes from the frozen rules instead of a
 * `.jscpd.json` of the tree, ignores what a `.gitignore` leaves out, and reads JavaScript and TypeScript
 * outside `node_modules/` only.
 */
function qualityControls(requirementRefs: RequirementRef[], nodeBinary: string): ControlDefinition[] {
	const rulesOf = (controlId: string) => NODE_QUALITY_REFERENTIAL.filter((rule) => rule.control_id === controlId);
	const control = (
		controlId: "eslint" | "jscpd",
		title: string,
		command: string[],
		reportPath: string,
	): ControlDefinition => ({
		...baseControl(requirementRefs),
		control_id: controlId,
		title,
		command: [nodeBinary, ...command],
		timeout_ms: 10 * 60_000,
		parser: controlId === "eslint" ? "eslint-json" : "jscpd-json",
		report_path: reportPath,
		quality_rules: rulesOf(controlId),
		provides: [],
		writable_paths: [REPORT_DIRECTORY],
		protected_paths: ["package.json", "node_modules/"],
	});
	return [
		control(
			"eslint",
			"violations of the frozen quality rules, read from the ESLint report",
			[
				"node_modules/eslint/bin/eslint.js",
				"--no-config-lookup",
				"--rule",
				eslintRules(rulesOf("eslint")),
				// A package with no JavaScript file is one ESLint has nothing to read in, not a failure to read it.
				"--no-error-on-unmatched-pattern",
				"--format",
				"json",
				"--output-file",
				ESLINT_REPORT_PATH,
				".",
			],
			ESLINT_REPORT_PATH,
		),
		control(
			"jscpd",
			"duplicated blocks, read from the jscpd report",
			[
				"node_modules/jscpd/run-jscpd.js",
				"--config",
				RULESET_PLACEHOLDER,
				"--format",
				JSCPD_FORMATS,
				"--ignore",
				"**/node_modules/**",
				"--no-gitignore",
				"--reporters",
				"json",
				"--output",
				JSCPD_OUTPUT,
				"--silent",
				".",
			],
			`${JSCPD_OUTPUT}/jscpd-report.json`,
		),
	];
}

export const NODE_QUALITY: QualityCapability<NodeProject> = {
	offer({ model, requirement_refs, node_binary, referential_packages }) {
		const lintScript = model.manifest.scripts?.lint;
		const lint = typeof lintScript === "string" ? lintOf(lintScript, node_binary) : {};
		const analysers = analyserDeclaration(model.manifest, referential_packages);
		const controls = [
			...(typeof lintScript === "string" && lint.command
				? [lintControl(requirement_refs, lintScript, lint.command)]
				: []),
			...(analysers.by === "495" ? qualityControls(requirement_refs, node_binary) : []),
		];
		if (controls.length > 0)
			return {
				kind: "available",
				controls,
				...(analysers.by === "495" ? { own_negative_witness: QUALITY_NEGATIVE_WITNESSES } : {}),
				...(lint.refusal ? { short_of: lint.refusal } : {}),
			};
		if (lint.refusal) return { kind: "refused", reason: lint.refusal };
		return {
			kind: "missing",
			reason: "no lint script is declared and no quality referential is adopted in this copy (QLT-01)",
		};
	},
	referential: ({ model, referential_packages }) =>
		qualityOffer(model.manifest, analyserDeclaration(model.manifest, referential_packages)),
};
