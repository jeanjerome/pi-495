# 495 propose la carte d'architecture d'une cible Node, le propriétaire l'adopte et l'état des lieux la vérifie avec dependency-cruiser, chaque violation localisée

Story : e11s04
Epic : e11
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Node qui demande l'état de son architecture n'obtient aujourd'hui qu'un angle
mort : « no control of the target measures its nature (structure) ». Aucune carte ne lui est proposée et
rien n'est vérifié. Prenons un paquet dont `src/domain` porte un modèle et des services, et dont
`src/adapters` les branche sur une base, ou un paquet où `src/admin` est en couches à côté de `src/orders`
en hexagone. Ce qu'une cible Maven obtient depuis `e11s01` et `e11s02`, une cible Node ne l'obtient pas
(`ARC-01`, `D-87`).

Avec cette story, la carte d'une cible Node se propose, s'adopte et se vérifie comme celle d'une cible
Maven. Ses parties découpent les dossiers des sources, et chaque dossier a son rôle dans le style de sa
partie. La skill d'identification reçoit la part Node qu'aucune des deux sources ne couvrait. Adopter la
carte, c'est adopter sa vérification par dependency-cruiser 18.5.0. `D-87` demandait de le départager
d'eslint-plugin-boundaries 7.2.0 par une mesure sous TypeScript 7, faite le 2026-10-08 sur un paquet sous
TypeScript 7.0.2. dependency-cruiser seul y lit zéro module et sort en 0, un faux vert. Avec son analyseur
swc (`@swc/core` 1.16.13), il lit chaque module et ses imports, alias de `tsconfig.json` compris.
eslint-plugin-boundaries a besoin de typescript-eslint 8.71.1 pour lire du TypeScript : npm refuse de
l'installer à côté de TypeScript 7, et forcé, il refuse de se charger (« typescript-eslint does not
support TS 7.0 »). Chaque violation est localisée à son fichier et à la ligne de l'import, et ce que la
vérification ne voit pas est nommé.

## 2. Promesses

Scenario: La carte d'une cible Node se présente au propriétaire
  Given un paquet npm sous TypeScript 7.0.2 dont les sources portent les dossiers `src/domain/model`, `src/domain/service`, `src/domain/port`, `src/adapters/db` et `src/legacy`, et dont `test/` porte les tests
  And une exigence d'architecture à l'état des lieux
  When l'état des lieux mesure le projet
  Then une intervention en lecture seule propose une carte de l'architecture
  And une décision demande au propriétaire s'il adopte la carte, avec les trois issues : l'adopter, demander une nouvelle proposition avec une remarque, ou laisser l'exigence en angle mort
  And ses faits donnent chaque partie avec ses dossiers, son style et le rôle de chacun de ses dossiers, et chaque indice à son fichier et à sa ligne
  And ses faits nomment `src/legacy`, qu'aucune partie ne couvre, comme dossier sans partie, et ne nomment ni `test`, ni `node_modules`

Scenario: La skill d'identification dit comment lire une cible Node
  Given un paquet npm et une exigence d'architecture à l'état des lieux
  When l'intervention qui propose la carte est ouverte
  Then la skill d'identification qu'elle reçoit nomme ce qu'il faut lire d'un projet Node : `package.json`, les déclarations `import` et `require`, les dossiers des sources et les alias de `tsconfig.json`
  And elle nomme les signes de chacun des styles `layered`, `onion`, `simple` et `other` dans un projet Node, et ceux de ses données, de ses préoccupations transverses et de son déploiement
  And sa provenance dit que cette part est écrite par 495, aucune des deux sources ne couvrant Node

Scenario: La décision dit ce qu'adopter la carte fait vérifier, et par quoi
  Given le paquet de la story et une carte proposée qui tient devant le code
  When la décision est présentée au propriétaire
  Then l'issue d'adoption nomme `dependency-cruiser` 18.5.0 et `@swc/core` 1.16.13, installés par npm comme dépendances de développement exactes dans une copie, sans script d'installation, réseau ouvert pour cette seule étape, et dit que la copie est inspectée et que rien n'est écrit dans le projet
  And elle nomme les règles qu'ils vérifieront : le style de chaque partie, les relations permises entre parties, l'absence de cycle et les sources qu'aucune partie ne couvre

