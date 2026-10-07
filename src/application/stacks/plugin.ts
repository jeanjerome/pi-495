/**
 * The interface a technology implements (CMP-TGT): how it recognises a project, the readers of the reports
 * only it writes, and what it offers on that project, capability by capability. Each capability answers in
 * the same shape, and the common layer asks them and assembles the answers once for every technology.
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
import type { ProjectView } from "./project-view.ts";

/** Files written into a copy, by path relative to it. */
export type WitnessFiles = Record<string, string>;

/**
 * What a capability is asked with: the model of the project its technology recognised, the copy read
 * through its view, the requirements its controls judge, the Node binary that runs a control spawning
 * nothing of its own, and the packages the adopted install of the quality referential put in the copy.
 */
export interface CapabilityQuestion<Model> {
	readonly model: Model;
	readonly view: ProjectView;
	readonly requirement_refs: RequirementRef[];
	readonly node_binary: string;
	readonly referential_packages: readonly InstalledPackage[];
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

/** The dependency direction between the modules of the project. */
export interface StructureCapability<Model> {
	offer(question: CapabilityQuestion<Model>): Offer;
}

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
	};
}
