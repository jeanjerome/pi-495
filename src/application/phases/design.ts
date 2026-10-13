/**
 * Designing: the design the adopted report carries is proposed to G3.
 */
import type { Design } from "../../contracts/v1/protocol.ts";
import type { SpecificationReport } from "../../contracts/v1/reports.ts";
import { specificationStanding } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { designRefusalInstruction } from "../context.ts";
import { writeSpecification } from "./clarify.ts";
import type { PhaseContext, Unit } from "./phase.ts";

export async function design(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	// The plan is written before the protocol is frozen, so a plan G3 refuses for a path the protocol protects goes back
	// to the model with the reasons, as many times as the change has attempts.
	for (let rewrites = 0; ; rewrites++) {
		unit = await proposeDesign(ctx, unit, cor);
		const g3 = unit.state.gates.G3;
		if (g3?.verdict !== "FAIL") return unit;
		if (rewrites >= unit.state.budgets.max_attempts)
			throw new DomainError("PRECONDITION_FAILED", `design rejected at G3: ${g3.reasons.join("; ")}`);
		const request = await ctx.artifacts.read<string>(unit.state.request);
		const { declared } = specificationStanding(
			unit.state,
			(await ctx.artifacts.latest<SpecificationReport>(unit.state, "diagnostic"))!.content,
			await ctx.artifacts.specificationHistory(unit.state),
		);
		const written = await writeSpecification(
			ctx,
			unit,
			cor,
			await ctx.artifacts.reference(unit.state),
			request,
			declared,
			designRefusalInstruction(g3.reasons),
		);
		unit = written.unit;
		if (!written.report) return unit;
	}
}

/** The design the latest specification report carries, proposed to G3. */
async function proposeDesign(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const spec = await ctx.artifacts.latest<SpecificationReport>(unit.state, "diagnostic");
	if (!spec) throw new DomainError("EVIDENCE_MISSING", "no specification report");
	const design: Design = {
		change_id: unit.state.change_id,
		summary: spec.content.design.summary,
		components: spec.content.design.components,
		interfaces: spec.content.design.interfaces,
		alternatives: [],
		risks: [...spec.content.risks, ...spec.content.design.risks],
		// A report written before designs carried a plan has none: G3 then names each mandatory
		// requirement it leaves unserved.
		tasks: spec.content.design.tasks ?? [],
	};
	const ref = await ctx.artifacts.store("design", unit.state.change_id, ctx.id("dsg"), design, KERNEL_ACTOR.actor_id);
	unit = ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "design", ref }, cor);
	unit = ctx.commit(
		unit,
		{ type: "gate.evaluate", gate: "G3", at: ctx.now(), actor: KERNEL_ACTOR, design_ref: ref, design },
		cor,
	);
	return unit;
}
