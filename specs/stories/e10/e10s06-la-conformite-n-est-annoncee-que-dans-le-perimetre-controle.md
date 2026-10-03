# La conformité n'est annoncée que dans le périmètre contrôlé, et une exception a un propriétaire et une échéance

Story : e10s06
Epic : e10
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui conduit une remise aux standards adopte, depuis `e10s05`, une trajectoire dont
chaque incrément supprime des écarts d'un état des lieux accepté. Mais il ne peut jamais savoir si ces
écarts ont disparu. Le jalon qui réunit les incréments reste INDETERMINATE, avec chaque écart « non
mesuré sur le projet intégré », et le programme ne se clôt pas. Aucun chemin ne compare le projet
intégré à l'état des lieux de départ, alors que `QLT-05` demande de comparer l'état courant à la
baseline et au référentiel cible, en conservant les versions des règles. Et la seule façon de tolérer
un écart est une décision de périmètre, sans propriétaire ni échéance : rien ne la fait expirer, et
rien ne la retire quand son écart a disparu.

Avec cette story, le propriétaire fait mesurer son programme par un état des lieux du projet intégré,
pris au même référentiel et accepté. Le jalon dit, écart par écart, ce qui est supprimé, ce qui reste,
et ce qui est apparu. Un écart qui reste ou qui est apparu empêche la clôture. Une fois le jalon
franchi, la conformité est annoncée, mais seulement dans le périmètre que les analyseurs ont
réellement contrôlé : les règles avec leur outil et sa version, les modules mesurés, et, nommé à part,
ce qui reste hors de la mesure ou a été écarté. Une exception tolère un écart jusqu'à son échéance, et
elle porte un propriétaire. Échue, elle n'excuse plus rien. Si son écart a disparu, elle est retirée.

## 2. Promesses

Scenario: Le jalon d'une remise aux standards est franchi sur la mesure du projet intégré
  Given le programme de `e10s05`, adopté sur l'état des lieux accepté d'un réacteur Maven, dont A supprime `CyclomaticComplexity` et `UnusedPrivateMethod` dans `domain`, B, qui dépend de A, `CyclomaticComplexity` dans `infrastructure`, sous un jalon final qui réunit A et B, et dont les changements de A puis de B ont été intégrés
  And un état des lieux du projet intégré, pris sur l'arbre qui porte l'intégration de B au même référentiel, accepté par le propriétaire, qui ne compte plus aucune violation
  When le propriétaire, la session liée au programme, fait mesurer le programme par cet état des lieux depuis Pi
  Then le programme inscrit une évaluation du jalon final PASS, qui cite cet état des lieux et nomme chacun des trois écarts comme supprimé, avec son nombre de violations à l'état des lieux de départ et zéro sur le projet intégré
  And le programme est clos
  And le statut annonce le projet conforme au référentiel dans le périmètre contrôlé, qu'il nomme : chaque règle avec son outil et sa version, les modules `domain` et `infrastructure`, et ce que le périmètre laisse hors de la mesure, chacun avec sa raison

Scenario: Un écart qui reste empêche la clôture
  Given le programme du premier scénario, A et B intégrés, et un état des lieux accepté du projet intégré, au même référentiel, qui compte encore `CyclomaticComplexity` 1 dans `infrastructure`
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi
  Then le programme inscrit une évaluation du jalon final FAIL, qui nomme `CyclomaticComplexity` dans `infrastructure` comme restant, 1 violation à l'état des lieux de départ et 1 sur le projet intégré, et les deux écarts de `domain` comme supprimés
  And le programme n'est pas clos, et le statut n'annonce aucune conformité

Scenario: Un écart apparu depuis l'état des lieux de départ empêche la clôture
  Given le programme du premier scénario, A et B intégrés, et un état des lieux accepté du projet intégré, au même référentiel, qui ne compte plus les trois écarts mais compte `UnusedPrivateField` 1 dans `infrastructure`
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi
  Then le programme inscrit une évaluation du jalon final FAIL, qui nomme `UnusedPrivateField` dans `infrastructure`, 1 violation, comme un écart que l'état des lieux de départ ne portait pas
  And le programme n'est pas clos

