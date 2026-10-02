# Le référentiel d'une cible Maven est adopté par le propriétaire, chaque règle avec son oracle, sa source et sa date

Story : e10s01
Epic : e10
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Maven qui demande « quel est l'état de la qualité du code ? » n'obtient
aujourd'hui qu'un angle mort. Pour une cible Maven, 495 lit les tests, la couverture, la mutation et
la structure, mais aucun contrôle ne mesure la complexité, la duplication ou le code mort. Aucune
règle de qualité ne peut non plus être adoptée : l'exigence de qualité (`QLT-01`) n'a pas de
mécanisme.

Avec cette story, l'adaptateur Maven déclare un référentiel de départ (`D-75`), vérifié par PMD et
son détecteur de duplication (arbitrage du propriétaire, 2026-10-03). Chaque règle dit ce qu'elle
mesure, la règle PMD qui la vérifie, son seuil, la version de l'outil, la page de documentation qui
la justifie, et la date à laquelle ces données ont été établies. Les seuils sont ceux que PMD
documente, jamais des valeurs inventées. Lorsqu'un état des lieux pose une question de qualité à
laquelle aucun contrôle ne répond, 495 présente ce référentiel règle par règle. Le propriétaire
l'adopte ou laisse la question en angle mort. Adopté, le référentiel est gelé dans le protocole avec
la date de la décision. Il n'est jamais lu dans l'arbre analysé (`D-25`). L'état des lieux mesure
alors la question avec PMD et rapporte chaque violation à sa place.

Le référentiel de départ :

| Nature | Règle PMD | Seuil (défaut documenté de PMD 7.17.0) |
|---|---|---|
| complexité | `CyclomaticComplexity` | une méthode à partir de 10 |
| complexité | `CognitiveComplexity` | une méthode à partir de 15 |
| code mort | `UnusedPrivateMethod`, `UnusedPrivateField`, `UnusedLocalVariable` | toute occurrence |
| duplication | CPD | un bloc dupliqué d'au moins 100 jetons |

Le greffon est `maven-pmd-plugin` 3.28.0, dernière version publiée au 2026-10-03, qui embarque
PMD 7.17.0. Le greffon de Maven ne permet pas de lui passer un jeu de règles en ligne de commande
(mesuré : `-Dpmd.rulesets` est ignoré). Il est donc déclaré dans le POM d'une copie, avec un jeu de
règles désigné par une propriété que 495 renseigne à chaque exécution. Le jeu de règles est écrit à
partir du protocole gelé, hors de l'arbre analysé.

## 2. Promesses

Scenario: Le référentiel proposé se présente règle par règle
  Given un projet Maven dont le POM ne déclare pas PMD
  When un état des lieux demande l'état de la qualité du code, et aucun contrôle ne mesure cette nature
  Then une décision demande au propriétaire s'il adopte le référentiel de qualité proposé pour Maven, avec deux issues : l'adopter, ou laisser l'exigence en angle mort
  And ses faits donnent, pour chaque règle, sa nature, la règle PMD, son seuil, la version de PMD, la page de documentation qui la justifie et la date où ces données ont été établies
  And l'issue d'adoption dit que 495 déclare `maven-pmd-plugin` 3.28.0 dans une copie du POM et résout le greffon, réseau ouvert pour cette seule étape, sans rien écrire dans le projet

Scenario: Le référentiel adopté mesure la qualité du projet
  Given un projet Maven dont une méthode a une complexité cyclomatique de 11, dont une méthode privée n'est jamais appelée, et dont deux fichiers portent le même bloc de plus de 100 jetons
  When le propriétaire adopte le référentiel proposé
  Then le protocole gelé porte le référentiel, chaque règle avec son oracle (le contrôle et la règle PMD), son seuil, sa source et la date de la décision d'adoption
  And les contrôles `pmd` et `cpd` sont qualifiés par leurs témoins, bien que le code du projet viole déjà des règles
  And le `survey` mesure l'exigence de qualité par ces deux contrôles, en FAIL, avec un constat par violation qui nomme la règle, le fichier et la ligne, et pour la duplication les deux emplacements
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: Le propriétaire laisse l'exigence en angle mort
  Given la décision qui propose le référentiel de qualité
  When le propriétaire choisit de laisser l'exigence en angle mort
  Then le `survey` nomme l'exigence comme angle mort, avec la raison que le référentiel proposé n'a pas été adopté, aucune résolution Maven n'est lancée et le réseau ne s'ouvre pas

