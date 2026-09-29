# D-73: Les défauts ouverts se corrigent à la fin de chaque epic, par une story de correction

**Status:** Acceptée
**Date:** 2026-09-29

## Contexte

La relecture inscrit au registre ce qu'elle ne fait pas corriger, et le registre s'allonge : 18 défauts
ouverts au 2026-09-29, dont quatre de gravité moyenne. Un cycle qui déroule des epics à la suite sans
propriétaire ne les reprend jamais, et chaque epic bâtit sur ceux de la précédente. Un défaut qu'une
epic vient d'introduire se répare mieux tant que son contexte est frais.

## Décision

1. **À la fin de chaque epic, avant la suivante**, la suite corrige les défauts ouverts de gravité
   moyenne ou haute qui ne demandent pas de décision de produit. **À la fin de la suite**, elle
   corrige les défauts faibles.
2. **Un défaut se corrige par une story**, de l'epic `e28`, écrite par une session à partir de son
   entrée du registre, qui la cite. Elle passe par les six pas comme toute story, sous les mêmes
   règles de relecture, de recette et d'arbitrage. Au versement, l'entrée est marquée corrigée à la
   révision qui l'a livrée.
3. **Un défaut qui demande une décision de produit ne se corrige pas seul.** La session qui choisit
   le prochain défaut nomme ceux qu'elle écarte, avec la raison ; la suite les liste à la fin, sans
   s'arrêter. Ils restent au propriétaire.
4. **Le nombre de défauts corrigés par phase est borné**, comme le coût de chaque story : la suite
   rend la main au lieu de corriger sans fin.

## Conséquences

Chaque défaut coûte une story de correction, avec son temps et son coût. En échange, les défauts que
la relecture a inscrits ne s'accumulent pas sous les epics suivantes, et ceux que seul le propriétaire
peut trancher sont nommés en fin de suite au lieu de rester enfouis dans le registre.
