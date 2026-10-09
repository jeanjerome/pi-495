/**
 * The status of a change as the owner reads it: what became of the request first, then the gates in
 * one line, the checks of the current candidate, what was used and what to do next — with no
 * identifier, digest or revision of the dossier.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { StatusView } from "../../src/application/views.ts";
import { formatStatus } from "../../src/presentation/structured/text.ts";

const TITLE = "add freeMinutes(busy) beside freeSlots";
const DIGEST = `sha256:${"d".repeat(64)}`;

type ChangeView = NonNullable<StatusView["change"]>;

function pass(gate: string): ChangeView["gates"][number] {
	return { gate, verdict: "PASS", reasons: [], next_action: "continue" };
}

function evidence(control_id: string, verdict: string): ChangeView["evidence"][number] {
	return { evidence_id: `evd_${control_id}`, control_id, verdict, valid: true, current_candidate: true };
}

/** The status of the change accepted at the first of three attempts, gates G0 to G5 passed. */
function accepted(limits: string[] = ["sandbox:seatbelt:qualified"]): StatusView {
	return {
		schema_version: 1,
		program: {
			program_id: "prg_muvojsvvb399",
			title: TITLE,
			project_path: "/tmp/free-slots",
			baseline: null,
			migration: null,
			increments: [{ increment_id: "inc_1", title: TITLE, status: "accepted", gaps: [], removes: [] }],
			set_aside: [],
			exceptions: [],
			milestones: [],
			closed: false,
		},
		change: {
			change_id: "chg_muvojsvvb399c9ce4d",
			increment_id: "inc_1",
			revision: 69,
			phase: "closed",
			status: "completed",
			outcome: "accepted",
			stop_reason: null,
			stop_detail: null,
			resume_lifts_stop: false,
			gates: ["G0", "G1", "G2", "G3", "G4", "G5"].map(pass),
			attempts: { used: 1, max: 3 },
			candidate: { candidate_id: "cand_dbff53b24f15", manifest_digest: DIGEST },
			evidence: [evidence("unit", "PASS"), evidence("coverage", "PASS"), evidence("mutation", "PASS")],
			pending_decisions: [],
			last_intervention: { role: "implement", result: "completed", tool_calls: 12, duration_ms: 64_000 },
			continuations: 0,
			consumption: { tokens: 77_700, usd: 0.1, subscription: true },
			next_action: "done: accepted (export available)",
			updated_at: "2026-10-05T21:00:00.000Z",
		},
		limits,
	};
}

/** The accepted change with its own state replaced by `change`. */
function changed(change: Partial<ChangeView>, limits?: string[]): StatusView {
	const view = accepted(limits);
	return { ...view, change: { ...view.change!, ...change } };
}

