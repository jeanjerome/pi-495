/**
 * Reviewing: each required reviewer role reads the candidate and records its conclusion.
 */
import type { CandidateManifest } from "../../contracts/v1/candidate.ts";
import type { ReviewReport } from "../../contracts/v1/reports.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { reviewObjective } from "../context.ts";
import { type PhaseContext, type Unit } from "./phase.ts";

export async function review(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const state = unit.state;
	if (!state.candidate || !state.protocol) throw new DomainError("PRECONDITION_FAILED", "candidate and protocol required");
	const workspacePath = ctx.workspace.workspacePath(state.candidate.workspace_id);
	for (const role of state.protocol.required_reviews) {
		if (state.reviews.some((r) => r.valid && r.reviewer_role === role && r.subject_digest === state.candidate!.manifest_digest)) continue;
		const manifest = await ctx.artifacts.read<CandidateManifest>({ artifact_id: state.candidate.candidate_id, revision: 1 });
		const r = await ctx.runIntervention(unit, cor, "review", reviewObjective(role, manifest.selected_paths), workspacePath, { adopted: ["mandate", "requirements", "design"] });
		unit = r.unit;
		const report = r.result === "completed" && r.output_valid ? (r.output as ReviewReport) : null;
		const reviewId = ctx.id("rev");
		await ctx.artifacts.store("review", unit.state.change_id, reviewId, report ?? { invalid: true, result: r.result }, r.intervention_id);
		if (!report) continue;
		unit = ctx.commit(unit, { type: "review.record", at: ctx.now(), actor: { actor_id: r.intervention_id, actor_type: "agent", role: "reviewer_agent", origin: "model_output", authentication_level: "none" }, review_id: reviewId, reviewer_role: role, subject_digest: state.candidate.manifest_digest, conclusion: report.conclusion, blocking_findings: report.findings.filter((f) => f.severity === "blocker").length }, cor);
	}
	return ctx.commit(unit, { type: "review.complete", at: ctx.now(), actor: KERNEL_ACTOR }, cor);
}
