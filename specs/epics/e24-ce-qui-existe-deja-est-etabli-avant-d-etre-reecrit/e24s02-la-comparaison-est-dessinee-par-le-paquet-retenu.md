STORY KEY: e24s02
TITLE:     Dessiner la comparaison avec le paquet retenu plutôt que la réécrire
TYPE:      Story
PARENT:    e24
STATUS:    Refined
AUTHOR:    jeanjerome           DATE: 2026-09-22
MATURITY:  3
SIZE:      L

### 1. Business narrative [draft]

La revue affichait ses modifications en blocs **ANCIEN** et **NOUVEAU**, sans signes, sans marqueurs
de hunk et sans numéros de ligne. Cette forme venait d'une clause de conception, pas d'une exigence :
le relevé des spécifications l'avait déjà noté. `UX-07` ne prescrit aucune forme — elle demande que
les caractères du source soient retrouvés exactement, qu'aucun habillage ne se confonde avec le code,
et que l'ancien et le nouveau se distinguent sans recourir à la couleur — et elle délègue
explicitement « la forme de la comparaison » au TUI.

Ce que 495 écrivait à la place était basique : deux blocs étiquetés, sans emphase sur le mot changé
ni coloration du langage. L'étude d'antériorité a trouvé deux moteurs déjà écrits pour cet
écosystème. Le propriétaire a tranché pour celui qui dessine une gouttière — barre, numéro, signe,
séparateur, puis le code sur une ligne teintée — en connaissant son prix.

Ce prix est l'objet de la story autant que le rendu. Le paquet publie ses sources TypeScript et
aucun build : il ne compile pas sous les réglages de ce dépôt, et Node refuse de typer-effacer un
fichier sous `node_modules`. L'adopter, c'est écrire ses déclarations à la main, réclamer un
chargeur, et devenir le premier paquet du harnais à porter des dépendances d'exécution. Le critère
« le poids qu'il ajoute et ce à quoi il nous lie » cesse d'être une formule : il est payé.

#### MODIFIED: UX-07 — Lire le code tel qu'il est écrit

**Before:** la comparaison est rendue en blocs ANCIEN et NOUVEAU, par du code du dépôt. Le mot qui
change à l'intérieur d'une ligne n'est pas distingué, le langage n'est pas coloré, et le repli du
contexte annonce ce qu'il cache. Les caractères du source sont conservés et la distinction ne tient
pas à la couleur : l'exigence est tenue, par une forme que la conception avait figée.

**After:** la comparaison est dessinée en gouttière par le paquet retenu. Ce que l'affichage ajoute —
barre, numéro, signe — vit à gauche du séparateur, donc un `+` du programme reste un caractère du
programme ; le signe et le numéro distinguent l'ancien du nouveau sans que la couleur soit
nécessaire ; le mot changé est mis en avant et le langage coloré. Les lignes remises au moteur sont
construites depuis les segments que 495 a calculés : le moteur place et peint, il ne décide pas de ce
qui a changé. La vue des modifications occupe tout l'écran, le moteur ne prenant aucune largeur de
son appelant.

### 2. Value statement [draft]

As a relecteur, I want lire une modification dessinée comme un outil de comparaison sait le faire —
gouttière, mot changé, langage coloré — so that je voie ce qui a changé sans reconstituer la
différence de tête, sans que l'habillage se confonde avec le code.

### 3. Actors and permissions [draft]

- **Relecteur** (external) — lit, replie, navigue ; aucun de ses gestes n'engage rien.
- **Surface de revue** (system) — assemble les lignes, demande le dessin, et le montre quand il
  arrive. Elle ne compare pas.
- **Moteur de rendu** (external, paquet) — place, numérote et peint les lignes qu'on lui remet. Il
  ne décide de rien.
- **Preflight** (system) — refuse des déclarations écrites à la main que le paquet installé ne tient
  plus.

### 4. Trigger and preconditions [draft]

