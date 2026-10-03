# Un programme à plusieurs incréments se conduit depuis Pi jusqu'à son jalon

Story : e10s04
Epic : e10
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui veut amener un projet aux standards en plusieurs étapes, comme le feront les écarts
priorisés de `e10s05` ou une migration d'architecture (`e11s04`), ne peut aujourd'hui conduire depuis Pi
qu'un programme d'un seul incrément : `/495 start` adopte toujours la trajectoire « initial
single-increment trajectory ». Le noyau porte pourtant les dépendances entre incréments, leur
éligibilité et les jalons (`D-16`), mais aucun chemin depuis Pi n'adopte une trajectoire de plusieurs
incréments. Rien n'inscrit au programme le résultat du changement d'un incrément, ne démarre
l'incrément suivant ni n'évalue un jalon. Un incrément dont le changement est clos reste donc `active`
pour toujours, et le programme ne peut plus avancer. La règle de `PRG-03` qui dit qu'une exigence globale
non affectée bloque l'adoption est écrite, mais elle ne refuse jamais rien : le programme ne connaît pas
ses exigences globales (`BUG-2026-10-01T200000`).

Avec cette story, le propriétaire adopte depuis Pi une trajectoire qu'il a écrite : des incréments
reliés, chacun avec son critère de clôture, des jalons, et les exigences globales du programme.
Chacune de ces exigences est portée par un incrément, vérifiée par un jalon ou écartée par une décision
de périmètre motivée ; sinon l'adoption est refusée. Il conduit ensuite chaque incrément comme un
changement, l'un après l'autre. Le programme inscrit le résultat de chacun et réévalue son jalon sur le
projet intégré, jamais sur la somme des clôtures (`D-18`, `PRG-05`). Le jalon final franchi clôt le
programme.

## 2. Promesses

Scenario: Une trajectoire de trois incréments reliés est adoptée depuis Pi
  Given un projet Git, et hors du projet un document de trajectoire qui porte trois incréments, A le socle commun, B et C qui dépendent de A, chacun avec son titre, sa valeur et son critère de clôture, un jalon final qui réunit A, B et C, et une exigence globale R1 portée par B et C
  When le propriétaire adopte cette trajectoire depuis Pi
  Then le programme inscrit la trajectoire adoptée, avec ses trois incréments, leurs dépendances, son jalon et R1
  And un changement est créé pour A, dont la demande porte le titre, la valeur et le critère de clôture de A, et la session y est liée
  And le statut liste A actif, B et C planifiés, et le jalon sans évaluation

Scenario: Une exigence globale affectée à rien bloque l'adoption
  Given le document du premier scénario, qui déclare en plus une exigence globale R2 qu'aucun incrément ne porte, qu'aucun jalon ne vérifie et qu'aucune décision de périmètre n'écarte
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme R2 comme affectée ni à un incrément, ni à une vérification de jalon, ni à une décision de périmètre
  And aucun changement n'est créé et la session reste sans liaison

Scenario: Une exigence globale écartée par une décision de périmètre ou vérifiée par un jalon est adoptée
  Given le document du premier scénario, avec une exigence globale R2 écartée par une décision de périmètre qui porte sa raison, et une exigence globale R3 que le jalon final vérifie lui-même
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption passe, et la trajectoire inscrite porte R2 avec la décision de périmètre et sa raison, et R3 sous le jalon final

Scenario: Un document de trajectoire mal formé n'adopte rien
  Given un document de trajectoire dont un incrément n'a pas de critère de clôture, ou dont un incrément dépend d'un incrément qu'il ne déclare pas
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme l'incrément et ce qui lui manque, et aucun changement n'est créé

Scenario: La clôture d'un incrément est inscrite au programme et réévalue son jalon
  Given le programme du premier scénario, l'intégration locale permise
  When le changement de A est intégré
  Then le programme inscrit A intégré, et B et C deviennent prêts
  And le programme inscrit une évaluation du jalon sur le projet intégré, au digest de l'intégration de A, de verdict NOT_RUN, qui nomme B et C comme restants
  And le statut le dit

