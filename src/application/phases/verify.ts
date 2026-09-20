/**
 * Verifying: the frozen controls run on the frozen candidate, and their observations are recorded.
 */
import type { CandidateManifest } from "../../contracts/v1/candidate.ts";
import type { Protocol } from "../../contracts/v1/protocol.ts";
import { DomainError } from "../../domain/errors.ts";
import { EXECUTOR_ACTOR, KERNEL_ACTOR } from "../actors.ts";
import { type PhaseContext, type Unit } from "./phase.ts";

export async function verify(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const state = unit.state;
	if (!state.candidate || !state.protocol) throw new DomainError("PRECONDITION_FAILED", "candidate and protocol required");
	const protocol = await ctx.artifacts.latest<Protocol>(state, "protocol");
	const manifest = await ctx.artifacts.read<CandidateManifest>({ artifact_id: state.candidate.candidate_id, revision: 1 });
	if (!protocol) throw new DomainError("EVIDENCE_MISSING", "protocol document missing");
	const reference = await ctx.artifacts.reference(state);
	const opId = ctx.id("op");
	unit = ctx.commit(unit, { type: "verification.start", at: ctx.now(), actor: KERNEL_ACTOR, operation_id: opId, idempotency_key: `verify:${state.candidate.manifest_digest}:${state.evidence.length}` }, cor);
	const outcome = await ctx.verification.run({ change_id: state.change_id, protocol: protocol.content, protocol_ref: state.protocol.ref, candidate: state.candidate, manifest, reference, workspace_path: ctx.workspace.workspacePath(state.candidate.workspace_id) });
	if (outcome.candidate_moved) {
		unit = ctx.commit(unit, { type: "verification.complete", at: ctx.now(), actor: KERNEL_ACTOR, operation_id: opId }, cor);
		return ctx.commit(unit, { type: "change.block", at: ctx.now(), actor: KERNEL_ACTOR, reason: "execution_error", detail: "the frozen candidate was modified during verification; evidence not recorded" }, cor);
	}
	unit = ctx.commit(unit, { type: "verification.record", at: ctx.now(), actor: EXECUTOR_ACTOR, evidence: outcome.facts }, cor);
	return ctx.commit(unit, { type: "verification.complete", at: ctx.now(), actor: KERNEL_ACTOR, operation_id: opId }, cor);
}
