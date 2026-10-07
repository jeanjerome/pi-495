# Celui qui écrit une technologie dispose d'une interface publiée, d'un test de conformité et d'un exemple documenté

Story : e37s05
Epic : e37
Statut : à faire

## 1. Ce que le lecteur gagne

Depuis `e37s04`, une technologie tient tout entière dans son dossier : sa reconnaissance d'un projet, ses
capacités, ses lecteurs, sa copie de travail et ses compléments. Mais celui qui veut en écrire une troisième ne
dispose de rien d'autre que le code des deux existantes :
- **interface** : `StackPlugin` et les types qu'il emploie sont des modules internes (`src/application/stacks/plugin.ts`), que le paquet ne publie sous aucun chemin : il n'a pas de champ `exports` ;
- **conformité** : rien ne lui dit si sa technologie tient. Il ne le découvre qu'en menant un changement jusqu'à la qualification, où un contrôle dont le témoin négatif passe, ou un lecteur qui conclut sur un rapport absent, arrête le changement ou, pire, laisse passer une preuve ;
- **exemple** : la technologie fictive qui conduit un changement jusqu'à l'acceptation existe, mais comme aide de test (`test/helpers/fictitious-technology.ts`), sans rien qui explique ce que chaque capacité demande ;
- **README** : la ligne « Other languages » dit que des adaptateurs supplémentaires sont nécessaires, et que « les contrats du noyau et des rapports » en sont la frontière, ce qui n'est plus vrai.

Il gagne un chemin publié, `pi-495/stack`, et une fonction de conformité qu'il lance sur des projets
d'exemple. Elle lui dit, contrôle par contrôle et lecteur par lecteur, ce qui ne tient pas. Il gagne aussi une
technologie d'exemple, documentée, qui n'emploie que ce chemin. C'est un défaut et non une préférence : `D-86`
(point 6) promet cette interface et ce test à qui écrit une technologie. Une technologie écrite ainsi s'ajoute au
dépôt de 495. Aucune n'est chargée d'ailleurs (`D-86`, point 7).

## 2. Promesses

Scenario: L'interface d'une technologie est publiée sous un chemin stable
  Given le paquet de 495 installé dans un projet
  When un module de ce projet importe `pi-495/stack`
  Then il reçoit `stackConformance`, les lecteurs des formats communs (code de sortie, JUnit XML, LCOV) et les types de l'interface : `StackPlugin`, ses capacités, la question qu'elles reçoivent, leur offre et la vue du projet
  And Pi charge toujours l'extension depuis le paquet installé

Scenario: Une technologie conforme passe le test de conformité
  Given la technologie d'exemple et un projet qu'elle reconnaît
  When `stackConformance` la juge sur ce projet
  Then le rapport ne porte aucun constat
  And il nomme chaque contrôle de chaque capacité disponible, qualifié par ses témoins : positif `PASS`, négatif `FAIL`, panne `INDETERMINATE`
  And il nomme chaque lecteur de la technologie, `INDETERMINATE` sur un rapport absent et sur un rapport au-delà de la borne de lecture

Scenario: Le test de conformité nomme ce qui ne tient pas
  Given une variante de la technologie d'exemple dont le témoin négatif passe, et une autre dont le lecteur rend `PASS` sur un rapport absent
  When `stackConformance` juge chacune sur le même projet
  Then le rapport de la première porte un constat qui nomme son contrôle et « negative witness gave PASS »
  And le rapport de la seconde porte un constat qui nomme son lecteur et le rapport absent sur lequel il a conclu
  And un projet que la technologie ne reconnaît pas est un constat, et non un rapport vide

Scenario: Le test de conformité ne lance rien sans bac à sable qualifié
  Given une machine dont le bac à sable n'est pas qualifié
  When `stackConformance` juge la technologie d'exemple
  Then il refuse avec `capability_missing` et la raison du bac à sable, et ne lance aucune commande

Scenario: Node et Maven sont conformes
  Given un projet Node sous `node --test` et un projet Maven, chacun avec une suite qui passe
  When `stackConformance` juge leur technologie sur ce projet
  Then aucun rapport ne porte de constat

