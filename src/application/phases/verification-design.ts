/**
 * Designing the verification: what the target offers is detected, what no control can decide opens a
 * bounded preparation, the sensors are qualified, and G2 freezes the protocol.
 */
import type { ArtifactRef, SubjectRef } from "../../contracts/v1/common.ts";
import type { ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import { digestValue } from "../../contracts/digest.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import type {
	AdoptedComplement,
	ControlCapabilityDiagnosis,
	InstalledPackage,
	RecommendedComplement,
	RequirementsDocument,
} from "../../contracts/v1/protocol.ts";
import { surveysTheProject, type HumanDecisionEntry } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { applyRecommendedEdits, editedFile } from "../complement.ts";
import type { Adoptable } from "../decisions.ts";
import { bringInstalls, filesOf, installableRecommendations, type FailedInstall } from "../installation.ts";
import { preparationMandateObjective } from "../context.ts";
import { diagnoseControlCapability, referenceTestFiles } from "../preparation.ts";
import type { PreparationRecord, ReferenceSuiteObservation } from "../preparation.ts";
import type { DetectedTechnology } from "../stacks/stack.ts";
import { failedInstalls, recordFailedInstall, recordResolution } from "./install-records.ts";
import { settleArchitectureMap } from "./architecture-map.ts";
import { settleQualityReferential } from "./quality-referential.ts";
import type { PhaseContext, Unit } from "./phase.ts";
import { reviseRequirements } from "./requirements-revision.ts";

/**
 * How many preparations the owner granted beyond the two 495 spends by itself. A revision of the
 * requirements revokes the answers given before it, so only those that concern the requirements as
 * they stand are counted.
 */
function preparationsGranted(unit: Unit): number {
	return unit.state.human_decisions.filter((d) => d.valid && d.interaction === "IH-04" && d.option_id === "prepare")
		.length;
}

/**
 * What an answer to the question of a requirement no control can judge holds for: these requirements,
 * as they stand at this revision. The digest binds the set the owner was asked about, so a
 * requirement that only turns out to be unjudged later is not covered by an answer that never named it.
 */
export function arbitrationSubject(requirements: ArtifactRef, undiscriminated: readonly string[]): SubjectRef {
	return {
		kind: "artifact",
		id: requirements.artifact_id,
		revision: requirements.revision,
		digest: digestValue({ requirements: requirements.content_digest, undiscriminated: [...undiscriminated].sort() }),
	};
}

/**
 * The requirements the owner took on: those a valid "assign_review" answer holds for. The owner
 * judges them at the acceptance of the candidate, so no control has to.
 */
export function requirementsTakenByOwner(
	decisions: readonly HumanDecisionEntry[],
	requirements: ArtifactRef,
	undiscriminated: readonly string[],
): string[] {
	return answerHeld(decisions, "assign_review", requirements, undiscriminated) ? [...undiscriminated] : [];
}

/** The valid answer of that option given to the question asked about exactly these requirements. */
function answerHeld(
	decisions: readonly HumanDecisionEntry[],
	option: string,
	requirements: ArtifactRef,
	undiscriminated: readonly string[],
): HumanDecisionEntry | null {
	const held = arbitrationSubject(requirements, undiscriminated).digest;
	return (
		decisions.find(
			(d) => d.valid && d.interaction === "IH-04" && d.option_id === option && d.subject.digest === held,
		) ?? null
	);
}

/** A valid answer "adopt_complement" holds until the requirements are revised, which revokes it with the others. */
function complementAdopted(decisions: readonly HumanDecisionEntry[]): boolean {
	return decisions.some((d) => d.valid && d.interaction === "IH-04" && d.option_id === "adopt_complement");
}

function recommendationFact(r: RecommendedComplement): string {
	return `recommended ${r.test_type} complement, not adopted: ${r.tool} ${r.version} (established ${r.established_on}, source ${r.source}); ${r.change}`;
}

/**
 * Puts to the owner a requirement no control can judge once the preparations 495 may spend on it are
 * spent: another preparation, or the requirement judged by the owner. The decision is bound to the
 * requirements revision it was asked on, so a revision asks it again.
 */
