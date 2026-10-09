# Le jalon d'une migration d'architecture se mesure sur l'état des lieux du projet intégré, et sa fin est refusée tant qu'une ancienne dépendance subsiste

Story : e11s08
Epic : e11
Statut : à faire

## 1. Ce que le lecteur gagne

Depuis `e11s06`, le propriétaire d'un projet Maven ou Node conduit une migration d'architecture : une
trajectoire part de l'état des lieux où il a choisi sa cible, et chaque étape supprime des règles de la
carte que cet état des lieux a trouvées enfreintes. Il ne peut jamais savoir si ces violations ont
disparu. Ses étapes intégrées, le jalon final reste INDETERMINATE, avec chaque règle « not measured on
the integrated project », et le programme ne se clôt pas. Citer un état des lieux du projet intégré ne
change rien : `/495 measure` refuse tout programme de migration avec « cites no survey to measure
against ». Prenons un réacteur dont `app` appelait deux fois `infra`. Rien ne dit si `app` l'appelle
encore une fois les étapes closes, ni si une nouvelle dépendance interdite est apparue. C'est ce que
`ARC-05` demande : la fin d'une migration est refusée si une ancienne dépendance subsiste, même lorsque
les incréments annoncés sont clos. Le rapport distingue aussi la cible atteinte sur un sous-ensemble de
la conformité de toute l'application.

Avec cette story, le propriétaire fait mesurer sa migration par un état des lieux du projet intégré,
accepté, qui a adopté la même carte que l'état des lieux de départ. Le jalon dit, règle par règle, ce qui
est supprimé, ce qui reste, ce qui est toléré et ce qui est apparu. Une règle qui reste ou qui est
apparue empêche la clôture, et une exception échue n'excuse plus sa règle. Le statut dit la cible atteinte
sur les règles que les étapes suppriment. Il n'annonce le projet conforme à la carte que lorsque plus
aucune règle n'est enfreinte, et seulement dans ce que la vérification contrôle.

## 2. Promesses

Scenario: La fin d'une migration est franchie sur la mesure du projet intégré, sans annoncer la conformité d'une application dont une règle reste tolérée
  Given le programme de migration de `e11s06`, adopté sur l'état des lieux accepté d'un réacteur Maven des modules `domain`, `app` et `infra`, dont l'étape `E2` supprime « part app may not depend on part infra » (2 violations), et dont une exception tolère « every main source belongs to a part » (1 violation) sous le propriétaire « équipe paiement » jusqu'au 2026-12-31, sous un jalon final qui réunit `E1` et `E2`, les changements de `E1` puis de `E2` intégrés
  And un état des lieux du projet intégré, pris sur l'arbre qui porte l'intégration de `E2`, où le propriétaire a adopté la même carte et qu'il a accepté, dont le contrôle d'architecture compte 0 violation de « part app may not depend on part infra » et 1 de « every main source belongs to a part »
  When le propriétaire, la session liée au programme, fait mesurer le programme par cet état des lieux depuis Pi le 2026-12-01
  Then le programme inscrit une évaluation du jalon final PASS, qui cite cet état des lieux, nomme « part app may not depend on part infra » supprimée, 2 violations à l'état des lieux de départ et 0 sur le projet intégré, et « every main source belongs to a part » tolérée par son exception, 1 et 1
  And le programme est clos
  And le statut dit la cible de la migration atteinte sur « part app may not depend on part infra », n'annonce pas le projet conforme à la carte adoptée, et nomme « every main source belongs to a part », 1 violation, tolérée par l'exception en cours d'« équipe paiement » jusqu'au 2026-12-31, en français et en anglais

Scenario: La fin d'une migration est refusée si une ancienne dépendance subsiste
  Given le programme du premier scénario, `E1` et `E2` intégrés, et un état des lieux accepté du projet intégré, sous la même carte, dont le contrôle d'architecture compte encore 1 violation de « part app may not depend on part infra »
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi le 2026-12-01
  Then le programme inscrit une évaluation du jalon final FAIL, qui nomme « part app may not depend on part infra » comme restante, 2 violations à l'état des lieux de départ et 1 sur le projet intégré
  And le programme n'est pas clos, et le statut n'annonce ni la cible atteinte ni la conformité

