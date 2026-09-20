/**
 * Specifying: the adopted report becomes the requirements document G1 judges.
 */
import { RequirementsDocument as RequirementsDocumentSchema } from "../../contracts/v1/protocol.ts";
import type { RequirementsDocument } from "../../contracts/v1/protocol.ts";
import type { SpecificationReport } from "../../contracts/v1/reports.ts";
import { validate } from "../../contracts/validate.ts";
import { answersOf, declarationsOfReport } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { type PhaseContext, type Unit, requestAdoption } from "./phase.ts";

export async function specify(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const spec = await ctx.artifacts.latest<SpecificationReport>(unit.state, "diagnostic");
	if (!spec) throw new DomainError("EVIDENCE_MISSING", "no specification report");
	const declared = declarationsOfReport(await ctx.artifacts.priorDiagnostics(unit.state), spec.content);
	const doc: RequirementsDocument = {
		change_id: unit.state.change_id,
		requirements: spec.content.requirements.map((r) => ({
			requirement_id: r.requirement_id,
			statement: r.statement,
			category: r.category,
			mandatory: r.mandatory,
			criterion: r.criterion,
			source: "specification intervention over the original request",
			contract_family: null,
			satisfied_by_reference: r.satisfied_by_reference,
		})),
		answers: answersOf(unit.state, declared),
		assumptions: spec.content.assumptions,
		contract_families: {},
	};
	const issues: string[] = [];
	try {
		validate(RequirementsDocumentSchema, doc, "requirements");
	} catch (error) {
		issues.push((error as Error).message);
	}
	const ref = await ctx.artifacts.store(
		"requirements",
		unit.state.change_id,
		ctx.id("rqs"),
		doc,
		KERNEL_ACTOR.actor_id,
	);
	unit = ctx.commit(
		unit,
		{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "requirements", ref },
		cor,
	);
	unit = ctx.commit(
		unit,
		{
			type: "gate.evaluate",
			gate: "G1",
			at: ctx.now(),
			actor: KERNEL_ACTOR,
			requirements_ref: ref,
			requirements: doc,
			report: { valid: issues.length === 0, issues },
		},
		cor,
	);
	if (unit.state.gates.G1?.verdict === "FAIL")
		throw new DomainError(
			"PRECONDITION_FAILED",
			`requirements rejected at G1: ${unit.state.gates.G1.reasons.join("; ")}`,
			{ nextActions: ["revise_requirements"] },
		);
	return requestAdoption(ctx, unit, cor, "G1", "requirements", ref, ctx.language(unit.state));
}