function requestVerifiabilityArbitration(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: ArtifactRef,
	diagnosis: ControlCapabilityDiagnosis,
	recommendations: readonly RecommendedComplement[],
	adoptable: Adoptable,
): Promise<Unit> {
	const named = diagnosis.undiscriminated_requirements.join(", ");
	const subject = arbitrationSubject(requirements, diagnosis.undiscriminated_requirements);
	const risk = `risk: without a control able to judge ${named}, no measurement tells whether the change delivers it, and a candidate that does not is not detected by any check`;
	return ctx.requestDecision(unit, cor, {
		interaction: "IH-04",
		subject,
		facts: [...diagnosis.notes, ...recommendations.map(recommendationFact), risk],
		recommendation: null,
		arg: named,
		language: ctx.language(unit.state),
		adoptable,
	});
}

/**
 * Opens the bounded preparation mandate the diagnosis calls for (SA-008). Two refused rounds are
 * enough: a third spends the same budget on the same gap, and the owner is asked what to do instead.
 * Each answer "prepare" to that question grants one round more. The rounds are counted for the
 * requirements as they stand: the change rebuilt after a revocation, or the requirements the owner
 * had rewritten, prepare for requirements of their own (DEC-06).
 */
async function openPreparation(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	detection: DetectedTechnology,
	requirements: ArtifactRef,
	refs: RequirementRef[],
	diagnosis: ControlCapabilityDiagnosis,
	adoptable: Adoptable,
	complements: readonly AdoptedComplement[],
): Promise<Unit> {
	const alreadyTried = ctx.artifacts
		.preparationsForCurrentRequirements(unit.state)
		.filter((a) => a.artifact_id.startsWith("prep_")).length;
	const granted = preparationsGranted(unit);
	if (alreadyTried >= 2 + granted)
		return requestVerifiabilityArbitration(
			ctx,
			unit,
			cor,
			requirements,
			diagnosis,
			detection.recommendations,
			adoptable,
		);
	const objective = preparationMandateObjective(
		detection.stack,
		detection.preparation_paths,
		diagnosis.undiscriminated_requirements,
	);
	const mandate = {
		objective,
		allowed_paths: detection.preparation_paths,
		requirement_ids: refs.map((r) => r.requirement_id),
		stack: detection.stack,
	};
	const ref = await ctx.artifacts.store(
		"preparation",
		unit.state.change_id,
		ctx.id("prp"),
		{ ...mandate, kind: "preparation-mandate", diagnosis, ...(complements.length > 0 ? { complements } : {}) },
		KERNEL_ACTOR.actor_id,
	);
	unit = ctx.commit(
		unit,
		{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "preparation", ref },
		cor,
	);
	return ctx.commit(unit, { type: "preparation.open", at: ctx.now(), actor: KERNEL_ACTOR, mandate_ref: ref }, cor);
}

/** What the owner's adoption of installs came to in the copy: what was kept, and what failed. */
interface InstallAdoption {
	unit: Unit;
	complements: AdoptedComplement[];
	packages: InstalledPackage[];
	failed: FailedInstall[];
	/** The recommendations resolved in a copy of their own, whose file edit the adoption applies. */
	resolved: RecommendedComplement[];
}

/**
 * Runs the install of each recommendation the owner adopted in the copy, with the manager of its
 * technology, and keeps what the inspection accepts. An install that fails or is refused adopts nothing:
 * the reason is written in the dossier for these requirements, so the install is not run again and the
 * adoption is not offered again.
 */