Scenario: Un écart écarté par une décision de périmètre est nommé hors du périmètre contrôlé
  Given le programme adopté sur l'état des lieux d'un projet Maven dont un incrément supprime `CyclomaticComplexity` du code propriétaire, et qui écarte `CyclomaticComplexity` du code généré par une décision de périmètre motivée, l'incrément intégré
  And un état des lieux accepté du projet intégré, au même référentiel, qui ne compte plus que `CyclomaticComplexity` 1 dans le code généré
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi
  Then le programme inscrit une évaluation du jalon final PASS, et le programme est clos
  And le statut annonce le projet conforme dans le périmètre contrôlé et nomme `CyclomaticComplexity` du code généré hors de ce périmètre, avec la raison de la décision

Scenario: Une exception sans propriétaire ou sans échéance n'est pas adoptée
  Given l'état des lieux accepté du premier scénario, et un document qui le cite, dont A supprime les deux écarts de `domain`, et qui pose sur `CyclomaticComplexity` dans `infrastructure` une exception sans propriétaire, ou sans échéance, ou dont l'échéance est déjà passée
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme `CyclomaticComplexity` dans `infrastructure` et ce qui manque à son exception
  And aucun programme ni changement n'est créé

Scenario: Une exception en cours tolère son écart jusqu'à son échéance
  Given l'état des lieux accepté du premier scénario, et la trajectoire adoptée qui le cite, dont A supprime les deux écarts de `domain`, et qui pose sur `CyclomaticComplexity` dans `infrastructure` une exception de propriétaire « équipe infrastructure », d'échéance 2027-03-31, avec sa raison, A intégré
  And un état des lieux accepté du projet intégré, au même référentiel, qui ne compte plus que `CyclomaticComplexity` 1 dans `infrastructure`
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi le 2026-12-01
  Then le programme inscrit une évaluation du jalon final PASS, qui nomme `CyclomaticComplexity` dans `infrastructure` comme toléré par son exception, et le programme est clos
  And le statut annonce le projet conforme dans le périmètre contrôlé, sauf `CyclomaticComplexity` dans `infrastructure`, toléré par une exception dont il nomme le propriétaire, l'échéance et la raison

Scenario: Une exception échue n'excuse plus son écart
  Given le programme du scénario précédent, A intégré, et le même état des lieux du projet intégré
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi le 2027-04-01
  Then le programme inscrit une évaluation du jalon final FAIL, qui nomme `CyclomaticComplexity` dans `infrastructure` comme restant, et son exception comme échue depuis le 2027-03-31, avec son propriétaire
  And le programme n'est pas clos

Scenario: Une exception devenue inutile est retirée
  Given le programme de l'avant-dernier scénario, A intégré, et un état des lieux accepté du projet intégré, au même référentiel, qui ne compte plus aucune violation
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi le 2026-12-01
  Then le programme inscrit une évaluation du jalon final PASS, qui nomme l'exception sur `CyclomaticComplexity` dans `infrastructure` comme retirée parce que son écart n'est plus mesuré
  And le statut ne la compte plus parmi les exceptions en cours, et la dit retirée

Scenario: Un état des lieux qui ne mesure pas le projet intégré au même référentiel n'est pas une mesure
  Given le programme du premier scénario, A et B intégrés, et un changement cité qui est un changement à candidat, ou un état des lieux que le propriétaire n'a pas accepté, d'un autre projet, pris sur un arbre qui ne porte pas l'intégration de B, dont un contrôle du référentiel n'a rien mesuré ou a gardé moins de constats que son rapport n'en compte, ou dont le référentiel diffère de celui de l'état des lieux de départ par une règle, son seuil, la version de son outil ou un module mesuré
  When le propriétaire fait mesurer le programme par ce changement depuis Pi
  Then la mesure est refusée avec un message qui nomme le changement cité et la raison pour laquelle il ne mesure pas le projet intégré
  And aucune évaluation n'est inscrite et le programme n'est pas clos

Scenario: Un programme adopté avant les exceptions garde son statut
  Given un programme dont le journal inscrit une trajectoire adoptée sur un état des lieux dont les écarts ne portent aucun champ d'exception, et une évaluation du jalon sans mesure, comme tout dossier créé avant cette story
  When le propriétaire demande `/495 status`
  Then le statut liste ses incréments, leurs écarts et le jalon INDETERMINATE avec ses écarts non mesurés, sans exception ni annonce de conformité, et aucune erreur n'est levée

