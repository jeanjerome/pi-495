/**
 * The steps of a change under one name each, the same on screen as in the documentation: Scoping to
 * Integration, Cadrage to Intégration. A change in progress says its step before its activity.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { EngineeringReport } from "../../src/application/report.ts";
import type { StatusView } from "../../src/application/views.ts";
import { formatReport, formatStatus } from "../../src/presentation/structured/text.ts";

type ChangeView = NonNullable<StatusView["change"]>;

const PASSED = ["G0", "G1", "G2", "G3", "G4", "G5"];

const STEPS_EN = ["Scoping", "Specification", "Qualification", "Design", "Implementation", "Acceptance", "Integration"];
const STEPS_FR = [
	"Cadrage",
	"Spécification",
	"Qualification",
	"Conception",
	"Implémentation",
	"Acceptation",
	"Intégration",
];

function document(path: string): string {
	return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

/** The cells of the Markdown table rows of a document, trimmed. */
function rows(text: string): string[][] {
	return text
		.split("\n")
		.filter((line) => line.startsWith("| "))
		.map((line) =>
			line
				.slice(1, -1)
				.split(" | ")
				.map((cell) => cell.trim()),
		);
}

/** The name each gate row gives G0 to G6, whether it reads `| G0 — Name |` or `| G0 | Name |`. */
function gateNames(text: string): string[] {
	return rows(text)
		.filter((cells) => /^G[0-6]\b/.test(cells[0] ?? ""))
		.map((cells) => (cells[0]?.includes(" — ") ? cells[0].split(" — ")[1] : cells[1]) ?? "");
}

/** The change accepted at the first of three attempts, G0 to G5 passed, G6 not reached. */
function accepted(): ChangeView {
	return {
		change_id: "chg_steps",
		increment_id: "inc_1",
		revision: 12,
		phase: "closed",
		status: "completed",
		outcome: "accepted",
		stop_reason: null,
		stop_detail: null,
		resume_lifts_stop: false,
		gates: PASSED.map((gate) => ({ gate, verdict: "PASS", reasons: [], next_action: "continue" })),
		attempts: { used: 1, max: 3 },
		candidate: null,
		evidence: [],
		pending_decisions: [],
		last_intervention: null,
		continuations: 0,
		consumption: { tokens: 0, usd: null, subscription: false },
		next_action: "done: accepted",
		updated_at: "2026-10-06T10:00:00.000Z",
	};
}

function status(change: ChangeView): StatusView {
	return { schema_version: 1, program: null, change, limits: [] };
}

function report(): EngineeringReport {
	return {
		schema_version: 1,
		change_id: "chg_steps",
		title: "",
		outcome: "accepted",
		candidate: null,
		requirements: [],
		survey: null,
		observations: [],
		judgments: PASSED.map((gate) => ({
			kind: "gate" as const,
			id: gate,
			by: "495 kernel",
			authority: "kernel" as const,
			statement: `${gate} PASS`,
			binding: true,
		})),
		implementation: null,
		residual_risks: [],
	};
}

describe("the names of the steps", () => {
	it("le statut anglais d'un changement accepté, G0 à G5 passées, a la ligne des sept étapes de Scoping à Integration, et le français de Cadrage à Intégration", () => {
		const en = formatStatus(status(accepted()), "en").split("\n");
		assert.ok(
			en.includes(
				"  ✔ Scoping  ✔ Specification  ✔ Qualification  ✔ Design  ✔ Implementation  ✔ Acceptance  ○ Integration",
			),
			en.join("\n"),
		);
		const fr = formatStatus(status(accepted()), "fr").split("\n");
		assert.ok(
			fr.includes(
				"  ✔ Cadrage  ✔ Spécification  ✔ Qualification  ✔ Conception  ✔ Implémentation  ✔ Acceptation  ○ Intégration",
			),
			fr.join("\n"),
		);
	});

	it("le rapport anglais du même changement contient ✔ The kernel passed Scoping, Specification, Qualification, Design, Implementation and Acceptance", () => {
		const lines = formatReport(report(), "en").split("\n");
		assert.ok(
			lines.includes(
				"  ✔ The kernel passed Scoping, Specification, Qualification, Design, Implementation and Acceptance",
			),
			lines.join("\n"),
		);
	});

	it("un changement qui écrit son candidat à la tentative 1 sur 3 dit son étape avant son activité, en anglais et en français", () => {
		const writing: ChangeView = {
			...accepted(),
			phase: "implementation",
			status: "running",
			outcome: "pending",
			next_action: "implement",
		};
		assert.equal(
			formatStatus(status(writing), "en").split("\n")[1],
			"… Implementation · writing the candidate on attempt 1 of 3",
		);
		assert.equal(
			formatStatus(status(writing), "fr").split("\n")[1],
			"… Implémentation · écriture du candidat à la tentative 1 sur 3",
		);
	});

	it("les tableaux des gates du README, d'AGENTS.md et du corpus nomment G0 à G6 de Scoping à Integration en anglais et de Cadrage à Intégration en français", () => {
		assert.deepEqual(gateNames(document("README.md")), STEPS_EN);
		assert.deepEqual(gateNames(document("AGENTS.md")), STEPS_EN);
		assert.deepEqual(gateNames(document("specs/amont/expression-besoins.md")), STEPS_FR);
		assert.deepEqual(gateNames(document("specs/amont/specification-fonctionnelle.md")), STEPS_FR);
	});

	it("le tableau des transitions du corpus nomme Cadrage l'ancienne Clarification et Qualification l'ancien Protocole de vérification", () => {
		const corpus = document("specs/amont/expression-besoins.md");
		const table = corpus.slice(corpus.indexOf("| Phase terminée | Passage normal |")).split("\n\n")[0] ?? "";
		const transitions = rows(table)
			.slice(2)
			.map((cells) => [cells[0], cells[1]]);
		assert.deepEqual(transitions, [
			["Accueil", "Cadrage"],
			["Cadrage", "Spécification"],
			["Spécification", "Qualification"],
			["Qualification", "Conception ou préparation"],
			["Préparation", "Qualification"],
			["Conception", "Implémentation"],
			["Implémentation", "Vérification"],
			["Vérification", "Revue ou décision"],
			["Revue", "Décision"],
			["Décision", "Clôture acceptée ou intégration"],
			["Intégration", "Clôture intégrée"],
		]);
	});
});
