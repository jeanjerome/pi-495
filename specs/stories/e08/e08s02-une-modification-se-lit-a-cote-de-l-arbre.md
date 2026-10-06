# Une modification se lit à côté de l'arbre, dessinée comme Pi dessine celles de son outil d'édition

Story : e08s02
Epic : e08
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui relit un changement par `/495 review` perd l'arbre dès qu'il ouvre une modification :
le moteur de dessin de la revue, `pix-pretty`, lit lui-même la largeur du terminal et n'en accepte
aucune, alors la modification prend tout l'écran. Il ne voit plus où se trouve le fichier qu'il lit, ni
ce qui reste à lire. Le dessin ne ressemble pas non plus à celui que Pi lui montre pour les modifications
de son outil d'édition, et ses couleurs sont celles de `pix-pretty`, pas celles du thème qu'il a choisi
dans Pi. Celui qui installe 495 paie ce moteur d'environ 17 Mo et de trente-six paquets, dont une
bibliothèque native que 495 n'emploie pas.

Il gagne une modification lue à côté de l'arbre, dessinée comme Pi dessine les siennes, dans les
couleurs de son thème, et une installation qui ne tire plus ce moteur. C'est un défaut et non une
préférence : une revue qui cache l'arbre pendant qu'on lit oblige à fermer la modification pour se
situer, et une surface aux couleurs d'un autre outil ignore le thème que l'utilisateur a réglé dans
l'hôte. `D-82` fixe ce dessin à la place de celui de `D-56`.

## 2. Promesses

Scenario: Une modification s'ouvre à côté de l'arbre
  Given un terminal de 140 colonnes et une revue sur un changement qui modifie `src/a.js`, supprime `src/b.js` et ajoute `src/c.js`
  When le relecteur ouvre `src/a.js` dans le mode des modifications
  Then l'arbre reste à gauche, nomme `b.js` et `c.js`, et se sépare du lecteur par `│`
  And la modification se lit dans le lecteur, à droite de l'arbre

Scenario: Chaque ligne se dessine comme Pi dessine les modifications de son outil d'édition
  Given `src/a.js` dont la ligne 2 passe de `x = a + b;` à `x = a - b;`, suivie de `y = 1;` inchangée, et à qui s'ajoute la ligne 4 `z = 2;`
  When le relecteur l'ouvre
  Then le lecteur montre, dans cet ordre, la ligne de contexte `a` numérotée 1 et précédée d'une espace, `-2 x = a + b;`, `+2 x = a - b;`, la ligne de contexte `y = 1;` numérotée 3 et précédée d'une espace, et `+4 z = 2;`
  And `y = 1;` n'est dessinée qu'une fois, sans signe, comme le modèle de revue la classe
  And le `+` et le `-` que le code porte restent dans le code

Scenario: La modification prend les couleurs du thème de Pi
  Given une session Pi sous son thème `dark`
  When la revue dessine la modification de `src/a.js` dans le terminal de Pi
  Then `-2 x = a + b;` porte la couleur des lignes retirées du thème, et `+2 x = a - b;` celle des lignes ajoutées
  And dans ce remplacement d'une ligne par une autre, l'opérateur changé est mis en avant en vidéo inverse, comme dans l'outil d'édition de Pi

Scenario: Un changement de thème redessine la modification
  Given la modification de `src/a.js` dessinée sous le thème `dark`
  When Pi passe au thème `light` et invalide la revue
  Then le dessin suivant porte la couleur des lignes retirées du thème `light`

Scenario: Une ligne plus large que le lecteur s'arrête à son bord
  Given une ligne modifiée plus longue que le lecteur, sur 140 colonnes
  Then elle est coupée au bord du lecteur par `…`
  And aucune ligne de l'écran ne dépasse 140 colonnes, et le séparateur de l'arbre reste dans la même colonne sur toutes les lignes

Scenario: Ce que la revue montrait déjà d'une modification reste vrai
  Given la même revue
  Then replier le contexte dit combien de lignes inchangées il cache, et le déplier les remet
  And une séquence de terminal tenue dans un fichier relu s'affiche inerte et n'atteint jamais le terminal
  And `]` et `[` sautent d'une portion modifiée à l'autre

Scenario: Installer 495 ne tire plus l'ancien moteur de dessin
  Given le paquet 495 installé par npm
  Then ses dépendances d'exécution ne comptent que `@rgrove/parse-xml`
  And ni `@xynogen/pix-pretty` ni `jiti` ne s'installent avec lui, et `NOTICE` ne les attribue plus

## 3. Sécurité

La neutralisation des fichiers relus (`UX-10`) est touchée : le texte remis au dessin de Pi est construit
par 495 depuis les segments du modèle de revue, et chaque ligne y est neutralisée avant d'être remise,
comme elle l'était avant d'être remise à `pix-pretty`. Le dessin de Pi colore ce qu'on lui donne et
n'inspecte rien. Le dernier scénario retire de l'exécution deux paquets tiers et le chargeur qui
interprétait des sources TypeScript de `node_modules`.

## 4. Tâches

### Tâche 1 — La modification se lit à côté de l'arbre, en lignes dessinées par l'hôte

