/**
 * V2 — each intervention journals, at its start, where the model it runs with sits (SEC-05). The
 * location is read from the address Pi holds for the model, in the same reading as the model the
 * capability check judges; the address itself reaches neither the journal nor the export.
 */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { selectedModel } from "../../src/extension/conduct.ts";
import { exportChange } from "../../src/export/export-service.ts";
import type { ModelSelection } from "../../src/ports/execution.ts";
import { HUMAN } from "../helpers/change-fixture.ts";
import { fixtureTs, initRepo, tempDir } from "../helpers/fixtures.ts";
import { makeHarness, type TestHarness } from "../helpers/harness-fixture.ts";

/** Found anywhere in a dossier, this can only have been copied from the address. */
const ADDRESS_SENTINEL = "address-kept-private-7f3a";

/** The context of a command, as Pi hands it, with a model reached at `baseUrl`. */
function commandContext(provider: string, id: string, baseUrl: string): ExtensionCommandContext {
	return { model: { provider, id, baseUrl }, thinkingLevel: "off" } as unknown as ExtensionCommandContext;
}

const LOCAL = commandContext("omlx", "local-1", `http://127.0.0.1:8000/${ADDRESS_SENTINEL}/v1?key=${ADDRESS_SENTINEL}`);
const REMOTE = commandContext("acme-hosted", "acme-large", `https://api.acme-hosted.example/${ADDRESS_SENTINEL}/v1`);

const cleanups: string[] = [];
afterEach(() => {
	for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function startChange(t: TestHarness): Promise<string> {
	cleanups.push(t.root);
	const project = tempDir("495-location-");
	cleanups.push(project);
	fixtureTs(project);
	initRepo(project);
	const { change } = await t.harness.start({ project_path: project, request_text: "x", actor: HUMAN });
	return change.change_id;
}

/** The model each intervention journaled at its start, in order. */
function startedWith(t: TestHarness, changeId: string): ModelSelection[] {
	return t.ledger
		.readChangeEvents(changeId)
		.filter((e) => e.type === "intervention.started")
		.map((e) => (e.event as { model: ModelSelection }).model);
}

/** Exports the change and returns every file of the dossier, by path. */
async function exported(t: TestHarness, changeId: string): Promise<Map<string, string>> {
	const destination = tempDir("495-location-export-");
	cleanups.push(destination);
	rmSync(destination, { recursive: true, force: true });
	await exportChange(t.ledger, t.objects, {
		change_id: changeId,
		destination,
		redact: false,
		now: "2026-09-24T00:00:00Z",
		producer: "test",
	});
	const files = new Map<string, string>();
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) walk(path);
			else files.set(path.slice(destination.length + 1), readFileSync(path, "latin1"));
		}
	};
	walk(destination);
	return files;
}

describe("where the model of an intervention sits, journaled at its start (SEC-05)", () => {
	it("journals a model reached at a loopback address as on this machine, with its provider and model (§5, 6a)", async () => {
		const t = makeHarness();
		const changeId = await startChange(t);
		await t.harness.advance(changeId, { max_steps: 1, readModel: () => selectedModel(LOCAL) });
		assert.deepEqual(startedWith(t, changeId), [
			{ provider_id: "omlx", model_id: "local-1", thinking_level: "off", location: "on_machine" },
		]);
	});

	it("never writes the address into the journal or the export", async () => {
		const t = makeHarness();
		const changeId = await startChange(t);
		await t.harness.advance(changeId, { max_steps: 1, readModel: () => selectedModel(LOCAL) });
		await t.harness.advance(changeId, { max_steps: 4, readModel: () => selectedModel(REMOTE) });
		assert.equal(startedWith(t, changeId).length, 2, "both models were started");
		const journal = JSON.stringify(t.ledger.readChangeEvents(changeId));
		assert.equal(journal.includes(ADDRESS_SENTINEL), false, "an address may carry a token or a private path");
		const leaking = [...(await exported(t, changeId))]
			.filter(([, text]) => text.includes(ADDRESS_SENTINEL))
			.map(([path]) => path);
		assert.deepEqual(leaking, [], "a dossier is exportable: the address must not travel with it");
	});

	it("journals a model selected off this machine after one on it, and the export shows both (6b)", async () => {
		const t = makeHarness();
		const changeId = await startChange(t);
		await t.harness.advance(changeId, { max_steps: 1, readModel: () => selectedModel(LOCAL) });
		await t.harness.advance(changeId, { max_steps: 4, readModel: () => selectedModel(REMOTE) });
		assert.deepEqual(
			startedWith(t, changeId).map((m) => [m.provider_id, m.location]),
			[
				["omlx", "on_machine"],
				["acme-hosted", "off_machine"],
			],
		);
		const events = (await exported(t, changeId)).get("events.jsonl") ?? "";
		const exportedLocations = events
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as { type: string; event: { model?: ModelSelection } })
			.filter((e) => e.type === "intervention.started")
			.map((e) => e.event.model?.location);
		assert.deepEqual(
			exportedLocations,
			["on_machine", "off_machine"],
			"the reader of the dossier sees where each went",
		);
	});

	it("situates a model whose address is missing off this machine (6f)", async () => {
		const t = makeHarness();
		const changeId = await startChange(t);
		const noAddress = { model: { provider: "acme-hosted", id: "acme-large" }, thinkingLevel: "off" };
		await t.harness.advance(changeId, {
			max_steps: 1,
			readModel: () => selectedModel(noAddress as unknown as ExtensionCommandContext),
		});
		assert.deepEqual(
			startedWith(t, changeId).map((m) => m.location),
			["off_machine"],
		);
	});

	it("reads a start journaled before the location was recorded as absent, never as on this machine (6j)", async () => {
		const t = makeHarness();
		const changeId = await startChange(t);
		const before = { provider_id: "omlx", model_id: "local-1", thinking_level: "off" } as ModelSelection;
		await t.harness.advance(changeId, { max_steps: 1, readModel: () => before });
		const interventions = t.ledger.loadChange(changeId)?.state.interventions ?? [];
		assert.equal(interventions.length, 1);
		assert.equal(interventions[0]?.model.location, undefined);
	});
});
