# Recette — le contrôleur stable intègre un changement réel de pi-495

Story `e40s05`, branche `e40s05`, menée le 12 octobre 2026 depuis l'arbre de la branche à `a3ffcb2f`. Chaque campagne
est `node cycle/src/dogfood.ts --controleur <révision> --candidat HEAD --objectif "<la demande>"`, sous
`anthropic/claude-sonnet-5-5`, réflexion `high`, Pi 1.0.4, avec la demande des campagnes du 11 et du 12 octobre :

> When /495 start receives a one-line request longer than 80 characters, the title of the change is cut with
> slice(0, 80) in src/application/harness.ts, in the middle of a word and with no mark of the cut. Cut it instead at the
> last word boundary before 80 characters and end it with an ellipsis when it was shortened; a request of 80 characters
> or fewer keeps its title unchanged.

Les campagnes vivent hors du dépôt, sous `~/.495/campagnes/` ; leurs relevés sont copiés ici tels quels.

## Quatre campagnes sous le contrôleur de la branche, la quatrième intègre

| Campagne | Durée | Arrêt | Cause |
|----------|-------|-------|-------|
| `dogfood-20261012T155057` | 8 min 22 s | avant G2, IH-04 sans réponse | `BUG-2026-10-12T171500` : la seconde préparation caractérise `r-short-unchanged`, que la requête dit tenue par la référence, et la référence la contredit (« its characterization contradicts it there ») ; 495 demande IH-04, le propriétaire simulé répond « later ». |
| `dogfood-20261012T155932` | 23 min 42 s | G5 FAIL, budget de trois tentatives épuisé | `BUG-2026-10-12T171000` : le test préparé `test/v0-pure/request-title-architecture.test.ts` lit le texte de son module et refuse toute infrastructure ; sous l'instrumentation de Stryker, le texte porte `globalThis`, `process.env` et `new Function`, et le cas « r-architecture has the module of the title in the domain layer » échoue au passage initial, sur chacun des trois candidats. Le constat de la mutation ne nomme pas ce cas. |
| `dogfood-20261012T162346` | 14 min 59 s | avant G2, IH-04 sans réponse | `BUG-2026-10-12T171500`, par un autre déclencheur que celui que l'entrée décrit : la première préparation, qualifiée, n'observe aucun cas propre de `r-boundary-mutation`, une exigence que l'agent écrit sur la mutation elle-même ; la seconde range ses tests sous `test/v2-kernel/`, que la borne ne lance pas. 495 demande IH-04 sur cinq exigences, le propriétaire simulé répond « later ». |
| `dogfood-20261012T163907` | 46 min 28 s | **intégrée**, `status completed` | — |

Quatre campagnes, trois arrêtées par un piège inscrit au registre, aucune par une autre cause. Le relevé de la quatrième
(`releve-dogfood-20261012T163907.json`) dit G0 à G6 PASS, les onze contrôles PASS sur le candidat, l'arbre intégré
(`commit 6304baf2e1ae39c5f014f235f9d181dd870866e3`, `tree 97c38f66f8a9a27b42367d5a71ae363d5e718d96`), la construction du
contrôleur `sha256:78a2c714…` relue identique à la fin (`inchange: true`), « non promu », et aucun défaut. Le commit
intégré dans la copie touche `src/application/harness.ts`, ajoute `src/application/request-title.ts` et le test
`test/v0-pure/start-title.test.ts`.

