# Une migration d'architecture se traduit en étapes avec contrats de transition et retour arrière

Story : e11s06
Epic : e11
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire d'un projet Maven ou Node a adopté la carte de son architecture, et son état des lieux en a
mesuré les violations (`e11s02`, `e11s04`). Il a choisi, parmi les alternatives d'une recommandation, la
cible à atteindre (`e11s05`). Prenons un réacteur dont `app` appelle deux fois `infra` sans passer par le
domaine, et la cible choisie : ajouter un port de paiement dans `domain`, que `infra` implémente. Il veut
y aller en plusieurs étapes. Une trajectoire de plusieurs incréments se conduit depuis Pi (`e10s04`), mais
elle ne sait partir que d'un état des lieux au référentiel de qualité. Citer l'état des lieux de
l'architecture est refusé : « its survey adopted no quality referential ». Rien ne relie donc la
migration à la cible choisie ni aux violations mesurées. Une étape peut oublier ce qu'elle promet de
garder pendant la transition, ou comment revenir en arrière. Une règle de la carte que l'état
transitoire ne peut pas encore tenir est alors tue sans portée ni échéance. C'est ce que `ARC-03`
interdit : il demande de traduire une cible adoptée en étapes avec contrats de transition, frontières de
coexistence, stratégie de compatibilité et retour arrière.

Avec cette story, la trajectoire d'une migration cite l'état des lieux accepté où le propriétaire a
choisi sa cible. Chaque étape porte son contrat de transition, c'est-à-dire les interfaces qu'elle
préserve, sa frontière de coexistence entre l'ancien et le nouveau chemin, sa stratégie de compatibilité
et son retour arrière. Une étape à laquelle l'un manque n'est pas adoptée. Les écarts sont les règles
de la carte que l'état des lieux a trouvées enfreintes, avec leur nombre de violations, lus dans son
dossier et jamais dans le document. Chacun est supprimé par une étape, écarté par une décision de
périmètre motivée, ou toléré par une exception qui a un propriétaire et une échéance. Sinon l'adoption
est refusée. La demande du changement de chaque étape porte la cible choisie, sa transition et les
écarts qu'elle supprime. Le jalon de la migration n'est pas franchi sur la seule clôture de ses étapes.

## 2. Promesses

Scenario: Une migration est adoptée sur la cible choisie et les violations de la carte
  Given un réacteur Maven des modules `domain`, `app` et `infra`, dont la carte adoptée met `domain` en oignon, `app` et `infra` en `simple`, et permet à `app` et à `infra` de dépendre de `domain`
  And son état des lieux, accepté par le propriétaire, dont le contrôle d'architecture a mesuré deux violations de la règle « part app may not depend on part infra » et une de la règle « every main source belongs to a part »
  And dans cet état des lieux, le choix du propriétaire, par la décision `IH-05`, de l'alternative `A2`, « ajuster : un port de paiement dans `domain`, que `infra` implémente »
  And hors du projet un document de trajectoire qui cite cet état des lieux comme point de départ d'une migration, avec deux étapes : `E1` ajoute le port, `E2` dépend de `E1` et supprime « part app may not depend on part infra », chacune avec son contrat de transition, sa frontière de coexistence, sa stratégie de compatibilité et son retour arrière, et une exception qui tolère « every main source belongs to a part » sous le propriétaire « équipe paiement » jusqu'au 2026-12-31, avec sa raison, sous un jalon final qui réunit `E1` et `E2`
  When le propriétaire adopte cette trajectoire depuis Pi
  Then le programme inscrit l'état des lieux cité, avec le digest de l'arbre qu'il a mesuré, l'alternative `A2` avec sa nature et sa description, et ses deux écarts d'architecture avec leur nombre de violations : « part app may not depend on part infra » 2, « every main source belongs to a part » 1
  And il inscrit l'exception avec son propriétaire, son échéance et sa raison
  And un changement est créé pour `E1`, et la session y est liée
  And le statut liste sous `E2` l'écart qu'elle supprime avec ses 2 violations à l'état des lieux, et l'exception avec son propriétaire et son échéance

