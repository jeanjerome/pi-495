# Une technologie fictive, déclarée dans un seul dossier avec son propre format de rapport, conduit un changement jusqu'à l'acceptation

Story : e37s01
Epic : e37
Statut : à faire

## 1. Ce que le lecteur gagne

Celui qui ajoute une technologie à 495 — Python, Go, Gradle — doit aujourd'hui ouvrir le code générique à
plusieurs endroits, même quand ses contrôles et ses témoins sont prêts. Le format de son rapport doit entrer
dans la liste fermée du contrat (`PARSER_IDS`). Le lanceur de contrôles doit lui ajouter une branche
(`switch (control.parser)`, `src/adapters/execution/runner.ts:159`). L'état des lieux doit lui donner une
nature (`PARSER_NATURES`, `src/domain/survey.ts:82`), et la vérification doit savoir s'il juge les lignes
introduites (`DIFFERENTIAL_PARSER_IDS`). Le registre des technologies importe Maven et Node par leur nom
(`src/application/target.ts:12`). Les deux technologies existantes tiennent chacune dans un seul fichier :
897 lignes pour Node, 1 015 pour Maven.

Il gagne une interface qu'une technologie implémente dans son dossier, lecteurs de rapports compris, et un
noyau qui reçoit la liste des technologies au lieu de la connaître. C'est un défaut et non une
préférence : `D-75` promettait qu'une technologie s'ajoute par un seul module, `e12s01` ne l'a tenu que pour
la détection, et `D-86` fait de cette promesse la règle de toute la chaîne. Cette story la tient pour la
détection, les contrôles et la lecture des rapports. Le reste de la chaîne vient avec `e37s02` et `e37s03`.

## 2. Promesses

Scenario: Une technologie fictive conduit un changement jusqu'à l'acceptation
  Given un projet qui porte `fict.toml` et aucun fichier que Maven ou Node reconnaît
  And une technologie fictive, déclarée dans le seul fichier du test, qui reconnaît `fict.toml`, déclare un contrôle de tests dont la commande écrit un rapport au format `fict-lines` (une ligne `PASS <cas>` ou `FAIL <cas>: <raison>` par cas), ses témoins, et le lecteur `fict-lines` de version `1.0.0`, de nature `behaviour`
  And la liste des technologies remise au noyau est celle de 495 suivie de la technologie fictive
  When un agent scripté mène un changement jusqu'à son acceptation
  Then la qualification du contrôle fictif est `qualified: true`, son témoin positif `PASS` et son témoin négatif `FAIL`, lus par le lecteur `fict-lines`
  And la preuve du candidat pour ce contrôle est `PASS`, et sa `control_version` vaut `1+fict-lines@1.0.0`
  And le changement est accepté

Scenario: Un état des lieux lit la nature d'un contrôle dans le lecteur que sa technologie déclare
  Given une technologie fictive qui déclare le lecteur `fict-lines`, de nature `behaviour`, et le lecteur `fict-cov`, de nature `coverage`, qui ne juge que les lignes introduites
  When l'état des lieux classe ses contrôles pour une exigence `functional` et pour une exigence `coverage`
  Then l'exigence `functional` est mesurée par le contrôle qui lit `fict-lines`
  And le contrôle qui lit `fict-cov` est nommé comme angle mort de la référence : « it measures only the lines a change introduces, and the reference introduces none »

Scenario: Le contrat accepte un lecteur qu'il ne connaît pas
  Given le contrat publié `contracts/v1/control-definition.json`
  Then le champ `parser` est une chaîne non vide, sans énumération
  And une définition de contrôle dont le `parser` vaut `fict-lines` est valide

## 3. Sécurité

Un rapport est écrit par le projet jugé : c'est une entrée non fiable, et un lecteur apporté par une technologie
ne doit pas pouvoir contourner les bornes qui la tiennent. Le lanceur garde la lecture des fichiers et la donne
au lecteur : un chemin hors de la copie n'est jamais lu, un rapport au-delà de `MAX_REPORT_BYTES` est rendu
non lu avec sa taille, et chaque rapport lu est conservé dans le magasin d'objets comme aujourd'hui. Un lecteur
ne lance aucun processus, n'écrit rien dans la copie et ne lit aucune variable d'environnement.

Le protocole gelé continue d'enregistrer le lecteur et sa version dans la `control_version` de chaque preuve.
Un protocole qui nomme un lecteur qu'aucune technologie chargée n'apporte rend `INDETERMINATE` (« parser … is
not qualified »), jamais `PASS`. Les identifiants des lecteurs de Maven et de Node ne changent pas, et leurs
versions non plus : un dossier écrit avant se relit et se vérifie à l'identique.

## 4. Tâches

