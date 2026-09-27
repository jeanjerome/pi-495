# Auto-revue — e01s03, seul l'humain clôt une question matérielle

| | |
|---|---|
| Périmètre | `git diff main...HEAD` (`8e7d931..235ed35`), puis les corrections `4441b71` et `7d70995` ; code de production : `src/domain/change/{state,decide,apply,commands,events}.ts`, `src/application/{harness,context,decisions}.ts`, `src/application/phases/{clarify,specify}.ts`, `src/contracts/v1/protocol.ts`, `src/extension/command.ts` |
| Conduite le | 2026-09-27 |
| Branche | `seul-l-humain-clot-une-question` |
| Mode | complet |
| Preflight au moment de la revue | verte à `235ed35` avant toute correction, puis à `4441b71` et à `7d70995` sous Node 26.9.0 — `npm run build && npm run check`, sortie 0, 513 tests ; à `7d70995` aussi sous Node 24.21.0, plancher déclaré, 15:42:14Z à 15:44:52Z, sortie 0, 513 tests, `dist/` inchangé |

Classement par nombre de commits sur 90 jours, fichiers de code : `src/application/harness.ts` (43),
`test/v2/harness.test.ts` (33), `src/domain/change/state.ts` (27), `test/helpers/harness-fixture.ts`
(18), `src/domain/change/decide.ts` (18), `test/v2/specification-reopening.test.ts` (17),
`src/application/context.ts` (17), puis `src/application/phases/clarify.ts` (13). Les fichiers de
production ont été lus en premier, dans cet ordre.

## Ce que cette revue a corrigé avant son rapport

Aucune de ces corrections ne change un comportement. Les 513 tests passent avant et après.

- **Un ensemble que plus rien ne lit** (`4441b71`). `specify` calculait l'ensemble des questions
  closes et le passait à `declarationsOfReport`. Depuis `e662755`, `answersOf` recopie une question
  close sans lire la déclaration du rapport, et `declared` n'a pas d'autre lecteur dans `specify`.
  L'ensemble ne changeait donc que des entrées que personne ne lisait. Il est retiré, et
  `src/application/phases/specify.ts` est de nouveau identique à `main`. `specificationStanding`
  garde le paramètre, qu'elle lit pour la réouverture et la mesure de progrès.
- **Un mandat construit en ligne, avec une expression dupliquée** (`4441b71`). La liste des
  questions du mandat occupait 25 lignes de `clarify`, et `closed_by: s.closed_by?.actor_id ?? null`
  y figurait deux fois. Elle devient `mandateQuestions`. `clarify` passe de 142 à 116 lignes (113 sur
  `main`). Les clés sont écrites dans le même ordre, avec les mêmes valeurs, donc un mandat garde les
  mêmes octets et la même empreinte.
- **Un acteur passé à côté de sa provenance** (`4441b71`). `Harness.closeQuestion` recevait
  `actor` et `origin` séparément, et son seul appelant passait `origin.actor`. Le second paramètre
  permettait d'inscrire la clôture sous un autre acteur que celui dont la provenance est vérifiée.
  `closeQuestion` prend désormais l'acteur de l'origine, comme `answerDecision`.
- **Un test de 6k qui passait sans la fonction** (`7d70995`). « Refuser la confirmation n'inscrit
  rien » passait déjà à `767dadb`, où `/495 close` n'existe pas. Il ne vérifiait pas que la
  confirmation avait été demandée. Il compte maintenant les confirmations et en exige une. Rejoué
  sur `767dadb`, il échoue.
- **Une spec qui contredit le code** (commit de ce rapport). Le §8 de la story disait « aucun schéma
  changé ». Or le mandat gagne `closed_by`, que l'étape 4 exige et que son schéma fermé
  (`additionalProperties: false`) n'admettait pas. Le §8 le dit désormais. `lint:story-format` passe
  sur les 18 stories.
