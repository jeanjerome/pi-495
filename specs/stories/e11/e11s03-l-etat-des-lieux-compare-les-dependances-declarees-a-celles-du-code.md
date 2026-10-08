# L'état des lieux d'une cible Maven compare les dépendances que ses POM déclarent à celles que son code utilise, nomme ses angles morts et donne la lecture du modèle sur ses données, ses préoccupations transverses et son déploiement

Story : e11s03
Epic : e11
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Maven qui a adopté la carte de son architecture voit maintenant chaque violation
de ses règles (`e11s02`). Il ne sait pas pour autant si ses POM disent vrai. Prenons un module `app` qui
importe une classe de `domain` sans déclarer `domain` : il la reçoit par `infrastructure`, et le jour où
`infrastructure` cesse d'en dépendre, `app` ne compile plus. Prenons aussi un module qui déclare Guava sans
qu'aucune de ses classes ne l'utilise. L'état des lieux ne dit ni l'un ni l'autre. Il ne dit pas non plus ce
que ses contrôles ne voient pas : un lien établi par réflexion, les sources de test, une bibliothèque hors du
réacteur. Le propriétaire lit donc une absence de constat comme une absence de défaut. Enfin, rien ne lui
parle des données du projet, de ses préoccupations transverses ni de son déploiement, que `ARC-01` compte
parmi ce qu'un diagnostic d'architecture observe.

Avec cette story, adopter la carte fait aussi vérifier la troisième règle de `D-87` §4 : chaque module déclare
dans son POM les dépendances que son code utilise, et utilise celles qu'il déclare. `dependency:analyze` de
`maven-dependency-plugin` 3.11.0 la vérifie, réseau fermé, avec la configuration que 495 écrit et non celle
du projet. Chaque écart est localisé : un usage non déclaré à l'import qui le fait, une déclaration inutilisée
à sa ligne du POM. La section état des lieux nomme ensuite ce que la vérification ne voit pas, chaque point
avec sa raison. Elle donne aussi la lecture du modèle sur les données, les préoccupations transverses et le
déploiement, chaque énoncé à ses indices, sous ce nom et à part des constats : une lecture n'est pas un
constat (`D-74`, `D-87`, Conséquences).

## 2. Promesses

Scenario: La décision dit ce qu'adopter la carte fait vérifier des dépendances, et par quoi
  Given un réacteur Maven des modules `domain`, `infrastructure` et `app`, et une carte proposée qui tient devant le code
  When la décision est présentée au propriétaire
  Then l'issue d'adoption nomme aussi `dependency:analyze` de `maven-dependency-plugin` 3.11.0, avec la règle qu'il vérifiera : chaque module déclare dans son POM les dépendances que son code utilise, et utilise celles qu'il déclare
  And elle dit que ce greffon est résolu dans la même étape qu'ArchUnit, réseau ouvert pour cette seule étape, que sa configuration est déclarée dans une copie de chaque POM du réacteur, et que rien n'est écrit dans le projet

Scenario: Les dépendances déclarées sont comparées à celles que le code utilise, chaque écart localisé
  Given le réacteur de la story, où `app` déclare `infrastructure` et importe `io.demo.domain.User` sans déclarer `domain`, et où `infrastructure` déclare `com.google.guava:guava` sans qu'aucune de ses classes ne l'utilise
  When le propriétaire adopte la carte
  Then le protocole gelé porte, à côté du contrôle d'architecture, le contrôle des dépendances, qualifié par ses témoins
  And le `survey` mesure l'exigence d'architecture par ces deux contrôles, le contrôle des dépendances en FAIL
  And un constat dit qu'`app` utilise `io.demo:domain` sans le déclarer, au fichier `app/src/main/java/io/demo/app/Main.java` et à la ligne de l'import de `io.demo.domain.User`
  And un constat dit qu'`infrastructure` déclare `com.google.guava:guava` sans l'utiliser, au fichier `infrastructure/pom.xml` et à la ligne de cette déclaration
  And la section état des lieux du rapport donne ces deux constats avec leur fichier et leur ligne
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: Un réacteur dont les POM déclarent ce que le code utilise est mesuré en PASS
  Given le réacteur de la story, où `app` déclare `domain` et où `infrastructure` ne déclare plus Guava
  When le propriétaire adopte la carte
  Then le `survey` mesure l'exigence d'architecture par le contrôle des dépendances en PASS, sans constat

