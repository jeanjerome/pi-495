# L'état des lieux d'architecture marque un lien établi par configuration ou par réflexion avec sa méthode d'observation

Story : e11s09
Epic : e11
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Maven qui a adopté la carte de son architecture voit chaque dépendance que ses
classes compilées établissent contre elle (`e11s02`), et chaque écart entre ses POM et son code (`e11s03`).
Il ne voit pas un lien que le code établit sans import. Prenons le module `domain`, que la carte interdit de
dépendre d'`infrastructure` : une de ses classes charge `io.demo.infra.UserStore` par `Class.forName`, et un
fichier `repository.properties` de ses ressources nomme la même classe. ArchUnit et `dependency:analyze` ne
lisent que les classes compilées, où ce lien ne laisse qu'une chaîne. L'état des lieux mesure donc la carte
en PASS, et ne dit de ce lien que la phrase générale de ses angles morts : « les liens établis sans import ni
référence dans les classes compilées ». La recette d'`ARC-01` demande l'inverse : un lien découvert
uniquement par configuration est marqué avec sa méthode d'observation.

Avec cette story, adopter la carte d'une cible Maven fait aussi relever, sans rien installer, chaque lien
qu'un fichier de configuration ou une chaîne du code établit en nommant en entier une classe d'une autre
partie. Un tel lien que les relations de la carte ne permettent pas est un constat, localisé au fichier et à
la ligne qui le portent, et marqué de la méthode qui l'a observé : par configuration, ou par réflexion. Ce
que cette lecture ne voit toujours pas remplace, sous la carte, la phrase générale d'aujourd'hui.

## 2. Promesses

Scenario: La décision dit qu'adopter la carte fait relever les liens établis par configuration ou par réflexion
  Given le réacteur `domain`, `infrastructure` et `app` de la story, dont la carte proposée tient devant le code
  When la décision est présentée au propriétaire
  Then l'issue d'adoption dit que 495 relève aussi, à chaque exécution et sans rien installer, chaque lien qu'un fichier de configuration ou une chaîne du code établit en nommant en entier une classe d'une partie dont la carte ne permet pas de dépendre
  And elle le dit en français et en anglais

Scenario: Un lien établi par réflexion ou par configuration contre la carte est un constat marqué de sa méthode
  Given le réacteur de la story, où `domain/src/main/java/io/demo/domain/port/UserLoader.java` passe la chaîne `"io.demo.infra.UserStore"` à `Class.forName`, et où `domain/src/main/resources/repository.properties` nomme `io.demo.infra.UserStore`
  When le propriétaire adopte la carte
  Then le protocole gelé porte, à côté du contrôle d'architecture, le contrôle des liens établis par configuration ou par réflexion, qualifié par ses témoins bien que la référence enfreigne déjà la carte
  And le `survey` mesure l'exigence d'architecture par ce contrôle, en FAIL
  And un constat dit que la partie `domain` dépend de la partie `infrastructure` par réflexion, en nommant `io.demo.infra.UserStore`, au fichier `UserLoader.java` et à la ligne de la chaîne
  And un constat dit que la partie `domain` dépend de la partie `infrastructure` par configuration, en nommant `io.demo.infra.UserStore`, au fichier `repository.properties` et à la ligne qui la nomme
  And la section état des lieux du rapport donne ces deux constats avec leur fichier, leur ligne et leur méthode d'observation
  And l'arbre du projet a le même digest qu'avant la demande

Scenario: Un lien que la carte permet, ou qu'elle ne juge pas, n'est pas un constat
  Given le réacteur de la story, où `app/src/main/resources/beans.xml` nomme `io.demo.infra.UserStore`, où un commentaire d'une classe de `domain` nomme `io.demo.infra.UserStore`, et où une source de test de `domain` passe la chaîne `"io.demo.infra.UserStore"` à `Class.forName`
  When le propriétaire adopte la carte
  Then le `survey` mesure l'exigence d'architecture par le contrôle des liens établis par configuration ou par réflexion en PASS, sans constat

