/**
 * The architecture recommendation of a survey (`specs/adr/D-87`). Once a survey whose architecture map the owner
 * adopted has measured the reference, a read-only intervention proposes, in a copy of the reference, alternatives
 * argued by the requirements and the owner's answers, and the owner is asked through IH-05 to choose one, to ask
 * for another analysis, or to leave the choice pending. A model never chooses (`ADR-014`), and nothing is written in
 * the project.
 */
import { Value } from "typebox/value";
import type { ArtifactRef, SubjectRef } from "../../contracts/v1/common.ts";
import { ArchitectureRecommendation, type Protocol, type RequirementsDocument } from "../../contracts/v1/protocol.ts";
import {
	answerToRecommendation,
	checkRecommendation,
	checkReview,
	constraintsOf,
	type RecommendationProposal,
	type ReviewCheck,
	recommendationFacts,
	recommendedAlternative,
	reviewFacts,
} from "../../domain/architecture-recommendation.ts";
import { DomainError } from "../../domain/errors.ts";
import type { Survey } from "../../domain/survey.ts";
import { KERNEL_ACTOR } from "../actors.ts";
import { architectureRecommendationObjective } from "../context.ts";
import { ARCHITECTURE_RECOMMENDATION_SKILL } from "../skills.ts";
import { linesIn } from "./architecture-map.ts";
import type { PhaseContext, Unit } from "./phase.ts";

/** The option of the choice that asks for another analysis, with the owner's remark as its free text. */
const ASK_ANALYSIS = "ask_analysis";

/** Where the recommendation of a survey stands: the change stopped on it, or nothing more to ask. */
type RecommendationSettlement = { kind: "stopped" | "settled"; unit: Unit };

/** What an answer to the choice holds for: this proposal, which carries the survey it was asked on. */
function recommendationSubject(proposal: ArtifactRef): SubjectRef {
	return { kind: "artifact", id: proposal.artifact_id, revision: proposal.revision, digest: proposal.content_digest };
}

/**
 * Runs the intervention that proposes a recommendation, in a copy of the reference, from the adopted map, what the
 * survey measured and the constraints of the survey, handed the recommendation the owner asked another analysis of and
 * their remark, with the skill of 495 that asks for a pattern review first;
 * checks the form of its argument and confronts the hints of its review with the copy, and proposes them; none when
 * the intervention left the change blocked.
 */
async function proposeRecommendation(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
	survey: { ref: ArtifactRef; content: Survey },
	map: NonNullable<Protocol["architecture_map"]>,
	requirements: RequirementsDocument,
	previous: { recommendation: ArchitectureRecommendation; remark: string | null } | null,
): Promise<{ unit: Unit; proposal: { ref: ArtifactRef; content: RecommendationProposal } | null }> {
	const reference = await ctx.artifacts.reference(unit.state);
	const handle = await ctx.workspace.createWorkspace(reference, ctx.workspacePolicy);
	let recommendation: ArchitectureRecommendation;
	let review: ReviewCheck;
	try {
		const objective = architectureRecommendationObjective(
			{
				map,
				findings: survey.content.controls.flatMap((c) =>
					c.findings.map((f) => ({ control_id: c.control_id, message: f.message })),
				),
				requirements: requirements.requirements,
				answers: requirements.answers,
			},
			previous,
		);
		// The survey is measured: the read-only role a deciding change may open is observation, whose tools are those of
		// the specification.
		const r = await ctx.runIntervention(unit, cor, "observe", objective, handle.path, {
			output_schema: "architecture-recommendation",
			skill: ARCHITECTURE_RECOMMENDATION_SKILL,
		});
		unit = r.unit;
		if (unit.state.status === "blocked") return { unit, proposal: null };
		if (r.result !== "completed" || !r.output_valid || !Value.Check(ArchitectureRecommendation, r.output))
			throw new DomainError(
				"CONFIGURATION_ERROR",
				`architecture recommendation intervention ${r.result}${r.result === "completed" ? " with an invalid structured output" : ""}`,
				{ retryable: true, nextActions: ["resume", "cancel"] },
			);
		recommendation = r.output;
		// The hints are confronted with the copy, which the read-only intervention could not change.
		review = checkReview(recommendation.review ?? [], linesIn(handle.path, reference));
	} finally {
		await ctx.workspace.closeWorkspace(handle.workspace_id, "delete");
	}
	const content: RecommendationProposal = {
		survey_digest: survey.ref.content_digest,
		recommendation,
		check: checkRecommendation(recommendation, constraintsOf(requirements)),
		review,
	};
	const ref = await ctx.artifacts.store(
		"architecture_recommendation",
		unit.state.change_id,
		ctx.id("rec"),
		content,
		KERNEL_ACTOR.actor_id,
	);
	unit = ctx.commit(
		unit,
		{ type: "artifact.propose", at: ctx.now(), actor: KERNEL_ACTOR, kind: "architecture_recommendation", ref },
		cor,
	);
	return { unit, proposal: { ref, content } };
}

/**
 * Settles the recommendation of a survey whose architecture map the owner adopted: proposes one when none was
 * proposed on the survey last measured, or when the owner asked for another analysis, and asks the owner to choose
 * among its alternatives until they choose one or leave the choice pending.
 */
export async function settleRecommendation(
	ctx: PhaseContext,
	unit: Unit,
	cor: string,
): Promise<RecommendationSettlement> {
	const protocol = await ctx.artifacts.latest<Protocol>(unit.state, "protocol");
	const map = protocol?.content.architecture_map;
	if (!map) return { kind: "settled", unit };
	const survey = await ctx.artifacts.latest<Survey>(unit.state, "survey");
	if (!survey) throw new DomainError("EVIDENCE_MISSING", "no survey of the reference");
	const requirements = await ctx.artifacts.latest<RequirementsDocument>(unit.state, "requirements");
	if (!requirements) throw new DomainError("EVIDENCE_MISSING", "requirements missing");
	let proposal = await ctx.artifacts.latest<RecommendationProposal>(unit.state, "architecture_recommendation");
	let answer =
		proposal === null ? undefined : answerToRecommendation(unit.state.human_decisions, proposal.ref.content_digest);
	if (
		proposal === null ||
		proposal.content.survey_digest !== survey.ref.content_digest ||
		answer?.option_id === ASK_ANALYSIS
	) {
		const previous =
			proposal !== null && answer?.option_id === ASK_ANALYSIS
				? { recommendation: proposal.content.recommendation, remark: answer.free_text }
				: null;
		const proposed = await proposeRecommendation(ctx, unit, cor, survey, map, requirements.content, previous);
		unit = proposed.unit;
		if (proposed.proposal === null) return { kind: "stopped", unit };
		proposal = proposed.proposal;
		answer = undefined;
	}
	const { recommendation, check, review } = proposal.content;
	// A recommendation whose argument does not hold is not put to the owner as if it held; the report says why.
	if (!check.holds) return { kind: "settled", unit };
	if (answer !== undefined) return { kind: "settled", unit };
	return {
		kind: "stopped",
		unit: await ctx.requestDecision(unit, cor, {
			interaction: "IH-05",
			subject: recommendationSubject(proposal.ref),
			facts: [...recommendationFacts(recommendation, constraintsOf(requirements.content)), ...reviewFacts(review)],
			recommendation: recommendedAlternative(recommendation),
			language: ctx.language(unit.state),
			alternatives: recommendation.alternatives,
		}),
	};
}