Scenario: Une règle enfreinte que l'état des lieux de départ ne portait pas empêche la fin
  Given le programme du premier scénario, `E1` et `E2` intégrés, et un état des lieux accepté du projet intégré, sous la même carte, dont le contrôle d'architecture ne compte plus aucune violation des deux règles de départ mais compte 1 violation de « no cycle between the parts »
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi le 2026-12-01
  Then le programme inscrit une évaluation du jalon final FAIL, qui nomme « no cycle between the parts », 1 violation, comme une règle que l'état des lieux de départ ne trouvait pas enfreinte
  And le programme n'est pas clos

Scenario: Une exception échue n'excuse plus sa règle
  Given le programme et l'état des lieux du projet intégré du premier scénario
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi le 2027-01-04
  Then le programme inscrit une évaluation du jalon final FAIL, qui nomme « every main source belongs to a part » comme restante, et son exception comme échue depuis le 2026-12-31, avec son propriétaire « équipe paiement »
  And le programme n'est pas clos

Scenario: Une application qui n'enfreint plus aucune règle de la carte est annoncée conforme dans ce que sa vérification contrôle
  Given le programme du premier scénario, `E1` et `E2` intégrés, et un état des lieux accepté du projet intégré, sous la même carte, dont le contrôle d'architecture ne compte plus aucune violation
  When le propriétaire fait mesurer le programme par cet état des lieux depuis Pi le 2026-12-01
  Then le programme inscrit une évaluation du jalon final PASS, qui nomme l'exception sur « every main source belongs to a part » comme retirée parce que sa règle n'est plus enfreinte, et le programme est clos
  And le statut annonce le projet conforme à la carte adoptée, nomme ses parties `domain`, `app` et `infra`, l'outil qui la vérifie, et chaque point que sa vérification ne voit pas avec sa raison, en français et en anglais
  And le statut ne compte plus l'exception parmi les exceptions en cours, et la dit retirée

Scenario: Un état des lieux qui ne mesure pas le projet intégré sous la même carte n'est pas une mesure
  Given le programme du premier scénario, `E1` et `E2` intégrés, et un changement cité qui est un changement à candidat, ou un état des lieux que le propriétaire n'a pas accepté, d'un autre projet, pris sur un arbre qui ne porte pas l'intégration de `E2`, dont la carte a été laissée en angle mort, dont le contrôle d'architecture n'a rien mesuré, ou dont la carte adoptée diffère de celle de l'état des lieux de départ par une partie, son périmètre, son style, le rôle d'un paquet ou une relation entre parties
  When le propriétaire fait mesurer le programme par ce changement depuis Pi
  Then la mesure est refusée avec un message qui nomme le changement cité et la raison pour laquelle il ne mesure pas le projet intégré
  And aucune évaluation n'est inscrite et le programme n'est pas clos

## 3. Sécurité

La mesure ne lit les violations du projet intégré que dans le dossier de l'état des lieux cité, au
magasin d'objets et au journal de 495, comme l'adoption de `e11s06` : la commande ne fait que nommer ce
changement. Un document ne peut donc ni inventer une violation supprimée, ni en réduire une, ni en taire
une. L'état des lieux doit être celui du même projet, accepté par le propriétaire, pris sur l'arbre qui
porte la dernière intégration du programme. Il doit avoir adopté la même carte que l'état des lieux de
départ, et son contrôle d'architecture doit avoir mesuré tout son rapport. Une carte laissée en angle
mort, ou un contrôle qui n'a rien mesuré, n'est donc jamais lu comme une règle qui n'est plus enfreinte
(`D-74`). Une carte renommée n'efface pas non plus une ancienne violation sous un autre nom. La mesure ne
lance aucun contrôle et n'ouvre pas le réseau. Elle ne passe que par la commande `/495`, que l'outil
conversationnel `harness495` ne reçoit pas (`D-09`), et s'inscrit sous l'acteur de la session : le noyau
refuse toujours qu'un acteur agent écrive le programme. Le propriétaire d'une exception reste un nom
écrit dans le document, comme pour `e10s06`.

## 4. Tâches

### Tâche 1 — Le jalon d'une migration juge ses règles sur la mesure du projet intégré

