# D-64: La recette vient après la relecture, et l'accord du propriétaire porte sur le code livré

**Status:** Acceptée
**Date:** 2026-09-27

## Context

L'ordre de `build-epic` place la recette avant la relecture : `develop-tdd`, puis `verify-work` et
l'accord du propriétaire, puis `audit-code`, la relecture, le message de commit et la livraison.

e01s03 a suivi cet ordre. Le propriétaire a accepté la recette le 2026-09-27 à 15:21:52Z, sur
`63e05b3`. L'audit a ensuite remanié le code, puis les réponses aux deux premiers tours de
relecture ont changé son comportement : la lecture d'un dossier écrit avant la branche, la mesure
du progrès de la spécification, le refus de `/495 close` pendant une conduite en cours. Rien dans
le cycle ne rejoue la recette après la relecture : l'accord ne couvrait plus le code qui allait
être livré, et le propriétaire a dû décider d'une recette ciblée avant la fusion.

La recette est l'étape la plus chère du cycle — des campagnes dans un vrai Pi, dont une sous le
modèle réel — et la seule qui demande le propriétaire.

## Decision

`CONVENTIONS.md` § Cycle order remplace l'ordre de `build-epic` après `develop-tdd` : `audit-code`,
la relecture jusqu'à ce que sa porte passe, puis `verify-work` et l'accord du propriétaire, puis le
message de commit et la livraison. Un écart trouvé par la recette retourne à `develop-tdd`, puis à
un tour de relecture sur le diff depuis la révision relue, puis à la recette. Chaque étape inscrit
cette étape suivante dans la passation, quoi que nomme sa propre skill.

## Consequences

La relecture lit un code que la recette peut encore changer. Un écart coûte alors un tour de
relecture court, sur son seul diff (`D-62`, règle 3), au lieu d'une recette rejouée après chaque
tour de relecture.

Hors écart, la recette tourne une fois, sur le code final, et le propriétaire n'est sollicité qu'une
fois.

Les numéros d'`epic_cycle.step` dans `specs/state.yaml` suivent ceux de `build-epic` et ne disent
plus l'ordre ; le panneau du pilote affiche encore la vérification avant la revue.