async function adoptInstalls(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: ArtifactRef,
	reference: ReferenceSnapshot,
	copyPath: string,
	installable: readonly RecommendedComplement[],
): Promise<InstallAdoption> {
	const adoption: InstallAdoption = { unit, complements: [], packages: [], failed: [], resolved: [] };
	for (const r of installable) {
		const installer = r.install === undefined ? null : ctx.stacks.installerOf(r.install.manager);
		if (r.install === undefined || installer === null) continue;
		const resolves = installer.install.form === "resolve";
		ctx.progress(
			`${resolves ? "resolving" : "installing"} ${r.install.package}@${r.install.version} in a copy, network open for that step alone`,
		);
		const result = await bringInstalls(ctx, installer, reference, copyPath, [r.install], r.edit);
		if (result.kind === "failed") {
			adoption.unit = await recordFailedInstall(ctx, adoption.unit, cor, requirements, {
				install: r.install,
				reason: result.reason,
			});
			return {
				...adoption,
				complements: [],
				packages: [],
				resolved: [],
				failed: [{ install: r.install, reason: result.reason }],
			};
		}
		if (result.output !== undefined)
			adoption.unit = await recordResolution(ctx, adoption.unit, cor, r.install, result.output);
		if (resolves) {
			adoption.resolved.push(r);
			continue;
		}
		adoption.complements.push(...result.files.map((f) => ({ ...f, test_type: r.test_type, tool: r.tool })));
		adoption.packages.push(...result.packages);
	}
	return adoption;
}

/**
 * The directory each manager of `recommendations` that keeps what it writes outside a copy said it writes,
 * asked of the copy at `copyPath` before anything changes it; a manager that said none is left out.
 */
async function keptDirectories(
	ctx: PhaseContext,
	copyPath: string,
	recommendations: readonly RecommendedComplement[],
): Promise<Record<string, string>> {
	const directories: Record<string, string> = {};
	for (const manager of new Set(recommendations.flatMap((r) => (r.install ? [r.install.manager] : [])))) {
		const install = ctx.stacks.installerOf(manager)?.install;
		if (install?.outside_write?.kept === undefined) continue;
		const directory = await ctx.outsideDirectory(copyPath, install);
		if (directory !== null) directories[manager] = directory;
	}
	return directories;
}

/** Whether the edit of `r` is applied by the adoption: it installs nothing, or what it installs was resolved. */
function editApplied(ctx: PhaseContext, r: RecommendedComplement, adoption: InstallAdoption): boolean {
	if (r.install === undefined) return true;
	return ctx.stacks.installerOf(r.install.manager)?.install.form !== "resolve" || adoption.resolved.includes(r);
}

/**
 * What the controls the target offers can decide of the requirements: before the suite has run on the
 * reference when `suite` is null, from what it reported after.
 */
function diagnose(
	detection: DetectedTechnology,
	requirements: RequirementsDocument,
	reference: ReferenceSnapshot,
	isTestFile: (path: string) => boolean,
	prepared: PreparationRecord | null,
	suite: ReferenceSuiteObservation | null,
): ControlCapabilityDiagnosis {
	return diagnoseControlCapability({
		stack: detection.stack,
		test_files: referenceTestFiles(reference, detection.preparation_paths, isTestFile),
		requirements: requirements.requirements,
		suite,
		prepared,
	});
}

/** The requirements no control can judge that the owner took on, as the requirements stand. */
function takenByOwner(requirements: ArtifactRef, unit: Unit, diagnosis: ControlCapabilityDiagnosis): string[] {
	return requirementsTakenByOwner(unit.state.human_decisions, requirements, diagnosis.undiscriminated_requirements);
}

/**
 * A requirement no control can judge opens a preparation when the target has room for one and the
 * owner did not take it on. A survey opens none: it measures the project as it stands, and writes
 * nothing into it.
 */
function needsPreparation(
	detection: DetectedTechnology,
	requirements: ArtifactRef,
	unit: Unit,
	diagnosis: ControlCapabilityDiagnosis,
): boolean {
	return (
		!surveysTheProject(unit.state) &&
		diagnosis.undiscriminated_requirements.length > 0 &&
		detection.preparation_paths.length > 0 &&
		takenByOwner(requirements, unit, diagnosis).length === 0
	);
}

