/**
 * The interface a technology implements (CMP-TGT): how it recognises a project, the readers of the reports
 * only it writes, and what it offers on that project, capability by capability. Each capability answers in
 * the same shape, and the common layer asks them and assembles the answers once for every technology.
 */
import type {
	ArchitectureMap,
	ControlDefinition,
	FileEdit,
	InstalledPackage,
	PackageInstall,
	QualityPerimeter,
	QualityRule,
	RecommendedComplement,
} from "../../contracts/v1/protocol.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import type { ReportReader } from "../../ports/execution.ts";
import type { ProjectView } from "./project-view.ts";

/** Files written into a copy, by path relative to it. */
export type WitnessFiles = Record<string, string>;

/**
 * What a capability is asked with: the model of the project its technology recognised, the copy read
 * through its view, the requirements its controls judge, the Node binary that runs a control spawning
 * nothing of its own, the packages the adopted install of the quality referential put in the copy, and the
 * architecture map the owner adopted, never read from the copy.
 */
export interface CapabilityQuestion<Model> {
	readonly model: Model;
	readonly view: ProjectView;
	readonly requirement_refs: RequirementRef[];
	readonly node_binary: string;
	readonly referential_packages: readonly InstalledPackage[];
	readonly architecture_map?: ArchitectureMap;
}

/**
 * What a technology offers of one capability on a project. Available, with its controls and the negative
 * witness of each control the shared one does not prove; `short_of` says what of the capability is still
 * not offered, as `missing` would. Missing, with the reason and the recommendation that would give it.
 * Refused, with its reason.
 */
export type Offer =
	| {
			kind: "available";
			controls: ControlDefinition[];
			own_negative_witness?: Record<string, WitnessFiles>;
			short_of?: string;
	  }
	| { kind: "missing"; reason: string; recommendation?: RecommendedComplement }
	| { kind: "refused"; reason: string };

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
 * How the rules of an adopted architecture map are verified on a project: the recommendation that declares
 * their analyser in a copy and resolves it; or the note that says why none is offered.
 */
export type ArchitectureOffer =
	| { kind: "proposed"; recommendation: RecommendedComplement }
	| { kind: "not_proposed"; note: string };

/** The suite of the project: the one capability every technology offers. */
export interface TestCapability<Model> {
	offer(question: CapabilityQuestion<Model>): Offer;
	/** A passing test, which qualifies every control on the positive side. */
	positiveWitness(question: CapabilityQuestion<Model>): WitnessFiles;
	/** A failing test, the defect every control shares on the negative side. */
	negativeWitness(question: CapabilityQuestion<Model>): WitnessFiles;
	/**
	 * A production module a test calls and asserts on in full, which a control judging only the introduced
	 * lines must let through; it may rewrite a file of the positive witness to add that one test case.
	 */
	measuredCodeWitness?(question: CapabilityQuestion<Model>): WitnessFiles;
	/** The directories a preparation intervention may add tests and test resources in. */
	preparationPaths(question: CapabilityQuestion<Model>): string[];
	/** Whether the file at `path` is named as one of its tests, which says nothing about it ever running. */
	isTestFile(path: string): boolean;
	/**
	 * For a test resource at `path`, the production resource a test may carry byte for byte; null for any other
	 * path. Absent when the technology lays out no test resource beside a production one.
	 */
	mirroredResource?(path: string): string | null;
}

/** What a technology calls a test file and the production resource a test resource may carry. */
export interface TestLayout {
	isTestFile(path: string): boolean;
	mirroredResource(path: string): string | null;
}

/** The coverage of the introduced lines. */
export interface CoverageCapability<Model> {
	offer(question: CapabilityQuestion<Model>): Offer;
}

/** Whether a test would notice a change to the introduced lines. */
export interface MutationCapability<Model> {
	offer(question: CapabilityQuestion<Model>): Offer;
}

/** The quality of the code, and the referential offered to the owner for it. */
export interface QualityCapability<Model> {
	offer(question: CapabilityQuestion<Model>): Offer;
	/** The quality referential offered for adoption, or why none is; absent when there is none to speak of. */
	referential?(question: CapabilityQuestion<Model>): QualityOffer | undefined;
}

/** The dependency direction between the modules of the project, and the packages an architecture map is checked against. */
export interface StructureCapability<Model> {
	offer(question: CapabilityQuestion<Model>): Offer;
	/**
	 * The packages the main sources of the project declare. A technology that reads them is one whose
	 * architecture a model may propose a map of; absent, none is proposed.
	 */
	packages?(question: CapabilityQuestion<Model>): string[];
	/** How the rules of the adopted map of the question are verified; absent when no map is adopted, or none is ever offered. */
	architecture?(question: CapabilityQuestion<Model>): ArchitectureOffer | undefined;
}

/**
 * What a technology puts into a copy that is not a change. `outputs` are what its tools write there, excluded
 * from the reference and from every candidate after those the owner's configuration declares.
 * `installed_dependencies` names the directory it installs dependencies in, at the root of the project or in
 * one of its packages: every control protects it, a candidate cannot add a file under it, and the integration
 * never indexes it. `env` names the variables of the session its controls and the producer that writes read,
 * beyond those every control reads. `versions` are the tools whose version enters the identity of the
 * environment, each with the command that prints it.
 */
export interface WorkspaceCapability {
	readonly outputs: readonly string[];
	readonly installed_dependencies?: string;
	readonly env?: readonly string[];
	readonly versions?: Readonly<Record<string, ToolProbe>>;
}