Scenario: L'exemple documenté n'emploie que l'interface publiée
  Given la technologie d'exemple du dépôt
  When on lit ses imports
  Then elle n'importe de 495 que `pi-495/stack`
  And son guide dit, capacité par capacité, ce que l'étage commun lui demande et ce qu'il fait de sa réponse, et comment lancer le test de conformité
  And la ligne « Other languages » du README renvoie à ce guide

## 3. Sécurité

Le test de conformité lance les commandes d'une technologie, ses témoins compris. Il les lance comme une vraie
vérification le fait, sous le bac à sable de la plateforme, avec le réseau et les chemins inscriptibles que
déclare chaque contrôle. Sur une machine dont le bac à sable n'est pas qualifié, il refuse avec
`capability_missing` et ne lance rien ; il n'offre aucune option pour courir sans confinement. Il travaille dans
des copies du projet d'exemple et n'écrit rien dans le projet lui-même.

Publier l'interface n'ouvre aucun chargement : la liste des technologies reste celle que monte
`src/extension/runtime.ts`, et aucune technologie n'est chargée hors du dépôt de 495 (`D-86`, point 7). Le champ
`exports` ferme l'accès aux modules internes du paquet par un autre chemin que ceux qu'il déclare. Pi charge
l'extension par le chemin que déclare `pi.extensions`, relatif à la racine du paquet.

## 4. Tâches

### Tâche 1 — Le paquet publie l'interface d'une technologie sous `pi-495/stack`

Un module d'entrée réexporte l'interface de `src/application/stacks/plugin.ts`, la vue du projet et les lecteurs
des formats communs. `package.json` déclare `exports`, avec `./stack` vers ce module construit et ses
déclarations de types. Le chemin de l'extension que `pi.extensions` nomme reste chargeable. `pi-495/stack` se
résout dans `dist/`, que le dépôt ne versionne pas. Un test qui l'importe lit donc le module construit :
`npm run build` le précède, et la Preflight refuse déjà un `dist/` périmé (`lint:distribution`).

- Vérifie : `node --test test/v1-adapters/published-stack-interface.test.ts`
- Tient : `test/v1-adapters/published-stack-interface.test.ts`, « `package.json` déclare `exports["./stack"]` avec ses types, et `import("pi-495/stack")` rend les lecteurs du code de sortie, de JUnit XML et de LCOV »
- Rouge : `package.json` n'a pas de champ `exports` ; `exports["./stack"]` est `undefined`

### Tâche 2 — `stackConformance` juge une technologie sur des projets d'exemple

`stackConformance(technologie, { projects })` reconnaît chaque projet par la technologie seule. Pour chaque
contrôle qu'une capacité dit disponible, il ouvre les copies des témoins et qualifie le contrôle comme la
qualification d'un changement le fait (`qualifyControlDetailed`). Pour chaque lecteur, il lance un contrôle qui
le nomme sur une copie sans rapport, puis sur une copie dont le rapport dépasse la borne de lecture. Il rend un
rapport : ce qu'il a jugé, et un constat par contrôle non qualifié, par lecteur qui conclut, et par projet non
reconnu. Il tourne sous le bac à sable de la plateforme et refuse avec `capability_missing` s'il n'est pas
qualifié. Le module d'entrée de la tâche 1 l'exporte. Le composant reçoit un identifiant `CMP-*` au catalogue
(`specs/amont/conception-technique.md` §4.1).

- Vérifie : `node --test test/v2-kernel/stack-conformance.test.ts`
- Tient : `test/v2-kernel/stack-conformance.test.ts`, « sur un projet qu'elle reconnaît, `stackConformance` rend pour la technologie fictive un rapport sans constat, qui nomme `fict-tests` qualifié et `fict-lines` `INDETERMINATE` sur un rapport absent et au-delà de la borne ; pour une variante dont le témoin négatif passe, un constat qui nomme `fict-tests` et "negative witness gave PASS" ; pour une variante dont le lecteur rend `PASS` sans rapport, un constat qui nomme ce lecteur ; et pour un projet qu'elle ne reconnaît pas, un constat qui le nomme »
- Rouge : après la tâche 1, `pi-495/stack` ne rend pas `stackConformance` ; le test, qui le lit dans le module importé, reçoit `undefined` et aucun rapport

