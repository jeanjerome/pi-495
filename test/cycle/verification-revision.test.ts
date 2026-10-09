import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Contexte, conduirePas, rouvrir } from "../../cycle/src/cycle.ts";
import type { Evenement } from "../../cycle/src/journal.ts";
import { gitCmd, tempDir, removedAfterEach, writeFiles } from "../helpers/fixtures.ts";
import {
	COMMIT,
	CONTRE_EXEMPLE,
	MANIFESTE,
	MODELE,
	SHOUT_CODE,
	SHOUT_TEST,
	STORY,
	compagnon,
	contexte,
	depotAvecCompagnon,
	fauxClaude,
	fausseExploration,
	fichiersDuModele,
	modeleRetenu,
} from "../helpers/cycle.ts";

const cleanups = removedAfterEach();

/**
 * A red-green session that writes the test and the code the first time, then one correction per
 * launch, and keeps each prompt it receives.
 */
function claudeQuiGarde(invites: string): string {
	return fauxClaude(`${COMMIT}
import { appendFileSync, existsSync, readdirSync } from "node:fs";
export default (invite, cwd) => {
  appendFileSync(${JSON.stringify(invites)}, invite + "\\n=====\\n");
  if (!existsSync(cwd + "/test/shout.test.js")) {
    commit(cwd, { "test/shout.test.js": ${JSON.stringify(SHOUT_TEST)} }, "test: greet shouts");
    commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE)} }, "feat: greet shouts");
  } else {
    const n = readdirSync(cwd + "/src").length;
    commit(cwd, { ["src/correction-" + n + ".js"]: "export const n = " + n + ";\\n" }, "fix: correction " + n);
  }
  return { status: "fini", taches: [{ numero: 1 }], resume: "done" };
};`);
}

function depuisDerniereReouverture(ctx: Contexte): Evenement[] {
	return ctx.journal.depuisReouverture().filter((e) => e.genre.startsWith("preparation"));
}

function commiter(root: string, fichiers: Record<string, string>, message: string): void {
	writeFiles(root, fichiers);
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", message]);
}

describe("a reopened story and its preparation", () => {
	it("une règle modifiée retire la préparation précédente et une simple correction de code la conserve", async () => {
		const root = depotAvecCompagnon(compagnon(modeleRetenu(MANIFESTE)), fichiersDuModele());
		const formel = fausseExploration(0, "Greet.tla with Greet.cfg: completed — PASS for the model under its bounds\n");
		const invites = join(tempDir("495-", cleanups), "invites.txt");
		const ctx = { ...contexte(root, claudeQuiGarde(invites)), exploration: formel.exploration };
		await conduirePas(ctx, "story");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const verte = ctx.journal.dernier("preparation");
		assert.equal(verte?.verte, true);

		// A code correction: the companion, the promises and the model are those the preparation examined.
		rouvrir(ctx, "the greeting loses its comma");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		assert.deepEqual(formel.lancements(), [MANIFESTE], "a code correction does not explore the model again");
		assert.deepEqual(
			depuisDerniereReouverture(ctx).map((e) => [e.genre, e.empreinte, e.reprise]),
			[["preparation-retenue", verte?.empreinte, "correction-de-code"]],
			"the preparation is kept, and the record names the resumption a code correction",
		);
		assert.match(readFileSync(invites, "utf8").split("=====").at(-2) ?? "", /correction de code/);

		// A rule revision: the model changes, then the story is reopened.
		commiter(root, { "specs/formal/greet/Greet.tla": MODELE.replace("FALSE", "TRUE") }, "docs: the model shouts");
		rouvrir(ctx, "the model forgot that greet starts shouted");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		assert.deepEqual(formel.lancements(), [MANIFESTE, MANIFESTE], "a revised rule is examined again");
		const apres = depuisDerniereReouverture(ctx);
		assert.deepEqual(
			apres.map((e) => e.genre),
			["preparation-retiree", "preparation"],
		);
		const [retiree, refaite] = apres;
		assert.equal(retiree?.ancienne, verte?.empreinte);
		assert.equal(retiree?.empreinte, refaite?.empreinte);
		assert.notEqual(refaite?.empreinte, verte?.empreinte, "the revision has a new identity");
		assert.equal(retiree?.reprise, "revision-de-regle");
		assert.deepEqual(retiree?.changements, ["specs/formal/greet/Greet.tla"]);
		assert.match(readFileSync(invites, "utf8").split("=====").at(-2) ?? "", /révision de règle/);

		// A promise revised by its text alone: the companion still names it, its identity changes all the same.
		commiter(
			root,
			{ "specs/stories/e01/e01s05-greet-shouts.md": STORY.replace("upper case", "upper case, comma kept") },
			"docs: the promise keeps the comma",
		);
		rouvrir(ctx, "the promise forgot the comma");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const promesse = depuisDerniereReouverture(ctx)[0];
		assert.equal(promesse?.genre, "preparation-retiree");
		assert.deepEqual(promesse?.changements, ["promesses"]);

		// The companion revised alone: an oracle's assertion changes, the story and the model stay as they were.
		const lancees = formel.lancements().length;
		commiter(
			root,
			{
				"specs/stories/e01/e01s05-greet-shouts.verification.json": compagnon(modeleRetenu(MANIFESTE), [
					{ tache: 1, cas: "test/shout.test.js", assertion: "the greeting is upper case, comma kept" },
				]),
			},
			"docs: the oracle checks the comma",
		);
		rouvrir(ctx, "the oracle forgot the comma");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const oracle = depuisDerniereReouverture(ctx);
		assert.deepEqual(
			oracle.map((e) => e.genre),
			["preparation-retiree", "preparation"],
		);
		assert.deepEqual(oracle[0]?.changements, ["compagnon"]);
		assert.equal(formel.lancements().length, lancees + 1, "a revised companion is examined again");
	});

	it("une révision dont le réexamen trouve un contre-exemple bloque sans reprendre l'ancien feu vert", async () => {
		const root = depotAvecCompagnon(compagnon(modeleRetenu(MANIFESTE)), fichiersDuModele());
		const verte = fausseExploration(0, "Greet.tla with Greet.cfg: completed — PASS for the model under its bounds\n");
		const invites = join(tempDir("495-", cleanups), "invites.txt");
		const ctx = { ...contexte(root, claudeQuiGarde(invites)), exploration: verte.exploration };
		await conduirePas(ctx, "story");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const ancienne = ctx.journal.dernier("preparation");
		assert.equal(ancienne?.verte, true);
		const sessions = (): number => ctx.journal.lire().filter((e) => e.genre === "session").length;
		const avant = sessions();

		commiter(root, { "specs/formal/greet/Greet.tla": MODELE.replace("FALSE", "TRUE") }, "docs: the model shouts");
		rouvrir(ctx, "the model forgot that greet starts shouted");
		const contre = fausseExploration(1, CONTRE_EXEMPLE);
		ctx.exploration = contre.exploration;
		const issue = await conduirePas(ctx, "rouge-vert");
		assert.deepEqual(contre.lancements(), [MANIFESTE], "the revised model is explored again");
		assert.equal(issue.statut, "bloque", "the previous green preparation is not reused for the revised rule");
		assert.equal(issue.statut === "bloque" ? issue.origine : undefined, "preparation");
		assert.match(issue.statut === "bloque" ? issue.motif : "", /counterexample to Shouted/);
		assert.equal(sessions(), avant, "no red-green session is launched on the revised rule");
		const refaite = ctx.journal.dernier("preparation");
		assert.notEqual(refaite?.empreinte, ancienne?.empreinte);
		assert.equal(refaite?.verte, false);
	});
});
