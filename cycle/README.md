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
   commit de test seul de la passe dans un arbre détaché et lit quels tests échouent, pas seulement
   le code de sortie. Un test qu'un pas ultérieur ajoute, déjà vert parce que le code tient la
   promesse, n'est pas un commit du passage. Le pas finit sur une Preflight verte.
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
   liste adossée à des tests n'est pas une recette. Une story qui touche `src/application/stacks/`, les
   contrôles ou l'exécuteur ajoute à la recette les deux campagnes de référence de `cycle/campagnes/`
   (`npm run campagne -- npm` et `-- maven`), qui n'ont pas été taillées pour elle ; elles se lancent
   aussi avant toute release. Le propriétaire accepte, ou nomme l'écart.
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

À la main : une décision du produit dans `specs/adr/`, et l'ordre du travail dans `specs/plan.yaml`,
où le propriétaire marque `prete: oui` les epics qui se déroulent sans lui. La story et l'entrée du
registre s'écrivent à la main quand le propriétaire conduit la story lui-même ; dans une suite sans
lui, une session les écrit sous les règles de ce fichier. Tout le reste est observé et inscrit par
l'outil au moment où il l'observe : un rouge et son message, une Preflight et sa révision, un tour de relecture et ses
constats, la recette et l'accord du propriétaire, le versement. Une preuve s'écrit une fois, dans le
dossier du pas qui l'a produite ; ailleurs on la cite. Une copie dérive du code qu'elle décrit.

## Le cycle sans le propriétaire

`npm run cycle -- suite` déroule, l'une après l'autre, les epics que `specs/plan.yaml` marque
`prete: oui`, dans l'ordre du plan. Pour chacune : la prochaine story du plan est écrite par une
session quand aucune n'est listée à faire, elle est conduite jusqu'au versement comme ci-dessus, le
plan la marque versée, et l'epic passe à `versé` quand une session constate que ses stories livrent
son objet. La suite part de `main` avec un arbre propre et s'arrête au premier blocage, en disant
pourquoi ; elle ne pousse jamais. `npm run cycle -- <story> auto` fait de même pour une seule
story.

Trois réponses du propriétaire sont déléguées, chacune un acte inscrit au dossier :

- **L'accord après la recette.** Une session neuve, qui n'a conduit ni la recette ni la relecture,
  lit la story, le compte rendu de la recette et les défauts que la branche inscrit au registre, puis
  décide `accepte` ou `ecart` (`prompts/arbitrage.md`). Un écart est celui d'une promesse écrite ou
  d'une garantie de sécurité non tenue, d'un cas que le code d'avant arrêtait et que la branche laisse
  passer, ou d'un défaut de la branche qui affaiblit une garantie de la story ; sinon l'accord
  emporte une note qui nomme ce qui reste au registre et ce que la recette n'a pas exercé. Une
  question de produit que la story ne tranche pas se règle par le comportement qui arrête. La décision
  est inscrite avec `origine: automate`.
- **L'écart.** Que l'arbitrage le nomme ou que la recette le rouvre, une session l'écrit dans la story
  (un scénario, la phrase de sécurité, une tâche dont le rouge se vérifie dans le code) et le
  commite avant que le rouge-vert reparte : sans promesse écrite, la relecture ne juge pas le
  correctif. L'outil relit la story, exige qu'elle ait gagné un scénario ou une tâche et que l'arbre
  soit propre.
- **Une promesse que la relecture n'a pas fait tenir.** Elle retourne au rouge-vert : elle n'était pas
  au propriétaire de la lever.

**Les défauts du registre** se corrigent aussi, au bon moment (`D-73`) : à la fin de chaque epic, avant
la suivante, ceux de gravité moyenne ou haute ; à la fin de la suite, les faibles. Une session choisit
le premier défaut ouvert qui ne demande aucune décision de produit, écrit sa story de correction sous
l'epic `e28` (que le plan ne marque jamais prête) en citant l'entrée du registre, et l'outil la conduit
par les six pas ; au versement, l'entrée passe du registre à `specs/bugs/registry-fixed.yaml`, marquée corrigée à la révision livrée. Les défauts que la
session écarte parce qu'ils demandent le propriétaire sont nommés à la fin de la suite, avec la
raison, sans l'arrêter. Une phase corrige au plus `CYCLE_495_DEFAUTS_MAX` défauts (5 par défaut) ;
`npm run cycle -- defauts [gravité]` lance cette phase seule.

La suite s'arrête, et rend la main, quand une story est retournée au rouge-vert trois fois, quand elle
a dépensé plus que `CYCLE_495_PLAFOND_USD` (80 $ par défaut), quand une session ne rend pas sa
sortie, ou quand un pas bloque : un défaut de l'outil lui-même, un test qui ne peut pas être rouge,
une Preflight rouge. La rédaction d'une story s'arrête de même sur ce qu'elle ne peut pas écrire sans
choisir à la place du propriétaire (`bloque`, avec le choix nommé), et une epic sans première story
possible reste à lui.

## Les reprises

