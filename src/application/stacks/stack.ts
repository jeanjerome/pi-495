/**
 * What a target adapter answers with (CMP-TGT, ADR-012): the controls a stack offers, the witnesses
 * that qualify them, and what it could not give. One shape for every stack, so the kernel orders
 * and qualifies the controls of a Maven reactor and those of a Node package the same way.
 */
import type { ControlDefinition } from "../../contracts/v1/protocol.ts";

export interface StackDetection {
	stack: "node" | "maven" | "unknown";
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
}

/** Environment a control is allowed to read. Nothing of the session leaks into a measurement. */
export const BASE_ENV = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "JAVA_HOME", "MAVEN_OPTS"];
