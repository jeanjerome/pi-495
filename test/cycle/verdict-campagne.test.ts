import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { jugerCampagne, lireEtat, type EtatLu, type PreuveLue } from "../../cycle/src/verdict-campagne.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const ACCEPTE: EtatLu = { statut: "completed", arret: null, portes: { G2: "PASS", G5: "PASS" } };
const preuve = (
	controle: string,
	verdict: string,
	faits: Record<string, unknown> = {},
	protocole = "prt_1",
): PreuveLue => ({
	controle,
	verdict,
	protocole,
	faits,
});

describe("Campaign verdict: what only the harness can have caused", () => {
	it("given a campaign accepted with every control read, then it has no defect and reports each gate and control", () => {
		const verdict = jugerCampagne(ACCEPTE, [
			preuve("unit", "PASS"),
			preuve("coverage", "PASS", { introduced_lines: 12, reports: 1 }),
			preuve("mutation", "PASS", { scoped_files: 1, reports: 1 }),
		]);
		assert.deepEqual(verdict.defauts, []);
		assert.deepEqual(verdict.constats, [
			"status completed",
			"G2 PASS",
			"G5 PASS",
			"unit PASS on the candidate",
			"coverage PASS on the candidate",
			"mutation PASS on the candidate",
		]);
	});

	it("given a candidate that fails G5 on the model's own tests, then the campaign still has no defect", () => {
		const verdict = jugerCampagne(
			{ statut: "blocked", arret: "attempts_exhausted", portes: { G2: "PASS", G5: "FAIL" } },
			[
				preuve("unit", "FAIL", { failures: 1 }),
				preuve("mutation", "FAIL", { scoped_files: 2, reports: 1, surviving_mutants: 4 }),
			],
		);
		assert.deepEqual(verdict.defauts, []);
	});

	it("given a change blocked on capability_missing at G2, then both are defects", () => {
		const verdict = jugerCampagne({ statut: "blocked", arret: "capability_missing", portes: { G2: "FAIL" } }, []);
		assert.deepEqual(verdict.defauts, [
			"the change is blocked on capability_missing",
			"G2 is FAIL: the protocol was not frozen",
		]);
	});

	it("given a campaign that stopped before G2, then it is a defect that G2 was not reached", () => {
		const verdict = jugerCampagne({ statut: "decision_required", arret: null, portes: { G0: "PASS" } }, []);
		assert.deepEqual(verdict.defauts, ["G2 is not reached: the protocol was not frozen"]);
	});

	it("given a campaign past G2 that never judged the candidate, then it is a defect", () => {
		const verdict = jugerCampagne({ statut: "blocked", arret: "budget", portes: { G2: "PASS" } }, []);
		assert.deepEqual(verdict.defauts, ["the campaign did not reach the verification of the candidate"]);
	});

	it("given a control INDETERMINATE on the candidate, then it is a defect", () => {
		const verdict = jugerCampagne(ACCEPTE, [preuve("structure", "INDETERMINATE")]);
		assert.deepEqual(verdict.defauts, ["structure is INDETERMINATE on the candidate"]);
	});

	it("given a coverage or mutation sensor that read no report although the candidate introduced code, then it is a defect, and none when nothing was introduced", () => {
		const read = jugerCampagne(ACCEPTE, [
			preuve("coverage", "FAIL", { introduced_lines: 5, reports: 0 }),
			preuve("mutation", "FAIL", { scoped_files: 1, reports: 0 }),
		]);
		assert.deepEqual(read.defauts, [
			"coverage read no report although the candidate introduced code",
			"mutation read no report although the candidate introduced code",
		]);
		const nothing = jugerCampagne(ACCEPTE, [
			preuve("coverage", "PASS", { introduced_lines: 0, reports: 0 }),
			preuve("mutation", "PASS", { scoped_files: 0, reports: 0 }),
		]);
		assert.deepEqual(nothing.defauts, []);
	});

	it("given qualification and reference evidence beside the candidate's, then only the last evidence of the candidate counts for each control", () => {
		const verdict = jugerCampagne(ACCEPTE, [
			preuve("coverage", "FAIL", { introduced_lines: 29, reports: 0 }, "qualification"),
			preuve("mutation", "INDETERMINATE", { run: "reference" }),
			preuve("unit", "FAIL", { failures: 1 }),
			preuve("unit", "PASS"),
		]);
		assert.deepEqual(verdict.defauts, []);
		assert.deepEqual(verdict.constats.slice(3), ["unit PASS on the candidate"]);
	});
});

describe("Campaign dossier: what the campaign left to read", () => {
	it("given a dossier where no change was recorded, then reading its state names the database and says no change is there", () => {
		const dossier = tempDir("495-", cleanups);
		const base = new DatabaseSync(join(dossier, "state.sqlite"));
		base.exec("create table changes (state text)");
		base.close();
		assert.throws(() => lireEtat(dossier), {
			message: `${join(dossier, "state.sqlite")} holds no change: the campaign stopped before /495 start created one`,
		});
	});
});
