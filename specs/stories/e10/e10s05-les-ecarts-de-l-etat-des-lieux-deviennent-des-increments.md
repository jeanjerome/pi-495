# Les écarts de l'état des lieux deviennent des incréments priorisés

Story : e10s05
Epic : e10
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui veut amener un projet aux standards dispose depuis `e10s02` et `e10s03` d'un état
des lieux. Cet état des lieux compte, sous chaque règle du référentiel adopté, les violations de chaque
module, dans le code propriétaire comme dans le code généré. Depuis `e10s04`, il peut aussi conduire
depuis Pi une trajectoire de plusieurs incréments qu'il a écrite. Mais rien ne relie les deux. La
trajectoire ne peut pas citer l'état des lieux qui lui sert de point de départ, et un incrément ne peut
pas nommer les écarts qu'il supprime. Une trajectoire de remise aux standards peut donc oublier un écart
sans que rien ne le signale, alors que `QLT-03` demande que les écarts soient traduits en incréments
avec des objectifs mesurables. Pire, son jalon final est franchi dès que ses incréments sont intégrés.
Le programme se clôt alors sans qu'aucun écart ait été mesuré, et le jalon devient la somme des clôtures
que `D-18` et `PRG-05` interdisent.

Avec cette story, la trajectoire cite un état des lieux que le propriétaire a accepté. Les écarts sont
lus dans le dossier de cet état des lieux, jamais dans le document : un écart, c'est une règle du
référentiel, un module et un périmètre, avec son nombre de violations. Chaque écart est supprimé par un
incrément ou écarté par une décision de périmètre motivée ; sinon l'adoption est refusée, comme pour une
exigence globale (`PRG-03`). La demande du changement de chaque incrément nomme ses écarts, avec la
règle, son seuil, le module et le nombre de violations relevé par l'état des lieux : c'est un objectif
mesurable. L'ordre et les dépendances que le propriétaire écrit forment la priorité, et `/495 next` les
suit déjà. Le jalon qui réunit ces incréments n'est plus franchi tant que leurs écarts n'ont pas été
mesurés sur le projet intégré.

## 2. Promesses

Scenario: Une trajectoire de remise aux standards est adoptée sur les écarts de son état des lieux
  Given un réacteur Maven dont le module `domain` porte une méthode de complexité cyclomatique 11 et une méthode privée jamais appelée, et le module `infrastructure` une méthode de complexité cyclomatique 11, dont l'état des lieux au référentiel adopté a été accepté par le propriétaire
  And hors du projet un document de trajectoire qui cite cet état des lieux, avec deux incréments : A supprime `CyclomaticComplexity` et `UnusedPrivateMethod` dans `domain`, et B, qui dépend de A, supprime `CyclomaticComplexity` dans `infrastructure`, sous un jalon final qui réunit A et B
  When le propriétaire adopte cette trajectoire depuis Pi
  Then le programme inscrit l'état des lieux cité, avec le digest de l'arbre qu'il a mesuré, et ses trois écarts du code propriétaire, chacun avec sa règle, son module et son nombre de violations : `CyclomaticComplexity` 1 dans `domain`, `UnusedPrivateMethod` 1 dans `domain`, `CyclomaticComplexity` 1 dans `infrastructure`
  And la demande du changement de A nomme chacun de ses deux écarts avec sa règle, son seuil, son module et son nombre de violations à l'état des lieux
  And le statut liste sous A et sous B les écarts que chacun supprime, avec leur nombre à l'état des lieux

Scenario: Un écart que rien ne prend en charge bloque l'adoption
  Given l'état des lieux accepté du premier scénario, et un document qui le cite sans l'incrément B, sans qu'aucune décision de périmètre n'écarte `CyclomaticComplexity` dans `infrastructure`
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme `CyclomaticComplexity` dans `infrastructure`, code propriétaire, 1 violation, comme supprimé par aucun incrément et écarté par aucune décision de périmètre
  And aucun programme ni changement n'est créé, et la session reste sans liaison