**Déclencheur :** le relecteur ouvre la vue des modifications d'un chemin textuel.

**Préconditions :** le dossier porte une page de modifications pour ce chemin ; le paquet retenu et
son chargeur sont installés ; la surface connaît la largeur que l'hôte lui a donnée.

### 5. Main flow and business logic [draft]

1. La page de modifications est chargée, comme avant, par le chemin de pagination existant.
2. Pour chaque hunk, les lignes sont construites depuis ses segments : inchangée, ancienne, nouvelle,
   avec leurs numéros de part et d'autre. Chaque ligne est neutralisée avant d'être remise.
3. La langue est déduite du chemin ; une extension inconnue est une réponse valide et laisse le texte
   sans coloration.
4. Le moteur dessine ces lignes et rend un texte ; la surface le découpe et le garde sous une clé qui
   porte le chemin, l'état du repli et la largeur.
5. Le dessin est asynchrone : tant qu'il n'est pas arrivé, la vue le dit.
6. La vue des modifications occupe tout l'écran ; l'arbre revient avec tout autre mode.

### 6. Alternative flows and exceptions [draft]

- **Le repli est demandé** — les lignes inchangées ne sont pas remises au moteur, et une ligne
  annonce combien sont cachées. Un second appui les remet.
- **La page n'est pas textuelle** — binaire, lien, spécial : rien n'est dessiné, le type et les
  métadonnées sont rendus comme avant.
- **Aucune différence textuelle** — la vue le dit, et ne demande aucun dessin.
- **Le moteur ne peut pas être joint** — la vue rend l'échec à l'endroit du corps, avec son motif.
  Un corps vide laisserait croire à une absence de changement.
- **Un fichier relu porte une séquence terminal** — elle est rendue inerte avant d'atteindre le
  moteur, qui peint ce qu'on lui donne et la laisserait partir au terminal.
- **Le terminal est sous le seuil étroit** — les panneaux alternent comme avant ; prendre son tour
  au lecteur retirerait la seule façon de naviguer.
- **Le paquet installé change de forme** — Preflight refuse : les déclarations écrites à la main ne
  décrivent plus ce qui est installé.

### 7. Interface elements [draft]

- **Gouttière** — barre de changement, numéro de ligne, colonne de signe, séparateur. À gauche du
  séparateur, tout est habillage ; à droite, tout est code.
- **Ligne teintée** — fond discret pour l'ajout et la suppression, une nuance plus vive sur le mot
  qui a changé dans la ligne.
- **Règle** — ouvre et ferme chaque hunk.
- **Ligne de repli** — `… N ligne(s) inchangée(s)`, dans le style atténué de la vue, au-dessus du
  hunk qu'elle allège.
- **Mention de chargement** — pendant que le dessin est en route.
- **Mention d'erreur** — quand le dessin a échoué, avec son motif.

### 8. Domain model [draft]

Aucun concept de domaine n'est ajouté. La page de modifications garde ses segments typés
`unchanged`, `old`, `new` et la table intraligne qu'elle portait ; ce sont eux qui sont traduits en
lignes pour le dessin. La correspondance est une affaire de présentation et vit dans la couche qui
dessine.

### 9. Integrations and boundaries [draft]

Le paquet retenu est atteint depuis la couche de présentation, que la règle de couches autorise. Il
est chargé par un chargeur que le harnais réclame lui-même plutôt que d'espérer que l'hôte en ait
posé un : le charger dépend sinon d'un drapeau que Pi ne pose pas. Le noyau des exigences et des
décisions ne le voit pas.

### 10. Background processes [draft]

Not applicable — le dessin est demandé par un rendu, jamais par une horloge. Il est asynchrone, ce
qui n'en fait pas une tâche de fond : rien ne le déclenche hors d'un regard.

### 11. Notifications [draft]

Not applicable — aucun destinataire hors de la session en cours.

### 12. Audit and logging [draft]

