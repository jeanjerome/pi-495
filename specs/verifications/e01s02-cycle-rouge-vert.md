# e01s02 — une spécification qui ne progresse plus arrête le changement avec un recours

Conduite le 2026-09-26 sur `specification-arretee-avant-g0`, depuis `main` à `38bf5a3` (Preflight
verte sous Node 26.9.0, 474 tests).

## Commandes des tâches

Tâche 1 relevée à `8852a2b`, tâche 2 à `6180916`, sous Node 26.9.0, le 2026-09-26.

```
$ node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   # tâche 1, à 8852a2b
ℹ tests 40   ℹ pass 40   ℹ fail 0
$ npm run build && npm run check                                                # à 8852a2b
ℹ tests 474   ℹ pass 474   ℹ fail 0
exit=0
$ node --test test/v2/specification-reopening.test.ts                           # tâche 2, à 6180916
ℹ tests 12   ℹ pass 12   ℹ fail 0
$ npm run build && npm run check                                                # à 6180916
ℹ tests 478   ℹ pass 478   ℹ fail 0
exit=0
```

Tâche 1 : 474 tests avant et après, aucun n'est ajouté ni retiré, sept changent d'attendu. Aux
cinq que le plan nommait (6b, 6c, 6g, 6h, 6j) et au report d'une déclaration dont l'exigence
disparaît (`harness.test.ts`) s'ajoute un septième que le plan ne nommait pas : dans
`harness.test.ts`, la spécification qui ignore toujours une réponse enregistrée (RM-011)
s'arrêtait elle aussi à G1.
6g ne conduit plus l'adoption du mandat : le mandat n'est plus proposé, et le test vérifie
qu'aucune adoption n'est demandée (scénario 6d de la story).

Tâche 2 : 474 tests avant, 478 après. Trois tests sont ajoutés à
`test/v2/specification-reopening.test.ts` (la reprise, la reprise sans progrès, l'abandon) et un à
`test/v0/change-rules.test.ts` (qui peut lever un arrêt). Aucun n'est retiré.

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| Un rapport qui perd une réponse et que la borne interdit de rouvrir arrête le changement en clarification : stagnation levable, détail qui nomme la réponse, `resume` et `cancel`, ni mandat, ni G0, ni G1, ni adoption (6b, 6c, 6h, 6j, et les deux tests de `harness.test.ts`) | `103ce48` — contrôle négatif : phase `specifying` au lieu de `clarifying`, le mandat a été proposé et G1 a refusé la réponse | `8852a2b` |
| Aucune adoption n'est demandée pour le mandat d'un rapport qui perd une réponse (6g) | `103ce48` — `decision_required` au lieu de `blocked` : l'adoption du mandat (IH-02) est demandée | `8852a2b` |
| La reprise fait réécrire la spécification, la demande dit la réponse à déclarer, et un rapport qui la déclare mène le changement au-delà de G1 | `1fc82ff` — `blocked` au lieu de `closed` : la reprise lève l'arrêt, et la borne, qui ne voit pas la reprise, arrête de nouveau le changement sans intervention | `4f17bd3` |
| Une reprise qui obtient un rapport sans progrès arrête de nouveau le changement après une seule intervention, à chaque reprise (6a) | `1fc82ff` — 4 interventions `specify` au lieu de 5 : aucune après la reprise | `4f17bd3` |
| L'abandon d'un changement arrêté le clôt comme abandonné sans intervention (6b) | vert dès `1fc82ff` : le comportement tenait déjà, le test le fixe | `4f17bd3` |
| Un agent, une sortie de modèle ou un appel d'outil ne lève pas un arrêt qu'une reprise lève (`change-rules.test.ts`) | vert dès `0afe199`, sur le code de `4f17bd3` : le comportement tenait déjà, le test le fixe ; il échoue quand `requireKernelAuthority` est retiré de `changeUnblock` | `0afe199` |

L'isolation est contrôlée à la main, par arbre de travail détaché. Le script
`verify-tdd-red-commit.sh` juge le dépôt du paquet bigpowers, pas celui-ci.

```
103ce48 (test seul)      node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=1  (7 échecs sur 40)
8852a2b (implémentation) node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=0  (40 sur 40)
1fc82ff (test seul)      node --test test/v2/specification-reopening.test.ts   exit=1  (2 échecs sur 12)
4f17bd3 (implémentation) node --test test/v2/specification-reopening.test.ts   exit=0  (12 sur 12)
0afe199 (mutation)       node --test --test-name-pattern="cannot lift a stop" test/v0/change-rules.test.ts   exit=1  (sans requireKernelAuthority)
0afe199 (test)           node --test --test-name-pattern="cannot lift a stop" test/v0/change-rules.test.ts   exit=0
```

`6180916` renomme `sinceLastAnswer` en `sinceLastHumanAct` : la coupure est aussi une reprise.
Refactorisation sans effet sur les tests, Preflight verte à 478 tests.

## Ce qui a changé

- `specificationStanding` (`src/domain/change/state.ts`) sépare le rapport établi, qui porte toutes
  les réponses (`settled`), du rapport qui en perd une sans pouvoir être rouvert (`stalled`). Avant,
  les deux étaient `settled`.
- `clarify` (`src/application/phases/clarify.ts`) reprend un rapport `stalled` comme un rapport
  établi, pose d'abord toute question matérielle encore sans réponse, puis arrête le changement
  (`change.block`, motif `stagnation`, levable) au lieu de proposer le mandat.
- `specificationHistory` (`src/application/artifacts.ts`) coupe l'historique à la dernière réponse
  matérielle ou à la dernière levée d'un arrêt, la plus récente des deux dans le journal. Une levée
  est un passage de `blocked` à `ready` ; une pause et sa reprise n'en sont pas. Le rapport sur
  lequel l'arrêt a été levé est donc réécrit s'il ignore une réponse, et la borne s'applique ensuite.

## Revue de sécurité de la tâche 1

Aucun constat nouveau sur `src/application/phases/clarify.ts` et `src/domain/change/state.ts`.
L'arrêt n'émet que `change.block` : il ne lie ni ne délie aucune réponse. Un rapport `stalled`
n'atteint jamais la construction du mandat, donc ni G0 ni l'adoption de G1. La levée reste celle
d'un arrêt levable : `change.unblock`, que seul `resume` émet.

## Revue de sécurité de la tâche 2

Aucun constat nouveau sur `src/application/artifacts.ts` et `src/application/harness.ts`
(inchangé). En clarification, seul `change.unblock` fait passer un changement de `blocked` à
`ready` : les autres levées (nouvelle vérification, extension du budget de tentatives,
réconciliation d'un effet) exigent une phase ou un arrêt postérieurs à G0. `change.unblock` est
refusé à un agent, à une sortie de modèle et à un appel d'outil (test ajouté à `0afe199`), et seul
`resume` l'émet. Chaque reprise ne déplace la coupure qu'une fois : elle obtient une réécriture, puis
la borne s'applique (6a).
