# L'état des lieux vérifie la carte adoptée d'une cible Maven avec ArchUnit, chaque violation localisée

Story : e11s02
Epic : e11
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Maven qui a adopté la carte de son architecture (`e11s01`) la lit dans le
rapport, mais rien ne la confronte au code. L'exigence d'architecture reste un angle mort : « aucun contrôle
ne vérifie encore la carte adoptée ». Prenons un module `domain` dont le modèle appelle un service du
domaine, ou un module `admin` qui utilise `orders` alors que la carte ne le permet pas. L'état des lieux ne
le dit pas, et le propriétaire croit tenue une architecture qui ne l'est pas (`ARC-01`, `D-87`).

Avec cette story, adopter la carte, c'est aussi adopter sa vérification. 495 recommande ArchUnit 1.5.1 pour
les règles de la carte et nomme ces règles dans la décision (`D-87` §4) : le style de chaque partie, les
relations permises entre parties, l'absence de cycle, et les sources qu'aucune partie ne couvre (`D-87` §5).
À l'adoption, ArchUnit est déclaré dans une copie du POM et résolu par Maven, réseau ouvert pour cette seule
étape. Les règles sont écrites par 495 depuis la carte gelée. L'état des lieux mesure alors l'exigence
d'architecture : chaque violation porte la règle enfreinte, le fichier et la ligne. Pour écrire ces règles,
la carte doit dire ce que son style demande (`D-87` §1). Dans une partie en oignon, chaque paquet a l'un
des quatre anneaux. Dans une partie en couches, chaque couche nomme les couches qui peuvent l'appeler. Une
carte qui ne le dit pas n'est pas présentée.

## 2. Promesses

Scenario: La carte proposée dit ce que le style de chaque partie demande
  Given un réacteur Maven et une exigence d'architecture à l'état des lieux
  When l'intervention qui propose la carte est ouverte
  Then sa consigne demande pour chaque paquet d'une partie en oignon un rôle parmi le modèle du domaine, les services du domaine, les services d'application et un adaptateur nommé, et pour chaque couche d'une partie en couches les couches qui peuvent l'appeler
  And la décision sur une carte dont la partie `admin` est en couches donne, pour chacune de ses couches, les couches qui peuvent l'appeler

Scenario: Une carte dont les rôles ne suivent pas le style n'est pas présentée
  Given une carte proposée dont la partie en oignon `orders` donne au paquet `io.demo.orders.model` le rôle « the heart of things », ou dont la partie en couches `admin` ne dit pas quelles couches peuvent appeler sa couche `data`
  When l'état des lieux reçoit la carte
  Then aucune décision n'est demandée sur cette carte
  And le `survey` nomme l'exigence d'architecture comme angle mort, avec la raison qui désigne la partie et le rôle ou la couche en défaut

Scenario: La décision dit ce qu'adopter la carte fait vérifier, et par quoi
  Given un réacteur Maven dont le module `domain` porte les paquets `io.demo.domain.user`, `io.demo.domain.service` et `io.demo.domain.port`, et le module `infrastructure` le paquet `io.demo.infra`
  And une carte proposée qui tient devant le code
  When la décision est présentée au propriétaire
  Then l'issue d'adoption nomme `archunit-junit5` 1.5.1, dit qu'il est déclaré dans une copie du POM et résolu par Maven, réseau ouvert pour cette seule étape, dans le dépôt local que Maven désigne, et que rien n'est écrit dans le projet
  And elle nomme les règles qu'il vérifiera : le style de chaque partie, les relations permises entre parties, l'absence de cycle et les sources qu'aucune partie ne couvre

