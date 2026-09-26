/**
 * Clarifying: the request is turned into a specification report, the material questions it raises
 * are put to the human, and the mandate G0 adopts is proposed.
 */
import type { ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import { Mandate as MandateSchema } from "../../contracts/v1/protocol.ts";
import type { Mandate } from "../../contracts/v1/protocol.ts";
import { OUTPUT_SCHEMAS } from "../../contracts/v1/reports.ts";
import type { SpecificationReport } from "../../contracts/v1/reports.ts";
import { validate } from "../../contracts/validate.ts";
import {
	type AnswerDeclaration,
	requestedLanguage,
	specificationStanding,
	subjectOfChange,
} from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { specificationObjective } from "../context.ts";
import { Value } from "typebox/value";
import { type PhaseContext, type Unit, requestAdoption } from "./phase.ts";

export async function clarify(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const reference = await ctx.artifacts.reference(unit.state);
	const request = await ctx.artifacts.read<string>(unit.state.request);
	const spec = await ctx.artifacts.latest<SpecificationReport>(unit.state, "diagnostic");
	let report: SpecificationReport;
	let standing = specificationStanding(
		unit.state,
		spec?.content ?? null,
		await ctx.artifacts.specificationHistory(unit.state),
	);
	if (spec && (standing.settled || standing.stalled)) {
		report = spec.content;
	} else {
		// The report a reopening produced is judged before the mandate is proposed: one that asks
		// nothing would otherwise go to G1 without ever being compared to the answers recorded.
		do {
			if (standing.reopen)
				ctx.progress(
					`specification reopened by ${standing.ignored.length} material answer(s): ${standing.ignored.map((q) => q.id).join(", ")}`,
				);
			const written = await writeSpecification(ctx, unit, cor, reference, request, standing.declared);
			unit = written.unit;
			if (!written.report) return unit;
			report = written.report;
			if (questionsToAsk(unit, report).length > 0) break;
			standing = specificationStanding(unit.state, report, await ctx.artifacts.specificationHistory(unit.state));
		} while (standing.reopen);
	}
	const language = requestedLanguage(unit.state) ?? "fr";
	const material = questionsToAsk(unit, report);
	if (material.length > 0) {
		for (const q of material) {
			if (unit.state.open_questions.some((s) => s.id === q.id)) continue;
			const decisionId = ctx.id("dec");
			unit = ctx.commit(
				unit,
				{
					type: "question.open",
					at: ctx.now(),
					actor: KERNEL_ACTOR,
					id: q.id,
					question: q.question,
					material: true,
					decision_id: decisionId,
				},
				cor,
			);
			unit = await ctx.requestDecision(
				unit,
				cor,
				"IH-01",
				subjectOfChange(unit.state),
				[],
				null,
				q.question,
				decisionId,
				language,
			);
		}
		return unit;
	}
	// A mandate built on a report that lost an answer would reach G1 only to be refused there, and no
	// phase comes back to the specification past G0: the owner decides here, while it still can be.
	if (standing.stalled)
		return ctx.commit(
			unit,
			{
				type: "change.block",
				at: ctx.now(),
				actor: KERNEL_ACTOR,
				reason: "stagnation",
				detail: `the specification loses material answer(s) ${standing.ignored.map((q) => q.id).join(", ")} and its latest rewriting carries none an earlier report did not; resume rewrites the specification, cancel abandons the change`,
				retryable: true,
			},
			cor,
		);
	const mandate: Mandate = {
		change_id: unit.state.change_id,
		objective: report.objective,
		scope: report.requirements.map((r) => r.requirement_id),
		out_of_scope: report.out_of_scope,
		assumptions: report.assumptions,
		open_questions: report.questions.map((q) => ({
			id: q.id,
			question: q.question,
			material: q.material,
			answer:
				unit.state.open_questions.find((s) => s.id === q.id)?.answer ?? (q.material ? null : "non-material, left open"),
		})),
		allowed_paths: [],
		integration: ctx.policy.integration_enabled ? "local_branch" : "disabled",
		language,
	};
	validate(MandateSchema, mandate, "mandate");
	const mandateRef = await ctx.artifacts.store(
		"mandate",
		unit.state.change_id,
		ctx.id("mnd"),
		mandate,
		KERNEL_ACTOR.actor_id,
	);
	unit = ctx.commit(
		unit,
		{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "mandate", ref: mandateRef },
		cor,
	);
	unit = ctx.commit(
		unit,
		{ type: "gate.evaluate", gate: "G0", at: ctx.now(), actor: KERNEL_ACTOR, mandate_ref: mandateRef, mandate },
		cor,
	);
	return requestAdoption(ctx, unit, cor, "G0", "mandate", mandateRef, language);
}

/** The material questions of a report the human has not answered yet. */
function questionsToAsk(unit: Unit, report: SpecificationReport): SpecificationReport["questions"] {
	return report.questions.filter(
		(q) => q.material && !unit.state.open_questions.some((s) => s.id === q.id && s.answer !== null),
	);
}

/**
 * Runs one specification intervention from the request and the answers recorded so far, and proposes
 * the report it returns. No report when the intervention left the change blocked.
 */
async function writeSpecification(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	reference: ReferenceSnapshot,
	request: string,
	declared: Map<string, AnswerDeclaration>,
): Promise<{ unit: Unit; report: SpecificationReport | null }> {
	let report: SpecificationReport;
	const handle = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
	try {
		const objective = specificationObjective(request, unit.state.open_questions, declared);
		const r = await ctx.runIntervention(unit, cor, "specify", objective, handle.path, {});
		unit = r.unit;
		if (unit.state.status === "blocked") return { unit, report: null };
		if (r.result !== "completed" || !r.output_valid || !Value.Check(OUTPUT_SCHEMAS["specification-report"], r.output)) {
			throw new DomainError(
				"CONFIGURATION_ERROR",
				`specification intervention ${r.result}${r.result === "completed" ? " with an invalid structured output" : ""}`,
				{ retryable: true, nextActions: ["retry_specification"] },
			);
		}
		report = r.output as SpecificationReport;
	} finally {
		await ctx.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
	const diagRef = await ctx.artifacts.store(
		"diagnostic",
		unit.state.change_id,
		ctx.id("dia"),
		report,
		KERNEL_ACTOR.actor_id,
	);
	unit = ctx.commit(
		unit,
		{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "diagnostic", ref: diagRef },
		cor,
	);
	return { unit, report };
}
