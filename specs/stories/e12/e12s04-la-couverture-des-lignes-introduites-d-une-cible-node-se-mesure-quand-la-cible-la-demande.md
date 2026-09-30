# La couverture des lignes introduites d'une cible Node se mesure quand la cible la demande

Story : e12s04
Epic : e12
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire dont la cible Node passe ses tests voit aujourd'hui un changement accepté même quand il
ajoute des lignes qu'aucun test n'exécute : le contrôle de couverture des lignes introduites n'existe que
pour Maven, quand la cible a lié JaCoCo. Sur une cible Node, la non-aggravation de la couverture (`QLT-04`)
n'est pas tenue, et la capacité manquante ne le dit même pas.

Après la story, une cible Node qui demande la couverture reçoit un contrôle qui juge les seules lignes que le
changement introduit, à partir du rapport LCOV que son lanceur écrit : une ligne introduite que la suite
n'exécute jamais bloque, une branche non prise se signale sans bloquer, et une couverture qu'on ne peut pas
lire n'est jamais un succès. Une cible la demande quand `scripts.test` lance `node --test` avec
`--experimental-test-coverage`, ou quand elle a installé le fournisseur de couverture de vitest. Une cible
qui ne la demande pas n'a pas de capteur, et la capacité manquante le dit ; ce qui lui manque est ce que
`e12s05` recommande et `e12s06` et `e12s08` adoptent.

## 2. Promesses

Scenario: Une cible dont scripts.test demande la couverture à node:test reçoit un contrôle de couverture
  Given un package.json dont scripts.test vaut « node --test --experimental-test-coverage »
  When la pile de la cible est détectée
  Then le contrôle unit lance node --test avec la couverture, le rapporteur tap sur la sortie standard et le rapporteur lcov dans le fichier 495-lcov.info
  And il ne déclare en écriture que ce fichier, et le contrôle coverage lit ce fichier avec le lecteur lcov
  And la détection ne déclare aucune capacité manquante pour la couverture

Scenario: Une cible qui ne demande pas la couverture à node:test n'a pas de contrôle de couverture, et le dit
  Given un package.json sans scripts.test, puis un autre dont scripts.test vaut « node --test »
  When la pile de chacun est détectée
  Then le contrôle unit est celui d'aujourd'hui, sans couverture, et aucun contrôle coverage n'est déclaré
  And la capacité manquante dit que la couverture des lignes introduites n'est pas mesurée sur cette cible et que scripts.test ne la demande pas à node:test

Scenario: Une cible vitest dont le fournisseur de couverture est installé reçoit un contrôle de couverture
  Given un package.json dont scripts.test vaut « vitest run » et un node_modules qui porte @vitest/coverage-v8, puis un autre qui porte @vitest/coverage-istanbul
  When la pile de chacun est détectée
  Then le contrôle unit ajoute la couverture avec le fournisseur installé et le rapporteur lcov, écrit sous target/coverage
  And le contrôle coverage lit target/coverage/lcov.info avec le lecteur lcov

Scenario: Une cible vitest sans fournisseur, ou un lanceur dont la couverture n'est pas lue, n'a pas de contrôle de couverture, et le dit
  Given un package.json dont scripts.test vaut « vitest run » sans fournisseur installé, puis un dont scripts.test vaut « jest », puis un dont scripts.test vaut « mocha »
  When la pile de chacun est détectée
  Then aucun contrôle coverage n'est déclaré
  And la capacité manquante de la première nomme @vitest/coverage-v8 comme ce qui la rendrait mesurable
  And celle de la deuxième et de la troisième dit que 495 ne lit pas la couverture de ce lanceur

Scenario: Une ligne introduite que la suite n'exécute jamais bloque, et la dette antérieure ne bloque pas
  Given un rapport LCOV enregistré depuis Node 24.21.0, un autre depuis vitest 5.0.2, et un changement qui introduit trois lignes d'un fichier dont l'une n'est jamais exécutée, alors qu'une autre ligne du même fichier, non introduite, ne l'était pas non plus
  When le contrôle coverage juge le changement
  Then l'évidence dit FAIL avec un constat localisé au fichier et à la ligne non exécutée
  And elle nomme la ligne antérieure non exécutée comme tolérée sans la faire bloquer

