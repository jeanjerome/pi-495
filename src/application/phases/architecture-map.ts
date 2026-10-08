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
	type AdoptedComplement,
	ArchitectureMap,
	type PackageInstall,
	type RecommendedComplement,
	type RequirementsDocument,
	type UnseenByVerification,
} from "../../contracts/v1/protocol.ts";
import {
	architectureMapFacts,
	checkArchitectureMap,
	checkReading,
	type MapCheck,
	type ReadingCheck,
} from "../../domain/architecture-map.ts";
import type { HumanDecisionEntry } from "../../domain/change/state.ts";
import { DomainError } from "../../domain/errors.ts";
import { asksAboutStructure } from "../../domain/survey.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { applyRecommendedEdits } from "../complement.ts";
import { architectureMapObjective } from "../context.ts";
import type { MapVerificationOffer } from "../decisions.ts";
import { bringInstalls } from "../installation.ts";
import { ARCHITECTURE_MAP_SKILL } from "../skills.ts";
import type { ArchitectureOffer } from "../stacks/plugin.ts";
import type { Installer } from "../stacks/registry.ts";
import type { DetectedTechnology } from "../stacks/stack.ts";
import { failedInstalls, recordFailedInstall, recordResolution } from "./install-records.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/**
 * Where the architecture map of a survey stands: the change stopped on it, or nothing more to ask, with the
 * reason the requirements about the architecture are a blind spot when more can be said than the absence
 * of a control.
 */
export type MapSettlement =
	| { kind: "stopped"; unit: Unit }
	| {
			kind: "settled";
			unit: Unit;
			blind_spot?: string;
			map?: AdoptedArchitectureMap;
			/** The files that declare the analyser of the map, written into the copy and into every copy a control runs in. */
			complements?: AdoptedComplement[];
	  };

/**
 * A map a model proposed, for the requirements as they stood when it was asked, what the reference says of it,
 * and of the reading of the model that goes with it; absent from a proposal made before the reading was asked.
 */
interface MapProposal {
	requirements_digest: string;
	map: ArchitectureMap;
	check: MapCheck;
	reading?: ReadingCheck;
}

/**
 * The number of lines of each regular file of the reference, read in the copy at `copyPath`; null for a
 * path the reference does not hold as a file, so a hint cannot lead out of the copy.
 */
