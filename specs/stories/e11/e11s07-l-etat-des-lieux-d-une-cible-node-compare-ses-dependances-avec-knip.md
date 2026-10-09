# L'état des lieux d'une cible Node compare les dépendances que package.json déclare à celles que son code utilise, avec Knip, chaque écart localisé

Story : e11s07
Epic : e11
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Node qui a adopté la carte de son architecture voit chaque violation de ses
règles (`e11s04`). Il ne sait pas pour autant si son `package.json` dit vrai. Prenons un adaptateur qui
importe `pg` sans que `package.json` le déclare : il le reçoit d'un autre paquet installé, et le jour où ce
paquet cesse d'en dépendre, l'adaptateur ne se charge plus. Prenons aussi un `package.json` qui déclare
`lodash` sans qu'aucune source ne l'utilise. L'état des lieux d'une cible Maven dit l'un et l'autre depuis
`e11s03` ; celui d'une cible Node ne dit ni l'un ni l'autre, alors que `D-87` §4 nomme pour Node l'outil de
cette troisième vérification.

Avec cette story, adopter la carte d'une cible Node fait aussi vérifier la règle : le paquet déclare dans
`package.json` les dépendances que son code utilise, et utilise celles qu'il déclare. Knip 6.40.0 la
vérifie, réseau fermé, avec la configuration que 495 écrit et non celle du projet. Il lit TypeScript sans
l'API de TypeScript (son analyseur est oxc), si bien qu'il marche sous TypeScript 7 (sondé le 2026-10-09
sur un paquet sous TypeScript 7.0.2, alias de `tsconfig.json` compris). Chaque écart est localisé : un
usage non déclaré à l'import qui le fait, une déclaration inutilisée à sa ligne de `package.json`. Ce que
la vérification ne voit pas s'ajoute, chaque point avec sa raison, à ce que la section état des lieux nomme
déjà sous la carte.

## 2. Promesses

Scenario: La décision dit ce qu'adopter la carte d'une cible Node fait vérifier des dépendances, et par quoi
  Given le paquet npm `users` de la story, dont la carte proposée tient devant le code
  When la décision est présentée au propriétaire
  Then l'issue d'adoption nomme aussi Knip 6.40.0, installé par npm dans la même étape que dependency-cruiser et `@swc/core`, comme dépendance de développement exacte dans une copie, réseau ouvert pour cette seule étape
  And elle nomme la règle qu'il vérifiera : le paquet déclare dans `package.json` les dépendances que son code utilise, et utilise celles qu'il déclare

Scenario: Les dépendances déclarées sont comparées à celles que le code utilise, chaque écart localisé
  Given le paquet `users`, où `src/adapters/db/sql-user-repository.ts` importe `pg` sans que `package.json` le déclare, et où `package.json` déclare `lodash` sans qu'aucune source ne l'utilise
  When le propriétaire adopte la carte
  Then le protocole gelé porte, à côté du contrôle d'architecture, le contrôle des dépendances, qualifié par ses témoins
  And le `survey` mesure l'exigence d'architecture par ces deux contrôles, le contrôle des dépendances en FAIL
  And un constat dit que le paquet utilise `pg` sans le déclarer, au fichier `src/adapters/db/sql-user-repository.ts` et à la ligne de l'import de `pg`
  And un constat dit que le paquet déclare `lodash` sans l'utiliser, au fichier `package.json` et à la ligne de cette déclaration
  And la section état des lieux du rapport donne ces deux constats avec leur fichier et leur ligne
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: Un paquet qui déclare ce que son code utilise est mesuré en PASS
  Given le paquet `users`, où `package.json` déclare `pg` et ne déclare plus `lodash`
  When le propriétaire adopte la carte
  Then le `survey` mesure l'exigence d'architecture par le contrôle des dépendances en PASS, sans constat