/** What installing a package comes to: the command to run in the copy, or why it cannot be run. */
export type InstallPlan = { kind: "command"; command: string[] } | { kind: "refused"; reason: string };

/** A copy of the target as an install can change it: each file by its digest, and the text of each file the inspection reads. */
export interface InstallState {
	readonly files: Readonly<Record<string, string>>;
	readonly texts: Readonly<Record<string, string>>;
}

/** What an install left: the files to keep with the packages that were added, or what keeps it from being accepted. */
export type InstallInspection =
	| { kind: "accepted"; files: string[]; packages: InstalledPackage[] }
	| { kind: "refused"; reason: string };

/**
 * What a package manager is asked offline before its step runs, so that the one directory it writes outside
 * the copy is the one it says, configuration of the machine and of the project applied. `read` gives the
 * directory the answer names, or null when it names none; `unsaid` says so in the reason the step fails with.
 * `kept` is declared when what the manager writes there stays after a refused integration: the directory is
 * then asked before the owner is, named to them, and the install is not run when it cannot be established,
 * for the reason `kept.unestablished` gives.
 */
export interface OutsideWriteQuery {
	readonly command: readonly string[];
	read(stdout: string): string | null;
	readonly unsaid: string;
	readonly kept?: { readonly unestablished: string };
}

/**
 * What a technology tells the owner its package manager does with the packages `names`, in one language. The
 * kernel composes these phrases with its own: the network open for that step alone, nothing written in the
 * project, the inspection before any adoption.
 */
export interface InstallPhrases {
	/** The adoption of a complement, in its label: what the manager does to the packages. */
	complementLabel(names: string): string;
	/** The adoption of a complement, in its effect: what 495 does with the manager in a copy of the project. */
	complementDoes(names: string): string;
	/** What the manager is kept from running while it brings the packages. */
	readonly runsNothing: string;
	/** For a manager whose writes outside the copy stay, what stays and where, the directory when it is known. */
	keptOutside?(directory: string | undefined): string;
	/** What the inspection accepts of the adoption of a complement. */
	readonly complementInspected: string;
	/** The adoption of a quality referential, in its label. */
	referentialLabel(names: string): string;
	/** The adoption of a quality referential, in its effect. */
	referentialDoes(names: string): string;
	/** What the inspection accepts of the adoption of a quality referential. */
	readonly referentialInspected: string;
	/** The adoption of the verification of an architecture map, for a manager that brings its analyser. */
	readonly architecture?: {
		/** In its label: what the manager does to the packages. */
		label(names: string): string;
		/** In its effect: what 495 does with the manager in a copy of the project, and where what it fetches is written. */
		does(names: string): string;
		/** What the inspection accepts of it. */
		readonly inspected: string;
	};
}

/**
 * How a technology brings the package of a complement into a copy of the target, with the package manager it
 * runs. `form` says what is kept: `install` installs in the copy and keeps the files the inspection accepts;
 * `resolve` resolves in a copy of its own and keeps only the file edit the recommendation describes. `plan`
 * decides from the files of the reference alone. `reads` are the files whose text `inspect` is given, before
 * and after the install, besides the digest of every file; `written` are the files 495 wrote into the copy
 * before the manager ran. `env` names the variables of the session the manager reads, by name and by a prefix
 * matched whatever its case, beyond those every control reads. `failure_output` is the stream the manager
 * says the cause of a failure on, and `keeps_output` asks for what it printed to be kept in the dossier.
 * `edit` is the rule a file edit the technology recommends is applied by, when it is not the replacement of
 * the one place the current value occurs. `title` names the manager as the owner reads it.
 */
export interface InstallCapability {
	readonly manager: string;
	readonly title: string;
	readonly form: "install" | "resolve";
	plan(files: readonly string[], installs: readonly PackageInstall[]): InstallPlan;
	readonly reads?: readonly string[];
	inspect(
		before: InstallState,
		after: InstallState,
		installs: readonly PackageInstall[],
		written: readonly { path: string; digest: string }[],
	): InstallInspection;
	readonly outside_write?: OutsideWriteQuery;
	readonly env: { readonly names: readonly string[]; readonly prefixes?: readonly string[] };
	readonly failure_output: "stdout" | "stderr";
	readonly keeps_output?: boolean;
	edit?(text: string, edit: FileEdit): string | null;
	readonly phrases: { readonly fr: InstallPhrases; readonly en: InstallPhrases };
}

/** A command that prints the version of a tool on the first line of its output: the program, then its arguments. */
export type ToolProbe = readonly [string, readonly string[]];

/**
 * A technology. `recognise` reads the project and returns the model its capabilities share, or null when
 * the project is not one of its own; `signal_files` name what it recognises a project by, when none does.
 * A capability it does not declare is one it does not offer.
 */
export interface StackPlugin<Model> {
	readonly id: string;
	readonly signal_files: readonly string[];
	recognise(view: ProjectView): Model | null;
	/** What the detection records of the project, for whoever reads it back. */
	facts?(question: CapabilityQuestion<Model>): Record<string, unknown>;
	/** The readers of the report formats only this technology writes. */
	readonly readers: readonly ReportReader[];
	readonly capabilities: {
		readonly tests: TestCapability<Model>;
		readonly coverage?: CoverageCapability<Model>;
		readonly mutation?: MutationCapability<Model>;
		readonly quality?: QualityCapability<Model>;
		readonly structure?: StructureCapability<Model>;
		readonly workspace?: WorkspaceCapability;
		readonly install?: InstallCapability;
	};
}
