/**
 * The consumption line of a change's status says whose spending it is: the agents of 495, which spent
 * it in their own sessions, not the Pi session where the owner types the commands.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Consumption, StatusView } from "../../src/application/views.ts";
import { formatStatus } from "../../src/presentation/structured/text.ts";

const TITLE = "add freeMinutes(busy) beside freeSlots";

/** A change in progress whose interventions consumed `consumption`. */
function spent(consumption: Consumption): StatusView {
	return {
		schema_version: 1,
		program: {
			program_id: "prg_muvojsvvb399",
			title: TITLE,
			project_path: "/tmp/free-slots",
			baseline: null,
			migration: null,
			increments: [{ increment_id: "inc_1", title: TITLE, status: "active", gaps: [], removes: [] }],
			set_aside: [],
			exceptions: [],
			milestones: [],
			closed: false,
		},
		change: {
			change_id: "chg_muvojsvvb399c9ce4d",
			increment_id: "inc_1",
			revision: 12,
			phase: "implementation",
			status: "running",
			outcome: "pending",
			stop_reason: null,
			stop_detail: null,
			resume_lifts_stop: false,
			gates: [{ gate: "G0", verdict: "PASS", reasons: [], next_action: "continue" }],
			attempts: { used: 1, max: 3 },
			candidate: null,
			evidence: [],
			pending_decisions: [],
			last_intervention: null,
			continuations: 0,
			consumption,
			next_action: "implement",
			updated_at: "2026-10-06T08:00:00.000Z",
		},
		limits: ["sandbox:seatbelt:qualified"],
	};
}

const SUBSCRIBED = { tokens: 72_000, usd: 0.11, subscription: true };

/** The column at which the value of a `label   value` line of the status starts. */
const valueColumn = (line: string, label: string) =>
	line.indexOf(label) + label.length + line.slice(line.indexOf(label) + label.length).search(/\S/);

describe("the consumption line of a change's status", () => {
	it("le statut d'un changement dont les interventions ont consommé 72 000 jetons pour ~0,11 $ sur abonnement a la ligne Spent by agents   72.0k tokens · ~$0.11 (sub) en anglais et Dépensé par les agents   72,0 k jetons · ~0,11 $ (abonnement) en français, et un changement sans consommation n'a pas de ligne de consommation", () => {
		for (const [lang, label, value, next] of [
			["en", "Spent by agents", "72.0k tokens · ~$0.11 (sub)", "Next"],
			["fr", "Dépensé par les agents", "72,0 k jetons · ~0,11 $ (abonnement)", "Ensuite"],
		] as const) {
			const lines = formatStatus(spent(SUBSCRIBED), lang).split("\n");
			const line = lines.find((l) => l.trimStart().startsWith(label));
			assert.equal(line, `  ${label}   ${value}`, `${lang}:\n${lines.join("\n")}`);
			const nextLine = lines.find((l) => l.trimStart().startsWith(`${next} `)) ?? "";
			assert.equal(valueColumn(nextLine, next), valueColumn(line, label), `${lang}: aligned on the ${next} line`);

			const none = formatStatus(spent({ tokens: 0, usd: null, subscription: false }), lang);
			assert.doesNotMatch(none, /tokens|jetons|agents/, `${lang}: no consumption line:\n${none}`);
		}
	});

	it("un statut sans consommation garde ses valeurs quatre colonnes après le plus long de ses libellés Last et Next, en anglais comme en français", () => {
		const none = { tokens: 0, usd: null, subscription: false };
		for (const [lang, next] of [
			["en", "  Next    implement"],
			["fr", "  Ensuite     implement"],
		] as const) {
			const lines = formatStatus(spent(none), lang).split("\n");
			assert.ok(lines.includes(next), `${lang}:\n${lines.join("\n")}`);
		}
	});
});