- **Des rouges jamais observés** (commit de ce rapport). Au develop-tdd, les cycles des tâches 1 à 4
  n'avaient été rejoués que verts, à la tête de la branche. Chaque commit de test seul est rejoué
  ici dans un arbre détaché, et chacun échoue sur une assertion du comportement attendu. Relevé :
  `specs/verifications/e01s03-cycle-rouge-vert.md`, qu'e01s01 et e01s02 avaient déjà et qui manquait
  à e01s03.

## Chaîne d'approvisionnement et sécurité

- ✓ Aucune dépendance ajoutée. `package.json` et `package-lock.json` sont inchangés.
- ✓ Aucun secret dans le diff. Aucune occurrence de `sk-`, `ghp_`, `AKIA` ni de clé privée.
- ✓ OWASP. La seule entrée nouvelle est l'identifiant tapé après `/495 close`. Le noyau le compare
  à l'égalité exacte aux questions du changement. Il n'atteint ni un shell ni une requête SQL
  construite : le registre SQLite ne passe ses valeurs que par des requêtes préparées. Il n'est
  renvoyé qu'à la session qui l'a tapé.
- ✓ Contrôle d'accès (M3). IH-01 et `/495 close` passent par une seule vérification,
  `humanProvenanceIssue`, tirée de la réponse à une décision. Elle exige un acteur humain, une
  origine humaine qualifiée et une authentification autre que `none`, et refuse une commande portée
  par une sortie de modèle ou un appel d'outil. Un test fixe que l'outil `harness495` n'offre aucune
  clôture. `/495 close` est refusée pendant une intervention (M6).
- ✓ Aucun constat HIGH. La section e01s03 de `specs/security/REVIEW.md`, relue à `63e05b3`, ne
  retient aucun constat de confiance ≥ 8. Les corrections de cette revue ne touchent aucun chemin de
  provenance : `closeQuestion` inscrit désormais l'acteur dont la provenance est vérifiée. Aucune
  exception n'est nécessaire, et `specs/security/EXCEPTIONS.md` n'existe pas.

## Provenance

- ✓ `e01s03-tasks.yaml` porte `type: feat` et `context: domain`.
- ✓ Les commits de chaque tâche sont cités dans `e01s03-cycle-rouge-vert.md`, rouge et vert. Avant
  cette revue, seul `specs/state.yaml` citait ceux des tâches 1 à 4.

## Loi de Déméter

- ✓ Aucune chaîne à travers des objets étrangers. `origin.actor.actor_type` et
  `s.closed_by?.actor_id` lisent des valeurs de contrat, sans traverser de comportement.
  `rt.harness.closeQuestion(session.binding.change_id, …)` est la forme de toutes les
  sous-commandes de `command.ts`.

## Conformité à CONVENTIONS.md

- ✓ Les relevés vont dans `specs/`. Aucun `gh issue create`, aucun appel direct à l'API GitHub.
- ✓ La clôture naît dans `domain/` (commande, événement, `apply`). L'application la conduit, et
  seule `extension/` touche Pi. `lint:layers` et `lint:architecture` sont verts.
- ✓ Aucun identifiant `CMP-*` nouveau, comme le §8 de la story l'annonce.

## Périmètre

- ✓ Le code de production touché est celui que le §20 de la story nomme, plus le schéma du mandat
  (`src/contracts/v1/protocol.ts`, `contracts/v1/mandate.json`), qu'exige l'étape 4.
- ✓ Aucune fonction spéculative. La clôture ne crée ni statut, ni motif d'arrêt, ni cycle de vie :
  elle lève l'arrêt existant par `changeUnblock`.
- ✓ Aucun défaut de gate découvert : Preflight était verte avant la première correction.

## Règle du scout

- ✓ Aucun code mort après correction. Biome : 0 avertissement sur `src/`, `test/` et `scripts/`
  (compté, pas seulement lu au code de sortie). Aucun code commenté.
- ✓ La réponse à une décision perd sa vérification de provenance écrite en ligne au profit de
  `humanProvenanceIssue`, sa seule copie.

## Types et sûreté

