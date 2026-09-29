# Une cible Node en vitest est jugée par sa propre commande de test

Story : e05s01
Epic : e05
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire qui pointe 495 sur une cible Node dont la suite se lance par vitest voit aujourd'hui
le changement s'arrêter à G2 sur « positive witness gave FAIL: tests/agenda.test.ts », comme si les
tests de sa cible étaient en cause. Ils ne le sont pas : le contrôle `unit` de l'adaptateur Node est
toujours `node --test`, sans lire `scripts.test`, et la copie de travail retire le `dist/` de chaque
dépendance installée, si bien que `vitest` lui-même ne se charge plus (`ERR_MODULE_NOT_FOUND ...
node_modules/vitest/dist/index.js`). La cible `node-demo` de la démonstration est dans ce cas.

Après la story, une cible dont `scripts.test` lance vitest est jugée par cette commande, lue par son
rapport JUnit, dans une copie où vitest se charge. Une cible dont `scripts.test` lance un lanceur que
495 ne sait pas lire est refusée en le nommant, au lieu d'échouer sans explication.

## 2. Promesses

Scenario: Une cible dont scripts.test lance vitest reçoit un contrôle unit dérivé de cette déclaration
  Given un package.json dont scripts.test vaut « vitest run »
  When la pile de la cible est détectée
  Then le contrôle unit lance le vitest de node_modules de la copie avec le rapporteur JUnit, sans passer par le PATH de l'hôte
  And son titre nomme scripts.test comme provenance de la commande
  And la détection ne déclare aucune capacité manquante pour le test unitaire

Scenario: Un lanceur que 495 ne sait pas lire est refusé et nommé
  Given un package.json dont scripts.test vaut « jest »
  When la pile de la cible est détectée
  Then aucun contrôle unit n'est déclaré
  And la capacité manquante dit que scripts.test lance jest, dont 495 ne sait pas lire la sortie

Scenario: Une cible sans scripts.test, ou qui lance node --test, garde le contrôle node:test
  Given un package.json sans scripts.test, puis un autre dont scripts.test vaut « node --test »
  When la pile de chacune est détectée
  Then chacune déclare le contrôle unit lu par le lecteur node:test

Scenario: Les témoins de vitest sont des tests vitest, dans le dossier de tests de la cible
  Given une cible dont scripts.test lance vitest et dont les tests vivent sous tests/
  When la pile est détectée
  Then le témoin positif est un fichier sous tests/ qui importe vitest et passe
  And le témoin négatif est un fichier sous tests/ qui importe vitest et échoue

Scenario: Le contrôle unit de vitest rend PASS, FAIL ou INDETERMINATE selon ce que vitest a écrit
  Given la commande dérivée exécutée par l'exécuteur de contrôles avec, à la place de vitest, un programme qui écrit un rapport JUnit enregistré depuis vitest 5.0.0
  When le rapport est vert, puis qu'il porte un test en échec, puis qu'aucun rapport n'est écrit
  Then l'évidence du contrôle dit PASS, puis FAIL en nommant le test en échec, puis INDETERMINATE

Scenario: La copie de travail garde le dist/ d'une dépendance et retire celui du projet
  Given un projet dont node_modules/vitest/dist/index.js existe, dont dist/index.js est un artefact de build, et les exclusions par défaut
  When la copie de travail est créée
  Then la copie porte node_modules/vitest/dist/index.js
  And elle ne porte ni dist/index.js ni, sur un projet Maven à modules, module/target/classes

Scenario: Le contrôle unit de vitest écrit son rapport sous le bac à sable de vérification
  Given la commande dérivée exécutée sous le bac à sable de vérification, avec à la place de vitest un programme qui crée le dossier parent de son fichier de sortie avant de l'écrire, comme le fait le rapporteur JUnit de vitest
  When le programme écrit un rapport JUnit vert
  Then l'exécuteur lit ce rapport et l'évidence du contrôle dit PASS

Scenario: Les dépendances installées sont observées entières
  Given une copie dont node_modules porte un fichier de 9 Mio, et un plafond de 8 Mio par fichier
  When le candidat est observé
  Then l'entrée de ce fichier porte son empreinte et les limites de l'observation ne notent aucun dépassement
  And un fichier de la même taille hors de node_modules est toujours noté comme dépassant le plafond

Scenario: Un candidat qui modifie une dépendance installée est refusé
  Given une cible vitest et un candidat qui modifie node_modules/vitest/dist/index.js
  When le noyau juge le candidat
  Then il le refuse en nommant node_modules/vitest/dist/index.js comme chemin protégé modifié