### Tâche 1 — Le contrat ne ferme plus la liste des lecteurs

`ControlDefinition.parser` (`src/contracts/v1/protocol.ts:161`) devient une chaîne non vide. `PARSER_IDS`,
`ParserId`, `DIFFERENTIAL_PARSER_IDS` et `LOCATED_PARSER_IDS` quittent le contrat : ce qu'ils disent passe au
lecteur (tâche 2). `npm run contracts` régénère `contracts/v1/control-definition.json` et
`contracts/v1/protocol.json`.

- Vérifie : `node --test test/v0-pure/open-reader-contract.test.ts`
- Tient : `test/v0-pure/open-reader-contract.test.ts`, « le champ `parser` de `contracts/v1/control-definition.json` est une chaîne non vide sans `enum`, et `validate(ControlDefinition, …)` accepte une définition dont le `parser` vaut `fict-lines` »
- Rouge : le schéma publié énumère les treize identifiants de `PARSER_IDS`, et `validate` refuse `fict-lines`, qui n'en fait pas partie

### Tâche 2 — La nature, le jugement des lignes introduites et la localisation d'un contrôle sont lus dans son lecteur

Un lecteur se déclare avec son identifiant, sa version, sa nature (`behaviour`, `coverage`, `mutation`,
`style`, `structure` ou aucune), s'il ne juge que les lignes introduites, et s'il juge ses témoins par
emplacement. Le type `ReportReader` est déclaré dans `src/ports/execution.ts`, avec `ParsedReport` et
`ParsedFinding` qui y passent depuis `src/adapters/execution/parsers.ts`. `controlsOfNature` et `surveyOf`
(`src/domain/survey.ts`), et `src/application/verification.ts` lisent ces caractères dans la déclaration du
lecteur que nomme le contrôle, reçue en paramètre. `PARSER_NATURES` et `isDifferentialParser` disparaissent,
et `judgesWitnessesByLocation` lit le lecteur lui aussi. Les lecteurs de Maven et de Node déclarent les
caractères que ces tables leur donnaient.

- Vérifie : `node --test test/v0-pure/reader-traits.test.ts`
- Tient : `test/v0-pure/reader-traits.test.ts`, « pour une exigence `functional`, `controlsOfNature` rend le contrôle qui lit `fict-lines`, déclaré de nature `behaviour` ; `surveyOf` nomme le contrôle qui lit `fict-cov`, déclaré de nature `coverage` et différentiel, comme angle mort : "it measures only the lines a change introduces, and the reference introduces none" »
- Rouge : `PARSER_NATURES` n'a pas d'entrée pour `fict-lines` ; `controlsOfNature` rend l'angle mort « no control of the target measures its nature (behaviour) », et `surveyOf` ne tient pas `fict-cov` pour différentiel

### Tâche 3 — La liste des technologies est remise au noyau, et chaque technologie apporte ses lecteurs

`StackAdapter` (`src/application/stacks/stack.ts`) déclare les lecteurs de la technologie. Le lanceur
(`GenericControlRunner`) reçoit les lecteurs à sa construction et choisit celui que nomme le contrôle : il n'y
a plus de `switch` sur l'identifiant. Il garde la lecture bornée des rapports et des sources introduites, et la
conservation des rapports lus, qu'il offre au lecteur. Les deux préparatifs propres à un lecteur, écrire le
jeu de règles d'un analyseur (`rulesetOf`) et restreindre une mutation aux lignes introduites avant de lancer
la commande, deviennent des capacités optionnelles du lecteur. Les formats que plusieurs technologies
écrivent — code de sortie, JUnit XML, LCOV — restent des lecteurs communs sous `src/adapters/execution/`.

`detectStack` (`src/application/target.ts`) n'a plus de liste par défaut et n'importe aucune technologie.
`HarnessDeps` reçoit la liste des technologies, que les phases emploient (`phases/verification-design.ts`,
`phases/prepare.ts`). `src/extension/runtime.ts` remet `[MAVEN_ADAPTER, NODE_ADAPTER]` au noyau et leurs
lecteurs, avec les lecteurs communs, au lanceur. `test/helpers/harness-fixture.ts` accepte une liste de
technologies dans ses options et la remet de même.

- Vérifie : `node --test test/v2-kernel/fictitious-stack.test.ts`
- Tient : `test/v2-kernel/fictitious-stack.test.ts`, « sur un projet qui ne porte que `fict.toml`, avec la liste de 495 suivie d'une technologie fictive déclarée dans ce seul fichier de test, un changement mené par un agent scripté a son contrôle fictif qualifié (`qualified: true`, témoin positif `PASS`, témoin négatif `FAIL`), une preuve `PASS` du candidat dont la `control_version` vaut `1+fict-lines@1.0.0`, et il est accepté »
- Rouge : le noyau ignore la liste qu'on lui remet et détecte avec la sienne, où rien ne reconnaît `fict.toml` ; le projet est de stack `unknown`, et la qualification arrête le changement en `CAPABILITY_MISSING` avec « no qualified target adapter for this project (pom.xml or package.json expected) »