Scenario: Chaque source est lue, même celle qu'aucun point d'entrée n'atteint
  Given le paquet `users`, qui ne déclare ni `main`, ni `exports`, ni `bin`, où `package.json` déclare `lodash` et où seul `src/legacy/old-users.js`, qu'aucune autre source n'importe, le charge
  When le contrôle des dépendances passe sur la référence
  Then aucun constat ne porte sur `lodash`
  And le constat de l'usage de `pg` sans déclaration est rapporté à `src/adapters/db/sql-user-repository.ts`

Scenario: Les paquets que 495 installe dans la copie ne sont pas des écarts du projet
  Given une copie du paquet `users` où 495 a installé dependency-cruiser 18.5.0, `@swc/core` 1.16.13 et Knip 6.40.0 comme dépendances de développement
  When le contrôle des dépendances passe sur la référence
  Then aucun constat ne porte sur dependency-cruiser, sur `@swc/core` ni sur Knip

Scenario: Le contrôle se qualifie sur un paquet qui enfreint déjà la règle
  Given le paquet `users`, qui importe `pg` sans le déclarer, et dont les tests passent sous `node --test`
  When les contrôles sont qualifiés puis passent sur la référence
  Then le contrôle des dépendances est qualifié : son témoin négatif, une source de test qui importe un paquet que `package.json` ne déclare pas, échoue à son propre fichier
  And le contrôle des tests du projet rend PASS sur la référence

Scenario: Les fichiers de configuration de Knip du projet ne font taire aucun écart et ne s'exécutent pas
  Given le paquet `users`, avec un `knip.json` qui fait ignorer `lodash` et `pg`, un `knip.ts` qui fait ignorer `lodash` et écrit un fichier quand il est chargé, et un `.gitignore` qui liste `src/adapters/`
  When le contrôle des dépendances est qualifié puis passe sur la référence
  Then le contrôle des dépendances est qualifié par ses témoins
  And la passe de référence rapporte l'usage non déclaré de `pg` et la déclaration inutilisée de `lodash`
  And le fichier que `knip.ts` écrirait n'existe pas

Scenario: La clé knip de package.json ne fait taire aucun écart
  Given le paquet `users`, dont `package.json` porte une clé `knip` qui fait ignorer la dépendance `lodash` et les sources `src/adapters/**`
  When le contrôle des dépendances est qualifié puis passe sur la référence
  Then le contrôle des dépendances est qualifié par ses témoins
  And la passe de référence rapporte l'usage non déclaré de `pg` et la déclaration inutilisée de `lodash`

Scenario: Ce que la vérification des dépendances d'une cible Node ne voit pas est nommé
  Given une carte adoptée d'un paquet npm
  When le propriétaire demande `/495 report` sur l'état des lieux
  Then la section état des lieux nomme, sous la carte et à côté de ce qu'elle nomme déjà, chaque point avec sa raison : une dépendance chargée par un chemin calculé, ou seulement par la configuration d'un outil dont Knip ne connaît pas le format, donnée comme inutilisée ; les binaires que les scripts de `package.json` appellent, qui ne sont pas comparés aux dépendances déclarées ; les paquets que 495 installe dans la copie, écartés de l'analyse
  And elle le dit en anglais et en français

## 3. Sécurité

La vérification des dépendances n'ouvre le réseau à aucune étape de plus que celle de dependency-cruiser
(`e11s04`) : Knip 6.40.0 est installé dans la même étape que dependency-cruiser et `@swc/core`, comme
dépendance de développement exacte, sans script d'installation (sondé : il s'installe et tourne avec
`--ignore-scripts`, son analyseur natif venant d'une dépendance optionnelle propre à la plateforme). La copie
est inspectée comme pour dependency-cruiser : l'installation n'est acceptée que si elle ne modifie que
`package.json`, `package-lock.json` et `node_modules/`. Rien n'est écrit dans le projet. Le contrôle des
dépendances tourne réseau fermé, lancé depuis le `node_modules` de la copie et jamais depuis le PATH de
l'hôte.

