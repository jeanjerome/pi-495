# D-45: La surface documentaire est `specs/`, et le corpus antérieur est archivé

**Status:** Acceptée
**Date:** 2026-09-21

## Context

495 portait deux surfaces documentaires. `docs/` était normative — son README l'énonçait (« en cas
de contradiction, c'est l'amont qui fait foi »), `AGENTS.md` la déclarait autoritative, et
`CONVENTIONS.md` subordonnait explicitement `specs/` à `docs/` : « Never duplicate a fact `docs/`
already owns ». `specs/` ne portait que la tenue de comptes bigpowers, dont plusieurs fichiers
n'étaient que des pointeurs vers `docs/`.

Deux surfaces pour une même matière, dont l'une ne servait qu'à renvoyer à l'autre.

## Decision

`specs/` est la surface documentaire. Les artefacts que les skills bigpowers savent écrire sont
produits à leur emplacement canonique. Le corpus rédigé avant la bascule est déplacé par `git mv`
sous `specs/archive/`, **dans sa disposition d'origine** — `archive/amont/`, `archive/chantiers/`,
`archive/revues/`, `archive/benchmarks/`, et les traceurs à sa racine. `docs/` n'existe plus.

Déplacer l'arbre entier plutôt que le redistribuer préserve les renvois internes : le corpus se cite
par noms de fichiers entre backticks, qu'aucun vérificateur de liens ne contrôle.

## Consequences

L'archive n'est pas inerte. `scripts/check-architecture.ts` y lit le catalogue des composants et
`scripts/check-traceability.ts` la liste des exigences et la matrice. Ces deux contrôles ne gardent
leur pouvoir de refus que pour cette raison : une matrice régénérée depuis le code ne pourrait
jamais être en désaccord avec lui, et le gate deviendrait vide. « Archivé » veut donc dire « ce
n'est plus là qu'on écrit du neuf », pas « c'est inerte ».

Ce que les skills écrivent est plus pauvre que ce qu'elles remplacent, et l'écart est assumé :
`SCOPE_LATEST.yaml` borne un périmètre en deux listes là où `expression-besoins.md` porte 104
exigences avec leurs recettes d'acceptation, et son HARD GATE interdit le détail. Le normatif reste
donc dans l'archive, que ces fichiers désignent au lieu de le restituer.

Les capsules d'epic ne sont pas générées. `plan-release` et `plan-work` exigent des stories au
format *countable-story-format*, absent du paquet bigpowers installé, et une commande `verify:`
exécutable par tâche. Écrire un `verify:` pour du travail non encore conçu produirait un fichier qui
a l'air exécutable sans l'être — le défaut même que ce projet refuse ailleurs.

**Alternative rejetée :** éclater `conception-technique.md` dans les emplacements bigpowers
(`product/`, `tech-architecture/`). Elle aurait placé du contenu normatif sous des noms que les
skills réécrivent intégralement — `tech-stack.md` est la sortie de `map-codebase` — et cassé les 124
mentions préfixées d'un répertoire ainsi que les 39 renvois `§N.N` que `src/` porte en commentaire.

**Limite :** la série `D-01` à `D-44` reste dans `specs/archive/DECISIONS.md`. Cette décision ouvre
sa continuation sous `specs/adr/`, à raison d'un fichier par décision, comme les ADR amont.
