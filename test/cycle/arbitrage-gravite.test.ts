import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { apresIssue } from "../../cycle/src/automate.ts";
import { conduirePas } from "../../cycle/src/cycle.ts";
import { revision } from "../../cycle/src/git.ts";
import { defautsOuverts } from "../../cycle/src/registre.ts";
import { COMMIT, contexte, depotDe, fauxClaude, STORY } from "../helpers/cycle.ts";
import { fixtureTs, gitCmd } from "../helpers/fixtures.ts";

const REGISTRE = "specs/bugs/registry.yaml";

function entree(id: string, severite: string, titre = `defect ${id}`): string {
	return `  - bug_id: ${id}\n    date: "2026-10-10"\n    title: "${titre}"\n    severity: ${severite}\n    status: open\n`;
}

/** The severity lines of each entry `id` of the registry, in its order. */
function severites(root: string, id: string): string[][] {
	return readFileSync(join(root, REGISTRE), "utf8")
		.split(/\n(?= {2}- bug_id: )/)
		.filter((e) => e.includes(`- bug_id: ${id}\n`))
		.map((e) => e.split("\n").filter((l) => l.startsWith("    severity: ")));
}

/** A repository whose registry holds one defect older than the branch. */
function depotAvecRegistre(): string {
	return depotDe((root) => {
		fixtureTs(root);
		mkdirSync(join(root, "specs", "stories", "e01"), { recursive: true });
		writeFileSync(join(root, "specs", "stories", "e01", "e01s05-greet-shouts.md"), STORY);
		mkdirSync(join(root, "specs", "bugs"), { recursive: true });
		writeFileSync(join(root, REGISTRE), `bugs:\n${entree("BUG-2026-01-01T000000", "low")}`);
	});
}

/** An arbitration that accepts and retains, for the defects of the branch, the severities `gravites` lists. */
function arbitre(gravites: { bug_id: string; gravite: string; raison: string }[]): string {
	return `${COMMIT}
export default (invite) => {
  if (invite.startsWith("Arbitrage de la recette")) return { decision: "accepte", note: "tenu", ecart: "", raisons: "r", gravites: ${JSON.stringify(gravites)} };
  throw new Error("unexpected prompt: " + invite.slice(0, 60));
};`;
}

/**
 * An arbitration that accepts and retains, for each defect its prompt lists with its severity, the severity
 * `gravites` gives its identifier.
 */
function arbitreLecteur(gravites: Record<string, string>): string {
	return `${COMMIT}
export default (invite) => {
  if (!invite.startsWith("Arbitrage de la recette")) throw new Error("unexpected prompt: " + invite.slice(0, 60));
  const listes = [...invite.matchAll(/^- (BUG-\\S+) \\((?:low|medium|high)\\) : /gm)].map((m) => m[1]);
  const table = ${JSON.stringify(gravites)};
  return { decision: "accepte", note: "tenu", ecart: "", raisons: "r", gravites: listes.map((id) => ({ bug_id: id, gravite: table[id], raison: "read" })) };
};`;
}

/**
 * A story on its branch whose session recorded `ajouts` in the registry, appended to it or written by rewriting it,
 * its acceptance run waiting for the owner.
 */
async function enRecette(claude: string, ajouts: string | ((registre: string) => string)) {
	const root = depotAvecRegistre();
	const ctx = contexte(root, fauxClaude(claude));
	await conduirePas(ctx, "story");
	const registre = readFileSync(join(root, REGISTRE), "utf8");
	writeFileSync(join(root, REGISTRE), typeof ajouts === "string" ? registre + ajouts : ajouts(registre));
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "docs: the registry records the defects of the branch"]);
	for (const pas of ["rouge-vert", "autocontrole", "relecture"] as const) ctx.journal.inscrire(pas, "fini");
	ctx.journal.inscrire("recette", "preparee", {
		compte_rendu: "each promise is held",
		campagnes: [],
		tete: revision(root),
	});
	return ctx;
}

