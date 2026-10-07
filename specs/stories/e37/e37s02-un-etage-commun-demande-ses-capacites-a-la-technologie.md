# Un étage commun détecte la technologie d'un projet et lui demande chacune de ses capacités, qui répondent dans une même forme

Story : e37s02
Epic : e37
Statut : en cours

## 1. Ce que le lecteur gagne

Celui qui écrit une technologie pour 495 doit aujourd'hui produire, dans un seul `detect()`, un objet de onze
champs (`StackDetection`, `src/application/stacks/stack.ts`). Il y mêle les contrôles, le témoin positif, les
témoins négatifs propres à un contrôle, le nombre de cas qu'ils ajoutent, les identifiants des contrôles de
style, les angles morts et les recommandations. Maven (`src/adapters/stacks/maven/maven.ts`) et Node
(`src/adapters/stacks/node/node.ts`) refont cet assemblage chacun à la main, capacité par capacité, avec la
même logique. Par exemple, chacun ajoute au témoin positif un module de production entièrement appelé et
vérifié dès que la couverture ou la mutation est mesurée. Rien ne lui dit quelles capacités il doit penser à
déclarer : une technologie qui ne dit rien de la structure ne laisse aucun angle mort, et Node n'en laisse pas.
Le même manque reçoit deux phrases selon la technologie. Pour Maven, c'est « whether a test would notice a
change to the introduced lines is not observed », et pour Node « the mutation of the introduced lines is not
measured ».

Il gagne une interface par capacité (tests, couverture, mutation, qualité, structure), un répertoire par
capacité dans chaque technologie, et un étage commun qui pose les questions et assemble les réponses une
seule fois. Le propriétaire qui lit un état des lieux gagne un angle mort nommé pour chaque capacité qu'une
technologie n'offre pas, dans les mêmes mots pour toutes. C'est un défaut et non une préférence. `D-86`
(point 5) veut que le noyau ne parle qu'à cet étage. Les principes 2, 6 et 7 de `CONVENTIONS.md` refusent
qu'une même logique soit recopiée dans chaque technologie.

Une technologie lit aussi le projet jugé directement par `node:fs`, en 25 endroits. Un `pom.xml` que le projet
a remplacé par un lien vers un fichier hors de la copie est lu : sondé le 2026-10-07 sur `main` à `ae6b700`, la
détection rapporte le module `outside-module`, que seul le fichier extérieur déclare. C'est la classe du défaut
corrigé par `e37s01` pour les rapports, restée ouverte pour la détection.

## 2. Promesses

Scenario: Une technologie ne lit pas un fichier du projet lié hors de la copie
  Given un projet dont `pom.xml` est un lien symbolique vers un fichier hors de la copie, qui déclare le module `outside-module`
  When la technologie du projet est détectée
  Then aucun contrôle n'est déclaré, et `outside-module` n'apparaît dans aucun fait de la détection
  And l'angle mort dit que `pom.xml` sort de la copie et n'a pas été lu

Scenario: Une technologie déclarée par ses seules capacités conduit un changement jusqu'à l'acceptation
  Given la technologie fictive de `e37s01`, qui ne déclare que sa reconnaissance de `fict.toml`, sa capacité `tests` et son lecteur `fict-lines`
  When un agent scripté mène un changement jusqu'à son acceptation
  Then le contrôle `fict-tests` est qualifié et la preuve du candidat est `PASS` en `1+fict-lines@1.0.0`
  And le diagnostic du protocole nomme quatre angles morts, un par capacité que la technologie ne déclare pas : « the coverage of the introduced lines is not measured on this target: the fict technology does not offer it », et de même pour la mutation, la qualité et la structure

Scenario: Un même manque reçoit la même phrase dans toutes les technologies
  Given un projet Maven qui ne déclare ni JaCoCo ni moteur de mutation, et un projet Node sous `node --test` sans couverture ni Stryker
  When leur technologie est détectée
  Then chacun nomme la couverture absente par « the coverage of the introduced lines is not measured on this target: » suivi de la raison propre à sa technologie
  And chacun nomme la mutation absente par « the mutation of the introduced lines is not measured on this target: » suivi de sa raison
  And le projet Node nomme la structure par « no dependency direction between modules is checked on this target: the node technology does not offer it »

## 3. Sécurité