Scenario: Ce que la lecture des liens établis sans import ne voit pas est nommé
  Given une carte adoptée d'un réacteur Maven
  When le propriétaire demande `/495 report` sur l'état des lieux
  Then la section état des lieux ne nomme plus, sous la carte, les liens établis par réflexion, par `META-INF/services` ou par la configuration d'un framework comme un angle mort entier
  And elle nomme à leur place, chaque point avec sa raison : un nom de classe construit à l'exécution (concaténation, valeur substituée), une classe désignée autrement que par son nom entier (balayage d'un paquet, nom court, nom d'un fichier comme sous `META-INF/services`), un lien entre deux paquets d'une même partie, un fichier de configuration hors de `src/main/` d'un module, et un fichier de configuration qu'aucune partie ne revendique seule
  And elle le dit en anglais et en français

Scenario: Un fichier qui n'est pas lu parce qu'il contient un octet nul est nommé dans les notes du contrôle
  Given le réacteur de la story, où `domain/src/main/resources/repository.properties` porte un octet nul après la ligne qui nomme `io.demo.infra.UserStore`, et où `domain/src/main/java/io/demo/domain/port/UserLoader.java` en porte un dans un commentaire
  When le contrôle des liens établis par configuration ou par réflexion lit la copie
  Then les notes du contrôle nomment `domain/src/main/resources/repository.properties` comme un fichier non lu parce qu'il contient un octet nul
  And elles nomment de même `domain/src/main/java/io/demo/domain/port/UserLoader.java`
  And un fichier de `src/main/` qui ne contient pas d'octet nul n'est pas nommé dans ces notes

## 3. Sécurité

Le contrôle des liens établis par configuration ou par réflexion n'exécute rien du projet et n'installe rien :
495 le déclare sans commande à lancer, comme le contrôle des frontières que les POM déclarent, et il lit les
fichiers de la copie comme des données. Il tourne réseau fermé, n'écrit rien dans le projet, et n'ouvre le
réseau à aucune étape de l'adoption. Ses règles viennent de la carte gelée dans le protocole, jamais d'un
fichier de l'arbre (`D-25`, `D-87`) : aucun fichier du projet ne peut taire un lien. Un fichier qui dépasse la
borne de lecture, comme un fichier qui n'est pas lu parce qu'il contient un octet nul, source Java comprise,
est nommé dans les notes du contrôle, pas sauté en silence.

## 4. Tâches

### Tâche 1 — Les liens établis par configuration ou par réflexion se lisent contre la carte

Un lecteur de la technologie Maven lit, dans chaque module, les sources Java principales et les autres
fichiers texte sous `src/main/`. Il y relève chaque nom entier d'une classe que les sources principales du
réacteur déclarent : dans une chaîne d'une source Java, c'est un lien par réflexion ; dans un fichier de
configuration, un lien par configuration. Un nom écrit dans un commentaire Java n'est pas un lien. La source
appartient à la partie de son paquet ; un fichier de configuration à la partie dont le périmètre nomme son
module, ou à celle dont un paquet correspond à son dossier sous la racine des ressources. Un lien vers une
partie que les relations de la carte ne permettent pas est un constat à son fichier et à sa ligne, qui nomme
les deux parties, la classe et la méthode d'observation. Un fichier binaire n'est pas lu.

- Vérifie : `node --test test/v1-adapters/configured-links-report.test.ts`
- Tient : `test/v1-adapters/configured-links-report.test.ts`, « la chaîne io.demo.infra.UserStore passée à Class.forName dans UserLoader.java de domain donne un constat à sa ligne, marqué par réflexion, et repository.properties de domain un constat à la ligne qui nomme la classe, marqué par configuration, chacun nommant les parties domain et infrastructure » et « beans.xml d'app, qui nomme une classe d'une partie dont app peut dépendre, un commentaire de domain et une source de test de domain qui nomment io.demo.infra.UserStore ne donnent aucun constat »
- Rouge : aucun lecteur de 495 ne relève un nom de classe écrit en texte. Ceux de la technologie Maven sont JaCoCo, `java-imports`, PIT, PMD, CPD, ArchUnit et `dependency:analyze` (`MAVEN_PLUGIN.readers`, `src/adapters/stacks/maven/maven.ts`) ; `java-imports` ne lit que les déclarations `package` et `import` (`readDeclarations`, `src/adapters/stacks/maven/project/java-declarations.ts`). Un contrôle qui nommerait ce lecteur rend INDETERMINATE avec « parser … is not qualified » (`src/adapters/execution/runner.ts`), sans constat.

