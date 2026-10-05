# D-80: Une reprise à comportement constant prend un chemin court

**Status:** Acceptée
**Date:** 2026-10-01

## Contexte

L'audit de `src/` et `test/` du 2026-10-01 a relevé une soixantaine de constats qui ne changent aucun
comportement : duplications, jumeaux de types, code mort, gestion d'erreurs hors de la règle,
commentaires qui citent une décision, aides de test copiées d'un fichier à l'autre. Le cycle en six
pas est fait pour un changement de comportement : chaque tâche a un test qui échoue d'abord, la
relecture vérifie les promesses de la story, la recette montre dans un vrai Pi ce que la story
ajoute et le refus qu'elle produit sans lui. Une reprise à comportement constant n'a ni promesse, ni
rouge, ni rien à montrer en recette ; son seul juge est la suite existante.

Mesuré sur les treize dernières stories versées par l'outil : de 2,4 à 22,6 $ et de 0,6 à 3,8 h par
story, dont 1 à 7 $ pour la recette seule. Une story arrive aussi sur `main` en un seul commit, quand
le propriétaire veut un commit par reprise. La remise à plat du 2026-09-20 avait déjà versé ses
reprises directement sur `main`, une par commit, avec les tests existants pour filet.

## Décision

1. **Une reprise à comportement constant ne passe pas par les six pas.** Elle est écrite dans
   `specs/reprises.md`, une section par reprise, et conduite par `npm run cycle -- reprises`.
2. **Comportement constant** veut dire : mêmes événements, mêmes artefacts, mêmes verdicts, mêmes refus,
   mêmes contrats, mêmes textes destinés au propriétaire ou au modèle. Seul un échec interne qui
   n'atteignait aucun de ceux-là peut gagner son contexte (une `cause`, un préfixe qui garde le texte
   d'origine) ou cesser de planter sur une valeur qui n'est pas une `Error`.
3. **Le chemin court** : une session fait la reprise sur une branche ; l'outil vérifie que la branche
   porte au moins un commit, que l'arbre est propre, qu'aucune ligne d'assertion de `test/` ne
   disparaît sans réapparaître à l'identique, que le nombre de tests ne baisse pas, et que Preflight
   est verte après reconstruction de `dist/` ; une session neuve relit le diff et juge si un
   comportement change ou si la reprise déborde de sa section. La branche arrive alors sur `main` en
   un commit qui marque la reprise versée. Rien n'est poussé.
4. **Ce qui change un comportement n'est pas une reprise.** La session qui le constate écarte la reprise
   avec la raison, et la boucle passe à la suivante ; la relecture qui le constate arrête la boucle.
   Le défaut va au registre ou à une story.

## Conséquences

Une reprise coûte une session de modification, une session de relecture et deux contrôles, sans
recette ni second tour. Le filet est la suite de tests : une reprise sur du code qu'aucun test
n'exerce n'est jugée que par la relecture, qui le sait. La règle « tout changement passe par les six
pas » vaut pour tout changement de comportement ; `cycle/README.md` § Refactorings porte l'exception.
