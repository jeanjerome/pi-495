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
| Une session que Pi a remplacée lit la sélection de la session qui la remplace (6g) | `fbb4b2e` — vrai `pi --mode rpc` : après `new_session` puis `set_model`, le démarrage inscrit `stand-in-a/first-1`, le modèle sélectionné quand 495 a été chargé de nouveau | `eaba714` |

L'isolation est contrôlée à la main, par arbre de travail détaché. Le script
`verify-tdd-red-commit.sh` juge le dépôt de Homebrew, pas celui-ci.

```
fbb4b2e (test seul)      node --test test/v3/model-select.test.ts  exit=1  (6 échecs sur 6)
eaba714 (implémentation) node --test test/v3/model-select.test.ts  exit=0  (6 sur 6)
```

Le cas 6g avait été établi en lisant le code de Pi : 495 aurait gardé, après `new_session`, le
runtime et le contexte d'ouverture de la session remplacée. Une extension sonde, chargée dans un vrai
`pi --mode rpc` le 2026-09-23, dément cette lecture (Pi 0.87.1) :

```
factory instance=1
session_start instance=1 reason=startup registry=1 model=first-1
command instance=1 registry=1 model=first-1 firstStartCtx=ok
factory instance=2
session_start instance=2 reason=new registry=2 model=first-1
session_start instance=2 reason=new registry=2 model=first-1
command instance=2 registry=2 model=second-1 firstStartCtx=ok
```

Sur `new_session`, Pi charge une nouvelle instance de l'extension, avec un catalogue de modèles neuf
(`createAgentSessionServices` recharge les extensions et crée un `ModelRuntime`). C'est cette
instance qui reçoit deux fois `session_start`, les deux fois avec le catalogue de la session qui
remplace, et son contexte d'ouverture est encore lisible quand la commande arrive. Le rouge de 6g a
donc la même cause que 6a et 6b : la nouvelle instance ouvrait son runtime avant le `set_model` et y
figeait le modèle. Aucune erreur de contexte caduc n'était en jeu, et le catalogue remis au worker Pi
est celui de la session en cours : il n'y a rien à corriger de ce côté. La spécification (6g, §8,
§14, §17, §20), la tâche 1, le commentaire de `selectedModel` et le test 6g ne reposent plus sur
cette prémisse.
