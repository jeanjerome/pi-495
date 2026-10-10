/**
 * The reader of an acceptance run (CMP-VER): what the recipe of the control observed of the candidate it was given,
 * through the entry it declares. It decides nothing it did not read: a report about another candidate, a summary
 * without observations, an observation or a negative control the recipe declares and the report omits, an entry or a
 * simulation the recipe does not declare, each leaves the run INDETERMINATE; an observation that failed on the
 * candidate is a FAIL tied to its requirement.
 */
import { check } from "../../contracts/validate.ts";
import { ACCEPTANCE_RECIPE, AcceptanceReport, type AcceptanceRecipe } from "../../contracts/v1/protocol.ts";
import { messageOf } from "../../domain/errors.ts";
import type { ParsedFinding, ParsedReport, ReaderRun, ReportReader } from "../../ports/execution.ts";
import { incidentOf, incidentReport } from "./parsers.ts";

export const ACCEPTANCE_RECIPE_READER: ReportReader = {
	id: ACCEPTANCE_RECIPE,
	version: "1.0.0",
	// What a recipe observes is declared by the recipe, never deduced from a nature of its reader.
	nature: null,
	differential: false,
	located: false,
	read: readAcceptanceReport,
};

async function readAcceptanceReport(run: ReaderRun): Promise<ParsedReport> {
	const incident = incidentOf(run.observation);
	if (incident) return incidentReport(run.observation, incident);
	const recipe = run.control.acceptance_recipe;
	if (!recipe) return undecided({}, [`control ${run.control.control_id} declares no acceptance recipe`]);
	const report = await reportOf(run);
	if (typeof report === "string") return undecided({ exit_code: run.observation.exit_code }, [report]);
	const facts = {
		candidate: report.candidate,
		built_version: report.built_version,
		entry: report.entry,
		simulations: report.simulations,
		observations: report.observations,
		negative_control: report.negative_control,
	};
	const gaps = gapsOf(report, recipe, run.subject_digest);
	if (gaps.length > 0) return undecided(facts, gaps);
	const failed = failedObservations(report, recipe);
	return {
		verdict: failed.length > 0 ? "FAIL" : "PASS",
		facts,
		notes: recipe.not_exercised.map((what) => `not exercised: ${what}`),
		failures: [],
		findings: failed,
	};
}

/** The report the run left, or why there is none to read. */
async function reportOf(run: ReaderRun): Promise<AcceptanceReport | string> {
	const where = run.control.report_path ?? "(no report path)";
	let text: string;
	try {
		const [doc] = await run.reports("application/json", { single_file: true });
		if (!doc) return `no acceptance report at ${where} (exit code ${run.observation.exit_code})`;
		text = doc.text;
	} catch (error) {
		return `acceptance report at ${where} is unreadable: ${messageOf(error)}`;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return `acceptance report at ${where} is not JSON: ${messageOf(error)}`;
	}
	return check(AcceptanceReport, parsed)
		? parsed
		: `acceptance report at ${where} does not follow the contract acceptance-report`;
}

/** What keeps the report from standing for the declared recipe on this candidate. */
function gapsOf(report: AcceptanceReport, recipe: AcceptanceRecipe, subject: string): string[] {
	const gaps: string[] = [];
	if (report.candidate !== subject)
		gaps.push(`acceptance report names candidate ${report.candidate}, not ${subject} this run judged`);
	if (report.observations.length === 0)
		gaps.push("acceptance report observes nothing: a summary without observations is not an acceptance run");
	if (report.entry !== recipe.entry)
		gaps.push(`acceptance report drove the entry ${report.entry}, the recipe declares ${recipe.entry}`);
	for (const simulation of report.simulations)
		if (!recipe.simulations.includes(simulation))
			gaps.push(`acceptance report simulates ${simulation}, which the recipe does not allow`);
	for (const declared of recipe.observations)
		if (!report.observations.some((o) => same(o, declared)))
			gaps.push(`observation ${declared.observation_id} of ${declared.requirement_id} is not reported`);
	const negative = recipe.negative_control;
	if (negative) {
		const observed = report.negative_control;
		if (!observed || observed.requirement_id !== negative.requirement_id)
			gaps.push(`the negative control of ${negative.requirement_id} is not reported`);
		else if (observed.outcome !== "refused")
			gaps.push(
				`the negative control of ${negative.requirement_id} observed ${observed.observed} on ${negative.deprived_of}, expected ${negative.expected}: the run does not tell the delivered behaviour apart`,
			);
	}
	return gaps;
}

function failedObservations(report: AcceptanceReport, recipe: AcceptanceRecipe): ParsedFinding[] {
	return recipe.observations.flatMap((declared) => {
		const observed = report.observations.find((o) => same(o, declared));
		if (observed?.outcome !== "failed") return [];
		return [
			{
				rule_id: `${ACCEPTANCE_RECIPE}:observation-failed`,
				category: "assertion" as const,
				severity: "blocker" as const,
				message: `requirement ${declared.requirement_id}: observation ${declared.observation_id} expected ${declared.expected}, observed ${observed.observed}`,
				symbol: declared.observation_id,
			},
		];
	});
}

function same(
	observed: { observation_id: string; requirement_id: string },
	declared: { observation_id: string; requirement_id: string },
): boolean {
	return observed.observation_id === declared.observation_id && observed.requirement_id === declared.requirement_id;
}

function undecided(facts: Record<string, unknown>, notes: string[]): ParsedReport {
	return { verdict: "INDETERMINATE", facts, notes, failures: [] };
}
