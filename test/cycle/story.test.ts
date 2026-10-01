import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { avecStatut, lireStory, parseStory, trouverStory } from "../../cycle/src/story.ts";
import { tempDir, removedAfterEach } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const STORY = `# Une réponse révoquée est reposée

Story : e01s05
Epic : e01
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire voit la question reposée.

## 2. Promesses

Scenario: Une réponse révoquée est reposée
  Given une réponse « 400 » à Q1
  When le propriétaire révoque la réponse
  Then une décision IH-01 repose Q1

Scenario: Une révocation sans provenance humaine est refusée
  Given une réponse enregistrée
  When un agent révoque
  Then la révocation est refusée pour sa provenance

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement.

## 4. Tâches

### Tâche 1 — Le noyau repose la question révoquée

Le noyau retire la réponse et repose la question.

- Vérifie : \`node --test test/v2/answer-revocation.test.ts\`
- Tient : \`test/v2/answer-revocation.test.ts\`, « une décision IH-01 repose Q1 »
- Rouge : \`revokeQuestion\` n'existe pas

### Tâche 2 — La recette dans un vrai Pi

- Vérifie à la main : lancer la campagne du banc et lire le dossier
- Tient : le dossier exporté, « la question figure une fois au mandat »
- Rouge : le mandat porte \`open_questions: []\`

## 5. Hors périmètre

La révocation depuis une seconde session : e09.
`;

describe("a story read from its file", () => {
	it("carries its header, its scenarios and its tasks with what holds them", () => {
		const story = parseStory(STORY);
		assert.equal(story.id, "e01s05");
		assert.equal(story.epic, "e01");
		assert.equal(story.titre, "Une réponse révoquée est reposée");
		assert.equal(story.statut, "à faire");
		assert.deepEqual(story.scenarios, [
			"Une réponse révoquée est reposée",
			"Une révocation sans provenance humaine est refusée",
		]);
		assert.equal(story.gagne, "Le propriétaire voit la question reposée.");
		assert.equal(story.taches.length, 2);
		const [t1, t2] = story.taches;
		assert.equal(t1!.titre, "Le noyau repose la question révoquée");
		assert.equal(t1!.description, "Le noyau retire la réponse et repose la question.");
		assert.deepEqual(t1!.verifie, ["node", "--test", "test/v2/answer-revocation.test.ts"]);
		assert.equal(t1!.rouge, "`revokeQuestion` n'existe pas");
		assert.equal(t2!.verifie, null);
		assert.equal(t2!.verifieALaMain, "lancer la campagne du banc et lire le dossier");
		assert.equal(story.horsPerimetre, "La révocation depuis une seconde session : e09.");
	});

	it("refuses a story whose header lacks a line, or names a status the cycle does not know", () => {
		assert.throws(() => parseStory(STORY.replace("Epic : e01\n", "")), /Epic/);
		assert.throws(() => parseStory(STORY.replace("Statut : à faire", "Statut : done")), /unknown statut/);
	});

	it("is found by its id under specs/stories, whatever its epic directory, and its status line alone is rewritten", () => {
		const root = tempDir("495-", cleanups);
		mkdirSync(join(root, "specs", "stories", "e01"), { recursive: true });
		const path = join(root, "specs", "stories", "e01", "e01s05-une-reponse-revoquee.md");
		writeFileSync(path, STORY);
		assert.equal(trouverStory("e01s05", root), path);
		assert.equal(lireStory("e01s05", root).chemin, path);
		assert.throws(() => trouverStory("e01s06", root), /not found/);
		const versee = avecStatut(STORY, "versée");
		assert.equal(parseStory(versee).statut, "versée");
		assert.equal(versee.replace("Statut : versée", "Statut : à faire"), STORY);
	});
});
