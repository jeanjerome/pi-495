# e25s02 — le modèle choisi par `/model` est celui de l'intervention suivante

Conduite le 2026-09-23 sur `modele-lu-a-chaque-intervention`, depuis `main` à `952172c` (Preflight
vert, 389 tests).

## Commandes des tâches

Relevées à `eaba714`.

```
$ node --test test/v3/model-select.test.ts                   # tâches 1 et 2
ℹ tests 6   ℹ pass 6   ℹ fail 0
$ npm run build && npm run check                             # tâche 3
ℹ tests 395   ℹ pass 395   ℹ fail 0
exit=0
```

389 tests avant, 395 après : les 6 de `test/v3/model-select.test.ts` sont ajoutés, aucun n'est
retiré.

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| Un modèle choisi entre deux interventions est celui de la seconde, et la première garde le sien (6b) | `fbb4b2e` — les deux démarrages inscrivent `scripted/scripted-1`, le modèle du harnais | `eaba714` |
| Chaque intervention lit la sélection une fois ; le modèle jugé est celui qui est inscrit et remis au worker (§5, 6c) | `fbb4b2e` — 0 lecture au lieu de 2 | `eaba714` |
| Un niveau de réflexion changé seul est celui de l'intervention suivante (6d) | `fbb4b2e` — `off, off` au lieu de `off, high` | `eaba714` |
| Une sélection sans fournisseur est refusée par la capacité, et aucun worker ne démarre (6e) | `fbb4b2e` — `max_steps` au lieu de `capability_missing` | `eaba714` |
| Une session ouverte sans modèle emploie le modèle choisi avant `/495 start` (6a) | `fbb4b2e` — aucun démarrage : le changement est bloqué en `CONFIGURATION_ERROR: provider and model must be explicit` | `eaba714` |
| Une session que Pi a remplacée lit la sélection de la session qui la remplace, sans erreur de contexte caduc (6g) | `fbb4b2e` — vrai `pi --mode rpc` : après `new_session` puis `set_model`, le démarrage inscrit `stand-in-a/first-1`, le modèle du premier démarrage | `eaba714` |

L'isolation est contrôlée à la main, par arbre de travail détaché. Le script
`verify-tdd-red-commit.sh` juge le dépôt de Homebrew, pas celui-ci.

```
fbb4b2e (test seul)      node --test test/v3/model-select.test.ts  exit=1  (6 échecs sur 6)
eaba714 (implémentation) node --test test/v3/model-select.test.ts  exit=0  (6 sur 6)
```

Le cas 6g avait été établi en lisant le code de Pi. L'exécution le confirme sous une autre forme que
prévu. Le code d'avant la story copiait le modèle en valeur à la création du runtime : il ne relisait
jamais le contexte d'ouverture, donc aucune erreur de contexte caduc n'était levée. Le défaut
observé est un mauvais modèle : celui de la session remplacée. L'erreur de contexte caduc est ce
qu'aurait produit une correction qui garde le contexte d'ouverture pour le relire plus tard. Le test
refuse les deux.

## Relevé hors du cas testé

Sur `new_session`, Pi construit un `ModelRuntime` neuf pour la session qui remplace
(`core/agent-session-services.js`, appelé sans `modelRuntime` par `main.js`, Pi 0.87.1). Le
catalogue remis au worker Pi (`catalogue: ctx.modelRegistry`, lu à la création du runtime) reste
celui de la première session. Le modèle est maintenant lu dans la bonne session, mais il est décrit
par ce catalogue. Aucun test ne l'exerce : 6g passe par l'agent scripté, qui ne lit pas de catalogue.
Aucun désaccord n'a été observé à l'exécution.