Scenario: L'incrément suivant démarre depuis Pi sur le projet intégré
  Given le programme dont A est intégré, la session encore liée au changement clos de A
  When le propriétaire demande l'incrément suivant depuis Pi
  Then un changement est créé pour B, premier incrément prêt dans l'ordre de la trajectoire, rattaché au programme et à B, et la session y est liée
  And la référence de ce changement est l'arbre du projet qui porte le commit d'intégration de A

Scenario: Un incrément ne démarre pas tant qu'un autre du programme est ouvert
  Given le programme du premier scénario, dont le changement de A attend une décision du propriétaire
  When le propriétaire demande l'incrément suivant depuis Pi
  Then la demande est refusée avec un message qui dit que le programme conduit un incrément à la fois
  And aucun changement n'est créé et la session reste liée au changement de A

Scenario: Un incrément abandonné bloque ses dépendants, pas les autres
  Given la trajectoire du premier scénario, avec un quatrième incrément D qui dépend de B, A intégré
  When le propriétaire annule le changement de B
  Then le programme inscrit B bloqué, D reste planifié, et l'évaluation du jalon nomme B comme restant
  And l'incrément suivant que le propriétaire demande est C

Scenario: Le jalon final franchi clôt le programme
  Given le programme du premier scénario, dont le jalon final ne vérifie aucune exigence globale lui-même
  When les changements de A, B et C sont intégrés l'un après l'autre
  Then le programme inscrit une évaluation du jalon de verdict PASS, au digest de la dernière intégration, puis sa clôture
  And le statut dit le jalon PASS et le programme clos
  And une demande de l'incrément suivant est refusée avec un message qui dit que le programme est clos

Scenario: Un jalon dont la vérification globale n'a pas tourné n'est pas franchi
  Given le programme du troisième scénario, dont le jalon final vérifie R3
  When les changements de A, B et C sont intégrés
  Then l'évaluation du jalon est INDETERMINATE et nomme R3 comme non exécutée, et le programme n'est pas clos

Scenario: Un jalon n'est pas franchi sans candidat intégré
  Given le programme du premier scénario, l'intégration locale non permise
  When le changement de A est accepté sans être intégré
  Then le programme inscrit A accepté, et l'évaluation du jalon est INDETERMINATE et nomme le candidat intégré comme manquant

## 3. Sécurité

L'adoption d'une trajectoire et le départ d'un incrément ne passent que par la commande `/495`. L'outil
conversationnel `harness495` n'en reçoit aucun (`D-09`). Le noyau refuse déjà qu'un acteur agent écrive
le programme : un modèle ne peut ni adopter une trajectoire, ni écarter une exigence globale par une
décision de périmètre. L'acte est inscrit sous l'acteur de la session, comme celui de `/495 start`.
Le document de trajectoire est lu, jamais exécuté. Il est gardé au magasin d'objets comme l'objectif du
programme, et le texte d'un incrément entre dans la demande de son changement comme les mots du
propriétaire. Chaque changement d'incrément garde ses portes, son confinement et son intégration à
deux temps : la story n'en change aucun.

## 4. Tâches

### Tâche 1 — Une exigence globale non affectée bloque l'adoption

La commande d'adoption porte les exigences globales du programme. Chacune peut porter une décision de
périmètre avec sa raison. L'adoption refuse, en la nommant, une exigence globale qu'aucun incrément ne
porte, qu'aucun jalon ne vérifie et qu'aucune décision de périmètre n'écarte. L'événement d'adoption
garde les exigences globales et leurs décisions. La garde morte est remplacée.

