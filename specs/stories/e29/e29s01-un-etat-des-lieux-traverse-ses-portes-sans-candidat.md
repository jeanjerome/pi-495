# Un changement dont le livrable est l'état du projet traverse ses portes sans candidat

Story : e29s01
Epic : e29
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui veut savoir où en est son projet (ses tests passent-ils, que dit son lint, que
mesure sa couverture) n'a aujourd'hui qu'un moyen : demander un changement. Le noyau ne connaît
que celui-là. Il fait écrire un candidat par un agent, puis le juge à G4 et G5. Une question sur
l'état du projet devient donc une modification du code, que personne n'a demandée. Les contrôles
tournent pourtant déjà sur la référence (VER-08). Mais leur passe n'est qu'une base de comparaison
pour le candidat : le dossier ne la présente jamais comme une réponse.

Avec cette story, la demande `/495 state <question>` ouvre un changement dont le livrable est un
état des lieux. Ce changement passe les portes qui jugent le mandat (G0), les exigences (G1) et la
vérifiabilité des contrôles (G2). Il exécute les contrôles gelés sur la référence et clôt sur un
état des lieux rangé au dossier, sans candidat, sans agent producteur et sans écrire dans le
projet (`D-74`). Deux défauts du chemin actuel deviendraient des réponses fausses dans un état des
lieux :

- Un projet dont un test échoue ne passe pas G2, parce que le témoin positif du capteur de tests
  hérite de cet échec. C'est pourtant le cas le plus courant où l'on demande l'état de son projet.
- Toute exigence reçoit au moins un contrôle, quelle que soit sa nature. Une question sur
  l'architecture recevrait alors le verdict de la suite de tests.

L'absence d'un analyseur ne se lit jamais comme l'absence de défaut. Ce qu'aucun contrôle ne
mesure est un angle mort nommé, avec sa raison. Rien de ce que la story ajoute ne dépend d'une
technologie : l'état des lieux exécute les contrôles que l'adaptateur de la cible déclare (`D-75`).

## 2. Promesses

Scenario: Un état des lieux traverse ses portes sans candidat et laisse le projet intact
  Given un projet Node dont la suite de tests passe
  When le propriétaire demande « où en sont les tests ? » comme un état des lieux, et le changement est conduit
  Then G0, G1, G2 et G5 passent, G3, G4 et G6 ne sont jamais évalués, aucune intervention de production ni de relecture n'est ouverte, et le changement n'a aucun candidat
  And un artefact `survey` porte, pour chaque exigence, les contrôles qui l'ont mesurée sur la référence, chacun avec son verdict et l'identifiant de sa preuve
  And le changement est clos `accepted`, et l'arbre du projet a le même digest qu'avant la demande

Scenario: La consigne de spécification d'un état des lieux dit que rien ne sera changé
  Given une demande d'état des lieux
  When l'intervention de spécification est ouverte
  Then sa consigne dit que le livrable est l'état du projet, mesuré par des contrôles sur la référence, et qu'aucun fichier du projet ne sera modifié

Scenario: Un contrôle dont la passe sur la référence ne conclut pas arrête l'état des lieux
  Given un état des lieux dont un contrôle qualifié rend INDETERMINATE sur la référence
  When le changement est conduit
  Then il s'arrête bloqué en nommant ce contrôle, n'est pas clos `accepted`, et aucun `survey` n'est adopté

Scenario: Un test qui échoue dans le projet est un constat de l'état des lieux
  Given un projet Node dont un test échoue sur la référence
  When le propriétaire en demande l'état des lieux
  Then le contrôle de tests est qualifié par les cas de ses témoins, G2 passe, le `survey` porte FAIL pour ce contrôle avec un constat qui nomme le fichier du test en échec, et le changement est clos `accepted`

Scenario: Une exigence qu'aucun contrôle de sa nature ne mesure est un angle mort nommé
  Given un projet Node sans contrôle d'architecture, et un état des lieux dont une exigence porte sur l'architecture
  When le changement est conduit
  Then le `survey` nomme cette exigence comme angle mort, avec la raison qu'aucun contrôle de la cible ne mesure sa nature, et ne lui attribue le verdict d'aucun contrôle
  And aucune préparation n'est ouverte, aucune décision IH-04 n'est demandée, et le changement est clos `accepted`

