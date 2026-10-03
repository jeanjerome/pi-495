# Le référentiel et l'état des lieux d'une cible Node

Story : e10s03
Epic : e10
Statut : à faire

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
  Given un projet Node avec un `package-lock.json`, sans script `lint`, dont le `package.json` ne déclare ni `eslint` ni `jscpd`
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

Scenario: Une installation qui échoue n'adopte rien
  Given un projet Node dont le registre npm est injoignable
  When le propriétaire adopte le référentiel proposé
  Then rien n'est adopté, aucun contrôle `eslint` ni `jscpd` n'est déclaré, et le `survey` nomme l'exigence comme angle mort avec la raison donnée par npm

Scenario: Une cible que npm ne peut pas étendre ne reçoit pas la question
  Given un projet Node sans `package-lock.json`
  When un état des lieux demande l'état de la qualité du code
  Then aucune décision n'est demandée, rien n'est installé, et le `survey` nomme l'exigence comme angle mort avec la raison que la cible n'a pas de `package-lock.json`

Scenario: Un projet qui déclare déjà ESLint ou jscpd ne reçoit pas le référentiel de 495
  Given un projet Node sans script `lint` dont le `package.json` déclare `eslint` en dépendance de développement
  When un état des lieux demande l'état de la qualité du code
  Then aucun référentiel n'est proposé, rien n'est installé, et l'exigence est un angle mort avec la raison que le projet déclare ESLint lui-même

## 3. Sécurité

Un état des lieux d'une cible Node ouvre le réseau à une seule étape : l'installation d'`eslint` et de
`jscpd` que le propriétaire a adoptée (`D-76`). Elle se fait dans une copie, aux versions exactes, sans
exécuter aucun script d'installation. Le binaire de jscpd 5.4.0 arrive par un paquet propre à la
plateforme, sans script. La copie est ensuite inspectée : l'installation n'est acceptée que si elle ne
change que `package.json`, `package-lock.json` et `node_modules/`. Rien n'est écrit dans le projet. Les
contrôles `eslint` et `jscpd` tournent dans le bac à sable avec le réseau fermé, depuis le `node_modules`
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
- Tient : `test/v2-kernel/node-quality-referential-adoption.test.ts`, « un état des lieux de la qualité d'un projet Node demande l'adoption du référentiel avec un fait par règle et deux issues, l'adoption disant qu'eslint et jscpd sont installés dans une copie », « l'adoption gèle le référentiel avec la date de la décision et le survey mesure l'exigence par eslint et jscpd en FAIL avec un constat par violation, sans changer le digest du projet », « le rapport compte une violation du module . sous complexity, no-unused-vars, no-unused-private-class-members et jscpd, et nomme ce que le référentiel ne mesure pas avec sa raison », « une installation qui échoue n'adopte rien et le survey rend la raison de npm » et « un projet sans package-lock.json ne reçoit aucune décision et le survey dit que la cible n'a pas de package-lock.json »
- Rouge : `settleQualityReferential`, dans `src/application/phases/quality-referential.ts`, renvoie l'angle mort « cannot be declared in its build without ambiguity » pour toute recommandation sans `edit`, ce qui est le cas d'une installation npm. Au-delà, `resolveInCopy` appelle `planInstall([], install)`, qui refuse toute installation npm faute de `package-lock.json` dans la liste vide. Enfin, l'issue `adopt_referential` de `src/application/decisions.ts` dit que 495 déclare le greffon « dans une copie du POM » et le résout avec Maven.

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
- Garder le référentiel adopté d'un changement au suivant, et juger le code nouveau d'un changement à
  candidat avec lui : comme pour Maven, `e10s04` et au-delà.
