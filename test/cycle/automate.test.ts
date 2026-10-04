import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ECARTS_MAX, apresIssue } from "../../cycle/src/automate.ts";
import { conduirePas, rouvrir } from "../../cycle/src/cycle.ts";
import { revision } from "../../cycle/src/git.ts";
import { COMMIT, contexte, depot, fauxClaude } from "../helpers/cycle.ts";

/** The pass of a session that writes a scenario and a task into the story, and commits the story. */
const EPINGLE = `
const file = cwd + "/specs/stories/e01/e01s05-greet-shouts.md";
let s = readFileSync(file, "utf8");
s = s.replace("## 3. Sécurité", "Scenario: the gap is kept\\n  Given a name\\n  When greet is called\\n  Then the gap is closed\\n\\n## 3. Sécurité");
s = s.replace("## 5. Hors périmètre", "### Tâche 2 — the gap is kept\\n\\nText.\\n\\n- Vérifie : \\\`" + process.execPath + " --test test/shout.test.js\\\`\\n- Tient : \\\`test/shout.test.js\\\`, « the gap is closed »\\n- Rouge : the gap is open\\n\\n## 5. Hors périmètre");
commit(cwd, { "specs/stories/e01/e01s05-greet-shouts.md": s }, "docs: the story e01s05 promises the gap is closed");
return { status: "fini", message: "docs: the story e01s05 promises the gap is closed", resume: "written" };
`;

function arbitre(sortie: Record<string, string>, epingle = EPINGLE): string {
	return `${COMMIT}
import { readFileSync } from "node:fs";
export default (invite, cwd) => {
  if (invite.startsWith("Arbitrage de la recette")) return ${JSON.stringify(sortie)};
  if (invite.startsWith("La story e01s05 est rouverte")) { ${epingle} }
  throw new Error("unexpected prompt: " + invite.slice(0, 60));
};`;
}

/** A story on its branch, with the acceptance run prepared and waiting for the owner. */
async function enRecette(claude: string) {
	const root = depot();
	const ctx = contexte(root, fauxClaude(claude));
	await conduirePas(ctx, "story");
	for (const pas of ["rouge-vert", "autocontrole", "relecture"] as const) ctx.journal.inscrire(pas, "fini");
	ctx.journal.inscrire("recette", "preparee", {
		compte_rendu: "each promise is held",
		campagnes: [],
		tete: revision(root),
	});
	return ctx;
}

const QUESTION = { statut: "proprietaire", question: "Accepter ?" } as const;