Not applicable — la revue est en lecture seule et n'écrit ni au journal ni au dossier. Ce que le
dessin change n'est vu que du relecteur ; ce que le dossier porte est inchangé.

### 13. Solution variabilities [draft]

- **Repli du contexte** (vue) — replié : les lignes inchangées ne sont pas remises et leur compte est
  annoncé. Déplié : elles sont remises avec leurs numéros.
- **Langue du fichier** (déduite) — du chemin ; inconnue : le texte est dessiné sans coloration.
- **Seuil étroit** (config) — sous le seuil, les panneaux alternent et la vue pleine largeur ne
  s'applique pas.
- **Fork du paquet** (dépendance) — deux scopes publient le même dépôt. Le plus actif est écrit ; le
  changer est un changement de nom, et l'arbitrage appartient au propriétaire.

### 14. Quality attributes *NFR* [draft]

**Le dessin ne contredit pas le dossier.** Les lignes remises sont construites depuis les segments
calculés. Remettre les deux textes au moteur le laissait recomparer, et son appariement n'est pas le
nôtre : une ligne inchangée entre deux lignes changées était dessinée comme supprimée puis rajoutée.
Un dessin qui peut contredire le dossier est un second avis déguisé en premier.

**Coût d'exécution.** Deux dépendances d'exécution là où le paquet n'en avait aucune : environ 17 Mo
et trente-six paquets pour le moteur, dont une bibliothèque native pour une recherche floue
inutilisée, plus 1,8 Mo pour le chargeur. Le premier dessin d'une session paie le chargement ; les
suivants sont gardés sous leur clé.

**Dérive des déclarations.** Le paquet ne publiant pas de déclarations, celles que le compilateur lit
sont écrites à la main. Une redite que rien ne contredit est ce que `D-55` reproche : un contrôle
compile donc les appels de la revue contre le paquet installé, sans le renvoi, et refuse la dérive.

### 15. Security and compliance *NFR* [draft]

**Contenu non fiable.** Les chemins et les lignes viennent du projet relu. Ils sont neutralisés avant
d'atteindre le moteur, qui colore ce qu'on lui donne sans rien inspecter : sans cette précaution, un
fichier du projet peindrait le terminal du relecteur (`UX-10`).

**Redistribution.** Les deux dépendances sont permissives et attribuées au `NOTICE` ; l'arbre
installé reste sous la liste permissive que le contrôle de distribution oppose.

**Aucune exécution du contenu relu.** Le moteur met en forme ; il n'évalue rien de ce qu'il dessine.

### 16. UX and accessibility *NFR* [draft]

**Sans la couleur.** Le signe, le numéro de ligne et la règle distinguent l'ancien du nouveau ; la
teinte est un renfort, jamais le porteur de l'information.

**Largeur.** Le moteur replie ses lignes pour la largeur du terminal qu'il lit lui-même et n'en
accepte aucune de son appelant. La vue des modifications prend donc tout l'écran ; dessinée dans un
panneau, elle serait repliée pour une largeur qu'elle n'a pas et perdrait la fin des lignes longues.

**Glyphes.** Les lignes rendues sont ajustées avec la mesure de l'hôte, qui compte les cellules — un
glyphe est-asiatique en occupe deux, un accent combinant aucune.

### 17. Acceptance criteria [draft]

