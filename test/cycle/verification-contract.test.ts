import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lireStory } from "../../cycle/src/story.ts";
import { resumeDeVerification } from "../../cycle/src/verification-contract.ts";
import { tempDir, removedAfterEach } from "../helpers/fixtures.ts";

const cleanups = removedAfterEach();

const P1 = "Une réponse révoquée est reposée";
const P2 = "Une révocation sans provenance humaine est refusée";

const STORY = `# Une réponse révoquée est reposée

Story : e01s05
Epic : e01
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire voit la question reposée.

## 2. Promesses

Scenario: ${P1}
  Given une réponse « 400 » à Q1
  When le propriétaire révoque la réponse
  Then une décision IH-01 repose Q1

Scenario: ${P2}
  Given une réponse enregistrée
  When un agent révoque
  Then la révocation est refusée pour sa provenance

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement.

## 4. Tâches

### Tâche 1 — Le noyau repose la question révoquée

- Vérifie : \`node --test test/v2/answer-revocation.test.ts\`
- Tient : \`test/v2/answer-revocation.test.ts\`, « une décision IH-01 repose Q1 »
- Rouge : \`revokeQuestion\` n'existe pas

### Tâche 2 — La recette dans un vrai Pi

- Vérifie à la main : lancer la campagne du banc et lire le dossier
- Tient : le dossier exporté, « la question figure une fois au mandat »
- Rouge : le mandat porte \`open_questions: []\`

## 5. Hors périmètre

Rien.
`;

const EXEMPLES_SEULS = [
	{ moyen: "exemples", retenu: true, raison: "un cas suffit à observer la décision" },
	{ moyen: "proprietes", retenu: false, raison: "aucune entrée à faire varier" },
	{ moyen: "modele-d-etats", retenu: false, raison: "une seule transition" },
	{ moyen: "preuve-lean", retenu: false, raison: "aucune règle de décision à prouver" },
];

function promesse(id: string, scenario: string, oracles: unknown[], extra: Record<string, unknown> = {}) {
	return {
		id,
		scenario,
		categorie: "nouveau-comportement",
		observation: "une décision IH-01 dans le dossier",
		oracles,
		dependances: [],
		interactions: [],
		moyens: EXEMPLES_SEULS,
		...extra,
	};
}

const ORACLE_P1 = { tache: 1, cas: "test/v2/answer-revocation.test.ts", assertion: "une décision IH-01 repose Q1" };

/** A story directory holding the story above and, when given, its companion beside it. */
function storyAvec(compagnon?: unknown): string {
	const root = tempDir("495-", cleanups);
	const dir = join(root, "specs", "stories", "e01");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "e01s05-une-reponse-revoquee.md"), STORY);
	if (compagnon !== undefined)
		writeFileSync(
			join(dir, "e01s05-une-reponse-revoquee.verification.json"),
			typeof compagnon === "string" ? compagnon : JSON.stringify(compagnon),
		);
	return root;
}

