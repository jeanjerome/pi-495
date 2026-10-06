# La revue répond aux raccourcis que l'utilisateur a réglés dans Pi, et son aide nomme les touches actives

Story : e08s01
Epic : e08
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui relit un changement dans le terminal de Pi par `/495 review` a pu régler ses touches
dans le fichier de raccourcis de Pi : `j` et `k` pour descendre et monter dans une liste, une autre touche
que Échap pour annuler parce que son terminal la retarde. Toutes les listes de Pi suivent ce réglage ; la
revue de 495 l'ignore. Elle ne connaît que les flèches, Entrée, Tab et Échap, écrits en dur, et `ctrl+c`,
qui ferme toutes les listes de Pi, n'y fait rien. Son aide, une phrase fixe, nomme des touches qui ne sont
pas celles que l'utilisateur a choisies.

Il gagne une revue qui se parcourt avec les touches qu'il a réglées dans Pi, et une aide qui nomme celles
qui agissent. C'est un défaut et non une préférence : Pi remet à la revue le gestionnaire de raccourcis de
l'utilisateur, et sa documentation demande à un composant de l'utiliser pour les actions réglables ; `D-81`
fait entrer ces raccourcis dans la surface par injection depuis `extension/`. Une surface qui désobéit au
réglage oblige l'utilisateur à changer de touches en entrant dans la revue, et une aide qui nomme d'autres
touches le trompe.

## 2. Promesses

Scenario: La revue se parcourt avec les touches que l'utilisateur a données aux listes de Pi
  Given un réglage de Pi qui donne `k` à `tui.select.up` et `j` à `tui.select.down`
  And une revue ouverte sur un changement de trois fichiers, la sélection sur le premier chemin de l'arbre
  When le relecteur presse `j`
  Then la sélection passe au chemin suivant de l'arbre
  When il presse `k`
  Then la sélection revient au premier chemin
  And la flèche bas ne déplace plus la sélection, comme elle ne la déplace plus dans les listes de Pi

Scenario: Les autres gestes que Pi nomme suivent le même réglage
  Given un réglage de Pi qui donne `space` à `tui.select.confirm`, `ctrl+t` à `tui.input.tab`, `b` et `f` à `tui.select.pageUp` et `tui.select.pageDown`, `h` et `l` à `tui.editor.cursorLeft` et `tui.editor.cursorRight`
  Then `space` sur un fichier de l'arbre l'ouvre dans le lecteur, et Entrée ne l'ouvre plus
  And `ctrl+t` passe le focus de l'arbre au lecteur, et Tab ne le passe plus
  And `f` fait descendre le lecteur d'une page, et `b` le fait remonter
  And `h` replie le dossier sélectionné, et `l` le déplie

Scenario: Échap et ctrl+c ferment la revue comme ils ferment les listes de Pi
  Given aucun réglage de touches dans Pi
  When le relecteur presse `ctrl+c` dans la revue
  Then la revue se ferme et rend le terminal à la conversation, sans rien changer au changement relu

Scenario: Fermer la revue suit le réglage, et `q` la ferme toujours
  Given un réglage de Pi qui donne `ctrl+g` à `tui.select.cancel`
  Then `ctrl+g` ferme la revue
  And Échap ne la ferme plus
  And `q` la ferme

Scenario: La recherche se termine et s'annule avec les touches de Pi
  Given un réglage de Pi qui donne `ctrl+g` à `tui.select.cancel`
  And une recherche en cours sur « c.js »
  When le relecteur presse Entrée
  Then la recherche se termine, la sélection sur `src/c.js`
  When il ouvre une autre recherche, tape « a » et presse `ctrl+g`
  Then la recherche est annulée, son texte vidé, et la revue reste ouverte

Scenario: L'aide nomme les touches réglées
  Given un réglage de Pi qui donne `k` à `tui.select.up`, `j` à `tui.select.down` et `space` à `tui.select.confirm`
  And une session Pi en anglais
  When la revue s'affiche sur 200 colonnes
  Then sa ligne d'aide commence par « k/j move  space open  tab focus »
  And sur 60 colonnes, sa forme courte commence par « k/j space tab »
  And dans une session en français, l'aide commence par « k/j naviguer  space ouvrir  tab focus »