Scenario: Un candidat qui ajoute un fichier sous une dépendance installée est refusé
  Given une cible vitest et un candidat qui ajoute node_modules/vitest/node_modules/tinyrainbow/index.js, fichier qui masque un paquet que le contrôle vitest charge
  When le noyau juge le candidat
  Then il le refuse en nommant node_modules/vitest/node_modules/tinyrainbow/index.js comme chemin protégé modifié, et ce fichier n'est pas rangé parmi les ajouts autorisés
  And un fichier ajouté sous tests/ reste autorisé, comme un test neuf

Scenario: Le cache que vitest écrit dans la copie n'est pas une modification de dépendance
  Given une cible vitest dont node_modules/.vite/vitest/<hash>/results.json existe sur la référence, et un candidat dont la copie a servi à lancer vitest, qui a réécrit ce fichier
  When le candidat est observé
  Then le manifeste du candidat ne porte aucune entrée pour node_modules/.vite/ ni pour node_modules/.vite-temp/
  And un candidat qui modifie node_modules/vitest/dist/index.js y figure toujours, et le noyau le refuse

Scenario: Avec un vrai modèle, une cible en vitest passe G2 et le changement va au bout
  Given la cible node-demo de la démonstration, dont scripts.test vaut « vitest run », et une demande de changement
  When le changement est conduit dans un vrai Pi avec un vrai modèle
  Then le contrôle unit franchit G2 sur ses deux témoins et le changement atteint un verdict à G5
  And sur la construction d'avant la story, le même changement s'arrête à G2 sur le témoin positif du contrôle unit

## 3. Sécurité

- Chemins protégés : le contrôle unit de vitest protège, comme celui de node:test, les dossiers de
  tests et `package.json`, et de plus les fichiers de configuration de vitest
  (`vitest.config.*`, `vite.config.*`) : un candidat qui restreindrait leur `include` ou ajouterait
  un `exclude` rendrait la suite verte sans qu'elle prouve rien.
- Confinement : le contrôle tourne sans réseau. Il n'écrit que le rapport qu'il déclare, à un endroit
  que la sandbox lui laisse créer, et le répertoire temporaire où Vite met la forme compilée de sa
  configuration ; rien d'autre n'est ouvert en écriture.
- Résolution du binaire : vitest se lance depuis `node_modules` de la copie, jamais depuis le PATH de
  l'hôte, si bien que le contrôle juge la version que la cible a installée.
- Ce que la copie emporte : elle garde désormais le `dist/` des dépendances installées. Les
  exclusions par défaut continuent de retirer le `dist/`, le `target/` et le `build/` du projet.
- Observation : les dépendances installées sont observées comme le reste du candidat, sans plafond de
  taille par fichier sous `node_modules/`, et le contrôle unit de vitest les protège : un candidat
  qui modifierait le vitest qui le juge, ou une autre dépendance, ou qui y ajouterait un fichier que
  Node résoudrait avant l'existant, est refusé. Un fichier hors de
  `node_modules/` reste borné à 8 Mio. Ce que vitest et Vite écrivent pour eux-mêmes quand la suite
  tourne, `node_modules/.vite/` (le cache des durées) et `node_modules/.vite-temp/` (la forme
  compilée de la configuration), n'est ni copié ni observé : ce sont des sorties de l'outil, pas des
  dépendances, et un candidat qui les modifierait ne change rien de ce qui juge sa suite.

## 4. Tâches

### Tâche 1 — scripts.test qui lance vitest devient le contrôle unit

`detectNodeStack` lit `scripts.test`. Quand la commande est `vitest` ou `vitest run`, le contrôle
`unit` lance le vitest de `node_modules` de la copie avec le rapporteur JUnit, écrit son rapport à
l'endroit qu'il déclare, le fait lire par le lecteur JUnit, porte la provenance dans son titre, et
ne déclare en écriture que ce rapport et le répertoire temporaire de Vite.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a package.json whose scripts.test is vitest run, when the stack is detected, then unit runs the vitest of node_modules with the JUnit reporter, reads its report with the JUnit parser and names scripts.test in its title »
- Rouge : `detectNodeStack` déclare `unit` comme `node --test --test-reporter=tap`, lu par `node-test`, quelle que soit `scripts.test`

### Tâche 2 — Le contrôle de vitest protège la configuration de vitest

