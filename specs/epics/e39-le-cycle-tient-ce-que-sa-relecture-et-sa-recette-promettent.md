# e39 — Le cycle tient ce que sa relecture et sa recette promettent

Statut : à faire
Point de départ : `37511656`, branche main, le 10 octobre 2026.
Décision : `specs/adr/D-89-la-securite-d-une-story-est-relue-en-attaquant-et-l-outil-tient-ce-que-la-recette-promet.md`.

## Résultat pour le propriétaire

Un contournement d'une garantie de sécurité est trouvé en relecture, pas après la recette. Les relecteurs
reçoivent les mutants qui survivent sur les lignes que la branche introduit, au lieu de les produire à la main.
L'accord n'est donné qu'avec les deux campagnes de référence vertes quand la branche touche une technologie, un
contrôle ou l'exécuteur. La gravité d'un défaut qu'une branche introduit n'est pas fixée par celui qui l'a
introduit, et les défauts moyens se corrigent à la fin d'une epic même quand ses stories sont conduites une à une.

## Ce qui existe au point de départ

| Mécanisme constaté | Conséquence |
| --- | --- |
| `cycle/prompts/relecteur.md` reçoit la section Sécurité avec les promesses, mais interdit tout scénario de son cru (`D-68`) | e39s01 ajoute la recherche d'un contournement pour la seule section Sécurité. |
| `cycle/src/relecture.ts` envoie au registre un constat antérieur, et au registre ce qui n'est pas bloquant quand la porte passe | e39s01 fait qu'un contournement retient la porte quel que soit son placement. |
| Les relecteurs mutent une ligne à la main ; `cycle/README.md` dit la mutation encore manquante | e39s02 fait lancer Stryker par l'outil ; l'essai du 10 octobre montre Stryker 10 et son lanceur TAP sur `node --test` avec `--test-reporter=tap`. |
| La recette déclare ses campagnes dans sa sortie ; `accepter` inscrit l'accord sans rien vérifier | e39s03 fait jouer les campagnes par l'outil et refuse l'accord sans elles. |
| L'arbitrage ne peut écrire que le registre ; la gravité vient de la session qui inscrit le défaut | e39s04 fait fixer la gravité par l'arbitrage. |
| `corrigerDefauts` ne tourne que dans `suite` | e39s04 la fait suivre la dernière story d'une epic conduite en `auto`. |

## Livraisons et ordre

| Story | Livraison observable | Prérequis |
| --- | --- | --- |
| e39s01 | Un contournement de la section Sécurité retient la porte de relecture | Aucun |
| e39s02 | Les mutants survivants des lignes introduites sont donnés aux relecteurs | Aucun |
| e39s03 | L'accord exige les deux campagnes vertes à la tête quand la branche touche les contrôles | Aucun |
| e39s04 | La gravité est fixée par l'arbitrage et la phase de défauts suit une epic conduite seule | Aucun |

Les quatre sont indépendantes ; l'ordre met d'abord ce qui relit les suivantes. Les stories restantes de `e38`
(`e38s11` à `e38s13`) reprennent ensuite.

## Limites

- Rien ne change dans `src/` : e39 ne touche que l'outil du cycle, ses invites et sa documentation.
- Aucun outil n'est installé sur le poste : Stryker entre dans les dépendances de développement du dépôt.
- La recherche de contournement ne s'étend pas aux promesses : `D-68` tient pour elles.