describe("the cycle answers in the owner's place", () => {
	it("accepts, on the decision of an independent session, and records that the automaton decided", async () => {
		const ctx = await enRecette(arbitre({ decision: "accepte", note: "tout est tenu", ecart: "", raisons: "checked" }));
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		const arbitrage = ctx.journal.dernier("arbitrage", "recette");
		assert.equal(arbitrage?.origine, "automate");
		assert.equal(arbitrage?.decision, "accepte");
		assert.equal(ctx.journal.dernier("acceptee", "recette")?.note, "arbitrage automatique : tout est tenu");
		assert.equal(ctx.journal.prochainPas(), "versement");
	});

	it("names a gap, writes it into the story, and sends the story back to the red-green", async () => {
		const ctx = await enRecette(
			arbitre({ decision: "ecart", note: "n", ecart: "the report line reads as a measure", raisons: "r" }),
		);
		const avant = ctx.story.taches.length;
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		assert.equal(ctx.journal.dernier("rouvert", "recette")?.motif, "the report line reads as a measure");
		assert.equal(ctx.story.taches.length, avant + 1, "the task of the gap is in the story the next review reads");
		assert.equal(ctx.journal.prochainPas(), "rouge-vert");
	});

	it("stops, naming the ceiling, when the story has already gone back to the red-green as many times as allowed", async () => {
		const ctx = await enRecette(arbitre({ decision: "ecart", note: "n", ecart: "another gap", raisons: "r" }));
		for (let i = 0; i < ECARTS_MAX; i++) rouvrir(ctx, `gap ${i}`);
		const suite = await apresIssue(ctx, "recette", QUESTION, ECARTS_MAX);
		assert.equal(suite.continuer, false);
		assert.match(suite.continuer ? "" : suite.motif, /red-green 3 times/);
	});

	it("sends a promise the review left unkept back to the red-green without asking any session", async () => {
		const ctx = await enRecette("export default () => { throw new Error('no session expected'); };");
		const question = "Après 2 tours, le code ne tient pas 1 promesse(s)";
		assert.deepEqual(await apresIssue(ctx, "relecture", { statut: "proprietaire", question }, 0), { continuer: true });
		assert.equal(ctx.journal.dernier("rouvert", "recette")?.motif, question);
		assert.equal(ctx.journal.prochainPas(), "rouge-vert");
	});

	it("writes into the story a gap the acceptance run reopened by itself", async () => {
		const ctx = await enRecette(arbitre({ decision: "accepte", note: "", ecart: "", raisons: "" }));
		rouvrir(ctx, "the promise is not held at run time");
		const avant = ctx.story.taches.length;
		assert.deepEqual(await apresIssue(ctx, "recette", { statut: "bloque", motif: "reopened" }, 0), {
			continuer: true,
		});
		assert.equal(ctx.story.taches.length, avant + 1);
	});

	it("stops on a block that reopened nothing, with the reason", async () => {
		const ctx = await enRecette("export default () => { throw new Error('no session expected'); };");
		const suite = await apresIssue(ctx, "rouge-vert", { statut: "bloque", motif: "Preflight FAIL" }, 0);
		assert.deepEqual(suite, { continuer: false, motif: "Preflight FAIL" });
	});

	it("stops when the session that writes the gap into the story adds nothing to it", async () => {
		const rien = 'return { status: "fini", message: "docs: nothing", resume: "nothing" };';
		const ctx = await enRecette(arbitre({ decision: "ecart", note: "n", ecart: "a gap", raisons: "r" }, rien));
		const suite = await apresIssue(ctx, "recette", QUESTION, 0);
		assert.equal(suite.continuer, false);
		assert.match(suite.continuer ? "" : suite.motif, /neither a scenario nor a task/);
	});

	it("stops, with the session's account, when the gap cannot be written into the story", async () => {
		const refus = 'return { status: "bloque", message: "", resume: "the story has no room for it" };';
		const ctx = await enRecette(arbitre({ decision: "ecart", note: "n", ecart: "a gap", raisons: "r" }, refus));
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), {
			continuer: false,
			motif: "the gap could not be written into the story: the story has no room for it",
		});
	});

	it("stops when writing the gap into the story leaves the tree modified", async () => {
		const sale = `writeFileSync(cwd + "/specs/stories/e01/e01s05-greet-shouts.md", readFileSync(cwd + "/specs/stories/e01/e01s05-greet-shouts.md", "utf8") + "\\nUncommitted.\\n");
return { status: "fini", message: "docs: x", resume: "written" };`;
		const ctx = await enRecette(arbitre({ decision: "ecart", note: "n", ecart: "a gap", raisons: "r" }, sale));
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), {
			continuer: false,
			motif: "writing the gap into the story left the tree modified",
		});
	});

	it("stops when the story no longer holds its format after the gap was written", async () => {
		const casse = `const file = "specs/stories/e01/e01s05-greet-shouts.md";
commit(cwd, { [file]: readFileSync(cwd + "/" + file, "utf8").replace("Statut : en cours", "Statut : perdu") }, "docs: x");
return { status: "fini", message: "docs: x", resume: "written" };`;
		const ctx = await enRecette(arbitre({ decision: "ecart", note: "n", ecart: "a gap", raisons: "r" }, casse));
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), {
			continuer: false,
			motif: "the story no longer holds its format after the gap was written: unknown statut: perdu",
		});
	});

	it("stops when the arbitration names a gap without saying which", async () => {
		const ctx = await enRecette(arbitre({ decision: "ecart", note: "n", ecart: "  ", raisons: "r" }));
		const suite = await apresIssue(ctx, "recette", QUESTION, 0);
		assert.equal(suite.continuer, false);
		assert.match(suite.continuer ? "" : suite.motif, /does not say which/);
	});
});
