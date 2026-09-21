# e23s01 — tâche 3 : un secret du contrôleur n'atteint ni le worker ni le contexte

Conduite le 2026-09-21 sur `sortie-vers-le-fournisseur-declaree`.

## Commande de la tâche

```
$ node --test test/v1/egress.test.ts
ℹ tests 9   ℹ pass 9   ℹ fail 0
```

Preflight complet (`npm run build && npm run check`) : sortie 0.

## Nature du cycle : caractérisation, vert à l'arrivée

Les deux propriétés que la tâche demandait sont déjà vraies dans le code existant, établies avant
cette story :

- `PiWorkerAgent.startIntervention` (`src/adapters/pi-worker/supervisor.ts:64-69`) construit
  l'environnement du processus démarré depuis une liste fermée — `PATH`, `HOME`, `TMPDIR` s'il
  existe, puis `options.env` — jamais depuis `process.env` étalé. En production
  (`src/extension/runtime.ts:83-91`), `options.env` n'est jamais fourni : il vaut `{}`.
- `buildContext` (`src/application/context.ts:112`) est une fonction pure de `ContextInput`. Elle ne
  reçoit aucun accès à l'environnement et n'en lit aucune variable : rien à retirer n'existe.

Aucun code de production n'a été écrit. Trois tests, un seul commit `test:`, comme la seconde moitié
de la tâche 1.

| Comportement | État à l'arrivée |
| --- | --- |
| Un secret placé dans l'environnement du contrôleur n'atteint pas le processus worker | vert à l'arrivée |
| `context.ts` ne lit `process.env` nulle part dans sa source (garde structurelle) | vert à l'arrivée, **retirée depuis** |
| Le texte composé (`system_prompt`, `prompt`, `record`) ne porte pas un secret placé dans l'environnement | vert à l'arrivée |

## Ce qui a rendu la première assertion observable

`PiWorkerAgent` ne peut être observé que par un vrai sous-processus — c'est la manière dont
`test/v1/agent-port.test.ts` le teste déjà. `test/helpers/fake-worker.ts` a gagné un objectif
`echo-env`, qui renvoie son propre `process.env` dans l'événement `completed`. C'est un ajout à
l'appareil d'observation du test, pas au comportement observé ; il rejoint le commit `test:`.

## La garde structurelle a été retirée, et ce qui reste est plus faible

Cette preuve affirmait qu'un ajout de lecture d'environnement dans `context.ts` ferait échouer un
test avant d'atteindre un texte remis au modèle. Ce test balayait la source du fichier ; la relecture
croisée l'a jugé contraire à la règle « n'affirmer qu'à travers l'interface publique », et il a été
retiré. Ce qui reste prouve que deux valeurs plantées dans l'environnement n'atteignent pas le texte
composé, après avoir prouvé que ce texte porte bien ses marqueurs — donc pas une tautologie, mais
pas davantage une barrière : une lecture d'une **autre** variable passerait. Porter cette règle dans
un contrôle de Preflight, où une règle de forme de source a sa place, reste à faire.

## Revue de sécurité — `security: high`

Aucun constat nouveau sur `src/adapters/pi-worker/supervisor.ts` et `src/application/context.ts`.
La garde structurelle sur `context.ts` — aucune occurrence de `process.env` dans sa source — est ce
qui empêche une régression future plutôt que de seulement l'observer aujourd'hui : un ajout de
lecture d'environnement dans ce fichier ferait échouer le test avant qu'il touche un texte remis au
modèle.

## Limite relevée, non traitée

`options.env` de `PiWorkerAgent` reste un point d'entrée générique : rien n'empêche un futur appelant
de lui passer une valeur portant un secret. Cette tâche prouve ce qui est vrai aujourd'hui — aucun
appelant ne le fait — pas ce qui serait vrai de tout appelant possible.