Scenario: La carte adoptée est vérifiée, et chaque violation est localisée
  Given le paquet de la story, où `src/domain/model/user.ts`, du modèle du domaine, importe `src/domain/service/user-service.ts`, un service du domaine
  When le propriétaire adopte la carte
  Then `dependency-cruiser` 18.5.0 et `@swc/core` 1.16.13 sont installés, réseau ouvert pour cette seule étape, et le protocole gelé porte la carte et le contrôle d'architecture, qualifié par ses témoins
  And le `survey` mesure l'exigence d'architecture par ce contrôle, en FAIL, avec un constat qui nomme la règle enfreinte, le fichier `src/domain/model/user.ts` et la ligne de l'import
  And la section état des lieux du rapport donne ce constat avec sa règle, son fichier et sa ligne
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: Un paquet qui tient sa carte est mesuré en PASS
  Given le paquet de la story, sans aucun import que la carte interdit, et dont chaque dossier de sources a une partie
  When le propriétaire adopte la carte
  Then le `survey` mesure l'exigence d'architecture par le contrôle d'architecture, en PASS, sans constat

Scenario: Une architecture mixte est vérifiée partie par partie, alias compris
  Given un paquet npm sous TypeScript 7.0.2 des dossiers `src/orders`, `src/admin` et `src/shared`, dont `tsconfig.json` déclare l'alias `@orders/*` vers `src/orders/*`
  And une carte adoptée où `orders` est en oignon, `admin` en couches `web`, `service` et `data`, `shared` simple, et où `orders` et `admin` peuvent dépendre de `shared` et pas l'un de l'autre
  And un fichier de `src/admin/service` qui importe un fichier de `orders` par l'alias `@orders/`, un fichier de `src/admin/data` qui importe un fichier de `src/admin/web`, et une source de `src/legacy` qu'aucune partie ne couvre
  When le contrôle d'architecture passe sur la référence
  Then il rend FAIL, avec un constat pour la relation d'`admin` vers `orders` que la carte ne permet pas et un pour l'appel de `data` vers `web`, chacun à son fichier et à la ligne de l'import, et un pour la source sans partie, à son fichier
  And aucun constat ne porte sur `shared`

Scenario: Le contrôle se qualifie sur un projet qui viole déjà sa carte, et les tests du projet n'en sont pas changés
  Given le paquet de l'architecture mixte, qui viole déjà sa carte et dont les tests passent
  When les contrôles sont qualifiés puis passent sur la référence
  Then le contrôle d'architecture est qualifié : son témoin positif passe, et son témoin négatif, un import que la carte interdit, échoue sur ses propres fichiers
  And le contrôle des tests du projet rend PASS sur la référence

Scenario: Un fichier du projet ne fait taire aucune règle de la carte
  Given le paquet de l'architecture mixte, qui porte un `.dependency-cruiser.cjs` sans aucune règle et un `.dependency-cruiser-known-violations.json` qui liste ses violations
  When le contrôle d'architecture est qualifié puis passe sur la référence
  Then le contrôle d'architecture est qualifié par ses témoins
  And la passe de référence rapporte la relation d'`admin` vers `orders`, l'appel de `data` vers `web` et la source de `src/legacy`

Scenario: Une passe qui n'a lu aucune source ne rend pas PASS
  Given une sortie de dependency-cruiser qui n'a lu aucun module, comme celle d'un paquet dont les sources sont toutes en `.mts`, que swc ne lit pas
  When le lecteur la lit
  Then le contrôle d'architecture rend INDETERMINATE, avec la raison que dependency-cruiser n'a lu aucune source, et aucun constat

