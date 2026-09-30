/**
 * Designing the verification: what the target offers is detected, what no control can decide opens a
 * bounded preparation, the sensors are qualified, and G2 freezes the protocol.
 */
import type { ArtifactRef, SubjectRef } from "../../contracts/v1/common.ts";
import { digestValue } from "../../contracts/digest.ts";
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import type {
	ControlCapabilityDiagnosis,
	RecommendedComplement,
	RequirementsDocument,
} from "../../contracts/v1/protocol.ts";
import type { HumanDecisionEntry } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { preparationMandateObjective } from "../context.ts";
import { diagnoseControlCapability, referenceTestFiles } from "../preparation.ts";
import type { ReferenceSuiteObservation } from "../preparation.ts";
import { detectStack } from "../target.ts";
import type { StackDetection } from "../target.ts";
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
): Promise<Unit> {
	const named = diagnosis.undiscriminated_requirements.join(", ");
	const subject = arbitrationSubject(requirements, diagnosis.undiscriminated_requirements);
	const risk = `risk: without a control able to judge ${named}, no measurement tells whether the change delivers it, and a candidate that does not is not detected by any check`;
	return ctx.requestDecision(
		unit,
		cor,
		"IH-04",
		subject,
		[...diagnosis.notes, ...recommendations.map(recommendationFact), risk],
		null,
		named,
		undefined,
		ctx.language(unit.state),
	);
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
	detection: StackDetection,
	requirements: ArtifactRef,
	refs: RequirementRef[],
	diagnosis: ControlCapabilityDiagnosis,
): Promise<Unit> {
	const alreadyTried = ctx.artifacts
		.preparationsForCurrentRequirements(unit.state)
		.filter((a) => a.artifact_id.startsWith("prep_")).length;
	const granted = preparationsGranted(unit);
	if (alreadyTried >= 2 + granted)
		return requestVerifiabilityArbitration(ctx, unit, cor, requirements, diagnosis, detection.recommendations);
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
		{ ...mandate, kind: "preparation-mandate", diagnosis },
		KERNEL_ACTOR.actor_id,
	);
	unit = ctx.commit(
		unit,
		{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "preparation", ref },
		cor,
	);
	return ctx.commit(unit, { type: "preparation.open", at: ctx.now(), actor: KERNEL_ACTOR, mandate_ref: ref }, cor);
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
		const detection = detectStack(handle.path, refs);
		if (detection.controls.length === 0)
			throw new DomainError("CAPABILITY_MISSING", detection.capability_missing.join("; ") || "no control available", {
				nextActions: ["cancel"],
			});
		const ordered = ctx.verification.orderOf(detection.controls);
		const diagnose = (suite: ReferenceSuiteObservation | null): ControlCapabilityDiagnosis =>
			diagnoseControlCapability({
				stack: detection.stack,
				test_files: referenceTestFiles(reference, detection.preparation_paths),
				requirements: requirements.content.requirements,
				suite,
				prepared,
			});
		const takenByOwner = (d: ControlCapabilityDiagnosis): string[] =>
			requirementsTakenByOwner(unit.state.human_decisions, requirements.ref, d.undiscriminated_requirements);
		// The owner asked for these requirements to be revised: no preparation is spent on wording they
		// have already refused to keep.
		const settleUnjudged = (d: ControlCapabilityDiagnosis): Promise<Unit> => {
			const revision = answerHeld(
				unit.state.human_decisions,
				"revise",
				requirements.ref,
				d.undiscriminated_requirements,
			);
			return revision
				? reviseRequirements(ctx, unit, cor, reference, d.undiscriminated_requirements, revision.free_text)
				: openPreparation(ctx, unit, cor, detection, requirements.ref, refs, d);
		};
		const needsPreparation = (d: ControlCapabilityDiagnosis): boolean =>
			d.undiscriminated_requirements.length > 0 &&
			detection.preparation_paths.length > 0 &&
			takenByOwner(d).length === 0;
		// What no existing control can decide is settled before any of them runs: the controls the
		// protocol may freeze are green on the reference, so none of them changes verdict when a
		// behaviour the reference does not have appears. Opening the preparation here spares the
		// qualification of sensors that would have to be qualified again after it.
		let diagnosis = diagnose(null);
		if (needsPreparation(diagnosis)) return await settleUnjudged(diagnosis);
		const qualified = await ctx.verification.qualify({
			change_id: unit.state.change_id,
			reference,
			positive: handle,
			ordered,
			witnesses: {
				positive: detection.positive_witness,
				negative: detection.negative_witness,
				own_negative: detection.own_negative_witness,
				tests: detection.witness_tests,
			},
			requirement_refs: refs,
			prior_protocol_refs: unit.state.proposals.protocol ?? [],
		});
		diagnosis = diagnose(qualified.observation);
		if (needsPreparation(diagnosis)) return await settleUnjudged(diagnosis);
		// An analyser the target does not provide is an insufficiency the protocol records, not a
		// silence: a coverage measurement nobody produces never reads as covered code (QLT-02).
		if (detection.capability_missing.length > 0)
			diagnosis = { ...diagnosis, notes: [...diagnosis.notes, ...detection.capability_missing] };
		const protocol = ctx.verification.freeze({
			change_id: unit.state.change_id,
			ordered,
			qualifications: qualified.qualifications,
			diagnosis,
			requirements: requirements.content,
			requirements_revision: requirements.ref.revision,
			prepared,
			assigned_to_human: takenByOwner(diagnosis),
			recommendations: detection.recommendations,
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