Scenario: Une branche non prise d'une ligne introduite se signale sans bloquer
  Given un rapport LCOV dont une ligne introduite est exécutée et porte une branche jamais prise
  When le contrôle coverage juge le changement
  Then l'évidence dit PASS
  And elle porte un constat de gravité majeure localisé à cette ligne

Scenario: Un test, une configuration ou une déclaration de types n'est pas un fichier que le rapport doit citer
  Given un changement qui introduit un fichier sous test/, un vitest.config.ts, un index.d.ts et un fichier .mjs sous src/, et un rapport LCOV qui ne cite que le dernier
  When le contrôle coverage juge le changement
  Then seul le fichier sous src/ est attendu dans le rapport, et l'évidence le juge

Scenario: Une couverture qu'on ne peut pas lire n'est jamais un succès
  Given un changement qui introduit un fichier de code que le rapport ne cite pas, puis un changement dont le rapport est absent, puis un changement dont l'ensemble de lignes introduites est inconnu
  When le contrôle coverage juge chacun
  Then l'évidence dit INDETERMINATE pour chacun, en nommant le fichier que le rapport ne cite pas pour le premier
  And le passage sur la référence, qui n'introduit aucune ligne, est décidé sans chercher de rapport

Scenario: Un chemin de fichier qui forge un enregistrement du rapport n'est pas lu
  Given un changement qui ajoute victim.js dans un dossier dont le nom contient un retour à la ligne suivi de « SF:src », et le rapport LCOV que Node 24.21.0 écrit pour lui, où ce chemin se lit comme deux enregistrements dont le second déclare src/victim.js couvert
  When le contrôle coverage juge le changement
  Then l'évidence dit INDETERMINATE en nommant le chemin qui porte un caractère de contrôle
  And le fichier src/victim.js n'est pas jugé couvert

Scenario: Un commentaire qui masque des lignes de la couverture est un constat bloquant
  Given un changement qui introduit un fichier dont des lignes suivent un commentaire « v8 ignore start », puis un autre avec « istanbul ignore next », puis un autre avec « node:coverage disable », et un fichier antérieur qui portait déjà un tel commentaire
  When le contrôle coverage juge le changement
  Then l'évidence dit FAIL avec un constat localisé au commentaire introduit, pour chacun des trois
  And le commentaire antérieur est nommé comme toléré

Scenario: Les témoins du contrôle de couverture sont un fichier exécuté et un fichier partiellement exécuté
  Given une cible qui demande la couverture à node:test, puis une cible vitest avec son fournisseur
  When la pile de chacune est détectée
  Then le témoin positif ajoute un fichier .mjs que son test appelle en entier, et son test
  And le témoin négatif propre au contrôle coverage ajoute un fichier .mjs que le test charge et dont une fonction n'est jamais appelée

Scenario: Le rapport de couverture s'écrit sous le bac à sable de vérification
  Given le contrôle unit de chaque cible exécuté sous le bac à sable de vérification, avec à la place du lanceur un programme qui écrit le rapport LCOV enregistré à l'endroit déclaré, puis un autre qui l'écrit ailleurs sous la racine de la copie
  When le contrôle coverage lit le rapport
  Then le premier est lu et jugé
  And le second échoue sous le bac à sable

Scenario: Sur une cible node:test et sur une cible vitest, une ligne introduite non couverte est refusée dans un vrai Pi
  Given une cible dont scripts.test vaut « node --test --experimental-test-coverage » et une cible vitest dont le fournisseur v8 est installé, et pour chacune un agent scripté, déclaré comme tel, dont le premier candidat ajoute une fonction sans test et le second la teste
  When chaque changement est conduit dans un vrai Pi
  Then le contrôle coverage refuse le premier candidat en nommant le fichier et la ligne de la fonction, et le second atteint un verdict à G5
  And sur la construction d'avant la story, la même cible n'a pas de contrôle coverage et le premier candidat n'est pas refusé pour cela

