# Un anti-pattern relevé par la revue de patterns qui s'écrit en règle de dépendance est proposé comme règle de la carte, et vérifié par les outils de la technologie

Story : e11s10
Epic : e11
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Maven ou Node qui adopte la carte de son architecture voit vérifier le style de
chaque partie, les relations permises entre parties, l'absence de cycle et les sources qu'aucune partie ne
couvre (`e11s02`, `e11s04`). L'anti-pattern que la revue de patterns relève le plus souvent lui échappe : le
domaine ou l'application qui appelle directement l'infrastructure. Prenons un réacteur en oignon dont le
service `io.demo.domain.service.UserService` utilise `jakarta.persistence.EntityManager`, ou un paquet npm dont
`src/domain/service/user-service.ts` importe `pg`. Aucune relation entre parties n'est enfreinte : la
bibliothèque n'est pas une partie. L'état des lieux mesure donc la carte en PASS, et l'anti-pattern ne vit que
dans le texte de la recommandation (`e11s05`), qu'aucun outil ne vérifie et qu'aucune exécution suivante ne
rappelle. `D-87` veut qu'un anti-pattern qui s'écrit en règle soit proposé à la carte pour qu'un outil le
vérifie, et `D-88` en a fixé la seule forme : une bibliothèque confinée.

Avec cette story, la carte qu'un modèle propose peut porter des bibliothèques confinées : telle bibliothèque,
que seuls les paquets ou les dossiers que la règle nomme peuvent utiliser, contre tel anti-pattern, avec ses
indices. Le propriétaire la lit dans la décision et l'adopte avec la carte. ArchUnit pour Maven et
dependency-cruiser pour Node la vérifient à chaque exécution, et chaque utilisation hors des paquets nommés
est un constat à son fichier et à sa ligne.

## 2. Promesses

Scenario: Une bibliothèque confinée de la carte proposée se présente au propriétaire
  Given le réacteur `domain` et `infrastructure` de la story, dont `domain/src/main/java/io/demo/domain/service/UserService.java` importe `jakarta.persistence.EntityManager`, comme `infrastructure/src/main/java/io/demo/infra/JdbcUserRepository.java`
  And une carte proposée qui tient devant le code et confine la bibliothèque `jakarta.persistence` au seul paquet `io.demo.infra`, contre l'anti-pattern « appel direct de l'infrastructure depuis le domaine », à l'indice de l'import de `UserService.java`
  When la décision est présentée au propriétaire
  Then ses faits donnent la bibliothèque `jakarta.persistence`, le paquet `io.demo.infra` seul autorisé à l'utiliser, l'anti-pattern et son indice

Scenario: Le modèle qui propose la carte cherche les anti-patterns qui s'écrivent en bibliothèque confinée
  Given un réacteur Maven et une exigence d'architecture à l'état des lieux
  When l'intervention qui propose la carte est ouverte
  Then sa consigne et la skill de 495 qu'elle reçoit demandent les anti-patterns où une partie utilise directement une bibliothèque d'infrastructure, de requête ou de journalisation, chacun proposé comme une bibliothèque confinée avec les paquets ou les dossiers qui peuvent l'utiliser, l'anti-pattern et ses indices
  And elles disent qu'un anti-pattern d'une autre forme n'entre pas dans la carte
  And la provenance de la skill nomme la revue des anti-patterns de `design-pattern-review` parmi ce qu'elle reprend

Scenario: Une bibliothèque confinée qui ne tient pas devant le code rend la carte non présentée
  Given une carte proposée dont la bibliothèque confinée est `io.demo.infra`, un paquet du projet, ou `io.demo`, qui en contient, ou porte un nom qui n'est celui d'aucun paquet Java ni d'aucun paquet npm, ou dont le paquet autorisé `io.demo.billing` n'est déclaré par aucune source principale, ou dont un indice désigne une ligne au-delà de la fin de son fichier
  When l'état des lieux reçoit la carte
  Then aucune décision n'est demandée sur cette carte
  And le `survey` nomme l'exigence d'architecture comme angle mort, avec la raison qui désigne la bibliothèque et ce qui ne tient pas