Scenario: Une action que l'utilisateur a désactivée dans Pi disparaît de l'aide
  Given un réglage de Pi qui donne une liste vide à `tui.select.confirm`
  And une session Pi en anglais
  Then l'aide commence par « ↑↓ move  tab focus » et ne nomme plus l'ouverture
  And Entrée n'ouvre plus le fichier sélectionné

Scenario: Avec les touches par défaut, l'aide reste celle d'aujourd'hui
  Given aucun réglage de touches dans Pi, et une session Pi en anglais
  Then l'aide est « ↑↓ move  ⏎ open  tab focus  c filter  m mode  n/p file  ]/[ change  x context  +/- width  / search  q back »
  And elle nomme toutes ses actions, sans être coupée, à chaque largeur de 40 à 200 colonnes

Scenario: La revue ouverte dans Pi lit le réglage de l'utilisateur
  Given un Pi dont le réglage de raccourcis donne `j` à `tui.select.down`
  And une session Pi en anglais
  When la revue s'ouvre dans le terminal de Pi
  Then `j` déplace la sélection au chemin suivant
  And l'aide commence par « ↑/j move »

Scenario: L'aide nomme les touches du réglage que Pi remet à la revue, même quand 495 porte sa propre copie de Pi
  Given un Pi qui remet à la revue un gestionnaire de raccourcis donnant `k` à `tui.select.up`, `j` à `tui.select.down` et `space` à `tui.select.confirm`
  And 495 chargé depuis un dossier dont le `node_modules` contient sa propre copie de Pi, dont le gestionnaire global garde les touches par défaut
  And une session Pi en anglais
  When la revue s'ouvre dans le terminal de Pi sur 200 colonnes
  Then sa ligne d'aide commence par « k/j move  space open  tab focus »
  And `j` déplace la sélection au chemin suivant

Scenario: En plein écran, la ligne d'aide de la revue arrive au terminal
  Given un Pi en plein écran, son mode par défaut, sur un terminal de 30 lignes
  And aucun réglage de touches, et une session Pi en anglais
  When la revue s'ouvre dans le terminal de Pi
  Then le terminal reçoit la ligne d'aide « ↑↓ move  ⏎ open  tab focus  c filter  m mode  n/p file  ]/[ change  x context  +/- width  / search  q back »
  And il reçoit aussi la première ligne de la revue, son en-tête
  And il en va de même sur 24 et sur 50 lignes

## 3. Sécurité

Sans objet : la revue reste une consultation ; les touches changent le geste qui déplace la vue, jamais ce
qu'elle peut faire, et aucune donnée ne sort ni n'est écrite.

## 4. Tâches

### Tâche 1 — La revue répond aux actions de Pi que l'utilisateur a réglées

La surface reçoit un gestionnaire de raccourcis de `pi-tui` par ses options ; sans lui, elle garde les
touches par défaut de `pi-tui`. `handleKey` (`src/presentation/tui/review/keymap.ts`) demande au
gestionnaire, avant ses propres lettres, si une touche est l'une des actions que Pi nomme, comme le fait la
liste `/tree` de Pi : monter et descendre `tui.select.up` et `tui.select.down` ; une page `tui.select.pageUp`
et `tui.select.pageDown` ; ouvrir, et terminer une recherche, `tui.select.confirm` ; fermer, et annuler une
recherche, `tui.select.cancel` ; passer le focus `tui.input.tab` ; replier et déplier
`tui.editor.cursorLeft` et `tui.editor.cursorRight`. `q` ferme toujours la revue. Les lettres propres à la
revue (`c`, `m`, `n`, `p`, `]`, `[`, `x`, `+`, `-`, `/`, `r`) ne changent pas.

