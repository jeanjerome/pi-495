/**
 * Preparing: a bounded intervention writes the tests no existing control can replace, and the kernel
 * judges them on the bare reference before adopting any of them.
 */
import type { ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import type {
	AdoptedComplement,
	ControlDefinition,
	RequirementOracle,
	RequirementsDocument,
} from "../../contracts/v1/protocol.ts";
import { DomainError, messageOf } from "../../domain/errors.ts";
import type { WorkspaceHandle } from "../../ports/execution.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { preparationObjective } from "../context.ts";
import {
	oracleNote,
	preparedFilesFrom,
	provesNewBehaviour,
	requirementOracles,
	samePreparationPaths,
} from "../preparation.ts";
import type { PreparationRecord } from "../preparation.ts";
import { withOwnerPaths } from "../project-controls.ts";
import type { PreparedSuiteInput } from "../verification.ts";
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
		const detected = withOwnerPaths(
			ctx.stacks.recognise(
				handle.path,
				mandate.requirement_ids.map((id) => ({ requirement_id: id, revision: 1 })),
				process.execPath,
				[],
				undefined,
				ctx.policy.suite_paths,
			),
			ctx.policy,
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
		let oracles: RequirementOracle[] = [];
		const sensor = detected.controls[0];
		if (files.length > 0 && sensor) {
			const judged = await onPreparedCopy(ctx, reference, [...complements, ...files], sensor, (suite) =>
				ctx.verification.judgePreparedSuite(suite),
			);
			onReference = judged.on_reference;
			loadable = judged.loadable;
			notes.push(...judged.notes);
			oracles = requirementOracles(
				await mandatedRequirements(ctx, unit, mandate.requirement_ids),
				sensor.control_id,
				judged.cases,
			);
		}
		// Each requirement is judged on its own cases: the red of one case proves the requirement it names
		// and no other, and a suite red as a whole proves none.
		const discriminant = provesNewBehaviour(oracles);
		if (!discriminant && onReference === "PASS")
			notes.push(
				"prepared suite passes on the reference: it does not detect the absent feature (recorded, not adopted as discriminant)",
			);
		for (const o of oracles) if (o.qualification !== "proved") notes.push(oracleNote(o));
		const proves = oracles.some((o) => o.qualification === "proved");
		const qualified = refused.length === 0 && files.length > 0 && loadable && proves;
		const surveyed =
			!qualified && files.length > 0 && sensor
				? await surveyedSuite(ctx, reference, [...complements, ...files], sensor)
				: {};
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
			requirements: oracles,
			...surveyed,
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
		await deleteCopy(ctx, handle);
	}
}

/** The requirements the mandate names, as the specification states them. */
async function mandatedRequirements(
	ctx: PhaseContext,
	unit: Unit,
	ids: readonly string[],
): Promise<RequirementsDocument["requirements"]> {
	const requirements = await ctx.artifacts.latest<RequirementsDocument>(unit.state, "requirements");
	if (!requirements) throw new DomainError("EVIDENCE_MISSING", "requirements missing");
	return requirements.content.requirements.filter((r) => ids.includes(r.requirement_id));
}

/**
 * Runs `use` on the suite of `control` in a disposable copy of the reference and `files`, deleted after, so that
 * nothing the suite writes there reaches the preparation, the reference or a candidate.
 */
async function onPreparedCopy<T>(
	ctx: PhaseContext,
	reference: ReferenceSnapshot,
	files: readonly { path: string; digest: string }[],
	control: ControlDefinition,
	use: (suite: PreparedSuiteInput) => Promise<T>,
): Promise<T> {
	const copy = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
	try {
		await ctx.artifacts.materializePrepared({ files }, copy.path);
		return await use({
			control,
			reference,
			manifest: await ctx.workspace.snapshotCandidate(copy, reference, ctx.workspacePolicy),
			workspace_id: copy.workspace_id,
			workspace_path: copy.path,
		});
	} finally {
		await deleteCopy(ctx, copy);
	}
}

/**
 * Deletes a copy of the preparation. A copy the system refuses to remove is said and left where it is: nothing in it
 * reaches the preparation, the reference or a candidate, so its failure neither loses the record nor stops the change.
 */
async function deleteCopy(ctx: PhaseContext, copy: WorkspaceHandle): Promise<void> {
	try {
		await ctx.workspace.closeWorkspace(copy.workspace_id, "delete");
	} catch (error) {
		ctx.progress(
			`the preparation copy ${copy.path} could not be deleted (${messageOf(error)}); nothing reads it again, and it can be removed by hand`,
		);
	}
}

/**
 * Runs the suite of a refused preparation once more, on a disposable copy of the reference and its files where it may
 * write, and returns what it wrote there, for the record (D-92).
 */
async function surveyedSuite(
	ctx: PhaseContext,
	reference: ReferenceSnapshot,
	files: readonly { path: string; digest: string }[],
	sensor: ControlDefinition,
): Promise<Pick<PreparationRecord, "suite_written">> {
	const paths = await onPreparedCopy(ctx, reference, files, sensor, (suite) =>
		ctx.verification.surveyPreparedSuite(suite),
	);
	return { suite_written: { control_id: sensor.control_id, paths } };
}
