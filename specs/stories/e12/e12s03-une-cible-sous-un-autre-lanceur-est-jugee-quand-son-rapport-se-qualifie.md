# Une cible dont les tests tournent sous un autre lanceur est jugée quand son rapport se qualifie

Story : e12s03
Epic : e12
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui pointe 495 sur une cible Node dont `scripts.test` lance jest ou mocha voit
aujourd'hui le changement s'arrêter à G2 sur « scripts.test runs jest, whose output 495 cannot read »
(`D-72`). Les tests de sa cible sont pourtant ce que 495 doit analyser : il ne choisit pas le lanceur
d'un projet. Seuls `node --test` et vitest sont lus.

Après la story, une cible dont `scripts.test` vaut `jest` ou `mocha` est jugée par cette commande,
lue par le rapport que le lanceur écrit : le rapport xunit de mocha par le lecteur JUnit qui existe,
le rapport JSON de jest par un lecteur nouveau. Un lanceur n'est pas admis sur son nom : le contrôle
passe la qualification de G2 sur un témoin qui réussit et un témoin qui échoue, écrits dans le
lanceur de la cible, et un rapport qui ne se lit pas ne vaut jamais un succès. Une cible dont
`scripts.test` passe des arguments à un lanceur lu, ou lance un lanceur qui ne l'est pas, est refusée
en le disant.

## 2. Promesses

Scenario: Une cible dont scripts.test vaut mocha reçoit un contrôle unit dérivé de cette déclaration
  Given un package.json dont scripts.test vaut « mocha »
  When la pile de la cible est détectée
  Then le contrôle unit lance le mocha de node_modules de la copie avec le rapporteur xunit, sans passer par le PATH de l'hôte
  And il lit son rapport, écrit sous target/, avec le lecteur JUnit, et ne déclare en écriture que target
  And son titre nomme scripts.test comme provenance de la commande
  And la détection ne déclare aucune capacité manquante pour le test unitaire

Scenario: Une cible dont scripts.test vaut jest reçoit un contrôle unit dérivé de cette déclaration
  Given un package.json dont scripts.test vaut « jest »
  When la pile de la cible est détectée
  Then le contrôle unit lance le jest de node_modules de la copie avec la sortie JSON écrite dans le fichier 495-jest-report.json, sans passer par le PATH de l'hôte
  And il lit ce fichier avec le lecteur jest-json, et ne déclare en écriture que ce fichier
  And son titre nomme scripts.test comme provenance de la commande
  And la détection ne déclare aucune capacité manquante pour le test unitaire

Scenario: Un lanceur lu qui reçoit des arguments, ou un lanceur qu'aucun lecteur ne couvre, est refusé et nommé
  Given un package.json dont scripts.test vaut « jest --ci », puis un autre dont scripts.test vaut « mocha --exit », puis un autre dont scripts.test vaut « ava »
  When la pile de chacun est détectée
  Then aucun contrôle unit n'est déclaré pour aucun des trois
  And la capacité manquante des deux premiers dit que 495 ne lit ce lanceur que lancé sans argument
  And celle du troisième dit que scripts.test lance ava, dont 495 ne sait pas lire la sortie, et que node --test, vitest, mocha et jest sont lus

Scenario: Les témoins de mocha et de jest sont des tests de leur lanceur, dans le dossier de tests de la cible
  Given une cible dont scripts.test vaut mocha, puis une cible dont scripts.test vaut jest, chacune avec un dossier tests/
  When la pile est détectée
  Then chaque témoin positif est un fichier JavaScript sous tests/ écrit avec les globales de son lanceur, qui passe
  And chaque témoin négatif est un fichier du même genre, au même endroit, qui échoue
  And sans dossier tests/, ces fichiers vivent sous test/

Scenario: Les contrôles de mocha et de jest protègent leur configuration et leurs dépendances
  Given une cible mocha et une cible jest
  When la pile de chacune est détectée
  Then le contrôle unit protège les dossiers de tests, package.json et node_modules/
  And celui de mocha protège de plus .mocharc.*, celui de jest de plus jest.config.*

Scenario: Le rapport xunit de mocha se lit comme celui de vitest
  Given la commande dérivée exécutée par l'exécuteur de contrôles avec, à la place de mocha, un programme qui écrit un rapport xunit enregistré depuis mocha 12.0.2
  When le rapport est vert, puis qu'il porte un test en échec que mocha compte sous errors, puis qu'aucun rapport n'est écrit et que le programme sort en erreur
  Then l'évidence du contrôle dit PASS, puis FAIL en nommant le test en échec, puis FAIL en disant que le lanceur est sorti avant d'écrire un rapport

