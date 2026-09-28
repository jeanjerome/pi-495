# Le cycle de développement de 495

Ce répertoire porte la façon dont un changement de 495 est fait : les six pas, les règles de
relecture et de versement, le format de story, et l'outil qui conduit le tout. Il ne dit rien du
produit. Ce que 495 est, ce qui lui reste à faire et ce qu'il a prouvé vivent dans `specs/`.

Le cycle ne dépend d'aucun paquet extérieur. Il a remplacé le 2026-09-28 les skills bigpowers et le
script qui les enchaînait, après mesure : une story de 3 900 lignes coûtait 5 h d'agent et 88 $, et
le cycle de correction de ses quatre défauts 7 h et 105 $, arrêté à un plafond de cinq tours de
relecture. Plus de la moitié du temps allait à des relecteurs qui rejouaient des mutations à la
main et trouvaient à chaque tour un autre coin de la machine à états ; par story, mille lignes de
relevés étaient écrites à la main et relues par chaque session ; sur tout `specs/`, un seul fichier
de suivi était lu par un contrôle.

## Les six pas

Une story part d'une branche de `main`, sur une Preflight verte, et y revient en un commit.

1. **La story.** Écrite avec le propriétaire au format de `format-de-story.md` : ce que le lecteur
   gagne, les promesses en scénarios, la sécurité, les tâches, le hors-périmètre. Chaque tâche dit
   la commande qui la tient, écrite rouge parce qu'elle nomme un test qui n'existe pas encore, le
   test et son assertion dans les mots de la story, et ce que le code fait aujourd'hui qui la fait
   échouer. Ce qui exige une main s'écrit comme tel. `scripts/check-story-format.ts` refuse une
   story qui manque à cette forme.
2. **Le rouge-vert.** Tâche par tâche : le test d'abord, son rouge vu sur l'assertion annoncée, un
   commit de test seul, puis le code et un commit vert. Un fichier absent, une erreur d'import ou de
   type, ou un rouge obtenu en mettant du code de côté n'est pas ce rouge. L'outil rejoue chaque
   commit de test seul dans un arbre détaché et lit quels tests échouent, pas seulement le code de
   sortie. Le pas finit sur une Preflight verte.
3. **L'autocontrôle.** Une relecture du diff de la branche contre les standards de
   `CONVENTIONS.md`, avec la liste de `prompts/autocontrole.md` : périmètre tenu, code mort, types,
   un test par fonction, une seule responsabilité, noms uniques. Ce qu'il trouve se corrige sur la
   branche avant la relecture.
4. **La relecture.** Deux relecteurs neufs, sans contexte commun, en parallèle, chacun dans sa copie
   de l'arbre. Le premier tour relit la branche contre `main` ; le second, le diff depuis la révision
   relue et les constats déjà traités. Il n'y a pas de troisième tour.
5. **La recette.** Une exécution réelle : l'extension chargée depuis `dist/` dans un vrai Pi, un
   modèle réel ou un agent scripté déclaré comme tel, une campagne menée jusqu'à son verdict, puis
   le dossier relu depuis SQLite et le magasin d'objets. Un contrôle négatif accompagne la campagne
   verte : la même configuration privée de ce que la story ajoute, et le refus qu'elle produit. Une
   liste adossée à des tests n'est pas une recette. Le propriétaire accepte, ou nomme l'écart.
6. **Le versement.** La branche arrive sur `main` en un commit écrasé, dont le message dit le
   comportement obtenu, en anglais, sur une ligne. La branche est gardée : le dossier cite ses
   commits. Le dossier de la story est exporté sous `specs/verifications/<story>/`, la story passe
   `versée`, et rien n'est poussé : le push est au propriétaire.

Un écart trouvé à la recette retourne au pas 2 pour l'écart seul, puis à un tour de relecture sur
son diff, puis à la recette.

## La relecture

Ce que les relecteurs vérifient : les promesses de la story, et rien d'autre. Pour chaque scénario,
le code le tient-il, et un test le tient-il, qu'une mutation d'une ligne qui tient la promesse doit
faire échouer. Une promesse que le code ne tient pas est bloquante ; une promesse qu'aucun test ne
tient est à corriger. Les conventions, la conception et les odeurs reviennent à l'autocontrôle, qui
passe avant. La consigne ne propose aux relecteurs ni scénario, ni état, ni entrelacement de son
cru : un défaut sur un chemin qu'aucune promesse ne couvre sera trouvé par la recette, par l'usage
ou par la story qui en fera la promesse.

Un constat est situé avant d'être traité. Un défaut que la branche introduit ou rend atteignable
lui appartient, même si la ligne fautive la précède ; un défaut qu'elle n'introduit ni ne rend
atteignable va au registre et ne retient pas la relecture.

La réponse à un tour corrige ce qui est bloquant ou à corriger. Une suggestion dont la correction
n'ajoute aucun comportement se corrige dans le tour ; une suggestion dont la correction ajouterait un
refus, un état ou un mécanisme va au registre. Une correction qui ajoute un mécanisme est conçue
avant d'être posée : où l'état naît, qui le lit, combien d'entrées y mènent ; retirer une seconde
entrée vaut mieux que la garder. Un constat qui ne touche que du texte se corrige sans être relu par
des relecteurs neufs : le coordinateur vérifie la correction contre son constat.