- Vérifie : `node --test test/v0-pure/review-keybindings.test.ts`
- Tient : `test/v0-pure/review-keybindings.test.ts`, « avec `k` donné à `tui.select.up` et `j` à `tui.select.down`, `j` passe la sélection au chemin suivant, `k` la ramène et la flèche bas ne la déplace plus ; `space`, `ctrl+t`, `b`, `f`, `h` et `l` réglés ouvrent, passent le focus, remontent et descendent d'une page, replient et déplient, et Entrée et Tab n'agissent plus ; sans réglage `ctrl+c` ferme la revue ; avec `ctrl+g` donné à `tui.select.cancel`, `ctrl+g` la ferme, Échap ne la ferme plus et `q` la ferme ; pendant une recherche, Entrée la termine sur `src/c.js` et `ctrl+g` l'annule sans fermer la revue »
- Rouge : `handleKey` compare le nom que `parseKey` donne à la touche aux littéraux `up`, `down`, `enter`, `escape`… ; `j`, `space`, `ctrl+t` et `ctrl+g` tombent dans le cas par défaut et ne déplacent rien, `ctrl+c` aussi, et la flèche bas déplace toujours la sélection

### Tâche 2 — L'aide nomme les touches réglées

`renderKeyHelp` compose la ligne d'aide, et sa forme courte, à partir des touches que le gestionnaire
rend pour chaque action qu'elle nomme, au lieu des phrases fixes `help` et `helpKeys` de
`src/presentation/tui/review/view.ts`. Les touches d'une action s'écrivent comme Pi les écrit dans ses
propres aides, jointes par `/` ; `up`, `down` et `enter` gardent les signes ↑, ↓ et ⏎ de l'aide
d'aujourd'hui, et ↑ suivi de ↓ s'écrit ↑↓. Une action sans touche n'est pas nommée. La façon dont Pi écrit
une touche entre par les options de la surface, depuis `extension/`.

- Vérifie : `node --test test/v0-pure/review-key-help.test.ts`
- Tient : `test/v0-pure/review-key-help.test.ts`, « avec `k`, `j` et `space` donnés à `tui.select.up`, `tui.select.down` et `tui.select.confirm`, l'aide anglaise sur 200 colonnes commence par `k/j move  space open  tab focus`, sa forme courte sur 60 colonnes par `k/j space tab`, et l'aide française par `k/j naviguer  space ouvrir  tab focus` ; avec une liste vide pour `tui.select.confirm`, l'aide anglaise commence par `↑↓ move  tab focus` et Entrée n'ouvre plus le fichier ; sans réglage, l'aide anglaise est exactement celle d'aujourd'hui »
- Rouge : `renderKeyHelp` écrit la phrase fixe `L.help`, ou `L.helpKeys` quand elle ne tient pas ; l'aide commence par `↑↓ move  ⏎ open` quel que soit le réglage

La promesse « à chaque largeur de 40 à 200 colonnes, l'aide nomme toutes ses actions sans être coupée »
est tenue par `test/v0-pure/review-parameters.test.ts`, « names every action at every width », qui doit
rester vert.

### Tâche 3 — La revue ouverte dans Pi reçoit le réglage de l'utilisateur

`openReviewTui` (`src/extension/review-command.ts`) passe à la surface le gestionnaire de raccourcis que
`ctx.ui.custom()` lui remet, au lieu de l'ignorer, et la façon dont Pi écrit une touche.

- Vérifie : `node --test test/v3-pi/review-keybindings.test.ts`
- Tient : `test/v3-pi/review-keybindings.test.ts`, « la revue que `openReviewTui` ouvre dans un Pi dont le gestionnaire de raccourcis donne `j` à `tui.select.down` passe la sélection au chemin suivant sur `j`, et son aide anglaise commence par `↑/j move` »
- Rouge : `openReviewTui` reçoit le gestionnaire sous le nom `_keybindings` et ne le transmet pas ; la surface ne connaît que la flèche bas, `j` ne déplace rien et l'aide commence par `↑↓ move`

### Tâche 4 — L'aide écrit les touches du gestionnaire que Pi remet à la revue

`openReviewTui` cesse de passer à la surface le `keyText` importé de `pi-coding-agent` : il écrit les
touches du gestionnaire global de la copie de Pi que l'import résout, qui n'est celui que `ctx.ui.custom()`
remet que dans une installation gérée (`npm install --omit=peer`, comme `pi install`). Les touches d'une
action s'écrivent depuis le gestionnaire remis, comme Pi les écrit dans ses propres aides.