## 3. Sécurité

- **Le rapport est écrit par le processus que le projet jugé a lancé, sur des chemins que le candidat a
  choisis.** Le rapporteur lcov de Node 24.21.0 écrit un nom de dossier qui contient un retour à la ligne
  sans l'échapper : `SF:evil` puis `SF:src/victim.js`, suivis des lignes exécutées du fichier de ce dossier,
  que le lecteur attribuerait à `src/victim.js` (mesuré). Un chemin introduit qui porte un caractère de
  contrôle rend le rapport illisible : INDETERMINATE, jamais un succès.
- **Un commentaire de silence retire des lignes du rapport** : `/* v8 ignore start */` et
  `/* node:coverage disable */` ont retiré chacun les lignes de deux fonctions du LCOV (mesuré). Un tel commentaire sur une
  ligne introduite est un constat bloquant : sans lui, le candidat masquerait le code qu'il n'a pas testé
  (`QLT-04` : une annotation de silence exige une justification adoptée, que rien n'adopte encore).
- Chemins protégés : le contrôle coverage protège ce que protège le contrôle unit de son lanceur (les
  dossiers de tests, `package.json`, la configuration de vitest, `node_modules/`). Une exclusion ajoutée à
  la configuration ferait disparaître des lignes du rapport.
- Confinement : sans réseau. Le contrôle unit de node:test n'écrit que `495-lcov.info` ; celui de vitest que
  `target` et le répertoire temporaire de Vite. Le contrôle coverage n'exécute rien.
- Le lanceur, le fournisseur de couverture et `node_modules/` sont ceux de la copie, jamais ceux de l'hôte.

## 4. Tâches

### Tâche 1 — `lcov` est un lecteur différentiel du contrat

`lcov` rejoint les identifiants de lecteur du contrat, avec une version, et parmi les lecteurs
différentiels : il ne juge que les lignes que le changement introduit. `npm run contracts` régénère le
contrat publié.

- Vérifie : `node --test test/v0/contracts.test.ts`
- Tient : `test/v0/contracts.test.ts`, « given a control declaring the lcov parser, then the protocol schema accepts it and the parser is differential »
- Rouge : le schéma du protocole refuse `lcov` comme identifiant de lecteur inconnu, et `isDifferentialParser("lcov")` n'existe pas comme lecteur

### Tâche 2 — Le lecteur juge les lignes introduites

Le lecteur lit un rapport LCOV (enregistrements `SF`, lignes `DA`, branches `BRDA`), rend FAIL avec un constat
localisé pour une ligne introduite jamais exécutée, PASS avec un constat de gravité majeure pour une branche
non prise, nomme comme toléré ce que le changement n'a pas écrit, et fusionne les enregistrements d'un même
fichier.

- Vérifie : `node --test test/v0/lcov.test.ts`
- Tient : `test/v0/lcov.test.ts`, « given recorded LCOV reports and a change introducing three lines one of which is never executed, then the verdict is FAIL with a finding at that file and line and the earlier unexecuted line is named as tolerated », « given an introduced line executed with a branch never taken, then the verdict is PASS with a major finding at that line » et « given a file that appears in two records, then a line executed in either counts as executed »
- Rouge : l'exécuteur n'a pas de lecteur `lcov` : l'évidence du contrôle dit INDETERMINATE avec la note « parser lcov is not qualified », quel que soit le rapport

### Tâche 3 — Ce qui est attendu du rapport, et ce que l'absence veut dire

Le lecteur n'attend dans le rapport que les fichiers de code introduits qui ne sont ni un test, ni une
configuration, ni une déclaration de types ; il rend INDETERMINATE quand un de ceux-là n'est pas cité, quand
le rapport est absent ou l'ensemble de lignes inconnu, et le passage sur la référence est décidé sans
rapport.

- Vérifie : `node --test test/v0/lcov.test.ts`
- Tient : `test/v0/lcov.test.ts`, « given changes introducing a test, a vitest configuration, a declaration file and one source file, then only the source file is expected in the report », « given an introduced source file the report does not cite, an absent report and an unknown introduced set, then each verdict is INDETERMINATE and the first names the file » et « given a reference pass that introduces nothing, then no report is looked for and the verdict is PASS »
- Rouge : sans lecteur `lcov`, l'évidence dit INDETERMINATE avec « parser lcov is not qualified » pour le passage sur la référence, là où la promesse veut PASS

### Tâche 4 — Un chemin qui porte un caractère de contrôle rend le rapport illisible

Un chemin introduit qui contient un caractère de contrôle donne INDETERMINATE, en le nommant, avant toute
lecture des enregistrements.

- Vérifie : `node --test test/v0/lcov.test.ts`
- Tient : `test/v0/lcov.test.ts`, « given the report Node 24.21.0 wrote for a directory whose name embeds a second SF record and a change adding that file, then the verdict is INDETERMINATE naming the path and src/victim.js is not judged covered »
- Rouge : sans lecteur `lcov`, l'évidence dit INDETERMINATE avec la note « parser lcov is not qualified », qui ne nomme aucun chemin

### Tâche 5 — Un commentaire de silence introduit est un constat bloquant

Pour chaque fichier de code introduit, l'exécuteur lit les lignes introduites et rend un constat bloquant,
localisé au commentaire, pour `v8 ignore`, `istanbul ignore`, `c8 ignore` et `node:coverage disable` ou
`ignore` ; un commentaire déjà présent avant le changement est nommé comme toléré.

- Vérifie : `node --test test/v1/lcov-control.test.ts`
- Tient : `test/v1/lcov-control.test.ts`, « given introduced files carrying v8 ignore start, istanbul ignore next and node:coverage disable, then the evidence is FAIL with a blocking finding at each comment, and a comment already present before the change is named as tolerated »
- Rouge : l'exécuteur ne lit aucun fichier source pour la couverture, si bien qu'un fichier introduit sous `/* v8 ignore start */` a ses lignes absentes du rapport et n'est pas jugé

### Tâche 6 — node:test qui demande la couverture reçoit un contrôle de couverture

`detectNodeStack` lit `--experimental-test-coverage` dans `scripts.test`. Le contrôle `unit` de node:test
lance alors `node --test` avec la couverture, le rapporteur tap sur la sortie standard et le rapporteur lcov
dans `495-lcov.info`, fournit ce rapport, ne déclare en écriture que ce fichier ; un contrôle `coverage`
lit ce fichier. Sans le drapeau, la commande et le lecteur de `unit` ne changent pas et la capacité manquante dit pourquoi ; les assertions existantes qui attendent aucune capacité manquante pour une cible node:test sans le drapeau attendent cette note.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given scripts.test is node --test --experimental-test-coverage, then unit writes the lcov report to 495-lcov.info declaring only that file writable, coverage reads it with the lcov parser and no capability is missing for coverage » et « given no scripts.test or node --test, then no coverage control is declared and the missing capability says scripts.test does not ask node:test for coverage »
- Rouge : `detectNodeStack` ne déclare jamais de contrôle `coverage` pour une cible Node, et ne nomme aucune capacité manquante pour la couverture

### Tâche 7 — vitest avec son fournisseur reçoit un contrôle de couverture

Quand `node_modules` porte `@vitest/coverage-v8` ou `@vitest/coverage-istanbul`, le contrôle `unit` de vitest
ajoute la couverture avec ce fournisseur et le rapporteur lcov sous `target/coverage`, et un contrôle
`coverage` lit `target/coverage/lcov.info`. Sans fournisseur, aucun contrôle, et la capacité manquante nomme
`@vitest/coverage-v8`. Jest et mocha n'en ont pas, et la capacité manquante le dit.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a vitest target whose node_modules carries a coverage provider, then unit adds that provider with the lcov reporter under target/coverage and coverage reads target/coverage/lcov.info », « given a vitest target without a provider, then no coverage control is declared and the missing capability names @vitest/coverage-v8 » et « given jest or mocha, then no coverage control is declared and the missing capability says 495 does not read its coverage »
- Rouge : le contrôle `unit` de vitest ne passe aucune option de couverture, et aucune capacité manquante ne nomme un fournisseur

### Tâche 8 — Les témoins d'un capteur de couverture

Quand la couverture est demandée, le témoin positif ajoute un fichier `.mjs` sous `src/witness495/` que son
test appelle entièrement, et le contrôle `coverage` a un témoin négatif propre : un fichier `.mjs` que le
test charge et dont une fonction n'est jamais appelée.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given node:test and vitest targets that ask for coverage, then the positive witness adds a .mjs module called in full and its test, and the coverage control has its own negative witness whose module is loaded with a function never called »
- Rouge : les témoins de l'adaptateur Node n'ajoutent aucun fichier de code et `own_negative_witness` est vide pour une cible Node

### Tâche 9 — Le rapport de couverture s'écrit sous le bac à sable de vérification

Les deux contrôles `unit` écrivent leur rapport LCOV à un endroit que le bac à sable de vérification leur laisse
créer, et le contrôle `coverage` le lit.

- Vérifie : `node --test test/v1/lcov-control.test.ts`
- Tient : `test/v1/lcov-control.test.ts`, « given the derived unit control of each runner run under the verification sandbox against a stand-in that writes the recorded LCOV report at the declared path, then coverage reads and judges it, and a stand-in that writes it elsewhere under the root of the copy fails under the sandbox »
- Rouge : aucun contrôle Node ne déclare de fichier de couverture, si bien que le programme de remplacement ne peut pas écrire son rapport sous le bac à sable et que le contrôle coverage n'existe pas

### Tâche 10 — Le README dit ce que l'adaptateur Node mesure

La ligne « Node » de la table des piles du README dit qu'une cible qui demande la couverture (à node:test par
`--experimental-test-coverage`, ou par le fournisseur de vitest installé) reçoit un contrôle de couverture
des lignes introduites, et que sans cela la couverture n'est pas mesurée.