Knip lit sa configuration dans le projet, et chacune de ses sources fait taire un écart (sondé, une par une,
sur Knip 6.40.0) : `knip.json` et ses variantes, `knip.ts` et `knip.config.ts`, que Knip exécute pour les
lire, la clé `knip` de `package.json`, et `.gitignore`, dont Knip ne lit pas les fichiers listés. 495 désigne
à Knip la configuration qu'il écrit hors de la copie : aucun fichier de configuration de Knip du projet n'est
alors lu, et `knip.ts` n'est pas exécuté (sondé). Knip fusionne pourtant la clé `knip` de `package.json` sous
cette configuration, clé par clé (`Object.assign`, `dist/util/create-options.js`) ; la configuration de 495
fixe donc chaque clé qu'elle pourrait poser. `.gitignore` n'est pas suivi. La règle est celle que le
propriétaire a adoptée avec la carte, et non celle que le projet configure pour son propre usage.

Pour savoir quelles dépendances les outils d'un projet utilisent, Knip charge leurs fichiers de
configuration, ce qui exécute ceux qui sont du code. Le contrôle des tests du projet exécute déjà son code :
le contrôle des dépendances tourne dans le même bac à sable, réseau fermé, et n'écrit pas dans `package.json`
ni sous `node_modules/`. La carte n'est jamais lue dans l'arbre (`D-25`, `D-87`).

## 4. Tâches

### Tâche 1 — La sortie de Knip se lit écart par écart