Scenario: Le contrôle se qualifie sur un réacteur qui enfreint déjà la règle et reçoit JUnit d'un agrégat
  Given le réacteur de la story, où `app` déclare l'agrégat `org.junit.jupiter:junit-jupiter` et non `junit-jupiter-api`, et dont les tests passent
  When les contrôles sont qualifiés puis passent sur la référence
  Then le contrôle des dépendances est qualifié : son témoin positif passe, et son témoin négatif, un test qui utilise une classe que JUnit apporte sans que son module la déclare, échoue à son propre fichier
  And le contrôle des tests du projet rend PASS sur la référence

Scenario: Une dépendance déclarée pour la seule exécution n'est pas donnée comme inutilisée
  Given le réacteur de la story, où `infrastructure` déclare `com.h2database:h2` dans la portée `runtime`
  When le contrôle des dépendances passe sur la référence
  Then aucun constat ne porte sur `com.h2database:h2`

Scenario: La configuration du greffon dans les POM du projet ne fait taire aucun écart
  Given le réacteur de la story, où le POM d'`app` configure `maven-dependency-plugin` pour ignorer `io.demo:domain` et y déclare une exécution `default-cli` qui saute l'analyse, et où le POM parent fait ignorer, dans sa gestion des greffons, toute dépendance déclarée inutilisée
  When le contrôle des dépendances est qualifié puis passe sur la référence
  Then le contrôle des dépendances est qualifié par ses témoins
  And la passe de référence rapporte l'usage non déclaré de `io.demo:domain` par `app` et la déclaration inutilisée de Guava par `infrastructure`

Scenario: Les propriétés du projet ne changent pas l'analyse
  Given le réacteur de la story, où le POM parent porte les propriétés `mdep.analyze.skip` à `true` et `mdep.analyze.excludedClasses` à `io.demo.app.*`, et où `.mvn/maven.config` porte `-Dmdep.analyze.skip=true`
  When le contrôle des dépendances est qualifié puis passe sur la référence
  Then le contrôle des dépendances est qualifié par ses témoins
  And la passe de référence rapporte l'usage non déclaré de `io.demo:domain` par `app` et la déclaration inutilisée de Guava par `infrastructure`