Scenario: La demande de chaque étape porte la cible et sa transition
  Given le programme du premier scénario
  When le changement de `E1` est créé, puis, `E1` intégré, le propriétaire demande l'étape suivante depuis Pi
  Then la demande du changement de `E1` porte l'alternative `A2` comme cible, avec sa nature et sa description, puis le contrat de transition, la frontière de coexistence, la stratégie de compatibilité et le retour arrière de `E1`
  And la demande du changement de `E2` porte la même cible, les quatre textes de `E2`, et l'écart « part app may not depend on part infra » avec ses 2 violations à l'état des lieux

Scenario: Une étape à laquelle il manque sa transition n'est pas adoptée
  Given le document du premier scénario, dont l'étape `E2` n'a pas de retour arrière, ou dont l'étape `E1` n'a pas de contrat de transition, de frontière de coexistence ou de stratégie de compatibilité
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme l'étape et ce qui lui manque
  And aucun programme ni changement n'est créé, et la session reste sans liaison

Scenario: Une règle enfreinte que rien ne prend en charge bloque l'adoption
  Given l'état des lieux du premier scénario, et un document qui le cite comme point de départ d'une migration sans l'exception, sans qu'aucune étape ne supprime « every main source belongs to a part » ni qu'aucune décision de périmètre ne l'écarte
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme « every main source belongs to a part », 1 violation, comme supprimée par aucune étape, écartée par aucune décision de périmètre et tolérée par aucune exception
  And aucun programme ni changement n'est créé

Scenario: Une règle cible ne se tolère pas sans propriétaire ni échéance
  Given le document du premier scénario, dont l'exception sur « every main source belongs to a part » n'a pas de propriétaire, ou pas d'échéance
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme la règle et ce qui manque à son exception
  And aucun programme ni changement n'est créé

Scenario: Une étape ne supprime pas une règle que l'état des lieux n'a pas trouvée enfreinte
  Given le document du premier scénario, dont l'étape `E1` dit supprimer « no cycle between the parts », que le contrôle d'architecture de l'état des lieux n'a pas trouvée enfreinte
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme `E1` et « no cycle between the parts » comme un écart que l'état des lieux cité ne porte pas
  And aucun programme ni changement n'est créé

Scenario: Un état des lieux sans cible choisie ni carte mesurée n'est pas le point de départ d'une migration
  Given un document de migration qui cite un état des lieux accepté dont le propriétaire a laissé le choix de la recommandation en suspens, ou qui n'a présenté aucune recommandation, ou dont la carte a été laissée en angle mort, ou dont le contrôle d'architecture n'a rien mesuré de la référence
  When le propriétaire adopte cette trajectoire depuis Pi
  Then l'adoption est refusée avec un message qui nomme le changement cité et la raison pour laquelle il n'est pas le point de départ d'une migration
  And aucun programme ni changement n'est créé

Scenario: Le jalon d'une migration n'est pas franchi sur la seule clôture de ses étapes
  Given le programme du premier scénario
  When les changements de `E1` puis de `E2` sont intégrés
  Then le programme inscrit une évaluation du jalon final INDETERMINATE, qui nomme « part app may not depend on part infra » et « every main source belongs to a part » comme non mesurées sur le projet intégré
  And le programme n'est pas clos, et le statut le dit

## 3. Sécurité

Le document de trajectoire ne fait que citer l'état des lieux de départ et dire, pour chaque étape, les
écarts qu'elle supprime et ses quatre textes de transition. La cible vient du dossier de cet état des
lieux : l'alternative que le propriétaire a choisie par la décision `IH-05`, jamais un texte du document.
Les écarts et leur nombre viennent du même dossier, de ce que le contrôle d'architecture a mesuré sur la
référence. Un document ne peut donc ni inventer une cible ou un écart, ni en réduire un, ni en taire un.
Un contrôle d'architecture qui n'a rien mesuré n'est jamais lu comme l'absence de violation (`D-74`).
L'état des lieux cité doit être celui du même projet, accepté par le propriétaire. L'adoption ne lance
aucun contrôle et n'ouvre pas le réseau. Elle ne passe que par la commande `/495`, que l'outil
conversationnel `harness495` ne reçoit pas (`D-09`). Le noyau refuse toujours qu'un acteur agent écrive
le programme : un modèle ne peut ni adopter une migration, ni tolérer une règle par une exception. Les
textes de transition entrent dans la demande de chaque étape comme les mots du propriétaire. Le
propriétaire d'une exception est un nom écrit dans le document, comme pour `e10s06`. Chaque changement
d'étape garde ses portes, son confinement et son intégration à deux temps.

## 4. Tâches