Scenario: La carte adoptée est vérifiée, et chaque violation est localisée
  Given le réacteur de la story, dont la classe `User` du modèle du domaine appelle `UserService`, un service du domaine
  When le propriétaire adopte la carte
  Then `archunit-junit5` 1.5.1 est résolu, réseau ouvert pour cette seule étape, et le protocole gelé porte la carte et le contrôle d'architecture, qualifié par ses témoins
  And le `survey` mesure l'exigence d'architecture par ce contrôle, en FAIL, avec un constat qui nomme la règle enfreinte, le fichier `domain/src/main/java/io/demo/domain/user/User.java` et la ligne de l'appel
  And la section état des lieux du rapport donne ce constat avec sa règle, son fichier et sa ligne
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: Une référence qui tient sa carte est mesurée en PASS
  Given le réacteur de la story, sans aucun appel que la carte interdit
  When le propriétaire adopte la carte
  Then le `survey` mesure l'exigence d'architecture par le contrôle d'architecture, en PASS, sans constat

Scenario: Une architecture mixte est vérifiée partie par partie
  Given un réacteur des modules `orders`, `admin` et `shared`, dont le POM d'`admin` dépend d'`orders`
  And une carte adoptée où `orders` est en oignon, `admin` en couches `web`, `service` et `data`, `shared` simple, et où `orders` et `admin` peuvent dépendre de `shared` et pas l'un de l'autre
  And une classe d'`admin` qui utilise une classe d'`orders`, une classe de la couche `data` qui appelle la couche `web`, et une source du paquet `io.demo.admin.legacy` qu'aucune partie ne couvre
  When le contrôle d'architecture passe sur la référence
  Then il rend FAIL, avec un constat pour la relation d'`admin` vers `orders` que la carte ne permet pas, un pour l'appel de `data` vers `web`, chacun à son fichier et à sa ligne, et un pour la source sans partie, à son fichier
  And aucun constat ne porte sur `shared`

Scenario: Le contrôle se qualifie sur un projet qui viole déjà sa carte, et les tests du projet n'en sont pas changés
  Given un réacteur qui viole déjà sa carte adoptée, et dont les tests passent
  When les contrôles sont qualifiés puis passent sur la référence
  Then le contrôle d'architecture est qualifié : son témoin positif passe, et son témoin négatif, une dépendance que la carte interdit, échoue sur ses propres fichiers
  And le contrôle des tests du projet rend PASS sur la référence, sans compter les règles d'architecture parmi ses cas

Scenario: Une résolution qui échoue garde la carte et n'ajoute aucun contrôle
  Given un réacteur Maven dont le dépôt de greffons est injoignable
  When le propriétaire adopte la carte
  Then le protocole gelé porte la carte adoptée, et aucun contrôle d'architecture
  And le `survey` nomme l'exigence d'architecture comme angle mort, avec la raison donnée par la sortie de Maven

Scenario: Les règles internes d'une partie de style other ne sont pas vérifiées, et cela se dit
  Given une carte proposée dont la partie `events` est de style `other`
  When la décision est présentée, puis le propriétaire adopte la carte
  Then l'issue d'adoption dit que les règles internes de la partie `events` ne sont pas vérifiées, seules ses relations et l'absence de cycle l'étant
  And la section état des lieux du rapport le dit aussi, en anglais et en français

Scenario: Un fichier du projet ne fait taire aucune règle de la carte
  Given le réacteur de la story, dont la classe `User` du modèle du domaine appelle `UserService`, un service du domaine
  And un fichier `archunit_ignore_patterns.txt` du projet, dans les ressources du module `domain` et dans les ressources de test du module `infrastructure` qui porte les règles, avec le motif `.*UserService\.describe.*` qui vise la ligne de cette violation
  When le contrôle d'architecture est qualifié puis passe sur la référence
  Then le contrôle d'architecture est qualifié : son témoin positif passe et son témoin négatif échoue
  And la passe de référence rend FAIL avec le constat de la règle `part domain keeps the rings of its onion` au fichier `domain/src/main/java/io/demo/domain/user/User.java` et à la ligne de l'appel

