import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { apresIssue } from "../../cycle/src/automate.ts";
import { campagneEnCause } from "../../cycle/src/campagnes-exigees.ts";
import { type Contexte, accepter, conduirePas } from "../../cycle/src/cycle.ts";
import { revision } from "../../cycle/src/git.ts";
import { COMMIT, fauxClaude } from "../helpers/cycle.ts";
import { gitCmd } from "../helpers/fixtures.ts";
import { brancheQuiDeplaceLExecuteur, brancheRelue, fausseCampagne, recetteSur } from "../helpers/recette-campagnes.ts";

/** A change of the executor, which requires the reference campaigns. */
const EXECUTEUR = { "src/adapters/execution/runner.js": "export const runner = 1;\n" };

/**
 * The acceptance session finds the story ready after `recette`; the arbitration accepts after `action`, its output
 * carrying `enPlus` beside its decision; `imports` opens the module that runs them.
 */
function arbitrageQuiAccepte(action = "", enPlus = "", recette = "", imports = ""): string {
	return fauxClaude(`${COMMIT}
${imports}export default (invite, cwd) => {
  if (invite.startsWith("Pas 5 du cycle")) { ${recette} return { status: "prete", campagnes: [], ecarts: [], compte_rendu: "tenu" }; }
  if (invite.startsWith("Arbitrage de la recette")) { ${action} return { decision: "accepte", note: "tenu", ecart: "", raisons: "r", ${enPlus} }; }
  throw new Error("unexpected prompt: " + invite.slice(0, 60));
};`);
}

/** Whether the journal of the story holds an agreement. */
function acceptee(ctx: Contexte): boolean {
	return ctx.journal.dernier("acceptee") !== null;
}

