# D-65: Une suggestion de relecture qui ajoute un comportement se traite après la porte

**Status:** Acceptée
**Date:** 2026-09-27

## Context

`D-62` dit qu'une suggestion « à peser » ne retient jamais la porte, mais pas si elle se corrige
dans le tour. Chaque correction faite dans un tour entre dans le diff que relit le tour suivant.

e01s03 l'a montré. La réponse au premier tour a corrigé trois suggestions à peser, dont une qui
ajoutait un refus : `/495 close` refusé pendant qu'une conduite tourne. La réponse au deuxième tour
a dû reprendre ce refus — tenir l'état occupé pendant le dialogue de confirmation, et répondre dans
la langue de la session — et le troisième tour relit cette reprise. Un tour a coûté 33 à 37 minutes
de relecture, puis 39 à 65 minutes de réponse.

## Decision

`CONVENTIONS.md` § Review, règle 6. Une suggestion à peser dont la correction n'ajoute aucun
comportement — un test qui manque, un relevé à rectifier, du code mort — se corrige dans le tour qui
la trouve. Celle dont la correction ajouterait un refus, un état ou un mécanisme va au registre
`specs/bugs/registry.yaml`, nommée comme introduite par la branche quand elle l'est, et se corrige
après la porte. C'est la réponse permanente du propriétaire, au sens de la règle 1, pour une
suggestion à peser.

## Consequences

La relecture converge plus vite : un tour ne relit que ce qui retient la porte.

De petits défauts connus partent avec la livraison, suivis au registre, et se corrigent ensuite
comme tout travail de l'échelle « fix-or-log ».

La règle ne déclasse rien. Un défaut qu'un relecteur juge bloquant ou à corriger reste dans le tour :
c'est à lui de le classer.
