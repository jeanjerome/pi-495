/**
 * Designing the verification: what the target offers is detected, what no control can decide opens a
 * bounded preparation, the sensors are qualified, and G2 freezes the protocol.
 */
import type { RequirementRef } from "../../contracts/v1/evidence.ts";
import type { ControlCapabilityDiagnosis, RequirementsDocument } from "../../contracts/v1/protocol.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { preparationMandateObjective } from "../context.ts";
import { diagnoseControlCapability, referenceTestFiles } from "../preparation.ts";
import type { ReferenceSuiteObservation } from "../preparation.ts";
import { detectStack } from "../target.ts";
import type { StackDetection } from "../target.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/**
 * Opens the bounded preparation mandate the diagnosis calls for (SA-008). Two refused rounds are
 * enough: a third spends the same budget on the same gap, and the change stops on a missing
 * capability instead.
 */
export async function openPreparation(ctx: PhaseContext, unit: Unit, cor: string, detection: StackDetection, refs: RequirementRef[], diagnosis: ControlCapabilityDiagnosis): Promise<Unit> {
	const alreadyTried = (unit.state.proposals.preparation ?? []).filter((a) => a.artifact_id.startsWith("prep_")).length;
	if (alreadyTried >= 2) throw new DomainError("CAPABILITY_MISSING", `no discriminant test could be prepared after two preparation interventions: ${diagnosis.notes.join("; ")}`, { nextActions: ["prepare_capabilities", "assign_human_decision"] });
	const objective = preparationMandateObjective(detection.stack, detection.preparation_paths, diagnosis.undiscriminated_requirements);
	const mandate = { objective, allowed_paths: detection.preparation_paths, requirement_ids: refs.map((r) => r.requirement_id), stack: detection.stack };
	const ref = await ctx.artifacts.store("preparation", unit.state.change_id, ctx.id("prp"), { ...mandate, kind: "preparation-mandate", diagnosis }, KERNEL_ACTOR.actor_id);
	unit = ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
	return ctx.commit(unit, { type: "preparation.open", at: ctx.now(), actor: KERNEL_ACTOR, mandate_ref: ref }, cor);
}

export async function designVerification(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const reference = await ctx.artifacts.reference(unit.state);
	const requirements = await ctx.artifacts.latest<RequirementsDocument>(unit.state, "requirements");
	if (!requirements) throw new DomainError("EVIDENCE_MISSING", "requirements missing");
	const refs = requirements.content.requirements.map((r) => ({ requirement_id: r.requirement_id, revision: requirements.ref.revision }));
	const prepared = await ctx.artifacts.adoptedPreparation(unit.state);
	const handle = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
	try {
		const detection = detectStack(handle.path, refs);
		if (detection.controls.length === 0) throw new DomainError("CAPABILITY_MISSING", detection.capability_missing.join("; ") || "no control available", { nextActions: ["prepare_capabilities"] });
		const ordered = ctx.verification.orderOf(detection.controls);
		const diagnose = (suite: ReferenceSuiteObservation | null): ControlCapabilityDiagnosis => diagnoseControlCapability({ stack: detection.stack, test_files: referenceTestFiles(reference, detection.preparation_paths), requirements: requirements.content.requirements, suite, prepared });
		// What no existing control can decide is settled before any of them runs: the controls the
		// protocol may freeze are green on the reference, so none of them changes verdict when a
		// behaviour the reference does not have appears. Opening the preparation here spares the
		// qualification of sensors that would have to be qualified again after it.
		let diagnosis = diagnose(null);
		if (diagnosis.undiscriminated_requirements.length > 0 && detection.preparation_paths.length > 0) return await openPreparation(ctx, unit, cor, detection, refs, diagnosis);
		const qualified = await ctx.verification.qualify({ change_id: unit.state.change_id, reference, positive: handle, ordered, witnesses: { positive: detection.positive_witness, negative: detection.negative_witness, own_negative: detection.own_negative_witness, tests: detection.witness_tests }, prepared, requirement_refs: refs, prior_protocol_refs: unit.state.proposals.protocol ?? [] });
		diagnosis = diagnose(qualified.observation);
		if (diagnosis.undiscriminated_requirements.length > 0 && detection.preparation_paths.length > 0) return await openPreparation(ctx, unit, cor, detection, refs, diagnosis);
		// An analyser the target does not provide is an insufficiency the protocol records, not a
		// silence: a coverage measurement nobody produces never reads as covered code (QLT-02).
		if (detection.capability_missing.length > 0) diagnosis = { ...diagnosis, notes: [...diagnosis.notes, ...detection.capability_missing] };
		const protocol = ctx.verification.freeze({ change_id: unit.state.change_id, ordered, qualifications: qualified.qualifications, diagnosis, requirements: requirements.content, requirements_revision: requirements.ref.revision, prepared });
		const ref = await ctx.artifacts.store("protocol", unit.state.change_id, protocol.protocol_id, protocol, KERNEL_ACTOR.actor_id);
		unit = ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "protocol", ref }, cor);
		unit = ctx.commit(unit, { type: "gate.evaluate", gate: "G2", at: ctx.now(), actor: KERNEL_ACTOR, protocol_ref: ref, protocol }, cor);
		if (unit.state.gates.G2?.verdict !== "PASS") {
			const g2 = unit.state.gates.G2!;
			const unqualified = Object.entries(qualified.qualifications).filter(([, q]) => !q.qualified).map(([id, q]) => `${id}: ${q.notes.join(", ")}`);
			throw new DomainError("CAPABILITY_MISSING", `protocol not frozen: ${[...new Set([...g2.reasons, ...unqualified])].join("; ")}`, { nextActions: ["prepare_capabilities", "fix_reference_tests"] });
		}
		return unit;
	} finally {
		await ctx.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
}