Scenario: Une installation qui échoue garde la carte et n'ajoute aucun contrôle
  Given le paquet de la story, dont le registre npm est injoignable
  When le propriétaire adopte la carte
  Then le protocole gelé porte la carte adoptée, et aucun contrôle d'architecture
  And le `survey` nomme l'exigence d'architecture comme angle mort, avec la raison donnée par la sortie de npm

Scenario: Ce que la vérification de la carte d'une cible Node ne voit pas est nommé
  Given une carte adoptée d'un paquet npm
  When le propriétaire demande `/495 report` sur l'état des lieux
  Then la section état des lieux nomme, sous la carte, ce que sa vérification ne voit pas, chaque point avec sa raison : les sources `.mts` et `.cts`, que swc ne lit pas ; un lien établi sans `import` ni `require` d'un chemin écrit en toutes lettres (chemin calculé, injection, configuration d'un framework) ; les sources de test, que les règles de la carte ne jugent pas ; les paquets installés sous `node_modules`, que les règles de la carte n'opposent à aucune partie
  And elle le dit en anglais et en français

## 3. Sécurité

L'intervention qui propose la carte tourne comme pour une cible Maven : dans une copie de la référence, en
lecture seule, réseau fermé. Ce qu'elle lit du projet est une donnée (`D-41`), et aucune skill ni aucun
`AGENTS.md` du projet n'est chargé (`D-11`). La part Node de la skill est écrite par 495 et embarquée avec
elle. Un état des lieux d'architecture n'ouvre le réseau qu'à une seule étape : l'installation de
dependency-cruiser et de swc, adoptée avec la carte (`D-76`). npm les installe dans une copie, sans
exécuter de script d'installation. Le binaire natif de swc vient du paquet de la plateforme que npm choisit
(sondé : `@swc/core-darwin-arm64`, chargé sans script). La copie est inspectée comme pour le référentiel de
qualité : l'installation n'est acceptée que si elle ne modifie que `package.json`, `package-lock.json` et
`node_modules/`. Rien n'est écrit dans le projet. Le contrôle d'architecture tourne réseau fermé. Ses
règles sont écrites par 495 depuis la carte du protocole gelé, à chaque exécution, et désignées
explicitement à dependency-cruiser. Le `.dependency-cruiser.*` du projet n'est alors pas lu (sondé : un
fichier sans règle ne retire aucune violation). Son fichier de violations connues n'est lu que sous
`--ignore-known`, que 495 ne passe jamais, et le cache que l'outil tient sous `node_modules/.cache` ne sert
que si la commande ou la configuration le demande, ce que 495 ne fait pas. Le `tsConfig` du projet n'est lu que pour résoudre les
imports : sondé, ses `include` et `exclude` ne retirent aucune source de l'analyse. dependency-cruiser ne
connaît aucun commentaire qui fasse taire une règle dans une source. La carte n'est jamais lue dans l'arbre
(`D-25`, `D-87`). Les règles ne comptent pas parmi les tests du projet.

## 4. Tâches

### Tâche 1 — Un état des lieux d'architecture d'une cible Node demande une carte de ses dossiers et la présente

La technologie Node lit les dossiers de ses sources principales : ceux qui portent un fichier JavaScript ou
TypeScript qui n'est pas un test, hors de `node_modules` et de ce que ses outils écrivent. Ces dossiers
jouent pour la carte le rôle des paquets Java. Un état des lieux qui porte une exigence d'architecture
ouvre l'intervention qui propose la carte, confronte la carte à ces dossiers et aux lignes de la
référence, et la présente au propriétaire avec ses trois issues et les dossiers sans partie.

- Vérifie : `node --test test/v2-kernel/architecture-map-node-proposal.test.ts`
- Tient : `test/v2-kernel/architecture-map-node-proposal.test.ts`, « l'état des lieux de l'architecture d'un paquet npm demande au propriétaire d'adopter la carte proposée, avec trois issues et un fait par partie qui donne ses dossiers, son style, le rôle de chacun et ses indices à leur fichier et à leur ligne » et « le dossier src/legacy qu'aucune partie ne couvre est nommé sans partie, et ni test ni node_modules ne le sont »
- Rouge : la technologie Node ne déclare aucune capacité `structure` (`NODE_PLUGIN`, `src/adapters/stacks/node/node.ts`). Sa détection ne porte pas `main_packages`, si bien que `settleArchitectureMap` rend la main sans ouvrir d'intervention. L'exigence d'architecture devient l'angle mort « blind spot: no control of the target measures its nature (structure) », sans aucune décision.

