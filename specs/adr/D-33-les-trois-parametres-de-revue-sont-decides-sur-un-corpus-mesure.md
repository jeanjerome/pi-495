# D-33: Les trois paramètres de revue sont décidés sur un corpus mesuré

**Status:** Acceptée ; la dérivation de `NARROW_THRESHOLD` est révisée, sa valeur reste à décider

**Décision.** Le seuil du mode terminal étroit, la taille d'une page de chargement progressif et le
budget de lecture d'un fichier deviennent trois constantes exportées, chacune avec son critère de
décision écrit à côté d'elle et vérifié par un test : `NARROW_THRESHOLD` (100 colonnes),
`CONTENT_PAGE_LINES` (2 000 lignes) et `FILE_READ_BUDGET_BYTES` (2 Mio). Le corpus sur lequel elles
sont mesurées est figé dans `test/fixtures/review-corpus.ts`.
**Motif.** `specification-fonctionnelle.md` §16 renvoie ces trois valeurs à la qualification L0 avec
une contrainte chacune, pas avec un nombre. Trois littéraux dispersés dans le code satisfaisaient la
contrainte par hasard : le seuil de 100 était un `?? 100` jamais justifié, la page était un `5000`
écrit à l'appel, et le budget de lecture existait en trois exemplaires dont l'un divergeait du
journal des sources.
**Conséquence.** Re-mesurer un autre corpus est une révision de décision, pas une correction de
test. Deux constats sont sortis de cette instruction : l'aide clavier de la revue, large de 123
colonnes, perdait ses dernières actions dès qu'un terminal était plus étroit — elle bascule
désormais sur une forme compacte qui nomme les mêmes touches ; et un fichier plus long qu'une page
n'était pas atteignable au-delà de la première — le lecteur charge la page suivante quand la
lecture approche de la fin de ce qui est chargé.

## Révision — `NARROW_THRESHOLD` n'est plus dérivé du partage

Le seuil valait « la plus petite largeur à laquelle un partage de 0,4 donne à l'arbre les 36
colonnes que le nom le plus profond du corpus demande », soit 93, arrondi à 100. Cette dérivation
supposait le partage par défaut. Or `+` et `-` le font varier de 0,2 à 0,7 : à 101 colonnes, un
partage réduit à 0,2 ne laissait que 19 colonnes à l'arbre, coupait le nom et ne déclenchait pas la
vue alternée, puisque la largeur restait au-dessus du seuil. Le seuil ne tenait donc pas ce pour
quoi il existait.

La garantie est désormais portée par l'arbre lui-même : `treeWidthNeeded()` lit la profondeur et la
longueur des noms modifiés qu'il s'apprête à montrer, et le partage ne descend pas en dessous. Elle
ne dépend plus d'un corpus figé ni du partage choisi, et elle vaut à toute largeur où deux panneaux
sont affichés.

Mesurée à nouveau sous cette garantie, la plus petite largeur à laquelle deux panneaux tiennent un
nom entier passe de 93 à 53. `NARROW_THRESHOLD` garde la valeur 100 : elle reste au-dessus de 53,
donc sûre, et aucun comportement ne change. Mais elle ne se déduit plus de rien — c'est une valeur
héritée, pas une valeur décidée, et le test ne vérifie plus qu'une chose vraie, qu'elle ne passe
jamais sous la largeur où deux panneaux cessent de pouvoir montrer un nom.

**Ce qui reste à trancher.** Trois issues, et aucune n'est prise ici. Donner au seuil une raison
côté lecteur : le corpus dit que la ligne source médiane fait 43 caractères, ce qui placerait le
seuil à 80 et changerait le comportement. Supprimer la constante et faire alterner les panneaux
quand aucun des deux ne peut plus faire son travail, calculé sur le contenu comme le plancher de
l'arbre — plus de nombre, plus de corpus figé. Ou garder 100 en l'assumant comme une valeur
d'usage, sans dérivation. `CONTENT_PAGE_LINES` et `FILE_READ_BUDGET_BYTES` ne sont pas touchés :
leurs critères tiennent toujours.