### Tâche 2 — Adopter la carte d'une cible Maven fait mesurer les liens établis par configuration ou par réflexion

Quand une carte est adoptée et que la copie déclare ArchUnit par la déclaration de 495, la technologie Maven
déclare aussi le contrôle de ces liens, de nature structure, réseau fermé, sans rien installer. Son témoin
négatif est un fichier de configuration d'une partie qui nomme une classe d'une partie dont la carte ne lui
permet pas de dépendre ; son témoin positif est la référence seule, comme ceux du contrôle d'architecture et
du contrôle des dépendances. Le protocole le gèle qualifié, le `survey` mesure l'exigence d'architecture par
lui, et chaque constat atteint la section état des lieux du rapport avec son fichier, sa ligne et sa méthode.

- Vérifie : `node --test test/v2-kernel/architecture-map-configured-links.test.ts`
- Tient : `test/v2-kernel/architecture-map-configured-links.test.ts`, « l'adoption gèle le contrôle des liens établis par configuration ou par réflexion, qualifié par ses témoins, et le survey mesure l'exigence d'architecture par lui en FAIL, avec le lien de domain vers infrastructure par réflexion à la ligne de la chaîne de UserLoader.java et par configuration à la ligne de repository.properties, que le rapport donne avec leur méthode, sans changer le digest du projet » et « sur un réacteur où seul beans.xml d'app nomme une classe d'infrastructure, le survey mesure l'exigence par ce contrôle en PASS sans constat »
- Rouge : `MAVEN_STRUCTURE.offer` (`src/adapters/stacks/maven/structure/structure-control.ts`) ne déclare que le contrôle `structure` des POM, le contrôle `architecture` d'ArchUnit et le contrôle `dependencies` ; le `survey` mesure l'exigence d'architecture par eux seuls, et aucun constat ne porte sur `UserLoader.java` ni sur `repository.properties`.

### Tâche 3 — L'issue d'adoption nomme la lecture des liens établis sans import

L'issue d'adoption de la carte d'une cible Maven dit, à côté de ce que `dependency:analyze` vérifie, que 495
relève à chaque exécution, sans rien installer, chaque lien qu'un fichier de configuration ou une chaîne du
code établit en nommant en entier une classe d'une partie dont la carte ne permet pas de dépendre, en
français et en anglais.

- Vérifie : `node --test test/v2-kernel/architecture-map-configured-links-decision.test.ts`
- Tient : `test/v2-kernel/architecture-map-configured-links-decision.test.ts`, « l'issue d'adoption de la carte d'un réacteur Maven dit que 495 relève, sans rien installer, les liens qu'un fichier de configuration ou une chaîne du code établit vers une partie dont la carte ne permet pas de dépendre, en français et en anglais »
- Rouge : la phrase `alongside` de `MAVEN_PHRASES.architecture` (`src/adapters/stacks/maven/install/maven-install.ts`) ne nomme que `dependency:analyze` et la règle qu'il vérifie ; l'issue d'adoption (`src/application/decisions.ts`) ne dit rien d'un lien établi sans import.

### Tâche 4 — Ce que la lecture des liens établis sans import ne voit pas est nommé

La liste de ce que la vérification d'une carte Maven ne voit pas perd la phrase générale sur les liens établis
sans import, et nomme à sa place, chaque point avec sa raison : un nom de classe construit à l'exécution, une
classe désignée autrement que par son nom entier, un lien entre deux paquets d'une même partie, un fichier de
configuration hors de `src/main/` d'un module, et un fichier de configuration qu'aucune partie ne revendique
seule. Elle est gelée avec la carte adoptée, et la section état des lieux la donne sous la carte, en anglais
et en français.