Le projet jugé est une entrée non fiable, et la détection le lit avant tout contrôle. Une technologie ne lit
plus le projet que par la vue que l'étage commun lui donne. Cette vue refuse un chemin hors de la copie et un
fichier dont le chemin réel en sort par un lien. Elle borne la taille d'un fichier lu à `MAX_REPORT_BYTES`,
comme la lecture des rapports, et ne permet ni écriture ni exécution. Un refus de la vue arrête la détection et
devient un angle mort qui nomme le chemin : il ne laisse jamais une technologie conclure sur ce qu'elle n'a pas
lu.

Les identifiants des contrôles, leurs commandes, leurs lecteurs et leurs témoins ne changent pas pour Maven et
Node. Le protocole gelé d'un projet sans lien sortant est le même qu'avant, à ses angles morts près, que cette
story renomme ou ajoute. Un dossier écrit avant se relit à l'identique.

## 4. Tâches

### Tâche 1 — Une technologie lit le projet par une vue bornée à la copie

L'étage commun déclare `ProjectView` (`src/application/stacks/project-view.ts`) : l'existence d'un chemin, la
lecture bornée d'un fichier, la liste d'un répertoire, toutes relatives à la copie. Il la remet à la technologie,
qui n'importe plus `node:fs`. L'implémentation vit sous `src/adapters/stacks/` et refuse, en nommant le chemin,
ce que la sonde a montré : un chemin dont le chemin réel sort de la copie, et un fichier au-delà de
`MAX_REPORT_BYTES`. Un refus de la vue pendant la détection rend une détection sans contrôle, dont l'angle mort
nomme le chemin refusé.

- Vérifie : `node --test test/v1-adapters/project-view.test.ts`
- Tient : `test/v1-adapters/project-view.test.ts`, « sur un projet dont `pom.xml` est un lien vers un fichier hors de la copie qui déclare `outside-module`, la détection ne déclare aucun contrôle, aucun de ses faits ne nomme `outside-module`, et son angle mort nomme `pom.xml` comme sortant de la copie »
- Rouge : `discoverMavenReactor` lit `pom.xml` par `readFileSync`, qui suit le lien ; la détection est `maven` avec ses contrôles, et ses faits portent `ignored_modules: ["outside-module"]`

### Tâche 2 — L'étage commun pose les questions par capacité et assemble les réponses une seule fois