La surface reçoit par ses options le dessin d'une comparaison, de la forme de `renderDiff` de Pi : un
texte en entrée, des lignes colorées en sortie. `src/presentation/tui/review/diff-view.ts` construit ce
texte depuis les segments de chaque portion, comme l'outil d'édition de Pi construit le sien : `-` et le
numéro ancien pour une ligne retirée, `+` et le numéro nouveau pour une ligne ajoutée, une espace et le
numéro ancien pour une ligne inchangée, les numéros alignés sur le plus large de la page, chaque ligne
neutralisée. La note d'un contexte replié reste une ligne de 495. `render` cesse de donner tout l'écran à
une modification ouverte, et le dessin n'est plus rangé sous la largeur du terminal ; ce qui est dessiné
est oublié par `invalidate()`, pour qu'un changement de thème se voie. Sans dessin injecté, la surface
montre le texte tel quel. Les tests de `test/v0-pure/review-surface.test.ts` qui lisent la gouttière de
`pix-pretty` (« draws a change in a gutter », « draws the comparison 495 computed », le pli et `UX-10`)
lisent la nouvelle forme et restent verts.

- Vérifie : `node --test test/v0-pure/review-diff-beside-tree.test.ts`
- Tient : `test/v0-pure/review-diff-beside-tree.test.ts`, « sur 140 colonnes, `src/a.js` ouvert dans le mode des modifications laisse l'arbre à gauche, qui nomme `b.js` et `c.js` avant `│`, et le lecteur montre dans cet ordre ` 1 a`, `-2 x = a + b;`, `+2 x = a - b;`, ` 3 y = 1;`, `+4 z = 2;` ; une ligne plus longue que le lecteur s'arrête à son bord par `…`, aucune ligne ne dépasse 140 colonnes et `│` reste dans la même colonne ; un dessin injecté qui peint selon un thème courant redessine la modification dans les couleurs du nouveau thème après `invalidate()` ; sur un fichier de deux portions éloignées, `]` porte le haut du lecteur sur la première ligne de la seconde portion et `[` le ramène sur la première »
- Rouge : `render` donne tout l'écran à une modification ouverte (`whole`), l'arbre et `│` n'y sont pas ; le corps vient de `pix-pretty`, en gouttière `2 - │ x = a + b;`, et la surface n'appelle aucun dessin injecté

### Tâche 2 — La revue ouverte dans Pi dessine par `renderDiff` sous le thème actif

`openReviewTui` (`src/extension/review-command.ts`) passe à la surface `renderDiff` de
`pi-coding-agent` comme dessin de la comparaison (`D-81`, `D-82`). `bench/review-bench.ts`, qui ouvre
la même surface dans un vrai Pi, le passe aussi.

- Vérifie : `node --test test/v3-pi/review-diff-pi.test.ts`
- Tient : `test/v3-pi/review-diff-pi.test.ts`, « la revue que `openReviewTui` ouvre sous le thème `dark` de Pi dessine `-2 x = a + b;` dans la couleur `toolDiffRemoved` de ce thème et `+2 x = a - b;` dans sa couleur `toolDiffAdded`, l'opérateur changé en vidéo inverse ; après passage au thème `light` et invalidation du composant, la ligne retirée porte la couleur `toolDiffRemoved` du thème `light` »
- Rouge : `openReviewTui` ne passe aucun dessin ; le corps vient de `pix-pretty`, en gouttière et dans ses propres couleurs, qui ne sont pas celles des thèmes de Pi

### Tâche 3 — `pix-pretty` et `jiti` quittent le paquet

`@xynogen/pix-pretty` et `jiti` quittent les dépendances de `package.json` et leurs attributions
`NOTICE`. `types/pix-pretty/`, les chemins qui y mènent dans `tsconfig.json` et le contrôle
`scripts/check-declarations.ts`, qui ne tenait que ces déclarations, disparaissent avec le script
`lint:declarations`, sa place dans `npm run check` et ses mentions dans `AGENTS.md` et `CONVENTIONS.md`.
Le corpus normatif suit `D-82` : `specs/amont/conception-technique.md` §5.5 ne décrit plus une gouttière
ni une vue qui prend tout l'écran, et `REC-42` de `specs/amont/expression-besoins.md` ne demande plus un
rendu sans signes ni numéros de ligne.

- Vérifie à la main : `npm install`, puis `npm ls --omit=dev --all` et la lecture de `NOTICE` ; puis `npm run build` et `npm run check`, vert
- Tient : la sortie de `npm ls --omit=dev --all`, qui ne nomme que `@rgrove/parse-xml` parmi les dépendances d'exécution, et `NOTICE`, qui ne nomme plus `@xynogen/pix-pretty` ni `jiti`
- Rouge : `package.json` déclare `@xynogen/pix-pretty` et `jiti` en dépendances d'exécution, et `NOTICE` les attribue

## 5. Hors périmètre

- La coloration selon le langage du fichier : `renderDiff` peint une ligne retirée ou ajoutée d'une seule
  couleur, et `D-82` accepte cette perte.
- Le terminal étroit, sous le seuil de largeur : l'arbre et le lecteur y alternent déjà, et rien n'y
  change.
- L'arbre et le lecteur bâtis sur les listes et le défilement de `pi-tui`, et la molette : e08s03.
- La touche `r` que l'en-tête annonce sur un candidat plus récent et qui ne fait rien :
  `BUG-2026-10-06T134711`, au registre.
