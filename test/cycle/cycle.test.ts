import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { accepter, conduirePas, rouvrir } from "../../cycle/src/cycle.ts";
import { brancheCourante, revision } from "../../cycle/src/git.ts";
import { lireStory } from "../../cycle/src/story.ts";
import { gitCmd, tempDir } from "../helpers/fixtures.ts";
import { COMMIT, PASSING_TEST, SHOUT_CODE, SHOUT_TEST, contexte, depot, fauxClaude } from "../helpers/cycle.ts";

describe("the steps of the cycle", () => {
	it("opens the story on its own branch from a green Preflight, and marks it in progress", async () => {
		const root = depot();
		const ctx = contexte(root, fauxClaude("export default () => ({})"));
		assert.deepEqual(await conduirePas(ctx, "story"), { statut: "fini" });
		assert.equal(brancheCourante(root), "e01s05");
		assert.equal(ctx.story.statut, "en cours");
		assert.equal(gitCmd(root, ["log", "--format=%s", "-1"]).trim(), "docs: the story e01s05 is in progress");
		const genres = ctx.journal.lire().map((e) => e.genre);
		assert.deepEqual(genres, ["debute", "controle", "branche", "fini"]);
		assert.equal(ctx.journal.prochainPas(), "rouge-vert");
	});

	it("after the red-green session, replays each test-only commit as a red, runs each task's command and Preflight", async () => {
		const root = depot();
		const claude = fauxClaude(`${COMMIT}
export default (invite, cwd) => {
  commit(cwd, { "test/shout.test.js": ${JSON.stringify(SHOUT_TEST)} }, "test: greet shouts");
  commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE)} }, "feat: greet shouts");
  return { status: "fini", taches: [{ numero: 1 }], resume: "done" };
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const events = ctx.journal.depuisReouverture().filter((e) => e.pas === "rouge-vert");
		const rouge = events.find((e) => e.genre === "rouge");
		assert.equal(rouge?.rouge, true);
		const echecs = (rouge?.echecs ?? []) as string[];
		assert.ok(
			echecs.some((e) => e.includes("shout")),
			echecs.join("; "),
		);
		assert.deepEqual(
			events.filter((e) => e.genre === "controle").map((e) => [e.controle, e.verdict]),
			[
				["tache-1", "FAIL"],
				["tache-1", "PASS"],
				["preflight", "PASS"],
			],
		);
		assert.equal(ctx.journal.prochainPas(), "autocontrole");
	});

	it("blocks when a test-only commit fails on nothing the story states, or when a task's command is red at the head", async () => {
		const root = depot();
		const claude = fauxClaude(`${COMMIT}
export default (invite, cwd) => {
  commit(cwd, { "test/shout.test.js": ${JSON.stringify(PASSING_TEST)} }, "test: greet shouts");
  return { status: "fini", taches: [{ numero: 1 }], resume: "done" };
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		const issue = await conduirePas(ctx, "rouge-vert");
		assert.equal(issue.statut, "bloque");
		assert.match(issue.statut === "bloque" ? issue.motif : "", /no failing test read at this test-only commit/);
		assert.equal(ctx.journal.prochainPas(), "rouge-vert");
	});

	it("replays only the test-only commits of the pass, so a green test a later step left on the branch does not block a reopened story", async () => {
		const root = depot();
		const claude = fauxClaude(`${COMMIT}
import { existsSync, readFileSync } from "node:fs";
export default (invite, cwd) => {
  const shout = existsSync(cwd + "/test/shout.test.js") && readFileSync(cwd + "/test/shout.test.js", "utf8").includes("refactored");
  if (!shout) {
    commit(cwd, { "test/shout.test.js": ${JSON.stringify(SHOUT_TEST)} }, "test: greet shouts");
    commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE)} }, "feat: greet shouts");
  } else {
    commit(cwd, { "test/shout.test.js": ${JSON.stringify(SHOUT_TEST.replace('"HELLO, X"', '"HELLO, X!"'))} }, "test: greet shouts with an exclamation mark");
    commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE.replace("toUpperCase()", 'toUpperCase() + "!"'))} }, "feat: greet shouts with an exclamation mark");
  }
  return { status: "fini", taches: [{ numero: 1 }], resume: "done" };
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		ctx.journal.inscrire("autocontrole", "fini");
		writeFileSync(join(root, "test", "shout.test.js"), `// refactored\n${SHOUT_TEST}`);
		gitCmd(root, ["add", "-A"]);
		gitCmd(root, ["commit", "-q", "-m", "test: the shout test names its subject once"]);
		rouvrir(ctx, "the greeting lacks its exclamation mark");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const rouges = ctx.journal.depuisReouverture().filter((e) => e.genre === "rouge");
		assert.deepEqual(
			rouges.map((e) => [e.sujet, e.rouge]),
			[["test: greet shouts with an exclamation mark", true]],
		);
	});

	it("replays every test-only commit of a pass resumed after a block, the ones its earlier launch made included", async () => {
		const root = depot();
		const claude = fauxClaude(`${COMMIT}
import { existsSync } from "node:fs";
export default (invite, cwd) => {
  if (!existsSync(cwd + "/test/shout.test.js")) {
    commit(cwd, { "test/shout.test.js": ${JSON.stringify(SHOUT_TEST)} }, "test: greet shouts");
    return { status: "fini", taches: [{ numero: 1 }], resume: "stopped before the code" };
  }
  commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE)} }, "feat: greet shouts");
  return { status: "fini", taches: [{ numero: 1 }], resume: "done" };
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		assert.equal((await conduirePas(ctx, "rouge-vert")).statut, "bloque");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const rouges = ctx.journal.lire().filter((e) => e.genre === "rouge" && e.rouge === true);
		assert.deepEqual(
			rouges.map((e) => e.sujet),
			["test: greet shouts", "test: greet shouts"],
		);
	});

	it("finishes a pass resumed after its work was done, whose session has nothing left to commit", async () => {
		const root = depot();
		const claude = fauxClaude(`${COMMIT}
import { existsSync } from "node:fs";
export default (invite, cwd) => {
  if (existsSync(cwd + "/test/shout.test.js")) return { status: "fini", taches: [{ numero: 1 }], resume: "already done" };
  commit(cwd, { "test/shout.test.js": ${JSON.stringify(SHOUT_TEST)} }, "test: greet shouts");
  commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE)} }, "feat: greet shouts");
  return { status: "fini", taches: [{ numero: 1 }], resume: "done" };
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		const head = revision(root);
		assert.deepEqual(await conduirePas(ctx, "rouge-vert"), { statut: "fini" });
		assert.equal(revision(root), head, "the resumed session committed nothing");
	});

	it("reviews in two rounds at most, answers what holds the gate, and hands an unkept promise to the owner", async () => {
		const root = depot();
		const constat = (id: string, categorie: string, placement = "introduit") =>
			JSON.stringify({ id, scenario: "greet shouts", categorie, placement, constat: id });
		const claude = fauxClaude(`${COMMIT}
export default (invite, cwd) => {
  if (invite.startsWith("Tu es le relecteur A, tour 1")) return { verdict: "fail", constats: [${constat("A1-1", "a_corriger")}, ${constat("A1-2", "a_peser", "anterieur")}], resume: "" };
  if (invite.startsWith("Tu es le relecteur B, tour 1")) return { verdict: "pass", constats: [], resume: "" };
  if (invite.startsWith("Réponse au tour 1")) { commit(cwd, { "test/more.test.js": "// held\\n" }, "test: more"); return { status: "fini", reponses: [{ id: "A1-1", action: "corrige", motif: "test added" }], resume: "" }; }
  if (invite.startsWith("Tu es le relecteur A, tour 2")) return { verdict: "fail", constats: [${constat("A2-1", "bloquant")}], resume: "" };
  if (invite.startsWith("Tu es le relecteur B, tour 2")) return { verdict: "pass", constats: [], resume: "" };
  if (invite.startsWith("Réponse au tour 2")) return { status: "fini", reponses: [], resume: "" };
  throw new Error("unexpected prompt: " + invite.slice(0, 60));
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		for (const pas of ["rouge-vert", "autocontrole"] as const) ctx.journal.inscrire(pas, "fini");
		const issue = await conduirePas(ctx, "relecture");
		assert.equal(issue.statut, "proprietaire");
		assert.match(issue.statut === "proprietaire" ? issue.question : "", /A2-1/);
		const tours = ctx.journal.lire().filter((e) => e.genre === "tour");
		assert.deepEqual(
			tours.map((e) => [e.tour, e.porte, e.constats]),
			[
				[1, "fail", 2],
				[2, "fail", 1],
			],
		);
		assert.equal(tours[1]!.base, tours[0]!.tete, "the second round reads the diff since the first");
		assert.notEqual(tours[1]!.tete, tours[0]!.tete, "the response committed between the rounds");
		assert.equal(ctx.journal.prochainPas(), "relecture");
		const sessions = ctx.journal
			.lire()
			.filter((e) => e.genre === "session")
			.map((e) => String(e.nom));
		// The two reviewers of a round run in parallel; nothing is answered after the last round when
		// what remains is the owner's.
		assert.deepEqual(sessions.sort(), [
			"relecteur-A-tour-1",
			"relecteur-A-tour-2",
			"relecteur-B-tour-1",
			"relecteur-B-tour-2",
			"reponse-tour-1",
		]);
	});

	it("keeps the tree of a reviewer running until it ends when the other reviewer's session fails", async () => {
		const root = depot();
		const marker = join(tempDir(), "b-cwd");
		const claude = fauxClaude(`import { existsSync, writeFileSync } from "node:fs";
export default async (invite, cwd) => {
  if (invite.startsWith("Tu es le relecteur A")) throw new Error("the session died");
  await new Promise((r) => setTimeout(r, 700));
  writeFileSync(${JSON.stringify(marker)}, existsSync(cwd) ? "present" : "gone");
  return { verdict: "pass", constats: [], resume: "" };
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		for (const pas of ["rouge-vert", "autocontrole"] as const) ctx.journal.inscrire(pas, "fini");
		const issue = await conduirePas(ctx, "relecture");
		assert.equal(issue.statut, "bloque");
		assert.equal(readFileSync(marker, "utf8"), "present");
	});

	it("hands the acceptance run to the owner, records the acceptance, and sends a named gap back to the red-green", async () => {
		const root = depot();
		const claude = fauxClaude(
			`export default () => ({ status: "prete", campagnes: [{ nom: "c1", verdict: "PASS" }], ecarts: [], compte_rendu: "Ce qui est montré : …" })`,
		);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		for (const pas of ["rouge-vert", "autocontrole", "relecture"] as const) ctx.journal.inscrire(pas, "fini");
		const issue = await conduirePas(ctx, "recette");
		assert.equal(issue.statut, "proprietaire");
		assert.match(issue.statut === "proprietaire" ? issue.question : "", /Ce qui est montré/);
		assert.equal(ctx.journal.prochainPas(), "recette");
		accepter(ctx, "vu");
		assert.equal(ctx.journal.prochainPas(), "versement");
		rouvrir(ctx, "the negative control still accepts");
		assert.equal(ctx.journal.prochainPas(), "rouge-vert");
	});

	it("lands the branch as one commit on main, marks the story versée and records its dossier", async () => {
		const root = depot();
		const claude = fauxClaude(`${COMMIT}
export default (invite, cwd) => {
  if (invite.startsWith("Pas 2")) { commit(cwd, { "src/greet.js": ${JSON.stringify(SHOUT_CODE)}, "test/shout.test.js": ${JSON.stringify(SHOUT_TEST)} }, "feat: greet shouts"); return { status: "fini", taches: [], resume: "" }; }
  return { message: "feat: greet shouts its greeting" };
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		await conduirePas(ctx, "rouge-vert");
		for (const pas of ["autocontrole", "relecture", "recette"] as const) ctx.journal.inscrire(pas, "fini");
		assert.deepEqual(await conduirePas(ctx, "versement"), { statut: "fini" });
		assert.equal(brancheCourante(root), "main");
		assert.deepEqual(gitCmd(root, ["log", "--format=%s", "-3"]).trim().split("\n"), [
			"docs: the story e01s05 is landed and its dossier recorded",
			"feat: greet shouts its greeting",
			"chore: base",
		]);
		assert.equal(lireStory("e01s05", root).statut, "versée");
		const dossier = join(root, "specs", "verifications", "e01s05");
		assert.ok(existsSync(join(dossier, "journal.jsonl")));
		assert.ok(readdirSync(join(dossier, "objets")).length > 0, "the outputs of the controls are exported");
		assert.ok(readFileSync(join(dossier, "journal.jsonl"), "utf8").includes('"genre":"verse"'));
		assert.equal(revision(root, "e01s05").length, 40, "the branch is kept");
		assert.equal(ctx.journal.prochainPas(), null);
	});
});
