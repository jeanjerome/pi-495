/**
 * An architecture recommendation as the owner reads it (`specs/adr/D-87`): one fact per alternative, with its
 * nature, its benefits, its cost, its risks and each constraint it cites with what that constraint says, and the
 * recommended alternative apart from them, once the kernel checked the form of its argument, never its substance. A
 * reading of the model, which no verdict depends on (`D-74`).
 */
import type { ArchitectureRecommendation, PatternObservation, RequirementsDocument } from "../contracts/v1/protocol.ts";
import { hintOffTheReference } from "./architecture-map.ts";
import type { HumanDecisionEntry } from "./change/state.ts";

/**
 * What each constraint an alternative may cite says, by its identifier: a requirement of the survey by its
 * statement, a question the owner answered by its question and the answer.
 */
export function constraintsOf(requirements: RequirementsDocument): ReadonlyMap<string, string> {
	return new Map([
		...requirements.requirements.map((r): [string, string] => [r.requirement_id, r.statement]),
		...requirements.answers.map((a): [string, string] => [
			a.question_id,
			`the owner's answer to "${a.question}": ${a.answer}`,
		]),
	]);
}

/** What the owner reads of each alternative of a recommendation before choosing one. */
export function recommendationFacts(
	recommendation: ArchitectureRecommendation,
	constraints: ReadonlyMap<string, string>,
): string[] {
	return recommendation.alternatives.map(
		(a) =>
			`architecture alternative ${a.alternative_id} (${a.nature}): ${a.description}; benefits: ${a.benefits.join("; ")}; cost in complexity: ${a.cost.complexity}; cost in migration: ${a.cost.migration}; risks: ${a.risks.join("; ")}; constraints: ${a.constraints.map((c) => `${c}: ${constraints.get(c) ?? ""}`).join("; ")}`,
	);
}

/** The alternative the model recommends, with its conclusion and the constraints the conclusion cites. */
export function recommendedAlternative(recommendation: ArchitectureRecommendation): string {
	const { alternative_id, conclusion, constraints } = recommendation.recommended;
	return `${alternative_id} — ${conclusion} (cites ${constraints.join(", ")})`;
}

/** What the form of the argument of a recommendation gives: it holds, or what it misses. */
type RecommendationCheck = { holds: true } | { holds: false; missing: string[] };

/** The pattern review as it goes with a recommendation: the observations kept, and those set aside with their hint. */
export interface ReviewCheck {
	kept: PatternObservation[];
	set_aside: { kind: PatternObservation["kind"]; name: string; hint: string }[];
}

/**
 * A recommendation a model proposed on the survey whose digest it carries, what the form of its argument gives, and
 * its pattern review confronted with the reference.
 */
export interface RecommendationProposal {
	survey_digest: string;
	recommendation: ArchitectureRecommendation;
	check: RecommendationCheck;
	review: ReviewCheck;
}

/** The owner's last answer to the choice asked about the proposal whose digest is `proposalDigest`. */
export function answerToRecommendation(
	decisions: readonly HumanDecisionEntry[],
	proposalDigest: string,
): HumanDecisionEntry | undefined {
	return decisions.findLast((d) => d.valid && d.interaction === "IH-05" && d.subject.digest === proposalDigest);
}

/**
 * Confronts each hint of the pattern review with the files of the reference, as those of the map are: an
 * observation one of whose hints designates no line of a file of the reference is set aside with that hint, the
 * others are kept. The recommendation holds or not whatever the review says.
 */
export function checkReview(
	review: readonly PatternObservation[],
	linesOf: (path: string) => number | null,
): ReviewCheck {
	const checked: ReviewCheck = { kept: [], set_aside: [] };
	for (const observation of review) {
		const wrong = hintOffTheReference(observation.hints, linesOf);
		if (wrong === undefined) checked.kept.push(observation);
		else
			checked.set_aside.push({ kind: observation.kind, name: observation.name, hint: `${wrong.path}:${wrong.line}` });
	}
	return checked;
}

const KIND_SAID = { pattern: "pattern", anti_pattern: "anti-pattern" } as const;
const REVIEW_FACT = "pattern review, a reading of the model, not a finding";

/** What the owner reads of the pattern review beside the alternatives: each observation kept at its hints, then each set aside and why. */
export function reviewFacts(review: ReviewCheck): string[] {
	return [
		...review.kept.map(
			(o) =>
				`${REVIEW_FACT}: ${KIND_SAID[o.kind]} "${o.name}" at ${o.hints.map((h) => `${h.path}:${h.line} ${h.says}`.trim()).join("; ")}`,
		),
		...review.set_aside.map(
			(o) =>
				`${REVIEW_FACT}: observation set aside: ${KIND_SAID[o.kind]} "${o.name}", because its hint ${o.hint} designates no line of the reference`,
		),
	];
}

/** The options of the choice besides the alternatives, which no alternative may be named after. */
const CHOICE_OPTIONS = ["ask_analysis", "suspend"];

const said = (texts: readonly string[]) => texts.some((t) => t.trim() !== "");

/**
 * Checks the form of the argument of a recommendation against the constraints of the survey: at least two
 * alternatives, each named once and apart from the other options of the choice, each with a benefit, a cost, a risk
 * and a constraint; every constraint cited one of `constraints`; a conclusion that cites one and recommends one of the
 * alternatives. What the recommendation argues is the owner's to judge.
 */
export function checkRecommendation(
	recommendation: ArchitectureRecommendation,
	constraints: ReadonlyMap<string, string>,
): RecommendationCheck {
	const unknown = (who: string, cited: readonly string[]) =>
		cited
			.filter((c) => !constraints.has(c))
			.map((c) => `${who} cites ${c}, which is neither a requirement of the survey nor a question the owner answered`);
	const { alternatives, recommended } = recommendation;
	const ids = alternatives.map((a) => a.alternative_id);
	const missing = [
		...(alternatives.length < 2
			? [
					`the recommendation carries ${alternatives.length} alternative${alternatives.length === 1 ? "" : "s"}, where at least two are needed`,
				]
			: []),
		...[...new Set(ids.filter((id, i) => ids.indexOf(id) !== i || CHOICE_OPTIONS.includes(id)))].map(
			(id) => `the alternative id ${id} names another alternative or another option of the choice`,
		),
		...alternatives.flatMap((a) => {
			const who = `alternative ${a.alternative_id}`;
			return [
				...(said(a.benefits) ? [] : [`${who} carries no benefit`]),
				...(said([a.cost.complexity, a.cost.migration]) ? [] : [`${who} carries no cost`]),
				...(said(a.risks) ? [] : [`${who} carries no risk`]),
				...(a.constraints.length === 0 ? [`${who} cites no constraint`] : unknown(who, a.constraints)),
			];
		}),
		...(recommended.constraints.length === 0
			? ["the conclusion cites no constraint"]
			: unknown("the conclusion", recommended.constraints)),
		...(ids.includes(recommended.alternative_id)
			? []
			: [`the recommended alternative ${recommended.alternative_id} is none of the alternatives`]),
	];
	return missing.length === 0 ? { holds: true } : { holds: false, missing };
}
