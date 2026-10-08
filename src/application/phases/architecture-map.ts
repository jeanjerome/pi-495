/**
 * The architecture map of a survey (`specs/adr/D-87`). A requirement about the architecture of a target
 * whose technology reads the packages of its main sources is answered by a map that a read-only
 * intervention proposes in a copy of the reference, and the owner is asked whether to adopt it, to ask
 * for another one with a remark, or to leave the requirement a blind spot. Nothing is written in the
 * project.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Value } from "typebox/value";
import type { ArtifactRef, SubjectRef } from "../../contracts/v1/common.ts";
import type { ReferenceSnapshot } from "../../contracts/v1/candidate.ts";
import { digestValue } from "../../contracts/digest.ts";
import {
	type AdoptedArchitectureMap,
	ArchitectureMap,
	type RequirementsDocument,
} from "../../contracts/v1/protocol.ts";
import { architectureMapFacts, checkArchitectureMap, type MapCheck } from "../../domain/architecture-map.ts";
import type { HumanDecisionEntry } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { asksAboutStructure } from "../../domain/survey.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { architectureMapObjective } from "../context.ts";
import { ARCHITECTURE_MAP_SKILL } from "../skills.ts";
import type { DetectedTechnology } from "../stacks/stack.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/**
 * Where the architecture map of a survey stands: the change stopped on it, or nothing more to ask, with the
 * reason the requirements about the architecture are a blind spot when more can be said than the absence
 * of a control.
 */
export type MapSettlement =
	| { kind: "stopped"; unit: Unit }
	| { kind: "settled"; unit: Unit; blind_spot?: string; map?: AdoptedArchitectureMap };

/** A map a model proposed, for the requirements as they stood when it was asked, and what the reference says of it. */
interface MapProposal {
	requirements_digest: string;
	map: ArchitectureMap;
	check: MapCheck;
}

/**
 * The number of lines of each regular file of the reference, read in the copy at `copyPath`; null for a
 * path the reference does not hold as a file, so a hint cannot lead out of the copy.
 */
function linesIn(copyPath: string, reference: ReferenceSnapshot): (path: string) => number | null {
	const files = new Set(reference.entries.filter((e) => e.kind === "file").map((e) => e.path));
	return (path) => {
		if (!files.has(path)) return null;
		const text = readFileSync(join(copyPath, path), "utf8");
		return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
	};
}

const ADOPT = "adopt_map";
const AGAIN = "propose_map_again";
const LEAVE = "leave_blind_spot";
const OPTIONS = [ADOPT, AGAIN, LEAVE];

/**
 * What an answer to the map question holds for: this proposal, for these requirements as they stand at
 * this revision. Another proposal, or another revision of the requirements, asks again.
 */
function mapSubject(requirements: ArtifactRef, proposal: ArtifactRef): SubjectRef {
	return {
		kind: "artifact",
		id: proposal.artifact_id,
		revision: proposal.revision,
		digest: digestValue({ requirements: requirements.content_digest, map: proposal.content_digest }),
	};
}

/**
 * Runs the intervention that proposes a map, in a copy of the reference, checks the map it returns against
 * the packages of the main sources and the lines of that copy, which the read-only intervention could not
 * change, and proposes both; none when the intervention left the change blocked. An intervention the owner
 * asked for another proposal is handed the previous map and the owner's remark.
 */
