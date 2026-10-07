# Ce qu'une technologie écarte de la copie, protège, transmet à ses contrôles et appelle un fichier de test est une capacité de son dossier

Story : e37s03
Epic : e37
Statut : à faire

## 1. Ce que le lecteur gagne

Celui qui ajoute une technologie à 495 déclare depuis `e37s02` ses contrôles et ses témoins dans son dossier. Mais
tout ce que la copie de travail doit savoir de lui reste écrit dans le code générique, au nom de Maven et de Node :
- **sorties de ses outils** : les exclusions par défaut de la copie nomment `target/`, `dist/`, `build/`, `__pycache__/`, `node_modules/.vite/`, `node_modules/.vite-temp/`, `node_modules/.vitest/`, `reports/mutation/` et `.stryker-tmp/` (`src/adapters/workspace/git-workspace.ts:23`) ;
- **dépendances installées** : `node_modules` est le seul répertoire protégé pour tout contrôle (`src/application/verification.ts:59`), le seul qu'un ajout ne peut pas viser (`src/domain/gates/g4.ts:86`), le seul que l'inventaire et l'intégration traitent à part (`src/adapters/workspace/walk.ts:42`, `src/adapters/git/integrator.ts:40`) ;
- **environnement** : `JAVA_HOME` et `MAVEN_OPTS` sont transmis aux contrôles et au producteur de toute technologie (`src/application/stacks/stack.ts:44`, `src/application/intervention.ts:273`), et `java -version` et `mvn -v` entrent dans l'identité de l'environnement de tout projet (`src/application/environment.ts:114`) ;
- **fichiers de test** : un fichier de test ne se reconnaît qu'à des noms JavaScript, TypeScript ou `Test.java` (`src/application/preparation.ts:67`), et la ressource de test qui recopie une ressource de production ne se reconnaît qu'à la disposition Maven (`src/application/target.ts:10`) ;
- **sources** : les sources qu'attend le rapport LCOV sont celles de JavaScript et TypeScript (`src/adapters/execution/lcov.ts:94`), et les parcours de répertoires sautent `node_modules`, `target`, `build`, `out` et `bin` (`src/adapters/execution/workspace-files.ts:180`, `:203`).

Une troisième technologie dont les outils écrivent ailleurs verrait ces sorties entrer dans le candidat. Ses
dépendances installées ne seraient pas protégées, ses variables d'environnement pas transmises, et ses fichiers de
test pas comptés.

Il gagne une capacité `workspace` et deux réponses de plus de la capacité `tests`. Il les déclare dans son
dossier, comme ses contrôles. C'est un défaut et non une préférence : `D-86` (point 3) veut que le code générique
ne nomme aucune technologie, ni ses outils, ni ses fichiers, ni ses répertoires.

## 2. Promesses

Scenario: Ce que les outils d'une technologie écrivent dans la copie n'entre pas dans le candidat
  Given la technologie fictive, qui déclare que ses outils écrivent sous `fict-out/`
  When un agent scripté qui écrit `src/farewell.txt` et `fict-out/run.log` mène un changement jusqu'à son acceptation
  Then le manifeste du candidat porte `src/farewell.txt` et aucune entrée sous `fict-out/`
  And la référence du changement enregistre `fict-out/` parmi ses exclusions, avec celles que la configuration du propriétaire déclare

Scenario: Les dépendances installées d'une technologie sont protégées
  Given la technologie fictive, qui déclare `fict_modules` comme répertoire de ses dépendances installées
  When un agent scripté ajoute `fict_modules/shadow.txt` au candidat
  Then le changement n'est pas accepté, et G4 nomme `fict_modules/shadow.txt` parmi les chemins protégés modifiés

Scenario: Une technologie transmet à ses contrôles les variables qu'elle déclare, et à elles seules
  Given un projet Node et un projet Maven
  When leur technologie est détectée
  Then aucun contrôle Node ne lit `JAVA_HOME` ni `MAVEN_OPTS`
  And chaque contrôle Maven lit `JAVA_HOME` et `MAVEN_OPTS`, comme avant

Scenario: Un fichier de test se reconnaît à la forme que sa technologie déclare
  Given la technologie fictive, dont les fichiers de test sont les `*.case` de `cases/`, et un projet qui porte `cases/greeting.case`
  When un changement gèle son protocole
  Then le diagnostic de capacité du protocole compte un fichier de test (`test_files` vaut 1)

## 3. Sécurité