Un lecteur lit la sortie JSON de Knip 6.40.0 (`--reporter json`). Il donne un constat par écart, avec sa
règle et la dépendance. Une dépendance déclarée et inutilisée, qu'elle soit déclarée parmi les
`dependencies`, les `devDependencies` ou les dépendances pairs optionnelles, est localisée à sa ligne de
`package.json`. Knip ne donne cette ligne que lorsque la déclaration occupe la sienne (sondé : un
`package.json` écrit sur une seule ligne n'en porte aucune) ; le lecteur la retrouve alors dans
`package.json`. Un usage non déclaré est localisé au fichier et à la ligne que Knip donne. Le lecteur juge
tout l'arbre. Une sortie absente ou illisible rend INDETERMINATE.

- Vérifie : `node --test test/v1-adapters/knip-report.test.ts`
- Tient : `test/v1-adapters/knip-report.test.ts`, « la sortie de Knip donne un constat pour l'usage de pg sans déclaration, à src/adapters/db/sql-user-repository.ts et à la ligne de l'import, et un pour la déclaration inutilisée de lodash, à sa ligne de package.json », « une déclaration dont Knip ne donne pas la ligne est localisée à sa ligne de package.json » et « une sortie absente ou illisible rend INDETERMINATE »
- Rouge : aucun lecteur de 495 ne connaît la sortie de Knip. Ceux de la technologie Node sont `node-test`, `jest-json`, celui de lcov, `eslint-json`, `jscpd-json`, celui de Stryker et `dependency-cruiser-json` (`NODE_PLUGIN.readers`, `src/adapters/stacks/node/node.ts`). Un contrôle qui nommerait ce lecteur rend INDETERMINATE avec « parser … is not qualified » (`src/adapters/execution/runner.ts`), sans constat.

### Tâche 2 — Le contrôle des dépendances vérifie un vrai paquet

Quand une carte est adoptée et qu'une copie porte Knip 6.40.0 installé par 495 à côté de dependency-cruiser
et de `@swc/core`, la technologie Node déclare aussi le contrôle des dépendances, de nature structure et non
différentiel, réseau fermé. Il désigne à Knip la configuration que 495 écrit : les écarts comparés sont les
dépendances déclarées inutilisées et les usages non déclarés ; chaque source du paquet, hors de
`node_modules` et de ce que ses outils écrivent, est un point d'entrée, si bien qu'une source qu'aucune autre
n'importe est lue ; les paquets que 495 installe dans la copie sont écartés. Le témoin négatif est une
source de test qui importe un paquet que `package.json` ne déclare pas. Le contrôle des tests du projet ne
lance pas Knip.

- Vérifie : `node --test test/v4-platform/node-dependencies.test.ts`
- Tient : `test/v4-platform/node-dependencies.test.ts`, « sur le paquet users sous TypeScript 7.0.2, sans main ni exports, le contrôle des dépendances est qualifié par ses témoins bien que le paquet enfreigne la règle, et la passe de référence rapporte l'usage de pg à la ligne de son import dans src/adapters/db/sql-user-repository.ts et la déclaration inutilisée de lodash à sa ligne de package.json, sans constat sur dependency-cruiser, @swc/core ni Knip », « une dépendance que seule src/legacy/old-users.js charge n'est pas donnée comme inutilisée », « un knip.json et un knip.ts du projet qui font ignorer lodash et pg laissent le contrôle qualifié, la passe de référence rapporte les deux écarts et le fichier que knip.ts écrirait n'existe pas » et « sur ce paquet, le contrôle des tests du projet rend PASS »
- Rouge : la technologie Node ne déclare aucun contrôle des dépendances, même quand la copie porte Knip : `NODE_STRUCTURE.offer` (`src/adapters/stacks/node/structure/node-structure.ts`) ne déclare que le contrôle `architecture` de dependency-cruiser, avec son seul témoin. Aucun contrôle ne lance Knip, et l'usage de `pg` sans déclaration n'est rapporté nulle part.

### Tâche 3 — La clé knip de package.json et .gitignore ne font taire aucun écart

La configuration que 495 désigne à Knip fixe chaque clé que la clé `knip` de `package.json` pourrait poser,
et Knip ne suit pas `.gitignore`.

- Vérifie : `node --test test/v4-platform/node-dependencies-configuration.test.ts`
- Tient : `test/v4-platform/node-dependencies-configuration.test.ts`, « une clé knip de package.json qui fait ignorer lodash et src/adapters/** laisse le contrôle des dépendances qualifié et la passe de référence rapporte l'usage de pg et la déclaration inutilisée de lodash » et « un .gitignore qui liste src/adapters/ laisse le contrôle qualifié et la passe de référence rapporte l'usage de pg »
- Rouge : Knip 6.40.0 fusionne la clé `knip` de `package.json` sous la configuration qu'on lui désigne, clé par clé (`Object.assign({}, manifest.knip, …)`, `dist/util/create-options.js`). Sondé sur un paquet jetable : sous une configuration désignée vide, `ignoreDependencies: ["lodash"]` tait la déclaration inutilisée et `ignore: ["src/admin/**"]` l'usage non déclaré de `chalk` ; une configuration qui pose ces clés vides rend les deux écarts. Un `.gitignore` qui liste `src/admin/` tait de même l'usage de `chalk`, et `--no-gitignore` le rend. La configuration de la tâche 2 ne fixe que ce que la règle demande.

### Tâche 4 — Adopter la carte d'une cible Node installe Knip, et l'état des lieux mesure les dépendances

La vérification que la technologie Node offre à l'adoption apporte Knip 6.40.0 avec dependency-cruiser et
`@swc/core`, dans la même installation. L'issue d'adoption le nomme, avec la règle qu'il vérifie. À
l'adoption, les trois paquets sont installés dans la copie, et le protocole est gelé avec le contrôle
d'architecture et le contrôle des dépendances, qualifiés. Le `survey` mesure l'exigence d'architecture par
l'un et par l'autre, et chaque écart atteint le rapport avec son fichier et sa ligne.

- Vérifie : `node --test test/v2-kernel/architecture-map-node-dependencies.test.ts`
- Tient : `test/v2-kernel/architecture-map-node-dependencies.test.ts`, « l'issue d'adoption de la carte d'un paquet npm nomme Knip 6.40.0, son installation dans la même étape que dependency-cruiser et @swc/core, et la règle qu'il vérifie », « l'adoption installe les trois paquets en une étape, gèle le contrôle des dépendances qualifié, et le survey mesure l'exigence d'architecture par architecture et par dependencies, ce dernier en FAIL avec l'usage de pg à src/adapters/db/sql-user-repository.ts et la déclaration inutilisée de lodash à package.json, que le rapport donne aussi, sans changer le digest du projet » et « sur un paquet qui déclare ce que son code utilise, le survey mesure l'exigence par dependencies en PASS sans constat »
- Rouge : `cruiserOffer` (`src/adapters/stacks/node/structure/architecture-control.ts`) n'apporte avec dependency-cruiser que `@swc/core` (`MAP_ANALYSERS`), et `NPM_PHRASES.architecture` (`src/adapters/stacks/node/install/npm-phrases.ts`) ne porte aucune phrase `alongside`. L'issue d'adoption ne nomme que dependency-cruiser et `@swc/core`, l'installation ne demande qu'eux, et le `survey` mesure l'exigence d'architecture par `architecture` seul.

### Tâche 5 — Ce que la vérification des dépendances d'une cible Node ne voit pas est nommé

La technologie Node ajoute à ce que sa vérification ne voit pas, chaque point avec sa raison : une
dépendance chargée par un chemin calculé, ou seulement par la configuration d'un outil dont Knip ne connaît
pas le format, donnée comme inutilisée ; les binaires que les scripts de `package.json` appellent, que 495 ne
compare pas aux dépendances déclarées ; les paquets que 495 installe dans la copie, écartés de l'analyse. La
liste est gelée avec la carte adoptée, et la section état des lieux du rapport la donne sous la carte, en
anglais et en français.

- Vérifie : `node --test test/v2-kernel/architecture-map-node-dependencies-unseen.test.ts`
- Tient : `test/v2-kernel/architecture-map-node-dependencies-unseen.test.ts`, « la section état des lieux d'une carte adoptée d'un paquet npm nomme, sous la carte et chacun avec sa raison, les dépendances chargées par un chemin calculé ou par la configuration d'un outil que Knip ne connaît pas, les binaires des scripts de package.json et les paquets que 495 installe dans la copie, en anglais et en français »
- Rouge : `MAP_VERIFICATION_UNSEEN` (`src/adapters/stacks/node/structure/map-verification-unseen.ts`) ne nomme que les quatre points de dependency-cruiser : les sources `.mts` et `.cts`, les liens sans chemin écrit en toutes lettres, les sources de test et les paquets sous `node_modules`. Aucun ne parle des dépendances que `package.json` déclare.

## 5. Hors périmètre

- Comparer aux dépendances déclarées les binaires que les scripts de `package.json` appellent (type
  `binaries` de Knip) : un script appelle souvent un outil de la machine que le paquet n'a pas à déclarer.
  La story le nomme parmi ce que la vérification ne voit pas.
- Les imports qui ne se résolvent pas (type `unresolved`) et les exports, fichiers et membres inutilisés que
  Knip sait aussi relever : ils ne disent rien des dépendances déclarées, et aucune règle adoptée ne les
  demande (`D-87` §4).
- Dire qu'une dépendance utilisée par le seul code de test devrait être une dépendance de développement
  (`--production` de Knip) : la règle de `D-87` compare ce qui est déclaré à ce qui est utilisé, pas la
  section où c'est déclaré.
- Une clé `knip` de `package.json` que Knip refuse (une clé inconnue de son schéma) : Knip s'arrête alors
  sans sortie, et le contrôle rend INDETERMINATE, pas PASS. Elle ne vise pas le projet mais 495.
- Un dépôt à plusieurs paquets (`workspaces` de npm) : la carte ne découpe que le paquet racine (`e11s04`).
- Un projet géré par pnpm, yarn ou bun : l'installation par npm le refuse déjà, et la vérification de la
  carte reste un angle mort nommé (`e11s04`).
- La lecture du modèle sur les données, les préoccupations transverses et le déploiement d'une cible Node :
  la skill d'identification en porte la part Node depuis `e11s04`.
- Juger un candidat avec la carte ou avec ses dépendances : la carte est gelée dans le protocole de l'état
  des lieux qui l'adopte (`e11s01`).
- Mesurer le jalon d'une migration sur l'état des lieux du projet intégré (`ARC-05`), et proposer comme
  règle de la carte un anti-pattern de la revue : deux suites de `e11` que le plan ne porte pas encore
  (`e11s05`, `e11s06`).
- Effacer du cache de npm ce que l'installation y a écrit : c'est le cache de la machine (`e12s09`).