Scenario: Un écart écarté par une décision de périmètre motivée est adopté
  Given un projet Maven dont une classe écrite à la main a une méthode de complexité cyclomatique 11 et une classe marquée `@javax.annotation.processing.Generated` une autre, dont l'état des lieux au référentiel adopté a été accepté
  And un document qui le cite, dont un incrément supprime `CyclomaticComplexity` du code propriétaire, et qui écarte `CyclomaticComplexity` du code généré par une décision de périmètre qui porte sa raison
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption passe, le programme inscrit l'écart du code généré avec la décision de périmètre et sa raison, et le statut le nomme écarté, avec cette raison

Scenario: Un incrément ne supprime pas un écart que l'état des lieux ne porte pas
  Given l'état des lieux accepté du premier scénario, et un document qui le cite dont un incrément dit supprimer `CPD` dans `domain`
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme l'incrément et `CPD` dans `domain` comme un écart que l'état des lieux cité ne porte pas, et aucun changement n'est créé

Scenario: Un état des lieux qui n'a pas mesuré l'existant n'est pas un point de départ
  Given un document de trajectoire qui cite un changement à candidat, ou un état des lieux que le propriétaire a refusé, ou un état des lieux sans référentiel adopté, ou l'état des lieux d'un autre projet, ou un état des lieux dont le contrôle `pmd` n'est pas qualifié
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme le changement cité et la raison pour laquelle il n'est pas un point de départ, et aucun programme ni changement n'est créé

Scenario: Le jalon d'une remise aux standards n'est pas franchi sur la seule clôture de ses incréments
  Given le programme du premier scénario
  When les changements de A puis de B sont intégrés
  Then le programme inscrit une évaluation du jalon final INDETERMINATE, qui nomme chacun des trois écarts comme non mesuré sur le projet intégré
  And le programme n'est pas clos, et le statut le dit

Scenario: Un état des lieux dont un analyseur a coupé son rapport n'est pas un point de départ
  Given un projet Maven dont le rapport PMD porte 1001 violations, la dernière la seule `UnusedPrivateMethod` du module `infrastructure`, dont l'état des lieux au référentiel adopté a été accepté alors que son contrôle `pmd` n'a gardé que les 1000 premiers constats
  And un document qui cite cet état des lieux, dont aucun incrément ne supprime `UnusedPrivateMethod` dans `infrastructure`
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme le changement cité, le contrôle `pmd`, les 1001 constats que compte son rapport et les 1000 que l'état des lieux a gardés
  And aucun programme ni changement n'est créé

Scenario: Un incrément ne nomme pas d'écart quand la trajectoire ne cite aucun état des lieux
  Given un document de trajectoire qui ne cite aucun état des lieux, dont l'incrément A dit supprimer `CPD` dans `domain`
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme l'incrément A et `CPD` dans `domain` comme un écart qu'aucun état des lieux cité ne porte
  And aucun programme ni changement n'est créé

Scenario: Un programme adopté avant que ses incréments nomment des écarts garde son statut
  Given un programme dont le journal inscrit une trajectoire adoptée sans état des lieux, avec des incréments qui ne portent aucun champ d'écarts, comme tout dossier créé avant cette story
  When le propriétaire demande `/495 status`
  Then le statut liste chacun de ses incréments avec son titre et son statut, sans écart ni état des lieux, et aucune erreur « Cannot read properties of undefined » n'est levée

## 3. Sécurité

