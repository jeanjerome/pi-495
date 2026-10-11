/**
 * The controls the profile declares for the target beside those its technology detects (CMP-VER): what a project
 * runs on itself before any change lands — a type check, its import rules, its own lints — built from the policy,
 * never from a file of the target nor from what an agent reports. A suite the technology detects is one control of
 * that contract, not the whole of it. Each is read through its exit code and required on the candidate by G5; it is
 * bound to no requirement, so it never stands for one, and, like the acceptance run, its command is the owner's, run
 * as declared rather than qualified on witnesses. The profile also names the test files that suite runs, the one
 * other thing it sets of the controls a target is judged by.
 */
import type { ControlDefinition } from "../contracts/v1/protocol.ts";
import type { ActivePolicy } from "../domain/policy.ts";
import { baseControl, type DetectedTechnology } from "./stacks/stack.ts";

/** The declared controls, in the order the profile declares them. */
export function projectControlsOf(policy: ActivePolicy): ControlDefinition[] {
	return policy.project_controls.map((declared) => ({
		...baseControl([]),
		control_id: declared.control_id,
		title: declared.title,
		command: declared.command,
		timeout_ms: declared.timeout_ms,
		parser: "exit-code",
		report_path: null,
		provides: declared.provides ?? [],
		requires: declared.requires ?? [],
		network: declared.network ?? "denied",
		writable_paths: declared.writable_paths ?? [],
		protected_paths: declared.protected_paths,
	}));
}

/**
 * The detection with its suite — the first control, which the common layer puts before the others — run on the test
 * files the profile names, appended to its command. The scope is the owner's, read from the policy and never from a
 * file of the target, so a producer that rewrites the target's test script neither narrows what judges the
 * requirements nor lengthens it: the whole tree of a project whose tests launch a sandbox of their own fails or
 * outlasts its delay inside the platform's sandbox, and the profile keeps the suite to the tests that run there.
 */
export function withSuitePaths(detection: DetectedTechnology, policy: ActivePolicy): DetectedTechnology {
	const [suite, ...others] = detection.controls;
	if (!suite || policy.suite_paths.length === 0) return detection;
	return { ...detection, controls: [{ ...suite, command: [...suite.command, ...policy.suite_paths] }, ...others] };
}