Scenario: Un fichier de configuration du projet ne change aucune règle de la carte
  Given le réacteur de la story, dont le service du domaine `UserService` et le port `UserRepository`, deux paquets d'un même anneau de l'oignon de `domain`, s'appellent l'un l'autre
  And un fichier `archunit.properties` du projet qui porte `cycles.maxNumberToDetect=0`, dans les ressources du module `domain` et dans les ressources et les ressources de test du module `infrastructure` qui porte les règles
  When le contrôle d'architecture est qualifié puis passe sur la référence
  Then le contrôle d'architecture est qualifié : son témoin positif passe et son témoin négatif, un cycle entre deux paquets de la carte, échoue
  And la passe de référence rend FAIL avec un constat de la règle `no cycle between the packages of the map` à un fichier du cycle

## 3. Sécurité

Un état des lieux d'architecture ouvre le réseau à une seule étape : la résolution d'ArchUnit, que le
propriétaire a adoptée avec la carte. Rien d'autre ne l'ouvre (`D-76`). La résolution écrit dans le dépôt
local que Maven désigne, n'exécute aucun but, et la copie est inspectée comme pour PMD (`e10s01`). Elle
n'est acceptée que si elle ne modifie aucun fichier autre que les POM qui reçoivent la déclaration. La
déclaration n'est écrite que dans les copies où les contrôles tournent, jamais dans le projet. Le contrôle
d'architecture tourne réseau fermé. Ses règles sont écrites par 495 depuis la carte du protocole gelé, à
chaque exécution : un fichier de l'arbre analysé ne peut ni les remplacer, ni changer la configuration d'ArchUnit,
ni écarter une de leurs violations (le fichier des motifs ignorés et `archunit.properties` qu'ArchUnit cherche
sur le classpath des règles sont ceux que 495 écrit, vides, avant tout fichier du projet), et la carte n'est jamais lue dans l'arbre (`D-25`, `D-87`). Les
règles ne comptent pas parmi les tests du projet : le verdict de ses tests ne dépend pas de l'architecture.

## 4. Tâches

### Tâche 1 — Les rôles d'une partie suivent son style

La carte porte ce que son style demande. Dans une partie en oignon, chaque paquet a un rôle parmi le modèle
du domaine, les services du domaine, les services d'application et un adaptateur nommé ; un port appartient à
l'anneau qui le déclare. Dans une partie en couches, chaque couche nomme les couches qui peuvent l'appeler.
La consigne de l'intervention et la skill d'identification le demandent. Une carte qui ne le dit pas ne
tient pas : elle n'est pas présentée, et la raison de l'angle mort désigne la partie et ce qui lui manque.
Les faits de la décision donnent, pour une partie en couches, les couches qui peuvent appeler chacune.

- Vérifie : `node --test test/v2-kernel/architecture-map-style-roles.test.ts`
- Tient : `test/v2-kernel/architecture-map-style-roles.test.ts`, « la consigne de l'intervention qui propose la carte nomme les quatre anneaux de l'oignon et demande, pour chaque couche, les couches qui peuvent l'appeler », « une carte dont la partie en oignon orders donne au paquet io.demo.orders.model le rôle the heart of things n'est pas présentée et le survey désigne la partie et le rôle », « une carte dont la partie en couches admin ne dit pas quelles couches peuvent appeler data n'est pas présentée et le survey désigne la couche » et « la décision sur une carte dont admin est en couches donne, pour chaque couche, les couches qui peuvent l'appeler »
- Rouge : le rôle d'un paquet est un texte libre (`ArchitectureMap`, `src/contracts/v1/protocol.ts`), et aucune partie ne dit qui peut appeler ses couches. `checkArchitectureMap` rend `holds: true` pour une partie en oignon dont un paquet a le rôle « the heart of things », comme pour une partie en couches muette sur ses appels (sondé), et la décision la présente. La consigne et la skill ne nomment pas les anneaux, et pour une couche elles ne demandent que les relations entre parties.

### Tâche 2 — Le rapport d'ArchUnit se lit violation par violation

Un lecteur lit le rapport que Surefire écrit pour les règles d'architecture de 495. Il donne un constat par
violation, avec la règle de la carte enfreinte, le fichier source relatif à la copie et la ligne. Une source
sans partie est donnée à son fichier. Le lecteur mesure la structure de tout l'arbre, et pas seulement les
lignes qu'un changement introduit. Un rapport absent ou illisible rend INDETERMINATE.