async function proposeMap(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	reference: ReferenceSnapshot,
	requirements: { ref: ArtifactRef; content: RequirementsDocument },
	structural: RequirementsDocument["requirements"],
	packages: readonly string[],
	previous: { map: ArchitectureMap; remark: string | null } | null,
): Promise<{ unit: Unit; proposal: { ref: ArtifactRef; content: MapProposal } | null }> {
	let map: ArchitectureMap;
	let check: MapCheck;
	const handle = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
	try {
		const r = await ctx.runIntervention(
			unit,
			cor,
			"specify",
			architectureMapObjective(structural, previous),
			handle.path,
			{
				output_schema: "architecture-map",
				skill: ARCHITECTURE_MAP_SKILL,
			},
		);
		unit = r.unit;
		if (unit.state.status === "blocked") return { unit, proposal: null };
		if (r.result !== "completed" || !r.output_valid || !Value.Check(ArchitectureMap, r.output))
			throw new DomainError(
				"CONFIGURATION_ERROR",
				`architecture map intervention ${r.result}${r.result === "completed" ? " with an invalid structured output" : ""}`,
				{ retryable: true, nextActions: ["resume", "cancel"] },
			);
		map = r.output;
		check = checkArchitectureMap(map, packages, linesIn(handle.path, reference));
	} finally {
		await ctx.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
	const content: MapProposal = { requirements_digest: requirements.ref.content_digest, map, check };
	const ref = await ctx.artifacts.store(
		"architecture_map",
		unit.state.change_id,
		ctx.id("map"),
		content,
		KERNEL_ACTOR.actor_id,
	);
	unit = ctx.commit(
		unit,
		{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "architecture_map", ref },
		cor,
	);
	return { unit, proposal: { ref, content } };
}

/** The owner's last answer to the question asked about this proposal, for these requirements. */
function answerTo(unit: Unit, requirements: ArtifactRef, proposal: ArtifactRef): HumanDecisionEntry | undefined {
	const subject = mapSubject(requirements, proposal);
	return unit.state.human_decisions.findLast(
		(d) =>
			d.valid &&
			d.interaction === "IH-04" &&
			d.subject.digest === subject.digest &&
			d.option_id !== null &&
			OPTIONS.includes(d.option_id),
	);
}

/**
 * Settles the architecture map of the requirements about the architecture: proposes one when none was
 * proposed for these requirements, or when the owner asked for another, and asks the owner about it until
 * they adopt it or leave the requirement a blind spot.
 */
export async function settleArchitectureMap(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: { ref: ArtifactRef; content: RequirementsDocument },
	reference: ReferenceSnapshot,
	detection: DetectedTechnology,
): Promise<MapSettlement> {
	const structural = requirements.content.requirements.filter((r) => asksAboutStructure(r.category));
	if (structural.length === 0 || detection.main_packages === undefined) return { kind: "settled", unit };
	const packages = detection.main_packages;
	let proposal = await ctx.artifacts.latest<MapProposal>(unit.state, "architecture_map");
	let answer = proposal === null ? undefined : answerTo(unit, requirements.ref, proposal.ref);
	if (
		proposal === null ||
		proposal.content.requirements_digest !== requirements.ref.content_digest ||
		answer?.option_id === AGAIN
	) {
		const previous =
			proposal !== null && answer?.option_id === AGAIN ? { map: proposal.content.map, remark: answer.free_text } : null;
		const proposed = await proposeMap(ctx, unit, cor, reference, requirements, structural, packages, previous);
		unit = proposed.unit;
		if (proposed.proposal === null) return { kind: "stopped", unit };
		proposal = proposed.proposal;
		answer = undefined;
	}
	const { check, map } = proposal.content;
	// A map that does not hold against the code is not shown to the owner as if it held.
	if (!check.holds)
		return {
			kind: "settled",
			unit,
			blind_spot: `blind spot: the proposed architecture map does not hold against the reference: ${check.missing.join("; ")}`,
		};
	if (answer?.option_id === ADOPT)
		return {
			kind: "settled",
			unit,
			blind_spot:
				"blind spot: no control verifies the adopted architecture map yet; it is frozen as the architecture the project declares",
			map: {
				adopted_on: answer.recorded_at.slice(0, 10),
				decision_id: answer.decision_id,
				map,
				unassigned_packages: check.unassigned,
			},
		};
	if (answer?.option_id === LEAVE)
		return {
			kind: "settled",
			unit,
			blind_spot:
				"blind spot: the proposed architecture map was not adopted: the owner left the requirement a blind spot",
		};
	return {
		kind: "stopped",
		unit: await ctx.requestDecision(unit, cor, {
			interaction: "IH-04",
			subject: mapSubject(requirements.ref, proposal.ref),
			facts: architectureMapFacts(map, check.unassigned),
			recommendation: null,
			arg: structural.map((r) => r.requirement_id).join(", "),
			language: ctx.language(unit.state),
			architecture_map: true,
		}),
	};
}