### Tâche 2 — La skill d'identification dit comment lire une cible Node

La skill d'identification reçoit une part Node, écrite par 495. Elle dit ce qu'il faut lire : `package.json`,
les déclarations `import` et `require`, les dossiers des sources, les alias de `tsconfig.json`. Elle donne
les signes de chaque style dans un projet Node, et ceux de ses données, de ses préoccupations transverses
et de son déploiement pour la lecture du modèle. Sa description ne la réserve plus à Maven. Sa provenance
dit que cette part ne vient d'aucune des deux sources, qui ne couvrent pas Node.

- Vérifie : `node --test test/v2-kernel/architecture-map-node-skill.test.ts`
- Tient : `test/v2-kernel/architecture-map-node-skill.test.ts`, « la skill d'identification nomme, pour une cible Node, package.json, les déclarations import et require, les dossiers des sources et les alias de tsconfig.json, les signes des styles layered, onion, simple et other dans un projet Node et ceux de ses données, de ses préoccupations transverses et de son déploiement, et sa provenance dit que cette part est écrite par 495 »
- Rouge : `skills/architecture-map/SKILL.md` se décrit comme l'identification d'un projet Maven. Ce qu'elle fait lire se limite aux POM, aux déclarations `package` de `src/main/java` et aux imports Java, et elle ne nomme ni `package.json`, ni `require`, ni `tsconfig.json` (aucune occurrence). Sa provenance ne nomme que les deux sources.

### Tâche 3 — La sortie de dependency-cruiser se lit violation par violation

Un lecteur lit la sortie JSON de dependency-cruiser 18.5.0. Il donne un constat par violation, avec la
règle de la carte enfreinte, le fichier relatif à la copie et la ligne. La sortie ne donne pas la ligne
d'une violation, seulement le fichier qui importe et le chemin qu'il écrit (`unresolvedTo`, sondé) : le
lecteur la retrouve à l'import de ce chemin dans ce fichier. Un cycle est rapporté à un fichier du cycle, et
une source sans partie à son fichier. Le lecteur mesure la structure de tout l'arbre, et pas seulement les
lignes qu'un changement introduit. Une sortie où dependency-cruiser n'a lu aucun module rend INDETERMINATE,
comme une sortie absente ou illisible.

- Vérifie : `node --test test/v1-adapters/dependency-cruiser-report.test.ts`
- Tient : `test/v1-adapters/dependency-cruiser-report.test.ts`, « une sortie de dependency-cruiser donne un constat par violation, avec la règle de la carte, le fichier relatif à la copie et la ligne de l'import retrouvée dans ce fichier », « un cycle est rapporté à un fichier du cycle et une source sans partie à son fichier », « une sortie où dependency-cruiser n'a lu aucune source rend INDETERMINATE avec cette raison, et non PASS » et « une sortie absente ou illisible rend INDETERMINATE »
- Rouge : aucun lecteur de 495 ne connaît la sortie de dependency-cruiser. Ceux de la technologie Node sont `node-test`, `jest-json`, celui de lcov, `eslint-json`, `jscpd-json` et celui de Stryker. Un contrôle qui nommerait ce lecteur rend INDETERMINATE avec « parser … is not qualified » (`src/adapters/execution/runner.ts`), sans constat.

### Tâche 4 — Les règles de la carte sont vérifiées par dependency-cruiser sur un vrai paquet

