# Le référentiel et l'état des lieux d'une cible Node

Story : e10s03
Epic : e10
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Node qui demande « quel est l'état de la qualité du code ? » n'obtient
aujourd'hui qu'un angle mort, comme celui d'un projet Maven avant `e10s01`. L'adaptateur Node ne propose
aucun référentiel de qualité. Sans script `lint`, aucun contrôle ne mesure la complexité, le code mort ou
la duplication. Le rapport ne peut donc ni compter les écarts ni dire ce qui n'a pas été regardé.

Avec cette story, l'adaptateur Node propose un référentiel de départ qui mesure les mêmes natures que
celui de Maven, avec les analyseurs choisis par le propriétaire le 2026-10-03 : ESLint pour la complexité
et le code mort, jscpd pour la duplication. Chaque seuil est le défaut que l'outil documente :

| Nature | Règle | Seuil |
|---|---|---|
| complexité | ESLint `complexity` | une fonction dont la complexité cyclomatique dépasse 20 (défaut d'ESLint 10.12.0) |
| code mort | ESLint `no-unused-vars`, `no-unused-private-class-members` | toute occurrence |
| duplication | jscpd | un bloc d'au moins 50 jetons et 5 lignes (défauts de jscpd 5.4.0) |

ESLint 10.12.0 et jscpd 5.4.0 sont les dernières versions publiées au 2026-10-03. Adopté, le référentiel
est gelé dans le protocole, puis installé dans une copie de la cible, jamais dans le projet. L'état des
lieux mesure alors la question, compte les écarts par règle et nomme ce que le référentiel ne regarde
pas. Trois faits ont été mesurés le 2026-10-03 sur un projet jetable. Lancé sans option, jscpd lit le
`.jscpd.json` de l'arbre analysé et parcourt `node_modules` et les fichiers JSON. ESLint, lancé sans
recherche de configuration, ne lit que les fichiers `.js`, `.mjs` et `.cjs`. Le référentiel ne doit donc
dépendre d'aucun fichier de l'arbre (`D-25`), et ce qu'il ne lit pas doit être nommé.

## 2. Promesses

Scenario: Le référentiel proposé se présente règle par règle
  Given un projet Node avec un `package-lock.json`, sans script `lint`, dont le `package.json` ne déclare ni `eslint` ni `jscpd` et dont `scripts.test` nomme un lanceur que 495 sait lire
  When un état des lieux demande l'état de la qualité du code, et aucun contrôle ne mesure cette nature
  Then une décision demande au propriétaire s'il adopte le référentiel de qualité proposé pour Node, avec deux issues : l'adopter, ou laisser l'exigence en angle mort
  And ses faits donnent, pour chaque règle, sa nature, sa règle, son seuil, l'outil et sa version, la page de documentation qui la justifie et la date où ces données ont été établies
  And l'issue d'adoption dit que 495 installe `eslint` 10.12.0 et `jscpd` 5.4.0 comme dépendances de développement exactes dans une copie, sans script d'installation, réseau ouvert pour cette seule étape, sans rien écrire dans le projet

Scenario: Le référentiel adopté mesure la qualité du projet
  Given un projet Node dont un fichier `.js` porte une fonction de complexité cyclomatique 21, une fonction jamais appelée et un champ privé de classe jamais lu, et dont deux fichiers `.ts` portent le même bloc de plus de 50 jetons sur plus de 5 lignes
  When le propriétaire adopte le référentiel proposé
  Then le protocole gelé porte le référentiel, chaque règle avec son oracle (le contrôle et la règle), son seuil, sa source et la date de la décision d'adoption
  And les contrôles `eslint` et `jscpd` sont qualifiés par leurs témoins, bien que le code du projet viole déjà des règles
  And le `survey` mesure l'exigence de qualité par ces deux contrôles, en FAIL, avec un constat par violation qui nomme la règle, le fichier et la ligne, et pour la duplication les deux emplacements
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: Le rapport compte les écarts et nomme ce que le référentiel ne mesure pas
  Given l'état des lieux du scénario précédent, sur un projet dont le `package.json` déclare `lodash` en dépendance et `vitest` en dépendance de développement
  When le propriétaire demande `/495 report`
  Then la section état des lieux nomme chaque règle avec son oracle, son seuil, sa source et sa date d'adoption, et chaque violation sous la règle qui la mesure
  And elle donne pour le module `.` une violation du code propriétaire sous `complexity`, sous `no-unused-vars`, sous `no-unused-private-class-members` et sous `jscpd`
  And elle nomme comme non mesurés, chacun avec sa raison : les sources TypeScript et JSX, qu'ESLint ne lit pas sans analyseur dédié, pour la complexité et le code mort ; `lodash` et `vitest`, dépendances déclarées hors de l'arbre ; les fichiers d'un autre format que JavaScript et TypeScript, pour la duplication ; la séparation du code généré, faute de marque du code généré déclarée pour Node

Scenario: Un fichier de l'arbre ne change pas le référentiel
  Given le projet du deuxième scénario, avec en plus un `eslint.config.js` qui désactive `complexity`, un `.jscpd.json` qui porte `minTokens` à 5000, et sous `node_modules` deux paquets qui portent le même bloc
  When l'état des lieux mesure le projet avec le référentiel adopté
  Then le `survey` rapporte toujours la fonction de complexité 21 et la duplication entre les deux fichiers `.ts`
  And aucun constat ne nomme un fichier sous `node_modules`

Scenario: Ce qu'une vraie installation npm laisse est adopté et tourne dans chaque copie
  Given le projet du scénario précédent, dont le `node_modules` porte deux paquets que `package-lock.json` ne nomme pas, et un registre npm joignable
  When le propriétaire adopte le référentiel proposé, et npm installe `eslint` et `jscpd` dans une copie en élaguant ces deux paquets et en posant le binaire natif de jscpd avec son droit d'exécution
  Then l'installation est acceptée, et le protocole gelé porte le référentiel et chaque fichier installé avec le mode que l'installation lui a donné
  And dans chaque copie où tourne un contrôle, celles des témoins comprises, le binaire natif de jscpd est exécutable
  And les contrôles `eslint` et `jscpd` sont qualifiés par leurs témoins, G2 rend PASS, et le `survey` mesure l'exigence par ces deux contrôles en FAIL, sans qu'aucun constat ne nomme un fichier sous `node_modules`
  And une installation qui change ou retire un fichier d'un paquet que `package-lock.json` nommait avant elle reste refusée, avec le message qui nomme ce fichier

Scenario: Une installation qui échoue n'adopte rien
  Given un projet Node dont le registre npm est injoignable
  When le propriétaire adopte le référentiel proposé
  Then rien n'est adopté, aucun contrôle `eslint` ni `jscpd` n'est déclaré, et le `survey` nomme l'exigence comme angle mort avec la raison donnée par npm

Scenario: Une cible que npm ne peut pas étendre ne reçoit pas la question
  Given un projet Node sans `package-lock.json`
  When un état des lieux demande l'état de la qualité du code
  Then aucune décision n'est demandée, rien n'est installé, et le `survey` nomme l'exigence comme angle mort avec la raison que la cible n'a pas de `package-lock.json`

Scenario: Un projet qui déclare déjà ESLint ou jscpd ne reçoit pas le référentiel de 495
  Given un projet Node sans script `lint` dont le `package.json` déclare `eslint` en dépendance de développement et dont `scripts.test` nomme un lanceur que 495 sait lire
  When un état des lieux demande l'état de la qualité du code
  Then aucun référentiel n'est proposé, rien n'est installé, et l'exigence est un angle mort avec la raison que le projet déclare ESLint lui-même

Scenario: Un projet qui épingle lui-même les versions du référentiel et les a installées ne reçoit pas le référentiel de 495
  Given un projet Node sans script `lint`, dont `scripts.test` nomme un lanceur que 495 sait lire, dont le `package.json` épingle exactement `eslint` 10.12.0 et `jscpd` 5.4.0 en dépendances de développement, qui les a installés sous `node_modules` et qui porte son propre `eslint.config.js`
  When un état des lieux demande l'état de la qualité du code
  Then aucune décision d'adoption n'est demandée, rien n'est installé, et le protocole gelé ne porte ni référentiel ni contrôle `eslint` ou `jscpd`
  And le `survey` nomme l'exigence comme angle mort avec la raison que le projet déclare ESLint lui-même
  And la détection de ce projet ne déclare aucun contrôle `eslint` ni `jscpd`, quand celle d'une copie où l'adoption a installé le référentiel les déclare, parce que l'installation le lui dit et non parce que le `package.json` porte ces versions

Scenario: Une installation qui retire un fichier d'un paquet qu'un verrou en lockfileVersion 1 nommait est refusée
  Given un projet Node dont le `package-lock.json` est en lockfileVersion 1 et nomme sous `dependencies` le paquet `vitest`, et sous lui le paquet imbriqué `tinyspy`, et dont le `node_modules` porte `node_modules/vitest/index.js` et `node_modules/vitest/node_modules/tinyspy/index.js`
  When le propriétaire adopte le référentiel proposé, et l'installation npm retire de la copie l'un de ces deux fichiers
  Then l'installation est refusée, avec le message qui nomme le fichier retiré, comme quand le même verrou est en lockfileVersion 3
  And rien n'est adopté, et le `survey` nomme l'exigence comme angle mort avec ce message

## 3. Sécurité

Un état des lieux d'une cible Node ouvre le réseau à une seule étape : l'installation d'`eslint` et de
`jscpd` que le propriétaire a adoptée (`D-76`). Elle se fait dans une copie, aux versions exactes, sans
exécuter aucun script d'installation. Le binaire de jscpd 5.4.0 arrive par un paquet propre à la
plateforme, sans script. La copie est ensuite inspectée : l'installation n'est acceptée que si elle ne
change que `package.json`, `package-lock.json` et `node_modules/`, et si, sous `node_modules/`, elle ne
fait qu'ajouter des fichiers et retirer ceux des paquets que `package-lock.json` ne nommait pas avant
elle ; un fichier qui existait déjà n'est jamais changé, et un fichier d'un paquet que le verrou nommait
n'est jamais retiré, quelle que soit la version de ce verrou : un verrou en lockfileVersion 1 nomme ses
paquets sous `dependencies`, imbriqués compris, et un verrou qui ne porte ni `packages` ni `dependencies`
n'accepte aucun retrait sous `node_modules/`. Chaque fichier installé est gelé dans le protocole avec son
empreinte et le mode que l'installation lui a donné, et il est écrit avec ce mode dans chaque copie
où tourne un contrôle : un binaire natif y garde son droit d'exécution, et rien d'autre que ce que l'installation a laissé
exécutable ne le devient. Rien n'est écrit dans le projet. Les
contrôles `eslint` et `jscpd` ne sont déclarés que dans une copie où l'installation adoptée a posé le
référentiel, et c'est l'installation qui le dit, jamais le `package.json` : un projet qui épingle les mêmes
versions et les a installées ne les reçoit pas, et sa configuration n'est pas remplacée par les règles de
495. Ils tournent dans le bac à sable avec le réseau fermé, depuis le `node_modules`
de la copie et jamais depuis le PATH de l'hôte. Leurs règles et leurs seuils viennent du protocole gelé :
ni un `eslint.config.*`, ni un `.jscpd.json` de l'arbre analysé ne peut les remplacer, et jscpd ne lit pas
`node_modules`.

## 4. Tâches

### Tâche 1 — L'adaptateur Node déclare son référentiel, son périmètre et sa recommandation

L'adaptateur Node porte les règles du tableau. Chacune a sa nature, sa règle, son seuil, l'outil et sa
version, sa source et sa date d'établissement. Il déclare aussi son périmètre. Le paquet est mesuré comme
un seul module, `.`. Aucune marque du code généré n'est déclarée. Ce qui n'est pas mesuré l'est avec sa
raison : les sources TypeScript et JSX pour ESLint, chaque dépendance que `package.json` déclare, les
fichiers d'un autre format que JavaScript et TypeScript pour jscpd, et la séparation du code généré.
Pour un `package.json` qui ne déclare ni `eslint` ni `jscpd`, il recommande leur installation aux
versions du référentiel. Un `package.json` qui déclare l'un des deux ne reçoit ni recommandation ni
référentiel, mais une note qui le dit. Aucune table centrale ne nomme ESLint ni jscpd (`D-75`).

- Vérifie : `node --test test/v1-adapters/node-quality-referential.test.ts`
- Tient : `test/v1-adapters/node-quality-referential.test.ts`, « la détection d'un projet Node qui ne déclare ni eslint ni jscpd porte le référentiel de qualité, chaque règle avec sa nature, sa règle, son seuil, l'outil et sa version, sa source et sa date, et recommande l'installation d'eslint 10.12.0 et de jscpd 5.4.0 », « le périmètre déclaré mesure le module . et nomme comme non mesurés les sources TypeScript et JSX, lodash, vitest, les fichiers d'un autre format et la séparation du code généré, chacun avec sa raison » et « un package.json qui déclare eslint ne reçoit ni référentiel ni recommandation, et une note dit que le projet déclare ESLint lui-même »
- Rouge : `detectNodeStack`, dans `src/application/stacks/node.ts`, ne renseigne pas `quality_referential`. Ses recommandations ne nomment que la couverture et Stryker.

### Tâche 2 — Les rapports d'ESLint et de jscpd se lisent

Deux lecteurs rejoignent le contrat. Le premier lit le rapport JSON d'ESLint, avec un constat par message :
sa règle, son fichier relatif et sa ligne. Le second lit le rapport JSON de jscpd, avec un constat par
duplication qui nomme ses deux emplacements. Un rapport absent ou illisible rend INDETERMINATE. Un
message fatal d'ESLint, pour un fichier qu'il ne sait pas analyser, rend aussi INDETERMINATE, comme un
fichier que PMD ne sait pas analyser.

- Vérifie : `node --test test/v1-adapters/eslint-jscpd-reports.test.ts`
- Tient : `test/v1-adapters/eslint-jscpd-reports.test.ts`, « un rapport ESLint donne un constat par message avec sa règle, son fichier et sa ligne », « un rapport jscpd donne un constat par duplication qui nomme ses deux emplacements » et « un rapport absent ou illisible, ou un message fatal d'ESLint, rend INDETERMINATE »
- Rouge : `PARSER_IDS`, dans `src/contracts/v1/protocol.ts`, ne connaît ni `eslint-json` ni `jscpd-json`. Le lanceur ne lit aucun rapport d'ESLint ni de jscpd : un contrôle qui les nomme n'a pas de constat à rendre.

### Tâche 3 — ESLint et jscpd sont qualifiés, avec les seules règles du protocole

Quand le `node_modules` d'une copie porte `eslint` et `jscpd` installés par l'adoption, l'adaptateur
déclare les contrôles `eslint` et `jscpd`, réseau fermé, comme contrôles de qualité. Chacun applique les
règles et les seuils du protocole gelé, sans lire aucune configuration de l'arbre. jscpd n'analyse que
les fichiers JavaScript et TypeScript, hors de `node_modules`. Chacun a son témoin négatif : une fonction
de complexité 21 pour `eslint`, un bloc dupliqué pour `jscpd`. Un témoin est jugé par les seuls constats
situés dans ses propres fichiers.

- Vérifie : `node --test test/v4-platform/node-quality.test.ts`
- Tient : `test/v4-platform/node-quality.test.ts`, « sur un projet Node dont une fonction a une complexité de 21 et dont deux fichiers TypeScript dupliquent un bloc, eslint et jscpd sont qualifiés par leurs témoins et la passe de référence rapporte la complexité et la duplication à leur place » et « un eslint.config.js qui désactive complexity, un .jscpd.json qui porte minTokens à 5000 et un bloc dupliqué sous node_modules ne changent rien aux constats de la passe de référence, dont aucun ne nomme node_modules »
- Rouge : `detectNodeStack` ne déclare aucun contrôle `eslint` ni `jscpd`, même quand le `node_modules` de la copie les porte. Aucun témoin n'exerce une règle de qualité sur une cible Node.

### Tâche 4 — Un état des lieux d'une cible Node propose le référentiel, l'installe à l'adoption et le rapporte

Dans l'état des lieux d'une cible Node, une exigence de qualité qu'aucun contrôle ne mesure donne une
décision, avec les deux issues et les faits de la promesse. L'issue d'adoption dit ce que fait
l'installation npm, et non une résolution Maven. À l'adoption, `eslint` et `jscpd` sont installés dans une
copie, réseau ouvert pour cette seule étape. Le protocole est ensuite gelé avec le référentiel, sa date
d'adoption et les contrôles `eslint` et `jscpd`. Un échec d'installation n'adopte rien et rend la raison de
npm. Une cible que npm ne peut pas étendre n'est pas interrogée, et l'exigence reste un angle mort avec
la raison de ce refus. La section état des lieux du rapport compte les violations du code propriétaire
du module `.` et nomme ce que le référentiel ne mesure pas.

- Vérifie : `node --test test/v2-kernel/node-quality-referential-adoption.test.ts`
- Tient : `test/v2-kernel/node-quality-referential-adoption.test.ts`, « un état des lieux de la qualité d'un projet Node demande l'adoption du référentiel avec un fait par règle et deux issues, l'adoption disant qu'eslint et jscpd sont installés dans une copie », « l'adoption gèle le référentiel avec la date de la décision et le survey mesure l'exigence par eslint et jscpd en FAIL avec un constat par violation, sans changer le digest du projet », « le rapport compte une violation du module . sous complexity, no-unused-vars, no-unused-private-class-members et jscpd, et nomme ce que le référentiel ne mesure pas avec sa raison », « une installation qui échoue n'adopte rien et le survey rend la raison de npm » et « un projet sans package-lock.json ne reçoit aucune décision d'adoption du référentiel et le survey dit que la cible n'a pas de package-lock.json »
- Rouge : `settleQualityReferential`, dans `src/application/phases/quality-referential.ts`, renvoie l'angle mort « cannot be declared in its build without ambiguity » pour toute recommandation sans `edit`, ce qui est le cas d'une installation npm. Au-delà, `resolveInCopy` appelle `planInstall([], install)`, qui refuse toute installation npm faute de `package-lock.json` dans la liste vide. Enfin, l'issue `adopt_referential` de `src/application/decisions.ts` dit que 495 déclare le greffon « dans une copie du POM » et le résout avec Maven.

### Tâche 5 — Ce qu'une vraie installation laisse est accepté, et écrit avec son mode dans chaque copie

L'inspection de l'installation accepte qu'un fichier qui existait sous `node_modules/` n'y soit plus quand
le paquet qui le contient n'est pas nommé par le `package-lock.json` d'avant l'installation : npm élague
ce que le verrou ne nomme pas. Un fichier d'un paquet que le verrou nommait, changé ou retiré, et tout
fichier existant changé restent refusés ; `test/v1-adapters/installation.test.ts` tient déjà ce refus.
Chaque fichier installé garde le mode que l'installation lui a donné : le complément gelé dans le
protocole le porte, et le fichier est écrit avec ce mode dans chaque copie où tourne un contrôle. Le test
installe pour de vrai avec npm, par le chemin de l'adoption, puis qualifie les contrôles dans des copies
écrites depuis les compléments, comme le fait la vérification.

- Vérifie : `node --test test/v4-platform/node-quality-install.test.ts`
- Tient : `test/v4-platform/node-quality-install.test.ts`, « une vraie installation d'eslint 10.12.0 et de jscpd 5.4.0 dans la copie d'un projet dont le node_modules porte deux paquets absents du verrou est acceptée : npm les élague et les fichiers installés deviennent les compléments, chacun avec son mode » et « sur un projet sans paquet hors du verrou, dans les copies écrites depuis les compléments d'une vraie installation, le binaire natif de jscpd est exécutable, eslint et jscpd sont qualifiés par leurs témoins, et la passe de référence rapporte la complexité 21 et la duplication entre les deux fichiers TypeScript »
- Rouge : `unexpectedFile`, dans `src/application/installation.ts`, refuse tout fichier qui existait sous `node_modules/` avant l'installation et n'y est plus, quel que soit son paquet : `installInCopy` rend l'échec « the install changed node_modules/p1/index.js, which already existed under node_modules/ ». Et un complément ne porte que son chemin et son empreinte : `digestsOf` ne garde de chaque entrée de la copie que `content_digest`, `AdoptedComplement` (`src/contracts/v1/protocol.ts`) n'a pas de mode, et `writeStoredFiles` (`src/application/artifacts.ts`) écrit chaque fichier par `writeFile`, sans mode. Le binaire `node_modules/jscpd-darwin-arm64/bin/jscpd` arrive donc dans la copie du témoin sans droit d'exécution : jscpd échoue sur `spawnSync … EACCES` sans écrire de rapport, et son témoin rend INDETERMINATE.

### Tâche 6 — Seule l'installation adoptée fait déclarer les contrôles eslint et jscpd

La détection ne déduit plus du `package.json` ni de `node_modules` que le référentiel a été installé.
L'état des lieux, qui sait ce que l'installation adoptée a posé dans la copie, le dit à la détection
qui la suit, et c'est le seul chemin qui déclare les contrôles `eslint` et `jscpd`. Sans ce fait, un
`package.json` qui déclare `eslint` ou `jscpd`, à quelque version que ce soit, installés ou non, reçoit
la note qui dit que le projet déclare l'analyseur lui-même, et aucun contrôle `eslint` ni `jscpd`.
L'adoption des tâches 4 et 5 garde ses contrôles, qualifiés par leurs témoins.

- Vérifie : `node --test test/v1-adapters/node-quality-referential.test.ts`
- Tient : `test/v1-adapters/node-quality-referential.test.ts`, « un package.json qui épingle eslint 10.12.0 et jscpd 5.4.0, installés sous node_modules avec son propre eslint.config.js, ne reçoit ni contrôle eslint ni jscpd ni référentiel, et une note dit que le projet déclare ESLint lui-même ; seule la détection d'une copie où l'installation adoptée a posé le référentiel déclare les deux contrôles »
- Rouge : `analyserDeclaration`, dans `src/application/stacks/node.ts`, rend `{ by: "495" }` dès que `devDependencies` porte `eslint` à `10.12.0` et `jscpd` à `5.4.0` et que `node_modules/eslint/package.json` et `node_modules/jscpd/package.json` existent. `detectNodeStack` déclare alors les contrôles `eslint` et `jscpd` avec leurs témoins, les nomme dans `lint_control_ids`, et `qualityOffer` rend une offre `proposed` au lieu de la note `not_proposed`. Mesuré le 2026-10-03 sur un projet jetable : `controls` vaut `unit`, `eslint`, `jscpd`. À l'état des lieux, `settleQualityReferential` ne trouve alors aucune exigence de qualité sans contrôle et ne nomme aucun angle mort.

### Tâche 7 — Un verrou en lockfileVersion 1 garde les fichiers des paquets qu'il nomme

L'inspection de l'installation lit les paquets que le `package-lock.json` d'avant l'installation nomme,
quelle que soit sa version. Un verrou en lockfileVersion 1 les nomme sous `dependencies`, chacun pouvant
porter les siens sous sa propre clé `dependencies`, qui sont posés sous son `node_modules/`. Le retrait
d'un fichier de l'un de ces paquets, au premier niveau ou imbriqué, est refusé avec le message qui nomme
ce fichier, comme pour un verrou en lockfileVersion 2 ou 3. Un verrou qui ne porte ni `packages` ni
`dependencies` n'accepte aucun retrait sous `node_modules/`.

- Vérifie : `node --test test/v1-adapters/installation.test.ts`
- Tient : `test/v1-adapters/installation.test.ts`, « avec un package-lock.json en lockfileVersion 1 qui nomme vitest sous dependencies et tinyspy sous vitest, une installation qui retire node_modules/vitest/index.js, ou node_modules/vitest/node_modules/tinyspy/index.js, est refusée avec le message qui nomme ce fichier, et avec un package-lock.json qui ne porte ni packages ni dependencies, le retrait d'un fichier sous node_modules est refusé avec le message qui nomme ce fichier »
- Rouge : `unexpectedFile`, dans `src/application/installation.ts`, lit le verrou d'avant par `lockEntries`, qui rend `packages ?? {}`. Un verrou en lockfileVersion 1 n'a pas de clé `packages` : aucun paquet n'y est nommé, `locked[packageOf(path)]` vaut `undefined` pour tout chemin, et le retrait est accepté comme un élagage. Mesuré le 2026-10-03 : `inspectInstall`, avec ce verrou v1 et une copie d'après sans `node_modules/vitest/index.js` ni `node_modules/vitest/node_modules/tinyspy/index.js`, rend `accepted` ; le même verrou en lockfileVersion 3 rend le refus « the install changed node_modules/vitest/index.js, which already existed under node_modules/ ». Un verrou sans `packages` ni `dependencies` ne nomme de même aucun paquet, et tout retrait sous `node_modules/` y est accepté.

## 5. Hors périmètre

- Les sources TypeScript et JSX ne sont pas mesurées pour la complexité et le code mort. Les mesurer
  demande un analyseur pour ESLint (`typescript-eslint`) et, pour le code mort, une règle qui remplace
  `no-unused-vars`, que `typescript-eslint` remplace par la sienne pour les types. Ce choix d'outil et de
  règles revient au propriétaire.
  En attendant, ces sources sont nommées comme non mesurées. La duplication, elle, les mesure.
- La complexité cognitive, mesurée pour Maven, n'existe pas dans ESLint : elle demanderait un greffon
  (`eslint-plugin-sonarjs`), donc un analyseur que le propriétaire n'a pas choisi.
- Une marque du code généré pour Node, comme un commentaire d'en-tête `@generated`. Aucun standard ne la
  fixe, à la différence des annotations `@Generated` de Java. La choisir revient au propriétaire. D'ici
  là, chaque violation est comptée comme code propriétaire, et le rapport le dit.
- Les workspaces npm : un dépôt qui en déclare est mesuré et compté comme un seul module, `.`, parce que
  l'adaptateur Node ne lit aucun workspace aujourd'hui.
- Les directives écrites dans les sources, `eslint-disable` ou les marques d'exclusion de jscpd, sont
  appliquées comme le font les outils par défaut, comme `// NOPMD` pour Maven. En faire des exceptions
  avec un propriétaire et une échéance : `e10s06`.
- Adopter les règles qu'un projet configure déjà pour ESLint ou jscpd : il reçoit un angle mort nommé,
  comme un projet Maven qui configure PMD.
- Un projet dont `scripts.test` nomme un lanceur que 495 ne sait pas lire, comme le `echo … && exit 1`
  de `npm init` : le référentiel ne lui est pas proposé et rien n'est installé, puisque ses analyseurs ne
  pourraient jamais être déclarés. L'état des lieux s'arrête alors sur ce refus, sans `survey` qui nomme
  l'exigence comme angle mort, comme avant cette story ; le registre porte cet arrêt.
- Garder le référentiel adopté d'un changement au suivant, et juger le code nouveau d'un changement à
  candidat avec lui : comme pour Maven, `e10s04` et au-delà.
- Retirer aussi des copies où tournent les contrôles les paquets que l'installation a élagués. Ces copies
  sont écrites depuis le projet et les compléments, et un complément ne dit pas qu'un fichier a disparu :
  ces paquets y restent, comme dans le projet. Aucun paquet du verrou ne les nomme, et jscpd ne lit pas
  `node_modules`.
- Accepter une installation qui change ou retire un fichier d'un paquet que le verrou nommait, comme
  quand npm remet à la version du verrou un paquet installé à une autre : elle reste refusée, et
  l'exigence reste un angle mort avec le message qui nomme ce fichier.
- Les liens symboliques que pose l'installation, comme ceux de `node_modules/.bin` : ils ne deviennent
  toujours pas des compléments. Les contrôles `eslint` et `jscpd` n'en ont pas besoin : ils lancent par
  Node `node_modules/eslint/bin/eslint.js` et `node_modules/jscpd/run-jscpd.js`.
- Mesurer un projet qui épingle les versions du référentiel avec les règles de 495 plutôt qu'avec les
  siennes : il reçoit l'angle mort nommé, comme tout projet qui déclare ESLint ou jscpd.
- Garder d'un changement au suivant le fait que l'adoption a installé le référentiel : il naît de
  l'installation de l'état des lieux et vit avec le référentiel adopté, que `e10s04` gardera.
- Accepter, quand le verrou d'avant est en lockfileVersion 1, l'élagage d'un paquet qu'il ne nomme pas :
  l'écart ne promet que le refus du retrait d'un fichier d'un paquet nommé, et un tel élagage peut rester
  refusé. La liste des paquets ajoutés que l'installation rend, lue depuis un verrou d'avant en
  lockfileVersion 1, n'est pas touchée non plus. Ni `npm-shrinkwrap.json`, que 495 ne lit pas comme
  verrou, ni un autre format de verrou n'entrent dans l'écart.