describe("the verification companion of a story", () => {
	it("P2 sans oracle reste nommée et une référence inconnue est refusée", () => {
		const sansOracle = lireStory(
			"e01s05",
			storyAvec({ version: 1, story: "e01s05", promesses: [promesse("P1", P1, [ORACLE_P1]), promesse("P2", P2, [])] }),
		).verification;
		assert.deepEqual(
			sansOracle?.promesses.map((p) => [p.id, p.scenario, p.prete]),
			[
				["P1", P1, true],
				["P2", P2, false],
			],
		);
		assert.match(sansOracle?.promesses[1]?.manques.join("\n") ?? "", /sans oracle/);
		assert.equal(sansOracle?.prete, false);

		const inconnue = lireStory(
			"e01s05",
			storyAvec({
				version: 1,
				story: "e01s05",
				promesses: [
					promesse("P1", P1, [{ ...ORACLE_P1, tache: 7 }], { dependances: ["P1"] }),
					promesse("P2", P2, [ORACLE_P1]),
				],
			}),
		).verification;
		const erreurs = inconnue?.erreurs.join("\n") ?? "";
		assert.match(erreurs, /promesses\[0\]\.oracles\[0\]\.tache: .*7.*attendu.*1, 2/);
		assert.match(erreurs, /promesses\[0\]\.dependances\[0\]: .*P1.*attendu/);
		assert.equal(inconnue?.prete, false);
	});

	it("refuses a dependency that is not a promise id in text, even when it reads as one once coerced", () => {
		const d = lireStory(
			"e01s05",
			storyAvec({
				version: 1,
				story: "e01s05",
				promesses: [
					promesse("1", P1, [ORACLE_P1], { dependances: [1] }),
					promesse("P2", P2, [ORACLE_P1], { dependances: [["1"]] }),
				],
			}),
		).verification;
		const erreurs = d?.erreurs.join("\n") ?? "";
		assert.match(erreurs, /promesses\[0\]\.dependances\[0\]: 1 .*attendu/);
		assert.match(erreurs, /promesses\[1\]\.dependances\[0\]: \["1"\] .*attendu/);
		assert.equal(d?.prete, false);
	});

	it("refuses an unknown version, a scenario the story does not hold, a duplicate id and an unknown category", () => {
		const d = lireStory(
			"e01s05",
			storyAvec({
				version: 2,
				story: "e01s06",
				promesses: [
					promesse("P1", P1, [ORACLE_P1]),
					promesse("P1", "Un scénario que la story n'a pas", [ORACLE_P1], { categorie: "faible-risque" }),
				],
			}),
		).verification;
		const erreurs = d?.erreurs.join("\n") ?? "";
		assert.match(erreurs, /version: .*2.*attendu.*1/);
		assert.match(erreurs, /story: .*e01s06.*attendu.*e01s05/);
		assert.match(erreurs, /promesses\[1\]\.id: .*P1.*attendu/);
		assert.match(erreurs, /promesses\[1\]\.scenario: .*Un scénario que la story n'a pas.*attendu/);
		assert.match(erreurs, /promesses\[1\]\.categorie: .*faible-risque.*attendu.*nouveau-comportement/);
		assert.equal(d?.prete, false);
	});

	it("names a scenario of the story that the companion does not declare, and an unreadable companion", () => {
		const absente = lireStory(
			"e01s05",
			storyAvec({ version: 1, story: "e01s05", promesses: [promesse("P1", P1, [ORACLE_P1])] }),
		).verification;
		assert.deepEqual(
			absente?.promesses.map((p) => [p.scenario, p.prete]),
			[
				[P1, true],
				[P2, false],
			],
		);
		assert.match(absente?.promesses[1]?.manques.join("\n") ?? "", /sans oracle/);
		const illisible = lireStory("e01s05", storyAvec("{ pas du json")).verification;
		assert.match(illisible?.erreurs.join("\n") ?? "", /JSON/);
		assert.equal(illisible?.prete, false);
	});

	it("keeps reading a story without a companion, and says it has none", () => {
		assert.equal(lireStory("e01s05", storyAvec()).verification, null);
	});

	it("accounts for a diagnostic by its companion's path, each promise not ready and at most three invalid references", () => {
		assert.equal(resumeDeVerification(null, "/depot"), "sans compagnon de vérification");
		const prete = storyAvec({
			version: 1,
			story: "e01s05",
			promesses: [promesse("P1", P1, [ORACLE_P1]), promesse("P2", P2, [ORACLE_P1])],
		});
		assert.equal(
			resumeDeVerification(lireStory("e01s05", prete).verification, prete),
			"compagnon specs/stories/e01/e01s05-une-reponse-revoquee.verification.json : prête",
		);
		const fautive = storyAvec({
			version: 2,
			story: "e01s06",
			promesses: [
				promesse("P1", P1, [ORACLE_P1], { categorie: "faible-risque", observation: "" }),
				promesse("P2", P2, [ORACLE_P1], { dependances: ["P9"] }),
			],
		});
		assert.deepEqual(resumeDeVerification(lireStory("e01s05", fautive).verification, fautive).split("\n"), [
			"compagnon specs/stories/e01/e01s05-une-reponse-revoquee.verification.json : incomplète",
			"référence invalide version: 2 inconnue ; attendu : 1",
			'référence invalide story: "e01s06" ; attendu : e01s05, la story qu\'il accompagne',
			'référence invalide promesses[0].categorie: "faible-risque" inconnue ; attendu : nouveau-comportement, comportement-conserve, structure, jugement',
			"… et 2 autre(s) référence(s) invalide(s)",
		]);
	});
});
