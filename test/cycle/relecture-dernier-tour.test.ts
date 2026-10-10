import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apresIssue } from "../../cycle/src/automate.ts";
import { conduirePas } from "../../cycle/src/cycle.ts";
import { type Constat, apresDernierTour } from "../../cycle/src/relecture.ts";
import { COMMIT, contexte, depot, fauxClaude } from "../helpers/cycle.ts";
import { removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const contournement = (id: string, categorie: Constat["categorie"], placement: Constat["placement"]): Constat => ({
	id,
	scenario: "Sécurité",
	categorie,
	placement,
	constat: "a model rewrites a guarded case under a neighbouring name",
	contournement: "le producteur ne change pas son juge",
});

describe("the end of the review when the last round leaves a bypass", () => {
	it("après le dernier tour, un contournement classé à corriger va au propriétaire et non au registre", () => {
		const fin = apresDernierTour([
			{
				verdict: "fail",
				constats: [contournement("A2-1", "a_corriger", "introduit"), contournement("A2-2", "a_peser", "anterieur")],
				resume: "",
			},
		]);
		assert.deepEqual(
			fin.proprietaire.map((c) => c.id),
			["A2-1", "A2-2"],
			"the bypass is put to the owner as a promise the code does not keep",
		);
		assert.deepEqual(fin.registre, [], "the registry does not receive the bypass");
	});

	it("un contournement que la réponse écrit au registre retient encore la porte du tour unique qui suit la réouverture, tant que ses relecteurs ne le trouvent pas fermé", async () => {
		const invites = tempDir("495-", cleanups);
		const constat = JSON.stringify(contournement("A1-1", "bloquant", "rendu_atteignable"));
		// The response writes the bypass into the registry itself and answers `registre`; the reviewers of the round
		// that follows the reopening raise nothing and list nothing closed.
		const claude = fauxClaude(`${COMMIT}
import { existsSync, writeFileSync as ecrire } from "node:fs";
export default (invite, cwd) => {
  const registre = existsSync(join(cwd, "specs/bugs/registry.yaml"));
  const relecteur = /^Tu es le relecteur (A|B), tour (\\d)/.exec(invite);
  if (relecteur && registre && relecteur[2] === "1") ecrire(${JSON.stringify(invites)} + "/" + relecteur[1], invite);
  if (relecteur && !registre && relecteur[1] === "A" && relecteur[2] === "1")
    return { verdict: "fail", constats: [${constat}], resume: "" };
  if (relecteur) return { verdict: "pass", constats: [], resume: "" };
  if (invite.startsWith("Réponse au tour 1")) {
    commit(cwd, { "specs/bugs/registry.yaml": "bugs:\\n  - bug_id: BUG-2026-10-10T000001\\n    title: A1-1\\n    severity: low\\n    status: open\\n" }, "docs: register A1-1");
    return { status: "fini", reponses: [{ id: "A1-1", action: "registre", commit: git(cwd, ["rev-parse", "HEAD"]), motif: "registered" }], resume: "" };
  }
  throw new Error("unexpected prompt: " + invite.slice(0, 60));
};`);
		const ctx = contexte(depot(), claude);
		await conduirePas(ctx, "story");
		const finir = () => {
			for (const pas of ["rouge-vert", "autocontrole"] as const) ctx.journal.inscrire(pas, "fini");
		};
		finir();
		const premiere = await conduirePas(ctx, "relecture");
		assert.equal(premiere.statut, "proprietaire");
		assert.deepEqual(await apresIssue(ctx, "relecture", premiere, 0), { continuer: true });
		finir();

		const issue = await conduirePas(ctx, "relecture");
		assert.equal(issue.statut, "proprietaire", "the bypass is put back as a promise the code does not keep");
		assert.match(issue.statut === "proprietaire" ? issue.question : "", /A1-1/);
		for (const r of ["A", "B"])
			assert.match(
				readFileSync(join(invites, r), "utf8"),
				/rejoue[\s\S]*A1-1/,
				`${r} is asked to replay the bypass on the head`,
			);
	});
});
