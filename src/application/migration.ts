/**
 * The survey a migration starts from, read from the dossier of the change it cites. A document only names that
 * change, the violated rules it sets aside and those it tolerates: the target is the alternative the owner chose
 * through IH-05, and the violated rules and their counts are what the architecture control measured on the
 * reference, so a document can neither invent a target or a violation, nor shrink one, nor leave one out. An
 * architecture control that measured nothing is never read as the absence of a violation (`specs/adr/D-74`).
 */
import { answerToRecommendation } from "../domain/architecture-recommendation.ts";
import { DomainError } from "../domain/errors.ts";
import type { GapException, Migration, MigrationGap, MigrationTarget } from "../domain/program/program.ts";
import type { Survey } from "../domain/survey.ts";
import { acceptedChange, type Citation, type CitedSurvey, checkMeasured, refusal } from "./baseline.ts";

const MIGRATION_START: Citation = { cites: "trajectory cites", isNot: "is not the starting point of a migration" };

/** The alternative the owner chose among those of the recommendation of the cited survey, refused naming why when none is. */
function chosenTarget(
	cited: CitedSurvey,
	decisions: Parameters<typeof answerToRecommendation>[0],
	refused: (why: string) => DomainError,
): MigrationTarget {
	const proposal = cited.recommendation;
	// A recommendation whose argument does not hold was never put to the owner.
	if (!proposal?.content.check.holds) throw refused("it presented no architecture recommendation to choose from");
	const answer = answerToRecommendation(decisions, proposal.ref.content_digest);
	const chosen = proposal.content.recommendation.alternatives.find((a) => a.alternative_id === answer?.option_id);
	if (!chosen) throw refused("the owner left the choice of its recommendation pending");
	return { alternative_id: chosen.alternative_id, nature: chosen.nature, description: chosen.description };
}

/** The violations of the architecture controls of the survey, counted by rule and sorted by rule. */
function violatedRules(survey: Survey, controlIds: readonly string[]): { rule_id: string; violations: number }[] {
	const counts = new Map<string, number>();
	for (const control of survey.controls)
		if (controlIds.includes(control.control_id))
			for (const finding of control.findings) {
				// A finding that names no rule is counted under its own words, never left out.
				const rule = finding.rule_id ?? finding.message;
				counts.set(rule, (counts.get(rule) ?? 0) + 1);
			}
	return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([rule_id, violations]) => ({ rule_id, violations }));
}

/** Refuses a scope decision or an exception that names a rule the survey did not find broken, as a step that does. */
function checkNamed(rules: readonly { rule_id: string }[], named: readonly { rule_id: string }[], what: string): void {
	for (const n of named)
		if (!rules.some((r) => r.rule_id === n.rule_id))
			throw new DomainError(
				"UNKNOWN_REFERENCE",
				`${what} ${n.rule_id}, a violated rule the cited survey does not carry`,
			);
}

/**
 * The migration a trajectory adopts: the cited survey, the tree it measured, the alternative its owner chose, and
 * each rule of the adopted map its architecture control found broken, with its count, set aside by the scope decision
 * that names it and tolerated by the exception that names it. Refused, naming why, when the cited change is not an
 * accepted survey of the project at `projectPath` whose adopted map the architecture control measured on the reference
 * and whose owner chose an alternative of its recommendation.
 */
export function migrationOf(
	cited: CitedSurvey,
	projectPath: string,
	scopeDecisions: readonly { rule_id: string; reason: string }[],
	exceptions: readonly ({ rule_id: string } & GapException)[],
): Migration {
	const change = acceptedChange(cited, projectPath, MIGRATION_START);
	const refused = refusal(cited, MIGRATION_START);
	const { protocol, survey } = cited;
	if (!protocol?.architecture_map || !survey) throw refused("its survey adopted no architecture map");
	const controlIds = protocol.controls.filter((c) => c.architecture_map).map((c) => c.control_id);
	if (controlIds.length === 0) throw refused("no control of its survey measures the architecture map");
	checkMeasured(cited, survey, controlIds, refused);
	const target = chosenTarget(cited, change.human_decisions, refused);
	const rules = violatedRules(survey, controlIds);
	checkNamed(rules, scopeDecisions, "a scope decision sets aside");
	checkNamed(rules, exceptions, "an exception tolerates");
	return {
		change_id: cited.change_id,
		reference_digest: survey.reference_digest,
		target,
		gaps: rules.map((r): MigrationGap => {
			const decision = scopeDecisions.find((d) => d.rule_id === r.rule_id);
			const exception = exceptions.find((e) => e.rule_id === r.rule_id);
			return {
				...r,
				scope_decision: decision ? { reason: decision.reason } : null,
				...(exception ? { exception: { owner: exception.owner, due: exception.due, reason: exception.reason } } : {}),
			};
		}),
	};
}
