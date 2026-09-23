/**
 * V2 — the intervention bounds read back from a kept dossier, without Pi (AGT-02, AGT-07, NFR-06).
 * Each dossier is written through the real ledger from kernel decisions, so its events have the
 * shape a campaign leaves. A dossier written before the cost was recorded is the same ledger with
 * the field left out of its finished interventions, as the harness wrote them until then.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { SqliteLedger } from "../../src/adapters/storage-sqlite/ledger.ts";
import type { ChangeEvent } from "../../src/domain/change/events.ts";
import { type InterventionCost, unknownCost } from "../../src/domain/change/state.ts";
import { KERNEL, Runner, tick } from "../helpers/change-fixture.ts";

const SCRIPT = join(process.cwd(), "scripts", "measure-budgets.ts");

/** What one intervention spent, as its finished event records it. */
interface Spent {
	tool_calls: number;
	duration_ms: number;
	tokens_known: number;
	cost: InterventionCost | "not recorded";
}

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "495-measure-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function priced(usd: number, subscription: boolean): InterventionCost {
	return { usd, unknown_reason: null, basis: "host_catalogue", subscription };
}

function spent(tool_calls: number, duration_ms: number, cost: Spent["cost"] = priced(0.01, true)): Spent {
	return { tool_calls, duration_ms, tokens_known: 1000, cost };
}

/** A dossier whose implementation ran one intervention per entry, written through the real ledger. */
function writeDossier(interventions: Spent[], config?: unknown): string {
	const runner = new Runner().toImplementing();
	interventions.forEach((s, index) => {
		const intervention_id = `int_${index + 1}`;
		runner.run({
			type: "intervention.start",
			at: tick(),
			actor: KERNEL,
			intervention_id,
			role: "implement",
			attempt_id: "att_1",
			model: { provider_id: "anthropic", model_id: "claude-sonnet-5", thinking_level: "medium" },
			profile_id: "implement",
			profile_qualified: true,
		});
		runner.run({
			type: "intervention.finish",
			at: tick(),
			actor: KERNEL,
			intervention_id,
			result: "completed",
			counters: { tool_calls: s.tool_calls, duration_ms: s.duration_ms, tokens_known: s.tokens_known, delegations: 0 },
			detail: null,
			cost: s.cost === "not recorded" ? unknownCost("left out below") : s.cost,
			imposed_layers: [],
		});
	});
	const events: ChangeEvent[] = runner.events.map((event) => {
		if (event.type !== "intervention.finished") return event;
		const index = Number(event.intervention_id.slice("int_".length)) - 1;
		if (interventions[index]?.cost !== "not recorded") return event;
		const { cost: _left_out, ...older } = event;
		return older;
	});
	const ledger = new SqliteLedger(join(dir, "state.sqlite"));
	ledger.appendChange("chg_1", 0, events, { correlation_id: "cor_1" });
	ledger.close();
	if (config !== undefined) writeFileSync(join(dir, "config.json"), JSON.stringify(config));
	return dir;
}