Scenario: Le rapport JSON de jest donne PASS, FAIL ou INDETERMINATE selon ce que jest a écrit
  Given la commande dérivée exécutée par l'exécuteur de contrôles avec, à la place de jest, un programme qui écrit un rapport JSON enregistré depuis jest 30.5.2
  When le rapport est vert, puis qu'il porte un test en échec, puis qu'il porte une suite qui n'a pas pu se charger, puis un test ignoré, puis un test todo, puis aucun test, puis qu'il est vert alors que le programme sort en erreur
  Then l'évidence dit PASS, puis FAIL en nommant le test en échec, puis FAIL en nommant le fichier de la suite, puis INDETERMINATE, puis INDETERMINATE, puis INDETERMINATE, puis FAIL en disant que le lanceur est sorti en erreur hors des tests qui ont tourné

Scenario: Un rapport jest illisible ou absent n'est jamais un succès
  Given la commande dérivée de jest exécutée avec un programme qui écrit un fichier tronqué, puis un programme qui n'écrit rien
  When le programme sort avec le code 0, puis avec le code 1
  Then l'évidence dit INDETERMINATE pour le code 0 dans les deux cas
  And elle dit FAIL pour le code 1 dans les deux cas, en disant que le lanceur est sorti avant d'écrire un rapport lisible

Scenario: Le rapport de jest s'écrit sous le bac à sable de vérification et ne dépend pas de la sortie standard
  Given la commande dérivée de jest exécutée sous le bac à sable de vérification, avec à la place de jest un programme qui écrit une ligne parasite sur la sortie standard puis le rapport JSON vert dans le fichier déclaré
  When l'exécuteur lit le rapport
  Then l'évidence du contrôle dit PASS
  And un programme qui tente d'écrire ce rapport ailleurs sous la racine de la copie échoue sous le bac à sable

Scenario: Un fichier que le contrôle a déclaré inscriptible n'est pas une modification du candidat
  Given un contrôle qui déclare en écriture le fichier 495-jest-report.json, et un candidat observé après que ce contrôle a écrit ce fichier à la racine de la copie
  When le noyau compare le candidat observé au candidat gelé
  Then le candidat n'est pas déplacé
  And un autre fichier ajouté à la racine par le même contrôle le déplace

Scenario: Avec un vrai modèle, une cible en mocha et une cible en jest passent G2 et le changement va au bout
  Given une cible dont scripts.test vaut « mocha » et une cible dont scripts.test vaut « jest », dépendances installées, et une demande de changement pour chacune
  When chaque changement est conduit dans un vrai Pi avec un vrai modèle
  Then le contrôle unit franchit G2 sur ses deux témoins et le changement atteint un verdict à G5
  And sur la construction d'avant la story, le même changement s'arrête à G2 en disant que scripts.test lance mocha ou jest, dont 495 ne sait pas lire la sortie

## 3. Sécurité

- Chemins protégés : le contrôle unit de mocha protège, comme celui de vitest, les dossiers de tests,
  `package.json`, `node_modules/` et sa configuration (`.mocharc.*`) ; celui de jest, `jest.config.*`.
  Un candidat qui restreindrait les fichiers que le lanceur découvre, ou ajouterait un rapporteur ou un
  transformateur, rendrait la suite verte sans qu'elle prouve rien.
- Confinement : les contrôles tournent sans réseau. Celui de mocha n'écrit que `target/`, celui de jest
  que le fichier `495-jest-report.json` ; rien d'autre n'est ouvert en écriture.
- Résolution du binaire : mocha et jest se lancent depuis `node_modules` de la copie, jamais depuis le
  PATH de l'hôte, si bien que le contrôle juge la version que la cible a installée.
- Provenance du verdict : le rapport de jest est lu dans un fichier, pas sur la sortie standard. Un test
  ou un code testé qui écrit sur la sortie standard s'y insère avant le JSON ; le fichier est ce que
  jest écrit lui-même.
- Un rapport que le lecteur ne sait pas lire, tronqué ou absent, n'est jamais un succès.

## 4. Tâches

### Tâche 1 — scripts.test qui lance mocha devient le contrôle unit

`detectNodeStack` lit `scripts.test`. Quand la commande est `mocha`, le contrôle `unit` lance le mocha
de `node_modules` de la copie avec le rapporteur xunit, écrit son rapport sous `target/`, le fait lire
par le lecteur JUnit, porte la provenance dans son titre, et ne déclare en écriture que `target`.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a package.json whose scripts.test is mocha, when the stack is detected, then unit runs the mocha of node_modules with the xunit reporter, reads its report with the JUnit parser, declares only target writable and names scripts.test in its title »
- Rouge : `detectNodeStack` refuse `mocha` en disant que sa sortie ne se lit pas, ne déclare aucun contrôle `unit` et remplit la capacité manquante

