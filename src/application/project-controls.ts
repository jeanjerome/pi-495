/**
 * The controls the profile declares for the target beside those its technology detects (CMP-VER): what a project
 * runs on itself before any change lands — a type check, its import rules, its own lints — built from the policy,
 * never from a file of the target nor from what an agent reports. A suite the technology detects is one control of
 * that contract, not the whole of it. Each is read through its exit code and required on the candidate by G5; it is
 * bound to no requirement, so it never stands for one, and, like the acceptance run, its command is the owner's, run
 * as declared rather than qualified on witnesses. The profile also names the test files that suite runs and the
 * directories of the copy each control may write, the other things it sets of the controls a target is judged by.
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
		writable_paths: withOwnerWritable(declared.control_id, declared.writable_paths ?? [], policy),
		protected_paths: declared.protected_paths,
	}));
}

/**
 * The writable paths of a control with the directories the owner gives it in the policy, each once. They are read
 * from the controller's configuration, never from the copy, so a candidate neither adds one nor widens one.
 */
function withOwnerWritable(controlId: string, writable: readonly string[], policy: ActivePolicy): string[] {
	return [...new Set([...writable, ...ownerWritableOf(controlId, policy)])];
}

/** The directories the owner gives the control `controlId` in the policy; none when it names no such key of its own. */
export function ownerWritableOf(controlId: string, policy: ActivePolicy): string[] {
	return Object.hasOwn(policy.writable_paths, controlId) ? (policy.writable_paths[controlId] ?? []) : [];
}

/**
 * The detection with its suite — the first control, which the common layer puts before the others — run on the test
 * files the profile names, appended to its command, and each detected control given the directories the profile
 * gives it. The scope is the owner's, read from the policy and never from a file of the target, so a producer that
 * rewrites the target's test script neither narrows what judges the requirements nor lengthens it: the whole tree of
 * a project whose tests launch a sandbox of their own fails or outlasts its delay inside the platform's sandbox, and
 * the profile keeps the suite to the tests that run there.
 */
export function withOwnerPaths(detection: DetectedTechnology, policy: ActivePolicy): DetectedTechnology {
	const [suite, ...others] = detection.controls;
	if (!suite) return detection;
	const scoped =
		policy.suite_paths.length === 0 ? suite : { ...suite, command: [...suite.command, ...policy.suite_paths] };
	return {
		...detection,
		controls: [scoped, ...others].map((control) => ({
			...control,
			writable_paths: withOwnerWritable(control.control_id, control.writable_paths, policy),
		})),
	};
}
