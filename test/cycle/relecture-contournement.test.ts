import { beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { conduirePas } from "../../cycle/src/cycle.ts";
import { type Constat, trier } from "../../cycle/src/relecture.ts";
import { COMMIT, contexte, depot, fauxClaude } from "../helpers/cycle.ts";
import { gitCmd, removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const contournement = (id: string, categorie: Constat["categorie"], placement: Constat["placement"]): Constat => ({
	id,
	scenario: "Sécurité",
	categorie,
	placement,
	constat: "a model rewrites a guarded case under a neighbouring name",
	contournement: "le producteur ne change pas son juge",
});

describe("the sorting of a round that shows a bypass of the security section", () => {
	it("un contournement placé avant la branche retient la porte et va à la réponse, pas au registre", () => {
		const tri = trier([{ verdict: "fail", constats: [contournement("A1-1", "bloquant", "anterieur")], resume: "" }]);
		assert.equal(tri.porte, "fail", "the gate is refused");
		assert.deepEqual(
			tri.aTraiter.map((c) => c.id),
			["A1-1"],
			"the bypass goes to the response",
		);
		assert.deepEqual(tri.anterieurs, [], "the bypass does not go to the registry");
	});

	it("holds the gate on a bypass whatever its category", () => {
		for (const categorie of ["a_corriger", "a_peser"] as const) {
			const tri = trier([{ verdict: "pass", constats: [contournement("B1-1", categorie, "introduit")], resume: "" }]);
			assert.equal(tri.porte, "fail", categorie);
		}
	});
});

describe("a bypass the response of a round does not fix", () => {
	const constat = JSON.stringify({
		id: "A1-1",
		scenario: "Sécurité",
		categorie: "bloquant",
		placement: "anterieur",
		constat: "a model rewrites a guarded case under a neighbouring name",
		contournement: "le producteur ne change pas son juge",
	});
	// `fermes` is what each reviewer of round 2 answers; its prompt is written under `invites`.
	let invites = "";
	beforeEach(() => {
		invites = tempDir("495-", cleanups);
	});
	const relecture = (reponse: string, fermes: Record<string, string[]> = {}) =>
		fauxClaude(`${COMMIT}
import { writeFileSync as ecrire } from "node:fs";
export default (invite, cwd) => {
  if (invite.startsWith("Tu es le relecteur A, tour 1")) return { verdict: "fail", constats: [${constat}], resume: "" };
  const tour2 = /^Tu es le relecteur (A|B), tour 2/.exec(invite);
  if (tour2) {
    ecrire(${JSON.stringify(invites)} + "/" + tour2[1], invite);
    return { verdict: "pass", constats: [], fermes: ${JSON.stringify(fermes)}[tour2[1]] ?? [], resume: "" };
  }
  if (invite.startsWith("Tu es le relecteur")) return { verdict: "pass", constats: [], resume: "" };
  if (invite.startsWith("Réponse au tour 1")) { ${reponse} }
  throw new Error("unexpected prompt: " + invite.slice(0, 60));
};`);
	const conduire = async (claude: string) => {
		const ctx = contexte(depot(), claude);
		await conduirePas(ctx, "story");
		for (const pas of ["rouge-vert", "autocontrole"] as const) ctx.journal.inscrire(pas, "fini");
		const issue = await conduirePas(ctx, "relecture");
		const tours = ctx.journal.lire().filter((e) => e.genre === "tour");
		return { issue, portes: tours.map((e) => [e.tour, e.porte]) };
	};

	// A response that commits on the branch and cites that commit, abbreviated to `chiffres` characters. Where each
	// reviewer of the next round lists the bypass closed, only the action or the citation keeps it open.
	const avecCommit = (action: string, chiffres = 40) =>
		`commit(cwd, { "README.sham": "sham\\n" }, "docs: answer the bypass");
    return { status: "fini", reponses: [{ id: "A1-1", action: "${action}", commit: git(cwd, ["rev-parse", "HEAD"]).slice(0, ${chiffres}), motif: "answered" }], resume: "" };`;

	for (const [action, reponse] of [
		["contests citing a commit of the branch", avecCommit("conteste")],
		["registers citing a commit of the branch", avecCommit("registre")],
		[
			"claims to fix without a commit",
			`return { status: "fini", reponses: [{ id: "A1-1", action: "corrige", commit: "deadbeef", motif: "fixed" }], resume: "" };`,
		],
		["claims to fix citing six characters of its commit", avecCommit("corrige", 6)],
	] as const)
		it(`still holds the gate in the next round and goes to the owner when the response ${action}, though each reviewer lists it closed`, async () => {
			const { issue, portes } = await conduire(relecture(reponse, { A: ["A1-1"], B: ["A1-1"] }));
			assert.deepEqual(portes, [
				[1, "fail"],
				[2, "fail"],
			]);
			assert.equal(issue.statut, "proprietaire");
			assert.match(issue.statut === "proprietaire" ? issue.question : "", /A1-1/);
		});

	const corrigeAvec = (fichiers: Record<string, string>) =>
		`commit(cwd, ${JSON.stringify(fichiers)}, "fix: the guard holds");
    return { status: "fini", reponses: [{ id: "A1-1", action: "corrige", commit: git(cwd, ["rev-parse", "HEAD"]), motif: "fixed" }], resume: "" };`;

	for (const [ce, fichiers] of [
		["an unrelated file", { "README.sham": "sham\n" }],
		["the bypass into the registry", { "specs/bugs/registry.yaml": "bugs:\n  - title: A1-1\n    status: fixed\n" }],
	] as const)
		it(`still holds the gate in the next round and goes to the owner when the response claims it fixed by a commit of ${ce} that no reviewer confirms closed`, async () => {
			const { issue, portes } = await conduire(relecture(corrigeAvec(fichiers)));
			assert.deepEqual(portes, [
				[1, "fail"],
				[2, "fail"],
			]);
			assert.equal(issue.statut, "proprietaire");
			assert.match(issue.statut === "proprietaire" ? issue.question : "", /A1-1/);
			for (const r of ["A", "B"]) {
				const invite = readFileSync(join(invites, r), "utf8");
				const debut = invite.indexOf("déjà traités");
				const traites = debut < 0 ? "" : invite.slice(debut, invite.indexOf("Ta sortie structurée"));
				assert.doesNotMatch(traites, /A1-1/, `${r} is not told the bypass is already handled`);
				assert.match(invite, /rejoue[\s\S]*A1-1/, `${r} is asked to replay the bypass on the head`);
			}
		});

	it("still holds the gate when only one reviewer of the next round confirms the bypass closed", async () => {
		const { issue, portes } = await conduire(
			relecture(corrigeAvec({ "test/guard.test.js": "// guarded\n" }), { B: ["A1-1"] }),
		);
		assert.deepEqual(portes, [
			[1, "fail"],
			[2, "fail"],
		]);
		assert.equal(issue.statut, "proprietaire");
	});

	it("leaves the gate to the next round's reviewers once the response commits its fix and each of them confirms it closed", async () => {
		const { issue, portes } = await conduire(
			relecture(corrigeAvec({ "test/guard.test.js": "// guarded\n" }), { A: ["A1-1"], B: ["A1-1"] }),
		);
		assert.deepEqual(portes, [
			[1, "fail"],
			[2, "pass"],
		]);
		assert.deepEqual(issue, { statut: "fini" });
	});

	it("leaves the gate to the next round's reviewers when the response cites seven characters of its commit and each of them confirms it closed", async () => {
		const { issue, portes } = await conduire(relecture(avecCommit("corrige", 7), { A: ["A1-1"], B: ["A1-1"] }));
		assert.deepEqual(portes, [
			[1, "fail"],
			[2, "pass"],
		]);
		assert.deepEqual(issue, { statut: "fini" });
	});
});

describe("a review step relaunched after a block, once a round's response has answered a bypass", () => {
	const constat = JSON.stringify({
		id: "A1-1",
		scenario: "Sécurité",
		categorie: "bloquant",
		placement: "introduit",
		constat: "a model rewrites a guarded case under a neighbouring name",
		contournement: "le producteur ne change pas son juge",
	});
	// Until `relance` exists under `etat`, reviewer A of round 1 raises the bypass and the step meets the block
	// `blocage` sets up; once the owner relaunches, no reviewer raises anything.
	const relecture = (etat: string, blocage: { reponse: string; relecteurB2?: string }) =>
		fauxClaude(`${COMMIT}
import { existsSync } from "node:fs";
export default (invite, cwd) => {
  const relance = existsSync(${JSON.stringify(etat)} + "/relance");
  if (invite.startsWith("Tu es le relecteur A, tour 1") && !relance) return { verdict: "fail", constats: [${constat}], resume: "" };
  if (invite.startsWith("Tu es le relecteur B, tour 2") && !relance) { ${blocage.relecteurB2 ?? ""} }
  if (invite.startsWith("Tu es le relecteur")) return { verdict: "pass", constats: [], resume: "" };
  if (invite.startsWith("Réponse au tour 1")) { ${blocage.reponse} }
  throw new Error("unexpected prompt: " + invite.slice(0, 60));
};`);
	const registre = `commit(cwd, { "specs/bugs/registry.yaml": "bugs:\\n  - title: A1-1\\n    status: open\\n" }, "docs: register A1-1");`;
	const repond = (action: string) =>
		`return { status: "fini", reponses: [{ id: "A1-1", action: "${action}", commit: git(cwd, ["rev-parse", "HEAD"]), motif: "answered" }], resume: "" };`;

	for (const [blocage, mise] of [
		[
			"le commit de sa réponse laisse la Preflight rouge",
			{
				reponse: `${registre} commit(cwd, { "test/rouge.test.js": "import { test } from 'node:test'; test('red', () => { throw new Error('red'); });\\n" }, "test: red"); ${repond("registre")}`,
			},
		],
		[
			"un relecteur du tour suivant échoue",
			{ reponse: `${registre} ${repond("conteste")}`, relecteurB2: `throw new Error("the session fails");` },
		],
		[
			"un relecteur du tour suivant échoue avant de rejouer le contournement que la réponse dit corrigé",
			{
				reponse: `commit(cwd, { "test/guard.test.js": "// guarded\\n" }, "fix: the guard holds"); ${repond("corrige")}`,
				relecteurB2: `throw new Error("the session fails");`,
			},
		],
		["la session de la réponse échoue après son commit", { reponse: `${registre} throw new Error("interrupted");` }],
	] as const)
		it(`un contournement que la réponse d'un tour laisse ouvert retient encore la porte quand la relecture, bloquée parce que ${blocage}, est relancée`, async () => {
			const etat = tempDir("495-", cleanups);
			const ctx = contexte(depot(), relecture(etat, mise));
			await conduirePas(ctx, "story");
			for (const pas of ["rouge-vert", "autocontrole"] as const) ctx.journal.inscrire(pas, "fini");
			const bloquee = await conduirePas(ctx, "relecture");
			assert.equal(bloquee.statut, "bloque", "the review step stops after the response of round 1");

			// The owner clears what blocked the step and relaunches it; its reviewers no longer raise the bypass.
			if (existsSync(join(ctx.root, "test", "rouge.test.js"))) {
				gitCmd(ctx.root, ["rm", "-q", "test/rouge.test.js"]);
				gitCmd(ctx.root, ["commit", "-q", "-m", "test: green"]);
			}
			writeFileSync(join(etat, "relance"), "");
			const issue = await conduirePas(ctx, "relecture");
			assert.equal(issue.statut, "proprietaire", "the bypass still holds the gate and goes to the owner");
			assert.match(issue.statut === "proprietaire" ? issue.question : "", /A1-1/);
		});
});