```gherkin
Scenario: une modification est dessinée en gouttière
  Given un chemin textuel dont la page de modifications est chargée
  When le relecteur ouvre la vue des modifications
  Then le signe et le numéro de ligne sont à gauche du séparateur
  And le code est à droite, avec ses caractères d'origine

Scenario: un plus du programme reste un caractère du programme
  Given une ligne du source qui contient un plus et un moins
  When elle est dessinée
  Then ces caractères sont à droite du séparateur, inchangés

Scenario: le dessin est la comparaison que le harnais a calculée
  Given une ligne inchangée située entre une ligne changée et une ligne ajoutée
  When la modification est dessinée
  Then cette ligne est dessinée une fois, comme contexte, sans signe

Scenario: un repli dit ce qu'il cache
  Given une modification dont le contexte est affiché
  When le relecteur replie le contexte
  Then une ligne annonce combien de lignes inchangées sont cachées
  And un second appui les remet

Scenario: une séquence terminal d'un fichier relu est inerte
  Given un fichier du projet qui contient une séquence d'échappement
  When sa modification est dessinée
  Then la séquence est rendue inerte et ne peint pas le terminal

Scenario: la vue des modifications prend tout l'écran
  Given un terminal plus large que le seuil étroit
  When le relecteur est dans la vue des modifications sur un fichier
  Then l'arbre s'efface et la comparaison occupe toute la largeur
  And tout autre mode ramène les deux panneaux

Scenario: sous le seuil étroit, les panneaux alternent encore
  Given un terminal plus étroit que le seuil
  When le relecteur est dans la vue des modifications
  Then les panneaux alternent comme pour tout autre mode

Scenario: une page non textuelle n'est pas dessinée
  Given un chemin binaire
  When le relecteur ouvre la vue des modifications
  Then le type et les métadonnées sont rendus, et aucune comparaison n'est dessinée

Scenario: une page sans différence le dit
  Given un chemin dont la page ne porte aucun hunk
  When le relecteur ouvre la vue des modifications
  Then la vue annonce l'absence de différence textuelle

Scenario: un dessin qui échoue est visible
  Given un moteur qui ne peut pas être joint
  When le relecteur ouvre la vue des modifications
  Then la vue rend l'échec et son motif à la place du corps

Scenario: le dessin en route est annoncé
  Given une modification dont le dessin n'est pas encore arrivé
  When la vue est rendue
  Then elle porte la mention de chargement

Scenario: des déclarations que le paquet ne tient plus sont refusées
  Given un paquet installé dont une forme a changé
  When Preflight est lancé
  Then le contrôle des déclarations refuse et nomme ce qui ne correspond plus
```

### 18. Out of scope [draft]

- La sortie structurée de la revue garde ses blocs ANCIEN et NOUVEAU : elle n'a pas de couleur et
  sert d'autres entrées ; rien dans cette story ne la touche.
- Le calcul de la comparaison n'est pas rouvert. `D-06` tient : le calcul maison reste la source des
  segments que le dossier, les constats et la sortie structurée portent.
- Les autres capacités du paquet — icônes, coloration hors comparaison, cadres modaux — ne sont pas
  adoptées : le relevé les a examinées et n'a pas trouvé de besoin.
- Le choix entre les deux forks n'est pas arbitré ici.

### 19. Open questions [draft]

- Quel fork retenir, et sur quel critère ? Le plus actif est écrit, faute d'arbitrage.
- La table intraligne de la page de modifications n'est plus lue par personne depuis que le moteur
  calcule son propre relief de mot. Elle est laissée en place parce que la conception la déclare et
  que d'autres entrées peuvent la lire ; faut-il la retirer, et alors de quoi d'autre ?
- Le moteur remplace les tabulations par des espaces à l'affichage. Le source n'est pas touché, mais
  « retrouver exactement les caractères du source » mérite que le propriétaire dise si l'affichage
  est concerné.

### 20. References [draft]

- `specs/adr/D-56` — la comparaison est dessinée par pix-pretty, en gouttière.
- `specs/adr/D-55` — 495 s'appuie sur l'API de Pi avant de reconstruire ou de déduire.
- `specs/adr/D-06` — diff textuel maison, qui reste la source des segments.
- `specs/archive/amont/expression-besoins.md` — `UX-07`, `UX-10`.
- `specs/archive/amont/conception-technique.md` §5.5 — la forme de la comparaison.
- `bench/review-bench.ts` — le banc qui ouvre la revue dans Pi sur un corpus fabriqué.