Les chemins protégés et les exclusions décident de ce qu'un candidat peut changer sans que G4 le refuse. Une
technologie qui déclare ses dépendances installées les protège ; une qui ne déclare rien ne retire aucune protection
qu'une autre technologie donne. Les exclusions qu'une technologie déclare s'ajoutent à celles du propriétaire, et
ne les remplacent pas. Elles sont enregistrées dans la référence du changement, que l'intégration relit : un dossier
écrit avant, dont la référence porte déjà ses exclusions, s'intègre à l'identique.

L'environnement d'un contrôle reste une liste fermée : une technologie y ajoute les noms qu'elle déclare, et rien
de la session ne s'y glisse. Retirer `JAVA_HOME` et `MAVEN_OPTS` des contrôles Node change leur définition, donc le
protocole qu'un changement Node gèle désormais. Un changement en vol après une montée de version s'arrête déjà à
la qualification, comme `e32s02` l'a noté.

## 4. Tâches

### Tâche 1 — La technologie déclare ce que ses outils écrivent dans la copie

`StackPlugin` (`src/application/stacks/plugin.ts`) gagne une capacité `workspace`, déclarative, qui dit ce que les
outils de la technologie écrivent dans une copie et qui n'est pas un changement. Au démarrage d'un changement, d'un
état des lieux ou d'un programme, le noyau reconnaît la technologie du projet avant de capturer la référence. Les
exclusions de cette référence sont alors celles de la configuration, plus celles de la technologie. La valeur par
défaut de `workspace_exclusions` (`src/extension/config.ts`) ne garde que ce qui n'appartient à aucune technologie :
`.pi/`, le répertoire de Pi.
- **Maven** déclare `target/`.
- **Node** déclare `target/` (où 495 lui fait écrire ses rapports), `dist/`, `build/`, `node_modules/.vite/`, `node_modules/.vite-temp/`, `node_modules/.vitest/`, `reports/mutation/` et `.stryker-tmp/`.
- `__pycache__/` n'est déclaré par personne : aucune technologie de 495 ne l'écrit.

- Vérifie : `node --test test/v2-kernel/fictitious-stack.test.ts`
- Tient : `test/v2-kernel/fictitious-stack.test.ts`, « un changement sur la technologie fictive, qui déclare `fict-out/`, dont l'agent écrit `src/farewell.txt` et `fict-out/run.log`, est accepté ; le manifeste de son candidat porte `src/farewell.txt` et aucune entrée sous `fict-out/`, et les exclusions de sa référence contiennent `fict-out/` et `.pi/` »
- Rouge : les exclusions sont la liste fixe de `DEFAULT_WORKSPACE_POLICY`, qui ignore `fict-out/` ; le manifeste du candidat porte `fict-out/run.log`

### Tâche 2 — La technologie déclare le répertoire de ses dépendances installées

La capacité `workspace` déclare aussi le nom du répertoire où la technologie installe ses dépendances, à la racine
du projet ou dans un de ses paquets. Node déclare `node_modules`, Maven rien. Les quatre usages lisent cette
déclaration, enregistrée dans la référence du changement à côté des exclusions :
- le chemin protégé que la vérification ajoute à chaque contrôle ;
- le refus d'un ajout sous ce répertoire (`protectedPathsChanged`, `src/domain/gates/g4.ts`) ;
- l'inventaire qui ne borne pas la taille d'un fichier sous ce répertoire (`walk.ts`) ;
- l'intégration qui ne l'indexe pas (`integrator.ts`).

Une référence écrite avant, sans cette déclaration, est relue avec celle de la technologie que le projet porte.

- Vérifie : `node --test test/v2-kernel/fictitious-stack.test.ts`
- Tient : `test/v2-kernel/fictitious-stack.test.ts`, « un changement sur la technologie fictive, qui déclare `fict_modules`, dont l'agent ajoute `fict_modules/shadow.txt`, n'est pas accepté, et G4 nomme `fict_modules/shadow.txt` parmi les chemins protégés modifiés »
- Rouge : seul `node_modules/` est protégé ; `fict_modules/shadow.txt` n'est un chemin protégé d'aucun contrôle, et le changement est accepté

### Tâche 3 — La technologie déclare son environnement et les outils dont la version l'identifie

