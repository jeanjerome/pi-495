/**
 * Integrating: the accepted candidate is applied locally, once a human has authorized it.
 */
import type { SubjectRef } from "../../contracts/v1/common.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { type PhaseContext, type Unit } from "./phase.ts";

export async function integrate(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	if (!ctx.policy.integration_enabled) return ctx.commit(unit, { type: "change.block", at: ctx.now(), actor: KERNEL_ACTOR, reason: "policy_denied", detail: "integration is disabled by policy" }, cor);
	if (!unit.state.integration_authorization_id) {
		const subject: SubjectRef = { kind: "candidate", id: unit.state.candidate!.candidate_id, revision: 1, digest: unit.state.candidate!.manifest_digest };
		return ctx.requestDecision(unit, cor, "IH-11", subject, [], "integrate", "the project branch", undefined, ctx.language(unit.state));
	}
	if (!ctx.integrator) return ctx.commit(unit, { type: "change.block", at: ctx.now(), actor: KERNEL_ACTOR, reason: "capability_missing", detail: "no Git integrator configured" }, cor);
	return ctx.integrator(unit, cor);
}
