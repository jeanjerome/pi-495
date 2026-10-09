import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { avecStatut, lireStory, parseStory, trouverStory } from "../../cycle/src/story.ts";
import { suite } from "../../cycle/src/suite.ts";
import { STORY as GREET, depot, fauxClaude } from "../helpers/cycle.ts";
import { gitCmd, tempDir, removedAfterEach } from "../helpers/fixtures.ts";

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
		const chemin = "specs/stories/e01/e01s05-x.md";
		assert.throws(
			() => parseStory(STORY.replace("Epic : e01\n", ""), chemin),
			/^Error: specs\/stories\/e01\/e01s05-x\.md: story header "Epic" is missing$/,
		);
		assert.throws(
			() => parseStory(STORY.replace("Statut : à faire", "Statut : done"), chemin),
			/^Error: specs\/stories\/e01\/e01s05-x\.md: unknown statut "done"/,
		);
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

const LANDED_E01S05 = '      - { id: e01s05, status: "versée", title: "greet shouts" }\n';

/** The prompt the drafting session receives when the plan lists `stories` under the ready epic e01. */
async function contexteDeRedaction(root: string, stories: string): Promise<string> {
	writeFileSync(
		join(root, "specs", "plan.yaml"),
		`epics:\n  - id: e01\n    title: "Greet"\n    status: à faire\n    prete: oui\n    stories:\n${stories}`,
	);
	gitCmd(root, ["add", "-A"]);
	gitCmd(root, ["commit", "-q", "-m", "docs: the plan lists the ready epic"]);
	const invites = join(tempDir("495-", cleanups), "invites.txt");
	const claude = fauxClaude(`import { appendFileSync } from "node:fs";
export default (invite) => {
  appendFileSync(${JSON.stringify(invites)}, invite);
  return { status: "complete", story_id: "", message: "", resume: "delivered" };
};`);
	await suite({
		root,
		racine: tempDir("495-", cleanups),
		cible: "main",
		claude,
		deroulerStory: async () => 0,
	});
	return readFileSync(invites, "utf8");
}

describe("the readiness diagnostic given to the drafting of the next story", () => {
	it("le contexte cite les promesses non vérifiées sans recopier un dossier entier", async () => {
		const root = depot();
		const dir = join(root, "specs", "stories", "e01");
		const whispers = "greet whispers to a sleeping name";
		writeFileSync(
			join(dir, "e01s05-greet-shouts.md"),
			GREET.replace("Statut : à faire", "Statut : versée").replace(
				"## 3. Sécurité",
				`Scenario: ${whispers}\n  Given a sleeping name\n  When greet is called\n  Then the greeting is lower case\n\n## 3. Sécurité`,
			),
		);
		const moyens = [
			{ moyen: "exemples", retenu: true, raison: "one case shows the case of the greeting" },
			{ moyen: "proprietes", retenu: false, raison: "no input worth varying" },
			{ moyen: "modele-d-etats", retenu: false, raison: "no state" },
			{ moyen: "preuve-lean", retenu: false, raison: "no decision rule" },
		];
		const promesse = (id: string, scenario: string, oracles: unknown[]) => ({
			id,
			scenario,
			categorie: "nouveau-comportement",
			observation: `OBSERVATION-${id} the greeting as returned`,
			oracles,
			dependances: [],
			interactions: [],
			moyens,
		});
		writeFileSync(
			join(dir, "e01s05-greet-shouts.verification.json"),
			JSON.stringify({
				version: 1,
				story: "e01s05",
				promesses: [
					promesse("P1", "greet shouts", [
						{ tache: 1, cas: "test/shout.test.js", assertion: "ASSERTION-P1 upper case" },
					]),
					promesse("P2", whispers, []),
				],
			}),
		);
		const contexte = await contexteDeRedaction(root, LANDED_E01S05);
		assert.match(contexte, /specs\/stories\/e01\/e01s05-greet-shouts\.verification\.json/);
		assert.match(contexte, new RegExp(`${whispers}.*sans oracle`));
		assert.doesNotMatch(contexte, /greet shouts.*sans oracle/);
		assert.doesNotMatch(contexte, /OBSERVATION-|ASSERTION-P1|Given a sleeping name/);
	});

	it("lists a landed story without a companion as such, and one whose file is gone by its title alone", async () => {
		const root = depot();
		const chemin = join(root, "specs", "stories", "e01", "e01s05-greet-shouts.md");
		writeFileSync(chemin, GREET.replace("Statut : à faire", "Statut : versée"));
		const contexte = await contexteDeRedaction(
			root,
			`      - { id: e01s04, status: "versée", title: "greet waves" }\n${LANDED_E01S05}`,
		);
		assert.match(contexte, /- e01s04 : greet waves\n- e01s05 : greet shouts\n {2}sans compagnon de vérification\n/);
	});
});