La capacité `workspace` déclare les variables d'environnement que lisent les contrôles et le producteur de la
technologie, et les outils dont la version entre dans l'identité de l'environnement, chacun avec sa commande.
- `BASE_ENV` ne garde que `PATH`, `HOME`, `TMPDIR`, `LANG` et `LC_ALL`.
- Maven déclare `JAVA_HOME` et `MAVEN_OPTS`, ainsi que `java -version` et `mvn -v`. Node ne déclare aucune variable et aucun outil.
- Le producteur qui écrit lit les variables de la technologie du changement (`intervention.ts`).
- L'identité de l'environnement sonde les outils de toutes les technologies de la liste que la racine de composition remet (`environment.ts`). Elle reste donc la même qu'avant, sans qu'un module générique nomme `java` ni `mvn`.

- Vérifie : `node --test test/v1-adapters/technology-environment.test.ts`
- Tient : `test/v1-adapters/technology-environment.test.ts`, « aucun contrôle de la détection d'un projet Node sous `node --test` ne porte `JAVA_HOME` ni `MAVEN_OPTS` dans son `env_allowlist`, et chaque contrôle de la détection d'un projet Maven porte les deux »
- Rouge : `baseControl` donne `BASE_ENV` à tout contrôle, et `BASE_ENV` contient `JAVA_HOME` et `MAVEN_OPTS` ; les contrôles Node les portent

### Tâche 4 — La capacité `tests` dit ce qu'est un fichier de test et une ressource de test recopiée

`TestCapability` dit si un chemin est un fichier de test de la technologie, et, pour une ressource de test, le
chemin de la ressource de production qu'elle peut recopier.
- Le compte du diagnostic de capacité (`referenceTestFiles`, `preparation.ts`) lit la première réponse.
- La règle qui laisse passer une ressource de test identique à la ressource de production que le candidat a écrite (`mirrorsProductionResource`) lit la seconde.
- Maven déclare `Test.java` et `src/test/resources` ↔ `src/main/resources`. Node déclare `.test.`, `.spec.` et `_test.` sur des sources JavaScript ou TypeScript, et aucune ressource recopiée.

- Vérifie : `node --test test/v2-kernel/fictitious-stack.test.ts`
- Tient : `test/v2-kernel/fictitious-stack.test.ts`, « sur un projet qui porte `cases/greeting.case`, avec une technologie fictive dont les fichiers de test sont les `*.case` de `cases/`, le diagnostic de capacité du protocole gelé a `test_files` à 1 »
- Rouge : `TEST_FILE_NAME` ne reconnaît que des noms JavaScript, TypeScript ou `Test.java` ; `cases/greeting.case` n'est pas compté et `test_files` vaut 0

### Tâche 5 — Les sources et les parcours de répertoires lisent la technologie

- Le lecteur LCOV reçoit de la capacité `coverage` de Node la règle des sources qu'il attend dans le rapport ; `lcov.ts` ne garde que la lecture du format.
- Les parcours de répertoires des lecteurs (`workspace-files.ts`) sautent les sorties et les dépendances installées que la technologie déclare, au lieu d'une liste qui les nomme.

- Vérifie à la main : `grep -rnE "node_modules|target/|__pycache__|stryker|\.vite|JAVA_HOME|MAVEN_OPTS|Test\\\\.java|src/(test|main)/resources|\"java\"|\"mvn\"" src --include=*.ts` ne rend plus que `src/adapters/stacks/`, `src/application/installation.ts` et `src/application/decisions.ts`, que `e37s04` traite ; puis `npm run build`, `npm run check` vert avec au moins autant de tests qu'avant, et les deux campagnes de référence (`npm run campagne -- npm`, `npm run campagne -- maven`) vertes
- Tient : la recherche, la Preflight et les deux campagnes, aux angles morts et à l'environnement des contrôles Node près
- Rouge : `SCRIPT_SOURCE` (`lcov.ts:94`) et `SKIPPED_DIRECTORIES` (`workspace-files.ts:203`) nomment les sources JavaScript et les répertoires de Maven et de Node

## 5. Hors périmètre

- L'installation et la résolution d'un complément, l'environnement d'une installation (`NPM_ENV_NAMES`, `MAVEN_ENV_NAMES`), son inspection, le texte qui la présente au propriétaire et les modifications de fichier qu'un complément apporte : la capacité `install`, `e37s04`.
- Le répertoire `.m2/repository` d'une résolution Maven dans la copie : avec l'installation, `e37s04`.
- La règle de Preflight qui refuse qu'un module générique importe une technologie : `e37s04`.
- L'interface publiée, le test de conformité et l'exemple documenté : `e37s05`.