Scenario: Une résolution qui échoue n'adopte rien
  Given un projet Maven dont le dépôt de greffons est injoignable
  When le propriétaire adopte le référentiel proposé
  Then rien n'est adopté, aucun contrôle `pmd` ni `cpd` n'est déclaré, et le `survey` nomme l'exigence comme angle mort avec la raison donnée par la sortie de Maven

Scenario: Un projet qui configure déjà PMD ne reçoit pas le référentiel de 495
  Given un projet Maven dont le POM déclare déjà `maven-pmd-plugin`
  When un état des lieux demande l'état de la qualité du code
  Then aucun référentiel n'est proposé, aucun POM n'est modifié, et l'exigence est un angle mort avec la raison que le projet configure PMD lui-même

Scenario: Le rapport expose le référentiel adopté
  Given un état des lieux dont le référentiel de qualité a été adopté
  When le propriétaire demande `/495 report`
  Then la section état des lieux nomme chaque règle du référentiel avec son oracle, son seuil, sa source et sa date d'adoption, et chaque violation sous la règle qui la mesure

## 3. Sécurité

Un état des lieux ouvre le réseau à une seule étape : la résolution de `maven-pmd-plugin`, que le
propriétaire a adoptée. Rien d'autre ne l'ouvre, et cela restreint la promesse de `e29s01` qui ne
l'ouvrait jamais (`D-76`). La résolution écrit dans le dépôt local que Maven désigne, et n'exécute
aucun but du greffon. La copie est ensuite inspectée : la résolution n'est acceptée que si elle ne
modifie aucun fichier autre que `pom.xml`. La déclaration du greffon n'est écrite que dans les
copies où les contrôles tournent, jamais dans le projet. Les contrôles `pmd` et `cpd` tournent avec
le réseau fermé. Le jeu de règles qu'ils appliquent est écrit à partir du protocole gelé à chaque
exécution : un fichier de l'arbre analysé ne peut pas le remplacer.

## 4. Tâches

### Tâche 1 — L'adaptateur Maven déclare son référentiel et recommande PMD

L'adaptateur Maven porte les règles du tableau, chacune avec sa nature, sa règle PMD, son seuil, la
version de PMD, sa source et sa date d'établissement. Pour un POM sans `maven-pmd-plugin`, il
recommande le greffon 3.28.0. Cette recommandation porte la modification du POM, qui déclare le
greffon avec un jeu de règles désigné par une propriété, et la résolution par Maven. Un POM qui
déclare déjà le greffon ne reçoit ni recommandation ni référentiel, mais une note qui le dit.
Aucune table centrale ne nomme PMD (`D-75`).

- Vérifie : `node --test test/v1-adapters/quality-referential.test.ts`
- Tient : `test/v1-adapters/quality-referential.test.ts`, « la détection d'un projet Maven sans PMD porte le référentiel de qualité, chaque règle avec sa nature, sa règle PMD, son seuil, la version de PMD, sa source et sa date, et recommande maven-pmd-plugin 3.28.0 avec la modification du POM et sa résolution » et « un POM qui déclare déjà maven-pmd-plugin ne reçoit ni référentiel ni recommandation, et une note dit que le projet configure PMD lui-même »
- Rouge : `detect` de l'adaptateur Maven ne porte aucun référentiel. Ses recommandations ne nomment que JaCoCo et la mutation, et `lint_control_ids` est vide.

### Tâche 2 — Les rapports de PMD et de CPD se lisent

Deux lecteurs rejoignent le contrat (`D-75` §3). Le premier lit le rapport XML de PMD, avec un
constat par violation : sa règle, son fichier relatif et sa ligne. Le second lit celui de CPD, avec
un constat par duplication qui nomme ses emplacements. Un rapport illisible ou absent rend
INDETERMINATE.

- Vérifie : `node --test test/v1-adapters/pmd-reports.test.ts`
- Tient : `test/v1-adapters/pmd-reports.test.ts`, « un rapport PMD donne un constat par violation avec sa règle, son fichier et sa ligne », « un rapport CPD donne un constat par duplication qui nomme ses emplacements » et « un rapport absent ou illisible rend INDETERMINATE »
- Rouge : `PARSER_IDS` ne connaît ni `pmd-xml` ni `cpd-xml`, et le lanceur ne lit aucun rapport de PMD : un contrôle qui les nomme n'a pas de constat à rendre.

