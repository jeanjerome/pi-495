import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ligneDuJournal } from "../../cycle/src/affichage.ts";
import { type Contexte, conduirePas } from "../../cycle/src/cycle.ts";
import { exporterDossier } from "../../cycle/src/export.ts";
import { Journal } from "../../cycle/src/journal.ts";
import { lireStory } from "../../cycle/src/story.ts";
import { tempDir, removedAfterEach } from "../helpers/fixtures.ts";
import {
	COMMIT,
	CONTRE_EXEMPLE,
	MANIFESTE,
	SHOUT_CODE,
	SHOUT_TEST,
	compagnon,
	contexte,
	depotAvecCompagnon,
	fauxClaude,
	fausseExploration,
	fichiersDuModele,
	modeleRetenu,
} from "../helpers/cycle.ts";

const cleanups = removedAfterEach();

/** The same story driven again by a new process: a new journal reader on the same dossier. */
function redemarrer(ctx: Contexte): Contexte {
	return {
		...ctx,
		story: lireStory(ctx.story.id, ctx.root),
		journal: new Journal(ctx.story.id, dirname(ctx.journal.dir)),
	};
}

describe("the record of a preparation", () => {
	it("un redémarrage retrouve le blocage et la trace sans réécrire une seconde preuve", async () => {
		const root = depotAvecCompagnon(compagnon(modeleRetenu(MANIFESTE)), fichiersDuModele());
		const formel = fausseExploration(1, CONTRE_EXEMPLE);
		const ctx = { ...contexte(root, fauxClaude("export default () => ({})")), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		const premier = await conduirePas(ctx, "rouge-vert");

		const reprise = redemarrer(ctx);
		const second = await conduirePas(reprise, "rouge-vert");

		assert.deepEqual(formel.lancements(), [MANIFESTE], "the restart does not explore the unchanged model again");
		const events = reprise.journal.lire();
		const preparations = events.filter((e) => e.genre === "preparation");
		assert.equal(preparations.length, 1, "one record of the preparation, written when it was examined");
		const preparation = preparations[0]!;
		assert.equal(preparation.verte, false);
		assert.match(String(preparation.empreinte), /^sha256:[0-9a-f]{64}$/);
		const resultats = preparation.resultats as { manifeste: string; issue: string; trace: { digest: string } }[];
		assert.deepEqual(
			resultats.map((r) => [r.manifeste, r.issue]),
			[[MANIFESTE, "counterexample"]],
		);
		const trace = resultats[0]!.trace.digest;
		assert.match(trace, /^sha256:/);

		const retenue = events.filter((e) => e.genre === "preparation-retenue");
		assert.deepEqual(
			retenue.map((e) => e.empreinte),
			[preparation.empreinte],
			"the restart cites the preparation it found, by its fingerprint",
		);
		assert.deepEqual(premier, second, "the restart finds the same block");
		assert.ok(second.statut === "bloque" && second.motif.includes(trace), "the block names the kept trace");
		const blocages = events.filter((e) => e.genre === "bloque");
		assert.deepEqual(
			blocages.map((e) => [e.pas, e.origine]),
			[
				["rouge-vert", "preparation"],
				["rouge-vert", "preparation"],
			],
			"the record says the block comes from the preparation, not from the code",
		);
		assert.deepEqual(
			events.filter((e) => e.genre === "session"),
			[],
		);

		assert.match(ligneDuJournal(preparation) ?? "", /préparation .*counterexample/);
		const dossier = await exporterDossier(reprise.journal, tempDir("495-", cleanups));
		assert.ok(
			existsSync(join(dossier, "objets", trace.replace("sha256:", ""))),
			"the trace is exported with the dossier",
		);
	});

	it("la session de rouge-vert reçoit un résumé borné qui cite la préparation par son empreinte et ses objets", async () => {
		const root = depotAvecCompagnon(compagnon(modeleRetenu(MANIFESTE)), fichiersDuModele());
		const formel = fausseExploration(0, "Greet.tla with Greet.cfg: completed — PASS for the model under its bounds\n");
		const invite = join(tempDir("495-", cleanups), "invite.txt");
		const claude = fauxClaude(`${COMMIT}
import { writeFileSync as ecrire } from "node:fs";
export default (invite, cwd) => {
  ecrire(${JSON.stringify(invite)}, invite);
  commit(cwd, { "test/shout.test.js": ${JSON.stringify(SHOUT_TEST)} }, "test: greet shouts");
  commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE)} }, "feat: greet shouts");
  return { status: "fini", taches: [{ numero: 1 }], resume: "done" };
};`);
		const ctx = { ...contexte(root, claude), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const preparation = ctx.journal.dernier("preparation");
		assert.equal(preparation?.verte, true);
		const resultats = preparation?.resultats as { issue: string; trace: { digest: string } }[];
		const texte = readFileSync(invite, "utf8");
		assert.ok(texte.includes(String(preparation?.empreinte)), "the prompt cites the preparation's fingerprint");
		assert.ok(texte.includes(`${MANIFESTE} : completed, sortie ${resultats[0]!.trace.digest}`), texte);
		assert.ok(
			!texte.includes("PASS for the model under its bounds"),
			"the prompt cites the output, it does not copy it",
		);
	});
});
