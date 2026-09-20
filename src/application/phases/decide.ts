/**
 * Deciding: G5 reads the evidence, and what it refuses either goes back to a producer with bounded
 * feedback or stops on a human decision.
 */
import { digestBytes } from "../../contracts/digest.ts";
import type { SubjectRef } from "../../contracts/v1/common.ts";
import { retryCanDiffer } from "../../domain/baseline.ts";
import { subjectOfChange } from "../../domain/change/state.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { buildFeedback } from "../context.ts";
import type { PhaseContext, Unit } from "./phase.ts";

export async function correctOrStop(ctx: PhaseContext, unit: Unit, cor: string, why: string): Promise<Unit> {
	const state = unit.state;
	const feedback = await buildFeedback(state, why, ctx.feedbackSources());
	const attemptId = ctx.id("att");
	const current = state.attempts.at(-1);
	if (current) await ctx.artifacts.store("feedback", state.change_id, `fb_${current.attempt_id}`, feedback.text, KERNEL_ACTOR.actor_id);
	const next = ctx.commit(unit, { type: "correction.authorize", at: ctx.now(), actor: KERNEL_ACTOR, attempt_id: attemptId, feedback: { digest: digestBytes(feedback.text), bytes: feedback.bytes, truncated: feedback.truncated } }, cor);
	if (next.state.status === "blocked" && next.state.stop_reason === "attempts_exhausted") {
		return ctx.requestDecision(next, cor, "IH-07", subjectOfChange(next.state), [why], "stop", `${next.state.budgets.attempts_used}/${next.state.budgets.max_attempts}`, undefined, ctx.language(next.state));
	}
	return next;
}

export async function decide(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const g4 = unit.state.gates.G4;
	if (g4 && g4.verdict === "FAIL" && !unit.state.gates.G5) {
		return correctOrStop(ctx, unit, cor, `G4 failed: ${g4.reasons.join("; ")}`);
	}
	unit = ctx.commit(unit, { type: "gate.evaluate", gate: "G5", at: ctx.now(), actor: KERNEL_ACTOR, decision_id: null }, cor);
	const g5 = unit.state.gates.G5!;
	if (g5.verdict === "PASS") return unit;
	const language = ctx.language(unit.state);
	const subject: SubjectRef = { kind: "candidate", id: unit.state.candidate!.candidate_id, revision: 1, digest: unit.state.candidate!.manifest_digest };
	if (g5.next_action === "request_decision:IH-10") return ctx.requestDecision(unit, cor, "IH-10", subject, g5.reasons, null, undefined, undefined, language);
	if (g5.next_action === "request_decision:IH-08") return ctx.requestDecision(unit, cor, "IH-08", subject, g5.reasons, null, undefined, undefined, language);
	if (g5.next_action === "resolve_incident") {
		// Re-running a frozen candidate through a frozen protocol is a pure function: it can only
		// answer differently when the last observation was a transient incident. Anything else is
		// a property of the candidate, and spending the retry budget on it proves nothing.
		if (!retryCanDiffer(ctx.indeterminateObservations(unit.state))) {
			return correctOrStop(ctx, unit, cor, `${g5.reasons.join("; ")} — re-running the frozen candidate cannot change this observation`);
		}
		const key = `verify:${unit.state.candidate!.manifest_digest}`;
		const retried = ctx.commit(unit, { type: "operation.fail", at: ctx.now(), actor: KERNEL_ACTOR, operation_key: key }, cor);
		if (retried.state.status === "blocked") return retried;
		return ctx.commit(retried, { type: "verification.rerun", at: ctx.now(), actor: KERNEL_ACTOR, reason: `indeterminate controls: ${g5.indeterminate_requirements.join(", ")} (technical retry)` }, cor);
	}
	return correctOrStop(ctx, unit, cor, g5.reasons.join("; "));
}