- ✓ Aucun `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` ni `biome-ignore` ajouté.
- ⚠ `as unknown as ExtensionAPI` et ses pareils, 15 fois dans `test/v3/question-closure.test.ts`,
  font passer les faux de Pi pour ses types. `test/v3/model-select.test.ts` le fait déjà 18 fois.
  Rien de tel dans `src/`.
- ⚠ `q.answer as string` dans la branche close de `answersOf` suit un filtre sur `q.answer !== null`,
  comme dans la branche qui existait déjà.

## Couverture des tests

- ✓ Chaque fonction nouvelle a son test, par l'interface publique : `questionClose` et
  `humanProvenanceIssue` par les commandes du noyau (`change-rules.test.ts`), `closeQuestion` et
  `mandateQuestions` par le harnais (`specification-reopening.test.ts`), la
  sous-commande par une vraie session d'extension (`question-closure.test.ts`).
- ✓ Les deux écarts de verify-work ont chacun leur test de régression, rouge seul à `558cdd9` et à
  `b88c567`.
- ✓ F.I.R.S.T. Chaque test crée son dépôt et son dossier temporaires, et `afterEach` les supprime.
  Les faux de Pi sont des classes (`FakePi`, `FakeContext`).
- ✓ `question-closure.test.ts` restaure les variables `HARNESS495_*` : le `describe` qui les écrit
  porte son propre `beforeEach`/`afterEach`, qui les sauve puis les rétablit (ou les efface si elles
  étaient absentes) à chaque test.

## SOLID et heuristiques

- ✓ `questionClose` vérifie puis émet ; `apply` inscrit ; `clarify` et `specify` lisent l'état.
  `mandateQuestions` ne fait que la liste des questions du mandat.
- ✓ La commande nouvelle suit le patron du noyau : un membre de l'union, un cas du `switch`, dont
  le `never` garantit l'exhaustivité.
- Odeurs de Fowler : *Duplicated Code* (l'expression `closed_by`) et *Data Clumps* (`actor` avec
  `origin`) sont corrigées. *Long Function* reste, voir le style.

## Style

- ⚠ `clarify` fait 116 lignes, 113 sur `main`. La branche ajoute les 3 lignes du détail de l'arrêt
  qui nomme la proposition.
- ⚠ `src/extension/command.ts` passe de 291 à 331 lignes et franchit les 300. Le fichier est une
  seule fonction d'enregistrement, dont le `switch` tient quinze sous-commandes, et `close` y
  reprend la forme de `cancel`, comme le §7 de la story le demande. Le couper réorganiserait la
  surface des commandes, ce que ni la story ni un défaut ne demande. Le point est laissé à la
  relecture.
- ⚠ `src/domain/change/decide.ts` (1 635), `src/application/harness.ts` (964) et
  `src/domain/change/state.ts` (488) dépassaient déjà 300 lignes sur `main`.
- ✓ `mandateQuestions`, `humanProvenanceIssue` et `questionClose` sont uniques dans le dépôt.
- ✓ Les commentaires ajoutés disent pourquoi : une proposition « non observable » n'est pas une
  perte accidentelle, et une question close n'est pas oubliée.

## Rationalisations repérées

- « L'ensemble des questions closes dans `specify` ne coûte rien » : il décrivait un effet qui
  n'existe plus depuis `e662755`, et le prochain lecteur l'aurait cru nécessaire. Retiré.
- « Le test de 6k tient avec son voisin, qui ferme la question quand on confirme » : c'est vrai de
  la paire, mais le test annonçait une confirmation refusée sans vérifier qu'elle avait été
  demandée. Renforcé.
- « Les rouges des tâches 1 à 4 sont établis par le rejeu vert » : un rejeu vert ne dit rien du
  rouge. Rejoués.
- `command.ts` au-delà de 300 lignes est laissé, avec la raison donnée au style. C'est un choix,
  pas un oubli.
- Les campagnes réelles de verify-work ont tourné sur `63e05b3`, pas sur `7d70995`. Les deux
  commits de cette revue ne changent aucun comportement, et le mandat garde ses octets. Aucune
  campagne n'est donc rejouée.

## Verdict

PASS après correction. Suite : `request-review`.