- Vérifie à la main : lire la ligne « Node » de la table des piles dans `README.md`, puis `npm run lint:distribution`
- Tient : la ligne nomme la couverture des lignes introduites et ce qui la demande
- Rouge : la ligne ne dit rien de la couverture d'une cible Node

## 5. Hors périmètre

- La mutation d'une cible Node : elle demande un moteur (Stryker) que la cible n'a pas, et un profil
  réseau de boucle locale ; elle vient après l'installation d'un framework approuvé (`e12s10`).
- La couverture de jest et de mocha : jest la déclare dans des fichiers de configuration qu'on ne lit pas
  sans les exécuter, mocha passe par un enveloppeur (`c8`) qu'aucun contrôle ne lance. Le refus les nomme.
- Ce que `node:test` et vitest ne cite pas quand la configuration de la cible restreint ce qu'ils
  mesurent (`coverage.include`, `--test-coverage-include`) : le témoin ne serait pas cité et la qualification
  s'arrête en le disant. Un fichier que la suite ne charge jamais est absent du rapport : le lecteur le rend
  INDETERMINATE en le nommant, il ne le juge pas non couvert.
- L'adoption d'un commentaire de silence justifié (`QLT-04`) : aujourd'hui tout commentaire introduit
  bloque ; l'adopter par le propriétaire est une story de `e10`.
- Les branches : une branche non prise se signale sans bloquer, comme pour JaCoCo ; en faire un blocage se
  rouvre avec un seuil que la cible choisit.
- Un rapport dont les chemins sont absolus : les trois lanceurs mesurés écrivent des chemins relatifs à la
  racine du projet.
- L'installation d'un fournisseur de couverture, ou d'un enveloppeur : `e12s08`.
