/**
 * Preparing: a bounded intervention writes the tests no existing control can replace, and the kernel
 * judges them on the bare reference before adopting any of them.
 */
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { preparationObjective } from "../context.ts";
import { preparedFilesFrom, samePreparationPaths } from "../preparation.ts";
import type { PreparationRecord } from "../preparation.ts";
import { detectStack } from "../target.ts";
import type { StackDetection } from "../target.ts";
import { type PhaseContext, type Unit } from "./phase.ts";

/** Preparation intervention, then kernel qualification of the proposed tests (SA-008, SA-009, PRE-03). */
export async function prepare(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const reference = await ctx.artifacts.reference(unit.state);
	const mandateArt = await ctx.artifacts.latest<{ objective: string; allowed_paths: string[]; requirement_ids: string[]; stack: StackDetection["stack"] }>(unit.state, "preparation");
	if (!mandateArt) throw new DomainError("EVIDENCE_MISSING", "preparation mandate missing");
	const mandate = mandateArt.content;
	const previousRef = [...(unit.state.proposals.preparation ?? [])].reverse().find((ref) => ref.artifact_id.startsWith("prep_"));
	const previous = previousRef ? await ctx.artifacts.read<PreparationRecord>(previousRef) : null;
	const feedback = previous ? `The previous preparation was refused. Keep every change inside the allowed paths.\n${previous.notes.map((note) => `- ${note}`).join("\n")}` : null;
	const handle = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
	try {
		const detected = detectStack(handle.path, mandate.requirement_ids.map((id) => ({ requirement_id: id, revision: 1 })));
		if (detected.stack !== mandate.stack || !samePreparationPaths(mandate.allowed_paths, detected.preparation_paths)) {
			const record: PreparationRecord = { preparation_id: ctx.id("prc"), objective: mandate.objective, allowed_paths: mandate.allowed_paths, files: [], on_reference: "NOT_RUN", discriminant: false, loadable: false, qualified: false, notes: [`preparation mandate scope is stale; detected ${detected.stack} paths: ${detected.preparation_paths.join(", ") || "none"}`] };
			const ref = await ctx.artifacts.store("preparation", unit.state.change_id, record.preparation_id, record, KERNEL_ACTOR.actor_id);
			unit = ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
			return ctx.commit(unit, { type: "preparation.close", at: ctx.now(), actor: KERNEL_ACTOR, qualified: false, capability_ids: [], adopted_ref: null }, cor);
		}
		const r = await ctx.runIntervention(unit, cor, "prepare", preparationObjective(mandate.objective, mandate.requirement_ids), handle.path, { adopted: ["mandate", "requirements"], feedback });
		unit = r.unit;
		if (unit.state.status === "blocked") return unit;
		const notes: string[] = [];
		if (r.result !== "completed") notes.push(`preparation intervention ${r.result}`);
		const manifest = await ctx.workspace.snapshotCandidate(handle, reference, ctx.workspacePolicy);
		const { files, out_of_scope } = preparedFilesFrom(manifest, mandate.allowed_paths);
		for (const p of out_of_scope) notes.push(`change outside the preparation mandate refused: ${p}`);
		if (files.length === 0) notes.push("no test file was produced");
		// loadability and discriminance against the bare reference
		let onReference: PreparationRecord["on_reference"] = "NOT_RUN";
		let loadable = false;
		const sensor = detected.controls[0];
		if (files.length > 0 && sensor) {
			const judged = await ctx.verification.judgePreparedSuite({ control: sensor, reference, manifest, workspace_id: handle.workspace_id, workspace_path: handle.path });
			onReference = judged.on_reference;
			loadable = judged.loadable;
			notes.push(...judged.notes);
		}
		await ctx.artifacts.ensureBytes(handle.path, files);
		const discriminant = onReference === "FAIL";
		if (!discriminant && onReference === "PASS") notes.push("prepared suite passes on the reference: it does not detect the absent feature (recorded, not adopted as discriminant)");
		const qualified = out_of_scope.length === 0 && files.length > 0 && loadable && discriminant;
		const record: PreparationRecord = { preparation_id: ctx.id("prep"), objective: mandate.objective, allowed_paths: mandate.allowed_paths, files, on_reference: onReference, discriminant, loadable, qualified, notes };
		const ref = await ctx.artifacts.store("preparation", unit.state.change_id, record.preparation_id, record, KERNEL_ACTOR.actor_id);
		unit = ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "preparation", ref }, cor);
		return ctx.commit(unit, { type: "preparation.close", at: ctx.now(), actor: KERNEL_ACTOR, qualified, capability_ids: files.map((f) => f.path), adopted_ref: qualified ? ref : null }, cor);
	} finally {
		await ctx.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
}