Le contrôle `unit` de vitest ajoute les fichiers de configuration de vitest et de Vite à ses chemins
protégés.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a vitest target, then its unit control protects tests/, package.json and the vitest and vite configuration files »
- Rouge : le contrôle `unit` d'une cible Node ne protège que `test/`, `tests/` et `package.json`, et aucun contrôle vitest n'existe

### Tâche 3 — Un lanceur inconnu est refusé, node:test reste pour le reste

Quand `scripts.test` est présent et n'est ni `node --test …` ni `vitest [run]`, la détection ne
déclare pas de contrôle `unit` et nomme le lanceur dans la capacité manquante. Sans `scripts.test`,
ou avec `node --test`, le contrôle node:test est inchangé.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given scripts.test is jest, when the stack is detected, then no unit control is declared and the missing capability names jest » et « given no scripts.test, or node --test, then unit is the node:test control »
- Rouge : `detectNodeStack` déclare `unit` en node:test pour une cible dont `scripts.test` vaut `jest` et ne déclare aucune capacité manquante

### Tâche 4 — Les témoins de vitest sont des tests vitest

Pour une cible vitest, le témoin positif et le témoin négatif sont des fichiers de test qui importent
`vitest`, placés dans le dossier de tests de la cible (`tests/` s'il existe, sinon `test/`).

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a vitest target with a tests/ directory, then the witnesses are vitest files under tests/, the positive one passing and the negative one failing »
- Rouge : les témoins de l'adaptateur Node importent `node:test` et vivent sous `test/`, que vitest ne lit pas quand la cible fixe `include` sur `tests/`

### Tâche 5 — L'exécuteur lit ce que vitest écrit

Le contrôle dérivé, exécuté par l'exécuteur de contrôles contre un programme de remplacement qui écrit
les rapports JUnit enregistrés depuis vitest 5.0.0 (vert, en échec, absent), rend PASS, FAIL
nommant le test, INDETERMINATE.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given the derived vitest control run against a recorded vitest report, then the evidence is PASS for a green report, FAIL naming the failed case for a failing one, and INDETERMINATE when no report is written »
- Rouge : la détection ne dérive aucun contrôle vitest, donc la commande exécutée est `node --test` et le programme de remplacement n'est jamais lancé

### Tâche 6 — La copie garde le dist/ d'une dépendance

Un motif d'exclusion qui nomme un seul dossier ne s'applique pas sous `node_modules/`. Il retire
toujours le `dist/`, le `target/` ou le `build/` du projet, à la racine comme dans un module.

- Vérifie : `node --test test/v2/workspace.test.ts`
- Tient : `test/v2/workspace.test.ts`, « given the default exclusions, then a copy keeps node_modules/vitest/dist/index.js and drops dist/index.js and module/target/classes »
- Rouge : `isExcluded("node_modules/vitest/dist/index.js", ["dist/"])` rend `true`, et la copie ne porte pas ce fichier

### Tâche 7 — Le README dit ce que l'adaptateur Node lit

La ligne du README qui écrit que l'adaptateur Node ne lit pas les scripts `package.json` et que
vitest n'est pas supporté dit que `scripts.test` lancé par `node --test` ou `vitest` est lu, et que
tout autre lanceur est refusé en étant nommé.

- Vérifie à la main : lire la ligne « Node » de la table des piles dans `README.md`, puis `npm run lint:distribution`
- Tient : la ligne ne contient plus « does not yet use arbitrary `package.json` test scripts » et nomme vitest et le refus d'un autre lanceur
- Rouge : la ligne dit que Jest, Vitest et les autres lanceurs ne sont pas impliqués par le support de Node

### Tâche 8 — Le rapport de vitest s'écrit sous le bac à sable

Le contrôle unit de vitest écrit son rapport à un endroit que la sandbox de vérification le laisse
créer, dossier parent compris, et le déclare en écriture.

- Vérifie : `node --test test/v1/control-runner.test.ts`
- Tient : `test/v1/control-runner.test.ts`, « given the derived vitest control run under the verification sandbox against a stand-in that creates the parent directory of its output, then the report is read and the verdict is PASS »
- Rouge : le contrôle déclare `target/495-vitest/junit.xml` avec `target/495-vitest` en écriture ; `target/` n'existe pas dans la copie, la sandbox refuse de créer ce dossier parent et le programme de remplacement s'arrête avant d'écrire, si bien que le verdict n'est pas PASS

### Tâche 9 — Un fichier de dépendance au-dessus du plafond est observé

Sous `node_modules/`, l'observation d'un fichier n'est pas bornée par le plafond de taille par fichier ;
hors de `node_modules/`, le plafond reste.

- Vérifie : `node --test test/v2/workspace.test.ts`
- Tient : `test/v2/workspace.test.ts`, « given a node_modules file above the file limit, when the candidate is observed, then its entry carries a digest and the limits note no excess, while the same file outside node_modules is still noted »
- Rouge : `walkTree` note `node_modules/x/big.node exceeds 8388608 bytes`, n'en prend pas l'empreinte et marque l'observation tronquée

### Tâche 10 — Le contrôle de vitest protège les dépendances installées

Le contrôle unit de vitest ajoute `node_modules/` à ses chemins protégés.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a vitest target, then its unit control protects node_modules/ beside the tests, package.json and the configuration files, and a candidate that modifies node_modules/vitest/dist/index.js is refused naming that path »
- Rouge : les chemins protégés du contrôle unit de vitest ne contiennent pas `node_modules/`, et un candidat qui modifie ce fichier n'est pas refusé

### Tâche 11 — Le cache de vitest n'est pas une modification de dépendance

Les exclusions par défaut de la copie couvrent `node_modules/.vite/` et `node_modules/.vite-temp/`.

- Vérifie : `node --test test/v2/workspace.test.ts`
- Tient : `test/v2/workspace.test.ts`, « given the default exclusions, when a candidate rewrites node_modules/.vite/vitest/x/results.json and adds a file under node_modules/.vite-temp/, then its manifest carries neither, while a change to node_modules/vitest/dist/index.js is still in it »
- Rouge : les exclusions par défaut ne nomment aucun de ces deux répertoires, et le manifeste du candidat porte `node_modules/.vite/vitest/x/results.json` comme fichier modifié, que G4 refuse comme chemin protégé

### Tâche 12 — Un fichier ajouté sous une dépendance est refusé

Sous `node_modules/`, un fichier ajouté est refusé comme un fichier modifié, alors que sous `test/` et
`tests/` un fichier ajouté reste un test neuf autorisé. Les répertoires `node_modules/.vite/` et
`node_modules/.vite-temp/` restent hors de l'observation.

- Vérifie : `node --test test/v1/node-stack.test.ts`
- Tient : `test/v1/node-stack.test.ts`, « given a vitest target, when a candidate adds node_modules/vitest/node_modules/tinyrainbow/index.js, which shadows a package the vitest control loads, then it is refused naming that path »
- Rouge : `protectedPathsChanged` range un fichier ajouté sous un dossier protégé parmi les ajouts autorisés, si bien que le fichier ajouté sous `node_modules/` n'est pas refusé et que la liste des chemins protégés modifiés reste vide

## 5. Hors périmètre

- Jest, mocha, ava et les autres lanceurs : aucune cible ne les utilise, et un contrôle dont le
  lecteur n'est pas qualifié sur la sortie qu'il lit vaut moins que pas de contrôle. Il se rouvre
  sur la première cible qui en dépend.
- `vitest --coverage` et le contrôle de couverture sur une cible Node : la couverture des lignes
  introduites n'existe aujourd'hui que pour Maven (QLT-04).
- Une commande de test qui passe par `npm run`, un shell ou une chaîne (`tsc && vitest run`) : elle
  est refusée en nommant sa forme ; la lire demanderait un shell que la sandbox ne donne pas.
- Le contrôle `lint` d'une cible Node : inchangé.
- Ajouter une dépendance à la cible : elle se déclare dans `package.json`, que le contrôle protège.
  Un candidat qui la déposerait en écrivant sous `node_modules/` est refusé, ce que la tâche 12
  assume.
- Le message que reçoit le modèle quand G4 refuse un chemin protégé, qui nomme le fichier sans dire
  comment en sortir : la story retire la cause la plus fréquente sur une cible vitest, pas le
  message. Les caches d'autres outils sous `node_modules/` (`.cache/`) : aucune campagne n'en montre.
- Un `node_modules` qui dépasse la limite de 50 000 entrées, ou dont la copie serait trop lourde : G4
  refuse toujours ce candidat en le disant, et chaque copie de travail pèse le poids de
  `node_modules`. C'est la limite de ce choix ; la mettre à disposition en lecture seule hors de la
  copie se rouvre sur le premier projet qui l'atteint.
- Le `.495/project.toml` de `node-demo` et son `scripts/with-deps.sh` : le harnais ne les lit plus, et
  la copie garde désormais les dépendances sans eux ; les retirer est un travail de la cible.
- Le texte de communication qui dit « Jest and Vitest are not supported yet » : il se corrige à la
  prochaine publication, pas dans le dépôt de code.