L'évaluation d'un jalon d'un programme de migration peut porter une mesure : l'état des lieux qui l'a
prise et les violations qu'il compte par règle de la carte. Chaque règle supprimée par une étape du jalon
y est supprimée quand la mesure ne la compte plus, et restante sinon, avec ses deux comptes. Une règle
sous exception est tolérée jusqu'à l'échéance incluse, restante après, avec son exception échue. Son
exception est retirée quand la règle n'est plus enfreinte. Une règle que la mesure compte et que l'état
des lieux de départ ne portait pas est apparue. Une règle restante ou apparue rend le jalon FAIL. Une
règle écartée par une décision de périmètre n'entre pas dans le verdict. Sans mesure, chaque règle reste
non mesurée, comme aujourd'hui.

- Vérifie : `node --test test/v0-pure/program.test.ts`
- Tient : `test/v0-pure/program.test.ts`, « E1 et E2 intégrés, une mesure qui compte part app may not depend on part infra 0 et every main source belongs to a part 1 le 2026-12-01 rend le jalon final de la migration PASS, nomme la première supprimée avec 2 et 0, la seconde tolérée par son exception, et clôt le programme », « une mesure qui compte encore part app may not depend on part infra 1 rend le jalon FAIL en la nommant restante avec 2 et 1, sans clôture », « une mesure qui compte no cycle between the parts 1 rend le jalon FAIL en la nommant apparue » et « la même mesure le 2027-01-04 rend le jalon FAIL et nomme l'exception échue avec son propriétaire ; une mesure qui ne compte plus aucune violation nomme l'exception retirée »
- Rouge : `evaluateMilestone` (`src/domain/program/program.ts`) ajoute toujours `unmeasuredRules`, « rule:… : not measured on the integrated project », quelle que soit la mesure de la commande, et `judgeGaps` ne juge que les écarts de `state.baseline`. Même avec une mesure qui ne compte aucune violation, le jalon final d'une migration est INDETERMINATE et aucun `program.closed` n'est émis. Aucune règle de la migration n'est jugée supprimée, restante ou apparue, et aucune de ses exceptions n'est jugée.

### Tâche 2 — Le harnais mesure une migration sur l'état des lieux du projet intégré

Sur un programme de migration, la mesure charge l'état des lieux cité. Elle le refuse, en nommant le
changement et sa raison, s'il n'est pas l'état des lieux accepté du même projet, pris sur l'arbre qui
porte la dernière intégration du programme. Elle le refuse aussi s'il n'a pas adopté de carte, si son
contrôle d'architecture n'a pas mesuré tout son rapport, ou si sa carte diffère de celle de l'état des
lieux de départ par une partie, son périmètre, son style, le rôle d'un paquet ou une relation : seuls les
indices peuvent changer. Sinon, elle compte les violations du contrôle d'architecture par règle, comme à
l'adoption, et réévalue chaque jalon du programme sur cette mesure, à la date du jour.

- Vérifie : `node --test test/v2-kernel/program-architecture-migration-measure.test.ts`
- Tient : `test/v2-kernel/program-architecture-migration-measure.test.ts`, « E1 et E2 intégrés, mesurer la migration avec l'état des lieux accepté du projet intégré, sous la même carte, qui compte part app may not depend on part infra 0 et every main source belongs to a part 1, inscrit une évaluation du jalon final PASS qui cite cet état des lieux et clôt le programme » et « un changement à candidat, un état des lieux refusé, d'un autre projet, pris sur un arbre sans l'intégration de E2, dont la carte est en angle mort, dont le contrôle d'architecture n'a rien mesuré, ou dont la carte diffère par une partie, son périmètre, son style, le rôle d'un paquet ou une relation, est refusé avec un message qui nomme le changement et la raison, sans évaluation inscrite »
- Rouge : `measure` (`src/application/harness.ts`) refuse tout programme sans `baseline` avec « program … cites no survey to measure against ». `adopt` n'inscrit de `baseline` qu'à une trajectoire qui cite un référentiel de qualité, et jamais à une migration. Et `measureOf` (`src/application/baseline.ts`) ne lit qu'un état des lieux au référentiel de qualité : aucune évaluation de la migration n'est inscrite, et le refus ne nomme pas le changement cité.

### Tâche 3 — Le statut distingue la cible atteinte de la conformité à la carte

