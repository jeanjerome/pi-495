/**
 * What an install or a resolution adopted by the owner left in the dossier: the reason one failed, kept
 * for the requirements it was adopted for so that it is not run again, and what Maven printed when it
 * resolved a plugin, so that the dossier shows what was downloaded.
 */
import type { ArtifactRef } from "../../contracts/v1/common.ts";
import type { PackageInstall } from "../../contracts/v1/protocol.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import type { FailedInstall } from "../installation.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/** The identifier every record of an install that was not adopted starts with, followed by `_`. */
const INSTALL_RECORD_PREFIX = "install_";
/** The identifier of the record that keeps what Maven printed when it resolved a plugin. */
const RESOLUTION_RECORD_PREFIX = "resolution";

interface InstallFailureRecord {
	kind: "install-failure";
	/** The requirements the install was adopted for: another revision of them asks the owner again. */
	requirements_digest: string;
	install: PackageInstall;
	reason: string;
}

/** The installs that ran for these requirements and were not adopted, from the record each left in the dossier. */
export async function failedInstalls(
	ctx: PhaseContext,
	unit: Unit,
	requirements: ArtifactRef,
): Promise<FailedInstall[]> {
	const records = await Promise.all(
		(unit.state.proposals.output ?? [])
			.filter((ref) => ref.artifact_id.startsWith(INSTALL_RECORD_PREFIX))
			.map((ref) => ctx.artifacts.read<InstallFailureRecord>(ref)),
	);
	return records
		.filter((r) => r.requirements_digest === requirements.content_digest)
		.map((r) => ({ install: r.install, reason: r.reason }));
}

/** Writes in the dossier why an install adopted for these requirements failed. */
export async function recordFailedInstall(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: ArtifactRef,
	failed: FailedInstall,
): Promise<Unit> {
	const record: InstallFailureRecord = {
		kind: "install-failure",
		requirements_digest: requirements.content_digest,
		install: failed.install,
		reason: failed.reason,
	};
	const ref = await ctx.artifacts.store(
		"output",
		unit.state.change_id,
		ctx.id(INSTALL_RECORD_PREFIX.slice(0, -1)),
		record,
		KERNEL_ACTOR.actor_id,
	);
	return ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "output", ref }, cor);
}

/** Writes in the dossier what Maven printed when it resolved the plugin of `install`. */
export async function recordResolution(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	install: PackageInstall,
	output: string,
): Promise<Unit> {
	const ref = await ctx.artifacts.store(
		"output",
		unit.state.change_id,
		ctx.id(RESOLUTION_RECORD_PREFIX),
		{ kind: "resolution", install, output },
		KERNEL_ACTOR.actor_id,
	);
	return ctx.commit(unit, { type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "output", ref }, cor);
}