Le document de trajectoire ne fait que nommer l'état des lieux qu'il cite et les écarts que chaque
incrément supprime. Les écarts et leur nombre sont lus dans le dossier de cet état des lieux, au magasin
d'objets et au journal de 495, sur tout le rapport de chaque analyseur : un état des lieux dont un
contrôle du référentiel a gardé moins de constats que son rapport n'en compte n'est pas un point de
départ, et un incrément ne nomme un écart que d'un état des lieux cité. Un document ne peut donc ni
inventer un écart, ni en réduire un, ni en taire un. L'état des lieux cité doit être celui du même projet, accepté par le propriétaire, avec un
référentiel adopté dont chaque contrôle a mesuré la référence : un analyseur absent ou non qualifié
n'est jamais lu comme l'absence d'écart (`QLT-02`, `D-74`). L'adoption ne lance aucun contrôle et
n'ouvre pas le réseau. Elle ne passe que par la commande `/495`, que l'outil conversationnel
`harness495` ne reçoit pas (`D-09`). Une décision de périmètre qui écarte un écart est inscrite sous
l'acteur de la session, comme l'adoption de `e10s04`, et le noyau refuse toujours qu'un acteur agent
écrive le programme.

## 4. Tâches

### Tâche 1 — Le noyau adopte une trajectoire sur les écarts de son état des lieux

La commande d'adoption porte l'état des lieux cité, avec ses écarts : règle, module, périmètre et nombre
de violations. Elle porte aussi les écarts que chaque incrément dit supprimer, et les décisions de
périmètre qui en écartent avec leur raison. L'adoption refuse, en le nommant, un écart de l'état des
lieux qu'aucun incrément ne supprime et qu'aucune décision motivée n'écarte. Elle refuse aussi un
incrément qui nomme un écart que l'état des lieux ne porte pas. L'événement d'adoption garde l'état des
lieux cité, ses écarts et leurs décisions.

- Vérifie : `node --test test/v0-pure/program.test.ts`
- Tient : `test/v0-pure/program.test.ts`, « une trajectoire dont l'état des lieux porte CyclomaticComplexity dans infrastructure, qu'aucun incrément ne supprime et qu'aucune décision de périmètre n'écarte, est refusée en nommant la règle, le module, le périmètre et son nombre de violations », « un incrément qui supprime CPD dans domain, que l'état des lieux ne porte pas, est refusé en nommant l'incrément et l'écart » et « une trajectoire dont chaque écart est supprimé par un incrément ou écarté avec sa raison est adoptée, et l'événement d'adoption porte l'état des lieux cité, ses écarts et leurs décisions »
- Rouge : dans `decideProgram` (`src/domain/program/program.ts`), `trajectory.adopt` ne vérifie que les incréments, les jalons et les exigences globales. Une commande qui porte un état des lieux et ses écarts rend `ok: true`, et l'événement `trajectory.adopted` ne recopie que `increments`, `milestones`, `global_requirements` et `reason` : il ne garde ni l'état des lieux ni ses écarts, et rien n'est refusé.

### Tâche 2 — Le jalon ne franchit pas des écarts qu'il n'a pas mesurés

L'évaluation d'un jalon compte chaque écart supprimé par un de ses incréments comme une vérification sur
le projet intégré. Tant qu'aucune mesure ne lui donne de verdict, l'écart est indéterminé et le jalon
n'est pas franchi. Un écart écarté par une décision de périmètre n'y entre pas.

- Vérifie : `node --test test/v0-pure/program.test.ts`
- Tient : `test/v0-pure/program.test.ts`, « A et B intégrés, le jalon final d'une trajectoire adoptée sur un état des lieux est INDETERMINATE, nomme chacun des trois écarts comme non mesuré sur le projet intégré, et le programme n'est pas clos »
- Rouge : `evaluateMilestone` ne lit comme vérifications que `m.global_requirement_ids`. A et B intégrés au digest de la dernière intégration, il rend PASS, et `milestone.evaluate` émet `program.closed` « final milestone passed ».

### Tâche 3 — Le harnais lit les écarts dans le dossier de l'état des lieux cité

Le document de trajectoire peut citer un état des lieux et dire, pour chaque incrément, les écarts qu'il
supprime ; il peut aussi écarter un écart par une décision de périmètre motivée. À l'adoption, le
harnais charge le changement cité et le refuse, avec sa raison, s'il n'est pas l'état des lieux du même
projet, accepté, avec un référentiel adopté dont chaque contrôle a mesuré la référence. Sinon, il compte
les écarts de son `survey` par règle, module et périmètre, comme le rapport, et les passe au noyau. La
demande du changement de chaque incrément nomme ses écarts avec leur règle, leur seuil, leur module et
leur nombre de violations.

