/**
 * V2 — how two dossiers read back, read-only and without Pi, class the way each session ended. Each
 * dossier is written by the real harness driving a scripted agent, so its ledger and object store
 * have the shape a campaign leaves.
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { makeHarness, specReport, type TestHarness } from "../helpers/harness-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import type { AgentScript } from "../../src/adapters/pi-worker/scripted-agent.ts";

const SCRIPT = join(process.cwd(), "scripts", "compare-dossiers.ts");

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

const read = { kind: "tool" as const, tool: "read" };

/** A dossier whose one change stopped on its specification, written by the harness and closed. */
async function dossierStoppedOnSpecification(specify: AgentScript, policy = {}): Promise<string> {
	const p = tempDir("495-proj-");
	cleanups.push(p);
	fixtureTs(p);
	initRepo(p);
	const t: TestHarness = makeHarness({ policy, scripts: { specify } });
	cleanups.push(t.root);
	const { change } = await t.harness.start({ project_path: p, request_text: "Keep greet behaviour", actor: HUMAN });
	await t.harness.advance(change.change_id, { max_steps: 20 });
	t.ledger.close();
	return t.root;
}

function compare(root: string): string {
	const run = spawnSync(process.execPath, [SCRIPT, "--local", root, "--distant", root], { encoding: "utf8" });
	assert.notEqual(run.status, 2, run.stderr);
	return run.stdout;
}

function rowOf(output: string, label: string): string {
	const line = output.split("\n").find((l) => l.startsWith(label));
	assert.ok(line, `no row "${label}" in:\n${output}`);
	return line;
}

describe("compare-dossiers: how the end of each session is classed", () => {
	it("a session stopped by its tool-call bound is listed as stopped, not as a report the output schema refused", async () => {
		const root = await dossierStoppedOnSpecification(
			{ steps: [read, read, read, { kind: "complete", output: specReport() }] },
			{ budgets: { tool_calls_per_intervention: 2 } },
		);
		const output = compare(root);
		assert.match(rowOf(output, "schema refusals"), /^schema refusals\s+0\s+0\s*$/);
		assert.match(rowOf(output, "unfinished interventions"), /^unfinished interventions\s+1\s+1\s*$/);
		assert.match(
			output,
			/^\s+specify\s+cancelled: stopped by the tool call budget: tool call budget exceeded \(3\/2\)/m,
		);
		assert.doesNotMatch(output, /intervention (failed|cancelled)/, "the ledger's end, not the worker's, is shown");
	});

	it("a report the output schema refused is still listed as one", async () => {
		const root = await dossierStoppedOnSpecification({
			steps: [{ kind: "complete", output: { not: "a specification" }, output_valid: false }],
		});
		const output = compare(root);
		assert.match(rowOf(output, "schema refusals"), /^schema refusals\s+1\s+1\s*$/);
		assert.match(rowOf(output, "unfinished interventions"), /^unfinished interventions\s+0\s+0\s*$/);
	});
});
