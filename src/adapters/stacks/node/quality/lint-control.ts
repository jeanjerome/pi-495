/** The control a declared `scripts.lint` becomes, refused rather than guessed when it needs a shell. */
import type { ControlDefinition } from "../../../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../../../contracts/v1/evidence.ts";
import { baseControl } from "../../../../application/stacks/stack.ts";
import { SHELL_SYNTAX } from "../shared.ts";

/**
 * The argv of `scripts.lint` split on whitespace, `node` replaced by the Node binary, or why there is
 * none: a script with shell syntax needs a shell, which the sandbox does not give.
 */
export function lintOf(script: string, nodeBinary: string): { command?: string[]; refusal?: string } {
	if (SHELL_SYNTAX.test(script))
		return { refusal: `scripts.lint chains commands through a shell (${script}), which 495 cannot run` };
	const parts = script.trim().split(/\s+/);
	return { command: parts[0] === "node" ? [nodeBinary, ...parts.slice(1)] : parts };
}

/** `npm run lint` as its argv, read through its exit code. */
export function lintControl(
	requirementRefs: RequirementRef[],
	lintScript: string,
	command: string[],
): ControlDefinition {
	return {
		...baseControl(requirementRefs),
		control_id: "lint",
		title: `npm run lint (${lintScript})`,
		command,
		timeout_ms: 5 * 60_000,
		parser: "exit-code",
		report_path: null,
		provides: [],
		protected_paths: ["scripts/lint.js", "eslint.config.js", ".eslintrc.json", "package.json"],
	};
}
