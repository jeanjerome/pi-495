import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Journal, racineCycle } from "../../cycle/src/journal.ts";
import { tempDir, removedAfterEach } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

describe("the journal of a story", () => {
	it("appends each event when it is observed and reads them back in order", () => {
		const journal = new Journal("e01s05", tempDir("495-", cleanups));
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
		const journal = new Journal("e01s05", tempDir("495-", cleanups));
		assert.equal(journal.prochainPas(), "story");
		journal.inscrire("story", "fini");
		journal.inscrire("rouge-vert", "fini");
		assert.equal(journal.prochainPas(), "autocontrole");
		for (const pas of ["autocontrole", "relecture", "recette", "versement"] as const) journal.inscrire(pas, "fini");
		assert.equal(journal.prochainPas(), null);
	});

	it("names the head a step's run started from, across a resumed launch but not across another step or a reopening", () => {
		const journal = new Journal("e01s05", tempDir("495-", cleanups));
		assert.equal(journal.debutDePassage("rouge-vert"), null);
		journal.inscrire("story", "fini");
		journal.inscrire("rouge-vert", "debute", { revision: "aaa" });
		journal.inscrire("rouge-vert", "bloque", { detail: "stopped" });
		journal.inscrire("rouge-vert", "debute", { revision: "bbb" });
		assert.equal(journal.debutDePassage("rouge-vert"), "aaa");
		journal.inscrire("rouge-vert", "fini");
		journal.inscrire("autocontrole", "fini");
		journal.inscrire("recette", "rouvert", { motif: "gap" });
		journal.inscrire("story", "fini");
		assert.equal(journal.debutDePassage("rouge-vert"), null);
		journal.inscrire("rouge-vert", "debute", { revision: "ccc" });
		assert.equal(journal.debutDePassage("rouge-vert"), "ccc");
	});

	it("lists the events of a step's run since the last event of another step, none when another step wrote last", () => {
		const journal = new Journal("e01s05", tempDir("495-", cleanups));
		assert.deepEqual(journal.passage("relecture"), []);
		journal.inscrire("relecture", "ouverts", { tour: 1 });
		journal.inscrire("autocontrole", "fini");
		journal.inscrire("relecture", "debute");
		journal.inscrire("relecture", "bloque");
		journal.inscrire("relecture", "debute");
		assert.deepEqual(
			journal.passage("relecture").map((e) => e.genre),
			["debute", "bloque", "debute"],
		);
		assert.deepEqual(journal.passage("autocontrole"), []);
	});

	it("keeps what an event points at in a content-addressed store shared by every story", async () => {
		const racine = tempDir("495-", cleanups);
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

	it("takes back out what another writer adds or removes after a survey, and keeps what this process wrote meanwhile", () => {
		const racine = tempDir("495-", cleanups);
		const journal = new Journal("e01s05", racine);
		const fichier = join(journal.dir, "journal.jsonl");
		const vide = journal.releve();
		assert.equal(journal.retirerEcritsEtrangers(vide), false, "nothing written, not even the file");

		journal.inscrire("recette", "debute");
		const releve = journal.releve();
		new Journal("e01s05", racine).inscrire("relecture", "session", { nom: "relecteur-a" });
		assert.equal(journal.retirerEcritsEtrangers(releve), false, "another Journal of this process writes too");

		appendFileSync(fichier, `${JSON.stringify({ at: "x", pas: "recette", genre: "controle", verdict: "PASS" })}\n`);
		journal.inscrire("recette", "session", { nom: "recette" });
		assert.equal(journal.retirerEcritsEtrangers(releve), true);
		assert.deepEqual(
			journal.lire().map((e) => e.genre),
			["debute", "session", "session"],
		);

		const avant = journal.releve();
		writeFileSync(fichier, "");
		assert.equal(journal.retirerEcritsEtrangers(avant), true, "a journal emptied");
		assert.equal(journal.lire().length, 3);
	});
});
