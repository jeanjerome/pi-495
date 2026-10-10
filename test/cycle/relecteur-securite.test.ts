import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { conduirePas } from "../../cycle/src/cycle.ts";
import { invite } from "../../cycle/src/invite.ts";
import { SCHEMA_RAPPORT } from "../../cycle/src/relecture.ts";
import { STORY, contexte, depotDe, fauxClaude } from "../helpers/cycle.ts";
import { fixtureTs, removedAfterEach, tempDir } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const PROMESSES =
	"## Promesses\n\nScenario: greet greets\n  Given a name\n  When greet runs\n  Then it says hello\n\n" +
	"## Sécurité\n\nLe producteur ne change pas son juge.";

// The prompt wraps its lines; a sentence is read across them.
const texte = invite("relecteur", {
	relecteur: "A",
	tour: 1,
	id: "e00s01",
	base: "b",
	tete: "t",
	tour_precedent: "",
	promesses: PROMESSES,
	registre: "aucune",
}).replace(/\s+/g, " ");

describe("the reviewer's prompt on the security section", () => {
	it("l'invite du relecteur demande un contournement de chaque garantie de la section Sécurité et garde l'interdit pour les promesses", () => {
		assert.match(
			texte,
			/pour chaque garantie de la section Sécurité, cherche un chemin concret, par les entrées publiques que la branche expose, qui obtient ce que la garantie refuse/,
			"the prompt asks for a bypass of every guarantee of the security section",
		);
		assert.match(
			texte,
			/Pour les promesses, ne propose ni scénario, ni état, ni entrelacement de ton cru/,
			"the prompt still forbids a scenario of its own for the promises",
		);
		assert.match(
			texte,
			/Marque son constat du champ `contournement`, qui cite la garantie qu'il contourne\./,
			"the prompt asks to mark a finding that shows a bypass with the guarantee it gets around",
		);
		const constat = SCHEMA_RAPPORT.properties.constats.items.properties;
		assert.ok("contournement" in constat, "the structured output marks a finding that shows a bypass");
		assert.match(texte, /Le producteur ne change pas son juge\./);
	});
});

describe("a review round on a story whose security section carries a guarantee", () => {
	it("sends each reviewer the guarantee of the story's security section", async () => {
		const garantie = "Le producteur ne change pas son juge.";
		const root = depotDe((r) => {
			fixtureTs(r);
			mkdirSync(join(r, "specs", "stories", "e01"), { recursive: true });
			writeFileSync(
				join(r, "specs", "stories", "e01", "e01s05-greet-shouts.md"),
				STORY.replace("Sans objet : nothing sensitive.", garantie),
			);
		});
		const invites = tempDir("495-", cleanups);
		const claude = fauxClaude(`import { writeFileSync } from "node:fs";
export default (invite) => {
  const relecteur = /^Tu es le relecteur (A|B), tour 1/.exec(invite);
  if (!relecteur) throw new Error("unexpected prompt: " + invite.slice(0, 60));
  writeFileSync(${JSON.stringify(invites)} + "/" + relecteur[1], invite);
  return { verdict: "pass", constats: [], resume: "" };
};`);
		const ctx = contexte(root, claude);
		await conduirePas(ctx, "story");
		for (const pas of ["rouge-vert", "autocontrole"] as const) ctx.journal.inscrire(pas, "fini");
		assert.deepEqual(await conduirePas(ctx, "relecture"), { statut: "fini" });
		for (const r of ["A", "B"])
			assert.match(readFileSync(join(invites, r), "utf8"), /## Sécurité\s+Le producteur ne change pas son juge\./, r);
	});
});

describe("the response prompt on a bypass of the security section", () => {
	it("tells the response to fix a bypass whatever its location or category and never to register it", () => {
		const reponse = invite("reponse", { tour: 1, id: "e00s01", branche: "e00s01", mode: "", constats: "[]" }).replace(
			/\s+/g,
			" ",
		);
		assert.match(
			reponse,
			/Un constat marqué `contournement`, quels que soient son placement et sa catégorie : corrige-le sur la branche ; il ne va jamais au registre/,
		);
	});
});
