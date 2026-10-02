/**
 * Deciding: G5 reads the evidence, and what it refuses either goes back to a producer with bounded
 * feedback or stops on a human decision.
 */
import { digestBytes } from "../../contracts/digest.ts";
import type { SubjectRef } from "../../contracts/v1/common.ts";
import { retryCanDiffer } from "../../domain/baseline.ts";
import { surveysTheProject } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { buildFeedback } from "../context.ts";
import { requestBudgetExtensionIfExhausted, type PhaseContext, type Unit } from "./phase.ts";
import { judgeSurvey } from "./survey.ts";

async function correctOrStop(ctx: PhaseContext, unit: Unit, cor: string, why: string): Promise<Unit> {
	const state = unit.state;
	const feedback = await buildFeedback(state, why, ctx.feedbackSources());
	const attemptId = ctx.id("att");
	const current = state.attempts.at(-1);
	if (current)
		await ctx.artifacts.store(
			"feedback",
			state.change_id,
			`fb_${current.attempt_id}`,
			feedback.text,
			KERNEL_ACTOR.actor_id,
		);
	const next = ctx.commit(
		unit,
		{
			type: "correction.authorize",
			at: ctx.now(),
			actor: KERNEL_ACTOR,
			attempt_id: attemptId,
			feedback: { digest: digestBytes(feedback.text), bytes: feedback.bytes, truncated: feedback.truncated },
		},
		cor,
	);
	return requestBudgetExtensionIfExhausted(ctx, next, cor, [why]);
}

export async function decide(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	if (surveysTheProject(unit.state)) return judgeSurvey(ctx, unit, cor);
	const g4 = unit.state.gates.G4;
	if (g4 && g4.verdict === "FAIL" && !unit.state.gates.G5) {
		return correctOrStop(ctx, unit, cor, `G4 failed: ${g4.reasons.join("; ")}`);
	}
	unit = ctx.commit(
		unit,
		{ type: "gate.evaluate", gate: "G5", at: ctx.now(), actor: KERNEL_ACTOR, decision_id: null },
		cor,
	);
	const g5 = unit.state.gates.G5!;
	if (g5.verdict === "PASS") return unit;
	const candidate = unit.state.candidate;
	if (!candidate) throw new DomainError("PRECONDITION_FAILED", "candidate required");
	const language = ctx.language(unit.state);
	const subject: SubjectRef = {
		kind: "candidate",
		id: candidate.candidate_id,
		revision: 1,
		digest: candidate.manifest_digest,
	};
	if (g5.next_action === "request_decision:IH-10")
		return ctx.requestDecision(unit, cor, {
			interaction: "IH-10",
			subject,
			facts: g5.reasons,
			recommendation: null,
			language,
		});
	if (g5.next_action === "request_decision:IH-08")
		return ctx.requestDecision(unit, cor, {
			interaction: "IH-08",
			subject,
			facts: g5.reasons,
			recommendation: null,
			language,
		});
	if (g5.next_action === "resolve_incident") {
		// Re-running a frozen candidate through a frozen protocol is a pure function: it can only
		// answer differently when the last observation was a transient incident. Anything else is
		// a property of the candidate, and spending the retry budget on it proves nothing.
		if (!retryCanDiffer(ctx.indeterminateObservations(unit.state))) {
			return correctOrStop(
				ctx,
				unit,
				cor,
				`${g5.reasons.join("; ")} — re-running the frozen candidate cannot change this observation`,
			);
		}
		const key = `verify:${candidate.manifest_digest}`;
		const retried = ctx.commit(
			unit,
			{ type: "operation.fail", at: ctx.now(), actor: KERNEL_ACTOR, operation_key: key },
			cor,
		);
		if (retried.state.status === "blocked") return retried;
		return ctx.commit(
			retried,
			{
				type: "verification.rerun",
				at: ctx.now(),
				actor: KERNEL_ACTOR,
				reason: `indeterminate controls: ${g5.indeterminate_requirements.join(", ")} (technical retry)`,
			},
			cor,
		);
	}
	return correctOrStop(ctx, unit, cor, g5.reasons.join("; "));
}
