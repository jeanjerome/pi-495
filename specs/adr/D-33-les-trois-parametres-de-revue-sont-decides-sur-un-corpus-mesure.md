# D-33: Les trois paramètres de revue sont décidés sur un corpus mesuré

**Status:** Acceptée

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
