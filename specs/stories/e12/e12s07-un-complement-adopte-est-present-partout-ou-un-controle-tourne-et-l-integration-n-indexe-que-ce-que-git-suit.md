# Un complément adopté est présent dans chaque copie où un contrôle tourne, et l'intégration n'indexe que ce que git suit

Story : e12s07
Epic : e12
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui adopte un complément (`e12s06`) le voit aujourd'hui à deux endroits : la copie où 495 détecte la
pile, et celle du candidat. Les copies où 495 qualifie un capteur, celles où il rejoue les contrôles sur la
référence, et celles de la préparation sont des copies nues de la référence. Un complément dont un contrôle a
besoin pour tourner, un fournisseur de couverture sous `node_modules` par exemple, manquerait dans ces copies :
le capteur échouerait sa qualification pour une raison que le dossier ne dit pas.

Une seconde limite se trouve à l'intégration. Quand un chemin du candidat est ignoré par le `.gitignore` du
projet, l'intégrateur le copie puis demande à git de l'indexer : git refuse (« paths are ignored », code 1), et
l'intégration d'un changement accepté finit `uncertain`, avec pour seule issue d'aller vérifier (défaut
enregistré). Dans un projet qui n'ignore pas `node_modules/`, l'intégrateur indexerait au contraire les fichiers
d'une dépendance dans l'historique du propriétaire.

Après la story, un complément adopté est présent dans chaque copie où un contrôle tourne, et l'intégration
copie tous les fichiers du candidat mais n'indexe que ceux que git peut suivre, jamais un chemin de
`node_modules/`. Cette story ne fait rien installer : elle prépare `e12s08`.

## 2. Promesses

Scenario: Les copies où le noyau qualifie un capteur portent le complément adopté
  Given un complément adopté qui écrit package.json, et un contrôle qualifié sur un témoin positif, un témoin négatif et un témoin négatif propre à ce contrôle
  When la qualification ouvre ses copies de travail
  Then chacune des trois porte le package.json du complément avant que le témoin n'y soit écrit

Scenario: La copie où le noyau rejoue un contrôle sur la référence porte le complément adopté
  Given un protocole gelé qui porte un complément adopté, et un contrôle dont la passe sur la référence n'est pas réutilisable
  When la passe sur la référence ouvre sa copie
  Then la copie porte le package.json du complément

Scenario: Les copies de la préparation portent le complément adopté
  Given un complément adopté, puis une préparation accordée
  When le producteur de la préparation, puis le noyau qui juge la suite préparée, ouvrent leur copie
  Then chacune porte le package.json du complément

Scenario: Une copie où aucun contrôle ne tourne, et un changement sans complément, gardent les copies d'aujourd'hui
  Given un changement sans complément adopté, puis un complément adopté et la copie jetable de la spécification
  When les copies sont ouvertes
  Then celles du premier sont celles d'aujourd'hui, et celle de la spécification est la référence nue

Scenario: Un fichier du complément, à n'importe quel chemin protégé, n'est pas une modification refusée
  Given un complément qui porte package.json et deux fichiers sous node_modules/, un candidat qui les garde tels que le complément les a écrits, et un autre qui modifie l'un des deux
  When le noyau juge chacun à G4
  Then le premier passe, et le second est refusé en nommant le fichier modifié comme chemin protégé altéré

Scenario: Un chemin que git ignore est copié dans le projet et laissé hors du commit
  Given un projet git dont le .gitignore liste coverage/, et un candidat accepté qui ajoute coverage/report.txt et modifie src/a.ts
  When le candidat est intégré après l'acceptation de l'intégration locale
  Then coverage/report.txt est dans le projet, le commit local contient src/a.ts et ne contient pas coverage/report.txt
  And le reçu d'intégration dit que l'intégration est faite, sans passer par l'incertitude

Scenario: Un chemin de node_modules n'est jamais indexé, même si le projet ne l'ignore pas
  Given un projet git dont le .gitignore ne liste pas node_modules/, et un candidat accepté qui modifie package.json et ajoute node_modules/x/index.js
  When le candidat est intégré
  Then node_modules/x/index.js est dans le projet, et le commit local contient package.json et ne contient aucun chemin de node_modules/

Scenario: Un projet sans chemin ignoré est intégré comme avant
  Given un projet git sans .gitignore utile et un candidat accepté qui modifie deux fichiers
  When le candidat est intégré
  Then le commit local contient exactement ces deux fichiers, avec le message et le reçu d'aujourd'hui

Scenario: Un fichier de node_modules qu'aucun complément n'a écrit est refusé à G4, quel que soit le lanceur de tests de la cible
  Given une cible dont scripts.test lance node --test, un candidat qui ajoute node_modules/x/index.js et src/greet.js sans qu'aucun complément soit adopté, et un autre candidat qui garde tel quel un node_modules/x/index.js écrit par un complément adopté
  When le noyau juge chacun à G4
  Then le premier est refusé en nommant node_modules/x/index.js comme chemin protégé altéré, sans nommer src/greet.js
  And le second passe