Quand une carte est adoptée et qu'une copie porte dependency-cruiser 18.5.0 et `@swc/core` 1.16.13 installés
par 495, la technologie Node déclare le contrôle d'architecture, de nature structure, réseau fermé. Ses
règles sont écrites depuis la carte et désignées explicitement à dependency-cruiser, avec l'analyseur swc et
le `tsconfig.json` du projet quand il en a un. Un import de type compte comme une dépendance, comme une
référence de type pour ArchUnit. Les règles couvrent le style de chaque partie (anneaux de l'oignon, appels
permis entre couches), les relations permises entre parties, l'absence de cycle entre les dossiers de la
carte et les sources sans partie. Une partie `other` n'a que ses relations et ses cycles. Le témoin négatif
est un import que la carte interdit. Un témoin est jugé sur ses seuls fichiers, si bien qu'une violation déjà
présente dans le projet ne le disqualifie pas. Le contrôle des tests du projet ne lance pas ces règles.

- Vérifie : `node --test test/v4-platform/node-architecture.test.ts`
- Tient : `test/v4-platform/node-architecture.test.ts`, « sur le paquet des parties orders, admin et shared sous TypeScript 7.0.2, le contrôle d'architecture est qualifié par ses témoins bien que le projet viole sa carte, et la passe de référence rapporte la relation d'admin vers orders importée par l'alias @orders/ et l'appel de data vers web à leur fichier et à la ligne de l'import, et la source de src/legacy à son fichier, sans constat sur shared », « un .dependency-cruiser.cjs du projet sans règle et un .dependency-cruiser-known-violations.json qui liste ses violations laissent le contrôle qualifié, et la passe de référence rapporte les mêmes constats » et « sur ce paquet, le contrôle des tests du projet rend PASS »
- Rouge : la technologie Node ne déclare aucun contrôle d'architecture, même quand la copie porte dependency-cruiser : sa détection ne déclare que les contrôles des tests, de la couverture, de la mutation et de la qualité (`NODE_PLUGIN.capabilities`). Aucune règle ne s'écrit depuis une carte pour une cible Node, et aucun constat n'est rapporté.

### Tâche 5 — Adopter la carte installe dependency-cruiser et swc, et l'état des lieux mesure l'exigence d'architecture

La technologie Node offre la vérification de la carte adoptée : l'installation de dependency-cruiser 18.5.0
et de `@swc/core` 1.16.13 par npm, comme dépendances de développement exactes. La décision la nomme avec
les règles qu'elle vérifie, et dit ce que npm fait, ce que l'inspection accepte et que rien n'est écrit
dans le projet. À l'adoption, les deux paquets sont installés dans la copie, réseau ouvert pour cette seule
étape, et chaque fichier que l'inspection accepte est gardé comme complément, écrit dans chaque copie où un
contrôle tourne. Le protocole est gelé avec la carte et le contrôle d'architecture qualifié, et le `survey`
mesure l'exigence par ce contrôle. Une installation qui échoue gèle la carte sans contrôle, et l'exigence
devient un angle mort avec la raison de npm.

- Vérifie : `node --test test/v2-kernel/architecture-map-node-verification.test.ts`
- Tient : `test/v2-kernel/architecture-map-node-verification.test.ts`, « l'issue d'adoption de la carte d'un paquet npm nomme dependency-cruiser 18.5.0 et @swc/core 1.16.13, leur installation par npm comme dépendances de développement exactes dans une copie, sans script d'installation et réseau ouvert pour cette seule étape, l'inspection de la copie, et les règles qu'ils vérifieront », « l'adoption installe les deux paquets, gèle la carte et le contrôle d'architecture qualifié, et le survey mesure l'exigence d'architecture en FAIL avec un constat qui nomme la règle, src/domain/model/user.ts et la ligne de l'import, que le rapport donne aussi, sans changer le digest du projet », « sur un paquet qui tient sa carte, le survey mesure l'exigence en PASS sans constat » et « une installation qui échoue gèle la carte sans contrôle d'architecture et le survey nomme l'exigence comme angle mort avec la raison de npm »
- Rouge : après les tâches 1 à 4, la capacité `structure` de la technologie Node n'offre aucune vérification de la carte, et `NPM_PHRASES` (`src/adapters/stacks/node/install/npm-phrases.ts`) ne porte aucune phrase `architecture`. L'issue `adopt_map` se réduit à « Adopter la carte », et l'adoption rend l'angle mort « no control verifies the adopted architecture map, frozen as the architecture the project declares: the technology of the target offers no verification of a map ». `bringVerification` (`src/application/phases/architecture-map.ts`) n'installe qu'un paquet (`[install]`), exige une édition de fichier et ne garde comme compléments que ses éditions (`applyRecommendedEdits`). Aucun fichier qu'une installation npm accepte sous `node_modules/` n'atteint donc une copie.

