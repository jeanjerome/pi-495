# Une cible Node en vitest est jugée par sa propre commande de test

Story : e05s01
Epic : e05
Statut : à faire

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
- Confinement : le contrôle tourne sans réseau. Il n'écrit que le rapport qu'il déclare et le
  répertoire temporaire où Vite met la forme compilée de sa configuration ; rien d'autre n'est
  ouvert en écriture.
- Résolution du binaire : vitest se lance depuis `node_modules` de la copie, jamais depuis le PATH de
  l'hôte, si bien que le contrôle juge la version que la cible a installée.
- Ce que la copie emporte : elle garde désormais le `dist/` des dépendances installées. Les
  exclusions par défaut continuent de retirer le `dist/`, le `target/` et le `build/` du projet.

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

## 5. Hors périmètre

- Jest, mocha, ava et les autres lanceurs : aucune cible ne les utilise, et un contrôle dont le
  lecteur n'est pas qualifié sur la sortie qu'il lit vaut moins que pas de contrôle. Il se rouvre
  sur la première cible qui en dépend.
- `vitest --coverage` et le contrôle de couverture sur une cible Node : la couverture des lignes
  introduites n'existe aujourd'hui que pour Maven (QLT-04).
- Une commande de test qui passe par `npm run`, un shell ou une chaîne (`tsc && vitest run`) : elle
  est refusée en nommant sa forme ; la lire demanderait un shell que la sandbox ne donne pas.
- Le contrôle `lint` d'une cible Node : inchangé.
- Le `.495/project.toml` de `node-demo` et son `scripts/with-deps.sh` : le harnais ne les lit plus, et
  la copie garde désormais les dépendances sans eux ; les retirer est un travail de la cible.
- Le texte de communication qui dit « Jest and Vitest are not supported yet » : il se corrige à la
  prochaine publication, pas dans le dépôt de code.