describe("the status of a change", () => {
	it("le statut d'un changement accepté à la première de trois tentatives, portes G0 à G5 passées, contrôles unit, coverage et mutation réussis, 77 700 jetons pour ~0,10 $ sur abonnement, est exactement le bloc du premier scénario", () => {
		const text = formatStatus(accepted(), "en");
		assert.equal(
			text,
			[
				`495 · ${TITLE}`,
				"✔ Accepted on attempt 1 of 3",
				"",
				"  ✔ Scoping  ✔ Specification  ✔ Qualification  ✔ Design  ✔ Implementation  ✔ Acceptance  ○ Integration",
				"",
				"  Checks on the candidate",
				"    ✔ unit       passed",
				"    ✔ coverage   passed",
				"    ✔ mutation   passed",
				"",
				"  Spent by agents   77.7k tokens · ~$0.10 (sub)",
				"  Next              /495 review to read the change, /495 report for the details",
			].join("\n"),
		);
		assert.doesNotMatch(text, /chg_|cand_|prg_|sha256:|\br69\b/, "no identifier, digest or revision");
	});

	it("un changement bloqué sur G2 a pour deuxième ligne ✘ Blocked on attempt 2 of 3 — no test can judge R1, et sa ligne Next donne les commandes qui sortent de l'arrêt sans en répéter la cause", () => {
		const lines = formatStatus(
			changed({
				phase: "qualification",
				status: "blocked",
				outcome: "pending",
				gates: [pass("G0"), pass("G1"), { ...pass("G2"), verdict: "FAIL", reasons: ["no test can judge R1"] }],
				attempts: { used: 2, max: 3 },
				candidate: null,
				evidence: [],
				stop_reason: "capability_missing",
				stop_detail: "CAPABILITY_MISSING: protocol not frozen: no test can judge R1 (next: cancel)",
				next_action:
					"blocked: capability_missing — CAPABILITY_MISSING: protocol not frozen: no test can judge R1 (next: cancel)",
			}),
			"en",
		).split("\n");
		assert.equal(lines[1], "✘ Blocked on attempt 2 of 3 — no test can judge R1");
		assert.ok(
			lines.includes(
				"  ✔ Scoping  ✔ Specification  ✘ Qualification  ○ Design  ○ Implementation  ○ Acceptance  ○ Integration",
			),
			lines.join("\n"),
		);
		assert.ok(lines.includes("  Next              /495 cancel"), lines.join("\n"));
		assert.equal(lines.filter((l) => l.includes("no test can judge R1")).length, 1, "the cause is said once");
	});

	it("the reason of a gate that did not pass is shown under the gates when the verdict line does not say it, in progress or waiting for a decision", () => {
		const failedG5 = { ...pass("G5"), verdict: "FAIL", reasons: ["mutation score below 80"] };
		for (const status of ["running", "decision_required"]) {
			const lines = formatStatus(
				changed({ phase: "implementation", status, outcome: "pending", gates: [pass("G0"), failedG5] }),
				"en",
			).split("\n");
			assert.ok(lines.includes("    Acceptance: mutation score below 80"), `${status}:\n${lines.join("\n")}`);
		}
	});

	it("a change in progress says its phase in words on its verdict line and its last intervention while it is open", () => {
		const lines = formatStatus(
			changed({
				phase: "implementation",
				status: "running",
				outcome: "pending",
				last_intervention: { role: "implement", result: "truncated", tool_calls: 12, duration_ms: 64_000 },
				continuations: 1,
				next_action: "implement",
			}),
			"en",
		).split("\n");
		assert.equal(lines[1], "… Implementation · writing the candidate on attempt 1 of 3");
		assert.ok(
			lines.includes(
				"  Last              implement truncated — stopped by the duration budget, 1 resumptions (64s, 12 tool calls)",
			),
			lines.join("\n"),
		);
		assert.ok(lines.includes("  Next              implement"), lines.join("\n"));
	});

	it("a cancelled change is abandoned, with the detail of its stop as its cause", () => {
		const lines = formatStatus(
			changed({
				status: "cancelled",
				outcome: "abandoned",
				stop_reason: "cancelled",
				stop_detail: "cancelled by the owner",
			}),
			"en",
		).split("\n");
		assert.equal(lines[1], "✘ Abandoned on attempt 1 of 3 — cancelled by the owner");
	});

	it("une décision en attente a pour deuxième ligne ⏸ Waiting for your decision — /495 decide", () => {
		const lines = formatStatus(
			changed({
				phase: "scoping",
				status: "decision_required",
				outcome: "pending",
				gates: [],
				pending_decisions: [{ decision_id: "dec_1", interaction: "IH-04" }],
				next_action: "decide: IH-04",
			}),
			"en",
		).split("\n");
		assert.equal(lines[1], "⏸ Waiting for your decision — /495 decide");
	});

	it("un bac à sable qualifié n'est pas nommé, un bac à sable non qualifié donne ⚠ The seatbelt sandbox is not qualified sous le verdict", () => {
		assert.doesNotMatch(formatStatus(accepted(), "en"), /sandbox|seatbelt/);
		const lines = formatStatus(accepted(["sandbox:seatbelt:not-qualified"]), "en").split("\n");
		assert.equal(lines[2], "⚠ The seatbelt sandbox is not qualified", lines.join("\n"));
	});

	it("a status without a change says so and shows any limit other than the sandbox under a warning mark", () => {
		const text = formatStatus(
			{ schema_version: 1, program: null, change: null, limits: ["change chg_x not found"] },
			"en",
		);
		assert.equal(text, "Change: none\n⚠ change chg_x not found");
	});

	it("en français, le verdict est ✔ Accepté à la tentative 1 sur 3, les portes et les contrôles sont nommés dans la langue", () => {
		const lines = formatStatus(accepted(), "fr").split("\n");
		assert.equal(lines[1], "✔ Accepté à la tentative 1 sur 3");
		assert.ok(
			lines.includes(
				"  ✔ Cadrage  ✔ Spécification  ✔ Qualification  ✔ Conception  ✔ Implémentation  ✔ Acceptation  ○ Intégration",
			),
			lines.join("\n"),
		);
		assert.ok(lines.includes("  Contrôles du candidat"), lines.join("\n"));
	});
});
