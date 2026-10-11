import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { gitCmd, tempDir, removedAfterEach } from "../helpers/fixtures.ts";
import { NODE, PASSING_TEST, SHOUT_CODE, SHOUT_TEST, STORY, depot } from "../helpers/cycle.ts";

const MAIN = join(import.meta.dirname, "..", "..", "cycle", "src", "main.ts");
const cleanups = removedAfterEach();

function commit(root: string, files: Record<string, string>, message: string): string {
	for (const [rel, content] of Object.entries(files)) {
		mkdirSync(join(root, rel, ".."), { recursive: true });
		writeFileSync(join(root, rel), content);
	}
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", message]);
	return gitCmd(root, ["rev-parse", "HEAD"]).trim();
}

function journal(racine: string, story: string, evenements: Record<string, unknown>[]): void {
	mkdirSync(join(racine, story), { recursive: true });
	writeFileSync(join(racine, story, "journal.jsonl"), evenements.map((e) => `${JSON.stringify(e)}\n`).join(""));
}

/** A story that landed `heures` after it started, its session reporting `cout`, after `ecarts` acceptance gaps. */
function storyVersee(racine: string, id: string, heures: number, cout: number, ecarts: number): void {
	journal(racine, id, [
		{ at: "2026-10-01T10:00:00.000Z", pas: "story", genre: "debute" },
		{ at: "2026-10-01T10:30:00.000Z", pas: "rouge-vert", genre: "session", ok: true, cout_usd: cout },
		...Array.from({ length: ecarts }, () => ({
			at: "2026-10-01T10:40:00.000Z",
			pas: "recette",
			genre: "rouvert",
			motif: "gap",
		})),
		{
			at: new Date(Date.parse("2026-10-01T10:00:00.000Z") + heures * 3_600_000).toISOString(),
			pas: "versement",
			genre: "verse",
		},
	]);
}

/** A promise held by examples alone. */
const EXEMPLES = [{ moyen: "exemples", retenu: true, raison: null }];
/** A promise held by examples and by a state model TLC explores, named by its manifest. */
const MODELE_D_ETATS = [
	...EXEMPLES,
	{
		moyen: "modele-d-etats",
		retenu: true,
		raison: null,
		proprietes: ["Shouted"],
		manifestes: ["specs/formal/greet.json"],
	},
];

