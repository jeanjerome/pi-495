/**
 * Implementing: a producer works in an isolated workspace, and the candidate it leaves is frozen with
 * what it changed and what it touched of the protected paths.
 */
import type { Mandate } from "../../contracts/v1/protocol.ts";
import type { ProducerReport } from "../../contracts/v1/reports.ts";
import { protectedPathsChanged } from "../../domain/gates/g4.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { implementObjective, resumeNote } from "../context.ts";
import { mirrorsProductionResource } from "../target.ts";
import { type PhaseContext, type Unit } from "./phase.ts";

export async function implement(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const reference = await ctx.artifacts.reference(unit.state);
	const open = unit.state.attempts.find((a) => a.result === "open");
	const attemptId = open?.attempt_id ?? ctx.id("att");
	const opened = await ctx.artifacts.workspaceOfAttempt(unit.state.change_id, attemptId);
	let workspaceId: string;
	let workspacePath: string;
	if (opened) {
		workspaceId = opened.workspace_id;
		workspacePath = opened.path;
	} else {
		const h = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
		workspaceId = h.workspace_id;
		workspacePath = h.path;
		await ctx.artifacts.materializePrepared(await ctx.artifacts.adoptedPreparation(unit.state), h.path);
		await ctx.artifacts.store("candidate", unit.state.change_id, `ws_${attemptId}`, { workspace_id: h.workspace_id, path: h.path }, KERNEL_ACTOR.actor_id);
	}
	const lastFeedback = unit.state.feedback.at(-1);
	const priorFeedback = lastFeedback ? await ctx.artifacts.read<string>({ artifact_id: `fb_${lastFeedback.attempt_id}`, revision: 1 }).catch(() => null) : null;
	const truncatedBefore = unit.state.interventions.filter((i) => i.attempt_id === attemptId && i.result === "truncated").length;
	const resume = resumeNote(truncatedBefore);
	const feedback = [resume, priorFeedback].filter((x): x is string => Boolean(x)).join("\n\n") || null;
	const mandate = await ctx.artifacts.latest<Mandate>(unit.state, "mandate");
	const objective = implementObjective(mandate?.content.objective ?? null);
	const r = await ctx.runIntervention(unit, cor, "implement", objective, workspacePath, { adopted: ["mandate", "requirements", "protocol", "design"], feedback, attempt_id: attemptId });
	unit = r.unit;
	if (unit.state.status === "blocked") return unit;
	if (r.result === "cancelled") return ctx.commit(unit, { type: "change.block", at: ctx.now(), actor: KERNEL_ACTOR, reason: "execution_error", detail: "producer intervention cancelled" }, cor);
	if (r.result === "truncated" && truncatedBefore < ctx.policy.budgets.max_continuations) {
		// The attempt stays open on its workspace: the next step resumes there instead of
		// rebuilding from the reference, which would throw away everything just written.
		ctx.progress(`producer resumes on workspace ${workspaceId} (continuation ${truncatedBefore + 1}/${ctx.policy.budgets.max_continuations}); the increment budget still bounds the whole change`);
		return unit;
	}
	if (r.result === "failed") {
		const failed = ctx.commit(unit, { type: "operation.fail", at: ctx.now(), actor: KERNEL_ACTOR, operation_key: `intervention:${attemptId}` }, cor);
		return failed;
	}
	ctx.progress("freezing the candidate");
	const wsHandle = { workspace_id: workspaceId, path: workspacePath, reference_id: reference.reference_id, created_at: ctx.now() };
	const manifest = await ctx.workspace.snapshotCandidate(wsHandle, reference, ctx.workspacePolicy);
	const manifestRef = await ctx.artifacts.store("candidate", unit.state.change_id, manifest.candidate_id, manifest, KERNEL_ACTOR.actor_id);
	// Keep the bytes of every changed file so that the dossier stays self-contained (EVD-01), and
	// keep them on both sides: without the reference text of a file the candidate modified, the
	// lines this change introduced could not be recomputed from the dossier alone (QLT-04).
	const changed = manifest.entries.filter((e) => e.kind === "file" && e.content_digest !== null && e.baseline_state !== "unchanged");
	// The reference side is read from the project the snapshot was taken from, and only for the paths
	// that snapshot holds as files: a path that became a symlink has no reference text to diff.
	const referenceFiles = new Set(reference.entries.filter((e) => e.kind === "file" && e.content_digest !== null).map((e) => e.path));
	const files = await ctx.artifacts.storeBytesOf(workspacePath, changed.filter((e) => e.baseline_state !== "deleted").map((e) => e.path));
	const baseFiles = await ctx.artifacts.storeBytesOf(reference.project_path, changed.filter((e) => e.baseline_state !== "added" && referenceFiles.has(e.path)).map((e) => e.path));
	await ctx.artifacts.store("candidate", unit.state.change_id, `files_${manifest.candidate_id}`, files, KERNEL_ACTOR.actor_id);
	await ctx.artifacts.store("candidate", unit.state.change_id, `base_files_${manifest.candidate_id}`, baseFiles, KERNEL_ACTOR.actor_id);
	unit = ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "candidate", ref: manifestRef }, cor);
	const prepared = await ctx.artifacts.adoptedPreparation(unit.state);
	const scope = protectedPathsChanged(manifest, unit.state.protocol?.protected_paths ?? [], prepared?.files ?? [], (p) => mirrorsProductionResource(manifest, p));
	const producerReport = r.output_valid ? (r.output as ProducerReport) : null;
	const truncatedNote = r.result === "truncated" ? [`the producer was stopped by the duration budget ${truncatedBefore + 1} time(s) and never reported itself finished`] : [];
	unit = ctx.commit(unit, { type: "candidate.freeze", at: ctx.now(), actor: KERNEL_ACTOR, attempt_id: attemptId, facts: { candidate: { candidate_id: manifest.candidate_id, manifest_digest: manifest.manifest_digest, base_digest: manifest.base_digest, workspace_id: wsHandle.workspace_id }, entry_count: manifest.entries.length, changed_paths: scope.changed, out_of_scope_paths: [], altered_protected_paths: scope.altered, allowed_protected_paths: scope.allowed, complete: !manifest.limits.truncated, limits_notes: [...manifest.limits.notes, ...truncatedNote, ...(producerReport ? [] : ["producer output invalid or missing"])] } }, cor);
	return unit;
}