/** Settles the requirements no control can judge: revised when the owner asked for it, otherwise by a preparation. */
function settleUnjudged(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	reference: ReferenceSnapshot,
	detection: DetectedTechnology,
	requirements: ArtifactRef,
	refs: RequirementRef[],
	diagnosis: ControlCapabilityDiagnosis,
	adoptable: Adoptable,
	complements: readonly AdoptedComplement[],
): Promise<Unit> {
	// The owner asked for these requirements to be revised: no preparation is spent on wording they
	// have already refused to keep.
	const revision = answerHeld(
		unit.state.human_decisions,
		"revise",
		requirements,
		diagnosis.undiscriminated_requirements,
	);
	return revision
		? reviseRequirements(ctx, unit, cor, reference, diagnosis.undiscriminated_requirements, revision.free_text)
		: openPreparation(ctx, unit, cor, detection, requirements, refs, diagnosis, adoptable, complements);
}

export async function designVerification(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const reference = await ctx.artifacts.reference(unit.state);
	const requirements = await ctx.artifacts.latest<RequirementsDocument>(unit.state, "requirements");
	if (!requirements) throw new DomainError("EVIDENCE_MISSING", "requirements missing");
	const refs = requirements.content.requirements.map((r) => ({
		requirement_id: r.requirement_id,
		revision: requirements.ref.revision,
	}));
	const prepared = await ctx.artifacts.adoptedPreparation(unit.state);
	const handle = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
	try {
		let detection = ctx.stacks.recognise(handle.path, refs);
		const { isTestFile } = ctx.stacks.testLayoutOf(handle.path);
		// A survey puts the quality referential its target proposes to the owner before anything runs: the
		// analyser it adopts is a control the protocol freezes like the others.
		const quality = surveysTheProject(unit.state)
			? await settleQualityReferential(ctx, unit, cor, requirements, reference, handle.path, detection)
			: null;
		if (quality?.kind === "asked") return quality.unit;
		if (quality) unit = quality.unit;
		// The map of the architecture is asked of a model and put to the owner before anything runs too.
		const architecture = surveysTheProject(unit.state)
			? await settleArchitectureMap(ctx, unit, cor, requirements, reference, detection, handle.path)
			: null;
		if (architecture?.kind === "stopped") return architecture.unit;
		if (architecture) unit = architecture.unit;
		const referenceFiles = filesOf(reference);
		let failed = await failedInstalls(ctx, unit, requirements.ref);
		const installerOf = (manager: string) => ctx.stacks.installerOf(manager);
		const outside = await keptDirectories(ctx, handle.path, detection.recommendations);
		const adoption = complementAdopted(unit.state.human_decisions)
			? await adoptInstalls(
					ctx,
					unit,
					cor,
					requirements.ref,
					reference,
					handle.path,
					installableRecommendations(referenceFiles, detection.recommendations, failed, installerOf, outside)
						.installable,
				)
			: null;
		if (adoption !== null) {
			unit = adoption.unit;
			failed = adoption.failed.length > 0 ? await failedInstalls(ctx, unit, requirements.ref) : failed;
		}
		// The edit is written into this copy alone: the detection that follows reads the sensor the edit
		// asks for, and the project stays as it is until the candidate that carries the edit is integrated.
		const editRule = ctx.stacks.editRuleOf(handle.path);
		const complements = [
			...(quality?.complements ?? []),
			...(architecture?.kind === "settled" ? (architecture.complements ?? []) : []),
			...(adoption?.complements ?? []),
			...(adoption !== null
				? applyRecommendedEdits(
						handle.path,
						detection.recommendations.filter((r) => editApplied(ctx, r, adoption)),
						editRule,
					)
				: []),
		];
		const installed = [...(quality?.packages ?? []), ...(adoption?.packages ?? [])];
		if (complements.length > 0) {
			await ctx.artifacts.ensureBytes(handle.path, complements);
			detection = ctx.stacks.recognise(handle.path, refs, process.execPath, quality?.packages, architecture?.map?.map);
		}
		if (detection.controls.length === 0)
			throw new DomainError("CAPABILITY_MISSING", detection.capability_missing.join("; ") || "no control available", {
				nextActions: ["cancel"],
			});
		const offered = installableRecommendations(referenceFiles, detection.recommendations, failed, installerOf, outside);
		detection = { ...detection, recommendations: offered.recommendations };
		const adoptable: Adoptable = {
			files: detection.recommendations.flatMap((r) =>
				r.edit &&
				(r.install === undefined || offered.installable.includes(r)) &&
				editedFile(handle.path, r.edit, editRule) !== null
					? [r.edit.path]
					: [],
			),
			installs: offered.installable.flatMap((r) => (r.install ? [r.install] : [])),
			...(Object.keys(outside).length > 0 ? { outside_directories: outside } : {}),
		};
		const ordered = ctx.verification.orderOf(detection.controls);
		// What no existing control can decide is settled before any of them runs: the controls the
		// protocol may freeze are green on the reference, so none of them changes verdict when a
		// behaviour the reference does not have appears. Opening the preparation here spares the
		// qualification of sensors that would have to be qualified again after it.
		let diagnosis = diagnose(detection, requirements.content, reference, isTestFile, prepared, null);
		if (needsPreparation(detection, requirements.ref, unit, diagnosis))
			return await settleUnjudged(
				ctx,
				unit,
				cor,
				reference,
				detection,
				requirements.ref,
				refs,
				diagnosis,
				adoptable,
				complements,
			);
		const qualified = await ctx.verification.qualify({
			change_id: unit.state.change_id,
			reference,
			positive: handle,
			ordered,
			witnesses: {
				positive: detection.positive_witness,
				negative: detection.negative_witness,
				own_negative: detection.own_negative_witness,
				reference_positive: detection.reference_positive ?? [],
				tests: detection.witness_tests,
			},
			requirement_refs: refs,
			prior_protocol_refs: unit.state.proposals.protocol ?? [],
			complements,
		});
		diagnosis = diagnose(detection, requirements.content, reference, isTestFile, prepared, qualified.observation);
		if (needsPreparation(detection, requirements.ref, unit, diagnosis))
			return await settleUnjudged(
				ctx,
				unit,
				cor,
				reference,
				detection,
				requirements.ref,
				refs,
				diagnosis,
				adoptable,
				complements,
			);
		// An analyser the target does not provide is an insufficiency the protocol records, not a
		// silence: a coverage measurement nobody produces never reads as covered code (QLT-02).
		if (detection.capability_missing.length > 0)
			diagnosis = { ...diagnosis, notes: [...diagnosis.notes, ...detection.capability_missing] };
		const protocol = ctx.verification.freeze({
			change_id: unit.state.change_id,
			ordered,
			lint_control_ids: detection.lint_control_ids,
			qualifications: qualified.qualifications,
			diagnosis,
			requirements: requirements.content,
			requirements_revision: requirements.ref.revision,
			prepared,
			assigned_to_human: takenByOwner(requirements.ref, unit, diagnosis),
			recommendations: detection.recommendations,
			complements,
			installed,
			by_nature: surveysTheProject(unit.state),
			installed_dependencies: reference.installed_dependencies,
			...(quality?.referential ? { quality_referential: quality.referential } : {}),
			...(quality?.blind_spot ? { quality_blind_spot: quality.blind_spot } : {}),
			...(architecture?.blind_spot ? { architecture_blind_spot: architecture.blind_spot } : {}),
			...(architecture?.map ? { architecture_map: architecture.map } : {}),
		});
		const ref = await ctx.artifacts.store(
			"protocol",
			unit.state.change_id,
			protocol.protocol_id,
			protocol,
			KERNEL_ACTOR.actor_id,
		);
		unit = ctx.commit(
			unit,
			{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "protocol", ref },
			cor,
		);
		unit = ctx.commit(
			unit,
			{ type: "gate.evaluate", gate: "G2", at: ctx.now(), actor: KERNEL_ACTOR, protocol_ref: ref, protocol },
			cor,
		);
		if (unit.state.gates.G2?.verdict !== "PASS") {
			const g2 = unit.state.gates.G2!;
			const unqualified = Object.entries(qualified.qualifications)
				.filter(([, q]) => !q.qualified)
				.map(([id, q]) => `${id}: ${q.notes.join(", ")}`);
			throw new DomainError(
				"CAPABILITY_MISSING",
				`protocol not frozen: ${[...new Set([...g2.reasons, ...unqualified])].join("; ")}`,
				{ nextActions: ["cancel"] },
			);
		}
		return unit;
	} finally {
		await ctx.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
}
