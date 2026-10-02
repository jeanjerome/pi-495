/**
 * Surveying: a change whose deliverable is the state of the project runs the frozen controls on a
 * copy of the reference, ties what they measured to the requirements, and G5 judges that survey.
 * No candidate is written and no intervention is opened.
 */
import type { Protocol } from "../../contracts/v1/protocol.ts";
import { DomainError } from "../../domain/errors.ts";
import { surveyFacts, surveyOf, type Survey } from "../../domain/survey.ts";
import { EXECUTOR_ACTOR, KERNEL_ACTOR } from "../actors.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/** Runs every frozen control on the reference, records the evidence, and proposes the survey it gives. */
export async function surveyReference(
	ctx: Omit<PhaseContext, "runIntervention">,
	unit: Unit,
	cor: string,
): Promise<Unit> {
	const state = unit.state;
	if (!state.protocol) throw new DomainError("PRECONDITION_FAILED", "protocol required");
	const protocol = await ctx.artifacts.latest<Protocol>(state, "protocol");
	if (!protocol) throw new DomainError("EVIDENCE_MISSING", "protocol document missing");
	const reference = await ctx.artifacts.reference(state);
	const opId = ctx.id("op");
	unit = ctx.commit(
		unit,
		{
			type: "verification.start",
			at: ctx.now(),
			actor: KERNEL_ACTOR,
			operation_id: opId,
			idempotency_key: `survey:${state.reference.digest}:${state.revision}`,
		},
		cor,
	);
	const passes = await ctx.verification.surveyReference({
		change_id: state.change_id,
		protocol: protocol.content,
		protocol_ref: state.protocol.ref,
		reference,
	});
	unit = ctx.commit(
		unit,
		{ type: "verification.record", at: ctx.now(), actor: EXECUTOR_ACTOR, evidence: passes.map((p) => p.fact) },
		cor,
	);
	const survey = surveyOf({
		change_id: state.change_id,
		reference_digest: state.reference.digest,
		protocol_revision: state.protocol.ref.revision,
		protocol: protocol.content,
		passes: passes.map((p) => ({ ...p.fact, findings: p.findings })),
	});
	const ref = await ctx.artifacts.store("survey", state.change_id, ctx.id("srv"), survey, KERNEL_ACTOR.actor_id);
	unit = ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "survey", ref }, cor);
	return ctx.commit(
		unit,
		{ type: "verification.complete", at: ctx.now(), actor: KERNEL_ACTOR, operation_id: opId },
		cor,
	);
}

/**
 * G5 judges the survey last proposed, and puts it in front of the owner, who accepts or refuses it;
 * the kernel stops the change on what the survey cannot conclude.
 */
export async function judgeSurvey(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const survey = await ctx.artifacts.latest<Survey>(unit.state, "survey");
	if (!survey) throw new DomainError("EVIDENCE_MISSING", "no survey of the reference");
	unit = ctx.commit(
		unit,
		{
			type: "gate.evaluate",
			gate: "G5",
			at: ctx.now(),
			actor: KERNEL_ACTOR,
			decision_id: null,
			survey: { ref: survey.ref, content: survey.content },
		},
		cor,
	);
	if (unit.state.gates.G5?.next_action !== "request_decision:IH-10") return unit;
	return ctx.requestDecision(unit, cor, {
		interaction: "IH-10",
		subject: {
			kind: "artifact",
			id: survey.ref.artifact_id,
			revision: survey.ref.revision,
			digest: survey.ref.content_digest,
		},
		facts: surveyFacts(survey.content),
		recommendation: null,
		language: ctx.language(unit.state),
	});
}
