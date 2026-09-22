# D-54: La cohérence d'une capsule est tenue par un contrôle du dépôt, pas par celui du paquet d'outils

**Status:** Acceptée, implantation portée hors de cette branche
**Date:** 2026-09-21
**Révisé:** 2026-09-22 — le contrôle vit sur la branche `controle-de-capsule` et n'est plus
chaîné dans le Preflight de cette branche. La décision tient ; la porte qu'elle installe ne
s'exerce pas ici tant que cette branche-là n'a pas été reprise. Jusque-là, rien ne refuse une
story dite faite sans preuve, ce qui est l'état que cette décision existe pour corriger.

## Context

`plan-work` impose, avant toute écriture de code, une porte de cohérence inter-artefacts :
`plan-consistency-check.sh`, distribué par le paquet d'outils. Elle n'a jamais rendu un constat dans
ce dépôt. Elle sort en 1 sans écrire une ligne, ce qu'un lecteur ne distingue pas d'un blocage.

La mesure a corrigé l'hypothèse qui en avait été écrite. Le script ne meurt pas sur les stories non
encore planifiées : il meurt sur la première story de la capsule, au premier tour de boucle. Il
déduit sa racine de dépôt de son propre emplacement — donc l'arborescence du paquet, jamais celle-ci
— et confie l'extraction des commandes `verify:` à un module Python qui réclame une bibliothèque
absente de la machine. Sous `set -euo pipefail`, cette seule substitution en échec le fait sortir
avant le premier constat. Les deux causes n'en font qu'une, et elle se déclenche immédiatement.

Une passerelle de liens symboliques montée hors du dépôt la ferait tourner : le script `cd` dans le
répertoire du chemin par lequel on l'appelle, donc une racine fabriquée est adoptée telle quelle, et
l'environnement Python est cherché au même endroit. Cette passerelle a été essayée et fonctionne.
Elle repose cependant sur un cache `npx` que `npm` peut effacer, et elle ne corrige pas le fond :
le script exige une spécification écrite pour chaque story qu'un epic déclare. 495 remplit une
capsule story par story — c'est la méthode, pas un retard. Un contrôle qui refuse la méthode est un
contrôle sous lequel personne ne peut être vert, donc un contrôle qu'on finit par contourner.

## Decision

La cohérence d'une capsule est tenue par un contrôle du dépôt, `scripts/check-capsule.ts`, chaîné
dans Preflight sous `lint:capsule`. Il refuse ce qui est mal câblé et jamais ce qui n'est pas encore
câblé : une story qu'un epic déclare et qu'aucun fichier de tâches ne porte, un fichier de tâches
dont l'epic ne déclare pas la story, une spécification nommée et absente, une spécification présente
que rien ne nomme, une tâche sans commande, une tâche dans un état qu'aucun journal ne tient, et une
story dite faite dont la spécification n'a jamais été écrite.

Une story sans spécification reste admise : c'est l'état normal d'une capsule en cours, et la seule
chose qu'il interdit est de la déclarer terminée.

La porte de `plan-work` est réputée tenue par ce contrôle. Le script du paquet n'est plus appelé.

## Consequences

Preflight gagnait un contrôle de plus, et la capsule était jugée à chaque exécution plutôt qu'au seul
passage de `plan-work` — un fichier de tâches édité à la main ne peut plus se désaccorder de sa
spécification en silence.

La limite écrite à la fin de `D-52` se réduit sans disparaître : Preflight vérifie désormais que
chaque tâche *porte* une commande, pas qu'elle est exécutable. Une commande qui ment reste possible
et se découvre au premier `develop-tdd` qui la lance.

Les fichiers de capsule sont lus par expressions et non analysés : le dépôt ne porte aucun lecteur
YAML, et les formes lues — une liste d'identifiants de story, quelques clés de premier niveau, un
bloc par tâche — sont celles que `plan-work` écrit. Un fichier qui en sort est refusé plutôt que
deviné, ce qui est le comportement voulu d'un contrôle mais impose que la forme reste stable.

Les autres scripts du paquet d'outils restent affectés par la même déduction de racine :
`verify-tdd-red-commit.sh`, `check-blind-spots.sh`, `completeness-critic.sh`,
`sync-status-from-epics.sh` et `trace-stories.sh`. Cette décision ne tranche que la porte de
cohérence ; ce que devient chacun des autres reste ouvert.