Scenario: Un contrôle qui ne mesure rien de la référence est un angle mort, pas un PASS
  Given un projet Node qui demande sa couverture, et dont les fichiers de test ne déclarent aucun cas propre
  When le propriétaire en demande l'état des lieux
  Then le `survey` nomme le contrôle de tests comme angle mort, avec la raison que la référence n'exécute aucun test propre
  And il nomme le contrôle de couverture comme angle mort, avec la raison qu'il ne mesure que les lignes qu'un changement introduit
  And aucun des deux n'est présenté avec le verdict PASS

Scenario: La commande /495 state ouvre un état des lieux
  Given une session Pi sur un projet
  When le propriétaire tape `/495 state où en sont les tests ?`
  Then un changement est créé dont le livrable est l'état du projet, la session y est liée et le conduit
  And `/495 state` sans texte affiche son usage et ne crée aucun changement, et `/495 start` ouvre toujours un changement à candidat

## 3. Sécurité

L'état des lieux n'écrit rien dans le projet. Ses contrôles tournent dans des copies de la
référence, avec le confinement et la politique réseau de toute vérification (`network: denied`).
Aucun complément recommandé n'est adopté ni installé pendant un état des lieux. Le réseau ne
s'ouvre donc à aucune étape (`D-76`). Aucun agent producteur n'est lancé, et aucune intégration
n'est proposée.

## 4. Tâches

### Tâche 1 — Le noyau conduit un changement dont le livrable est l'état du projet

`start` accepte un livrable, `candidate` par défaut ou `state`, que l'état du changement porte. Un
dossier écrit avant ce champ se lit comme `candidate`. Pour un état des lieux, la consigne de
spécification dit qu'aucun fichier ne sera modifié, et le mandat n'a pas d'intégration. G2 gèle le
protocole sans ouvrir de préparation. Le changement passe ensuite de G2 à une vérification sur la
référence. Celle-ci exécute chaque contrôle gelé dans une copie de la référence et range ses
preuves, puis un artefact `survey` les relie aux exigences. G5 d'un état des lieux passe quand
chaque contrôle du `survey` a une preuve valide sur la référence, au protocole et à
l'environnement gelés. Un contrôle INDETERMINATE arrête le changement en le nommant. G3, G4 et G6
ne sont pas évalués.

- Vérifie : `node --test test/v2-kernel/state-survey.test.ts`
- Tient : `test/v2-kernel/state-survey.test.ts`, « un état des lieux d'un projet dont la suite passe traverse G0, G1, G2 et G5, n'ouvre aucune intervention de production ni de relecture, n'a aucun candidat, porte un survey qui relie chaque exigence à ses contrôles avec verdict et preuve, est clos accepted et laisse le digest du projet inchangé », « la consigne de spécification d'un état des lieux dit que le livrable est l'état du projet et qu'aucun fichier ne sera modifié » et « un état des lieux dont un contrôle rend INDETERMINATE sur la référence s'arrête bloqué en nommant le contrôle, sans survey adopté »
- Rouge : `Harness.start` ignore le livrable demandé. Le changement passe de G2 à `designing` puis à `implementing`, G3 est évalué, une intervention `implement` est ouverte et un candidat est gelé.

### Tâche 2 — Un projet dont un test échoue a son état des lieux

Pour un état des lieux, un capteur de tests est qualifié par les cas de ses témoins et non par le
verdict global. Le cas du témoin positif est rapporté passant, et celui du témoin négatif échouant.
Un test du projet qui échoue sur la référence ne disqualifie donc pas le capteur. La passe sur la
référence porte FAIL, avec un constat par test en échec qui nomme son fichier. Un changement à
candidat garde la qualification d'aujourd'hui.

- Vérifie : `node --test test/v2-kernel/state-survey-failing-test.test.ts`
- Tient : `test/v2-kernel/state-survey-failing-test.test.ts`, « l'état des lieux d'un projet dont un test échoue passe G2, porte FAIL pour le contrôle de tests avec un constat qui nomme le fichier du test en échec, et est clos accepted »
- Rouge : `qualifyControlDetailed` exige que le témoin positif rende PASS. Or ce témoin est une copie de la référence, où le test du projet échoue : il rend FAIL. La note « positive witness gave FAIL » rend le contrôle non qualifié, et G2 refuse de geler le protocole.