- Vérifie : `node --test test/v0-pure/program.test.ts`
- Tient : `test/v0-pure/program.test.ts`, « une trajectoire qui déclare une exigence globale R2 affectée ni à un incrément, ni à une vérification de jalon, ni à une décision de périmètre est refusée en nommant R2 » et « une exigence globale écartée par une décision de périmètre avec sa raison, ou vérifiée par un jalon, est adoptée et l'événement d'adoption la porte avec sa décision »
- Rouge : dans `decideProgram` (`src/domain/program/program.ts`), `trajectory.adopt` teste chaque exigence de `m.global_requirement_ids` par `!covered.has(rid) && !m.global_requirement_ids.includes(rid)`, toujours faux puisque `rid` vient de cette liste. La commande ne porte ni les exigences globales du programme ni de décision de périmètre : la trajectoire qui déclare R2 rend `ok: true` avec un événement `trajectory.adopted`, qui ne garde ni R2 ni sa décision.

### Tâche 2 — Le statut dit les incréments et le jalon

La vue de statut d'un programme porte chaque jalon avec sa dernière évaluation : verdict, ce qui est
satisfait, ce qui reste et ce qui est indéterminé, ou l'absence d'évaluation. Elle dit aussi si le
programme est clos. Le texte du statut liste chaque incrément avec son statut, puis chaque jalon avec
son verdict et ce qui reste, en français et en anglais.

- Vérifie : `node --test test/v0-pure/program-status.test.ts`
- Tient : `test/v0-pure/program-status.test.ts`, « le statut d'un programme dont le jalon est évalué NOT_RUN liste A intégré, B et C prêts, et le jalon NOT_RUN avec B et C restants, en français et en anglais » et « le statut d'un programme dont le jalon final est PASS dit le programme clos »
- Rouge : `statusView` (`src/application/views.ts`) ne donne au programme que son identifiant, son titre, son chemin et ses incréments : ni jalon, ni évaluation, ni clôture. `formatStatus` (`src/presentation/structured/text.ts`) écrit une seule ligne pour le programme et rien sur ses incréments.

### Tâche 3 — Le propriétaire adopte une trajectoire depuis Pi

Une sous-commande de `/495` reçoit le chemin d'un document de trajectoire. Le document est lu et validé
par un schéma du contrat, puis gardé au magasin d'objets. Le harnais crée le programme et adopte la
trajectoire ; un refus du noyau ne laisse ni programme ni changement. Le changement du premier
incrément prêt est ensuite démarré, avec pour demande le titre, la valeur et le critère de clôture de
l'incrément. La session y est liée et le changement est conduit, comme après `/495 start`.

- Vérifie : `node --test test/v3-pi/program-entry.test.ts`
- Tient : `test/v3-pi/program-entry.test.ts`, « adopter depuis Pi un document de trois incréments crée le programme, lie la session au changement de A dont la demande porte le titre, la valeur et le critère de clôture de A, et le statut liste A actif, B et C planifiés », « un document qui déclare R2 affectée à rien est refusé avec un message qui nomme R2, sans changement ni liaison » et « un document dont un incrément n'a pas de critère de clôture est refusé avec un message qui le nomme »
- Rouge : `SUBCOMMANDS` (`src/extension/command.ts`) ne connaît aucune sous-commande d'adoption : le gestionnaire retombe sur `help`, qui n'écrit que la ligne d'usage. Aucun programme n'est créé, et `session.binding` reste nul. `Harness.start` n'adopte que la trajectoire « initial single-increment trajectory ».

### Tâche 4 — La clôture d'un changement est inscrite au programme et réévalue le jalon

Quand le changement d'un incrément se clôt, le programme inscrit le résultat de l'incrément : intégré
pour un changement intégré, accepté pour un changement accepté sans intégration, bloqué pour un
changement rejeté ou annulé. Chaque jalon qui contient l'incrément est alors réévalué. Le digest intégré
de cette évaluation est celui de la dernière intégration d'un incrément du programme, ou rien quand
aucun incrément n'a été intégré.