Scenario: Ce que la vérification de la carte ne voit pas est nommé
  Given une carte adoptée d'un réacteur Maven
  When le propriétaire demande `/495 report` sur l'état des lieux
  Then la section état des lieux nomme, sous la carte, ce que sa vérification ne voit pas, chaque point avec sa raison : un lien établi sans import ni référence dans les classes compilées (réflexion, `META-INF/services`, configuration d'un framework) ; les sources de test, que les règles de la carte ne jugent pas ; les bibliothèques hors du réacteur, que les règles de la carte n'opposent à aucune partie ; une dépendance déclarée pour la seule exécution ; une dépendance dont les classes compilées ne gardent aucune trace (constante recopiée à la compilation, annotation gardée dans la seule source, processeur d'annotations), donnée comme inutilisée ; un agrégat comme `junit-jupiter`, donné comme inutilisé quand ce qu'il apporte est donné comme utilisé sans être déclaré
  And elle le dit en anglais et en français

Scenario: L'intervention qui propose la carte donne aussi la lecture du modèle
  Given un réacteur Maven et une exigence d'architecture à l'état des lieux
  When l'intervention qui propose la carte est ouverte
  Then sa consigne et la skill d'identification demandent, à côté de la carte, une lecture des données, des préoccupations transverses et du déploiement du projet, chaque énoncé avec ses indices, à leur fichier et à leur ligne

Scenario: La lecture du modèle entre dans l'état des lieux sous son nom, à part des constats
  Given une carte adoptée dont la lecture dit que les commandes sont écrites par JPA, avec l'indice `infrastructure/src/main/java/io/demo/infra/JpaOrderRepository.java:5`, que les transactions sont ouvertes par `@Transactional`, avec l'indice `app/src/main/java/io/demo/app/OrderService.java:9`, et que l'application est livrée par une image, avec l'indice `Dockerfile:1`
  When le propriétaire demande `/495 report` sur l'état des lieux
  Then la section état des lieux donne ces trois énoncés comme lecture du modèle, sous les données, les préoccupations transverses et le déploiement, chacun avec son indice, en anglais et en français
  And aucun n'est un constat d'un contrôle, et aucun verdict du `survey` n'en dépend

Scenario: Un énoncé de la lecture dont un indice ne désigne aucune ligne est écarté, et cela se dit
  Given une carte proposée qui tient devant le code, dont la lecture porte un énoncé de déploiement avec l'indice `Dockerfile:40`, alors que `Dockerfile` a 12 lignes
  When le propriétaire adopte la carte, puis demande `/495 report`
  Then la lecture du modèle du rapport ne porte pas cet énoncé
  And elle dit qu'un énoncé a été écarté parce que son indice `Dockerfile:40` ne désigne aucune ligne de la référence

## 3. Sécurité

La vérification des dépendances n'ouvre le réseau à aucune étape de plus que celle d'ArchUnit (`e11s02`). La
résolution qui déclare ArchUnit charge déjà `maven-dependency-plugin` 3.11.0 pour résoudre les greffons, et
`dependency:analyze` n'a besoin de rien d'autre (sondé : sur un dépôt local vide, `resolve-plugins` seul,
puis `analyze` hors ligne). La copie est inspectée comme pour ArchUnit : la résolution n'est acceptée que si
elle ne modifie aucun fichier autre que les POM qui reçoivent la déclaration. La déclaration n'est écrite que
dans les copies où les contrôles tournent, jamais dans le projet. Le contrôle des dépendances tourne réseau
fermé.

`dependency:analyze` lit sa configuration dans les POM du projet et ses paramètres dans les propriétés que
Maven lui donne. La configuration vient du greffon dans le POM d'un module, de la gestion des greffons d'un
parent, ou d'une exécution `default-cli`. Les propriétés viennent des POM ou de `.mvn/maven.config`. Chacune
de ces sources fait taire un écart (sondé, une par une : `ignoredDependencies`,
`ignoredUsedUndeclaredDependencies`, `ignoredUnusedDeclaredDependencies`, `skip`, `mdep.analyze.skip`,
`mdep.analyze.excludedClasses`). La déclaration de 495 donne à l'analyse une configuration qui remplace
entièrement celle du projet, chaque paramètre fixé par 495, dans chaque POM du réacteur. La règle est celle
que le propriétaire a adoptée avec la carte, et non celle que le projet configure pour son propre build. Les
dépendances déclarées pour la seule exécution sont écartées par 495, et ce choix est nommé parmi ce que la
vérification ne voit pas. La carte et sa lecture ne sont jamais lues dans l'arbre (`D-25`, `D-87`). Aucune
skill du projet n'est chargée, et la lecture du modèle n'ajoute aucun constat (`D-74`).

## 4. Tâches

### Tâche 1 — La sortie de dependency:analyze se lit écart par écart

Un lecteur lit ce que `dependency:analyze` 3.11.0 écrit pour chaque module, sous « Used undeclared dependencies
found » et « Unused declared dependencies found ». Les listes « Ignored … » ne sont pas des écarts. Il donne
un constat par écart, avec sa règle, son module et la dépendance. Un usage non déclaré est localisé à chaque
source du module qui importe une des classes que l'analyse nomme, à la ligne de l'import ; à défaut, au POM
du module. Une déclaration inutilisée est localisée au POM qui la déclare, celui du module ou celui d'un
parent du réacteur, à la ligne de son `artifactId`. Le lecteur juge tout l'arbre. Une sortie absente ou
illisible rend INDETERMINATE.

- Vérifie : `node --test test/v1-adapters/dependency-analyze-report.test.ts`
- Tient : `test/v1-adapters/dependency-analyze-report.test.ts`, « la sortie de dependency:analyze donne un constat pour l'usage de io.demo:domain par app, à la ligne de l'import de io.demo.domain.User dans app/src/main/java/io/demo/app/Main.java, et un pour la déclaration inutilisée de Guava, à sa ligne de infrastructure/pom.xml », « une déclaration héritée du POM parent est localisée à sa ligne de ce POM », « les listes Ignored ne donnent aucun constat » et « une sortie absente ou illisible rend INDETERMINATE »
- Rouge : aucun lecteur de 495 ne connaît la sortie de `dependency:analyze`. Les lecteurs chargés sont `exit-code`, `junit-xml`, `jacoco-xml`, `java-imports`, `pitest-xml`, `pmd-xml`, `cpd-xml`, `archunit-xml` et ceux de Node (sondé). Un contrôle qui nomme ce lecteur rend INDETERMINATE avec « parser dependency-analyze is not qualified », sans constat.

### Tâche 2 — Le contrôle des dépendances vérifie un vrai réacteur

Quand une carte est adoptée et qu'une copie déclare ArchUnit par la déclaration de 495, l'adaptateur Maven
déclare aussi le contrôle des dépendances. Ce contrôle, de nature structure et non différentiel, lance
`dependency:analyze` de `maven-dependency-plugin` 3.11.0 réseau fermé, avec les paramètres que 495 fixe. Les
dépendances de portée `runtime` sont écartées (`ignoreUnusedRuntime`) et les classes que chaque écart utilise
sont nommées (`verbose`). Le témoin négatif est un test qui utilise une classe qu'apporte JUnit sans que son
module la déclare, comme `org.opentest4j.AssertionFailedError`. Le test témoin partagé ne peut pas servir de
témoin positif : il importe `org.junit.jupiter.api.Test`, qu'un module qui déclare l'agrégat
`junit-jupiter` utilise sans le déclarer. Le témoin positif de ce contrôle est donc la référence seule.

- Vérifie : `node --test test/v4-platform/maven-dependencies.test.ts`
- Tient : `test/v4-platform/maven-dependencies.test.ts`, « sur le réacteur domain, infrastructure et app, le contrôle des dépendances est qualifié par ses témoins bien que le projet enfreigne la règle et que app reçoive JUnit de l'agrégat junit-jupiter, et la passe de référence rapporte l'usage de io.demo:domain par app à l'import de Main.java et la déclaration inutilisée de Guava à sa ligne d'infrastructure/pom.xml, sans constat sur h2 » et « sur ce réacteur, le contrôle des tests du projet rend PASS »
- Rouge : avec la carte du domaine adoptée et ArchUnit déclaré dans la copie, la détection ne déclare que `maven-test`, `structure` et `architecture` (sondé). Aucun contrôle ne lance `dependency:analyze`, et l'usage de `io.demo:domain` par `app` n'est rapporté nulle part.

### Tâche 3 — La configuration du projet ne fait taire aucun écart

La déclaration de 495 est écrite dans une copie de chaque POM du réacteur : un profil activé par une
propriété que le contrôle seul pose, et qui porte l'exécution que le contrôle lance. Sa configuration
remplace celle du projet (`combine.self="override"`) et fixe chaque paramètre du but. Le profil du seul POM
racine ne suffit pas : un module dont le parent n'est pas la racine du réacteur n'en hérite pas, et sa
configuration s'applique (sondé). Un paramètre dont le
descripteur du greffon nomme une propriété, comme `excludedClasses`, garde la valeur de la propriété même
configuré vide. Il ne la perd que si son propre élément porte `combine.self="override"`. Sans la propriété,
le build de la copie est celui du projet.

- Vérifie : `node --test test/v4-platform/maven-dependencies-configuration.test.ts`
- Tient : `test/v4-platform/maven-dependencies-configuration.test.ts`, « un POM d'app qui ignore io.demo:domain et saute l'analyse dans une exécution default-cli, et un parent qui ignore toute déclaration inutilisée dans sa gestion des greffons, laissent le contrôle des dépendances qualifié et la passe de référence rapporte l'usage de io.demo:domain par app et la déclaration inutilisée de Guava » et « les propriétés mdep.analyze.skip et mdep.analyze.excludedClasses du parent et un .mvn/maven.config qui saute l'analyse laissent le contrôle qualifié et la passe de référence rapporte les deux écarts »
- Rouge : le contrôle de la tâche 2 nomme le but par ses coordonnées, et `dependency:analyze` 3.11.0 applique alors la configuration et les propriétés du projet. Sondé sur un réacteur jetable, chaque vecteur tait un écart : `ignoredDependencies` au POM d'`app` retire `io.demo:domain`, la gestion des greffons du parent retire les dépendances qu'elle vise, une exécution `default-cli` qui saute l'analyse et `mdep.analyze.skip`, au POM comme dans `.mvn/maven.config`, ne laissent que « Skipping plugin execution », et `mdep.analyze.excludedClasses=io.demo.app.*` fait d'`infrastructure` une dépendance inutilisée d'`app` et retire l'usage de `domain`. Un profil de 495 dans chaque POM, d'exécution `analyze495` et de configuration `combine.self="override"`, rend les deux écarts malgré les cinq (sondé).

### Tâche 4 — Adopter la carte apporte le contrôle des dépendances, et l'état des lieux le mesure

L'issue d'adoption nomme `dependency:analyze` de `maven-dependency-plugin` 3.11.0 et la règle qu'il vérifie.
Elle dit qu'il est résolu dans la même étape qu'ArchUnit et que sa configuration est déclarée dans une copie
de chaque POM du réacteur. À l'adoption, toutes les déclarations sont écrites dans la copie. Le protocole est
gelé avec le contrôle d'architecture et le contrôle des dépendances, qualifiés. Le `survey` mesure ensuite
l'exigence d'architecture par l'un et par l'autre, et chaque écart atteint le rapport avec son fichier et sa
ligne.

- Vérifie : `node --test test/v2-kernel/architecture-map-dependencies.test.ts`
- Tient : `test/v2-kernel/architecture-map-dependencies.test.ts`, « l'issue d'adoption de la carte nomme dependency:analyze de maven-dependency-plugin 3.11.0, la règle qu'il vérifie, sa résolution dans la même étape qu'ArchUnit et sa déclaration dans une copie de chaque POM du réacteur », « l'adoption gèle le contrôle des dépendances qualifié, et le survey mesure l'exigence d'architecture par architecture et par dependencies, ce dernier en FAIL avec l'usage de io.demo:domain par app à Main.java et la déclaration inutilisée de Guava à infrastructure/pom.xml, que le rapport donne aussi, sans changer le digest du projet » et « sur un réacteur dont les POM déclarent ce que le code utilise, le survey mesure l'exigence par dependencies en PASS sans constat »
- Rouge : l'issue `adopt_map` (`ARCHITECTURE_MAP_ADOPTION`, `src/application/decisions.ts`) ne nomme qu'ArchUnit et ses quatre familles de règles. `bringVerification` (`src/application/phases/architecture-map.ts`) n'applique que la recommandation d'ArchUnit, au seul POM de son hôte. La détection qui suit ne déclare aucun contrôle des dépendances, et le `survey` mesure l'exigence d'architecture par `architecture` seul.

### Tâche 5 — Ce que la vérification de la carte ne voit pas est nommé

L'adaptateur Maven déclare, avec la vérification qu'il offre, ce qu'elle ne voit pas, chaque point avec sa
raison : les liens établis sans import ni référence dans les classes compilées ; les sources de test, que
les règles de la carte n'importent pas ; les bibliothèques hors du réacteur, que les règles de la carte
n'opposent à aucune partie ; les dépendances de portée `runtime`, que 495 écarte ; les dépendances dont les
classes compilées ne gardent aucune trace ; les agrégats. La liste est gelée avec la carte adoptée. La
section état des lieux du rapport la donne sous la carte, en anglais et en français.

- Vérifie : `node --test test/v2-kernel/architecture-map-unseen.test.ts`
- Tient : `test/v2-kernel/architecture-map-unseen.test.ts`, « la section état des lieux d'une carte adoptée nomme, sous la carte et chacun avec sa raison, les liens établis sans import, les sources de test, les bibliothèques hors du réacteur, les dépendances déclarées pour la seule exécution, les dépendances sans trace dans les classes compilées et les agrégats, en anglais et en français »
- Rouge : `architectureSection` (`src/application/report.ts`) ne rend que la date d'adoption, les parties et les paquets sans partie, et le rapport n'écrit rien d'autre sous la carte. `ArchitectureOffer` (`src/application/stacks/plugin.ts`) ne porte que la recommandation ou la note, et aucun texte de 495 ne nomme ce que la vérification ne voit pas.

### Tâche 6 — La lecture du modèle accompagne la carte, à part des constats

Le format de la carte reçoit une lecture : des énoncés sur les données, sur les préoccupations transverses et
sur le déploiement, chacun avec ses indices. La consigne de l'intervention les demande. La skill
d'identification reçoit les sections de `architecture-blueprint-generator` qui les décrivent, lues à son
commit `caab1f62` et adaptées au format de 495 ; sa provenance et `NOTICE` le disent. Le noyau confronte
chaque indice de la lecture à la référence, comme ceux de la carte. Un énoncé dont un indice ne désigne
aucune ligne est écarté de la lecture, avec la raison, sans que la carte cesse de tenir. La lecture
accompagne la carte adoptée. La section état des lieux du rapport la donne sous son nom, à part des
constats et sans verdict, en anglais et en français.

- Vérifie : `node --test test/v2-kernel/architecture-map-reading.test.ts`
- Tient : `test/v2-kernel/architecture-map-reading.test.ts`, « la consigne de l'intervention et la skill demandent une lecture des données, des préoccupations transverses et du déploiement, chaque énoncé avec ses indices », « la section état des lieux d'une carte adoptée donne les énoncés de la lecture sur JPA, @Transactional et le Dockerfile, chacun avec son indice, comme lecture du modèle, en anglais et en français, et aucun n'est un constat ni ne change un verdict » et « un énoncé dont l'indice Dockerfile:40 ne désigne aucune ligne est écarté de la lecture, le rapport dit pourquoi, et la carte est adoptée »
- Rouge : `ArchitectureMap` (`src/contracts/v1/protocol.ts`) refuse toute propriété hors de `parts` et `relations` : une carte qui porte une lecture échoue à `Value.Check` (sondé), et `proposeMap` lève « architecture map intervention completed with an invalid structured output ». La consigne n'en demande pas, et la provenance de la skill dit que l'architecture des données, les préoccupations transverses et le déploiement ont été laissés de côté.

## 5. Hors périmètre

- Observer un lien établi par configuration ou par réflexion et le marquer avec sa méthode d'observation,
  comme la recette d'`ARC-01` le demande. Il faudrait un lecteur par mécanisme (`META-INF/services`,
  configuration Spring, chaînes passées à `Class.forName`). Cette story le nomme comme angle mort ; l'ajouter
  à `e11` revient au propriétaire.
- Distinguer un agrégat d'une dépendance vraiment inutilisée : il faudrait ouvrir chaque artefact. La story
  rapporte ce que l'analyse dit et nomme l'agrégat parmi ce qu'elle ne voit pas.
- Un `.mvn/maven.config` qui désactive par son nom le profil que 495 écrit dans ses copies (`-P!…`). Sondé :
  une désactivation l'emporte sur l'activation de la ligne de commande. Un tel fichier ne vise pas les outils
  du projet, il est écrit contre 495 ; le profil d'ArchUnit le partage, et son contrôle rend alors
  INDETERMINATE.
- Le code que le build du projet exécute avant l'analyse (extensions de `.mvn/extensions.xml`, greffons liés
  aux phases jusqu'à `test-compile`) : c'est vrai de chaque contrôle Maven, qui lance le build du projet.
- Juger un candidat avec la carte ou avec ses dépendances : la carte est gelée dans le protocole de l'état
  des lieux qui l'adopte (`e11s02`).
- La lecture du modèle sans carte adoptée : elle accompagne la carte, et laisser l'exigence en angle mort
  laisse l'une et l'autre.
- Corriger les POM, ou planifier la migration : `e11s06`. La revue de patterns et la recommandation :
  `e11s05`. La même chaîne pour une cible Node, avec Knip : `e11s04`.
- Effacer du dépôt local de Maven ce que la résolution y a écrit : c'est le dépôt de la machine (`e12s09`).
