/**
 * The survey a trajectory starts from, read from the dossier of the change it cites. A document only
 * names that change and the scope decisions it takes: the gaps and their counts come from the survey,
 * so a document can neither invent a gap, nor shrink one, nor leave one out. A change that did not
 * measure the project as it stands is refused: an analyser absent or not qualified is never read as
 * the absence of a gap (QLT-02), and an analyser whose findings the survey kept fewer of than its report
 * counts would hide the gaps past that bound. The survey a program is measured on is read the same way.
 */
import type { AdoptedQualityReferential, Protocol, QualityRule } from "../contracts/v1/protocol.ts";
import { surveysTheProject, type ChangeState } from "../domain/change/state.ts";
import { DomainError } from "../domain/errors.ts";
import {
	gapName,
	sameGap,
	type Baseline,
	type BaselineGap,
	type GapException,
	type GapKey,
	type Measure,
} from "../domain/program/program.ts";
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
	/** The commit the survey measured, when it measured a clean tree; null otherwise. */
	reference_commit: string | null;
}

/** How a refusal names the cited change, and what that change was cited to be. */
interface Citation {
	cites: string;
	isNot: string;
}

const STARTING_POINT: Citation = { cites: "trajectory cites", isNot: "is not a starting point" };
const MEASURE: Citation = { cites: "the measure cites", isNot: "does not measure the integrated project" };

const AUTHORSHIPS: readonly CodeAuthorship[] = ["proprietary", "generated"];

/** The refusal of a cited change, naming it, what it was cited to be, and why it is not. */
function refusal(cited: CitedSurvey, citation: Citation): (why: string) => DomainError {
	return (why) =>
		new DomainError(
			"PRECONDITION_FAILED",
			`${citation.cites} change ${cited.change_id}, which ${citation.isNot}: ${why}`,
		);
}

/**
 * The survey, protocol and referential of the cited change, refused naming why when it is not an accepted
 * survey of the project at `projectPath` whose every control of the referential measured all its report.
 */
function acceptedSurvey(
	cited: CitedSurvey,
	projectPath: string,
	citation: Citation,
): { survey: Survey; protocol: Protocol; referential: AdoptedQualityReferential } {
	const { change, protocol, survey } = cited;
	if (!change)
		throw new DomainError("UNKNOWN_REFERENCE", `${citation.cites} change ${cited.change_id}, which does not exist`);
	const refused = refusal(cited, citation);
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
	return { survey, protocol, referential: protocol.quality_referential };
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

/** Refuses a scope decision or an exception that names a gap the survey does not carry, as an increment that does. */
function checkNamed(gaps: readonly BaselineGap[], named: readonly GapKey[], what: string): void {
	for (const n of named)
		if (!gaps.some((g) => sameGap(g, n)))
			throw new DomainError(
				"UNKNOWN_REFERENCE",
				`${what} ${gapName(n)} (${n.authorship} code), a gap the cited survey does not carry`,
			);
}

/**
 * The baseline a trajectory adopts: the cited survey, the tree it measured, and its gaps, each set
 * aside by the scope decision that names it and tolerated by the exception that names it.
 */
export function baselineOf(
	cited: CitedSurvey,
	projectPath: string,
	scopeDecisions: readonly (GapKey & { reason: string })[],
	exceptions: readonly (GapKey & GapException)[],
): Baseline {
	const { survey, protocol } = acceptedSurvey(cited, projectPath, STARTING_POINT);
	const gaps = surveyGaps(survey, protocol);
	checkNamed(gaps, scopeDecisions, "a scope decision sets aside");
	checkNamed(gaps, exceptions, "an exception tolerates");
	return {
		change_id: cited.change_id,
		reference_digest: survey.reference_digest,
		gaps: gaps.map((g) => {
			const decision = scopeDecisions.find((d) => sameGap(g, d));
			const exception = exceptions.find((e) => sameGap(g, e));
			return {
				...g,
				...(decision ? { scope_decision: { reason: decision.reason } } : {}),
				...(exception ? { exception: { owner: exception.owner, due: exception.due, reason: exception.reason } } : {}),
			};
		}),
	};
}

/** A rule's threshold as the analyser is given it. */
function thresholdOf(rule: QualityRule): string {
	const properties = Object.entries(rule.properties)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, value]) => `${name}=${value}`);
	return `"${rule.threshold}" (${properties.join(", ")})`;
}

/** The measured modules of a referential, sorted. */
function modulesOf(referential: AdoptedQualityReferential): string[] {
	return [...new Set((referential.perimeter?.measured ?? []).map((m) => m.module))].sort();
}

const listed = (modules: readonly string[]) => modules.join(", ") || "none";

/**
 * What tells the referential `now` from the referential `was`, or null when they are the same: the same
 * rules, each with its threshold and the version of its tool, and the same measured modules.
 */
function referentialDifference(was: AdoptedQualityReferential, now: AdoptedQualityReferential): string | null {
	const ids = [...new Set([...was.rules, ...now.rules].map((r) => r.rule_id))];
	for (const id of ids) {
		const before = was.rules.find((r) => r.rule_id === id);
		const after = now.rules.find((r) => r.rule_id === id);
		if (!before || !after) return `rule ${id} is in the referential of only one of the two surveys`;
		if (thresholdOf(before) !== thresholdOf(after))
			return `rule ${id} has the threshold ${thresholdOf(after)} instead of ${thresholdOf(before)}`;
		if (before.tool !== after.tool) return `rule ${id} is checked by ${after.tool} instead of ${before.tool}`;
	}
	if (listed(modulesOf(was)) !== listed(modulesOf(now)))
		return `it measures the modules ${listed(modulesOf(now))} instead of ${listed(modulesOf(was))}`;
	return null;
}

/**
 * The measure of the integrated project a program is judged on: the gaps the cited survey counts, by rule,
 * module and perimeter, as the starting survey's were counted. Refused, naming why, when the cited change
 * is not an accepted survey of the project that measured all its reports, when its referential is not the
 * starting survey's, or when it did not measure the clean tree of the program's latest integration, at
 * `integratedCommit`: a module it does not read or an analyser it lost is never read as a gap removed.
 */
export function measureOf(
	cited: CitedSurvey,
	starting: CitedSurvey,
	projectPath: string,
	integratedCommit: string | null,
): Measure {
	const { survey, protocol, referential } = acceptedSurvey(cited, projectPath, MEASURE);
	const refused = refusal(cited, MEASURE);
	const difference = referentialDifference(
		acceptedSurvey(starting, projectPath, STARTING_POINT).referential,
		referential,
	);
	if (difference)
		throw refused(`its referential differs from that of the starting survey ${starting.change_id}: ${difference}`);
	if (!integratedCommit || cited.reference_commit !== integratedCommit)
		throw refused("it was taken on a tree that does not carry the latest integration of the program");
	return {
		change_id: cited.change_id,
		gaps: surveyGaps(survey, protocol).map((g) => ({
			rule_id: g.rule_id,
			module: g.module,
			authorship: g.authorship,
			violations: g.violations,
		})),
		perimeter: {
			rules: referential.rules.map((r) => ({ rule_id: r.rule_id, tool: r.tool })),
			modules: modulesOf(referential),
			unmeasured: referential.perimeter?.unmeasured ?? [],
		},
	};
}