### Tâche 2 — Le rapport xunit de mocha se lit

Le contrôle dérivé, exécuté par l'exécuteur de contrôles contre un programme de remplacement qui écrit
les rapports xunit enregistrés depuis mocha 12.0.2 (vert, en échec compté sous `errors`, absent avec
une sortie en erreur), rend PASS, FAIL nommant le test, FAIL nommant la sortie avant rapport.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given the derived mocha control run against a recorded mocha report, then the evidence is PASS for a green report, FAIL naming the failed case when mocha counts it under errors, and FAIL saying the runner exited before writing a report when none is written »
- Rouge : la détection ne dérive aucun contrôle mocha, si bien que le test ne trouve pas de contrôle `unit` à exécuter et que le programme de remplacement n'est jamais lancé

### Tâche 3 — Le lecteur jest-json est un identifiant de lecteur du contrat

`jest-json` rejoint les identifiants de lecteur du contrat, avec une version : un contrôle qui le déclare
est accepté par le schéma, et `npm run contracts` régénère le contrat publié. La lecture elle-même est
la tâche 5.

- Vérifie : `node --test test/v0/contracts.test.ts`
- Tient : `test/v0/contracts.test.ts`, « given a control declaring the jest-json parser, then the protocol schema accepts it, and a control declaring a parser no reader covers is still refused »
- Rouge : le schéma du protocole refuse `jest-json` comme identifiant de lecteur inconnu

### Tâche 4 — scripts.test qui lance jest devient le contrôle unit

Quand `scripts.test` est `jest`, le contrôle `unit` lance le jest de `node_modules` de la copie avec la
sortie JSON écrite dans `495-jest-report.json`, la lit avec le lecteur `jest-json`, porte la provenance
dans son titre, et ne déclare en écriture que ce fichier.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a package.json whose scripts.test is jest, when the stack is detected, then unit runs the jest of node_modules writing its JSON report to 495-jest-report.json, reads it with the jest-json parser, declares only that file writable and names scripts.test in its title »
- Rouge : `detectNodeStack` refuse `jest` en disant que sa sortie ne se lit pas, ne déclare aucun contrôle `unit` et remplit la capacité manquante

### Tâche 5 — L'exécuteur lit ce que jest écrit

Le contrôle dérivé, exécuté contre un programme de remplacement qui écrit les rapports JSON enregistrés
depuis jest 30.5.2, rend PASS, FAIL nommant le test ou le fichier de la suite, INDETERMINATE pour un
test ignoré, un test todo ou aucun test, et FAIL quand un rapport vert accompagne une sortie en erreur.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given the derived jest control run against recorded jest reports, then the evidence is PASS for a green report, FAIL naming the failed case, FAIL naming the file of a suite that did not load, INDETERMINATE for a skipped test, a todo test and an empty run, and FAIL when a green report comes with an exit in error »
- Rouge : l'exécuteur n'a pas de lecteur `jest-json` : l'évidence du contrôle dit INDETERMINATE avec la note « parser jest-json is not qualified », quel que soit le rapport

### Tâche 6 — Un rapport jest illisible ou absent n'est jamais un succès

Un fichier tronqué ou absent donne INDETERMINATE quand le programme sort avec le code 0, et FAIL en
disant que le lanceur est sorti avant d'écrire un rapport lisible quand il sort en erreur.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given a truncated or absent jest report, then the evidence is INDETERMINATE when the runner exits 0 and FAIL saying it exited before writing a readable report when it exits with an error »
- Rouge : sans lecteur `jest-json`, l'évidence dit INDETERMINATE pour la sortie en erreur, là où la promesse veut FAIL

### Tâche 7 — Le rapport de jest s'écrit sous le bac à sable, hors de la sortie standard

Le contrôle de jest déclare en écriture le fichier de son rapport, et lit ce fichier, jamais la sortie
standard.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given the derived jest control run under the verification sandbox against a stand-in that prints a stray line on stdout before writing a green report to the declared file, then the verdict is PASS, and a stand-in that writes the report elsewhere under the root of the copy fails under the sandbox »
- Rouge : le fichier n'est déclaré par aucun contrôle, si bien que le programme de remplacement ne peut pas l'écrire sous le bac à sable et que le verdict n'est pas PASS

### Tâche 8 — Un fichier déclaré inscriptible n'est pas une modification du candidat

Le noyau laisse hors des deux côtés de la comparaison un chemin déclaré inscriptible qui nomme un fichier,
comme il le fait pour un dossier.

- Vérifie : `node --test test/v0/candidate.test.ts`
- Tient : `test/v0/candidate.test.ts`, « given a control declaring a file writable, when a candidate is observed after that file was written at the root, then the candidate is not moved, and a different added file moves it »
- Rouge : `candidateMoved` range le fichier écrit parmi les différences, parce qu'un chemin déclaré sans barre finale n'est lu que comme un dossier, et rend `true`

