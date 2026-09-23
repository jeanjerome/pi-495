/**
 * Manual campaign instrument (not part of the deterministic suites): reads one dossier back from its
 * own ledger — read-only, and without opening Pi — and says, intervention by intervention, what was
 * spent against the bounds, and which bound in force falls first at the rate observed.
 *
 * What each figure rests on:
 *
 *  - Tool calls, duration and tokens are the counters the ledger projected for each intervention.
 *  - The cost is the one the host totalled for the session at its catalogue's rates, read from the
 *    intervention's finished event. A dossier written before that field existed carries none, and
 *    the reading says so rather than showing a zero (NFR-06).
 *  - The bounds are read from `<dossier>/config.json` as it stands, through the loader the extension
 *    uses. The ledger does not record the bounds a campaign ran under, so an edit made since would
 *    go unseen, and the output says where the bounds came from.
 *  - Which bound falls first is a projection: the observed rate held until one of them is reached.
 *    Nothing says a longer change keeps the rate a short one showed.
 *
 * Usage: node scripts/measure-budgets.ts <dossier dir>
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ChangeEvent } from "../src/domain/change/events.ts";
import type { ChangeState, InterventionCost } from "../src/domain/change/state.ts";
import { loadConfig } from "../src/extension/config.ts";
import { expandHome, fail, readChange, tilde } from "./lib/dossier.ts";

type Finished = Extract<ChangeEvent, { type: "intervention.finished" }>;

/** What the dossier says an intervention cost: an amount, an unknown with its reason, or nothing. */
type CostReading = { kind: "recorded"; cost: InterventionCost } | { kind: "not_recorded" } | { kind: "running" };

interface Spending {
	label: string;
	role: string;
	result: string;
	tool_calls: number;
	duration_ms: number;
	tokens_known: number;
	cost: CostReading[];
}

interface Bounds {
	tool_calls: number;
	intervention_ms: number;
}

function dossierArgument(): string {
	const value = process.argv[2];
	if (value === undefined || value.startsWith("--")) fail("usage: node scripts/measure-budgets.ts <dossier dir>");
	return expandHome(value);
}

function integer(value: number): string {
	return value.toLocaleString("fr-FR");
}

function duration(ms: number): string {
	if (ms < 60_000) return `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
	const seconds = Math.round(ms / 1000);
	const rest = seconds % 60;
	return rest === 0 ? `${Math.floor(seconds / 60)} min` : `${Math.floor(seconds / 60)} min ${rest} s`;
}

function rate(toolCalls: number, ms: number): string {
	if (ms === 0) return "—";
	const perMinute = toolCalls / (ms / 60_000);
	return `${perMinute.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} /min`;
}

function dollars(usd: number): string {
	return `${usd.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} $`;
}

/** The rate held constant until a bound is reached: which one, and when. */
function firstBound(toolCalls: number, ms: number, bounds: Bounds): string {
	if (toolCalls === 0) return "aucun appel : aucun débit dont projeter";
	if (ms === 0) return "aucune durée mesurée : aucun débit dont projeter";
	const untilCallBound = (bounds.tool_calls * ms) / toolCalls;
	if (untilCallBound < bounds.intervention_ms)
		return `le nombre d'appels tombe le premier, au bout de ${duration(untilCallBound)}`;
	if (untilCallBound > bounds.intervention_ms)
		return `la durée tombe la première, vers ${integer(Math.round((toolCalls * bounds.intervention_ms) / ms))} appels`;
	return `les deux tombent ensemble, à ${duration(bounds.intervention_ms)}`;
}

function subscriptionText(subscription: boolean | null): string {
	if (subscription === null) return "sans dire si le fournisseur est employé par abonnement";
	return subscription ? "fournisseur employé par abonnement" : "hors abonnement";
}

/** The cost cell of one intervention, or of several taken together. */
function costCell(readings: CostReading[]): string {
	if (readings.length === 0) return "—";
	const known = readings.flatMap((r) => (r.kind === "recorded" && r.cost.usd !== null ? [r.cost.usd] : []));
	const sum = dollars(known.reduce((total, usd) => total + usd, 0));
	if (known.length === readings.length) return sum;
	// A cost that is not known may be anything but negative, so the known part is a floor.
	if (known.length > 0) return `au moins ${sum}`;
	if (readings.every((r) => r.kind === "not_recorded")) return "non inscrit";
	if (readings.every((r) => r.kind === "running")) return "en cours";
	return "inconnu";
}

function costDetail(reading: CostReading): string {
	if (reading.kind === "running") return "en cours : l'intervention n'est pas finie";
	if (reading.kind === "not_recorded") return "non inscrit : le dossier a été écrit avant que le coût soit inscrit";
	const { usd, unknown_reason, subscription } = reading.cost;
	if (usd === null) return `inconnu : ${unknown_reason ?? "sans raison inscrite"} — ${subscriptionText(subscription)}`;
	return `${dollars(usd)}, au tarif du catalogue de l'hôte, ${subscriptionText(subscription)}`;
}

