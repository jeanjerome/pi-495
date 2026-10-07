/**
 * What a target adapter answers with (CMP-TGT): the controls a stack offers, the witnesses
 * that qualify them, and what it could not give. One shape for every stack, so the kernel orders
 * and qualifies the controls of a Maven reactor and those of a Node package the same way.
 */
import type {
	ControlDefinition,
	InstalledPackage,
	QualityPerimeter,
	QualityRule,
	RecommendedComplement,
} from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import type { ReportReader } from "../../ports/execution.ts";

export interface StackDetection {
	/** The stack identifier its adapter declares, or `unknown` when no adapter recognises the project. */
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
	 * What the adapter recommends the target adds where a sensor it can read is missing. Data of the
	 * adapter, never of a model; recommending installs nothing and writes nothing in the target.
	 */
	recommendations: RecommendedComplement[];
	/** The quality referential the adapter offers the owner, or why it offers none; absent when it has none. */
	quality_referential?: QualityOffer;
}

/**
 * A quality referential offered for adoption, with what its analysers read and leave aside and the
 * recommendations that bring them into a copy of the target, one per analyser package; or the note that
 * says why none is offered, when the target configures that analyser itself and its own rules are not
 * 495's to replace.
 */
export type QualityOffer =
	| { kind: "proposed"; rules: QualityRule[]; perimeter: QualityPerimeter; recommendations: RecommendedComplement[] }
	| { kind: "not_proposed"; note: string };

/**
 * A technology, as the registry sees it: the identifier of its stack, the files at a project root
 * that signal it, the readers of the reports its controls write, and the detection it answers with.
 * Adding a technology is one directory that declares its adapter, and the list of technologies the
 * composition root hands the kernel. `referentialPackages` are the packages the adopted install of the
 * quality referential put in the copy at `projectPath`, as its lock names them; empty anywhere else, so
 * a manifest alone never stands for that install.
 */
export interface StackAdapter {
	stack: string;
	signal_files: readonly string[];
	/** The readers of the report formats only this technology writes; those several technologies write are common to all of them. */
	readers: readonly ReportReader[];
	detect(
		projectPath: string,
		requirementRefs: RequirementRef[],
		nodeBinary: string,
		referentialPackages: readonly InstalledPackage[],
	): StackDetection;
}

/** Environment a control is allowed to read. Nothing of the session leaks into a measurement. */
export const BASE_ENV = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "JAVA_HOME", "MAVEN_OPTS"];

/** What a control of any stack declares unless it says otherwise; each adapter extends it with what it runs and reads. */
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