Scenario: ArchUnit vérifie la bibliothèque confinée d'une carte Maven adoptée
  Given le réacteur de la story, et la carte qui confine `jakarta.persistence` à `io.demo.infra`
  When le propriétaire adopte la carte
  Then le contrôle d'architecture est qualifié par ses témoins bien que la référence enfreigne la carte
  And le `survey` mesure l'exigence d'architecture en FAIL, avec un constat qui nomme la règle confinant `jakarta.persistence` à `io.demo.infra`, au fichier `domain/src/main/java/io/demo/domain/service/UserService.java` et à la ligne de l'utilisation
  And aucun constat de cette règle ne porte sur `JdbcUserRepository.java`
  And la section état des lieux du rapport donne ce constat avec sa règle, son fichier et sa ligne
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: dependency-cruiser vérifie la bibliothèque confinée d'une carte Node adoptée
  Given un paquet npm dont `package.json` déclare `pg`, dont `src/domain/service/user-service.ts` et `src/adapters/db/sql-user-repository.ts` importent `pg`, et une carte adoptée qui confine `pg` au seul dossier `src/adapters/db`
  When le contrôle d'architecture passe sur la référence
  Then il rend FAIL, avec un constat qui nomme la règle confinant `pg` à `src/adapters/db`, au fichier `src/domain/service/user-service.ts` et à la ligne de l'import
  And aucun constat de cette règle ne porte sur `src/adapters/db/sql-user-repository.ts`

Scenario: L'issue d'adoption et le rapport disent ce que la carte confine
  Given une carte proposée qui confine `jakarta.persistence` à `io.demo.infra`
  When la décision est présentée, puis le propriétaire adopte la carte et demande `/495 report`
  Then l'issue d'adoption nomme les bibliothèques que la carte confine parmi les règles vérifiées à chaque exécution, en français et en anglais
  And la section état des lieux donne, sous la carte, `jakarta.persistence` avec le paquet `io.demo.infra` seul autorisé à l'utiliser et l'anti-pattern qu'elle prévient, en anglais et en français
  And ce que la vérification ne voit pas ne dit plus que les règles de la carte n'opposent les bibliothèques hors du réacteur à aucune partie : il nomme les bibliothèques que la carte ne confine pas, et de même les paquets installés sous `node_modules` pour une carte Node

## 3. Sécurité

La bibliothèque confinée vient de la carte gelée dans le protocole, jamais d'un fichier de l'arbre (`D-25`,
`D-87`) : aucun fichier du projet ne peut taire ni élargir la règle. Son nom et les paquets qu'elle autorise
sont écrits par 495 dans une classe Java et dans une configuration de dependency-cruiser à chaque exécution :
avant de présenter la carte, le noyau refuse un nom qui n'est celui d'aucun paquet Java ni d'aucun paquet npm,
et un paquet qu'aucune source principale ne déclare. La vérification n'installe rien de plus que ce que
l'adoption installe déjà, et le contrôle tourne réseau fermé. L'anti-pattern que la règle prévient est une
lecture du modèle ; seule l'utilisation que l'outil relève est un constat (`D-74`). Rien n'est écrit dans le
projet.

## 4. Tâches

### Tâche 1 — La carte porte ses bibliothèques confinées, et la décision les présente

La carte qu'un modèle propose porte, à côté de ses relations, des bibliothèques confinées : chacune nomme une
bibliothèque, les paquets ou les dossiers de la carte qui seuls peuvent l'utiliser, l'anti-pattern qu'elle
prévient et ses indices. Les faits de la décision `IH-04` les donnent avec les parties et les relations, et la
carte adoptée les garde, gelée dans le protocole.

- Vérifie : `node --test test/v2-kernel/architecture-map-confined-library.test.ts`
- Tient : `test/v2-kernel/architecture-map-confined-library.test.ts`, « une carte proposée qui confine jakarta.persistence au seul paquet io.demo.infra contre l'anti-pattern appel direct de l'infrastructure depuis le domaine est présentée par une décision IH-04 dont les faits donnent la bibliothèque, le paquet autorisé, l'anti-pattern et son indice à l'import de UserService.java, et adoptée elle est gelée dans le protocole avec sa bibliothèque confinée »
- Rouge : le schéma `ArchitectureMap` (`src/contracts/v1/protocol.ts`) refuse toute propriété que ses parties, ses relations et sa lecture ne portent pas (`additionalProperties: false`) ; `proposeMap` (`src/application/phases/architecture-map.ts`) lève alors `CONFIGURATION_ERROR` « architecture map intervention completed with an invalid structured output », et aucune décision `IH-04` n'est demandée.

### Tâche 2 — Une bibliothèque confinée qui ne tient pas devant le code rend la carte non présentée

Le noyau confronte chaque bibliothèque confinée au code avant de présenter la carte. La bibliothèque n'est ni un
paquet des sources principales ni un paquet qui en contient un, et son nom est celui d'un paquet Java ou d'un
paquet npm. Chaque paquet ou dossier autorisé est déclaré par une source principale, et chaque indice désigne
une ligne de la référence. Une carte dont une bibliothèque confinée ne tient pas n'est pas présentée, et le
`survey` nomme l'exigence d'architecture comme angle mort avec la raison qui désigne la bibliothèque.