Pour un jalon de migration évalué sur une mesure, le statut nomme chaque règle supprimée, restante,
tolérée et apparue avec ses deux comptes, et chaque exception en cours, échue ou retirée. Quand le jalon
est franchi, il dit la cible atteinte sur les règles que ses étapes suppriment. Il n'annonce le projet
conforme à la carte adoptée que lorsque la mesure ne compte plus aucune violation d'aucune de ses règles.
Il nomme alors les parties de la carte, l'outil qui la vérifie et ce que sa vérification ne voit pas. Sinon,
il nomme chaque règle encore enfreinte et ce qui la tolère ou l'écarte. Le texte le dit en français et en
anglais, et un jalon non franchi n'annonce ni l'un ni l'autre.

- Vérifie : `node --test test/v0-pure/program-status.test.ts`
- Tient : `test/v0-pure/program-status.test.ts`, « le statut d'une migration dont le jalon final est PASS avec every main source belongs to a part tolérée dit la cible atteinte sur part app may not depend on part infra, n'annonce pas la conformité à la carte, et nomme la règle tolérée par l'exception en cours d'équipe paiement jusqu'au 2026-12-31, en français et en anglais », « le statut d'une migration dont le jalon final est PASS sans aucune violation annonce le projet conforme à la carte adoptée, nomme les parties domain, app et infra, l'outil qui la vérifie et ce que sa vérification ne voit pas, et dit l'exception retirée » et « le statut d'un jalon de migration FAIL nomme la règle restante avec ses deux comptes et n'annonce ni la cible atteinte ni la conformité »
- Rouge : `programLines` (`src/presentation/structured/text.ts`) écrit chaque exception d'une migration sous « Exception », sans état, quelle que soit la dernière mesure. La seule conformité qu'il annonce est celle du référentiel, « conforms to the referential within the controlled perimeter », dès qu'un jalon passe sur une mesure. `measureLines` écrit chaque écart jugé comme un écart du référentiel, avec son module et son code. Rien ne dit la cible atteinte, ni les parties de la carte, ni ce que sa vérification ne voit pas.

## 5. Hors périmètre

- Mesurer une migration sous une carte qui diffère de celle de départ, que ce soit la carte de la cible
  d'une transformation ou une carte où un paquet a changé de rôle : la mesure est refusée, comportement
  qui arrête. Comparer des violations sous deux cartes revient à dire quelle carte juge la cible, et
  `e11s06` laisse ce choix au propriétaire.
- Juger le candidat de chaque étape avec les règles actives pendant la transition, pour qu'une nouvelle
  utilisation de l'ancien chemin soit refusée dès G5 (`ARC-04`) : quelle carte juge une étape revient au
  propriétaire (`e11s06`). Cette story refuse la nouvelle dépendance à la fin de la migration, pas dans
  l'étape qui l'écrit.
- Proposer comme règle de la carte un anti-pattern que la revue relève : son catalogue revient au
  propriétaire (`e11s05`).
- Prendre la mesure à la place du propriétaire, ou déclencher une réévaluation aux jalons et aux
  changements significatifs (`ARC-05`) : le propriétaire demande l'état des lieux du projet intégré
  avec `/495 state`, l'accepte, puis le cite, comme dans `e10s06`. Automatiser ce départ, et choisir
  quand, reste à lui.
- Un historique des écarts d'architecture sur les versions intégrées hors d'un programme : chaque mesure
  s'inscrit au journal du programme qu'elle juge, et rien ne suit la dérive d'un projet sans migration.
- Un programme dont la trajectoire cite à la fois un état des lieux au référentiel de qualité et une
  migration : `e11s06` ne promet pas de les réunir, et cette story ne mesure pas les deux ensemble.
- Refuser une mesure prise par un autre build de 495, dont l'outil qui vérifie la carte aurait une autre
  version : la carte gelée ne porte pas cette version, et seule la carte est comparée.
- Les écarts du contrôle des dépendances déclarées (`dependency:analyze`, Knip) : une migration ne porte
  que les règles de la carte (`e11s06`).
- Une cible Node : rien ne lui est propre, puisque les règles viennent du contrôle d'architecture, que les
  deux technologies déclarent sous le même nom. Les scénarios n'exercent qu'un réacteur Maven.
- Un jalon intermédiaire : il juge les règles que ses étapes suppriment, mais les scénarios n'exercent
  que le jalon final.
- Réviser la migration après une mesure FAIL pour ajouter l'étape qui manque (`PRG-04`) : aucune story du
  plan ne le porte. Le programme reste ouvert, et une nouvelle mesure peut être citée.
