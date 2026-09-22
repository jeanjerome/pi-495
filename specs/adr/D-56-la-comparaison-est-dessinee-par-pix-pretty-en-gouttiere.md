# D-56: La comparaison est dessinée par pix-pretty, en gouttière

**Status:** Acceptée
**Date:** 2026-09-22

## Context

La vue des modifications affichait des blocs **ANCIEN** et **NOUVEAU**, sans signes, sans marqueurs
de hunk et sans numéros de ligne. Cette forme venait de `conception-technique.md` §5.5, et non d'une
exigence : le relevé des spécifications l'avait déjà noté — « l'absence de `+`/`-`, de numéros de
ligne et d'en-têtes de patch est un choix de rendu ». `UX-07` demande trois choses, et ne nomme
aucune forme : retrouver exactement les caractères du source, qu'aucun habillage de comparaison ne
se confonde avec le code, et que l'ancien et le nouveau se distinguent sans recourir à la couleur.
`UX-07` ajoute que « le rendu — coloration, mise en évidence, forme de la comparaison — relève du
TUI de Pi et de la conception d'interface ».

Ce que 495 écrivait à la place était basique : deux blocs étiquetés, sans emphase sur le mot changé
ni coloration du langage. L'étude d'antériorité de `e24` a trouvé deux moteurs déjà écrits :
`renderDiff`, publié compilé par Pi lui-même, et `@xynogen/pix-pretty`, sous licence MIT, qui dessine
une gouttière — barre, numéro de ligne, signe, séparateur — puis le code sur une ligne teintée, avec
le mot changé mis en avant et le langage coloré.

## Decision

La comparaison est dessinée par `@xynogen/pix-pretty`, pris comme dépendance et non recopié. La
clause de §5.5 qui interdisait les signes, les marqueurs de hunk et les numéros de ligne est levée.

La forme retenue tient `UX-07` : ce que la comparaison ajoute vit dans la gouttière, à gauche du
séparateur, donc un `+` du programme reste un caractère du programme ; le signe, le numéro et la
règle distinguent l'ancien du nouveau sans que la couleur soit nécessaire ; et le texte remis au
moteur est d'abord neutralisé, sans quoi une séquence terminal tenue dans un fichier relu partirait
au terminal telle quelle (`UX-10`).

**La vue des modifications prend tout l'écran.** Le moteur dessine à la largeur qu'il lit lui-même du
terminal et n'en accepte aucune de son appelant : replié pour le terminal puis coupé à la largeur
d'un panneau, il perdrait la fin de chaque ligne longue. L'arbre s'efface donc pendant la lecture
d'une modification et revient avec tout autre mode. Sous le seuil étroit rien ne change : les
panneaux alternent déjà, et prendre son tour au lecteur retirerait la seule façon de naviguer.

`D-06` n'est pas rouvert : le calcul maison reste la source des segments que le dossier, les constats
et la sortie structurée portent. Le moteur re-compare les deux côtés d'un hunk pour les dessiner ;
ce qui est opposable vient du calcul, ce qui est dessiné vient du moteur.

## Consequences

Ce sont les premières dépendances d'exécution du paquet, qui n'en avait aucune : environ 17 Mo et
trente-six paquets pour `pix-pretty` — dont une bibliothèque native pour une recherche floue dont 495
ne se sert pas — et 1,8 Mo pour le chargeur. Toutes deux attribuées au `NOTICE`.

Le paquet publie ses sources TypeScript et aucun build. Deux conséquences, toutes deux tenues et
réversibles le jour où il publie un build :

- ses sources ne compilent pas sous les réglages de ce dépôt, donc les déclarations que le
  compilateur lit sont écrites à la main sous `types/pix-pretty/` et `tsconfig.json` les y renvoie
  par `paths` ; rien n'avertit quand la version bouge, et le README à côté d'elles le dit ;
- Node refuse de typer-effacer un fichier sous `node_modules`, donc le paquet réclame `jiti` et le
  charge lui-même — seconde dépendance d'exécution, 1,8 Mo, MIT.

Ce dernier point a d'abord été tenu par un drapeau posé sur le lanceur de tests. C'était faux, et le
banc de `bench/` l'a montré en trente secondes : un crochet global fait passer l'import différé, mais
Pi n'en pose pas, et l'ESM compilé de `dist/` retombait alors sur le chargeur natif. Une suite qui ne
peut échouer que là où la production échoue vaut mieux qu'une suite verte pour une raison que la
production n'a pas : le drapeau est retiré, et les tests empruntent le chemin que Pi emprunte.

`scripts/check-distribution.ts` change deux fois : une dépendance d'exécution vaut déclaration au
même titre qu'un pair, et le relevé des imports voit désormais la forme `import("…")`, y compris
portée par un chargeur — sans quoi un paquet atteint par un import différé aurait voyagé sans être
déclaré.

Les tests de la surface attendent que le corps soit dessiné : le dessin est asynchrone, et ce qu'un
rendu synchrone montre entre-temps est la mention de chargement.