- Vérifie : `node --test test/v2-kernel/architecture-map-confined-library-validation.test.ts`
- Tient : `test/v2-kernel/architecture-map-confined-library-validation.test.ts`, « une carte qui confine io.demo.infra, un paquet du projet, ou io.demo, qui en contient, n'est pas présentée et le survey nomme l'exigence comme angle mort en désignant cette bibliothèque », « une carte dont la bibliothèque confinée porte un nom qui n'est celui d'aucun paquet Java ni npm n'est pas présentée et le survey le dit » et « une carte dont la bibliothèque confinée autorise io.demo.billing, absent des sources, ou cite un indice au-delà de la fin de son fichier, n'est pas présentée et le survey désigne ce paquet ou cet indice »
- Rouge : après la tâche 1, `checkArchitectureMap` (`src/domain/architecture-map.ts`) ne confronte que les rôles au style de leur partie, les paquets des rôles aux sources principales et les indices des parties, des rôles et des relations : une carte qui confine `io.demo.infra` ou autorise `io.demo.billing` tient, et une décision `IH-04` la présente.

### Tâche 3 — Le modèle cherche les anti-patterns qui s'écrivent en bibliothèque confinée

La consigne de l'intervention qui propose la carte et la skill `architecture-map` que 495 embarque demandent
les anti-patterns où une partie utilise directement une bibliothèque d'infrastructure, de requête ou de
journalisation, et de proposer chacun comme une bibliothèque confinée, avec les paquets ou les dossiers qui
peuvent l'utiliser, l'anti-pattern et ses indices, pour Maven et pour Node. Elles disent qu'un anti-pattern
d'une autre forme reste à la revue de la recommandation. La provenance de la skill nomme ce qu'elle reprend de
la revue des anti-patterns de `design-pattern-review` (commit `66d78158`).

- Vérifie : `node --test test/v2-kernel/architecture-map-confined-library-skill.test.ts`
- Tient : `test/v2-kernel/architecture-map-confined-library-skill.test.ts`, « la consigne de l'intervention qui propose la carte et la skill architecture-map demandent les anti-patterns où une partie utilise directement une bibliothèque d'infrastructure, de requête ou de journalisation, proposés comme bibliothèques confinées avec leurs paquets autorisés, l'anti-pattern et ses indices, disent qu'un anti-pattern d'une autre forme n'entre pas dans la carte, et la provenance de la skill nomme la revue des anti-patterns de design-pattern-review »
- Rouge : `ARCHITECTURE_MAP_INSTRUCTION` (`src/application/context.ts`) ne demande que les parties, les rôles, les relations et la lecture ; la provenance de `skills/architecture-map/SKILL.md` dit que la revue de patterns des sources a été laissée de côté, et la skill ne parle d'aucune bibliothèque confinée.

### Tâche 4 — ArchUnit vérifie les bibliothèques confinées d'une carte Maven

Les règles qu'ArchUnit exécute portent une règle par bibliothèque confinée : aucune classe hors des paquets
autorisés ne dépend d'une classe de la bibliothèque. Chaque violation est un constat sous le nom de la règle, à
son fichier et à sa ligne.

- Vérifie : `node --test test/v4-platform/maven-architecture-confined-library.test.ts`
- Tient : `test/v4-platform/maven-architecture-confined-library.test.ts`, « sur le réacteur domain et infrastructure dont UserService et JdbcUserRepository importent jakarta.persistence.EntityManager, la carte qui confine jakarta.persistence à io.demo.infra rend le contrôle d'architecture qualifié par ses témoins, et la passe de référence FAIL avec un constat de la règle de cette bibliothèque au fichier UserService.java et à la ligne de l'utilisation, sans constat sur JdbcUserRepository.java »
- Rouge : `architectureRules` (`src/adapters/stacks/maven/structure/archunit-rules.ts`) n'écrit que l'oignon ou les couches de chaque partie, les relations entre parties, les cycles et l'appartenance à une partie ; une dépendance vers `jakarta.persistence`, qui n'est d'aucune partie, n'est jugée par aucune, et la passe de référence rend PASS sans constat.

### Tâche 5 — dependency-cruiser vérifie les bibliothèques confinées d'une carte Node

La configuration que dependency-cruiser reçoit porte une règle par bibliothèque confinée : aucune source hors
des dossiers autorisés n'importe le paquet. Chaque violation est un constat sous le nom de la règle, au fichier
et à la ligne de l'import.