- Vérifie : `node --test test/v3-pi/review-key-help-in-pi.test.ts`
- Tient : `test/v3-pi/review-key-help-in-pi.test.ts`, « la revue que `openReviewTui` ouvre avec un gestionnaire donnant `k`, `j` et `space` à `tui.select.up`, `tui.select.down` et `tui.select.confirm`, sans que ce gestionnaire soit le global de `pi-tui`, qui garde les touches par défaut, a une aide anglaise sur 200 colonnes qui commence par `k/j move  space open  tab focus`, et `j` y passe la sélection au chemin suivant »
- Rouge : `openReviewTui` passe à la surface le `keyText` de `pi-coding-agent`, qui écrit `getKeybindings().getKeys(action)`, le gestionnaire global de `pi-tui`, et non celui que `ctx.ui.custom()` remet ; sans `setKeybindings`, ce global est un gestionnaire neuf aux touches par défaut et l'aide commence par `↑↓ move  ⏎ open  tab focus`, alors que `j` déplace bien la sélection. Le test de la tâche 3 installe le gestionnaire remis comme global avant d'ouvrir la revue, ce qui cache l'écart

### Tâche 5 — En plein écran, la revue garde sa ligne d'aide à l'écran

En plein écran, Pi place la revue à la place de son éditeur, sous la conversation, qui garde au moins une
ligne, et au-dessus de son pied de page (`chat-viewport.js` de `pi-coding-agent` 1.0.4) ; la mise en page
de `pi-tui` ne garde d'un composant plus haut que sa place que ses premières lignes. `openReviewTui`
dimensionne la revue selon le mode de Pi (`tui.mode`), pour que son en-tête et sa ligne d'aide tiennent
dans la place que Pi lui laisse ; en mode regular, rien ne change.

- Vérifie : `node --test test/v3-pi/review-fullscreen.test.ts`
- Tient : `test/v3-pi/review-fullscreen.test.ts`, « dans un écran plein de `pi-tui` (`TuiAltScreen`) de 30 lignes, agencé comme celui de Pi — la conversation au-dessus, la revue que `openReviewTui` ouvre à la place de l'éditeur, le pied de page de deux lignes dessous —, le terminal reçoit la première ligne de la revue et sa ligne d'aide anglaise, de `↑↓ move` à `q back` ; sur 24 et sur 50 lignes aussi »
- Rouge : `openReviewTui` rend `Math.max(10, tui.terminal.rows - 2)` lignes quel que soit `tui.mode` ; en plein écran la place de la revue est plus courte (une ligne de conversation au moins, plus les deux lignes du pied de page), et `layoutComponent` de `pi-tui` garde les premières lignes d'un composant qui ne porte pas de `CURSOR_MARKER` : la dernière, la ligne d'aide, n'arrive jamais au terminal

## 5. Hors périmètre

- Régler les lettres propres à la revue (`c`, `m`, `n`/`p`, `]`/`[`, `x`, `+`/`-`, `/`, `q`, `r`) : Pi
  ne nomme aucune action pour elles et n'offre pas à une extension de déclarer les actions d'un composant
  (`registerShortcut` règle un raccourci global). Un réglage de Pi qui donne à une action la lettre d'un
  de ces gestes n'est pas signalé.
- La touche `r` que l'en-tête annonce sur un candidat plus récent et qui ne fait rien :
  `BUG-2026-10-06T134711`, au registre.
- Un réglage modifié pendant que la revue est ouverte : `/reload` ne se tape pas tant qu'elle tient
  l'écran, et une revue ouverte après `/reload` lit le réglage du moment, puisque Pi met à jour le
  gestionnaire qu'il lui remet.
- La comparaison dessinée comme Pi dessine celles de son outil d'édition : e08s02.
- L'arbre et le lecteur bâtis sur les listes et le défilement de `pi-tui`, et la molette : e08s03.
- Supprimer ou signaler la copie de Pi que porte le `node_modules` d'un dépôt ou d'une copie construite
  par `npm ci` : Pi la charge et 495 s'en accommode ; seule l'aide en dépendait, les gestes suivaient déjà
  le gestionnaire remis.
- Les autres lignes que le plein écran pourrait couper hors de la revue (conversation, widgets, pied de
  page de Pi) : leur place est l'affaire de Pi. La revue dessinée en surimpression (`overlay: true`) reste
  écartée par `ADR-010`.