Ce qui a été relu dans le dossier de la campagne qui intègre (`state.sqlite` et le magasin d'objets, en lecture seule) :

- la mutation est qualifiée à G2 sur pi-495, en TypeScript 7.0.2 : témoin positif PASS (4 mutants tués, 109 s), témoin
  négatif FAIL (2 mutants survivants, 152 s), lanceur cassé INDETERMINATE ; aucune sortie ne nomme
  `parseConfigFileTextToJson` ;
- sa commande figée porte la borne de la configuration du contrôleur, citée pour le shell : `'<node>' '--test'
  '--test-reporter=tap' 'test/*.test.js' 'test/*.test.mjs' 'test/*.test.ts' 'test/v0-pure/**/*.test.ts'
  'test/cycle/**/*.test.ts'` ;
- sur le premier candidat, la mutation va au bout et rend FAIL : 31 mutants, 3 survivants, en 722 s (12 min) pour le
  passage de confirmation et 721 s pour celui du candidat ; sur le second, PASS : 22 mutants tués en 474 s (8 min). Le
  délai du contrôle, 30 minutes, n'est pas atteint ;
- `lint-code` passe sur chaque candidat : aucun dossier `.stryker-tmp` ne reste dans les copies de la campagne.

Dans la deuxième campagne déjà, G2, G3 et G4 passent et `lint-code` passe sur les trois candidats, où le 12 octobre
(`dogfood-20261012T140626`) il lisait la copie de travail qu'une mutation en échec avait laissée.

## Témoin négatif : le contrôleur d'avant la story

`dogfood-20261012T154159`, même demande, `--controleur main` (`3465dc1e`), candidat `a3ffcb2f`, 8 min 44 s, code de
sortie 1. Relevé (`releve-temoin-negatif-dogfood-20261012T154159.json`) : G0 PASS, G1 PASS, « G2 is not reached: the
protocol was not frozen », `arbre_integre: null`, `inchange: true`. L'arrêt vient avant la mutation : la configuration
du contrôleur de `main` ne donne pas `test-output/` à `unit`, et les cas de la seconde préparation échouent sans assertion
sur `EPERM: operation not permitted, mkdir '<copie>/test-output'` (38 occurrences dans sa sortie) ; aucune exigence n'est
prouvée, 495 demande IH-04, le propriétaire simulé répond « later ». La mutation n'est donc pas atteinte, et le plantage
sur `ts.parseConfigFileTextToJson` de `dogfood-20261011T090513` n'est pas rejoué ici ; le test
`test/v4-platform/node-mutation.test.ts` le tient sur la commande d'avant la story.

## Recette de la branche relue, à `01e6b9fa`

Vrai Pi 1.0.4 en RPC (`pi -ne --mode rpc --no-session -e <construction>/dist/extension/index.js`), agent scripté
`e38s09-agent-ok.json` déclaré comme tel, sur des cibles `greet` où npm a installé Stryker 10.0.0 (et TypeScript 7.0.2)
aux versions exactes, sans script d'installation. Chaque campagne est menée sous la construction de la branche et sous
celle de `main` (`3465dc1e`), dossiers et cibles sous `~/.495-campagnes/e40s05-*`, banc dans
`~/.495-campagnes/scripts/e40s05-*`. Un guetteur relève toutes les 0,1 s ce que tient `.stryker-tmp` dans chaque copie.

| Promesse | Branche | `main` |
|----------|---------|--------|
| TypeScript 7 (`ts7`) | G5 PASS, mutation qualifiée, aucune sortie ne nomme `parseConfigFileTextToJson` | G2 FAIL, témoin positif FAIL sur `ts.parseConfigFileTextToJson is not a function` |
| Passage initial en échec (`echec`) | témoin positif FAIL, `.stryker-tmp` vide puis absent dans chaque copie | témoin positif FAIL, `sandbox-*` reste sous `.stryker-tmp` jusqu'à la suppression de la copie |
| Borne `test/*.test.js` + `test/*.test.mjs` (`borne`) | G5 PASS, la sortie de Stryker ne nomme pas `test/nested/sandbox.test.js` | G2 FAIL, la sortie nomme `test/nested/sandbox.test.js` |
| Borne `test/*.test.js` + `test/pure/**/*.test.js` (`pure`) | **G2 FAIL** : les lignes de `src/witness495/covered.mjs` survivent, 0 mutant tué sur 4 | G5 PASS |
| Configuration Stryker pointée (`dotconf`) | G4 FAIL, `.stryker.conf.json` chemin protégé altéré | G5 PASS |
| Configuration en autre casse (`casse`) | G4 FAIL, `Stryker.Conf.json` chemin protégé altéré | — |
| Configuration de la cible sous une borne (`conf`) | G5 PASS | — |
| Lien `.stryker-tmp` posé dans chaque copie (`lienpose`) | G2 FAIL, « writable path .stryker-tmp is refused: .stryker-tmp is a link in the copy » | — |

Les campagnes de référence `npm` et `maven` sont PASS à `01e6b9fa`.

Un lien `.stryker-tmp` commité dans la cible (`lien`) ne fait pas refuser le contrôle, et ce n'est pas un écart :
`.stryker-tmp/` est une sortie de la technologie Node, que la copie ne reprend pas. Le guetteur montre la copie sans
`.stryker-tmp` à sa création, puis le dossier que Stryker y crée et retire ; le dossier visé par le lien reste vide.

**Écart, promesse 4.** Sous une borne qui ne nomme pas les fichiers `.mjs` à la racine de `test/`, la commande bornée de
la mutation ne lance pas les tests de ses témoins, `test/495-covered-witness.test.mjs` et
`test/495-unasserted-witness.test.mjs` : aucun mutant du témoin positif n'est tué et G2 refuse le protocole, là où
`main`, qui ne bornait pas la mutation, le qualifiait. Le test de la tâche 4 ne le voyait pas, sa doublure de Stryker
tuant les mutants sans lancer de test.

## Correction de l'écart, à `7b613d5b`

Sous une borne, la commande de la mutation nomme, après la borne, les fichiers de test de ses deux témoins ; une
campagne de candidat ne les a pas, et `node --test` passe sur un fichier nommé qu'il ne trouve pas dès qu'un autre motif
trouve un test. Rouge `71fe5107` (« sous une borne qui ne nomme que test/*.test.js, la mutation lance quand même les
tests .mjs de ses témoins », témoin positif FAIL sur les lignes de `covered.mjs`), vert `7b613d5b`. Preflight verte à
`7b613d5b` (1785 tests, 0 échec, 10 sautés).

- `pure-tete2`, même cible, même borne, même agent, sous la construction de `7b613d5b` : G0 à G5 PASS, mutation qualifiée
  (témoin positif PASS, 4 mutants tués ; témoin négatif FAIL, 2 survivants), candidat PASS, 4 mutants tués. Le contrôle
  négatif est `pure-tete` ci-dessus, à `01e6b9fa`.
- Campagnes de référence `npm` et `maven` PASS à `7b613d5b`, « no defect of the harness ».

Le cycle a été arrêté pendant cette recette, sur décision du propriétaire : son journal s'arrête à la recette. La
correction a été faite à la main, sans tour de relecture sur son diff, et le propriétaire a accepté la story sur ce
compte rendu. Une campagne de dogfooding lancée par la recette (`dogfood-20261012T183747`) a été interrompue sans
verdict ; la configuration du dogfooding couvre déjà les témoins `.mjs`, et la correction n'ajoute à sa commande que
les deux noms de fichiers que sa borne trouvait déjà.
