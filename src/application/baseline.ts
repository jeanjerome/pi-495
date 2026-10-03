/**
 * The survey a trajectory starts from, read from the dossier of the change it cites. A document only
 * names that change and the scope decisions it takes: the gaps and their counts come from the survey,
 * so a document can neither invent a gap, nor shrink one, nor leave one out. A change that did not
 * measure the project as it stands is refused: an analyser absent or not qualified is never read as
 * the absence of a gap (QLT-02), and an analyser whose findings the survey kept fewer of than its report
 * counts would hide the gaps past that bound.
 */
import type { Protocol } from "../contracts/v1/protocol.ts";
import { surveysTheProject, type ChangeState } from "../domain/change/state.ts";
import { DomainError } from "../domain/errors.ts";
import { gapName, sameGap, type Baseline, type BaselineGap, type GapKey } from "../domain/program/program.ts";
import type { CodeAuthorship, Survey } from "../domain/survey.ts";
import { countByModule, referentialSection } from "./report.ts";

/** What a cited change is read from: its state, the project its program surveyed, its protocol and its survey. */
export interface CitedSurvey {
	change_id: string;
	change: ChangeState | null;
	surveyed_path: string | null;
	protocol: Protocol | null;
	survey: Survey | null;
	/** How many findings the report of each control of the survey counts, as the evidence of its pass records them. */
	reported_findings: Readonly<Record<string, number>>;
}

const AUTHORSHIPS: readonly CodeAuthorship[] = ["proprietary", "generated"];

/** The survey and protocol of the cited change, refused naming why when it is not a starting point for the project at `projectPath`. */
function startingPoint(cited: CitedSurvey, projectPath: string): { survey: Survey; protocol: Protocol } {
	const { change, protocol, survey } = cited;
	if (!change)
		throw new DomainError("UNKNOWN_REFERENCE", `trajectory cites change ${cited.change_id}, which does not exist`);
	const refused = (why: string) =>
		new DomainError(
			"PRECONDITION_FAILED",
			`trajectory cites change ${cited.change_id}, which is not a starting point: ${why}`,
		);
	if (!surveysTheProject(change)) throw refused("it delivers a candidate, not a survey of the project");
	if (cited.surveyed_path !== projectPath) throw refused("it surveyed another project");
	if (change.outcome !== "accepted")
		throw refused(
			`the owner did not accept its survey: ${change.phase === "closed" ? `it closed ${change.outcome}` : "it is still open"}`,
		);
	if (!protocol?.quality_referential || !survey) throw refused("its survey adopted no quality referential");
	for (const controlId of new Set(protocol.quality_referential.rules.map((r) => r.control_id))) {
		const measured = survey.controls.find((c) => c.control_id === controlId);
		if (!measured || measured.blind_spot !== null)
			throw refused(
				`its control ${controlId} measured nothing of the reference${measured?.blind_spot ? `: ${measured.blind_spot}` : ""}`,
			);
		const reported = cited.reported_findings[controlId];
		if (reported !== undefined && reported > measured.findings.length)
			throw refused(
				`its control ${controlId} kept ${measured.findings.length} of the ${reported} findings its report counts`,
			);
	}
	return { survey, protocol };
}

/** The gaps of the survey under each rule of its referential, by perimeter and module, as the report counts them. */
function surveyGaps(survey: Survey, protocol: Protocol): BaselineGap[] {
	const measured = protocol.quality_referential?.perimeter?.measured ?? [];
	return (referentialSection(survey, protocol)?.rules ?? []).flatMap((rule) =>
		AUTHORSHIPS.flatMap((authorship) =>
			countByModule(
				rule.findings.filter((f) => f.authorship === authorship),
				measured,
			).map(({ module, violations }) => ({
				rule_id: rule.rule_id,
				threshold: rule.threshold,
				module,
				authorship,
				violations,
				scope_decision: null,
			})),
		),
	);
}

/**
 * The baseline a trajectory adopts: the cited survey, the tree it measured, and its gaps, each set
 * aside by the scope decision that names it. A decision that names a gap the survey does not carry is
 * refused, as an increment that does.
 */
export function baselineOf(
	cited: CitedSurvey,
	projectPath: string,
	scopeDecisions: readonly (GapKey & { reason: string })[],
): Baseline {
	const { survey, protocol } = startingPoint(cited, projectPath);
	const gaps = surveyGaps(survey, protocol);
	for (const d of scopeDecisions)
		if (!gaps.some((g) => sameGap(g, d)))
			throw new DomainError(
				"UNKNOWN_REFERENCE",
				`a scope decision sets aside ${gapName(d)} (${d.authorship} code), a gap the cited survey does not carry`,
			);
	return {
		change_id: cited.change_id,
		reference_digest: survey.reference_digest,
		gaps: gaps.map((g) => {
			const decision = scopeDecisions.find((d) => sameGap(g, d));
			return decision ? { ...g, scope_decision: { reason: decision.reason } } : g;
		}),
	};
}
