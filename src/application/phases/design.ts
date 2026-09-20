/**
 * Designing: the design the adopted report carries is proposed to G3.
 */
import type { Design } from "../../contracts/v1/protocol.ts";
import type { SpecificationReport } from "../../contracts/v1/reports.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import type { PhaseContext, Unit } from "./phase.ts";

export async function design(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const spec = await ctx.artifacts.latest<SpecificationReport>(unit.state, "diagnostic");
	if (!spec) throw new DomainError("EVIDENCE_MISSING", "no specification report");
	const design: Design = { change_id: unit.state.change_id, summary: spec.content.design.summary, components: spec.content.design.components, interfaces: spec.content.design.interfaces, alternatives: [], risks: [...spec.content.risks, ...spec.content.design.risks], requirement_ids: unit.state.requirement_ids, compatible_with_mandate: true, executable: spec.content.design.summary.trim().length > 0 };
	const ref = await ctx.artifacts.store("design", unit.state.change_id, ctx.id("dsg"), design, KERNEL_ACTOR.actor_id);
	unit = ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "design", ref }, cor);
	unit = ctx.commit(unit, { type: "gate.evaluate", gate: "G3", at: ctx.now(), actor: KERNEL_ACTOR, design_ref: ref, design }, cor);
	if (unit.state.gates.G3?.verdict === "FAIL") throw new DomainError("PRECONDITION_FAILED", `design rejected at G3: ${unit.state.gates.G3.reasons.join("; ")}`);
	return unit;
}
