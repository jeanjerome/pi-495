# e23s01 — tâche 2 : une destination non déclarée est refusée avant tout engagement

Conduite le 2026-09-21 sur `sortie-vers-le-fournisseur-declaree`.

## Commande de la tâche

```
$ node --test test/v1/egress.test.ts
ℹ tests 6   ℹ pass 6   ℹ fail 0
```

Preflight complet (`npm run build && npm run check`) : sortie 0.

## Cycle rouge-vert

| Comportement | État à l'arrivée | Commits |
| --- | --- | --- |
| Une destination non déclarée est refusée avant que le fournisseur soit joint et sans démarrer de worker | rouge | `7089961` test seul, puis `88c2970` |
| Une déclaration vide refuse tout et se nomme comme cause, au lieu de lister le vide | rouge | `30aad84` test seul, puis le vert qui suit |
| Une destination déclarée est portée jusqu'à la vérification de capacité existante | **vert à l'arrivée** | test de caractérisation seul |

Isolation du rouge contrôlée par arbre de travail détaché, commande de la tâche lancée sur le commit
de test seul : `7089961` sort en 1, `30aad84` sort en 1.

## Ce que le refus emprunte, et ce qu'il n'introduit pas

Code `POLICY_DENIED`, catégorie `policy`, motif d'arrêt `policy_denied`, action suivante
`configure_model` — tous préexistants. Aucun code d'erreur, aucune action, aucun motif d'arrêt
nouveaux. Le refus est placé en tête de `requireCapable`, avant la qualification du bac à sable et
avant la sonde de capacité : la destination est jugée sans être jointe.

## Revue de sécurité — `security: high`

Aucun constat nouveau sur `src/application/intervention.ts`. Les trois propriétés que la tâche
demandait d'établir le sont par les tests plutôt que par lecture :

- le refus précède la sonde de capacité — l'agent double enregistre ses appels, et la liste est vide
  après un refus ;
- il n'ouvre aucun processus — la liste des mandats démarrés est vide ;
- il n'introduit pas de vocabulaire d'erreur — le test affirme `POLICY_DENIED`, qui existait.

## Une correction portée au montage de test

`test/helpers/harness-fixture.ts` conduisait un producteur scripté sous un fournisseur `scripted`
que rien ne déclarait ; huit suites tombaient au premier Preflight. Le montage déclare désormais sa
propre destination, comme une installation réelle déclare celle que Pi a résolue. `DEFAULT_POLICY`
n'a pas bougé : `scripted` n'existe que dans ce fichier, et une campagne scriptée réelle tourne sous
le fournisseur que Pi résout, donc `omlx`.

## Couvert ailleurs, non redoublé

« Le profil du mandat continue de refuser le réseau » est tenu par `v2/telemetry`, qui affirme que
tout profil refuse le réseau et que la tâche 6 exige de voir passer inchangé. L'affirmer une seconde
fois ici ne prouverait rien de plus.