Une reprise ne change aucun comportement : mêmes événements, mêmes artefacts, mêmes verdicts, mêmes
refus, mêmes contrats, mêmes textes destinés au propriétaire ou au modèle. Elle n'a ni promesse à
relire, ni rouge à voir, ni rien à montrer en recette ; elle ne passe donc pas par les six pas, et
prend le chemin court de `D-80`. Ce qui change un comportement, même peu, est une story.

Les reprises sont écrites dans `specs/reprises.md`, une section par reprise, dans l'ordre où elles se
font. `npm run cycle -- reprises` les conduit l'une après l'autre, depuis `main` et un arbre propre :

1. Preflight est verte sur `main`, après reconstruction de `dist/`, et l'outil lit son nombre de tests.
2. Une session fait la reprise sur la branche `reprise-<id>` (`prompts/reprise.md`). Elle peut
   l'écarter, avec la raison, quand la reprise changerait un comportement ou que le code la dément :
   l'outil l'écrit dans la liste, commite, et passe à la suivante.
3. L'outil vérifie, sans croire la session : un commit au moins, un arbre propre, la liste intacte,
   aucune ligne d'assertion de `test/` retirée sans revenir à l'identique, Preflight verte après
   reconstruction de `dist/`, et pas moins de tests qu'avant.
4. Une session neuve relit le diff dans une copie détachée (`prompts/reprise-relecture.md`) et dit si
   un comportement change ou si le diff déborde de la reprise. Il n'y a pas de second tour.
5. La branche arrive sur `main` en un commit, qui marque la reprise `versée` dans la liste ; la branche
   est supprimée, le journal de `~/.495/cycle/<id>/` garde les transcriptions.

La course s'arrête, et rend la main, à la première vérification qui échoue ou à la relecture qui voit
un changement : la branche reste extraite pour qu'on la lise, `main` et la liste ne bougent pas. On
reprend en revenant sur `main` (`git checkout main`) : la course suivante repart la même reprise d'une
branche neuve, ou on l'écarte à la main dans la liste avec la raison. Quand la relecture refuse ce que la
reprise elle-même demande, relancer rejoue le même refus : on réduit la reprise à sa part constante, en
disant dans `Limite` ce qu'elle ne fait pas, et le reste va au registre ou à une story. `CYCLE_495_REPRISES_MAX` borne le
nombre de reprises d'une course. Rien n'est poussé.

## L'outil

`npm run cycle -- <story>` conduit les pas qui restent, dans l'ordre, jusqu'à ce qu'un pas ait
besoin du propriétaire ou bloque ; `npm run cycle -- <story> etat` dit où elle en est ;
`npm run cycle -- <story> suivre` suit, depuis un autre terminal, la story qui tourne ;
`npm run cycle -- suite` déroule les epics marquées prêtes, sans le propriétaire ;
`npm run cycle -- defauts [gravité]` corrige les défauts ouverts du registre, sans dérouler d'epic ;
`npm run cycle -- reprises` conduit les reprises à comportement constant de `specs/reprises.md` ;
`npm run cycle -- <story> auto` conduit une story de même ;
`npm run cycle -- <story> accepte [note]` inscrit l'accord après la recette ;
`npm run cycle -- <story> ecart "<ce qui manque>"` la renvoie au rouge-vert pour l'écart nommé, avec
un seul tour de relecture sur son diff. Le dossier vit sous `~/.495/cycle/<story>/` pendant la story
(`CYCLE_495_DIR` le déplace).

Pendant qu'elle tourne, la commande montre au terminal où en est la story : chaque pas s'ouvre sur
sa place parmi les six, avec le temps et le coût déjà engagés ; chaque session déroule une ligne par
texte de l'agent, appel d'outil, commit, total de tests ou appel en échec, préfixée de son nom quand
deux relecteurs tournent ensemble ; chaque contrôle dit quand il part et comment il finit ; chaque pas
se ferme sur son issue, sa durée, son coût et ses commits. Le titre du terminal nomme le pas en cours
et depuis combien de temps rien ne s'est affiché. Un son et une notification disent qu'un pas attend
le propriétaire, qu'il bloque ou que la story est versée (`CYCLE_495_SON` change le son). Les mêmes
lignes vont dans `en-direct.log`, dans le dossier de la story, que `npm run cycle -- <story> suivre`
suit depuis un autre terminal jusqu'à Ctrl-C ; un nouveau lancement vide ce fichier. Rien de cet
affichage n'est une preuve : le journal et les transcriptions gardées le sont.

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

Ce que l'outil vérifie lui-même, sans croire la session : chaque commit de test seul de la passe,
rejoué dans un arbre détaché, échoue sur un test lu, chaque commande de tâche passe sur la tête de la branche,
Preflight est verte à la révision citée, la relecture s'arrête à deux tours, la branche arrive sur
`main` en un commit, le dossier est exporté au versement.

Ce qui manque encore : la mutation sur les lignes introduites pour une cible Node, que les
relecteurs font à la main, et le worker Pi confiné de 495 à la place des sessions Claude Code.