### Tâche 4 — Maven et Node vivent chacun dans leur dossier, découpés par sujet, avec leurs lecteurs

À comportement constant. `src/application/stacks/maven.ts` et `node.ts` passent sous
`src/adapters/stacks/maven/` et `src/adapters/stacks/node/`, découpés par sujet : détection, contrôles et
lanceurs, couverture, mutation, référentiel de qualité, témoins, structure. Chaque lecteur propre à une
technologie rejoint son dossier depuis `src/adapters/execution/` :
- pour Maven : JaCoCo (avec ses faits JVM), PIT, PMD et CPD avec leur jeu de règles, et l'analyse des imports Java ;
- pour Node : `node:test`, jest, ESLint et jscpd avec sa configuration, et Stryker.

Le cadrage d'une mutation sur les lignes introduites, commun aux deux technologies, reste sous
`src/adapters/execution/`. Ce qui y dépend de PIT ou de Stryker passe au lecteur concerné.
`mavenResolutionCommand` rejoint `src/application/installation.ts`, qui porte déjà la résolution d'un
complément Maven jusqu'à `e37s03`. Les tests suivent les nouveaux chemins sans perdre une assertion.
Le catalogue des composants (`specs/amont/conception-technique.md`) cite les nouveaux emplacements.

Le découpage suit les responsabilités, pas la taille. Chaque fichier d'un dossier de technologie a une seule
responsabilité, que son commentaire d'en-tête énonce en une phrase et que son nom dit. Par exemple, la
détection du lanceur de tests d'un `package.json`, la lecture d'un rapport JaCoCo, ou l'offre du référentiel
PMD. Il ne garde rien qui relève d'une autre responsabilité, et deux fichiers n'en partagent aucune. Un
lecteur de rapport est un fichier à lui. Une constante ou un type qui sert deux responsabilités va dans un
fichier commun au dossier, et non dans l'une des deux. La borne de 400 lignes n'est qu'un signal : un fichier
qui la dépasse porte presque sûrement deux responsabilités.

- Vérifie à la main : `grep -nE "jacoco|pitest|stryker|pmd|cpd|eslint|jscpd|jest|node-test|java-imports" src/adapters/execution/runner.ts` ne rend rien ; `wc -l src/adapters/stacks/*/*.ts` ne montre aucun fichier au-delà de 400 lignes ; la lecture des commentaires d'en-tête de `src/adapters/stacks/*/*.ts` trouve une seule responsabilité par fichier, sans deux fichiers qui en partagent une ; puis `npm run build`, `npm run check` vert avec au moins autant de tests qu'avant, et les deux campagnes de référence (`npm run campagne -- npm`, `npm run campagne -- maven`) vertes
- Tient : la recherche, vide ; le décompte des lignes ; la liste des responsabilités, une par fichier, lue dans les en-têtes et confrontée au contenu de chaque fichier ; la Preflight et les deux campagnes, vertes sur les mêmes verdicts qu'avant
- Rouge : `runner.ts` importe les lecteurs de JaCoCo, PIT, Stryker, PMD, CPD, ESLint, jscpd, jest, `node:test` et des imports Java (lignes 22 à 47) ; `maven.ts` fait 1 015 lignes et `node.ts` 897

## 5. Hors périmètre

- Ce qu'une technologie écarte de la copie (`DEFAULT_WORKSPACE_POLICY`), ce qu'elle protège (`node_modules/`), les variables d'environnement de ses contrôles (`BASE_ENV`), les versions d'outils sondées pour l'identité de l'environnement, la forme d'un fichier de test (`TEST_FILE_NAME`), la disposition des ressources de test (`mirrorsProductionResource`), les sources qu'attend le lecteur LCOV et les répertoires que les parcours de rapports sautent : `e37s02`.
- L'installation et la résolution d'un complément, leur inspection, le texte qui les présente au propriétaire et les modifications de fichier qu'un complément apporte : `e37s03`, qui retire aussi `mavenResolutionCommand` de `installation.ts`.
- Une règle de Preflight qui refuse qu'un module générique importe le dossier d'une technologie : `e37s03`, quand plus aucun module générique n'en a besoin.
- Une technologie chargée depuis un paquet tiers, hors de l'arbre de 495 : rien ne le demande ; la liste reste celle que la racine de composition remet.
