# D-78: Le suivi d'une exigence vit dans le plan et les recettes, et plus dans une matrice tenue à la main

**Status:** Acceptée ; remplace `D-20`
**Date:** 2026-10-01

## Contexte

`D-20` voulait que chaque exigence `[P0]` de l'expression de besoins ait une ligne dans
`TRACEABILITY.md`, couverte ou dite non couverte, et qu'un contrôle de Preflight
(`scripts/check-traceability.ts`) refuse l'absence d'une ligne. La raison était juste : une exigence
absente de la matrice était indistinguable d'une exigence satisfaite.

Depuis, le suivi du travail a changé de place. `specs/plan.yaml` dit ce qui reste à faire, chaque
story porte ses promesses et la recette d'une story est une exécution réelle dont le dossier est
exporté sous `specs/verifications/`. La matrice, elle, n'est plus tenue : elle a été modifiée 27 fois
en deux semaines, puis deux fois depuis le cycle actuel, dont une pour être déplacée. Elle dit encore
qu'une cible Node « ne franchit pas G2 » faute de lire `scripts.test`, ce que le travail sur les
lanceurs de test a réglé. Le contrôle ne vérifie que la présence d'une ligne, jamais sa vérité : la
matrice périmée passe, et on s'y fie.

## Décision

1. **Le tableau `TRACEABILITY.md` et le contrôle `lint:traceability` sont retirés.** Preflight ne
   refuse plus une exigence `[P0]` sans ligne.
2. **Le texte normatif reste.** `specs/amont/` garde l'expression de besoins, la spécification
   fonctionnelle, les deux conceptions et les références : ils définissent les règles `RM-*`, les
   interactions `IH-*` et les exigences que le code cite.
3. **Le contrôle du catalogue des composants reste** (`lint:architecture`) : il lie le code à sa
   conception et n'a pas la dérive de la matrice, puisqu'un composant sans ligne échoue aussitôt.
4. **Ce qui dit l'état d'une exigence** est le plan pour ce qui reste, les promesses de la story et son
   dossier de recette pour ce qui a été livré, et les deux campagnes de référence pour ce que 495
   fait sur un projet réel.

## Motif

Un suivi qui n'est ni vérifié ni tenu est pire qu'aucun, parce qu'il rassure à tort. Le contrôle de
présence a été créé le 2026-09-17 ; rien n'indique qu'il ait refusé un changement depuis, et la
matrice qu'il gardait a dérivé sans qu'il le dise.

## Conséquence

Une exigence oubliée n'est plus signalée par Preflight : c'est au plan et à la rédaction des stories
de la porter. Le tableau supprimé se lit dans l'historique git
(`git log --diff-filter=D -- specs/amont/TRACEABILITY.md`).