function measure(root: string): { status: number | null; stdout: string; stderr: string } {
	const run = spawnSync(process.execPath, [SCRIPT, root], { encoding: "utf8" });
	return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** The line of the n-th intervention, in the table or in a section that lists them one by one. */
function lineOf(output: string, section: string, ordinal: number | "ensemble"): string {
	const start = output.indexOf(section);
	assert.ok(start >= 0, `no section "${section}" in:\n${output}`);
	const lines = output.slice(start).split("\n").slice(1);
	const label = ordinal === "ensemble" ? /^\s*ensemble\b/ : new RegExp(`^\\s*${ordinal}\\s+implement\\b`);
	const line = lines.find((l) => label.test(l));
	assert.ok(line, `no line for ${ordinal} under "${section}" in:\n${output}`);
	return line;
}

const NO_ZERO_COST = /(^|\s)0(,0+)?\s\$/m;

describe("measure-budgets: the bounds read back from a kept dossier (AGT-02, AGT-07)", () => {
	it("gives each intervention its tool calls, duration, rate, tokens and the cost the host totalled", () => {
		const root = writeDossier([
			{ tool_calls: 12, duration_ms: 180_000, tokens_known: 40_000, cost: priced(0.0421, true) },
		]);
		const { status, stdout, stderr } = measure(root);
		assert.equal(status, 0, stderr);
		const row = lineOf(stdout, "rôle", 1);
		assert.match(row, /\b12\b/);
		assert.match(row, /\b3 min\b/);
		assert.match(row, /\b4,0 \/min\b/);
		assert.match(row, /\b40\s000\b/);
		assert.match(row, /0,0421 \$/);
		const cost = lineOf(stdout, "coût —", 1);
		assert.match(cost, /catalogue de l'hôte/);
		assert.match(cost, /par abonnement/);
	});

	it("says which bound in force falls first at each rate, and presents it as a projection", () => {
		const root = writeDossier([spent(12, 180_000), spent(32, 120_000)]);
		const { status, stdout, stderr } = measure(root);
		assert.equal(status, 0, stderr);
		assert.match(stdout, /100 appels d'outils et 20 min par intervention/);
		assert.match(stdout, /projection/);
		// 4 calls a minute reach 20 minutes after 80 calls; 16 a minute reach 100 calls in 6 min 15 s.
		assert.match(lineOf(stdout, "projection", 1), /la durée tombe la première, vers 80 appels/);
		assert.match(lineOf(stdout, "projection", 2), /le nombre d'appels tombe le premier, au bout de 6 min 15 s/);
		// 44 calls in 5 minutes: 8.8 a minute reach 100 calls in 11 min 22 s.
		assert.match(
			lineOf(stdout, "projection", "ensemble"),
			/le nombre d'appels tombe le premier, au bout de 11 min 22 s/,
		);
	});

	it("reads the bounds in force from the dossier's own configuration, and says the ledger does not keep them", () => {
		const root = writeDossier([spent(12, 180_000)], { policy: { budgets: { tool_calls_per_intervention: 40 } } });
		const { status, stdout, stderr } = measure(root);
		assert.equal(status, 0, stderr);
		assert.match(stdout, /40 appels d'outils et 20 min par intervention/);
		assert.match(stdout, /config\.json/);
		assert.match(stdout, /le journal ne garde pas/);
		assert.match(lineOf(stdout, "projection", 1), /le nombre d'appels tombe le premier, au bout de 10 min/);
	});

	it("projects nothing from an intervention that made no call or whose duration is not measured", () => {
		const root = writeDossier([spent(0, 60_000), spent(5, 0)]);
		const { status, stdout, stderr } = measure(root);
		assert.equal(status, 0, stderr);
		assert.match(lineOf(stdout, "projection", 1), /aucun appel/);
		assert.match(lineOf(stdout, "projection", 2), /aucune durée mesurée/);
	});

	it("says a cost the host could not total is unknown, with its reason, and never shows it as zero", () => {
		const reason = "the host catalogue declares no rate for this model";
		const root = writeDossier([spent(4, 60_000, priced(0.03, false)), spent(4, 60_000, unknownCost(reason, false))]);
		const { status, stdout, stderr } = measure(root);
		assert.equal(status, 0, stderr);
		assert.match(lineOf(stdout, "rôle", 2), /inconnu/);
		assert.ok(lineOf(stdout, "coût —", 2).includes(reason));
		assert.match(lineOf(stdout, "coût —", 1), /hors abonnement/);
		// The known part is a floor, not a total: the unknown one may be anything but negative.
		assert.match(lineOf(stdout, "rôle", "ensemble"), /au moins 0,03 \$/);
		assert.doesNotMatch(stdout, NO_ZERO_COST);
	});

	it("says the cost is not recorded in a dossier written before it was, instead of showing zero", () => {
		const root = writeDossier([spent(4, 60_000, "not recorded"), spent(6, 90_000, "not recorded")]);
		const { status, stdout, stderr } = measure(root);
		assert.equal(status, 0, stderr);
		assert.match(lineOf(stdout, "rôle", 1), /non inscrit/);
		assert.match(lineOf(stdout, "rôle", "ensemble"), /non inscrit/);
		assert.match(stdout, /écrit avant que le coût soit inscrit/);
		assert.doesNotMatch(stdout, NO_ZERO_COST);
	});

	it("leaves the dossier it reads as it found it", () => {
		const root = writeDossier([spent(12, 180_000)]);
		const digest = (): string =>
			createHash("sha256")
				.update(readFileSync(join(root, "state.sqlite")))
				.digest("hex");
		const before = digest();
		assert.equal(measure(root).status, 0);
		assert.equal(digest(), before);
	});

	it("refuses a dossier whose configuration cannot be read, instead of projecting from the defaults", () => {
		const root = writeDossier([spent(12, 180_000)], ["not an object"]);
		const { status, stdout, stderr } = measure(root);
		assert.equal(status, 2, stderr);
		assert.match(stderr, /config\.json cannot be read/);
		assert.doesNotMatch(stdout, /par intervention/, "no bound is printed that the dossier did not set");
	});

	it("refuses a directory that holds no dossier", () => {
		const { status, stderr } = measure(dir);
		assert.equal(status, 2);
		assert.match(stderr, /state\.sqlite/);
	});
});