La porte se ferme sans pourcentage. Après le second tour, ce qui reste va au registre
`specs/bugs/registry.yaml`, nommé comme introduit par la branche quand il l'est, sauf une promesse
que le code ne tient pas, qui est présentée au propriétaire : il décide du versement ou d'un
correctif, qui repasse par le pas 2 et un tour sur son diff.

Les relevés ne bougent pas pendant la relecture. La révision, les horodatages et le nombre de tests
d'un dossier sont posés quand la porte passe. Un relevé en retard sur la révision relue n'est pas un
constat, pas plus que le sujet d'un commit de la branche, qui n'atteint jamais `main`.

## Preflight et défauts découverts

Preflight est `npm run check`. Elle est verte avant tout pas, et avant tout commit qui touche
`src/`, `test/`, `scripts/`, `bench/`, `contracts/`, `README.md`, `NOTICE`, `LICENSE`,
`package.json`, `package-lock.json`, un `tsconfig*.json` ou `biome.json`. Une story sous
`specs/stories/` appelle `npm run lint:story-format` ; un fichier de l'archive appelle le contrôle
qui le lit. Une Preflight verte tient tant qu'aucun fichier de la première liste n'a changé : citer
sa révision et son heure plutôt que la relancer. Seule compte une exécution sous Node 24.

Un échec reproductible rencontré en chemin est un défaut découvert, jamais un bruit de fond. Il se
corrige tout de suite, dans son propre commit, avec son test de non-régression, quand la correction
n'ajoute aucun comportement ; sinon il reçoit une fiche `specs/bugs/BUG-*.md` et son propre cycle.
Il ne s'inscrit sans correction que si sa reproduction échoue après un essai de bonne foi. « Déjà là
avant », « sans rapport avec la session », « hors périmètre » ne sont pas des réponses.

## Git et commits

Une branche par story ou par cycle de correction. Message de commit : `<type>: <description>`, une
ligne, en anglais, quelle que soit la langue de la session ou du fichier changé ; les types sont
`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`. Le message dit le comportement
obtenu, jamais le processus qui l'a produit : ni chantier, ni tour de relecture, ni attribution, ni
`Co-Authored-By`. Rien n'est poussé par un automate ; `gh` pour toute opération GitHub, jamais l'API
directement ; aucune issue créée par un automate.

## Ce qui s'écrit à la main, et ce qui s'observe

À la main : la story, une décision du produit dans `specs/adr/`, une entrée du registre des défauts,
l'ordre du travail dans `specs/plan.yaml`. Tout le reste est observé et inscrit par l'outil au moment
où il l'observe : un rouge et son message, une Preflight et sa révision, un tour de relecture et ses
constats, la recette et l'accord du propriétaire, le versement. Une preuve s'écrit une fois, dans le
dossier du pas qui l'a produite ; ailleurs on la cite. Une copie dérive du code qu'elle décrit.

## L'outil

`npm run cycle -- <story>` conduit les pas qui restent, dans l'ordre, jusqu'à ce qu'un pas ait
besoin du propriétaire ou bloque ; `npm run cycle -- <story> etat` dit où elle en est ;
`npm run cycle -- <story> accepte [note]` inscrit l'accord après la recette ;
`npm run cycle -- <story> ecart "<ce qui manque>"` la renvoie au rouge-vert pour l'écart nommé, avec
un seul tour de relecture sur son diff. Le dossier vit sous `~/.495/cycle/<story>/` pendant la story
(`CYCLE_495_DIR` le déplace).

L'outil dépend de 495 et jamais l'inverse. Il reprend du noyau le magasin d'objets, où vont les
transcriptions, les sorties des contrôles et les rapports des relecteurs ; l'exécuteur de contrôles
et ses lecteurs de rapports, par lesquels passent Preflight, la commande de chaque tâche et le rejeu
de chaque rouge ; et la forme des preuves. Les contrôles tournent sans confinement, et chaque preuve
le dit : la suite de ce dépôt qualifie Seatbelt elle-même, et un bac à sable ne s'emboîte pas.

Les pas qui demandent un modèle tournent dans des sessions Claude Code, une par pas, lancées sans
tâche de fond ni question possible, avec une sortie structurée que l'outil lit : le rouge-vert,
l'autocontrôle, les deux relecteurs de chaque tour en parallèle dans leur arbre détaché, la réponse,
la recette, le message du versement. Leurs invites sont dans `prompts/`. La story, elle, s'écrit
avec le propriétaire, dans une session ordinaire.

Ce que l'outil vérifie lui-même, sans croire la session : chaque commit de test seul rejoué dans un
arbre détaché échoue sur un test lu, chaque commande de tâche passe sur la tête de la branche,
Preflight est verte à la révision citée, la relecture s'arrête à deux tours, la branche arrive sur
`main` en un commit, le dossier est exporté au versement.

Ce qui manque encore : la mutation sur les lignes introduites pour une cible Node, que les
relecteurs font à la main, et le worker Pi confiné de 495 à la place des sessions Claude Code.