## 3. Sécurité

La mesure ne lit les écarts du projet intégré que dans le dossier de l'état des lieux cité, au magasin
d'objets et au journal de 495, comme l'adoption de `e10s05` : la commande ne fait que nommer ce
changement. L'état des lieux doit être celui du même projet, accepté par le propriétaire, pris sur
l'arbre qui porte la dernière intégration du programme, avec le même référentiel que l'état des lieux
de départ (mêmes règles, mêmes seuils, mêmes versions d'outil, mêmes modules mesurés) et dont chaque
contrôle a mesuré tout son rapport. Un module que la mesure ne lit pas, un analyseur absent, non
qualifié ou coupé n'est donc jamais lu comme un écart supprimé (`QLT-02`, `D-74`). La mesure ne lance
aucun contrôle et n'ouvre pas le réseau. Elle ne passe que par la commande `/495`, que l'outil
conversationnel `harness495` ne reçoit pas (`D-09`), et s'inscrit sous l'acteur de la session : le
noyau refuse toujours qu'un acteur agent écrive le programme. Le propriétaire d'une exception est un
nom écrit dans le document par celui qui l'adopte ; il n'est pas authentifié.

## 4. Tâches

### Tâche 1 — Le jalon juge les écarts sur la mesure du projet intégré

L'évaluation d'un jalon peut porter une mesure : l'état des lieux qui l'a prise, et les écarts qu'il
compte par règle, module et périmètre. Chaque écart supprimé par un incrément du jalon y est supprimé
quand la mesure ne le compte plus, et restant sinon, avec ses deux comptes. Un écart que la mesure
compte et que l'état des lieux de départ ne portait pas est apparu. Un écart restant ou apparu rend le
jalon FAIL. Un écart écarté par une décision de périmètre est nommé hors du périmètre contrôlé et
n'entre pas dans le verdict. Sans mesure, l'écart reste non mesuré, comme aujourd'hui.

- Vérifie : `node --test test/v0-pure/program.test.ts`
- Tient : `test/v0-pure/program.test.ts`, « A et B intégrés, une mesure qui ne compte plus aucun des trois écarts rend le jalon final PASS, nomme chacun supprimé avec son compte de départ et zéro, et clôt le programme », « une mesure qui compte encore CyclomaticComplexity 1 dans infrastructure rend le jalon FAIL en le nommant restant avec ses deux comptes, sans clôture » et « une mesure qui compte UnusedPrivateField dans infrastructure, absent de l'état des lieux de départ, rend le jalon FAIL en le nommant apparu »
- Rouge : la commande `milestone.evaluate` (`src/domain/program/program.ts`) ne porte que `global_verdicts` et `integrated_digest`, et `evaluateMilestone` range chaque écart supprimé par un incrément du jalon dans `indeterminate`, « not measured on the integrated project », quelle que soit la commande. Même avec une mesure qui ne compte aucun écart, l'évaluation est INDETERMINATE et aucun `program.closed` n'est émis ; aucun écart apparu n'est lu.

### Tâche 2 — Une exception a un propriétaire et une échéance, et ne survit pas à son écart

Un écart de l'état des lieux de départ peut porter une exception : un propriétaire, une échéance et une
raison. À l'adoption, un écart sous exception est pris en charge. Une exception sans propriétaire, ou
dont l'échéance est passée à la date de l'adoption, est refusée en nommant son écart. À l'évaluation
sur une mesure, un écart sous exception en cours est toléré et nommé avec son exception. Après
l'échéance, il est restant et l'exception est nommée échue. Quand la mesure ne compte plus son écart,
l'exception est nommée retirée, parce qu'inutile.

- Vérifie : `node --test test/v0-pure/program.test.ts`
- Tient : `test/v0-pure/program.test.ts`, « une trajectoire dont l'écart CyclomaticComplexity dans infrastructure porte une exception avec propriétaire et échéance à venir est adoptée, et l'événement d'adoption porte l'exception ; sans propriétaire, ou échue à la date de l'adoption, elle est refusée en nommant l'écart et ce qui manque », « mesuré avant l'échéance, l'écart sous exception laisse le jalon PASS et l'évaluation le nomme toléré ; mesuré après, le jalon est FAIL et nomme l'exception échue avec son propriétaire » et « mesuré à zéro, l'écart d'une exception fait nommer l'exception retirée »
- Rouge : `BaselineGap` ne porte que `scope_decision`, et `checkGaps` ne tient pour pris en charge qu'un écart supprimé par un incrément ou écarté par `setAside`. Une trajectoire dont l'écart `CyclomaticComplexity` dans `infrastructure` porte une exception, sans incrément qui le supprime, est donc refusée avec « gap CyclomaticComplexity in infrastructure (proprietary code, 1 violation) is removed by no increment and set aside by no scope decision ». `evaluateMilestone` ne lit aucune exception.

### Tâche 3 — Le document de trajectoire porte les exceptions

Le document qui cite un état des lieux peut poser une exception sur un de ses écarts, avec son
propriétaire, son échéance et sa raison. Le harnais la refuse quand elle nomme un écart que l'état des
lieux ne porte pas, comme une décision de périmètre. Il la passe au noyau avec l'écart. Une exception
à laquelle manque son propriétaire ou son échéance est refusée par un message qui nomme son écart.

- Vérifie : `node --test test/v2-kernel/program-baseline.test.ts`
- Tient : `test/v2-kernel/program-baseline.test.ts`, « un document qui cite l'état des lieux accepté du réacteur et pose sur CyclomaticComplexity dans infrastructure une exception avec propriétaire, échéance et raison est adopté, et le programme inscrit l'écart avec son exception » et « une exception sans propriétaire ou sans échéance est refusée avec un message qui nomme CyclomaticComplexity dans infrastructure et ce qui lui manque, sans programme créé »
- Rouge : `TrajectoryBaseline` (`src/contracts/v1/trajectory.ts`) ferme ses propriétés. Sondé, `readTrajectory` refuse un document qui pose une exception avec « trajectory document refused: /baseline/exceptions schema is false; /baseline must not have additional properties » : aucun programme n'est inscrit, et le refus d'une exception incomplète ne nomme pas son écart.

### Tâche 4 — Le propriétaire fait mesurer le programme depuis Pi

Une sous-commande de `/495`, sur une session liée à un programme, reçoit l'identifiant d'un état des
lieux. Le harnais le charge et le refuse, en nommant le changement et sa raison, s'il n'est pas l'état
des lieux accepté du même projet, pris sur l'arbre qui porte la dernière intégration du programme, au
même référentiel que l'état des lieux de départ, chaque contrôle ayant mesuré tout son rapport. Un
programme qui ne cite aucun état des lieux est refusé de même. Sinon, le harnais compte les écarts de
la mesure comme ceux du départ et réévalue chaque jalon du programme sur cette mesure, à la date du
jour.

- Vérifie : `node --test test/v3-pi/program-measure-entry.test.ts`
- Tient : `test/v3-pi/program-measure-entry.test.ts`, « sur une session liée au programme dont A et B sont intégrés, mesurer avec l'état des lieux accepté du projet intégré qui ne compte plus aucun écart inscrit une évaluation du jalon final PASS qui cite cet état des lieux, clôt le programme, et le statut annonce la conformité dans le périmètre contrôlé » et « un changement à candidat, un état des lieux refusé, d'un autre projet, pris sur un arbre sans l'intégration de B, dont pmd a gardé moins de constats que son rapport, ou dont le référentiel diffère par le seuil d'une règle, la version de PMD ou un module mesuré, est refusé avec un message qui nomme le changement et la raison, sans évaluation inscrite »
- Rouge : `SUBCOMMANDS` (`src/extension/command.ts`) ne connaît aucune sous-commande de mesure : le gestionnaire retombe sur `help`, qui n'écrit que la ligne d'usage. Le seul émetteur de `milestone.evaluate` hors du noyau est `recordIncrementResult` (`src/application/harness.ts`), qui ne lui passe que `global_verdicts: {}`. La dernière évaluation du jalon final reste donc INDETERMINATE, avec les trois écarts « not measured on the integrated project », et le programme n'est pas clos.

### Tâche 5 — Le statut annonce la conformité dans le seul périmètre contrôlé

La vue de statut d'un programme porte, pour un jalon évalué sur une mesure, les écarts supprimés,
restants et apparus avec leurs comptes, les exceptions en cours, échues et retirées, et, quand le jalon
est franchi, le périmètre contrôlé : les règles du référentiel avec leur outil et sa version, les
modules mesurés, ce que le périmètre laisse hors de la mesure avec sa raison, et les écarts écartés
avec la raison de leur décision. Le texte du statut annonce la conformité dans ce seul périmètre, en
français et en anglais, et ne l'annonce pas pour un jalon non franchi. Un dossier antérieur, dont les
écarts ne portent aucun champ d'exception, se lit comme un dossier sans exception.

- Vérifie : `node --test test/v0-pure/program-status.test.ts`
- Tient : `test/v0-pure/program-status.test.ts`, « le statut d'un programme dont le jalon final est PASS sur une mesure annonce la conformité dans le périmètre contrôlé, nomme chaque règle avec son outil et sa version, les modules mesurés, ce qui reste hors de la mesure, l'écart écarté avec sa raison, l'exception en cours avec son propriétaire, son échéance et sa raison, et l'exception retirée, en français et en anglais », « le statut d'un jalon FAIL sur une mesure nomme l'écart restant avec ses deux comptes et n'annonce aucune conformité » et « le statut d'un programme dont les écarts n'ont aucun champ d'exception liste ses écarts et son jalon INDETERMINATE, sans exception ni annonce de conformité »
- Rouge : `statusView` (`src/application/views.ts`) ne donne de chaque jalon que la dernière évaluation (verdict, satisfaits, restants, indéterminés), et `formatStatus` (`src/presentation/structured/text.ts`) n'écrit pour un jalon que son verdict et ce qui reste : ni annonce de conformité, ni périmètre, ni règle avec sa version, ni exception.

## 5. Hors périmètre

- Prendre la mesure à la place du propriétaire, en ouvrant l'état des lieux du projet intégré depuis le
  programme quand ses incréments sont intégrés : le propriétaire le demande avec `/495 state`, l'accepte,
  puis le cite. Automatiser ce départ, et choisir quand, reste à lui.
- La vérification globale d'un jalon, comme R3 dans `e10s04`, et la non-régression du comportement
  rejouée sur le projet intégré : aucun texte ne dit quels contrôles d'un état des lieux répondent d'une
  exigence globale de la trajectoire. Un jalon qui vérifie une exigence globale reste non franchi,
  comportement qui arrête, et aucune story du plan ne le porte encore. Chaque incrément garde ses
  contrôles à G5 sur son candidat.
- Une exception dont la sortie est une condition plutôt qu'une date : le noyau ne juge que l'échéance et
  la disparition de l'écart. Une condition écrite en mots ne se mesure pas.
- Donner un propriétaire et une échéance aux décisions de périmètre de `e10s05`, ou les réserver au code
  généré : elles restent permanentes, et l'annonce les nomme hors du périmètre contrôlé. Faire d'une
  décision de périmètre une exception revient au propriétaire.
- Authentifier le propriétaire d'une exception, ou le prévenir de son échéance : c'est un nom écrit dans
  le document.
- Réviser la trajectoire après une mesure FAIL pour ajouter l'incrément qui manque (`PRG-04`) : aucune
  story du plan ne le porte. Le programme reste ouvert, et une nouvelle mesure peut être citée.
- Juger la hausse du compte d'un écart écarté ou sous exception, ou d'un écart qu'aucun incrément du
  jalon ne supprime : c'est la non-aggravation de `QLT-04`, qu'aucune story du plan ne porte encore.
- Réexaminer une exception après la clôture du programme : l'annonce de clôture la nomme avec son
  échéance, et rien ne la réévalue ensuite.
- Accepter une mesure prise sur un arbre qui porte d'autres commits après la dernière intégration du
  programme : elle est refusée, comportement qui arrête. L'accepter revient au propriétaire.
- Comparer deux référentiels de versions différentes, par exemple après une montée de version de PMD
  dans 495 : la mesure est refusée, et aucun compte n'est traduit d'une version à l'autre.