/** The finished event of each intervention, which is where its cost is recorded. */
function readFinished(root: string): { state: ChangeState; finished: Map<string, Finished> } {
	return readChange(root, (db, state) => {
		const rows = db
			.prepare(
				"SELECT payload FROM events WHERE aggregate_kind = 'change' AND aggregate_id = ? AND type = 'intervention.finished'",
			)
			.all(state.change_id) as { payload: string }[];
		const finished = new Map<string, Finished>();
		for (const row of rows) {
			const event = JSON.parse(row.payload) as Finished;
			finished.set(event.intervention_id, event);
		}
		return { state, finished };
	});
}

const root = dossierArgument();
const { state, finished } = readFinished(root);
const config = (() => {
	try {
		return loadConfig(root, {}).config;
	} catch (error) {
		return fail(`${root}: ${(error as Error).message}`);
	}
})();
const bounds: Bounds = {
	tool_calls: config.policy.budgets.tool_calls_per_intervention,
	intervention_ms: config.policy.budgets.intervention_ms,
};

const spendings: Spending[] = state.interventions.map((intervention, index) => {
	const event = finished.get(intervention.intervention_id);
	const cost: CostReading =
		intervention.result === "running"
			? { kind: "running" }
			: event?.cost
				? { kind: "recorded", cost: event.cost }
				: { kind: "not_recorded" };
	return {
		label: String(index + 1),
		role: intervention.role,
		result: intervention.result,
		tool_calls: intervention.counters.tool_calls,
		duration_ms: intervention.counters.duration_ms,
		tokens_known: intervention.counters.tokens_known,
		cost: [cost],
	};
});
const whole: Spending = {
	label: "ensemble",
	role: "",
	result: "",
	tool_calls: spendings.reduce((sum, s) => sum + s.tool_calls, 0),
	duration_ms: spendings.reduce((sum, s) => sum + s.duration_ms, 0),
	tokens_known: spendings.reduce((sum, s) => sum + s.tokens_known, 0),
	cost: spendings.flatMap((s) => s.cost),
};

/** Columns padded to their widest cell, so the figures of one intervention read along one line. */
function table(rows: string[][]): string[] {
	const widths = rows[0]!.map((_, column) => Math.max(...rows.map((row) => row[column]!.length)));
	return rows.map((row) =>
		row
			.map((cell, column) => cell.padEnd(widths[column]!))
			.join("  ")
			.trimEnd(),
	);
}

const configured = existsSync(join(root, "config.json"))
	? "lues dans config.json tel qu'il est aujourd'hui"
	: "valeurs par défaut, faute de config.json dans ce dossier";
const stopped = state.stop_reason ? `, arrêté sur ${state.stop_reason} (${state.stop_detail ?? "sans détail"})` : "";
const models = [...new Set(state.interventions.map((i) => `${i.model.provider_id}/${i.model.model_id}`))];

console.log("\n495 — les bornes d'intervention, relues depuis un dossier\n");
for (const line of table([
	["dossier", tilde(root)],
	["changement", `${state.change_id} — phase ${state.phase}, statut ${state.status}, issue ${state.outcome}${stopped}`],
	["modèle", models.join(", ") || "aucun"],
	[
		"bornes",
		`${integer(bounds.tool_calls)} appels d'outils et ${duration(bounds.intervention_ms)} par intervention, ${configured} : ` +
			"le journal ne garde pas celles sous lesquelles la campagne a tourné",
	],
]))
	console.log(line);

console.log("");
for (const line of table([
	["n°", "rôle", "fin", "appels", "durée", "débit", "jetons", "coût"],
	...[...spendings, whole].map((s) => [
		s.label,
		s.role,
		s.result,
		integer(s.tool_calls),
		duration(s.duration_ms),
		rate(s.tool_calls, s.duration_ms),
		integer(s.tokens_known),
		costCell(s.cost),
	]),
]))
	console.log(line);

console.log("\nprojection — ce que les bornes en vigueur feraient à ce débit, pas ce qui s'est passé");
console.log("  la durée suspend l'intervention, qui reprend d'elle-même ; le nombre d'appels arrête le changement");
for (const line of table(
	[...spendings, whole].map((s) => [s.label, s.role, firstBound(s.tool_calls, s.duration_ms, bounds)]),
))
	console.log(`  ${line}`);

console.log("\ncoût — calculé par l'hôte au tarif de son catalogue ; aucun montant n'est lu sur une facture");
for (const line of table(spendings.map((s) => [s.label, s.role, costDetail(s.cost[0]!)]))) console.log(`  ${line}`);
