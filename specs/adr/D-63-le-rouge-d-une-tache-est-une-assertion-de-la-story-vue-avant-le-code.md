# D-63: Le rouge d'une tâche est une assertion de la story, vue en échec avant le code

**Status:** Acceptée
**Date:** 2026-09-27

## Context

`D-52` rend une commande `verify:` écrivable au moment du plan : elle nomme un test qui n'existe pas
encore, et son échec est le rouge. Mais un fichier absent fait échouer la commande sans qu'aucune
assertion ne soit lue, et une tâche dont le fichier de test existe déjà n'a pas de rouge du tout :
sa commande passe avant le premier changement. Le rouge que `D-52` garantit ne dit donc rien de ce
que le test vérifiera.

e01s03 l'a montré. Ses tâches 1 à 4 décrivaient le comportement du code et nommaient des fichiers de
test. Les sessions de `develop-tdd` ont écrit le code, puis les tests, puis obtenu le rouge en
mettant le code de côté. Les tests vérifiaient alors ce que le code faisait : celui de 6a comptait
les interventions, et c'est la recette dans un vrai Pi qui a trouvé que le mandat ne portait pas la
question close que la story promettait. Le test de 6k passait avant que `/495 close` existe. La
relecture a relevé deux autres tests qui ne vérifiaient pas la promesse : la conduite qui reprend
après une clôture, et la question close présente une seule fois au mandat.

Les tâches 6 et 7, écrites depuis les écarts de la recette, disaient au contraire où leur test les
tenait, ce qu'il vérifiait dans les termes de la story (« le mandat porte exactement Q1, avec
`closed_by` »), et ce que le code faisait alors qui le faisait échouer (« le mandat a
`open_questions: []` »). La session a écrit les tests d'abord, les a vus échouer sur ces
assertions, puis a écrit le code, et la recette suivante n'a plus trouvé d'écart.

Le contrôle mécanique du rouge que prescrit `develop-tdd`, `verify-tdd-red-commit.sh`, juge le
dépôt de bigpowers et non celui-ci : chaque session improvisait donc son rouge, et `audit-code` a
dû rejouer ceux des tâches 1 à 4.

## Decision

`CONVENTIONS.md` § Tests porte la règle, sous « Red before code ».

1. **Une tâche dit ce que son test vérifie et pourquoi il échoue aujourd'hui.** Sa description finit
   par le test qui la tient, l'assertion dans les mots de la story — un artefact, un événement, un
   refus, un message — et ce que le code fait aujourd'hui qui la fait échouer. Un compte ou
   l'absence d'erreur ne tient une promesse que si la story l'énonce. La commande `verify:` reste
   celle de `D-52`.
2. **Le test s'écrit d'abord, et son rouge se voit sur cette assertion.** Un fichier absent, une
   erreur d'import ou de type, ou un rouge obtenu en mettant de côté du code déjà écrit n'est pas ce
   rouge.
3. **Le rouge s'inscrit quand il est vu.** Le message d'échec va au journal rouge-vert de la story
   (`specs/verifications/<story>-cycle-rouge-vert.md`) au moment où il est observé. Chaque test
   nouveau échoue par lui-même au commit de test seul : on lit quels tests échouent, pas seulement
   le code de sortie.
4. **Un rouge se rejoue dans un arbre détaché**, au commit de test seul, `node_modules` lié, tant
   que le script du paquet juge un autre dépôt.

## Consequences

`plan-work` doit connaître, pour chaque promesse, ce que le code fait aujourd'hui : en le lisant, ou
en sondant le rouge comme pour les tâches 6 et 7. Le plan coûte un peu plus ; la boucle qu'une
recette ouvre sur un écart coûte davantage, et `audit-code` lit le journal rouge-vert au lieu de le
reconstituer.

Une assertion que le code d'aujourd'hui ne peut pas faire échouer reste hors de portée du rouge :
« la question n'y figure qu'une fois » ne se voyait pas quand la question manquait tout à fait au
mandat. C'est aux mutations des relecteurs de la tenir.

Rien ne vérifie mécaniquement la forme d'une tâche. Le contrôle de capsule de `D-54`, qui pourrait
le faire, vit sur une branche qui n'est pas encore reprise.
