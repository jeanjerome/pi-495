import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exporterDossier } from "../../cycle/src/export.ts";
import { Journal } from "../../cycle/src/journal.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

describe("the export of a landed story's dossier", () => {
	it("names in the exported journal an object the store no longer holds, and exports the ones it holds", async () => {
		const journal = new Journal("e01s05", tempDir("495-", cleanups));
		const garde = await journal.garder("a finding", "text/plain");
		const perdu = { ...garde, digest: `sha256:${"0".repeat(64)}` };
		journal.inscrire("relecture", "tour", { rapports: garde });
		journal.inscrire("recette", "preparee", { transcript: perdu });
		const root = tempDir("495-", cleanups);
		const dir = await exporterDossier(journal, root);
		assert.ok(existsSync(join(dir, "objets", garde.digest.replace("sha256:", ""))));
		const events = readFileSync(join(dir, "journal.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l) as { genre: string; digests?: string[] });
		assert.deepEqual(events.find((e) => e.genre === "objets-absents")?.digests, [perdu.digest]);
	});
});
