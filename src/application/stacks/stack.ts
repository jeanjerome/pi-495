/**
 * What a target adapter answers with (CMP-TGT, ADR-012): the controls a stack offers, the witnesses
 * that qualify them, and what it could not give. One shape for every stack, so the kernel orders
 * and qualifies the controls of a Maven reactor and those of a Node package the same way.
 */
import type { ControlDefinition, RecommendedComplement } from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";

export interface StackDetection {
	/** The stack identifier its adapter declares, or `unknown` when no adapter recognises the project. */
	stack: string;
	facts: Record<string, unknown>;
	controls: ControlDefinition[];
	/** Files written into a copy of the reference to build the positive witness (a passing test exercising the runner). */
	positive_witness: Record<string, string>;
	/** Test cases the positive witness adds to the suite; they say nothing about what the reference itself covers. */
	witness_tests: number;
	/** Files written into a copy of the positive workspace to build the negative witness. */
	negative_witness: Record<string, string>;
	/**
	 * Negative witness of one control when the shared one does not exhibit the defect it claims to
	 * detect. A test control is proved by a failing test; a coverage control cannot be — a failing
	 * suite stops the build before the measurement is written, and an unexercised line is not a
	 * failure. Such a control gets its own witness workspace, built on the positive one.
	 */
	own_negative_witness: Record<string, Record<string, string>>;
	/** Explicit directories in which a preparation intervention may add tests and test resources. */
	preparation_paths: string[];
	capability_missing: string[];
	/**
	 * What the adapter recommends the target adds where a sensor it can read is missing. Data of the
	 * adapter, never of a model; recommending installs nothing and writes nothing in the target.
	 */
	recommendations: RecommendedComplement[];
}

/**
 * A technology, as the registry sees it: the identifier of its stack, the files at a project root
 * that signal it, and the detection it answers with. Adding a technology is one module that
 * declares its adapter and one line in the list of `target.ts`.
 */
export interface StackAdapter {
	stack: string;
	signal_files: readonly string[];
	detect(projectPath: string, requirementRefs: RequirementRef[], nodeBinary: string): StackDetection;
}

/** Environment a control is allowed to read. Nothing of the session leaks into a measurement. */
export const BASE_ENV = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "JAVA_HOME", "MAVEN_OPTS"];

/**
 * The command of a control that runs nothing: its parser reads a report another control left, or
 * the code itself. Spawning the Node binary on an empty program keeps one runner for every control.
 */
export function emptyTrigger(nodeBinary: string): string[] {
	return [nodeBinary, "-e", ""];
}

/** Whether a control's command is the empty trigger, so the producer is not asked to run it. */
export function runsNothing(command: readonly string[]): boolean {
	return command.length === 3 && command[1] === "-e" && command[2] === "";
}