### Tâche 3 — Le test de conformité refuse un bac à sable non qualifié

- Vérifie : `node --test test/v2-kernel/stack-conformance.test.ts`
- Tient : `test/v2-kernel/stack-conformance.test.ts`, « avec un bac à sable déclaré non qualifié, `stackConformance` rejette avec le code `CAPABILITY_MISSING` et la raison du bac à sable, et le moteur d'exécution n'a reçu aucune commande »
- Rouge : la tâche 2 choisit le bac à sable sans lire sa qualification ; avec le moteur sans confinement déclaré non qualifié, les témoins tournent et un rapport est rendu

### Tâche 4 — La technologie fictive devient l'exemple documenté

La technologie fictive de `test/helpers/fictitious-technology.ts` rejoint un répertoire d'exemple du dépôt, hors
de `src/` et du paquet publié, avec son projet d'exemple. Elle n'importe de 495 que `pi-495/stack`. Les tests
qui l'emploient l'importent de là. Un guide, à côté d'elle, dit pour chaque capacité ce que l'étage commun lui
demande et ce qu'il fait de sa réponse : reconnaissance, tests, couverture, mutation, qualité, structure,
copie de travail, installation, lecteurs. Il montre comment lancer `stackConformance` sur ses projets
d'exemple. Il dit qu'une technologie s'ajoute au dépôt de 495, dans `src/adapters/stacks/<technologie>/`, et
qu'elle est montée par `src/extension/runtime.ts`. Il précise que l'interface suit la version du paquet : tant
qu'elle est en 0.x, une version mineure peut la changer. La ligne « Other languages » du README et
`CONVENTIONS.md` renvoient à ce guide.

- Vérifie à la main : `grep -rhoE "from \"[^\"]+\"" <répertoire d'exemple>` ne rend que `pi-495/stack` et des modules `node:` ; `node --test test/v2-kernel/stack-conformance.test.ts test/v2-kernel/fictitious-stack.test.ts test/v2-kernel/fictitious-install.test.ts` vert sur l'exemple déplacé ; lecture du guide, capacité par capacité, contre `src/application/stacks/plugin.ts`
- Tient : la recherche, les tests de la technologie fictive inchangés dans leurs assertions, et le guide confronté à l'interface
- Rouge : la technologie fictive est une aide de test qui importe `src/application/stacks/plugin.ts` et `src/ports/execution.ts` ; aucun guide n'existe, et la ligne « Other languages » renvoie aux contrats du noyau

### Tâche 5 — Node et Maven passent le test de conformité

Un test de plateforme juge Node sur un projet `node --test` et Maven sur un projet Maven, chacun avec une suite
qui passe, par `stackConformance` et sous le bac à sable de la plateforme. Maven tourne hors ligne, sur le dépôt
local du banc Maven des tests de plateforme (`test/helpers/maven-bench.ts`). Un constat sur l'une ou l'autre
est un défaut de la technologie, que la tâche corrige ou que le registre reçoit avec sa raison.

- Vérifie à la main : `node --test test/v4-platform/stack-conformance-of-495.test.ts` vert, Maven compris sur une machine qui porte `mvn` ; puis `npm run build`, `npm run check` vert avec au moins autant de tests qu'avant, et les deux campagnes de référence (`npm run campagne -- npm`, `npm run campagne -- maven`) vertes
- Tient : le test de plateforme, sans constat pour Node ni pour Maven, la Preflight et les deux campagnes
- Rouge : sans objet tant que la tâche 2 n'existe pas ; un constat que la tâche relève sur Node ou Maven est le rouge de sa correction

## 5. Hors périmètre

- Le chargement d'une technologie hors du dépôt de 495, et l'inscription de son identité, de sa version et de son empreinte dans le protocole gelé : `D-86`, point 7, non engagé.
- La conformité de la capacité `install` : le test de conformité juge ce que `D-86` (point 6) lui demande, les contrôles disponibles et les lecteurs. L'installation d'un complément reste tenue par les tests de chaque technologie.
- Un numéro de version propre à l'interface, distinct de celui du paquet : rien ne le lit tant qu'aucune technologie n'est chargée hors du dépôt.
- Une troisième technologie réelle : l'epic `e11` et la suite du plan.