Scenario: Un fichier de node_modules qu'aucun complément n'a écrit est refusé à G4 sur une cible Maven, qui ne déclare aucun chemin de node_modules/
  Given une cible Maven dont les contrôles ne protègent que les fichiers de préparation et les pom.xml, aucun complément adopté, un candidat qui ajoute node_modules/x/index.js et src/main/java/Greet.java, et un autre candidat qui garde tel quel un node_modules/x/index.js écrit par un complément adopté
  When le noyau gèle le protocole puis juge chacun à G4
  Then le protocole gelé protège node_modules/
  And le premier est refusé en nommant node_modules/x/index.js comme chemin protégé altéré, sans nommer src/main/java/Greet.java
  And le second passe

## 3. Sécurité

- Un fichier de complément vient du magasin d'objets, par son empreinte : il est remis tel qu'il a été adopté, et
  un fichier dont le contenu ne correspond plus à son empreinte n'est pas écrit.
- À G4, un fichier n'est permis sur un chemin protégé que s'il a l'empreinte que le complément a écrite ; le
  producteur ne peut ni le défaire ni le prolonger, quel que soit le chemin.
- L'intégration n'écrit dans le projet, comme avant, qu'après l'acceptation du propriétaire. Elle copie ce que le
  candidat contient, et G4 refuse tout fichier de `node_modules/` qu'un complément adopté n'a pas écrit, quelle que
  soit la pile de la cible et quel que soit son lanceur de tests, Maven comme Node : le protocole gelé protège
  `node_modules/` même quand aucun contrôle de la cible ne le déclare, et le candidat n'a pu contenir un fichier de
  dépendance que par un complément que le propriétaire a adopté. Le code d'une dépendance n'entre jamais dans
  l'historique du propriétaire.

## 4. Tâches

### Tâche 1 — Une seule fonction ouvre une copie avec les compléments, et la qualification l'utilise

La couche application ouvre une copie de travail avec les compléments adoptés de la modification, écrits
depuis le magasin d'objets ; la qualification l'emploie pour ses trois copies (positive, négative, négative propre
à un contrôle).

- Vérifie : `node --test test/v2-kernel/verification.test.ts`
- Tient : `test/v2-kernel/verification.test.ts`, « given an adopted complement, then the positive, negative and control-specific negative workspaces of the qualification each carry it before the witness is written »
- Rouge : `qualify` ouvre la copie négative et la copie négative propre à un contrôle depuis la référence nue et n'y écrit que les fichiers du témoin

### Tâche 2 — La passe sur la référence porte le complément

La copie où le noyau rejoue un contrôle sur la référence est ouverte avec les compléments du protocole gelé.

- Vérifie : `node --test test/v2-kernel/verification.test.ts`
- Tient : `test/v2-kernel/verification.test.ts`, « given a frozen protocol carrying an adopted complement, then the workspace of a reference pass carries it »
- Rouge : `referencePasses` ouvre une copie nue de la référence, sans lire les compléments du protocole

### Tâche 3 — La préparation porte le complément

La copie du producteur de la préparation et la copie où le noyau juge la suite préparée sont ouvertes avec les
compléments adoptés.

- Vérifie : `node --test test/v2-kernel/preparation.test.ts`
- Tient : `test/v2-kernel/preparation.test.ts`, « given an adopted complement, then the producer's workspace and the bare workspace judging the prepared suite both carry it »
- Rouge : `prepare` ouvre ses deux copies depuis la référence nue et n'y écrit, pour la seconde, que les fichiers préparés

### Tâche 4 — Un fichier du complément est permis à G4 à n'importe quel chemin protégé

Les fichiers des compléments sont donnés à `protectedPathsChanged` avec les fichiers préparés : un fichier remis
à l'identique est permis, y compris sous `node_modules/`, et toute autre modification est refusée.

- Vérifie : `node --test test/v1-adapters/node-stack.test.ts`
- Tient : `test/v1-adapters/node-stack.test.ts`, « given a complement carrying package.json and two files under node_modules/, then a candidate keeping them as written is allowed and one modifying one of them is refused naming that file »
- Rouge : `implement` ne donne à `protectedPathsChanged` que les fichiers de la préparation : un fichier ajouté sous `node_modules/` n'est jamais permis, et le candidat qui porte le complément est refusé à G4

### Tâche 5 — L'intégration laisse hors du commit ce que git ignore

L'intégrateur copie tous les fichiers du candidat, puis n'indexe que les chemins que git n'ignore pas.