- Vérifie : `node --test test/v4-platform/node-architecture-confined-library.test.ts`
- Tient : `test/v4-platform/node-architecture-confined-library.test.ts`, « sur le paquet dont user-service.ts de src/domain/service et sql-user-repository.ts de src/adapters/db importent pg, la carte qui confine pg à src/adapters/db rend la passe de référence FAIL avec un constat de la règle de cette bibliothèque au fichier src/domain/service/user-service.ts et à la ligne de l'import, sans constat sur sql-user-repository.ts »
- Rouge : `dependencyCruiserRules` (`src/adapters/stacks/node/structure/dependency-cruiser-rules.ts`) n'écrit d'interdiction qu'entre dossiers de la carte, et exclut `node_modules/` de ce que dependency-cruiser lit (`NOT_READ`) ; un import de `pg` n'est jugé par aucune règle, et la passe de référence rend PASS sans constat.

### Tâche 6 — L'issue d'adoption et le rapport disent ce que la carte confine

L'issue d'adoption d'une carte qui confine une bibliothèque nomme les bibliothèques confinées parmi les règles
vérifiées à chaque exécution. La section état des lieux du rapport donne, sous la carte, chaque bibliothèque
confinée avec ses paquets ou ses dossiers autorisés et l'anti-pattern qu'elle prévient. Ce que la vérification
ne voit pas nomme, pour Maven, les bibliothèques hors du réacteur que la carte ne confine pas, et pour Node, les
paquets installés sous `node_modules` qu'elle ne confine pas. Le texte le dit en anglais et en français.

- Vérifie : `node --test test/v2-kernel/architecture-map-confined-library-report.test.ts`
- Tient : `test/v2-kernel/architecture-map-confined-library-report.test.ts`, « l'issue d'adoption d'une carte qui confine jakarta.persistence nomme les bibliothèques confinées parmi les règles vérifiées, en français et en anglais », « le rapport d'un état des lieux à la carte adoptée donne sous la carte jakarta.persistence avec io.demo.infra seul autorisé et l'anti-pattern qu'elle prévient, en anglais et en français » et « ce que la vérification d'une carte Maven ou Node ne voit pas nomme les bibliothèques hors du réacteur et les paquets installés sous node_modules que la carte ne confine pas, et ne dit plus que les règles de la carte ne les opposent à aucune partie »
- Rouge : l'issue `adopt_map` (`ARCHITECTURE_MAP_ADOPTION`, `src/application/decisions.ts`) ne nomme que le style de chaque partie, les relations permises, l'absence de cycle et les sources sans partie ; `architectureSection` (`src/application/report.ts`) ne rend que les parties, leurs rôles, leurs relations, les paquets sans partie, ce que la vérification ne voit pas et la lecture ; `MAP_VERIFICATION_UNSEEN` de Maven et de Node disent que les règles de la carte n'opposent les bibliothèques hors du réacteur, ou les paquets sous `node_modules`, à aucune partie.

## 5. Hors périmètre

- Un anti-pattern d'une autre forme, comme la grosse classe, le grand `switch` ou le singleton : il reste un
  texte de la revue de la recommandation, aucun outil d'import ne le vérifie (`D-88` §1).
- Une règle « tel paquet du projet n'importe pas tel autre », plus fine que les relations entre parties :
  `D-88` ne la retient pas, elle recoupe ce que la carte dit déjà.
- Faire d'un anti-pattern que la revue de la recommandation relève, après la mesure, une règle de la carte
  déjà adoptée : la carte est gelée dans le protocole de l'état des lieux qui l'adopte, et la règle est
  proposée avec elle, comme les relations (`D-88`, Conséquences). Un état des lieux suivant propose la carte à
  nouveau.
- Une bibliothèque utilisée par configuration ou par réflexion (un `persistence.xml`, `Class.forName` sur le
  pilote JDBC) : le lecteur de `e11s09` ne relie que les classes du réacteur, et ArchUnit ne voit que les
  dépendances compilées. Le plan ne porte pas cette suite.
- Confiner un module intégré de Node (`node:fs`, `node:child_process`) : la story confine un paquet que
  `package.json` peut déclarer. Le plan ne porte pas cette suite.
- Juger l'utilisation d'une bibliothèque confinée dans les sources de test : les règles de la carte ne portent
  que sur les sources principales.
- Une bibliothèque confinée dans la carte cible d'une migration, et le jugement d'une étape par elle :
  `e11s11` et `e11s12`.
