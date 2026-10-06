/**
 * The status of a blocked change says its cause once, on the verdict line, and its Next line gives the
 * /495 commands that lead out of the stop rather than the next action the kernel composes.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { StatusView } from "../../src/application/views.ts";
import { formatStatus } from "../../src/presentation/structured/text.ts";

const TITLE = "add freeMinutes(busy) beside freeSlots";
const CAUSE =
	"protocol not frozen: control unit: positive witness gave FAIL, expected PASS; control unit: negative witness gave PASS, expected FAIL";

/** A change blocked on `stop_detail`, with the next action the kernel composes for it. */
function blocked(stop_detail: string, retryable = false): StatusView {
	return {
		schema_version: 1,
		program: {
			program_id: "prg_muvojsvvb399",
			title: TITLE,
			project_path: "/tmp/free-slots",
			baseline: null,
			increments: [{ increment_id: "inc_1", title: TITLE, status: "blocked", gaps: [] }],
			set_aside: [],
			exceptions: [],
			milestones: [],
			closed: false,
		},
		change: {
			change_id: "chg_muvojsvvb399c9ce4d",
			increment_id: "inc_1",
			revision: 12,
			phase: "verification_design",
			status: "blocked",
			outcome: "pending",
			stop_reason: "capability_missing",
			stop_detail,
			resume_lifts_stop: retryable,
			gates: [
				{ gate: "G0", verdict: "PASS", reasons: [], next_action: "continue" },
				{ gate: "G1", verdict: "PASS", reasons: [], next_action: "continue" },
			],
			attempts: { used: 1, max: 3 },
			candidate: null,
			evidence: [],
			pending_decisions: [],
			last_intervention: null,
			continuations: 0,
			consumption: { tokens: 0, usd: null, subscription: false },
			next_action: `blocked: capability_missing — ${stop_detail}${retryable ? " — resume retries it" : ""}`,
			updated_at: "2026-10-06T08:00:00.000Z",
		},
		limits: ["sandbox:seatbelt:qualified"],
	};
}

describe("the Next line of a blocked change", () => {
	it("un changement bloqué dont la prochaine action est blocked: capability_missing — CAPABILITY_MISSING: protocol not frozen: … (next: cancel) a un statut dont la ligne du verdict commence par ✘ Blocked sans CAPABILITY_MISSING: ni (next:, dont la ligne Next est Next    /495 cancel, et où la phrase protocol not frozen n'apparaît qu'une fois", () => {
		const text = formatStatus(blocked(`CAPABILITY_MISSING: ${CAUSE} (next: cancel)`), "en");
		const lines = text.split("\n");
		assert.match(lines[1]!, /^✘ Blocked/, text);
		assert.doesNotMatch(lines[1]!, /CAPABILITY_MISSING:|\(next:/, text);
		assert.ok(lines.includes("  Next    /495 cancel"), text);
		assert.equal(text.split("protocol not frozen").length - 1, 1, text);
	});

	it("un arrêt qui nomme (next: resume, cancel) a pour ligne Next    /495 resume, /495 cancel", () => {
		const text = formatStatus(blocked(`CAPABILITY_MISSING: ${CAUSE} (next: resume, cancel)`, true), "en");
		assert.ok(text.split("\n").includes("  Next    /495 resume, /495 cancel"), text);
	});

	it("un arrêt qui nomme une étape du noyau, (next: correct_or_reject, cancel), a pour ligne Next    /495 cancel, sans /495 correct_or_reject", () => {
		const text = formatStatus(blocked(`PRECONDITION_FAILED: ${CAUSE} (next: correct_or_reject, cancel)`), "en");
		assert.ok(text.split("\n").includes("  Next    /495 cancel"), text);
		assert.doesNotMatch(text, /correct_or_reject/, text);
	});
});

describe("a stop that does not come from a gate", () => {
	it("un changement bloqué à la tentative 2 sur 3, dont G5 a échoué avec requirement R1: FAIL (unit=FAIL), arrêté sur stagnation avec le détail 2 identical candidates without measurable progress et resume_lifts_stop faux, a pour deuxième ligne ✘ Blocked on attempt 2 of 3 — 2 identical candidates without measurable progress, une ligne Acceptance: requirement R1: FAIL (unit=FAIL), la ligne Next    /495 cancel, aucune /495 resume, et la phrase du détail une seule fois", () => {
		const detail = "2 identical candidates without measurable progress";
		const view = blocked(detail);
		const change = view.change!;
		const pass = (gate: string) => ({ gate, verdict: "PASS", reasons: [], next_action: "continue" });
		const text = formatStatus(
			{
				...view,
				change: {
					...change,
					phase: "verifying",
					stop_reason: "stagnation",
					next_action: `blocked: stagnation — ${detail}`,
					attempts: { used: 2, max: 3 },
					gates: [
						...["G0", "G1", "G2", "G3", "G4"].map(pass),
						{ gate: "G5", verdict: "FAIL", reasons: ["requirement R1: FAIL (unit=FAIL)"], next_action: "retry" },
					],
				},
			},
			"en",
		);
		const lines = text.split("\n");
		assert.equal(lines[1], `✘ Blocked on attempt 2 of 3 — ${detail}`, text);
		assert.ok(lines.includes("    Acceptance: requirement R1: FAIL (unit=FAIL)"), text);
		assert.ok(lines.includes("  Next    /495 cancel"), text);
		assert.doesNotMatch(text, /\/495 resume/, text);
		assert.equal(text.split(detail).length - 1, 1, text);
	});
});
