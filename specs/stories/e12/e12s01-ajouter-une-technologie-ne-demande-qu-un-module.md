# Ajouter une technologie ne demande qu'un module, et les deux actuelles passent par la même liste d'adaptateurs

Story : e12s01
Epic : e12
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire qui étend 495 à une technologie de plus, après Maven et Node, ne modifie aujourd'hui
pas seulement le module de cette technologie : il ajoute une condition à la chaîne de `detectStack`,
qui choisit la pile d'après les fichiers présents, et il ajoute un nom à l'union fermée
`"node" | "maven" | "unknown"` de `StackDetection`. Le refus d'un projet qu'aucun adaptateur ne
reconnaît écrit en dur « package.json or pom.xml expected » : il ment dès qu'une technologie
s'ajoute. Chaque capacité que les epics à venir portent par technologie (référentiel de qualité,
diagnostic d'architecture, catalogue de frameworks) multiplierait ces endroits par le nombre de
technologies (`D-75`).

Après la story, une technologie est un module qui déclare son identifiant de pile et les fichiers
qui la signalent à la racine d'un projet, et une ligne dans la liste des adaptateurs ; le refus d'un
projet inconnu nomme les fichiers de tous les adaptateurs de la liste. Node et Maven passent par
cette liste sans que rien de ce qu'ils déclarent change, à une exception près : Maven passe avant Node.
Un projet Maven qui porte aussi un `package.json` (l'outillage d'un front, courant) est aujourd'hui pris
pour un projet Node, et ses tests Java ne sont pas jugés ; il est jugé comme un projet Maven.

## 2. Promesses

Scenario: Un adaptateur ajouté à la liste est choisi par le fichier qu'il déclare
  Given un projet dont la racine porte un Cargo.toml, et une liste d'adaptateurs à laquelle un adaptateur de test déclare l'identifiant de pile « cargo » et le fichier Cargo.toml
  When la pile du projet est détectée
  Then la détection est celle que cet adaptateur rend, son identifiant de pile « cargo », son contrôle et sa capacité manquante compris

Scenario: Quand deux adaptateurs se reconnaissent dans le même projet, le premier de la liste l'emporte
  Given un projet dont la racine porte un Cargo.toml et un go.mod, et une liste dont un premier adaptateur déclare Cargo.toml et un second go.mod
  When la pile du projet est détectée
  Then la détection est celle du premier adaptateur
  And avec les deux adaptateurs dans l'ordre inverse, elle est celle du second

Scenario: Un projet qu'aucun adaptateur ne reconnaît est refusé en nommant les fichiers attendus de la liste
  Given un projet dont la racine ne porte aucun des fichiers déclarés, et une liste de deux adaptateurs qui déclarent Cargo.toml et go.mod
  When la pile du projet est détectée
  Then l'identifiant de pile est « unknown » et aucun contrôle n'est déclaré
  And la capacité manquante dit qu'aucun adaptateur qualifié ne reconnaît ce projet et que Cargo.toml ou go.mod est attendu

Scenario: Node et Maven sont détectés, Maven d'abord
  Given un projet qui porte un package.json, un projet qui porte un pom.xml, et un projet qui porte les deux
  When la pile de chacun est détectée avec la liste d'adaptateurs de 495
  Then le premier a la pile « node » et le contrôle unit, le deuxième la pile « maven » et le contrôle maven-test
  And le troisième a la pile « maven » et aucun contrôle Node
  And un projet sans aucun des deux est refusé en disant que pom.xml ou package.json est attendu

## 3. Sécurité

Sans objet : la détection lit toujours la seule présence de fichiers à la racine du projet, sans rien
exécuter, et la story ne touche ni provenance, ni confinement, ni sortie de données, ni chemin
protégé.

## 4. Tâches

### Tâche 1 — La liste d'adaptateurs choisit la pile, Node et Maven en font partie

Un adaptateur de pile déclare son identifiant, les fichiers qui la signalent à la racine d'un projet
et sa fonction de détection. `detectStack` reçoit la liste des adaptateurs en quatrième paramètre,
avec pour valeur par défaut celle de 495, Maven avant Node : il rend la détection du premier
adaptateur dont un fichier déclaré est présent, et sinon la détection d'un projet inconnu, dont la
capacité manquante nomme les fichiers de la liste. `StackDetection` ne ferme plus l'identifiant de pile
sur les deux technologies actuelles. Les modules Node et Maven déclarent leur adaptateur sans changer
ce que leur détection rend.

- Vérifie : `node --test test/v1/target-registry.test.ts test/v1/node-stack.test.ts test/v1/structure.test.ts`
- Tient : `test/v1/target-registry.test.ts`, « given a project holding Cargo.toml and a list that gains an adapter declaring that file, then the detection is the adapter's », « given two adapters that both recognise a project, then the first of the list wins and the reverse order gives the second », « given a project no adapter recognises, then the stack is unknown and the missing capability names the files the list declares » et « given the default list, then package.json gives node, pom.xml gives maven, both give maven, and neither names pom.xml or package.json as expected » ; `test/v1/node-stack.test.ts` et `test/v1/structure.test.ts` restent verts sans modification
- Rouge : `detectStack` ignore un quatrième argument et rend pour le projet à Cargo.toml la pile « unknown » sans contrôle, avec « package.json or pom.xml expected » quel que soit le contenu de la liste, et pour un projet qui porte un pom.xml et un package.json la pile « node »

### Tâche 2 — La convention dit comment une technologie s'ajoute

`CONVENTIONS.md`, à la section « Structure », dit qu'une technologie est un module sous
`src/application/stacks/` et une ligne dans la liste des adaptateurs de `src/application/target.ts`,
et que ce qu'une capacité ajoute par technologie se déclare dans son adaptateur, jamais dans une table
centrale ni dans une condition sur le nom d'une technologie (`D-75`).

- Vérifie à la main : lire la section « Structure » de `CONVENTIONS.md`, puis `npm run check`
- Tient : `CONVENTIONS.md` nomme `src/application/stacks/` et la liste d'adaptateurs de `src/application/target.ts`, et interdit la table centrale et la condition sur le nom d'une technologie
- Rouge : la section « Structure » de `CONVENTIONS.md` dit seulement de suivre les couches et de garder un adaptateur par système externe, et ne dit pas comment une technologie s'ajoute

## 5. Hors périmètre

- Les parseurs de rapport : le format d'un rapport qu'un contrôle lit reste un identifiant de parseur
  fermé au contrat et un aiguillage du lanceur, parce qu'un rapport est une preuve dont le format se
  qualifie (`D-75`, point 3).
- Une troisième technologie, Gradle ou Python par exemple : chacune viendra avec la story qui la
  qualifie. Le test de cette story emploie un adaptateur de test, jamais une technologie prise en charge.
- Un projet qui signale plusieurs technologies à la fois : le premier adaptateur de la liste l'emporte,
  et Maven précède Node (`D-75`). Conduire les deux piles d'un même projet se rouvre sur le premier
  projet qui l'exige.
- Le référentiel de qualité (`e10`), le diagnostic d'architecture (`e11`) et le catalogue de frameworks
  (`e12s05`) : l'adaptateur ne reçoit aucun champ pour eux ; chacune de ces stories l'étend quand elle
  arrive.
- Le contenu de la détection de Node et de Maven : contrôles, témoins, chemins protégés et capacités
  manquantes ne changent pas.
