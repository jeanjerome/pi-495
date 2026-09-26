# e01s02 — une spécification qui ne progresse plus arrête le changement avec un recours

Conduite le 2026-09-26 sur `specification-arretee-avant-g0`, depuis `main` à `38bf5a3` (Preflight
verte sous Node 26.9.0, 474 tests).

## Commandes des tâches

Relevées à `8852a2b`, sous Node 26.9.0, le 2026-09-26.

```
$ node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   # tâche 1
ℹ tests 40   ℹ pass 40   ℹ fail 0
$ npm run build && npm run check
ℹ tests 474   ℹ pass 474   ℹ fail 0
exit=0
```

474 tests avant et après : aucun n'est ajouté ni retiré, sept changent d'attendu. Aux cinq que le
plan nommait (6b, 6c, 6g, 6h, 6j) et au report d'une déclaration dont l'exigence disparaît
(`harness.test.ts`) s'ajoute un septième que le plan ne nommait pas : dans `harness.test.ts`, la
spécification qui ignore toujours une réponse enregistrée (RM-011) s'arrêtait elle aussi à G1.
6g ne conduit plus l'adoption du mandat : le mandat n'est plus proposé, et le test vérifie
qu'aucune adoption n'est demandée (scénario 6d de la story).

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| Un rapport qui perd une réponse et que la borne interdit de rouvrir arrête le changement en clarification : stagnation levable, détail qui nomme la réponse, `resume` et `cancel`, ni mandat, ni G0, ni G1, ni adoption (6b, 6c, 6h, 6j, et les deux tests de `harness.test.ts`) | `103ce48` — contrôle négatif : phase `specifying` au lieu de `clarifying`, le mandat a été proposé et G1 a refusé la réponse | `8852a2b` |
| Aucune adoption n'est demandée pour le mandat d'un rapport qui perd une réponse (6g) | `103ce48` — `decision_required` au lieu de `blocked` : l'adoption du mandat (IH-02) est demandée | `8852a2b` |

L'isolation est contrôlée à la main, par arbre de travail détaché. Le script
`verify-tdd-red-commit.sh` juge le dépôt du paquet bigpowers, pas celui-ci.

```
103ce48 (test seul)      node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=1  (7 échecs sur 40)
8852a2b (implémentation) node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=0  (40 sur 40)
```

## Ce qui a changé

- `specificationStanding` (`src/domain/change/state.ts`) sépare le rapport établi, qui porte toutes
  les réponses (`settled`), du rapport qui en perd une sans pouvoir être rouvert (`stalled`). Avant,
  les deux étaient `settled`.
- `clarify` (`src/application/phases/clarify.ts`) reprend un rapport `stalled` comme un rapport
  établi, pose d'abord toute question matérielle encore sans réponse, puis arrête le changement
  (`change.block`, motif `stagnation`, levable) au lieu de proposer le mandat.

## Revue de sécurité de la tâche 1

Aucun constat nouveau sur `src/application/phases/clarify.ts` et `src/domain/change/state.ts`.
L'arrêt n'émet que `change.block` : il ne lie ni ne délie aucune réponse. Un rapport `stalled`
n'atteint jamais la construction du mandat, donc ni G0 ni l'adoption de G1. La levée reste celle
d'un arrêt levable : `change.unblock`, que seul `resume` émet.