### Tâche 3 — Une exigence qu'aucun contrôle de sa nature ne mesure est un angle mort

Pour un état des lieux, une exigence n'est mesurée que par les contrôles de sa nature. Le
comportement est mesuré par les tests, le style par le lint, la couverture et la mutation par leurs
capteurs, et la structure par les règles de structure. Une exigence dont aucun contrôle gelé n'est
de sa nature, ou dont la nature n'est pas reconnue, est un angle mort du `survey`, avec sa raison.
La règle d'un changement à candidat ne change pas : une exigence sans contrôle préféré y reçoit
tous les contrôles.

- Vérifie : `node --test test/v2-kernel/state-survey-blind-spots.test.ts`
- Tient : `test/v2-kernel/state-survey-blind-spots.test.ts`, « une exigence d'architecture d'un projet Node est un angle mort du survey avec la raison qu'aucun contrôle ne mesure sa nature, ne porte le verdict d'aucun contrôle, et l'état des lieux est clos accepted sans préparation ni décision IH-04 »
- Rouge : `freeze` donne à une exigence qui n'est pas de qualité tous les contrôles autres que le lint (`preferred.length > 0 ? preferred : controls`). L'exigence d'architecture reçoit ainsi le contrôle de tests, et le `survey` lui attribue son PASS.

### Tâche 4 — Un contrôle qui ne mesure rien de la référence est un angle mort

Un contrôle de tests dont la référence n'exécute aucun cas propre est un angle mort de l'état des
lieux, avec la raison donnée par le diagnostic de capacité. Il en va de même d'un contrôle
différentiel (couverture, mutation), qui ne lit que les lignes introduites et n'en a aucune sur la
référence. Aucun des deux n'est présenté avec un verdict.

- Vérifie : `node --test test/v2-kernel/state-survey-unmeasured.test.ts`
- Tient : `test/v2-kernel/state-survey-unmeasured.test.ts`, « l'état des lieux d'un projet Node qui demande sa couverture et dont les tests ne déclarent aucun cas propre nomme le contrôle de tests et le contrôle de couverture comme angles morts, chacun avec sa raison, et ne présente aucun des deux avec PASS »
- Rouge : la passe de référence d'un contrôle différentiel tourne avec `introduced_lines` vide et rend PASS sans ligne mesurée. Le contrôle de tests rend PASS sur une suite qui n'exécute que le cas du témoin. Le `survey` reprend ces deux PASS.

### Tâche 5 — La commande /495 state ouvre un état des lieux

`state` rejoint les sous-commandes de `/495`. Avec un texte, elle crée un changement dont le livrable
est l'état du projet, lie la session et le conduit, comme `start`. Sans texte, elle affiche son usage.

- Vérifie : `node --test test/v3-pi/state-entry.test.ts`
- Tient : `test/v3-pi/state-entry.test.ts`, « /495 state avec une question crée un changement dont le livrable est l'état du projet, lie la session et le conduit ; sans texte il affiche son usage et ne crée rien ; /495 start ouvre toujours un changement à candidat »
- Rouge : `state` n'est pas dans `SUBCOMMANDS`. `/495 state …` tombe sur le gestionnaire `help`, qui ne crée aucun changement.

## 5. Hors périmètre

- Présenter l'état des lieux au propriétaire, qui le lit avec ses angles morts et l'accepte ou le
  refuse : `e29s02`. Jusque-là, un état des lieux complet se clôt à G5 sans lui demander son
  acceptation, même quand la politique l'exige pour un changement à candidat.
- Mesurer la couverture ou la mutation de tout l'arbre, et non des seules lignes introduites, et
  séparer code propriétaire, code généré et dépendances : la baseline de `e10s02` et `e10s03`.
- Le diagnostic d'architecture : `e11s01` et `e11s02`. Ici, une exigence d'architecture reste un
  angle mort tant qu'aucun contrôle de sa nature n'existe pour la cible.
- La relecture d'un état des lieux par un modèle : un modèle peut commenter ce que les contrôles ont
  mesuré, mais n'ajoute aucun constat (`D-74`). Aucune relecture n'est ouverte.
- Un changement à candidat sur un projet dont un test échoue : il garde la qualification
  d'aujourd'hui, et G2 le refuse.
