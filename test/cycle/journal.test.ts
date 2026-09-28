import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Journal, racineCycle } from "../../cycle/src/journal.ts";
import { tempDir } from "../helpers/fixtures.ts";

describe("the journal of a story", () => {
	it("appends each event when it is observed and reads them back in order", () => {
		const journal = new Journal("e01s05", tempDir());
		journal.inscrire("rouge-vert", "rouge", { tache: 1, message: "revokeQuestion is not a function" });
		journal.inscrire("rouge-vert", "vert", { tache: 1, commit: "abc" });
		const events = journal.lire();
		assert.deepEqual(
			events.map((e) => [e.pas, e.genre, e.tache]),
			[
				["rouge-vert", "rouge", 1],
				["rouge-vert", "vert", 1],
			],
		);
		assert.match(events[0]!.at, /^\d{4}-\d{2}-\d{2}T/);
		assert.equal(journal.dernier("vert")?.commit, "abc");
		assert.equal(journal.dernier("vert", "recette"), null);
		assert.equal(readFileSync(join(journal.dir, "journal.jsonl"), "utf8").split("\n").length, 3);
	});

	it("names the next step as the first one no fini event closes", () => {
		const journal = new Journal("e01s05", tempDir());
		assert.equal(journal.prochainPas(), "story");
		journal.inscrire("story", "fini");
		journal.inscrire("rouge-vert", "fini");
		assert.equal(journal.prochainPas(), "autocontrole");
		for (const pas of ["autocontrole", "relecture", "recette", "versement"] as const) journal.inscrire(pas, "fini");
		assert.equal(journal.prochainPas(), null);
	});

	it("keeps what an event points at in a content-addressed store shared by every story", async () => {
		const racine = tempDir();
		const a = new Journal("e01s05", racine);
		const b = new Journal("e01s06", racine);
		const ref = await a.garder("transcript");
		assert.equal(ref.algorithm, "sha256");
		assert.equal(new TextDecoder().decode((await b.objets.get(ref)) ?? new Uint8Array()), "transcript");
	});

	it("lives under ~/.495/cycle unless CYCLE_495_DIR says otherwise", () => {
		assert.equal(racineCycle({ CYCLE_495_DIR: "/tmp/x" }), "/tmp/x");
		assert.match(racineCycle({}), /\.495\/cycle$/);
	});
});
