# D-89: La sécurité d'une story est relue en attaquant, la mutation est lancée par l'outil, et l'outil tient les campagnes et la gravité que le cycle promet

**Status:** Acceptée (arbitrage du propriétaire, 2026-10-10) ; restreint `D-68` règle 3 à ce qui n'est pas la section sécurité ; précise `D-73`
**Date:** 2026-10-10

## Contexte

Les stories `e38s01` à `e38s10` ont été conduites par le cycle, en mode automatique à partir de `e38s02`. Leurs
journaux (`specs/verifications/e38s01/` à `e38s10/`) donnent 267 $ et environ 19 h de sessions, dont 33 % au
rouge-vert, 29 % à la relecture, 24 % à la recette et 13 % à l'autocontrôle ; 65 Preflights ont pris 17 % du
temps.

Le premier tour de relecture a refusé les dix branches, pour 53 constats, presque tous des gardes qu'aucun test ne
tenait. Le second tour est passé sans constat sur six branches ; sur `e38s03`, il a relevé une promesse que le code
ne tenait pas.

Aucun défaut grave n'a été vu en relecture. La recette réelle et l'arbitrage ont rouvert cinq branches, huit fois :
- une régression qui bloquait avant G2 toute cible JUnit dont les identifiants d'exigence portent un tiret, vue par
  la campagne Maven (`e38s06`) ;
- quatre contournements de la garantie « le producteur ne change pas son juge » : une caractérisation contredite
  réécrite pour passer (`e38s06`), puis un cas gardé par le propriétaire réécrit sur le seul constat d'un modèle,
  par une révision provoquée par un autre cas, et par une contestation sous un nom voisin (`e38s07`) ;
- un test préparé que le producteur affaiblit sous le même nom et que G4 admettait comme un fichier ajouté sous un
  répertoire protégé, défaut présent dans la version 0.4.0 publiée (`e38s08`).

Chacun de ces contournements est un chemin que la section sécurité de la story refusait, et que la relecture
n'avait pas à chercher : `D-68` règle 3 interdit à la consigne de proposer un scénario de son cru. Chaque
contournement trouvé en recette a coûté un aller-retour complet : rouge-vert, autocontrôle, relecture, recette.

Les campagnes de référence n'ont pas été jouées pour `e38s09` et `e38s10`, qui touchent l'exécution des contrôles ;
l'arbitrage a accepté en le notant « non exercé ». Le registre est passé de 73 à 90 défauts ouverts, dont 16
classés « faible » par la session qui les introduisait. Deux de ces entrées touchaient la section sécurité de leur
story, et c'est l'arbitrage qui a exigé leur correction. Ces stories ont été conduites une à une : la phase de
défauts que `D-73` place en fin d'epic, que seule la suite lance, n'a pas tourné.

## Décision

1. **La section sécurité d'une story est relue en attaquant.** Pour chaque garantie de cette section, chaque
   relecteur cherche un chemin concret, par les entrées publiques que la branche expose, par lequel le producteur ou
   un modèle obtient ce que la garantie refuse. Un chemin trouvé est bloquant : il se corrige sur la branche et ne va
   jamais au registre. Les autres promesses restent relues selon `D-68` : pour elles, la consigne ne propose toujours
   ni scénario, ni état, ni entrelacement.
2. **La mutation des lignes que la branche introduit est lancée par l'outil**, avant le premier tour. Les relecteurs
   reçoivent les mutants survivants au lieu de les produire à la main. Les deux tours restent.
3. **Une story qui touche une technologie, un contrôle ou l'exécuteur ne peut pas être acceptée sans le verdict des
   deux campagnes de référence**, joué sur la tête de la branche et inscrit dans sa recette. L'outil le vérifie, que
   l'accord vienne du propriétaire ou de l'arbitrage. Les chemins qui en décident sont écrits en un seul endroit de
   l'outil.
4. **La gravité d'un défaut que la branche introduit est fixée par l'arbitrage**, pas par la session qui l'inscrit ;
   sans arbitrage, par le propriétaire à l'accord. La phase de défauts de `D-73` tourne aussi à la fin d'une série de
   stories conduites hors de la suite.

## Conséquences

La relecture coûte plus sur les stories qui ont une section sécurité : un relecteur qui cherche un contournement
lit davantage. En échange, un contournement coûte un tour de relecture au lieu d'un aller-retour complet après la
recette. Le risque que `D-68` a mesuré, une relecture qui trouve un autre coin à chaque tour, reste borné : la
recherche ne porte que sur ce que la section sécurité refuse.

La mutation demande un outil de mutation pour TypeScript dans les dépendances de développement du dépôt, qui n'en a
aucun aujourd'hui. Le cycle comble ainsi ce que `cycle/README.md` dit encore manquer.

Une campagne dure de deux à cinq minutes et consomme l'abonnement de Pi ; une story qui touche l'exécution des
contrôles en paie deux de plus à chaque recette.

Une gravité fixée par l'arbitrage peut faire passer un défaut de « faible » à « moyen » : il est alors corrigé à la
fin de l'epic, avant la suivante, au lieu d'attendre la fin de la suite.
