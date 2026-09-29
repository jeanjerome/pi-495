# D-72: Un lanceur de tests illisible arrête le changement, et les tests d'un projet valent ce qu'ils permettent de valider

**Status:** Acceptée
**Date:** 2026-09-29

## Contexte

Une cible Node dont `scripts.test` lance un lanceur que 495 ne sait pas lire, jest par exemple, est
refusée : le contrôle `unit` n'est pas déclaré, et la capacité manquante nomme le lanceur. Le refus
n'arrêtait pourtant le changement que si aucun autre contrôle n'existait. Une cible qui déclare aussi
`scripts.lint` voyait son protocole gelé sur le seul lint, le refus du lanceur ne survivant que comme
une note du diagnostic : un changement pouvait atteindre G5 sans qu'aucun test ne le juge, là où la
même cible s'arrêtait bruyamment à G2 avant que 495 lise `scripts.test`.

Derrière ce cas, une attente plus large : 495 ne choisit pas les tests d'un projet, il les analyse. Ce
qui compte est ce qu'ils permettent de valider de la qualité d'un changement, pas le nom de l'outil qui
les lance.

## Décision

1. **Un lanceur de tests refusé arrête le changement.** Quand la déclaration de test d'une cible nomme
   un lanceur que 495 ne sait pas lire, l'adaptateur ne déclare aucun contrôle, lint compris, et la
   conception de la vérification lève `CAPABILITY_MISSING` en nommant le lanceur. Un protocole n'est
   jamais gelé sur un contrôle qui ne juge pas le comportement parce que le contrôle qui le jugeait a
   été refusé. Une capacité manquante qui n'est qu'un angle mort déclaré, comme l'absence d'un rapport
   de couverture, reste une note du diagnostic et n'arrête rien.
2. **Les tests d'un projet valent ce qu'ils permettent de valider.** 495 analyse les tests en place :
   le rapport de leur lanceur se lit et se qualifie sur ses témoins, puis les capteurs disent ce qu'ils
   valident vraiment (couverture des lignes introduites, mutation sur les lignes modifiées, assertions
   tenues). Un lanceur qui n'est pas celui que 495 lit d'origine est adopté quand ce qu'il produit se
   qualifie et sert à valider un aspect du changement ; jamais sur son nom.
3. **Ce qui manque est recommandé, et le propriétaire décide.** Quand les tests en place ne suffisent
   pas à valider la qualité d'un changement, 495 recommande d'autres types de tests (unitaires,
   mutation, …) avec un framework recommandé par technologie et par type de test. Le propriétaire
   valide le choix, et 495 installe alors le framework ; il refuse, et l'insuffisance est inscrite au
   dossier. Un lanceur qui ne sert à rien, dont le propriétaire a refusé le complément recommandé,
   n'est pas utilisé.
4. **Installer un framework approuvé ne se heurte pas à une protection.** Pour cet acte seulement,
   `package.json` et les fichiers de dépendances ne sont pas protégés. Ce que 495 protège est ce
   qu'une phase n'a pas besoin de modifier, pas un ensemble fixe de répertoires : la protection suit
   le besoin de la phase.

## Conséquences

La décision 1 s'applique tout de suite : une cible jest avec un script lint s'arrête comme une cible
jest sans lint, en nommant jest. Les décisions 2 à 4 dessinent le travail que porte l'epic `e12`,
agrandi pour les inclure, avec `e22` pour la décision du propriétaire.

Trois points restent ouverts. Le catalogue des frameworks recommandés par technologie et par type de
test n'existe pas. Les chemins protégés sont aujourd'hui déclarés par l'adaptateur de la pile, pour
chaque contrôle, en listes fixes (`test/`, `tests/`, `package.json`, les fichiers de configuration) :
les faire dépendre de la phase est à concevoir. Enfin, les contrôles d'une pile Node
tournent sans réseau (`network: denied`), et la voie par laquelle un framework approuvé serait installé
reste à concevoir.