- Vérifie : `node --test test/v2-kernel/program-increments.test.ts`
- Tient : `test/v2-kernel/program-increments.test.ts`, « quand le changement de A est intégré, le programme inscrit A intégré, B et C prêts, et une évaluation du jalon NOT_RUN au digest de l'intégration de A qui nomme B et C restants », « quand le changement de B est annulé, le programme inscrit B bloqué, D reste planifié et l'évaluation nomme B restant », « A, B et C intégrés, le jalon final est PASS et le programme est clos ; s'il vérifie R3, il est INDETERMINATE et nomme R3 non exécutée » et « A accepté sans intégration, l'évaluation du jalon est INDETERMINATE et nomme le candidat intégré manquant »
- Rouge : hors de `src/domain/program/program.ts`, aucun code de `src/` n'émet `increment.result` ni `milestone.evaluate`. Après la clôture du changement de A, `loadProgram` rend A toujours `active`, B et C `planned`, et `milestone_evaluations` vide. `Harness.cancel` n'inscrit que `change.cancel`.

### Tâche 5 — L'incrément suivant démarre depuis Pi

Sur une session liée à un programme, une sous-commande de `/495` démarre le changement du premier
incrément prêt dans l'ordre de la trajectoire. Sa référence est capturée sur le projet tel qu'il est,
et la session est liée au nouveau changement. Le refus du noyau est rendu avec son code et son message :
un incrément encore actif, un programme clos ou aucun incrément prêt.

- Vérifie : `node --test test/v2-kernel/program-next-increment.test.ts test/v3-pi/program-next-entry.test.ts`
- Tient : `test/v2-kernel/program-next-increment.test.ts`, « A intégré, démarrer l'incrément suivant crée le changement de B rattaché au programme et à B, dont la référence porte le commit d'intégration de A ; B annulé, l'incrément suivant est C ; le programme clos, la demande est refusée », et `test/v3-pi/program-next-entry.test.ts`, « sur une session liée au programme dont le changement de A attend une décision, demander l'incrément suivant est refusé avec un message qui dit qu'un incrément à la fois est conduit, sans changement créé, la session restant liée à A »
- Rouge : `Harness.start` crée toujours un nouveau programme `prg_*` dont le seul incrément `inc_1` est lié au changement, et `StartArgs` ne nomme aucun programme. Le changement demandé est donc rattaché à un autre programme, pas à B. Côté Pi, `SUBCOMMANDS` ne connaît pas la sous-commande : `help` répond et aucun refus n'est écrit.

## 5. Hors périmètre

- Faire tourner la vérification globale qu'un jalon porte sur le projet intégré, pour donner un verdict
  à une exigence comme R3 : `e10s06`, qui démontre la conformité au jalon. D'ici là, une telle exigence
  est nommée non exécutée et le jalon n'est pas franchi.
- Porter d'un incrément au suivant le référentiel de qualité adopté par un état des lieux : `e10s05` et
  `e10s06`, dont les incréments et le jalon jugent avec lui. Un changement à candidat ne se voit
  toujours pas proposer le référentiel.
- Proposer la trajectoire : le propriétaire l'écrit (`D-16`). La traduction des écarts d'un état des lieux
  en incréments priorisés est `e10s05`.
- Réviser ou redécouper une trajectoire adoptée, et réévaluer les incréments touchés par un contrat
  partagé modifié (`PRG-04`) : aucune story du plan ne le porte encore. Un incrément bloqué ne se
  relance donc pas.
- Un programme conduit sans intégration locale : un incrément accepté sans être intégré rend ses
  dépendants prêts, alors que le projet ne porte pas son résultat. Attendre l'intégration ou accepter ce
  départ est un choix de produit, laissé au propriétaire. Le jalon, lui, n'est pas franchi.
- Choisir quel incrément prêt démarre : le premier dans l'ordre de la trajectoire part.
- Un incrément dont le livrable est un état des lieux : chaque incrément est un changement à candidat.
- Relier les exigences qu'un incrément porte dans la trajectoire à celles que la spécification de son
  changement écrit : la demande du changement porte le texte de l'incrément, pas ses identifiants.
- Exiger une provenance humaine authentifiée pour l'adoption ou pour une décision de périmètre : l'acte
  est inscrit sous l'acteur de la session, comme `/495 start`.
- Faire respecter le budget de durée du programme (`program_ms`) : seul le nombre d'incréments démarrés
  reste borné, comme aujourd'hui.
