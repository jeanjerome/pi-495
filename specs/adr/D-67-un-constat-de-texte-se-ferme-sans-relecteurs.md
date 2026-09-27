# D-67: Un constat qui ne touche que du texte se ferme sans nouveaux relecteurs

**Status:** Acceptée
**Date:** 2026-09-27

## Context

Sous `D-62`, un constat à corriger retient la porte jusqu'au tour suivant, qui envoie deux
relecteurs neufs. Sur e01s03, un tour a coûté 34 à 37 minutes de relecture, puis 39 à 65 minutes de
réponse.

Le fond a convergé : un défaut de comportement au premier tour, des tests manquants aux deux
suivants. Au quatrième tour, ce qui retenait la porte n'était plus que du texte : des commentaires et
un paragraphe de la story qui appelaient « dernière défense » un refus que la conduite n'atteint
plus, et les sujets de commits que `D-66` sort de la relecture. Chaque correction de texte pouvait en
appeler une autre, et chaque fois un tour entier.

## Decision

`CONVENTIONS.md` § Review, règle 7. Un constat dont la correction ne change que du texte — un
commentaire, une phrase de la story ou d'un relevé, un titre de test — se corrige dans la réponse
comme un autre. Quand tous les constats qui retiennent encore la porte sont de ce genre, le tour
suivant est le coordinateur seul : il vérifie chaque correction contre son constat, et la porte passe
si elles tiennent.

## Consequences

La relecture se ferme dès que le code et les tests ne sont plus en cause.

Une correction de texte n'est plus relue par des relecteurs neufs, mais seulement confrontée au
constat qui l'a demandée. Un constat qui touche du code ou un test garde ses deux relecteurs.