### Tâche 6 — Ce que la vérification de la carte d'une cible Node ne voit pas est nommé

La technologie Node déclare, avec la vérification qu'elle offre, ce que celle-ci ne voit pas, chaque point
avec sa raison : les sources `.mts` et `.cts`, que swc ne lit pas sous dependency-cruiser 18.5.0 (sondé :
`depcruise --info` les marque non lues, et une source `.mts` n'apparaît pas parmi les modules) ; les liens
établis sans `import` ni `require` d'un chemin écrit en toutes lettres ; les sources de test ; les paquets
installés sous `node_modules`. La liste est gelée avec la carte adoptée, et la section état des lieux du
rapport la donne sous la carte, en anglais et en français.

- Vérifie : `node --test test/v2-kernel/architecture-map-node-unseen.test.ts`
- Tient : `test/v2-kernel/architecture-map-node-unseen.test.ts`, « la section état des lieux d'une carte adoptée d'un paquet npm nomme, sous la carte et chacun avec sa raison, les sources .mts et .cts, les liens établis sans import ni require d'un chemin écrit en toutes lettres, les sources de test et les paquets installés sous node_modules, en anglais et en français »
- Rouge : après la tâche 5, l'offre de vérification de la technologie Node ne porte pas `unseen`. `adoptMap` (`src/application/phases/architecture-map.ts`) ne gèle alors aucune liste, et `architectureSection` (`src/application/report.ts`) n'écrit sous la carte que ses parties et ses dossiers sans partie.

## 5. Hors périmètre

- Comparer les dépendances que `package.json` déclare à celles que le code utilise, avec Knip 6.40.0
  (`D-87` §4) : une story suivante de `e11`, que le plan ne porte pas encore. Celle-ci livre déjà la carte
  et sa vérification, et y joindre Knip en ferait deux.
- eslint-plugin-boundaries 7.2.0 : écarté par la mesure de `D-87` (section 1). Sur un projet sans
  TypeScript il marcherait, mais un seul outil vérifie toutes les cibles Node.
- Lire les sources `.mts` et `.cts` : swc ne les lit pas sous dependency-cruiser 18.5.0, et l'analyseur
  TypeScript qui les lirait n'a pas d'API sous TypeScript 7. La story les nomme parmi ce que la
  vérification ne voit pas.
- Un dépôt à plusieurs paquets (`workspaces` de npm) : la carte découpe les dossiers du paquet racine.
  Prendre chaque paquet comme une partie, comme un module Maven, reste à faire.
- Un projet géré par pnpm, yarn ou bun, ou sans `package-lock.json` : l'installation par npm le refuse déjà
  pour le référentiel de qualité, et le refus s'applique à la vérification de la carte, qui reste alors un
  angle mort nommé.
- Un projet qui déclare déjà dependency-cruiser, Sheriff ou Nx, ou sa propre configuration de règles :
  lire ces règles comme une architecture déclarée relève de la même suite que Spring Modulith et jMolecules
  (`D-87` §4). Ses propres outils restent les siens.
- Juger un candidat avec la carte : la carte est gelée dans le protocole de l'état des lieux qui l'adopte
  (`e11s01`).
- Proposer comme règle un anti-pattern relevé par une revue de patterns, et la recommandation : `e11s05`.
  Corriger les violations ou planifier une migration : `e11s06`.
- Effacer du cache de npm ce que l'installation y a écrit : c'est le cache de la machine, comme le dépôt
  local de Maven (`e12s09`).
