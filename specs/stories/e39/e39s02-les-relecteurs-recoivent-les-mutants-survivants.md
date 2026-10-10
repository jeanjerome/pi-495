# Les relecteurs reçoivent les mutants qui survivent sur les lignes que la branche introduit

Story : e39s02
Epic : e39
Statut : à faire

## 1. Ce que le lecteur gagne

Le relecteur sait, avant de lire, quelles lignes que la branche introduit aucun test d'une tâche ne tient. Aujourd'hui
il mute une ligne à la main pour chaque promesse : sur `e38s01` à `e38s10`, 53 constats du premier tour, presque tous
des gardes qu'aucun test ne tenait, ont été trouvés ainsi, par deux relecteurs qui refaisaient chacun le même travail,
et la relecture a coûté 29 % du total. `cycle/README.md` dit cette mutation encore manquante.

L'outil lance la mutation lui-même avant le premier tour, sur les seules lignes que la branche introduit, avec les
tests que les tâches de la story nomment, et donne aux relecteurs les mutants qui survivent (`D-89`). Les deux tours
restent : le second a trouvé sur `e38s03` une promesse que le code ne tenait pas.

## 2. Promesses

Scenario: Les mutants survivants des lignes introduites sont donnés aux relecteurs
  Given une branche qui introduit dans `src/`, `cycle/src/` ou `scripts/` une ligne qu'aucun test des tâches ne fait échouer quand elle est mutée
  When l'outil ouvre le premier tour de relecture
  Then il a muté les lignes que la branche introduit, et elles seules, avec les tests que les tâches nomment, le journal garde le rapport de mutation, et l'invite de chaque relecteur nomme chaque mutant survivant avec son fichier, sa ligne et son remplacement

Scenario: Une mutation qui ne peut pas aboutir n'arrête pas la relecture et le dit
  Given une mutation qui échoue ou dépasse son budget de temps
  When l'outil ouvre le premier tour de relecture
  Then le tour a lieu, et l'invite de chaque relecteur dit que la mutation n'a pas abouti et pourquoi, sans liste de survivants

Scenario: Une branche qui n'introduit aucune ligne de code n'est pas mutée
  Given une branche qui ne change que des tests, des stories ou de la documentation
  When l'outil ouvre le premier tour de relecture
  Then aucune mutation ne tourne et l'invite de chaque relecteur dit qu'aucune ligne n'était à muter

## 3. Sécurité

La mutation tourne dans un arbre détaché de la tête, jamais dans l'arbre de la branche, qu'elle ne modifie pas : la
copie réécrite par l'outil de mutation est retirée après le tour. Comme les autres contrôles du cycle, elle tourne sans
confinement (`cycle/README.md`, § How the cycle differs from 495).

## 4. Tâches

### Tâche 1 — Muter les lignes introduites et donner les survivants

Ajouter Stryker (`@stryker-mutator/core` et `@stryker-mutator/tap-runner`, Apache-2.0) aux dépendances de
développement. Avant le premier tour, relever les lignes que la branche introduit dans les sources TypeScript de
`src/`, `cycle/src/` et `scripts/`, hors tests, lancer Stryker sur ces seules lignes avec les fichiers de test que les
`Vérifie :` des tâches nomment, par le lanceur TAP de `node --test` (`--test-reporter=tap`), dans un arbre détaché de
la tête, garder le rapport au journal et nommer les survivants dans l'invite des relecteurs.

- Vérifie : `node --test test/cycle/relecture-mutation.test.ts`
- Tient : `test/cycle/relecture-mutation.test.ts`, « l'invite du premier tour nomme le mutant survivant d'une ligne introduite, avec son fichier, sa ligne et son remplacement, et aucune ligne hors de la branche n'est mutée »
- Rouge : l'outil ouvre le premier tour sans lancer aucune mutation ; l'invite ne porte que les promesses, la sécurité et le registre.

### Tâche 2 — Une mutation qui n'aboutit pas le dit

Borner la mutation par un budget de temps réglable, et faire que son échec ou son dépassement laisse le tour se
tenir, l'invite disant que la mutation n'a pas abouti et pourquoi.

- Vérifie : `node --test test/cycle/relecture-mutation-echec.test.ts`
- Tient : `test/cycle/relecture-mutation-echec.test.ts`, « quand la mutation échoue, le tour a lieu et l'invite dit qu'elle n'a pas abouti et pourquoi »
- Rouge : l'invite ne dit rien de la mutation, qui n'existe pas.

### Tâche 3 — Rien à muter, rien de lancé

Faire qu'une branche sans ligne introduite dans ces sources ne lance aucune mutation, et que l'invite le dise.

- Vérifie : `node --test test/cycle/relecture-mutation-vide.test.ts`
- Tient : `test/cycle/relecture-mutation-vide.test.ts`, « une branche qui ne change que des tests et des stories ne lance aucune mutation et l'invite dit qu'aucune ligne n'était à muter »
- Rouge : l'invite ne dit rien de la mutation.

## 5. Hors périmètre

La mutation des lignes d'une cible que 495 change : les contrôles de mutation de chaque technologie la portent déjà.
Un seuil de score qui retiendrait la porte : un survivant est une information pour le relecteur, qui juge s'il laisse
une promesse sans test. La relecture de la section Sécurité : `e39s01`.