- Vérifie : `node --test test/v1-adapters/archunit-report.test.ts`
- Tient : `test/v1-adapters/archunit-report.test.ts`, « un rapport d'ArchUnit donne un constat par violation, avec la règle de la carte, le fichier relatif à la copie retrouvé depuis la classe et la ligne », « une source sans partie est rapportée à son fichier » et « un rapport absent ou illisible rend INDETERMINATE »
- Rouge : aucun lecteur ne connaît le rapport d'ArchUnit. Le lecteur `junit-xml`, sur le rapport Surefire d'une règle en oignon violée deux fois à `User.java:6`, rend FAIL avec le seul cas `Architecture495Test.onion` et aucun constat : ni règle, ni fichier, ni ligne (sondé sur un rapport réel d'ArchUnit 1.5.1).

### Tâche 3 — Les règles de la carte adoptée sont vérifiées par ArchUnit sur un vrai réacteur

Quand une carte est adoptée et qu'une copie déclare ArchUnit par la déclaration de 495, l'adaptateur Maven
déclare le contrôle d'architecture, réseau fermé, avec les règles écrites depuis la carte. Ces règles
couvrent le style de chaque partie (anneaux de l'oignon, appels permis entre couches), les relations permises
entre parties, l'absence de cycle entre les paquets d'une partie et entre parties, et les sources sans partie.
Une partie `other` n'a que ses relations et ses cycles. Le témoin négatif est une dépendance que la carte
interdit et que le build compile. Un témoin est jugé sur ses seuls fichiers, si bien qu'une violation déjà
présente dans le projet ne le disqualifie pas. Le contrôle des tests du projet ne lance pas ces règles.

- Vérifie : `node --test test/v4-platform/maven-architecture.test.ts`
- Tient : `test/v4-platform/maven-architecture.test.ts`, « sur le réacteur orders, admin et shared, le contrôle d'architecture est qualifié par ses témoins bien que le projet viole sa carte, et la passe de référence rapporte la relation d'admin vers orders et l'appel de data vers web à leur fichier et à leur ligne, et la source de io.demo.admin.legacy à son fichier, sans constat sur shared » et « sur ce réacteur, le contrôle des tests du projet rend PASS sans compter les règles d'architecture parmi ses cas »
- Rouge : l'adaptateur Maven ne déclare aucun contrôle d'architecture, même quand le POM d'une copie déclare `archunit-junit5`. Aucune règle ne s'écrit depuis une carte : la détection d'un réacteur ne porte que `maven-test` et `structure`, dont le lecteur ne juge que les lignes qu'un changement introduit.

### Tâche 4 — L'adoption de la carte résout ArchUnit, et l'état des lieux mesure l'exigence d'architecture

La décision sur la carte recommande ArchUnit pour les règles de la carte et les nomme. L'issue d'adoption
dit ce qu'elle déclare, résout et écrit. À l'adoption, la déclaration est écrite dans la copie et ArchUnit
résolu, réseau ouvert pour cette seule étape. Le protocole est ensuite gelé avec la carte et le contrôle
d'architecture qualifié. Le `survey` mesure l'exigence d'architecture par ce contrôle, et chaque violation
atteint le rapport avec sa règle, son fichier et sa ligne. La raison « aucun contrôle ne vérifie encore la
carte adoptée », promise par `e11s01`, disparaît, et le test de `e11s01` qui l'attend suit.

- Vérifie : `node --test test/v2-kernel/architecture-map-verification.test.ts`
- Tient : `test/v2-kernel/architecture-map-verification.test.ts`, « l'issue d'adoption de la carte nomme archunit-junit5 1.5.1, sa déclaration dans une copie du POM, sa résolution réseau ouvert pour cette seule étape dans le dépôt local que Maven désigne, et les règles qu'il vérifiera », « l'adoption résout ArchUnit, gèle la carte et le contrôle d'architecture qualifié, et le survey mesure l'exigence d'architecture en FAIL avec un constat qui nomme la règle, domain/src/main/java/io/demo/domain/user/User.java et la ligne de l'appel, que le rapport donne aussi, sans changer le digest du projet » et « sur une référence qui tient sa carte, le survey mesure l'exigence d'architecture en PASS sans constat »
- Rouge : l'issue `adopt_map` ne nomme ni ArchUnit ni le réseau (`src/application/decisions.ts`). À l'adoption, `settleArchitectureMap` rend l'angle mort « no control verifies the adopted architecture map yet » sans rien résoudre, et `surveyBlindSpot` (`src/application/verification.ts`) fait passer cet angle mort avant tout contrôle de l'exigence : le `survey` ne mesure jamais l'exigence d'architecture.

### Tâche 5 — Une résolution qui échoue garde la carte, et les règles internes d'une partie other se disent non vérifiées

Si la résolution d'ArchUnit échoue, la carte adoptée reste gelée, comme déclaration du propriétaire, mais
aucun contrôle d'architecture n'est déclaré. L'exigence devient un angle mort dont la raison reprend la sortie
de Maven. Pour une partie de style `other`, l'issue d'adoption et la section état des lieux du rapport disent
que ses règles internes ne sont pas vérifiées, en anglais et en français.

- Vérifie : `node --test test/v2-kernel/architecture-map-verification-limits.test.ts`
- Tient : `test/v2-kernel/architecture-map-verification-limits.test.ts`, « une résolution d'ArchUnit qui échoue gèle la carte sans contrôle d'architecture et le survey nomme l'exigence comme angle mort avec la raison de Maven » et « pour une partie events de style other, l'issue d'adoption et le rapport, en anglais et en français, disent que ses règles internes ne sont pas vérifiées »
- Rouge : dans un état des lieux, la seule issue d'une résolution qui échoue est celle du référentiel de qualité (`settleQualityReferential`), qui n'adopte rien ; rien ne garde la carte adoptée quand la résolution échoue. L'issue `adopt_map` et `architectureSection` (`src/application/report.ts`) présentent une partie `other` comme les autres, avec son seul style, sans dire que ses règles internes ne sont pas vérifiées.

### Tâche 6 — Un fichier du projet ne fait taire aucune règle de la carte

ArchUnit cherche `archunit_ignore_patterns.txt` par son nom sur le classpath où les règles tournent, et écarte
chaque violation dont la ligne répond en entier à l'un de ses motifs. Ce classpath porte les ressources du
projet : celles de test du module hôte, copiées dans son `target/test-classes`, et celles des modules dans
leur `target/classes`. La déclaration de 495 fait trouver à cette recherche, avant tout fichier du projet, un
fichier vide que 495 écrit hors de la copie avec les règles. Aucune violation des règles de la carte n'est
alors écartée par un fichier de l'arbre analysé, et le fichier du projet n'est ni lu ni changé.

- Vérifie : `node --test test/v4-platform/maven-architecture-ignore-patterns.test.ts`
- Tient : `test/v4-platform/maven-architecture-ignore-patterns.test.ts`, « sur le réacteur domain et infrastructure dont la classe User du modèle appelle UserService, un archunit_ignore_patterns.txt du projet qui vise la ligne de cette violation, dans les ressources de domain et dans les ressources de test d'infrastructure, laisse le contrôle d'architecture qualifié par ses témoins, et la passe de référence rapporte la règle des anneaux de domain à User.java et à la ligne de l'appel »
- Rouge : le profil `archunit495` (`archunitProfile`, `src/adapters/stacks/maven/structure/archunit-declaration.ts`) ne pose aucun fichier de 495 sur le classpath des règles, et y laisse les ressources de test de l'hôte et les ressources principales des modules. `ArchRule.Assertions` d'ArchUnit 1.5.1 charge `archunit_ignore_patterns.txt` par `ClassLoader.getResource` et `EvaluationResult` écarte toute ligne de violation qu'un motif couvre en entier (lu dans le jar). Le fichier du projet est donc trouvé, et la passe de référence ne porte aucun constat de `part domain keeps the rings of its onion`. Le motif s'applique à la ligne de la violation, pas au nom de la règle : `keeps the rings` seul n'écarte rien, et le test vise la ligne de l'appel.

### Tâche 7 — Un fichier de configuration du projet ne change aucune règle de la carte

ArchUnit lit sa configuration dans `archunit.properties`, qu'il cherche par son nom à la racine du classpath où
les règles tournent, celui qui porte les ressources du projet. `cycles.maxNumberToDetect=0` y fait passer toute
règle d'absence de cycle. La déclaration de 495 fait trouver à cette recherche, avant tout fichier du projet, un
fichier vide que 495 écrit hors de la copie avec les règles, comme celui des motifs ignorés : ArchUnit tourne
avec sa configuration par défaut, et le fichier du projet n'est ni lu ni changé.

- Vérifie : `node --test test/v4-platform/maven-architecture-properties.test.ts`
- Tient : `test/v4-platform/maven-architecture-properties.test.ts`, « sur le réacteur domain et infrastructure dont le service et le port du domaine s'appellent, un archunit.properties du projet qui borne la détection des cycles à 0, dans les ressources de domain et dans les ressources et ressources de test d'infrastructure, laisse le contrôle d'architecture qualifié par ses témoins, et la passe de référence rapporte le cycle entre les paquets de la carte »
- Rouge : le profil `archunit495` (`archunitProfile`, `src/adapters/stacks/maven/structure/archunit-declaration.ts`) ne copie que le fichier des motifs ignorés dans les classes de test de l'hôte. `ArchConfiguration` d'ArchUnit 1.5.1 charge `archunit.properties` par `ClassLoader.getResource` (lu dans le jar), et trouve donc celui du projet. Le témoin négatif du contrôle, un cycle entre deux paquets de la carte, passe : le contrôle n'est pas qualifié (sondé), et la passe de référence ne rapporte pas le cycle (mesuré à la recette).

## 5. Hors périmètre

- Juger un candidat avec la carte : la carte est gelée dans le protocole de l'état des lieux qui l'adopte, et
  ne passe pas au changement suivant (`e11s01`). Le lecteur d'imports de 495 reste le contrôle qui oppose à
  un candidat les frontières de ses POM (`ARC-04`).
- Comparer les dépendances que les POM déclarent à celles que le code utilise, nommer ce que la lecture du
  code ne voit pas, et la lecture du modèle sur les données, les préoccupations transverses et le
  déploiement : `e11s03`.
- La vérification de la carte d'une cible Node : `e11s04`.
- Proposer comme règle de la carte un anti-pattern relevé par une revue de patterns : `e11s05`.
- Corriger les violations ou planifier une migration : `e11s06`.
- Les règles internes d'un style `other` (événementiel, pipeline) : la liste de `D-87` les laisse en angle
  mort nommé.
- Un projet qui déclare déjà ArchUnit, ou ses propres tests ArchUnit : ses tests restent des tests du
  projet, lancés par le contrôle des tests. Lire ses règles comme une architecture déclarée relève de la
  même suite que Spring Modulith et jMolecules (`D-87` §4).
- Un POM qui ne reçoit pas la déclaration sans ambiguïté : l'angle mort que 495 nomme déjà pour un
  complément qui ne s'insère pas s'applique.
- Effacer du dépôt local de Maven ce que la résolution y a écrit : c'est le dépôt de la machine (`e12s09`).
- Le fichier `archunit_ignore_patterns.txt` que lisent les tests ArchUnit du projet lui-même : ces tests
  tournent dans le contrôle des tests du projet, et le fichier reste le leur.
- Effacer ou signaler le fichier des motifs ignorés du projet : 495 n'écrit rien dans le projet, et ce fichier
  n'enfreint pas la carte.