- Vérifie : `node --test test/v2-kernel/program-baseline.test.ts`
- Tient : `test/v2-kernel/program-baseline.test.ts`, « adopter une trajectoire qui cite l'état des lieux accepté du réacteur inscrit au programme l'état des lieux, le digest de l'arbre mesuré et ses trois écarts du code propriétaire avec leur nombre, et la demande du changement de A nomme ses deux écarts avec leur règle, leur seuil, leur module et leur nombre », « l'écart du code généré écarté par une décision de périmètre motivée est inscrit avec sa raison » et « un document qui cite un changement à candidat, un état des lieux refusé, sans référentiel adopté, d'un autre projet ou dont pmd n'est pas qualifié est refusé avec un message qui nomme le changement et la raison, sans programme créé »
- Rouge : `TrajectoryDocument` (`src/contracts/v1/trajectory.ts`) ferme ses propriétés. `readTrajectory` refuse donc un document qui cite un état des lieux avec « trajectory document refused: /baseline schema is false; / must not have additional properties », et aucun programme n'est inscrit. Pour un document qui cite un état des lieux refusé ou étranger, ce message ne nomme ni le changement cité ni sa raison. `incrementRequest` n'écrit que le titre, la valeur et le critère de clôture.

### Tâche 4 — Le statut dit les écarts de chaque incrément

La vue de statut d'un programme porte l'état des lieux cité, les écarts de chaque incrément avec leur
nombre à l'état des lieux, et les écarts écartés avec leur raison. Le texte du statut les écrit sous
chaque incrément, puis les écarts écartés, en français et en anglais.

- Vérifie : `node --test test/v0-pure/program-status.test.ts`
- Tient : `test/v0-pure/program-status.test.ts`, « le statut d'un programme de remise aux standards nomme l'état des lieux cité, liste sous A et sous B les écarts que chacun supprime avec leur nombre à l'état des lieux, et l'écart écarté avec sa raison, en français et en anglais »
- Rouge : `statusView` (`src/application/views.ts`) ne donne de chaque incrément que son identifiant, son titre et son statut, et `formatStatus` (`src/presentation/structured/text.ts`) n'écrit aucun écart ni aucune décision de périmètre.

### Tâche 5 — Aucun écart ne se perd entre le rapport, le document et le statut

À l'adoption, le harnais lit la preuve de chaque contrôle du référentiel de l'état des lieux cité, et
refuse ce point de départ, en nommant le changement, le contrôle et les deux comptes, quand le fait
`findings` de cette preuve compte plus de constats que l'état des lieux n'en a gardés. Le noyau refuse
une trajectoire qui ne cite aucun état des lieux dès qu'un de ses incréments nomme un écart, en nommant
l'incrément et l'écart. La vue de statut lit un incrément sans champ d'écarts, inscrit par un dossier
antérieur, comme un incrément qui n'en supprime aucun.