export function linesIn(copyPath: string, reference: ReferenceSnapshot): (path: string) => number | null {
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
	let reading: ReadingCheck | undefined;
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
		const lines = linesIn(handle.path, reference);
		check = checkArchitectureMap(map, packages, lines);
		if (map.reading !== undefined) reading = checkReading(map.reading, lines);
	} finally {
		await ctx.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
	const content: MapProposal = {
		requirements_digest: requirements.ref.content_digest,
		map,
		check,
		...(reading ? { reading } : {}),
	};
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

/** How the rules of `map` are verified on the copy at `copyPath`, as the technology that recognises it offers. */
function architectureOfferOn(ctx: PhaseContext, copyPath: string, map: ArchitectureMap): ArchitectureOffer | undefined {
	return ctx.stacks.recognise(copyPath, [], process.execPath, [], map).architecture_verification;
}

/** The recommendations an offer brings into a copy in one step: its analyser, then what the analyser loads. */
const broughtBy = (offer: ArchitectureOffer & { kind: "proposed" }): RecommendedComplement[] => [
	offer.recommendation,
	...(offer.brought_with ?? []),
];

/** What the owner is told adopting `map` has verified, by what, and which parts keep internal rules nothing checks. */
function mapVerificationOffer(offer: ArchitectureOffer | undefined, map: ArchitectureMap): MapVerificationOffer {
	const unchecked = map.parts.filter((part) => part.style === "other").map((part) => part.name);
	const installs =
		offer?.kind === "proposed" ? broughtBy(offer).flatMap((r) => (r.install === undefined ? [] : [r.install])) : [];
	if (installs.length > 0) return { installs, unverified: null, unchecked_parts: unchecked };
	return {
		installs: [],
		unverified:
			offer?.kind === "not_proposed" ? offer.note : "the technology of the target offers no verification of a map",
	};
}

/**
 * The installer that brings every package of `installs` in one step; null when no technology of 495 manages them
 * all, or when its manager resolves and the recommendation carries no edit to declare the analyser with.
 */
function installerOfAll(
	ctx: PhaseContext,
	installs: readonly PackageInstall[],
	recommendation: RecommendedComplement,
): Installer | null {
	const [first] = installs;
	const installer = first === undefined ? null : ctx.stacks.installerOf(first.manager);
	if (installer === null || installs.some((i) => i.manager !== installer.install.manager)) return null;
	return installer.install.form === "resolve" && recommendation.edit === undefined ? null : installer;
}

/**
 * Brings the analyser that verifies the adopted map, and what it loads, with the network open for that step
 * alone: a manager that resolves does so in a copy of its own, and the declaration and the others the
 * verification makes are written into the copy at `copyPath`; a manager that installs does so in that copy, and
 * the files its inspection accepts are kept. Either way the detection that follows reads the controls of the
 * map, and every copy a control runs in receives the same files. Why no control verifies the map when the
 * verification is not offered or cannot be brought.
 */
async function bringVerification(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: ArtifactRef,
	reference: ReferenceSnapshot,
	copyPath: string,
	map: ArchitectureMap,
): Promise<
	{ unit: Unit; complements: AdoptedComplement[]; unseen: UnseenByVerification[] } | { unit: Unit; unverified: string }
> {
	const offer = architectureOfferOn(ctx, copyPath, map);
	const { unverified, installs } = mapVerificationOffer(offer, map);
	if (offer?.kind !== "proposed" || unverified !== null) return { unit, unverified: unverified ?? "" };
	const { recommendation } = offer;
	const installer = installerOfAll(ctx, installs, recommendation);
	if (installer === null)
		return {
			unit,
			unverified: `no technology of 495 brings ${broughtBy(offer)
				.map((r) => r.tool)
				.join(", ")} into a copy`,
		};
	const resolves = installer.install.form === "resolve";
	const acting = resolves ? "resolving" : "installing";
	const failed = (reason: string) =>
		`${acting} ${installs.map((i) => `${i.package} ${i.version}`).join(", ")} failed: ${reason}`;
	// A step that failed for these requirements is not run again: its reason stands until they are revised.
	const earlier = (await failedInstalls(ctx, unit, requirements)).find((f) =>
		installs.some((i) => f.install.package === i.package && f.install.version === i.version),
	);
	if (earlier !== undefined) return { unit, unverified: failed(earlier.reason) };
	const declarations = offer.declarations ?? [];
	ctx.progress(
		`${acting} ${installs.map((i) => `${i.package}@${i.version}`).join(" ")} in a copy, network open for that step alone`,
	);
	const brought = await bringInstalls(ctx, installer, reference, copyPath, installs, recommendation.edit, declarations);
	if (brought.kind === "failed") {
		for (const install of installs)
			unit = await recordFailedInstall(ctx, unit, cor, requirements, { install, reason: brought.reason });
		return { unit, unverified: failed(brought.reason) };
	}
	if (brought.output !== undefined)
		for (const install of installs) unit = await recordResolution(ctx, unit, cor, install, brought.output);
	const unseen = offer.unseen ?? [];
	if (!resolves) {
		const tool = installs.map((i) => i.package).join(", ");
		return {
			unit,
			complements: brought.files.map((f) => ({ ...f, test_type: recommendation.test_type, tool })),
			unseen,
		};
	}
	// Each declaration is written as part of the verification the recommendation brings.
	const declared = [recommendation, ...declarations.map((d) => ({ ...recommendation, edit: d }))];
	return { unit, complements: applyRecommendedEdits(copyPath, declared, installer.install.edit), unseen };
}

/**
 * Freezes the map the owner adopted by `answer`, with the verification it brings, the packages no part covers,
 * what that verification does not see and the reading of the model; a blind spot when no control verifies it.
 */
async function adoptMap(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: ArtifactRef,
	reference: ReferenceSnapshot,
	copyPath: string,
	answer: HumanDecisionEntry,
	adopted: { map: ArchitectureMap; unassigned: string[]; reading: ReadingCheck | undefined },
): Promise<MapSettlement> {
	// The rules are written from the parts and the relations; the reading goes beside them, never among them.
	const { reading: _read, ...rules } = adopted.map;
	const verified = await bringVerification(ctx, unit, cor, requirements, reference, copyPath, rules);
	return {
		kind: "settled",
		unit: verified.unit,
		...("complements" in verified
			? { complements: verified.complements }
			: {
					blind_spot: `blind spot: no control verifies the adopted architecture map, frozen as the architecture the project declares: ${verified.unverified}`,
				}),
		map: {
			adopted_on: answer.recorded_at.slice(0, 10),
			decision_id: answer.decision_id,
			map: rules,
			unassigned_packages: adopted.unassigned,
			...("unseen" in verified && verified.unseen.length > 0 ? { unseen: verified.unseen } : {}),
			...(adopted.reading ? { reading: adopted.reading } : {}),
		},
	};
}

/**
 * Settles the architecture map of the requirements about the architecture: proposes one when none was
 * proposed for these requirements, or when the owner asked for another, and asks the owner about it until
 * they adopt it, with its verification, or leave the requirement a blind spot.
 */
export async function settleArchitectureMap(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	requirements: { ref: ArtifactRef; content: RequirementsDocument },
	reference: ReferenceSnapshot,
	detection: DetectedTechnology,
	copyPath: string,
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
	const { check, map, reading } = proposal.content;
	// A map that does not hold against the code or its styles is not shown to the owner as if it held.
	if (!check.holds)
		return {
			kind: "settled",
			unit,
			blind_spot: `blind spot: the proposed architecture map does not hold: ${check.missing.join("; ")}`,
		};
	if (answer?.option_id === ADOPT)
		return adoptMap(ctx, unit, cor, requirements.ref, reference, copyPath, answer, {
			map,
			unassigned: check.unassigned,
			reading,
		});
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
			architecture_map: mapVerificationOffer(architectureOfferOn(ctx, copyPath, map), map),
		}),
	};
}
