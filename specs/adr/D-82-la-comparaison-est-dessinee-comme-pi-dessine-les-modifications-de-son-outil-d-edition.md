# D-82: La comparaison est dessinée comme Pi dessine les modifications de son outil d'édition

**Status:** Acceptée ; remplace `D-56`
**Date:** 2026-10-06

## Contexte

`D-56` a confié le corps de la vue des modifications à `@xynogen/pix-pretty` : une gouttière avec
numéros, signe et trait, le mot changé mis en avant, le langage coloré. Ce dessin a trois coûts que
`D-56` énumère. Le moteur lit lui-même la largeur du terminal et n'en accepte aucune, donc la vue
d'une modification prend tout l'écran et l'arbre s'efface. Le paquet pèse environ 17 Mo et
trente-six paquets, dont une bibliothèque native que 495 n'emploie pas. Il publie des sources
TypeScript sans build, ce qui impose `jiti` pour le charger, des déclarations écrites à la main sous
`types/pix-pretty/` et le contrôle `lint:declarations` qui les tient.

Pi publie le dessin des modifications de son propre outil d'édition, `renderDiff` de
`pi-coding-agent` : chaque ligne porte son signe et son numéro avant le code, les lignes retirées et
ajoutées prennent les couleurs de diff du thème actif, et un remplacement d'une ligne par une autre
met en avant les mots changés. Il avait été écarté parce que `conception-technique.md` §5.5
interdisait alors les signes et les numéros de ligne ; `D-56` a levé cette clause.

## Décision

1. **Le corps de la vue des modifications est dessiné par `renderDiff` de Pi**, la forme sous laquelle
   Pi montre les modifications de son outil d'édition. `@xynogen/pix-pretty` et `jiti` quittent les
   dépendances d'exécution, et `types/pix-pretty/` disparaît avec la partie de `lint:declarations`
   qui le tenait.
2. **La comparaison dessinée reste celle que 495 a calculée** (`D-06`). Les lignes remises au dessin
   sont construites depuis les segments du modèle de revue, déjà classées retirées, ajoutées ou
   inchangées, numérotées et neutralisées (`UX-10`) ; Pi ne décide que de la mise en avant des mots
   dans une ligne remplacée par une autre.
3. **La modification se lit à côté de l'arbre.** Le dessin rend des lignes sans largeur imposée ; la
   surface les mesure et les coupe à la largeur du panneau comme toute autre ligne (`D-35`). La vue
   des modifications ne prend plus tout l'écran.
4. Le dessin entre dans `presentation/` par injection depuis `extension/` (`D-81`) : il dépend du
   thème actif de Pi, que seule l'application installe.

## Conséquences

La coloration selon le langage disparaît : `renderDiff` peint chaque ligne retirée ou ajoutée d'une
seule couleur de diff. `UX-07` ne la demande pas ; ancien et nouveau restent distincts sans couleur
par le signe porté en tête de ligne.

Le paquet n'a plus que `@rgrove/parse-xml` comme dépendance d'exécution ; `NOTICE` perd les deux
attributions.

Le dessin de Pi lit le thème global de l'application. Les tests de la surface injectent un dessin qui
ne dépend d'aucun thème, et la recette montre le dessin de Pi dans un vrai Pi.