`src/application/stacks/` déclare l'interface qu'implémente une technologie :
- `StackPlugin<Model>` : son identifiant, sa reconnaissance d'un projet, qui rend le modèle du projet que ses capacités partagent ou `null`, ses lecteurs, et ses capacités ;
- une interface par capacité, `TestCapability` (obligatoire), `CoverageCapability`, `MutationCapability`, `QualityCapability`, `StructureCapability`, chacune répondant par une `Offer` : `available` avec ses contrôles et son témoin négatif propre, `missing` avec la raison et la recommandation qui la comblerait, `refused` avec sa raison ;
- `TestCapability` donne aussi les témoins positif et négatif communs, le témoin du code mesuré (un module de production qu'un test appelle et vérifie entièrement) et les chemins de préparation.

Un registre reconnaît le projet en interrogeant les technologies dans l'ordre de la liste. Une technologie
détectée assemble ensuite ce que le noyau lit :
- les contrôles ;
- le témoin positif, auquel elle ajoute le témoin du code mesuré quand une offre disponible a un lecteur qui ne juge que les lignes introduites ;
- les témoins propres et le nombre de cas qu'ajoutent les témoins ;
- les contrôles de style, lus dans la nature de leur lecteur ;
- les angles morts et les recommandations.

Un refus de la capacité `tests` ne laisse aucun contrôle, comme Node le fait aujourd'hui pour un lanceur
illisible. Un angle mort s'écrit « <phrase de la capacité>: <raison> ». La phrase est celle de l'étage commun :
« the coverage of the introduced lines is not measured on this target », « the mutation of the introduced lines
is not measured on this target », « the quality of the code is not measured on this target », « no dependency
direction between modules is checked on this target ». Une capacité non déclarée a pour raison « the <id>
technology does not offer it ».

Pendant cette tâche, Maven et Node passent par un adaptateur provisoire qui présente leur `detect()` à l'étage
commun sans rien en changer. La technologie fictive de `test/v2-kernel/fictitious-stack.test.ts` est réécrite
en `StackPlugin` qui ne déclare que `tests`, sans que ses assertions changent.

- Vérifie : `node --test test/v2-kernel/fictitious-stack.test.ts`
- Tient : `test/v2-kernel/fictitious-stack.test.ts`, « le changement mené sur la technologie fictive est accepté, sa preuve candidate est `PASS` en `1+fict-lines@1.0.0`, et les notes du diagnostic de son protocole contiennent "the coverage of the introduced lines is not measured on this target: the fict technology does not offer it" et les phrases de la mutation, de la qualité et de la structure, suivies de la même raison »
- Rouge : la technologie fictive déclare `capability_missing: []`, et rien d'autre ne nomme ce qu'elle n'offre pas ; les notes du diagnostic ne contiennent aucune de ces quatre phrases

### Tâche 3 — Maven et Node implémentent l'interface, un répertoire par capacité

Maven et Node deviennent des `StackPlugin`, rangés ainsi :
- `<tech>.ts` déclare la technologie ;
- `project/` porte le modèle du projet : le réacteur Maven, et le manifeste Node avec son lanceur de tests ;
- `tests/`, `coverage/`, `mutation/`, `quality/` et, pour Maven, `structure/` portent chacun l'implémentation de leur interface, leurs contrôles, leurs témoins et leurs lecteurs.

Node ne déclare pas `structure`. Leurs raisons d'absence perdent la phrase que l'étage commun écrit désormais :
la couverture absente de Maven devient « the coverage of the introduced lines is not measured on this target:
no JaCoCo report bound outside a profile (QLT-04) ». Leur `detect()` et l'adaptateur provisoire disparaissent.

- Vérifie : `node --test test/v1-adapters/blind-spot-wording.test.ts`
- Tient : `test/v1-adapters/blind-spot-wording.test.ts`, « un projet Maven sans JaCoCo ni moteur de mutation et un projet Node sous `node --test` sans couverture ni Stryker nomment chacun la couverture et la mutation absentes par la phrase de l'étage commun suivie de leur raison, et le projet Node nomme la structure par "no dependency direction between modules is checked on this target: the node technology does not offer it" »
- Rouge : Maven écrit « no JaCoCo report bound outside a profile: the coverage of the introduced lines is not measured on this target (QLT-04) » et « no mutation engine declared outside a profile: whether a test would notice a change to the introduced lines is not observed on this target (VER-04) » ; le projet Node ne nomme aucun angle mort de structure

### Tâche 4 — Le noyau ne parle qu'à l'étage commun

`StackDetection`, `StackAdapter` et `detectStack` disparaissent. Les phases (`phases/verification-design.ts`,
`phases/prepare.ts`, `phases/quality-referential.ts`) obtiennent la technologie détectée du registre que
`PhaseContext` leur remet, et lui demandent ce qu'elles lisaient dans l'objet. `CONVENTIONS.md` § Structure
décrit l'arborescence d'une technologie et l'interface qu'elle implémente. Le catalogue des composants
(`specs/amont/conception-technique.md` §4.1) cite l'étage commun.

- Vérifie à la main : `grep -rnE "StackDetection|StackAdapter|detectStack|\.detect\(" src` ne rend rien ; `grep -rn "node:fs" src/adapters/stacks` ne rend que l'implémentation de `ProjectView` ; `ls src/adapters/stacks/maven src/adapters/stacks/node` montre les répertoires de capacité et `project/` ; `npx biome lint --only=complexity/noExcessiveCognitiveComplexity src/application/stacks src/adapters/stacks` et `wc -l` sur ces fichiers ne montrent aucun seuil de `CONVENTIONS.md` § Principles, 7 franchi sans la phrase qui le justifie ; puis `npm run build`, `npm run check` vert avec au moins autant de tests qu'avant, et les deux campagnes de référence (`npm run campagne -- npm`, `npm run campagne -- maven`) vertes, aux angles morts renommés près
- Tient : les recherches, la liste des répertoires, les seuils examinés, la Preflight et les deux campagnes
- Rouge : `verification-design.ts` lit `detection.controls`, `detection.positive_witness`, `detection.lint_control_ids` et huit autres champs de `StackDetection` ; 25 lectures de `node:fs` sous `src/adapters/stacks/`

## 5. Hors périmètre

- Ce qu'une technologie écarte de la copie et protège, l'environnement de ses contrôles, les outils sondés pour l'identité de l'environnement, la forme d'un fichier de test, la disposition des ressources de test et les sources qu'attend le lecteur LCOV : la capacité `workspace`, `e37s03`.
- L'installation et la résolution d'un complément : la capacité `install`, `e37s04`.
- L'interface exportée du paquet, le test de conformité et l'exemple documenté : `e37s05`. Cette story pose l'interface dans `src/application/stacks/` sans la publier.
- Une technologie chargée hors du dépôt de 495 : écartée par `D-86` (point 7).
- La règle de Preflight qui refuse qu'un module générique importe une technologie : avec `e37s04`, quand `installation.ts` n'importe plus rien de Maven.
