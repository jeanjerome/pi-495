/**
 * The survey a migration starts from, read from the dossier of the change it cites. A document only names that
 * change, the violated rules it sets aside and those it tolerates: the target is the alternative the owner chose
 * through IH-05, and the violated rules and their counts are what the architecture control measured on the
 * reference, so a document can neither invent a target or a violation, nor shrink one, nor leave one out. An
 * architecture control that measured nothing is never read as the absence of a violation (`specs/adr/D-74`). The
 * survey of the integrated project a migration is measured on is read the same way, under the same map.
 */
import type { AdoptedArchitectureMap, ArchitectureMap } from "../contracts/v1/protocol.ts";
import { answerToRecommendation } from "../domain/architecture-recommendation.ts";
import { DomainError } from "../domain/errors.ts";
import type { GapException, MapMeasure, Migration, MigrationGap, MigrationTarget } from "../domain/program/program.ts";
import type { Survey } from "../domain/survey.ts";
import { acceptedChange, type Citation, type CitedSurvey, checkMeasured, MEASURE, refusal } from "./baseline.ts";

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
 * The adopted map of the cited survey, its survey and the controls that verify the map, refused naming why when the
 * survey adopted no map, or when no control verifies it or one measured nothing of the reference or kept fewer
 * findings than its report counts.
 */
function measuredMap(
	cited: CitedSurvey,
	refused: (why: string) => DomainError,
): { adopted: AdoptedArchitectureMap; survey: Survey; controlIds: string[]; titles: string[] } {
	const { protocol, survey } = cited;
	if (!protocol?.architecture_map || !survey) throw refused("its survey adopted no architecture map");
	const controls = protocol.controls.filter((c) => c.architecture_map);
	if (controls.length === 0) throw refused("no control of its survey measures the architecture map");
	const controlIds = controls.map((c) => c.control_id);
	checkMeasured(cited, survey, controlIds, refused);
	return { adopted: protocol.architecture_map, survey, controlIds, titles: controls.map((c) => c.title) };
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
	const { survey, controlIds } = measuredMap(cited, refused);
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

const named = (items: readonly string[]) => items.join(", ") || "nothing";

type MapPart = ArchitectureMap["parts"][number];

/** What tells the roles of the packages of part `name` in `after` from those in `before`, or null when they are the same. */
function rolesDifference(name: string, before: MapPart, after: MapPart): string | null {
	for (const pkg of new Set([...before.roles, ...after.roles].map((r) => r.package))) {
		const had = before.roles.find((r) => r.package === pkg);
		const has = after.roles.find((r) => r.package === pkg);
		if (!had || !has) return `package ${pkg} is in part ${name} in the map of only one of the two surveys`;
		if (had.role !== has.role) return `package ${pkg} of part ${name} has the role ${has.role} instead of ${had.role}`;
		if (named(had.called_by ?? []) !== named(has.called_by ?? []))
			return `package ${pkg} of part ${name} is called by ${named(has.called_by ?? [])} instead of ${named(had.called_by ?? [])}`;
	}
	return null;
}

/** What tells part `name` in `now` from the same part in `was`, or null when it is the same part. */
function partDifference(name: string, was: ArchitectureMap, now: ArchitectureMap): string | null {
	const before = was.parts.find((p) => p.name === name);
	const after = now.parts.find((p) => p.name === name);
	if (!before || !after) return `part ${name} is in the map of only one of the two surveys`;
	if (named(before.perimeter) !== named(after.perimeter))
		return `part ${name} covers ${named(after.perimeter)} instead of ${named(before.perimeter)}`;
	if (before.style !== after.style) return `part ${name} is in the style ${after.style} instead of ${before.style}`;
	return rolesDifference(name, before, after);
}

/**
 * What tells the map `now` from the map `was`, or null when they are the same: the same parts, each with its
 * perimeter, its style and the role of each of its packages, and the same relations. The hints that support them
 * may differ: they point at lines of a tree that the steps of the migration changed.
 */
function mapDifference(was: ArchitectureMap, now: ArchitectureMap): string | null {
	for (const name of new Set([...was.parts, ...now.parts].map((p) => p.name))) {
		const difference = partDifference(name, was, now);
		if (difference) return difference;
	}
	const depends = (map: ArchitectureMap) => new Set(map.relations.map((r) => `${r.from} may depend on ${r.to}`));
	const before = depends(was);
	const after = depends(now);
	for (const relation of new Set([...before, ...after]))
		if (!before.has(relation) || !after.has(relation))
			return `part ${relation} in the map of only one of the two surveys`;
	return null;
}

/**
 * The measure of the integrated project a migration is judged on: the violations the architecture control of the
 * cited survey counts by rule of the map, as the starting survey's were counted, with the parts of the map, the
 * control that verifies it and what that verification does not see. Refused, naming why, when the cited change is
 * not an accepted survey of the project whose architecture control measured all its report, when its map is not the
 * map of the starting survey, or when it did not measure the clean tree of the program's latest integration, at
 * `integratedCommit`: a map left as a blind spot or renamed is never read as a violation removed.
 */
export function mapMeasureOf(
	cited: CitedSurvey,
	starting: CitedSurvey,
	projectPath: string,
	integratedCommit: string | null,
): MapMeasure {
	acceptedChange(cited, projectPath, MEASURE);
	const refused = refusal(cited, MEASURE);
	const { adopted, survey, controlIds, titles } = measuredMap(cited, refused);
	const startingMap = starting.protocol?.architecture_map?.map;
	const difference = startingMap ? mapDifference(startingMap, adopted.map) : "the starting survey adopted no map";
	if (difference)
		throw refused(`its map differs from that of the starting survey ${starting.change_id}: ${difference}`);
	if (!integratedCommit || cited.reference_commit !== integratedCommit)
		throw refused("it was taken on a tree that does not carry the latest integration of the program");
	return {
		change_id: cited.change_id,
		rules: violatedRules(survey, controlIds),
		map: { parts: adopted.map.parts.map((p) => p.name), tool: titles.join("; "), unseen: adopted.unseen ?? [] },
	};
}