- Vérifie : `node --test test/v2-kernel/architecture-map-configured-links-unseen.test.ts`
- Tient : `test/v2-kernel/architecture-map-configured-links-unseen.test.ts`, « la section état des lieux d'une carte adoptée d'un réacteur Maven ne nomme plus les liens par réflexion, META-INF/services ou configuration d'un framework comme un angle mort entier, et nomme chacun avec sa raison les noms construits à l'exécution, les classes désignées autrement que par leur nom entier, les liens à l'intérieur d'une partie, la configuration hors de src/main/ et les fichiers qu'aucune partie ne revendique seule, en anglais et en français »
- Rouge : le premier point de `MAP_VERIFICATION_UNSEEN` (`src/adapters/stacks/maven/structure/map-verification-unseen.ts`) dit que les liens établis sans import ni référence dans les classes compilées (réflexion, `META-INF/services`, configuration d'un framework) ne sont pas vus, et aucun point ne parle d'un nom construit à l'exécution ni d'un fichier qu'aucune partie ne revendique.

### Tâche 5 — Un fichier qui n'est pas lu parce qu'il contient un octet nul est nommé dans les notes du contrôle

Le lecteur des liens établis par configuration ou par réflexion ne lit toujours pas un fichier sous `src/main/`
d'un module qui contient un octet nul, source Java comprise, mais il nomme son chemin dans les notes du
contrôle, comme il nomme un fichier au-delà de la borne de lecture : le contenu d'un fichier du projet ne peut
plus taire ses liens sans trace.

- Vérifie : `node --test test/v1-adapters/configured-links-report.test.ts`
- Tient : `test/v1-adapters/configured-links-report.test.ts`, « un octet nul après la ligne de repository.properties qui nomme io.demo.infra.UserStore et un autre dans un commentaire de UserLoader.java de domain font nommer ces deux fichiers dans les notes du contrôle, comme non lus parce qu'ils contiennent un octet nul, et aucun autre fichier de src/main/ »
- Rouge : `CONFIGURED_LINKS_READER` (`src/adapters/stacks/maven/structure/configured-links-reader.ts`) écarte tout fichier dont le texte contient `\u0000` et n'en garde que le nombre, `facts.binary_files` ; ses notes ne sont que celles de la lecture de l'arbre. Sur le réacteur de la story, avec un octet nul à la fin de `repository.properties`, le contrôle rend FAIL avec le seul constat de `UserLoader.java`, des notes vides et `binary_files` à 2 : aucune note ne nomme `repository.properties`.

## 5. Hors périmètre

- Juger un lien établi par configuration ou par réflexion entre deux paquets d'une même partie, contre les
  anneaux de son oignon ou les couches qu'elle déclare : la story juge les relations entre parties, et la
  story le nomme parmi ce que la vérification ne voit pas. Le plan ne porte pas cette suite.
- Lire les mécanismes d'un framework (balayage de paquets de Spring, noms courts de beans, fichiers nommés
  d'après une interface comme sous `META-INF/services`, valeurs substituées) : il faudrait un lecteur par
  mécanisme, et constituer ce catalogue revient au propriétaire. La story relève le nom entier d'une classe,
  quel que soit le fichier, et nomme le reste parmi ce que la vérification ne voit pas.
- Distinguer, dans un fichier de configuration, un nom écrit dans un commentaire : le fichier est lu comme du
  texte, quel que soit son format.
- Un lien par configuration ou par réflexion qui ferme un cycle entre deux parties que la carte relie dans les
  deux sens : la story le juge par les relations de la carte, pas par l'absence de cycle.
- La même lecture pour une cible Node, où dependency-cruiser voit déjà un `require` ou un `import` écrit en
  toutes lettres : le chemin d'un module écrit dans un fichier de configuration resterait à relever, et le
  plan ne porte pas cette story ; l'ajouter à `e11` revient au propriétaire.
- Juger un candidat avec ce contrôle : le candidat d'une étape de migration est jugé dans `e11s12`.
- Lire un fichier qui contient un octet nul pour y relever ses liens, ou changer le verdict du contrôle parce
  qu'un fichier n'a pas été lu : un tel fichier ne porte pas de nom qu'un lecteur du projet écrirait, le lire
  comme du texte en inventerait, et un fichier au-delà de la borne de lecture ne change pas non plus le
  verdict. Le fichier est nommé dans les notes, rien de plus.
- Reconnaître un fichier binaire autrement que par un octet nul (extension, encodage UTF-16, octets non
  UTF-8) : l'écart porte sur un fichier écarté sans trace, pas sur la règle qui l'écarte.
- Nommer les fichiers que les autres lecteurs de la technologie Maven ne lisent pas : l'écart porte sur ce
  contrôle, dont la section Sécurité promet qu'aucun fichier ne tait un lien.