- Vérifie : `node --test test/v2-kernel/export-integration.test.ts`
- Tient : `test/v2-kernel/export-integration.test.ts`, « given a project ignoring coverage/ and a candidate adding coverage/report.txt and modifying src/a.ts, then the file is in the project, the commit holds src/a.ts only and the receipt says the integration is done »
- Rouge : l'intégrateur exécute `git add -A` sur tous les chemins du candidat sans tolérer d'échec : git répond que `coverage/report.txt` est ignoré et sort avec le code 1, et l'intégration finit `uncertain`

### Tâche 6 — L'intégration n'indexe jamais un chemin de `node_modules/`

Un chemin de `node_modules/` est copié dans le projet et n'est jamais indexé, que le projet l'ignore ou non.

- Vérifie : `node --test test/v2-kernel/export-integration.test.ts`
- Tient : `test/v2-kernel/export-integration.test.ts`, « given a project that does not ignore node_modules/ and a candidate modifying package.json and adding node_modules/x/index.js, then the file is in the project and the commit holds package.json and no path of node_modules/ », et « given a project with no ignored path and two modified files, then the commit holds exactly those two files »
- Rouge : l'intégrateur indexe tous les chemins du candidat : dans un projet qui n'ignore pas `node_modules/`, le commit contient `node_modules/x/index.js`

### Tâche 7 — Un fichier de `node_modules/` est un chemin protégé d'une cible `node:test`

Le contrôle `unit` d'une cible `node --test` protège `node_modules/` comme ceux de vitest, mocha et jest : un fichier
ajouté sous `node_modules/` n'est permis à G4 que remis tel qu'un complément adopté l'a écrit, et tout autre est
refusé.

- Vérifie : `node --test test/v1-adapters/node-stack.test.ts`
- Tient : `test/v1-adapters/node-stack.test.ts`, « given a node --test target and no adopted complement, then a candidate adding node_modules/x/index.js and src/greet.js is refused naming node_modules/x/index.js and not src/greet.js, and one keeping a node_modules/x/index.js written by an adopted complement is allowed »
- Rouge : `nodeTestControl` déclare `protected_paths: ["test/", "tests/", "package.json"]` : sur une cible `node --test`, `protectedPathsChanged` rend `altered: []` pour `node_modules/x/index.js` ajouté, et G4 passe

### Tâche 8 — Le protocole gelé protège `node_modules/` quelle que soit la pile de la cible

Le protocole gelé protège `node_modules/` en plus de ce que les contrôles de la cible déclarent : une cible dont aucun
contrôle ne le nomme, Maven par exemple, refuse à G4 un fichier de `node_modules/` qu'aucun complément adopté n'a écrit,
et permet celui qu'un complément adopté a écrit, remis tel quel.

- Vérifie : `node --test test/v2-kernel/verification.test.ts`
- Tient : `test/v2-kernel/verification.test.ts`, « given the controls of a Maven target and no adopted complement, then the frozen protocol protects node_modules/, a candidate adding node_modules/x/index.js and src/main/java/Greet.java is refused naming node_modules/x/index.js and not src/main/java/Greet.java, and one keeping a node_modules/x/index.js written by an adopted complement is allowed »
- Rouge : `freeze` ne complète le `protected_paths` de chaque contrôle qu'avec les fichiers de préparation, et ceux de `maven-test` sont les fichiers de préparation et les `pom.xml` : le protocole gelé ne contient pas `node_modules/`, `protectedPathsChanged` rend `altered: []` pour `node_modules/x/index.js` ajouté, et G4 passe

## 5. Hors périmètre

- L'installation d'un complément qui demande un arbre de dépendances, le réseau ouvert à cette seule étape, la
  détection du gestionnaire de paquets et l'inspection de ce qui a été installé : `e12s08`. Cette story n'installe
  rien et n'ouvre aucun réseau.
- Un complément Maven, qui touche le dépôt local de la machine : `e12s09`.
- Ce que git ignore : la story pose la question à git et ne relit pas les `.gitignore` elle-même.
- Le refus, à G4, d'un complément dont l'arbre a plus de 50 000 fichiers : la limite de l'observation d'une copie
  est déjà celle qui refuse ce candidat en le disant.
- Le coût d'ouvrir une copie avec un gros arbre de complément, sur chaque copie : il se mesure avec l'installation
  réelle de `e12s08`.
- Le dossier de dépendances d'une autre pile : la tâche 7 protège `node_modules/`, le seul que l'intégrateur écarte
  de l'index.
- Les dossiers de dépendances propres à Maven (`target/`, le dépôt local de la machine) : la tâche 8 protège
  `node_modules/` sur toute cible, elle n'en protège aucun autre.
- Un `node_modules/` sous un paquet d'espace de travail (`packages/a/node_modules/`) : le chemin protégé est
  `node_modules/` à la racine du projet, comme pour les contrôles de la pile Node.

