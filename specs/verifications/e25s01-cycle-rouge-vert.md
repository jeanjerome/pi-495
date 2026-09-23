# e25s01 — le fournisseur du modèle choisi est admis sans configuration

Conduite le 2026-09-23 sur `le-modele-choisi-est-admis`, depuis `main` à `1e7fd3e` (Preflight vert,
393 tests).

## Commandes des tâches

```
$ node --test test/v1/model-admitted.test.ts                 # tâches 1 et 3
ℹ tests 6   ℹ pass 6   ℹ fail 0
$ node --test test/v2/model-admitted.test.ts                 # tâche 2
ℹ tests 4   ℹ pass 4   ℹ fail 0
$ ! grep -q 'policy.egress' README.md && node --test test/v1/model-admitted.test.ts
exit=0
$ npm run build && npm run check                             # tâche 4
ℹ tests 382   ℹ pass 382   ℹ fail 0
exit=0
```

393 tests avant, 382 après : 21 tests de la liste et de son refus sont retirés, 10 sont ajoutés. Les
tests du secret sentinelle de `test/v1/egress.test.ts` restent inchangés et passent. Ils portent sur
l'environnement remis au worker et sur le texte composé pour le modèle.

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| La politique ne porte aucune liste ; une clé `policy.egress`, quelle que soit sa forme, est ignorée et annoncée sans reproduire son contenu ; un fichier illisible ne refuse plus rien | `8bf454b` — 5 échecs sur 6 | `e6492c5` |
| Un changement atteint sa première intervention avec un fournisseur que rien ne déclare, y compris sous une liste héritée qui ne nomme que `omlx` ; le journal inscrit ce fournisseur ; `run()` joint le worker | `11da7b1` — 3 échecs sur 4, motif `policy_denied` | `e6492c5` |
| Un modèle sans fournisseur reste un refus de capacité | **vert à l'arrivée** — garde de non-régression | — |

Les deux comportements rouges ont un seul commit vert. Retirer le champ `egress` de la politique
retire du même coup la règle que le superviseur appliquait. Aucun état intermédiaire ne compile avec
l'un sans l'autre.

Le test de la tâche 2 lisait l'événement du journal sous le nom `intervention.start` : c'est le nom
de la commande, alors que le journal inscrit `intervention.started`, avec le modèle sous `event`. Le
rouge de `11da7b1` n'en dépendait pas : sa première assertion tombait sur `policy_denied`. Le
lecteur est corrigé dans `e6492c5`.

L'isolation du rouge est contrôlée à la main, par arbre de travail détaché. Le script
`verify-tdd-red-commit.sh` juge le dépôt de Homebrew, pas celui-ci.

```
8bf454b (test seul)      node --test test/v1/model-admitted.test.ts  exit=1
11da7b1 (test seul)      node --test test/v2/model-admitted.test.ts  exit=1
e6492c5 (implémentation) node --test test/v1/model-admitted.test.ts  exit=0
e6492c5 (implémentation) node --test test/v2/model-admitted.test.ts  exit=0
```

## Revue de sécurité — tâches 1 et 2, `security: high`

Aucun constat nouveau sur les chemins touchés.

- `src/extension/config.ts` — le diagnostic est une chaîne constante. Il ne reproduit ni la clé
  ignorée ni son contenu, et un test le vérifie avec un nom de fournisseur qu'aucun défaut ne porte.
  La clé est retirée avant l'étalement de `policy`, donc elle ne reste pas dans la politique active.
  Les autres réglages sont lus comme avant. Un fichier illisible donne la configuration par défaut,
  comme avant, sans la liste vide qui refusait tout.
- `src/domain/policy.ts` — la situation n'y garde aucun type. `EgressLocation`, qui n'avait plus
  de lecteur, est retiré ; e25s03 introduit le sien quand il la lit de l'adresse du modèle.
- `src/application/intervention.ts` — `requireCapable` juge encore le bac à sable et les capacités
  du modèle. `harness.ts` l'appelle avant d'inscrire `intervention.start`. Rien n'est engagé pour
  une intervention refusée.
- Environnement du worker et constructeur de contexte : non touchés. Les tests du secret sentinelle
  passent.

**Contrôle retiré, comme la story le prévoit :** le refus d'une destination non déclarée. Un modèle
distant choisi dans Pi reçoit des extraits sans déclaration préalable. L'annonce de ce cas
appartient à e25s03, et D-61 (e25s04) consigne le retrait.

## Ce qui n'est pas établi ici

Seules des exécutions scriptées sont conduites. Le premier `/495 start` réel sans fichier de
configuration, avec un fournisseur autre que `omlx`, appartient à la recette de e25s04.