### Tâche 1 — Le document d'une migration porte la transition de chaque étape

Le document de trajectoire peut citer un état des lieux comme point de départ d'une migration. Dans une
migration, chaque étape porte son contrat de transition, sa frontière de coexistence, sa stratégie de
compatibilité et son retour arrière, chacun un texte non vide. Elle peut nommer les règles de la carte
qu'elle supprime. Le document peut écarter une règle par une décision de périmètre motivée, ou la tolérer
par une exception avec son propriétaire, son échéance et sa raison. Un document dont une étape n'a pas
l'un des quatre textes est refusé, avec un message qui nomme l'étape et ce qui lui manque.

- Vérifie : `node --test test/v0-pure/trajectory-migration.test.ts`
- Tient : `test/v0-pure/trajectory-migration.test.ts`, « un document de migration dont chaque étape porte son contrat de transition, sa frontière de coexistence, sa stratégie de compatibilité et son retour arrière est lu avec ces quatre textes pour E1 et E2, la règle que E2 supprime et l'exception avec son propriétaire et son échéance » et « un document de migration dont E2 n'a pas de retour arrière, ou dont E1 n'a pas de contrat de transition, est refusé avec un message qui nomme l'étape et ce qui lui manque »
- Rouge : `TrajectoryDocument` (`src/contracts/v1/trajectory.ts`) ferme les propriétés du document et de chaque incrément. Sondé, `readTrajectory` refuse un document qui cite une migration et dont `E1` porte sa transition avec « trajectory document refused: /migration schema is false; / must not have additional properties; increment E1 transition schema is false; increment E1 must not have additional properties ». Ce message ne nomme pas le retour arrière qui manque à `E2`, et aucun document n'est lu avec la transition de ses étapes.

### Tâche 2 — Le harnais adopte une migration sur la cible choisie et les violations de la carte

À l'adoption d'une migration, le harnais charge le changement cité. Il le refuse, avec sa raison, s'il
n'est pas l'état des lieux accepté du même projet, avec une carte adoptée que le contrôle d'architecture
a mesurée sur la référence, et une alternative choisie par le propriétaire. Un choix laissé en suspens ou
aucune recommandation présentée ne donne pas de cible. Sinon, il lit l'alternative choisie et compte les
violations du contrôle d'architecture par règle. Le noyau refuse une règle enfreinte qu'aucune étape ne
supprime, qu'aucune décision n'écarte et qu'aucune exception ne tolère. Il refuse une étape qui supprime
une règle que l'état des lieux ne porte pas, et une exception sans propriétaire ou sans échéance.
L'événement d'adoption garde l'état des lieux cité, la cible, les écarts, leurs décisions et leurs
exceptions. Le statut liste sous chaque étape les écarts qu'elle supprime, puis les exceptions. Le jalon
qui réunit les étapes compte chaque écart comme une vérification sur le projet intégré : sans mesure, il
n'est pas franchi.

- Vérifie : `node --test test/v2-kernel/program-architecture-migration.test.ts`
- Tient : `test/v2-kernel/program-architecture-migration.test.ts`, « adopter une migration qui cite l'état des lieux accepté du réacteur, où le propriétaire a choisi A2, inscrit au programme l'état des lieux, le digest de l'arbre mesuré, A2 avec sa nature et sa description, les écarts part app may not depend on part infra 2 et every main source belongs to a part 1, l'exception avec son propriétaire et son échéance, et le statut liste sous E2 l'écart qu'elle supprime avec ses 2 violations », « une règle enfreinte qu'aucune étape ne supprime ni qu'aucune décision ou exception ne prend en charge, une étape qui supprime no cycle between the parts, ou une exception sans propriétaire ou sans échéance, est refusée avec un message qui la nomme, sans programme créé », « un état des lieux dont le propriétaire a laissé le choix en suspens, sans recommandation présentée, dont la carte est en angle mort ou dont le contrôle d'architecture n'a rien mesuré est refusé avec un message qui nomme le changement et la raison, sans programme créé » et « E1 et E2 intégrés, le jalon final est INDETERMINATE, nomme les deux écarts d'architecture comme non mesurés sur le projet intégré, et le programme n'est pas clos »
- Rouge : `adopt` (`src/application/harness.ts`) ne lit un état des lieux cité que par `baselineOf` (`src/application/baseline.ts`), dont `acceptedSurvey` refuse un état des lieux sans référentiel de qualité avec « its survey adopted no quality referential ». `surveyGaps` ne compte que les règles du référentiel, jamais les constats du contrôle `architecture`. `citedSurvey` ne lit ni la recommandation ni la décision `IH-05` du propriétaire : aucun programme de migration n'est inscrit, et aucune cible ne l'est.

