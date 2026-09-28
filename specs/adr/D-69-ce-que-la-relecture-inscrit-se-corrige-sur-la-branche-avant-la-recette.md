# D-69: Ce que la relecture inscrit au registre se corrige sur la branche, avant la recette

**Status:** Acceptée
**Date:** 2026-09-28

## Context

`D-65` envoie au registre une suggestion de relecture dont la correction ajouterait un
comportement, et la corrige après la porte. Sa conséquence dit : « De petits défauts connus partent
avec la livraison, suivis au registre, et se corrigent ensuite comme tout travail de l'échelle
fix-or-log. » La règle 1 de la relecture envoie à la même échelle un défaut antérieur à la branche.
L'échelle n'admet l'inscription sans correction que si la reproduction échoue, et
`CONVENTIONS.md` § Discovered Defects demande de livrer la correction avec le travail qui l'a
révélée. Or chacun des défauts inscrits cette nuit-là porte ses étapes de reproduction, et la
plupart ont été reproduits par une sonde.

La nuit du 27 au 28 septembre l'a montré.

- **La story.** e01s04 est arrivée sur `main` à 07:50 avec quatre défauts inscrits par sa
  relecture : trois introduits par la branche (`BUG-2026-09-28T013000`, `T025000` et `T025100`) et un
  antérieur (`T013100`).
- **Le cycle séparé.** L'état des lieux suivant a ouvert un cycle de correction pour eux : enquête,
  branche, TDD, autocontrôle, puis trois tours de relecture. À la fin du troisième tour, il avait
  coûté 4 h 41 et 82 $, pour trois défauts faibles et un défaut moyen trouvé en chemin. Restaient la
  réponse, la recette dans un vrai Pi, l'accord du propriétaire, le message et le versement.
- **Ce qui se paie deux fois.** Ce cycle repaie ce que la branche de la story avait déjà payé :
  l'état des lieux, la branche, l'autocontrôle, une recette (40 minutes pour e01s04) et un accord du
  propriétaire (une nuit d'attente).
- **La boucle.** Le cycle a inscrit à son tour six défauts (`T103000` à `T103400`, `T113000`), et
  son troisième tour en ajoute quatre. Le registre comptait 4 défauts ouverts au début de la nuit. Il
  en comptera environ 14 quand ce cycle sera versé, et l'état des lieux suivant ouvrira un nouveau
  cycle sur eux. Rien ne borne cette suite : chaque cycle peut ouvrir le suivant.

## Decision

`CONVENTIONS.md` § Cycle order, et les règles 1, 6 et 8 de § Review.

1. **Ce que la relecture inscrit pour le corriger après sa porte se corrige sur la même branche,
   avant `verify-work`.** C'est le cas d'une suggestion de la règle 6, ou d'un défaut antérieur que
   l'échelle fait corriger. La correction passe par `develop-tdd` sur l'entrée du registre, puis par
   un tour de relecture sur son diff.
2. **Ce tour compte dans le plafond de cinq tours.** Ce qu'il inscrit prend le même chemin. Au-delà
   du plafond, le propriétaire décide de la fusion, comme avant.
3. **Les promesses de ce tour (`D-68`) sont le comportement attendu que chaque entrée du registre
   énonce.**
4. **La recette et l'accord du propriétaire ont lieu une seule fois**, sur la branche et ses
   correctifs.

## Consequences

Une story arrive sur `main` plus tard, mais sans aucun défaut que sa relecture a inscrit, sauf si
le propriétaire en décide au-delà du plafond, ou si la reproduction a échoué (l'étape « Log » de
l'échelle, inchangée).

Le but de `D-65` tient : la porte se ferme avant que les correctifs élargissent le diff, et chaque
correctif a sa propre relecture. Sa conséquence « partent avec la livraison » est remplacée.

`D-64` tient : l'accord porte sur le code livré, correctifs compris. La recette montre donc aussi le
comportement attendu des entrées corrigées.

La boucle est bornée par le plafond de relecture, et non plus par le plan : elle ne se poursuit plus
d'une branche à la suivante.

Un défaut trouvé hors d'une relecture passe toujours par `fix-bug` et son propre cycle : par le
propriétaire, par la recette d'une autre story, ou par une Preflight rouge.

Les entrées déjà ouvertes au registre, venues de branches déjà versées, ne changent pas de chemin :
un cycle de correction les prend, comme le veut l'échelle. Sous `D-68`, sa relecture vérifie leurs
promesses, et sous cette règle, ce que sa relecture inscrit se corrige sur sa propre branche.