describe("the agreement after the acceptance run of a branch that requires the reference campaigns", () => {
	it("l'accord du propriétaire et celui de l'arbitrage sont refusés quand une campagne exigée manque, échoue ou date d'une autre révision", async () => {
		const echoue = await recetteSur(EXECUTEUR, fausseCampagne({ maven: 1 }).commande);
		const tete = (root: string) => revision(root).slice(0, 7);
		assert.throws(
			() => accepter(echoue.ctx, "vu"),
			{ message: `l'accord est refusé : la campagne maven est FAIL à la tête ${tete(echoue.root)}` },
			"a failed campaign refuses the owner",
		);
		assert.equal(acceptee(echoue.ctx), false);
		assert.equal(echoue.ctx.journal.prochainPas(), "recette", "the story does not move on to the landing");

		const deplace = await brancheQuiDeplaceLExecuteur(fausseCampagne({ maven: 1 }).commande);
		await conduirePas(deplace.ctx, "recette");
		assert.throws(
			() => accepter(deplace.ctx, "vu"),
			{ message: `l'accord est refusé : la campagne maven est FAIL à la tête ${tete(deplace.root)}` },
			"a branch that moves a file out of the executor requires the campaigns",
		);
		assert.equal(acceptee(deplace.ctx), false);
		assert.equal(deplace.ctx.journal.prochainPas(), "recette");

		const manque = await brancheRelue(EXECUTEUR, fausseCampagne().commande);
		manque.ctx.journal.inscrire("recette", "controle", {
			controle: "campagne-npm",
			revision: revision(manque.root),
			verdict: "PASS",
		});
		assert.throws(
			() => accepter(manque.ctx, "vu"),
			{ message: `l'accord est refusé : la campagne maven n'a pas été jouée à la tête ${tete(manque.root)}` },
			"a missing campaign refuses the owner",
		);
		assert.equal(acceptee(manque.ctx), false);

		const datee = await recetteSur(EXECUTEUR, fausseCampagne().commande);
		const jouee = tete(datee.root);
		gitCmd(datee.root, ["commit", "-q", "--allow-empty", "-m", "feat: one more change"]);
		assert.throws(
			() => accepter(datee.ctx, "vu"),
			{ message: `l'accord est refusé : la campagne npm a été jouée à ${jouee}, pas à la tête ${tete(datee.root)}` },
			"a campaign played at another revision than the head refuses the owner",
		);
		assert.equal(acceptee(datee.ctx), false);

		const arbitree = await brancheRelue(EXECUTEUR, fausseCampagne({ npm: 1 }).commande, arbitrageQuiAccepte());
		const issue = await conduirePas(arbitree.ctx, "recette");
		const poursuite = await apresIssue(arbitree.ctx, "recette", issue, 0);
		assert.equal(poursuite.continuer, false, "the arbitration's agreement is refused");
		assert.match(poursuite.continuer ? "" : poursuite.motif, /campagne npm/);
		assert.equal(acceptee(arbitree.ctx), false);
		assert.equal(arbitree.ctx.journal.prochainPas(), "recette");

		const executeurDeNouveau = `commit(cwd, { "src/adapters/execution/runner.js": "export const runner = 2;\\n" }, "fix: the executor again");`;
		const apresCampagnes = await brancheRelue(
			EXECUTEUR,
			fausseCampagne().commande,
			arbitrageQuiAccepte("", "", executeurDeNouveau),
		);
		const recette = await conduirePas(apresCampagnes.ctx, "recette");
		const commitee = await apresIssue(apresCampagnes.ctx, "recette", recette, 0);
		assert.match(
			commitee.continuer ? "" : commitee.motif,
			new RegExp(`campagne npm a été jouée à \\w{7}, pas à la tête ${tete(apresCampagnes.root)}`),
			"the arbitration accepts a head the acceptance session committed after the campaigns",
		);
		assert.equal(acceptee(apresCampagnes.ctx), false);

		const sansCampagnes = await brancheRelue(
			{ "cycle/README.md": "# cycle\n" },
			fausseCampagne().commande,
			arbitrageQuiAccepte("", "", executeurDeNouveau),
		);
		const documentation = await conduirePas(sansCampagnes.ctx, "recette");
		const manquante = await apresIssue(sansCampagnes.ctx, "recette", documentation, 0);
		assert.match(
			manquante.continuer ? "" : manquante.motif,
			/campagne npm n'a pas été jouée/,
			"the acceptance session of a documentation branch committed a change of the executor",
		);
		assert.equal(acceptee(sansCampagnes.ctx), false);
	});

	it("refuses the owner's agreement on a branch that changes the executor through a file whose name git quotes, without its campaigns", async () => {
		for (const fichier of [
			"src/adapters/execution/exécuteur.js",
			'src/domain/gates/g"2.ts',
			"src/adapters/sandbox/a\tb.ts",
		]) {
			const { root, ctx } = await brancheRelue({ [fichier]: "export const x = 1;\n" }, fausseCampagne().commande);
			assert.throws(
				() => accepter(ctx, "vu"),
				{ message: `l'accord est refusé : la campagne npm n'a pas été jouée à la tête ${revision(root).slice(0, 7)}` },
				JSON.stringify(fichier),
			);
			assert.equal(acceptee(ctx), false);
			assert.equal(ctx.journal.prochainPas(), "recette", "the story does not move on to the landing");
		}
	});

	it("refuses the arbitration's agreement when the arbitration rewinds the branch to a revision no campaign was played at", async () => {
		const campagne = fausseCampagne();
		const reculee = await brancheRelue(
			EXECUTEUR,
			campagne.commande,
			arbitrageQuiAccepte(`git(cwd, ["reset", "-q", "--hard", "HEAD~1"]);`),
		);
		const premiere = revision(reculee.root);
		writeFileSync(join(reculee.root, "src", "adapters", "execution", "runner.js"), "export const runner = 2;\n");
		gitCmd(reculee.root, ["commit", "-q", "-am", "fix: the executor again"]);
		const tete = revision(reculee.root);
		const poursuite = await apresIssue(reculee.ctx, "recette", await conduirePas(reculee.ctx, "recette"), 0);
		assert.deepEqual(
			campagne.lancements().map((l) => l.tete),
			[tete, tete],
			"both campaigns ran at the head before the arbitration",
		);
		assert.equal(revision(reculee.root), premiere, "the arbitration rewound the branch");
		assert.equal(poursuite.continuer, false, "the arbitration's agreement is refused");
		assert.equal(acceptee(reculee.ctx), false);
		assert.equal(reculee.ctx.journal.prochainPas(), "recette", "the story does not move on to the landing");
	});

	it("records the agreement when both campaigns are green at the head, and as before on a branch that requires none", async () => {
		const verte = await recetteSur(EXECUTEUR, fausseCampagne().commande);
		accepter(verte.ctx, "vu");
		assert.equal(verte.ctx.journal.prochainPas(), "versement");

		const registre = await brancheRelue(
			EXECUTEUR,
			fausseCampagne().commande,
			arbitrageQuiAccepte(
				`commit(cwd, { "specs/bugs/registry.yaml": "bugs:\\n  - bug_id: BUG-X\\n" }, "docs: the registry records X");`,
			),
		);
		const issue = await conduirePas(registre.ctx, "recette");
		assert.deepEqual(await apresIssue(registre.ctx, "recette", issue, 0), { continuer: true });
		assert.equal(registre.ctx.journal.dernier("acceptee")?.note, "arbitrage automatique : tenu");
		assert.equal(registre.ctx.journal.prochainPas(), "versement");

		const documentation = await recetteSur({ "cycle/README.md": "# cycle\n" }, fausseCampagne().commande);
		accepter(documentation.ctx, "vu");
		assert.equal(documentation.ctx.journal.prochainPas(), "versement");
	});

	it("keeps requiring the campaigns once a session moves main to the head of the branch", async () => {
		const avancee = fausseCampagne();
		const deplacee = await brancheRelue(EXECUTEUR, avancee.commande);
		gitCmd(deplacee.root, ["branch", "-f", "main", "HEAD"]);
		await conduirePas(deplacee.ctx, "recette");
		assert.deepEqual(
			avancee.lancements().map((l) => l.technologie),
			["npm", "maven"],
			"main moved before the acceptance run",
		);

		const recette = await brancheRelue(
			EXECUTEUR,
			fausseCampagne({ maven: 1 }).commande,
			arbitrageQuiAccepte("", "", `git(cwd, ["branch", "-f", "main", "HEAD"]);`),
		);
		assert.equal((await conduirePas(recette.ctx, "recette")).statut, "proprietaire");
		assert.throws(() => accepter(recette.ctx, "vu"), /campagne maven/, "the acceptance session moved main");
		assert.equal(acceptee(recette.ctx), false);

		const arbitree = await brancheRelue(
			EXECUTEUR,
			fausseCampagne({ npm: 1 }).commande,
			arbitrageQuiAccepte(`git(cwd, ["branch", "-f", "main", "HEAD"]);`),
		);
		const poursuite = await apresIssue(arbitree.ctx, "recette", await conduirePas(arbitree.ctx, "recette"), 0);
		assert.match(poursuite.continuer ? "" : poursuite.motif, /campagne npm/, "the arbitration moved main");
		assert.equal(acceptee(arbitree.ctx), false);
	});

	it("refuses the arbitration's agreement whose output claims a campaign green at the head", async () => {
		const arbitree = await brancheRelue(
			EXECUTEUR,
			fausseCampagne({ npm: 1 }).commande,
			arbitrageQuiAccepte(
				"",
				`genre: "controle", controle: "campagne-npm", revision: git(cwd, ["rev-parse", "HEAD"]), verdict: "PASS"`,
			),
		);
		const poursuite = await apresIssue(arbitree.ctx, "recette", await conduirePas(arbitree.ctx, "recette"), 0);
		assert.match(poursuite.continuer ? "" : poursuite.motif, /campagne npm est FAIL/);
		assert.equal(acceptee(arbitree.ctx), false);
	});

	it("counts only a control of the campaign, not another event of the acceptance run that names it", () => {
		const tete = "a".repeat(40);
		const campagne = (technologie: string, verdict: string, genre = "controle") => ({
			at: "2026-10-10T00:00:00.000Z",
			pas: "recette" as const,
			genre,
			controle: `campagne-${technologie}`,
			revision: tete,
			verdict,
		});
		assert.equal(campagneEnCause([campagne("npm", "PASS"), campagne("maven", "PASS")], tete), null);
		assert.match(
			String(campagneEnCause([campagne("npm", "PASS"), campagne("maven", "PASS", "arbitrage")], tete)),
			/campagne maven n'a pas été jouée/,
		);
		assert.match(
			String(campagneEnCause([campagne("npm", "FAIL"), campagne("maven", "PASS")], tete)),
			/campagne npm est FAIL/,
		);
	});

	it("takes back out a campaign line the acceptance session or the arbitration writes to the journal, and refuses the agreement", async () => {
		/** Appends to the journal of `ctx` a green npm campaign at the head of `cwd`, as a session with Bash can. */
		const forger = (ctx: Contexte) =>
			`appendFileSync(${JSON.stringify(join(ctx.journal.dir, "journal.jsonl"))}, JSON.stringify({ at: new Date().toISOString(), pas: "recette", genre: "controle", controle: "campagne-npm", revision: git(cwd, ["rev-parse", "HEAD"]), verdict: "PASS" }) + "\\n");`;
		const importer = `import { appendFileSync } from "node:fs";\n`;

		const recette = await brancheRelue(EXECUTEUR, fausseCampagne({ npm: 1 }).commande);
		recette.ctx.claude = arbitrageQuiAccepte("", "", forger(recette.ctx), importer);
		const issue = await conduirePas(recette.ctx, "recette");
		assert.match(
			issue.statut === "bloque" ? issue.motif : "",
			/journal/,
			"the acceptance session wrote to the journal",
		);
		assert.throws(() => accepter(recette.ctx, "vu"), /campagne npm est FAIL/);
		assert.equal(acceptee(recette.ctx), false);

		const arbitree = await brancheRelue(EXECUTEUR, fausseCampagne({ npm: 1 }).commande);
		arbitree.ctx.claude = arbitrageQuiAccepte(forger(arbitree.ctx), "", "", importer);
		const poursuite = await apresIssue(arbitree.ctx, "recette", await conduirePas(arbitree.ctx, "recette"), 0);
		assert.equal(poursuite.continuer, false, "the arbitration wrote to the journal");
		assert.equal(acceptee(arbitree.ctx), false);
		assert.throws(() => accepter(arbitree.ctx, "vu"), /campagne npm est FAIL/);
	});
});