### Tâche 9 — Les témoins de mocha et de jest sont des tests de leur lanceur

Pour une cible mocha ou jest, le témoin positif et le témoin négatif sont des fichiers JavaScript écrits
avec les seules globales du lanceur, sans import, placés dans le dossier de tests de la cible (`tests/`
s'il existe, sinon `test/`).

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a mocha target and a jest target with a tests/ directory, then the witnesses are JavaScript files under tests/ using only the globals of the runner, the positive one passing and the negative one failing, and under test/ when there is no tests/ »
- Rouge : sans contrôle mocha ni jest, les témoins de l'adaptateur Node sont ceux de `node --test`, qui importent `node:test` et vivent sous `test/`

### Tâche 10 — Les contrôles de mocha et de jest protègent leur configuration

Le contrôle `unit` de mocha ajoute `.mocharc.*` et `node_modules/` à ses chemins protégés, celui de jest
`jest.config.*` et `node_modules/`.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a mocha target and a jest target, then their unit control protects the test directories, package.json and node_modules/, and adds .mocharc.* for mocha and jest.config.* for jest »
- Rouge : aucun contrôle mocha ni jest n'existe ; les chemins protégés du contrôle `unit` d'une cible Node en `node --test` ne nomment ni `.mocharc.*` ni `jest.config.*`

### Tâche 11 — Un lanceur lu avec des arguments, ou non lu, est refusé et nommé

Un lanceur lu (vitest, mocha, jest) qui reçoit des arguments est refusé en disant qu'il n'est lu que lancé
sans argument ; tout autre lanceur est refusé en nommant les quatre qui sont lus. Les deux tests de
l'adaptateur Node qui prennent jest pour le lanceur non lu prennent ava.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given scripts.test is jest --ci or mocha --exit, then no unit control is declared and the missing capability says the runner is read only without arguments » et « given scripts.test is ava, then no unit control is declared and the missing capability says node --test, vitest, mocha and jest are read »
- Rouge : `jest --ci` est refusé avec « whose output 495 cannot read: only node --test and vitest [run] are read », qui dit que jest ne se lit pas alors que la story le lit, et ne parle ni de mocha ni d'arguments

### Tâche 12 — Le README dit ce que l'adaptateur Node lit

La ligne « Node » de la table des piles du README dit que `scripts.test` lancé par `node --test`, `vitest`,
`mocha` ou `jest`, sans argument, est lu, chacun par son rapport, et que tout autre lanceur est refusé en
étant nommé.

- Vérifie à la main : lire la ligne « Node » de la table des piles dans `README.md`, puis `npm run lint:distribution`
- Tient : la ligne nomme mocha et jest et dit que les arguments d'un lanceur ne sont pas lus
- Rouge : la ligne dit que `scripts.test` lancé par `node --test` ou par `vitest` est lu et que tout autre lanceur est refusé

## 5. Hors périmètre

- Les arguments de mocha et de jest (`--ci`, `--exit`, un chemin de tests, `--runInBand`) : une option peut
  choisir un autre rapporteur ou un autre ensemble de tests, et chaque option admise doit d'abord
  montrer qu'elle ne change pas ce que le rapport dit. Elles se rouvrent sur la première cible qui en
  dépend ; le refus nomme la forme.
- Les autres lanceurs (ava, tap, playwright…) : chacun est un lecteur à qualifier sur son rapport. Le
  refus les nomme.
- Les versions mesurées sont mocha 12.0.2 et jest 30.5.2. Le chemin du binaire d'un mocha plus ancien
  (`bin/mocha` sans `.js` avant la 9) n'est pas lu.
- Une configuration de lanceur qui ne découvre que d'autres fichiers (des tests TypeScript seulement, un
  autre dossier) : le témoin JavaScript sous `tests/` ou `test/` n'est pas exécuté et le changement
  s'arrête à G2 sur le témoin positif, comme vitest. Un jest configuré avec ses propres `reporters` ou un
  `testResultsProcessor` n'est pas mesuré : un fichier illisible donne INDETERMINATE, jamais un succès.
- Une cible dont les dépendances ne sont pas installées : G2 s'arrête sur le témoin positif. Le refus
  clair de ce cas se rouvre avec l'installation d'un framework (`e12s06`).
- La couverture d'une cible Node : `e12s04` ; sa mutation et la mesure des assertions : `e12s07`.
- Les mêmes lanceurs sous un shell, `npm test` ou une chaîne (`tsc && jest`) : refusés en nommant leur
  forme, comme aujourd'hui.
