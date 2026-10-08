/**
 * The technology recognised on a copy, as the kernel asks it (CMP-TGT): the controls it offers, the witnesses
 * that qualify them, and what it could not give, assembled once by the common layer. One shape for every
 * technology, so the kernel orders and qualifies the controls of a Maven reactor and those of a Node package
 * the same way.
 */
import type { ControlDefinition, RecommendedComplement } from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import type { ArchitectureOffer, QualityOffer } from "./plugin.ts";

export interface DetectedTechnology {
	/** The identifier its technology declares, or `unknown` when no technology recognises the project. */
	stack: string;
	facts: Record<string, unknown>;
	controls: ControlDefinition[];
	/** The controls that judge the style of the code: a quality or lint requirement is judged by them, and no other requirement is. */
	lint_control_ids: string[];
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
	 * What the technology recommends the target adds where a sensor it can read is missing. Data of the
	 * technology, never of a model; recommending installs nothing and writes nothing in the target.
	 */
	recommendations: RecommendedComplement[];
	/** The quality referential the technology offers the owner, or why it offers none; absent when it has none. */
	quality_referential?: QualityOffer;
	/** The packages the main sources declare, when the technology reads them: an architecture map may then be proposed. */
	main_packages?: string[];
	/** How the rules of the adopted architecture map are verified, or why they are not; absent when no map was given. */
	architecture_verification?: ArchitectureOffer;
}

/**
 * Environment every control is allowed to read; a technology adds the variables it declares. Nothing else of
 * the session leaks into a measurement.
 */
export const BASE_ENV = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"];

/** What a control of any stack declares unless it says otherwise; each technology extends it with what it runs and reads. */
export function baseControl(
	requirementRefs: RequirementRef[],
): Pick<
	ControlDefinition,
	| "version"
	| "cwd"
	| "env_allowlist"
	| "env"
	| "structure_rules"
	| "requires"
	| "scope_argument"
	| "network"
	| "writable_paths"
	| "requirement_refs"
	| "protected"
> {
	return {
		version: "1",
		cwd: ".",
		env_allowlist: BASE_ENV,
		env: {},
		structure_rules: [],
		requires: [],
		scope_argument: null,
		network: "denied",
		writable_paths: [],
		requirement_refs: requirementRefs,
		protected: true,
	};
}

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
