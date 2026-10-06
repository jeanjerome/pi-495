# Les lignes sautées entre deux portions d'une modification sont annoncées

Story : e28s15
Epic : e28
Statut : en cours

## 1. Ce que le lecteur gagne

Le relecteur qui ouvre dans `/495 review` un fichier modifié à deux endroits éloignés lit la fin de la
première portion juste au-dessus du début de la seconde : dans la démonstration du README,
` 6  * Merge slots…` est suivi de `64 export function isFree(…)`, sans rien entre les deux. Seul le saut
des numéros lui dit que 57 lignes ne sont pas montrées, et il faut le remarquer.

Il gagne une ligne qui dit, entre deux portions, combien de lignes ne sont pas montrées. C'est un défaut
et non une préférence (`BUG-2026-10-06T202203`) : l'outil d'édition de Pi marque un tel saut par une
ligne `...` dans le texte qu'il remet à son dessin, et la revue marque déjà, par une ligne à elle, les
lignes inchangées qu'un pli cache. Un saut muet laisse croire que deux lignes éloignées se suivent.

## 2. Promesses

Scenario: Entre deux portions éloignées, une ligne dit combien de lignes ne sont pas montrées
  Given un fichier `src/far.js` de 30 lignes, modifié aux lignes 2 et 25, dont la revue montre une première portion des lignes 1 à 5 et une seconde des lignes 22 à 30
  And une session Pi en français et le contexte déplié
  When le relecteur ouvre `src/far.js` dans le mode des modifications
  Then la ligne qui suit `  5 l5` est « … 16 ligne(s) non montrée(s) »
  And la ligne qui suit celle-ci est ` 22 l22`

Scenario: La ligne parle la langue de la session
  Given le même fichier et une session Pi en anglais
  Then la ligne qui suit `  5 l5` est « … 16 line(s) not shown »

Scenario: Le saut reste annoncé quand le contexte est replié
  Given le même fichier, une session en français et le contexte replié par `x`
  Then « … 16 ligne(s) non montrée(s) » se lit entre la dernière ligne de la première portion et la note « … 8 ligne(s) inchangée(s) » de la seconde
  And les notes du pli restent « … 4 ligne(s) inchangée(s) » et « … 8 ligne(s) inchangée(s) »

Scenario: Un fichier d'une seule portion n'annonce aucun saut
  Given `src/a.js`, modifié en une seule portion
  When le relecteur l'ouvre
  Then aucune ligne du lecteur ne dit « non montrée(s) »

Scenario: Les sauts d'une portion à l'autre arrivent toujours sur la portion
  Given `src/far.js` ouvert, le contexte déplié
  When le relecteur presse `]`
  Then le haut du lecteur est ` 22 l22`, la première ligne de la seconde portion, et non la ligne qui annonce le saut

## 3. Sécurité

Sans objet : la ligne ajoutée est un texte de 495 dont le compte vient des numéros de ligne du modèle de
revue ; elle n'est pas remise au dessin de Pi et ne contient rien du fichier relu.

## 4. Tâches

### Tâche 1 — `renderHunks` annonce les lignes sautées entre deux portions

Entre deux portions, `renderHunks` (`src/presentation/tui/review/diff-view.ts`) écrit une ligne de 495,
estompée comme la note d'un pli et non remise au dessin de Pi, qui dit combien de lignes de l'ancien
fichier séparent la dernière ligne de la portion précédente de la première de la suivante (« ligne(s)
non montrée(s) » en français, « line(s) not shown » en anglais, dans les libellés de
`src/presentation/tui/review/view.ts`). La position où `]` et `[` amènent le lecteur reste la première
ligne de la portion, ou la note de son pli : la ligne du saut se place avant elle. Rien n'est écrit avant
la première portion ni entre deux portions contiguës.

- Vérifie : `node --test test/v0-pure/review-diff-beside-tree.test.ts`
- Tient : `test/v0-pure/review-diff-beside-tree.test.ts`, « dans `src/far.js`, modifié aux lignes 2 et 25, la ligne qui suit `  5 l5` est `… 16 ligne(s) non montrée(s)` et la suivante ` 22 l22` ; en anglais `… 16 line(s) not shown` ; contexte replié, la même ligne précède la note `… 8 ligne(s) inchangée(s)` et les notes du pli restent 4 et 8 ; `src/a.js`, d'une seule portion, n'a aucune ligne `non montrée(s)` ; `]` amène ` 22 l22` en haut du lecteur »
- Rouge : `renderHunks` met les lignes de chaque portion à la suite de celles de la précédente et n'écrit une ligne à lui que pour un pli ; la ligne qui suit `  5 l5` est aujourd'hui ` 22 l22`

## 5. Hors périmètre

- Les lignes avant la première portion et après la dernière : le numéro de la première ligne montrée dit
  où la portion commence, et la page des modifications ne porte pas la longueur du fichier ; ce n'est pas
  le défaut inscrit.
- Déplier les lignes sautées depuis la vue des modifications : le mode « nouveau » (`m`) montre le
  fichier entier.
