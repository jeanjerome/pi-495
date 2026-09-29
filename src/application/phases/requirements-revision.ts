/**
 * Revising the requirements at the owner's request: the specification is written again with what the
 * owner asked, and what was adopted on the requirements it replaces stops holding.
 */
import type { ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import type { SpecificationReport } from "../../contracts/v1/reports.ts";
import { specificationStanding } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { requirementsRevisionInstruction } from "../context.ts";
import { writeSpecification } from "./clarify.ts";
import type { PhaseContext, Unit } from "./phase.ts";
import { requirementsDocument } from "./specify.ts";

/**
 * Writes the specification again from the request, the answers recorded and the owner's text naming
 * `requirementIds`, then revises the requirements to the ones it gives. The change goes back to the
 * specification, where G1 judges them and the owner adopts them as the first ones. The change stays
 * stopped when the specification intervention stopped it.
 */
export async function reviseRequirements(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	reference: ReferenceSnapshot,
	requirementIds: readonly string[],
	ownerText: string | null,
): Promise<Unit> {
	const request = await ctx.artifacts.read<string>(unit.state.request);
	const standing = await ctx.artifacts.latest<SpecificationReport>(unit.state, "diagnostic");
	if (!standing) throw new DomainError("EVIDENCE_MISSING", "no specification report");
	const { declared } = specificationStanding(
		unit.state,
		standing.content,
		await ctx.artifacts.specificationHistory(unit.state),
	);
	ctx.progress(`requirements revised at the owner's request: ${requirementIds.join(", ")}`);
	const written = await writeSpecification(
		ctx,
		unit,
		cor,
		reference,
		request,
		declared,
		requirementsRevisionInstruction(requirementIds, ownerText),
	);
	if (!written.report) return written.unit;
	const ref = await ctx.artifacts.store(
		"requirements",
		written.unit.state.change_id,
		ctx.id("rqs"),
		await requirementsDocument(ctx, written.unit.state, written.report),
		KERNEL_ACTOR.actor_id,
	);
	return ctx.commit(
		written.unit,
		{
			type: "artifact.revise",
			at: ctx.now(),
			actor: KERNEL_ACTOR,
			kind: "requirements",
			ref,
			reason: `the owner asked to revise ${requirementIds.join(", ")}`,
		},
		cor,
	);
}
