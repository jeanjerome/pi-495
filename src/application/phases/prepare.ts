/**
 * Preparing: a bounded intervention writes the tests no existing control can replace, and the kernel
 * judges them on the bare reference before adopting any of them.
 */
import type { AdoptedComplement } from "../../contracts/v1/protocol.ts";
import { DomainError } from "../../domain/errors.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { preparationObjective } from "../context.ts";
import { preparedFilesFrom, samePreparationPaths } from "../preparation.ts";
import type { PreparationRecord } from "../preparation.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/** Preparation intervention, then kernel qualification of the proposed tests (SA-008, SA-009, PRE-03). */
export async function prepare(ctx: PhaseContext, unit: Unit, cor: string): Promise<Unit> {
	const reference = await ctx.artifacts.reference(unit.state);
	const mandateArt = await ctx.artifacts.latest<{
		objective: string;
		allowed_paths: string[];
		requirement_ids: string[];
		stack: string;
		/** The complements the owner had adopted when the mandate opened; absent when there were none. */
		complements?: AdoptedComplement[];
	}>(unit.state, "preparation");
	if (!mandateArt) throw new DomainError("EVIDENCE_MISSING", "preparation mandate missing");
	const mandate = mandateArt.content;
	const complements = mandate.complements ?? [];
	const previousRef = ctx.artifacts
		.proposedSinceRevocation(unit.state, "preparation")
		.findLast((ref) => ref.artifact_id.startsWith("prep_"));
	const previous = previousRef ? await ctx.artifacts.read<PreparationRecord>(previousRef) : null;
	const feedback = previous
		? `The previous preparation was refused. Only files under the allowed paths are retained; what was written elsewhere was ignored.\n${previous.notes.map((note) => `- ${note}`).join("\n")}`
		: null;
	const handle = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
	try {
		await ctx.artifacts.materializePrepared({ files: complements }, handle.path);
		const detected = ctx.stacks.recognise(
			handle.path,
			mandate.requirement_ids.map((id) => ({ requirement_id: id, revision: 1 })),
		);
		if (detected.stack !== mandate.stack || !samePreparationPaths(mandate.allowed_paths, detected.preparation_paths)) {
			const record: PreparationRecord = {
				preparation_id: ctx.id("prc"),
				objective: mandate.objective,
				allowed_paths: mandate.allowed_paths,
				files: [],
				modified_existing: [],
				on_reference: "NOT_RUN",
				discriminant: false,
				loadable: false,
				qualified: false,
				notes: [
					`preparation mandate scope is stale; detected ${detected.stack} paths: ${detected.preparation_paths.join(", ") || "none"}`,
				],
			};
			const ref = await ctx.artifacts.store(
				"preparation",
				unit.state.change_id,
				record.preparation_id,
				record,
				KERNEL_ACTOR.actor_id,
			);
			unit = ctx.commit(
				unit,
				{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "preparation", ref },
				cor,
			);
			return ctx.commit(
				unit,
				{
					type: "preparation.close",
					at: ctx.now(),
					actor: KERNEL_ACTOR,
					qualified: false,
					capability_ids: [],
					adopted_ref: null,
				},
				cor,
			);
		}
		const r = await ctx.runIntervention(
			unit,
			cor,
			"prepare",
			preparationObjective(mandate.objective, mandate.requirement_ids),
			handle.path,
			{ adopted: ["mandate", "requirements"], feedback, controls: detected.controls },
		);
		unit = r.unit;
		if (unit.state.status === "blocked") return unit;
		const notes: string[] = [];
		if (r.result !== "completed") notes.push(`preparation intervention ${r.result}`);
		const snapshot = await ctx.workspace.snapshotCandidate(handle, reference, ctx.workspacePolicy);
		// What the copy carried from the start is not something the producer wrote.
		const carried = new Map(complements.map((c) => [c.path, c.digest]));
		const manifest = { ...snapshot, entries: snapshot.entries.filter((e) => carried.get(e.path) !== e.content_digest) };
		const { files, modified_existing, out_of_scope, refused } = preparedFilesFrom(manifest, mandate.allowed_paths);
		for (const p of out_of_scope) notes.push(`written outside the preparation mandate, not retained: ${p}`);
		for (const p of refused) notes.push(`change under the preparation roots refused: ${p}`);
		if (files.length === 0) notes.push("no test file was produced");
		await ctx.artifacts.ensureBytes(handle.path, files);
		// Loadability and discriminance are judged on the bare reference plus the retained files, never
		// on the producer's tree: a feature it wrote beside its tests would make them pass there.
		let onReference: PreparationRecord["on_reference"] = "NOT_RUN";
		let loadable = false;
		const sensor = detected.controls[0];
		if (files.length > 0 && sensor) {
			const bare = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
			try {
				await ctx.artifacts.materializePrepared({ files: [...complements, ...files] }, bare.path);
				const judged = await ctx.verification.judgePreparedSuite({
					control: sensor,
					reference,
					manifest: await ctx.workspace.snapshotCandidate(bare, reference, ctx.workspacePolicy),
					workspace_id: bare.workspace_id,
					workspace_path: bare.path,
				});
				onReference = judged.on_reference;
				loadable = judged.loadable;
				notes.push(...judged.notes);
			} finally {
				await ctx.workspace.closeWorkspace(bare.workspace_id, "delete");
			}
		}
		const discriminant = onReference === "FAIL";
		if (!discriminant && onReference === "PASS")
			notes.push(
				"prepared suite passes on the reference: it does not detect the absent feature (recorded, not adopted as discriminant)",
			);
		const qualified = refused.length === 0 && files.length > 0 && loadable && discriminant;
		const record: PreparationRecord = {
			preparation_id: ctx.id("prep"),
			objective: mandate.objective,
			allowed_paths: mandate.allowed_paths,
			files,
			modified_existing,
			on_reference: onReference,
			discriminant,
			loadable,
			qualified,
			notes,
		};
		const ref = await ctx.artifacts.store(
			"preparation",
			unit.state.change_id,
			record.preparation_id,
			record,
			KERNEL_ACTOR.actor_id,
		);
		unit = ctx.commit(
			unit,
			{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "preparation", ref },
			cor,
		);
		return ctx.commit(
			unit,
			{
				type: "preparation.close",
				at: ctx.now(),
				actor: KERNEL_ACTOR,
				qualified,
				capability_ids: files.map((f) => f.path),
				adopted_ref: qualified ? ref : null,
			},
			cor,
		);
	} finally {
		await ctx.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
}
