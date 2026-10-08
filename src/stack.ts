/**
 * The interface of a technology, as the package publishes it under `pi-495/stack` (CMP-TGT): what a technology
 * implements, the view of the project it reads, the shape of a report reader, the readers of the report formats
 * several technologies write, and the conformance test whoever writes a technology runs on projects of its own.
 * It opens no loading: the technologies 495 runs are the ones `extension/runtime.ts` mounts (D-86). The interface
 * follows the version of the package.
 */
export type {
	CapabilityQuestion,
	CoverageCapability,
	InstallCapability,
	InstallInspection,
	InstallPhrases,
	InstallPlan,
	InstallState,
	MutationCapability,
	Offer,
	OutsideWriteQuery,
	QualityCapability,
	QualityOffer,
	StackPlugin,
	StructureCapability,
	TestCapability,
	TestLayout,
	ToolProbe,
	WitnessFiles,
	WorkspaceCapability,
} from "./application/stacks/plugin.ts";
export type { ProjectEntry, ProjectView } from "./application/stacks/project-view.ts";
export type {
	IntroducedLines,
	ParsedFinding,
	ParsedReport,
	ProcessObservation,
	ReaderPreparation,
	ReaderRun,
	ReportDocument,
	ReportReader,
	ReportReading,
	SourceTree,
	WorkspaceFiles,
} from "./ports/execution.ts";
export type { RequirementRef } from "./contracts/v1/evidence.ts";
export type {
	ControlDefinition,
	FileEdit,
	InstalledPackage,
	PackageInstall,
	QualityPerimeter,
	QualityRule,
	RecommendedComplement,
} from "./contracts/v1/protocol.ts";
export { EXIT_CODE_READER, JUNIT_READER } from "./adapters/execution/parsers.ts";
export { lcovReader, type LcovSources, type SilencingRule } from "./adapters/execution/lcov.ts";
export {
	stackConformance,
	type ConformanceOptions,
	type ConformanceReport,
	type ControlConformance,
	type ProjectConformance,
	type ReaderConformance,
} from "./adapters/stacks/conformance.ts";