- Vérifie : `node --test test/v2-kernel/program-baseline.test.ts test/v0-pure/program.test.ts test/v0-pure/program-status.test.ts`
- Tient : `test/v2-kernel/program-baseline.test.ts`, « un état des lieux dont le contrôle pmd a gardé 1000 des 1001 constats de son rapport est refusé avec un message qui nomme le changement, le contrôle et les deux comptes, sans programme ni changement créé » ; `test/v0-pure/program.test.ts`, « une trajectoire qui ne cite aucun état des lieux et dont l'incrément A supprime CPD dans domain est refusée en nommant l'incrément et l'écart, sans événement d'adoption » ; `test/v0-pure/program-status.test.ts`, « le statut d'un programme dont la trajectoire a été adoptée avec des incréments sans champ d'écarts liste chacun avec son titre et son statut, sans écart ni état des lieux »
- Rouge : la preuve n'est jamais lue. `baseline` (`src/application/harness.ts`) ne passe à `baselineOf` (`src/application/baseline.ts`) que l'état, le projet, le protocole et l'état des lieux. `notAStartingPoint` ne refuse qu'un contrôle absent ou nommé angle mort, et `surveyGaps` compte les 1000 constats que `judgedQualityFindings` (`src/adapters/execution/parsers.ts`) garde sous `MAX_QUALITY_FINDINGS`, si bien que l'adoption passe et inscrit le programme. `decideProgram` (`src/domain/program/program.ts`) n'appelle `checkGaps` que sous `command.baseline` : sondé, `trajectory.adopt` sans état des lieux dont l'incrément nomme `CPD` dans `domain` rend `ok: true`. `statusView` (`src/application/views.ts`) lit `i.gaps.flatMap` : sondé sur un `trajectory.adopted` dont l'incrément n'a pas de `gaps`, il lève « Cannot read properties of undefined (reading 'flatMap') ».

## 5. Hors périmètre

- Mesurer les écarts sur le projet intégré pour leur donner un verdict, et annoncer la conformité dans
  le seul périmètre contrôlé : `e10s06`. D'ici là, le jalon d'une remise aux standards reste
  INDETERMINATE et le programme ne se clôt pas.
- Juger le candidat d'un incrément avec le référentiel, pour qu'il ne supprime pas un écart en en créant
  un autre (`QLT-04`) : un changement à candidat ne se voit toujours pas proposer le référentiel, et
  aucune story du plan ne le porte encore. La demande nomme l'objectif ; elle ne le mesure pas.
- Proposer la trajectoire ou la priorité à la place du propriétaire : il l'écrit (`D-16`). 495 ne note
  ni le risque ni le coût d'un écart. Une échelle pour les noter, et la règle qui en tirerait un ordre,
  n'existent dans aucun texte et reviennent au propriétaire. L'ordre de la trajectoire, ses dépendances
  et la valeur de chaque incrément portent la priorité.
- Distinguer dans le plan la transformation structurelle de la réduction de la dette, comme le demande
  la recette de `QLT-03` : les sortes d'incrément restent celles de `e10s04`, et la migration
  d'architecture est `e11s04`.
- Refuser un état des lieux pris sur un arbre que le projet a dépassé depuis : le programme garde le
  digest de l'arbre mesuré, mais choisir entre refuser ce point de départ et l'accepter tel quel revient
  au propriétaire.
- Adopter un état des lieux partiel, dont un contrôle du référentiel n'a rien mesuré, en nommant les
  règles qu'il laisse sans mesure : il est refusé, comportement qui arrête, tant que le propriétaire n'a
  pas choisi autre chose.
- Un objectif de réduction partielle, comme passer de trente violations à dix : un incrément qui nomme
  un écart le supprime. Une cible chiffrée par écart serait un seuil que nul texte ne fixe.
- Un écart plus fin que la règle dans un module, comme un fichier ou une violation : l'état des lieux
  compte par module, et l'identité d'une violation ne garde pas sa ligne (`D-23`).
- Compter les écarts sur tout le rapport d'un analyseur qui dépasse 1000 constats, pour adopter quand
  même la remise aux standards d'un projet qui en porte plus : l'état des lieux ne garde que les 1000
  premiers, et le refuser est le comportement qui arrête. Garder par règle et par module le compte entier
  à côté des constats bornés revient à une story que le plan ne porte pas encore.
- Relever ou supprimer la borne de 1000 constats d'un analyseur, ou la note qui la signale dans la preuve
  d'un changement à candidat : seule l'adoption d'une trajectoire lit le compte d'un état des lieux.
- Reprendre un dossier antérieur pour donner à ses incréments des écarts ou un état des lieux : son
  programme reste celui d'une trajectoire sans état des lieux.