/** Writes the story `id` in `root`, its companion keeping `moyens` for its one promise. */
function storyAvecCompagnon(root: string, id: string, moyens: Record<string, unknown>[]): void {
	const dir = join(root, "specs", "stories", "e01");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${id}-greet-shouts.md`), STORY.replace("Story : e01s05", `Story : ${id}`));
	const promesse = {
		id: "P1",
		scenario: "greet shouts",
		categorie: "nouveau-comportement",
		observation: "the greeting is upper case",
		oracles: [{ tache: 1, cas: "test/shout.test.js", assertion: "the greeting is upper case" }],
		moyens,
	};
	writeFileSync(
		join(dir, `${id}-greet-shouts.verification.json`),
		JSON.stringify({ version: 1, story: id, promesses: [promesse] }),
	);
}

/** What `cycle mesures` prints, as far as these tests read it. */
interface Bilan {
	stories: Record<string, unknown>[];
	mediane_duree_ms: number | null;
	profils: Record<string, { stories: string[]; mediane_duree_ms: number | null; mediane_cout_usd: number | null }>;
	recommandations: {
		profil: string;
		recommandation: string;
		obligations_maintenues: string[];
		obligations_retirees: string[];
	}[];
}

/** `cycle mesures` run on `designations`, read in `racine` from the repository `root`. */
function lancerMesures(root: string, racine: string, designations: string[]) {
	return spawnSync(NODE, [MAIN, "mesures", ...designations], {
		cwd: root,
		env: { ...process.env, CYCLE_495_DIR: racine, NO_COLOR: "1" },
		encoding: "utf8",
		timeout: 60_000,
	});
}

/** What `cycle mesures` prints for `designations`, read in `racine` from the repository `root`. */
function mesures(root: string, racine: string, designations: string[]): Bilan {
	const r = lancerMesures(root, racine, designations);
	assert.equal(r.status, 0, `the cycle prints the measurements of the stories: ${stripVTControlCharacters(r.stderr)}`);
	return JSON.parse(r.stdout) as Bilan;
}

describe("the measurements of the cycle", () => {
	it("les valeurs manquantes restent manquantes et les révisions de test sont séparées des corrections de code", () => {
		const root = depot();
		const base = gitCmd(root, ["rev-parse", "HEAD"]).trim();
		gitCmd(root, ["checkout", "-q", "-b", "e01s05"]);
		commit(root, { "test/shout.test.js": SHOUT_TEST }, "test: greet shouts");
		const rougeVert = commit(root, { "src/greet.js": SHOUT_CODE }, "feat: greet shouts");
		// After the red-green: a review answer that rewrites an existing assertion, one that corrects the code, and new
		// tests written for a gap, in a file of their own or after the existing ones, which revise no test.
		commit(root, { "test/shout.test.js": SHOUT_TEST.replace('"HELLO, X"', '"HELLO, X!"') }, "test: shout revised");
		commit(root, { "src/greet.js": `${SHOUT_CODE}// trims nothing\n` }, "fix: shout corrected");
		commit(root, { "test/greet-again.test.js": PASSING_TEST }, "test: greet still greets");
		commit(
			root,
			{ "test/greet-again.test.js": `${PASSING_TEST}${PASSING_TEST.replace("greet greets", "greet greets twice")}` },
			"test: greet greets twice",
		);
		gitCmd(root, ["checkout", "-q", "main"]);

		const racine = tempDir("495-", cleanups);
		// An older journal: its sessions carry no cost, and the story has not landed.
		journal(racine, "e01s05", [
			{ at: "2026-10-01T10:00:00.000Z", pas: "story", genre: "debute", revision: base },
			{ at: "2026-10-01T10:01:00.000Z", pas: "story", genre: "branche", nom: "e01s05", base },
			{ at: "2026-10-01T10:01:00.000Z", pas: "story", genre: "fini" },
			{ at: "2026-10-01T10:01:00.000Z", pas: "rouge-vert", genre: "debute", revision: base },
			{ at: "2026-10-01T10:20:00.000Z", pas: "rouge-vert", genre: "session", nom: "rouge-vert", ok: true },
			{ at: "2026-10-01T10:21:00.000Z", pas: "rouge-vert", genre: "fini" },
			{ at: "2026-10-01T10:21:00.000Z", pas: "autocontrole", genre: "debute", revision: rougeVert },
			{ at: "2026-10-01T10:30:00.000Z", pas: "autocontrole", genre: "fini" },
			{ at: "2026-10-01T10:30:00.000Z", pas: "relecture", genre: "debute", revision: rougeVert },
			{ at: "2026-10-01T10:40:00.000Z", pas: "relecture", genre: "tour", tour: 1, porte: "fail", constats: 3 },
			{ at: "2026-10-01T10:50:00.000Z", pas: "relecture", genre: "fini" },
			{ at: "2026-10-01T10:50:00.000Z", pas: "recette", genre: "debute", revision: rougeVert },
			{ at: "2026-10-01T11:00:00.000Z", pas: "recette", genre: "rouvert", motif: "the name is not upper-cased" },
		]);
		// A journal that names no branch: what its commits would say is not known.
		journal(racine, "e01s06", [
			{ at: "2026-10-02T10:00:00.000Z", pas: "story", genre: "debute", revision: base },
			{ at: "2026-10-02T10:30:00.000Z", pas: "rouge-vert", genre: "session", nom: "rouge-vert", ok: true, cout_usd: 0 },
			{ at: "2026-10-02T11:00:00.000Z", pas: "versement", genre: "verse", commit: base },
		]);

		const bilan = mesures(root, racine, ["e01s05", "e01s06"]);
		const [ouverte, sansBranche] = bilan.stories;

		assert.equal(ouverte?.cout_usd, null, "a cost no session observed stays missing, never zero");
		assert.equal(ouverte?.duree_totale_ms, null, "a story that has not landed has no time to landing");
		assert.equal(ouverte?.revisions_de_tests, 1, "the rewritten assertion is a test revision, the new test is not");
		assert.equal(ouverte?.reprises_de_code, 1, "the code correction is counted apart from the test revision");
		assert.equal(ouverte?.tours_de_relecture, 1);
		assert.equal(ouverte?.constats_de_relecture, 3);
		assert.equal(ouverte?.ecarts_de_recette, 1, "the gap the acceptance run found is a defect found at acceptance");

		assert.equal(sansBranche?.cout_usd, 0, "a cost observed at zero stays zero");
		assert.equal(sansBranche?.duree_totale_ms, 60 * 60_000);
		assert.equal(sansBranche?.revisions_de_tests, null, "without its branch, the revisions of a story are not known");
		assert.equal(sansBranche?.reprises_de_code, null);
		assert.equal(bilan.mediane_duree_ms, 60 * 60_000, "the median counts only the stories that landed");
	});

	it("une attente que l'automate tranche n'est pas une intervention, et incidents et écarts de recette sont comptés à part", () => {
		const root = depot();
		const racine = tempDir("495-", cleanups);
		const at = (minute: number) => new Date(Date.parse("2026-10-01T10:00:00.000Z") + minute * 60_000).toISOString();
		journal(racine, "e01s07", [
			{ at: at(0), pas: "story", genre: "debute" },
			// A session that returns no output, then a step that blocks: two incidents.
			{ at: at(1), pas: "rouge-vert", genre: "session", nom: "rouge-vert", ok: false },
			{ at: at(2), pas: "rouge-vert", genre: "bloque", detail: "no output" },
			// The review leaves a promise unkept: unattended, the tool reopens the review itself, without the owner.
			{ at: at(3), pas: "relecture", genre: "tour", tour: 2, porte: "fail", constats: 1 },
			{ at: at(4), pas: "relecture", genre: "proprietaire", detail: "a promise is not kept" },
			{ at: at(4), pas: "relecture", genre: "rouvert", motif: "a promise is not kept" },
			// The acceptance run waits for the owner, and an independent session agrees in their place.
			{ at: at(5), pas: "recette", genre: "proprietaire", detail: "acceptance run report" },
			{ at: at(6), pas: "recette", genre: "session", nom: "arbitrage", ok: true },
			{ at: at(6), pas: "recette", genre: "arbitrage", decision: "ecart", origine: "automate" },
			{ at: at(6), pas: "recette", genre: "rouvert", motif: "the name is not upper-cased" },
			// The next acceptance run waits for the owner, who answers in a later run.
			{ at: at(7), pas: "recette", genre: "proprietaire", detail: "acceptance run report" },
			{ at: at(60), pas: "recette", genre: "acceptee", note: "" },
		]);

		const [story] = mesures(root, racine, ["e01s07"]).stories;
		assert.equal(story?.interventions, 1, "only the wait the owner answered is an intervention");
		assert.equal(story?.arbitrages_automate, 1, "the agreement the automaton gave is counted apart");
		assert.equal(story?.tours_de_relecture, 1, "the review the tool reopened is counted as review");
		assert.equal(story?.ecarts_de_recette, 1, "a review reopened is not a defect found at the acceptance run");
		assert.equal(story?.incidents, 2, "a session without output and a blocked step are two incidents");
	});

	it("a formal profile that costs more without finding fewer defects late is reserved to the risks that justify it, and no obligation is removed", () => {
		const root = depot();
		const racine = tempDir("495-", cleanups);
		storyVersee(racine, "e01s05", 1, 10, 1);
		storyVersee(racine, "e01s06", 2, 30, 1);
		// As long as the simple story, dearer in dollars alone.
		storyVersee(racine, "e01s08", 1, 30, 1);
		storyAvecCompagnon(root, "e01s06", MODELE_D_ETATS);
		// A refactoring lands through the short path: its journal says `versement` under `reprise`.
		journal(racine, "R900", [
			{ at: "2026-10-01T10:00:00.000Z", pas: "reprise", genre: "debute" },
			{ at: "2026-10-01T10:20:00.000Z", pas: "reprise", genre: "versement" },
		]);

		const bilan = mesures(root, racine, ["simple=e01s05", "tla=e01s06", "lean=e01s08", "refactoring=R900"]);
		assert.deepEqual(bilan.profils.tla, {
			stories: ["e01s06"],
			mediane_duree_ms: 2 * 3_600_000,
			mediane_cout_usd: 30,
		});
		assert.equal(bilan.profils.refactoring?.mediane_duree_ms, 20 * 60_000, "a refactoring is measured to its landing");
		const tla = bilan.recommandations.find((x) => x.profil === "tla");
		assert.match(
			tla?.recommandation ?? "",
			/réserver .*risque/,
			"a formal means that costs more without fewer late defects is reserved to the risks that justify it",
		);
		assert.match(
			bilan.recommandations.find((x) => x.profil === "lean")?.recommandation ?? "",
			/réserver .*risque/,
			"a means that costs more in dollars alone costs more",
		);
		for (const x of bilan.recommandations)
			assert.deepEqual(x.obligations_retirees, [], `${x.profil}: no obligation is removed to gain time`);
		// What a story's path requires stays required of a formal profile; a refactoring keeps the short path's own.
		const obligations = (profil: string) =>
			bilan.recommandations.find((x) => x.profil === profil)?.obligations_maintenues.join(" | ") ?? "";
		for (const exigee of [/rouge vu/, /deux relecteurs/, /recette réelle/, /Preflight verte/])
			assert.match(obligations("tla"), exigee, "the formal profile keeps every obligation of a story");
		assert.match(obligations("refactoring"), /relecture indépendante du diff/);
		assert.doesNotMatch(
			obligations("refactoring"),
			/deux relecteurs/,
			"a refactoring keeps the obligations of its path",
		);
	});

	it("sums the time of a step over each of its runs, a step left and resumed included", () => {
		const racine = tempDir("495-", cleanups);
		const at = (minute: number) => new Date(Date.parse("2026-10-01T10:00:00.000Z") + minute * 60_000).toISOString();
		journal(racine, "e01s09", [
			{ at: at(0), pas: "story", genre: "debute" },
			{ at: at(5), pas: "story", genre: "fini" },
			{ at: at(5), pas: "rouge-vert", genre: "debute" },
			{ at: at(25), pas: "rouge-vert", genre: "fini" },
			{ at: at(25), pas: "recette", genre: "debute" },
			{ at: at(35), pas: "recette", genre: "rouvert", motif: "gap" },
			{ at: at(35), pas: "rouge-vert", genre: "debute" },
			{ at: at(45), pas: "rouge-vert", genre: "fini" },
			{ at: at(45), pas: "recette", genre: "debute" },
			{ at: at(50), pas: "recette", genre: "acceptee" },
			{ at: at(50), pas: "versement", genre: "verse" },
		]);

		const [story] = mesures(depot(), racine, ["e01s09"]).stories;
		assert.deepEqual(story?.duree_par_pas_ms, {
			story: 5 * 60_000,
			"rouge-vert": 30 * 60_000,
			recette: 15 * 60_000,
			versement: 0,
		});
	});

	it("extends a profile that costs no more than the simple one, keeps a dearer one that finds fewer defects late, and adapts nothing without a simple profile", () => {
		const root = depot();
		const racine = tempDir("495-", cleanups);
		storyVersee(racine, "e01s05", 1, 10, 1);
		storyVersee(racine, "e01s06", 1, 10, 1);
		storyVersee(racine, "e01s08", 2, 30, 0);
		storyAvecCompagnon(root, "e01s06", MODELE_D_ETATS);

		const recommandation = (bilan: ReturnType<typeof mesures>, profil: string) =>
			bilan.recommandations.find((x) => x.profil === profil)?.recommandation ?? "";
		const compare = mesures(root, racine, ["simple=e01s05", "tla=e01s06", "lean=e01s08"]);
		assert.match(recommandation(compare, "simple"), /profil de référence/);
		assert.match(recommandation(compare, "tla"), /rien ne s'oppose à l'étendre/, "no dearer than the simple profile");
		assert.match(
			recommandation(compare, "lean"),
			/garder .*risque/,
			"dearer, with fewer defects at the acceptance run",
		);

		const seul = mesures(root, racine, ["tla=e01s06"]);
		assert.match(recommandation(seul, "tla"), /aucune adaptation proposée/, "nothing to compare with");
	});
	it("une story dont le compagnon ne retient pas de modèle d'états, donnée sous le profil à états, est refusée en nommant la story et le moyen modele-d-etats, sans recommandation pour ce profil", () => {
		const root = depot();
		const racine = tempDir("495-", cleanups);
		storyVersee(racine, "e01s05", 1, 10, 1);
		storyVersee(racine, "e01s06", 2, 30, 1);
		storyAvecCompagnon(root, "e01s05", EXEMPLES);
		storyAvecCompagnon(root, "e01s06", MODELE_D_ETATS);

		const refus = lancerMesures(root, racine, ["simple=e01s06", "tla=e01s05"]);
		assert.notEqual(refus.status, 0, "a story whose companion keeps no state model is not measured as one");
		const motif = stripVTControlCharacters(refus.stderr);
		assert.match(motif, /e01s05/, "the refusal names the story");
		assert.match(motif, /modele-d-etats/, "the refusal names the means its companion does not keep");
		assert.doesNotMatch(refus.stdout, /recommandation/, "no recommendation is written for the profile");

		const bilan = mesures(root, racine, ["simple=e01s05", "tla=e01s06"]);
		assert.deepEqual(bilan.profils.tla?.stories, ["e01s06"], "a story whose companion keeps a state model is measured");
	});
});
