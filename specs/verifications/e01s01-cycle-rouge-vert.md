# e01s01 — un rapport qui défait une liaison sans rien demander rouvre la spécification

Conduite le 2026-09-25 sur `rapport-rouvre-la-specification`, depuis `main` à `bdebd23` (Preflight
vert sous Node 24.21.0, 465 tests).

## Commandes des tâches

Relevées à `ada5ada`.

```
$ node --test test/v2/specification-reopening.test.ts        # tâches 1 et 2
ℹ tests 4   ℹ pass 4   ℹ fail 0
$ npm run build && npm run check                             # tâche 3
ℹ tests 469   ℹ pass 469   ℹ fail 0
exit=0
```

465 tests avant, 469 après : les 4 de `test/v2/specification-reopening.test.ts` sont ajoutés, aucun
n'est retiré. Un test existant change d'attendu : dans `test/v2/harness.test.ts`, le rapport qui
abandonne l'exigence portant une déclaration est rouvert une fois, puis refusé à G1 quand le suivant
ne gagne rien (4 interventions `specify` au lieu de 3).

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| Un rapport rouvert qui renomme l'exigence porteuse sans rien demander est rouvert, sa demande dit la réponse à déclarer, et le changement passe G1 (6a) | `60c2c34` — contrôle négatif : `clarifying -> specifying/ready`, aucune intervention de plus, G1 refuse `q1` (« fixes an observable contract that no requirement carries ») | `ada5ada` |
| Un rapport rouvert qui ne gagne rien n'est pas rouvert, et G1 refuse la réponse perdue en la nommant (6b) | `60c2c34` — 3 interventions `specify` au lieu de 4 : le rapport qui perd `q1` n'est jamais jugé | `ada5ada` |
| Des rapports qui oscillent cessent d'être rouverts au premier qui ne porte que des réponses déjà portées (6c) | `60c2c34` — 2 interventions au lieu de 4 : le rapport rouvert va à G1 sans être jugé | `ada5ada` |
| Le rapport qui abandonne l'exigence d'une déclaration est rouvert une fois (`harness.test.ts`) | `60c2c34` — 3 interventions au lieu de 4 | `ada5ada` |
| Une réponse déclarée non observable n'est pas comptée comme perdue (6e) | vert dès `60c2c34` : le comportement tenait déjà, le test le fixe | `ada5ada` |

L'isolation est contrôlée à la main, par arbre de travail détaché. Le script
`verify-tdd-red-commit.sh` juge le dépôt du paquet bigpowers, pas celui-ci.

```
60c2c34 (test seul)      node --test test/v2/specification-reopening.test.ts   exit=1  (3 échecs sur 4)
60c2c34 (test seul)      node --test --test-name-pattern="stops carrying a declaration" test/v2/harness.test.ts   exit=1  (3 au lieu de 4)
ada5ada (implémentation) node --test test/v2/specification-reopening.test.ts   exit=0  (4 sur 4)
```

## Ce qui a changé

- `answersTheReportIgnores` (`src/domain/change/state.ts`) retient toute réponse matérielle
  enregistrée que le rapport ne porte pas, qu'il ait posé la question ou non : le prédicat de
  réouverture est celui de G1.
- La borne de progression se mesure contre l'union des réponses portées par tous les rapports
  antérieurs du changement. Chaque réouverture sans réponse humaine entre deux doit donc ajouter une
  réponse à cette union, ce qui en limite le nombre aux réponses enregistrées (§14).
- `clarify` (`src/application/phases/clarify.ts`) juge le rapport qu'il vient d'obtenir tant que ce
  rapport ne pose pas de question matérielle nouvelle, et relance la spécification tant que la
  réouverture l'exige. L'écriture d'un rapport est extraite dans `writeSpecification`.