### Tâche 3 — La demande de chaque étape porte la cible et sa transition

La demande du changement d'une étape de migration porte la cible choisie, avec sa nature et sa
description, puis le contrat de transition, la frontière de coexistence, la stratégie de compatibilité et
le retour arrière de l'étape, puis chaque écart qu'elle supprime avec son nombre de violations à l'état
des lieux. La demande de l'étape suivante, démarrée depuis Pi sur le projet intégré, porte les siens.

- Vérifie : `node --test test/v2-kernel/program-architecture-migration-request.test.ts`
- Tient : `test/v2-kernel/program-architecture-migration-request.test.ts`, « la demande du changement de E1 porte A2 comme cible avec sa nature et sa description, puis le contrat de transition, la frontière de coexistence, la stratégie de compatibilité et le retour arrière de E1 » et « E1 intégré, la demande du changement de E2 porte la même cible, les quatre textes de E2 et l'écart part app may not depend on part infra avec ses 2 violations à l'état des lieux »
- Rouge : `incrementRequest` (`src/application/trajectory.ts`) n'écrit que le titre, la valeur, le critère de clôture et les écarts du référentiel de qualité, chacun avec son seuil. Aucune cible ni aucun texte de transition n'entre dans la demande d'un incrément.

## 5. Hors périmètre

- Mesurer le jalon d'une migration sur l'état des lieux du projet intégré, pour dire chaque violation
  supprimée, restante ou apparue et l'état de chaque exception, et refuser la fin d'une migration où une
  ancienne dépendance subsiste (`ARC-05`) : une story suivante de `e11`, que le plan ne porte pas encore.
  D'ici là, le jalon reste INDETERMINATE et le programme ouvert. La mesure de `e10s06` ne compare que des
  référentiels de qualité.
- Juger le candidat de chaque étape avec les règles actives pendant la transition, pour qu'une nouvelle
  utilisation de l'ancien chemin soit refusée à G5 (recette d'`ARC-03`, `ARC-04`, `SA-039`) : la carte est
  gelée dans le protocole de l'état des lieux qui l'adopte (`e11s01`), et un changement à candidat ne la
  reçoit pas. Dire quelle carte juge une étape, celle de départ moins les règles tolérées ou celle de la
  cible, revient au propriétaire.
- Écrire la cible choisie en carte, pour qu'un outil vérifie qu'elle est atteinte. L'alternative choisie
  est un texte, et les écarts sont les violations de la carte adoptée. Pour une transformation, la cible
  diffère de cette carte. Qu'un modèle propose la carte de la cible et que le propriétaire l'adopte, comme
  celle de l'existant, est un choix qui lui revient.
- Faire proposer les étapes par un modèle à partir de la cible choisie : le propriétaire écrit la
  trajectoire (`D-16`), comme pour la remise aux standards de `e10s05`.
- Exécuter le retour arrière d'une étape intégrée (`GIT-05`) : la story inscrit celui que le propriétaire
  écrit et le transmet à l'étape. Rien ne l'exécute.
- Juger le fond des textes de transition, par exemple qu'une interface promise existe dans le code : le
  noyau n'en vérifie que la présence, et le jugement reste au propriétaire.
- Une exception qui tombe à une étape plutôt qu'à une date, pour retirer les tolérances au fur et à mesure
  de la migration : le noyau ne juge qu'une échéance datée, comme dans `e10s06`.
- Les écarts du référentiel de qualité que porte aussi l'état des lieux cité : une migration ne les
  demande pas. Leur prise en charge est la remise aux standards de `e10s05`. Réunir les deux dans une
  même trajectoire n'est pas promis.
- Une cible Node : rien ne lui est propre, puisque les écarts viennent du contrôle d'architecture de
  l'état des lieux, que les deux technologies déclarent sous le même nom. Les scénarios n'exercent
  qu'un réacteur Maven.
- Garder un état des lieux de l'architecture d'une migration à l'autre, ou réviser une migration adoptée
  (`PRG-04`) : aucune story du plan ne le porte.