### Tâche 3 — PMD et CPD sont qualifiés sur un projet qui viole déjà des règles

Quand le POM d'une copie déclare le greffon avec la propriété de 495, l'adaptateur déclare les
contrôles `pmd` et `cpd`, réseau fermé, comme contrôles de qualité. Chacun a son témoin négatif : une
méthode trop complexe pour `pmd`, un bloc dupliqué pour `cpd`. Un témoin est jugé par les seuls
constats situés dans ses propres fichiers, si bien qu'une violation déjà présente dans le projet ne
le disqualifie pas. La passe sur la référence rapporte les violations du projet.

- Vérifie : `node --test test/v4-platform/maven-quality.test.ts`
- Tient : `test/v4-platform/maven-quality.test.ts`, « sur un projet Maven dont une méthode a une complexité de 11 et dont deux fichiers dupliquent un bloc, pmd et cpd sont qualifiés par leurs témoins et la passe de référence rapporte la complexité et la duplication à leur place »
- Rouge : aucun contrôle `pmd` ni `cpd` n'est déclaré, même quand le POM déclare le greffon. La copie n'a pas de jeu de règles, et aucun témoin n'exerce une règle de qualité.

### Tâche 4 — Un état des lieux propose le référentiel et le gèle à l'adoption

Dans un état des lieux, une exigence dont aucun contrôle ne mesure la nature, alors que l'adaptateur
propose un référentiel qui la mesurerait, ne devient plus d'emblée un angle mort. Elle donne une
décision, avec les deux issues et les faits de la promesse. À l'adoption, la modification est
appliquée dans la copie et le greffon résolu, réseau ouvert pour cette seule étape. Le protocole est
ensuite gelé avec le référentiel, sa date d'adoption et les contrôles `pmd` et `cpd`. Le refus laisse
l'exigence en angle mort, avec sa raison. Un échec de résolution n'adopte rien et rend la raison de
Maven.

- Vérifie : `node --test test/v2-kernel/quality-referential-adoption.test.ts`
- Tient : `test/v2-kernel/quality-referential-adoption.test.ts`, « un état des lieux de la qualité d'un projet Maven sans PMD demande l'adoption du référentiel avec un fait par règle et deux issues », « l'adoption gèle le référentiel avec la date de la décision et le survey mesure l'exigence par pmd et cpd en FAIL avec un constat par violation, sans changer le digest du projet », « laisser l'exigence en angle mort ne lance aucune résolution et le survey dit que le référentiel n'a pas été adopté » et « une résolution qui échoue n'adopte rien et le survey rend la raison de Maven »
- Rouge : un état des lieux n'offre aucune adoption (`e29s01`). L'exigence de qualité d'un projet Maven devient tout de suite un angle mort, sans décision.

### Tâche 5 — Le rapport expose le référentiel adopté

La section état des lieux du rapport nomme chaque règle du référentiel adopté, avec son oracle, son
seuil, sa source et sa date d'adoption. Elle range chaque violation sous la règle qui la mesure.

- Vérifie : `node --test test/v2-kernel/quality-referential-report.test.ts`
- Tient : `test/v2-kernel/quality-referential-report.test.ts`, « le rapport d'un état des lieux au référentiel adopté nomme chaque règle avec son oracle, son seuil, sa source et sa date d'adoption, et la violation de complexité sous CyclomaticComplexity »
- Rouge : la section état des lieux de `engineeringReport` ne lit que les exigences, les contrôles et les angles morts du `survey`, et ne nomme aucune règle.

## 5. Hors périmètre

- Séparer code propriétaire, code généré et dépendances, et résumer les écarts par règle et par
  module : `e10s02`.
- Le référentiel d'une cible Node : `e10s03`.
- Garder le référentiel adopté d'un changement au suivant : il est gelé dans le protocole du
  changement qui l'adopte, et un nouvel état des lieux le propose de nouveau. Le porter d'un
  changement à l'autre relève du programme à plusieurs incréments (`e10s04`).
- Juger le code nouveau d'un changement à candidat avec le référentiel (non-aggravation,
  `QLT-04`) : un changement à candidat ne se voit pas proposer le référentiel dans cette story.
- Adopter les règles qu'un projet configure déjà pour PMD : il reçoit un angle mort nommé.
- Checkstyle et SpotBugs : écartés au départ par le propriétaire. Ils pourront s'ajouter plus tard
  comme règles du référentiel.