const QUESTION = { statut: "proprietaire", question: "Accepter ?" } as const;
const A = "BUG-2026-10-10T100000";
const B = "BUG-2026-10-10T110000";

describe("the arbitration sets the severity of the defects the branch records", () => {
	it("la gravité que l'arbitrage retient pour un défaut de la branche est celle du registre et du journal, et un défaut sans gravité retenue arrête la story", async () => {
		const ctx = await enRecette(
			arbitre([{ bug_id: A, gravite: "medium", raison: "it fails the npm reference campaign twice in three" }]),
			entree(A, "low"),
		);
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		assert.deepEqual(defautsOuverts(ctx.root, "medium"), [{ id: A, gravite: "medium", titre: `defect ${A}` }]);
		assert.deepEqual(severites(ctx.root, A), [["    severity: medium"]]);
		assert.deepEqual(severites(ctx.root, "BUG-2026-01-01T000000"), [["    severity: low"]]);
		assert.equal(gitCmd(ctx.root, ["status", "--porcelain"]), "");
		assert.deepEqual(ctx.journal.dernier("arbitrage", "recette")?.gravites, [
			{ bug_id: A, inscrite: "low", retenue: "medium", raison: "it fails the npm reference campaign twice in three" },
		]);
		assert.equal(ctx.journal.prochainPas(), "versement");

		const muet = await enRecette(
			arbitre([{ bug_id: A, gravite: "low", raison: "cosmetic" }]),
			entree(A, "low") + entree(B, "low"),
		);
		const poursuite = await apresIssue(muet, "recette", QUESTION, 0);
		assert.equal(poursuite.continuer, false);
		assert.match(poursuite.continuer ? "" : poursuite.motif, new RegExp(B));
		assert.doesNotMatch(poursuite.continuer ? "" : poursuite.motif, new RegExp(A));
		assert.equal(muet.journal.dernier("acceptee", "recette"), null);
		assert.equal(muet.journal.prochainPas(), "recette");
	});

	it("un défaut que la branche inscrit sous un identifiant que le registre porte déjà est pesé par l'arbitrage, et l'entrée de la base garde sa gravité", async () => {
		const ANCIEN = "BUG-2026-01-01T000000";
		const ajout = entree(ANCIEN, "low", "a defect the branch introduces");
		const muet = await enRecette(arbitre([]), ajout);
		const poursuite = await apresIssue(muet, "recette", QUESTION, 0);
		assert.equal(poursuite.continuer, false);
		assert.match(poursuite.continuer ? "" : poursuite.motif, new RegExp(ANCIEN));
		assert.equal(muet.journal.dernier("acceptee", "recette"), null);

		const ctx = await enRecette(arbitreLecteur({ [ANCIEN]: "medium" }), ajout);
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		assert.deepEqual(defautsOuverts(ctx.root, "medium"), [
			{ id: ANCIEN, gravite: "medium", titre: "a defect the branch introduces" },
		]);
		assert.deepEqual(severites(ctx.root, ANCIEN), [["    severity: low"], ["    severity: medium"]]);
	});

	it("un défaut que la branche inscrit avant l'entrée de la base qui porte le même identifiant est pesé par l'arbitrage, et l'entrée de la base garde sa gravité", async () => {
		const ANCIEN = "BUG-2026-01-01T000000";
		const avant = (registre: string) =>
			registre.replace("bugs:\n", `bugs:\n${entree(ANCIEN, "low", "a defect the branch introduces")}`);
		const ctx = await enRecette(arbitreLecteur({ [ANCIEN]: "medium" }), avant);
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		assert.deepEqual(defautsOuverts(ctx.root, "medium"), [
			{ id: ANCIEN, gravite: "medium", titre: "a defect the branch introduces" },
		]);
		assert.deepEqual(severites(ctx.root, ANCIEN), [["    severity: medium"], ["    severity: low"]]);
	});

	it("un défaut que la branche inscrit en réécrivant une entrée que la base porte déjà est pesé par l'arbitrage", async () => {
		const ANCIEN = "BUG-2026-01-01T000000";
		const reecrite = (registre: string) =>
			registre.replace(`title: "defect ${ANCIEN}"`, 'title: "a defect the branch introduces"');
		const muet = await enRecette(arbitre([]), reecrite);
		const poursuite = await apresIssue(muet, "recette", QUESTION, 0);
		assert.equal(poursuite.continuer, false);
		assert.match(poursuite.continuer ? "" : poursuite.motif, new RegExp(ANCIEN));
		assert.equal(muet.journal.dernier("acceptee", "recette"), null);

		const ctx = await enRecette(arbitreLecteur({ [ANCIEN]: "medium" }), reecrite);
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		assert.deepEqual(defautsOuverts(ctx.root, "low"), [
			{ id: ANCIEN, gravite: "medium", titre: "a defect the branch introduces" },
		]);
		assert.deepEqual(severites(ctx.root, ANCIEN), [["    severity: medium"]]);
	});

	it("un défaut que la branche inscrit sous toute forme YAML valide est pesé par l'arbitrage, et le registre porte la gravité retenue", async () => {
		const ID = "BUG-2026-10-10T120000";
		const formes: (string | ((registre: string) => string))[] = [
			(registre) =>
				registre.replace("bugs:\n", `bugs:\n${entree(ID, "low").replace(`bug_id: ${ID}`, `bug_id: "${ID}"`)}`),
			`  - {bug_id: ${ID}, title: "defect ${ID}", severity: low, status: open}\n`,
			entree(ID, "low").replace(`bug_id: ${ID}\n`, `bug_id: ${ID} # new\n`),
			(registre) => (registre + entree(ID, "low")).replace(/^(?= )/gm, "   "),
			entree(ID, "low").replace("    status: open\n", '    status: "open"\n'),
			entree(ID, "low").replace("    status: open\n", "    status:\n      open\n"),
			`  # a defect the branch introduces\n${entree(ID, "low")}`,
			(registre) => `# registre\n${registre}${entree(ID, "low")}`,
			() =>
				`bugs: [{bug_id: BUG-2026-01-01T000000, date: "2026-10-10", title: "defect BUG-2026-01-01T000000", severity: low, status: open}, {bug_id: ${ID}, title: "defect ${ID}", severity: low, status: open}]\n`,
		];
		for (const forme of formes) {
			const muet = await enRecette(arbitre([]), forme);
			const poursuite = await apresIssue(muet, "recette", QUESTION, 0);
			assert.equal(poursuite.continuer, false);
			assert.match(
				poursuite.continuer ? "" : poursuite.motif,
				new RegExp(`no severity for the defects the branch records: ${ID}$`),
			);
			assert.equal(muet.journal.dernier("acceptee", "recette"), null);

			const ctx = await enRecette(arbitreLecteur({ [ID]: "high" }), forme);
			assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
			assert.deepEqual(defautsOuverts(ctx.root, "high"), [{ id: ID, gravite: "high", titre: `defect ${ID}` }]);
			assert.deepEqual(defautsOuverts(ctx.root, "low").length, 2);
			assert.deepEqual(ctx.journal.dernier("arbitrage", "recette")?.gravites, [
				{ bug_id: ID, inscrite: "low", retenue: "high", raison: "read" },
			]);
			assert.equal(gitCmd(ctx.root, ["status", "--porcelain"]), "");
		}
	});

	it("un registre que le lecteur YAML ne lit pas, ou dont une entrée n'est pas un défaut, arrête la story, et l'accord ne s'inscrit pas", async () => {
		const ID = "BUG-2026-10-10T120000";
		const formes: (string | (() => string))[] = [
			`  - {bug_id: ${ID}, title: new, severity: low\n`,
			`  - bug_id: ${ID}\n\ttitle: new\n`,
			`  - ${ID}\n`,
			`  - title: "a defect with no identifier"\n    severity: low\n    status: open\n`,
			() => `bugs:\n  bug_id: ${ID}\n  severity: low\n  status: open\n`,
			() => `bugs: ${ID}\n`,
		];
		for (const forme of formes) {
			const ctx = await enRecette(arbitreLecteur({ [ID]: "high" }), forme);
			const poursuite = await apresIssue(ctx, "recette", QUESTION, 0);
			assert.equal(poursuite.continuer, false);
			assert.match(poursuite.continuer ? "" : poursuite.motif, /^specs\/bugs\/registry\.yaml/);
			assert.equal(ctx.journal.dernier("acceptee", "recette"), null);
			assert.equal(ctx.journal.prochainPas(), "recette");
		}
	});

	it("un défaut que la branche inscrit avec une clé severity sans valeur porte, après l'arbitrage, la seule gravité retenue", async () => {
		const ID = "BUG-2026-10-10T120000";
		const ctx = await enRecette(
			arbitreLecteur({ [ID]: "high" }),
			`  - {bug_id: ${ID}, title: "defect ${ID}", severity, status: open}\n`,
		);
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		assert.deepEqual(defautsOuverts(ctx.root, "high"), [{ id: ID, gravite: "high", titre: `defect ${ID}` }]);
		assert.equal(gitCmd(ctx.root, ["status", "--porcelain"]), "");
	});

	it("une entrée de la branche qui porte deux gravités arrête la story, et l'accord ne s'inscrit pas", async () => {
		const ajout = entree(A, "high").replace("    status: open\n", "    severity: low\n    status: open\n");
		const ctx = await enRecette(
			arbitre([{ bug_id: A, gravite: "medium", raison: "it fails the npm reference campaign twice in three" }]),
			ajout,
		);
		const poursuite = await apresIssue(ctx, "recette", QUESTION, 0);
		assert.equal(poursuite.continuer, false);
		assert.match(poursuite.continuer ? "" : poursuite.motif, /^specs\/bugs\/registry\.yaml: Map keys must be unique/);
		assert.equal(ctx.journal.dernier("acceptee", "recette"), null);
	});

	it("chaque défaut que l'invite de l'arbitrage nomme reçoit la gravité retenue pour lui", async () => {
		const ctx = await enRecette(arbitreLecteur({ [A]: "medium", [B]: "high" }), entree(A, "low") + entree(B, "low"));
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		assert.deepEqual(severites(ctx.root, A), [["    severity: medium"]]);
		assert.deepEqual(severites(ctx.root, B), [["    severity: high"]]);
		assert.deepEqual(
			ctx.journal.dernier("arbitrage", "recette")?.gravites,
			[A, B].map((id, i) => ({ bug_id: id, inscrite: "low", retenue: ["medium", "high"][i], raison: "read" })),
		);
	});

	it("le registre porte la gravité retenue même quand l'arbitrage l'a changée lui-même", async () => {
		const ctx = await enRecette(
			`${COMMIT}
import { readFileSync as lire } from "node:fs";
export default (invite, cwd) => {
  if (!invite.startsWith("Arbitrage de la recette")) throw new Error("unexpected prompt: " + invite.slice(0, 60));
  const f = join(cwd, ${JSON.stringify(REGISTRE)});
  commit(cwd, { ${JSON.stringify(REGISTRE)}: lire(f, "utf8").replace('title: "defect ${A}"\\n    severity: low', 'title: "defect ${A}"\\n    severity: high') }, "docs: the registry weighs a defect");
  return { decision: "accepte", note: "tenu", ecart: "", raisons: "r", gravites: [{ bug_id: "${A}", gravite: "low", raison: "cosmetic" }] };
};`,
			entree(A, "low"),
		);
		assert.deepEqual(await apresIssue(ctx, "recette", QUESTION, 0), { continuer: true });
		assert.deepEqual(severites(ctx.root, A), [["    severity: low"]]);
		assert.equal(gitCmd(ctx.root, ["status", "--porcelain"]), "");
	});
});
