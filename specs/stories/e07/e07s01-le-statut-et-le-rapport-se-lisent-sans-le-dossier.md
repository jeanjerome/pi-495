# Le statut et le rapport d'un changement se lisent sans connaître le dossier

Story : e07s01
Epic : e07
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire qui tape `/495 status` ou `/495 report` dans le terminal de Pi lit aujourd'hui le
dossier tel qu'il est rangé, pas une réponse à sa question. `/495 status` aligne des identifiants et des
empreintes (`Change: chg_muvojsvvb399c9ce4d r69 (inc_1)`, `Candidate: cand_dbff53b24f15
sha256:dbff53b24f157ccf`), des codes (`Gates: G0=PASS G1=PASS …`, `Limits: sandbox:seatbelt:qualified`),
mêle dans `Evidence:` les verdicts de tous les candidats, et la fin d'un déroulement ajoute neuf lignes
de transitions internes (`verification_design -> preparing/ready`). `/495 report` dépasse l'écran, montre
au même rang que le résultat les essais de qualification des contrôles (`unit v1+junit-xml@1.0.0 fixture
sha256:887e5dda9109 → FAIL (1)`), et range parmi les risques résiduels l'essai volontairement cassé qui
qualifie un contrôle (`control_limit: control unit: spawn error: sandbox-exec: execvp() of
'/nonexistent/495-broken-runner' failed`), qui ne dit rien du candidat.

Il gagne un statut qui dit d'abord où en est sa demande, puis les portes en une ligne, les contrôles du
candidat courant et ce qu'il peut faire ensuite ; et un rapport qui dit ce qui était demandé avec son
verdict, ce qui a été mesuré sur la référence et sur le candidat, ce qui a été conclu, et ce qui reste
incertain sur ce candidat seulement. C'est un défaut et non une préférence : UX-03 exige qu'un
utilisateur explique l'état d'un changement sans lire de journal technique, et un risque résiduel qui ne
porte pas sur le candidat fait douter d'un changement accepté.

## 2. Promesses

Scenario: Le statut d'un changement accepté se lit d'abord par son verdict
  Given une session Pi en anglais et un changement de la demande « add freeMinutes(busy) beside freeSlots », accepté à la première de trois tentatives, dont les portes G0 à G5 sont passées, dont les contrôles `unit`, `coverage` et `mutation` ont réussi sur le candidat courant, qui a consommé 77 700 jetons pour environ 0,10 $ sur abonnement, sans intégration permise
  When le propriétaire tape `/495 status`
  Then la réponse est, ligne pour ligne :
    """
    495 · add freeMinutes(busy) beside freeSlots
    ✔ Accepted on attempt 1 of 3

      ✔ Mandate  ✔ Requirements  ✔ Checks frozen  ✔ Design  ✔ Candidate  ✔ Acceptance  ○ Integration

      Checks on the candidate
        ✔ unit       passed
        ✔ coverage   passed
        ✔ mutation   passed

      Used    77.7k tokens · ~$0.10 (sub)
      Next    /495 review to read the change, /495 report for the details
    """
  And elle ne contient ni identifiant de changement, de candidat ou de programme, ni empreinte, ni numéro de révision

Scenario: Un changement arrêté dit sa cause une fois, sous son verdict
  Given un changement bloqué à la deuxième de trois tentatives, dont G2 a échoué avec la raison « no test can judge R1 », et dont la prochaine action est « resume after answering the decision »
  When le propriétaire tape `/495 status`
  Then la deuxième ligne est « ✘ Blocked on attempt 2 of 3 — no test can judge R1 »
  And la ligne des portes montre « ✔ Mandate  ✔ Requirements  ✘ Checks frozen  ○ Design  ○ Candidate  ○ Acceptance  ○ Integration »
  And la ligne `Next` reprend la prochaine action du changement

Scenario: Une décision en attente est le verdict du statut
  Given un changement qui attend une réponse du propriétaire à IH-04
  When le propriétaire tape `/495 status`
  Then la deuxième ligne est « ⏸ Waiting for your decision — /495 decide »

Scenario: Les contrôles du statut sont ceux du candidat courant
  Given un changement dont un premier candidat a échoué au contrôle `unit` et dont le second l'a réussi
  When le propriétaire tape `/495 status`
  Then la section « Checks on the candidate » montre `✔ unit       passed` et aucune ligne pour le premier candidat

Scenario: Un bac à sable qualifié n'est pas une limite
  Given un statut dont le bac à sable est qualifié
  Then aucune ligne ne nomme le bac à sable
  Given un statut dont le bac à sable n'est pas qualifié
  Then une ligne « ⚠ The seatbelt sandbox is not qualified » suit le verdict

Scenario: La fin d'un déroulement montre le statut, pas les transitions
  Given un changement que `/495 start` conduit jusqu'à son acceptation
  When le déroulement s'arrête
  Then le message affiché est le statut du changement, et aucune ligne de la forme « verification_design -> preparing/ready » n'y figure

Scenario: Le rapport dit ce qui était demandé, ce qui a été mesuré, conclu, et ce qui reste incertain
  Given le changement accepté du premier scénario, avec deux exigences portées l'une par `unit` et `mutation`, l'autre par `unit`, et trois contrôles qualifiés chacun sur trois essais
  When le propriétaire tape `/495 report`
  Then la réponse commence par « 495 report · add freeMinutes(busy) beside freeSlots — ✔ Accepted »
  And elle a quatre sections, dans cet ordre : « What was asked », « What was measured », « What was concluded », « What remains uncertain »
  And « What was asked » donne chaque exigence par son énoncé, précédée de ✔ et suivie des contrôles qui la portent, sans son identifiant
  And « What was measured » est un tableau d'une ligne par contrôle et de deux colonnes, `reference` et `candidate`, rempli de ✔, ✘ ou ?, suivi de « 3 checks were qualified on 9 witness runs before they were trusted. »
  And « What was concluded » dit « ✔ The kernel passed Mandate, Requirements, Checks frozen, Design, Candidate and Acceptance » en une ligne
  And la réponse tient en 30 lignes, et ne contient ni empreinte ni ligne d'essai de qualification

Scenario: Un essai de qualification n'est pas un risque résiduel du candidat
  Given un contrôle qualifié par un essai volontairement cassé qui a répondu INDETERMINATE avec la note « spawn error: … '/nonexistent/495-broken-runner' »
  When le rapport du changement est composé
  Then aucun risque résiduel ne nomme cet essai, ni INDETERMINATE sur un témoin, ni la note de l'exécutable absent
  And un contrôle qui n'est pas qualifié reste un risque résiduel qui le nomme

Scenario: Le statut et le rapport parlent la langue de la session
  Given une session Pi en français et le changement accepté du premier scénario
  When le propriétaire tape `/495 status` puis `/495 report`
  Then le statut montre « ✔ Accepté à la tentative 1 sur 3 », « ✔ Mandat  ✔ Exigences  ✔ Contrôles gelés  ✔ Conception  ✔ Candidat  ✔ Acceptation  ○ Intégration » et « Contrôles du candidat »
  And les sections du rapport sont « Ce qui était demandé », « Ce qui a été mesuré », « Ce qui a été conclu » et « Ce qui reste incertain »

## 3. Sécurité

Aucun identifiant, aucune empreinte ni aucune limite ne disparaît du dossier : le journal, le magasin
d'objets, l'export et les objets `view` et `report` que reçoivent les surfaces RPC et JSON restent
inchangés ; seul le texte affiché les omet. Le rapport cesse de compter comme risque résiduel ce que
produit un essai de qualification sur un témoin, parce que cet essai juge le contrôle et non le
candidat ; un contrôle qui n'est pas qualifié reste un risque résiduel, et un bac à sable non qualifié
reste signalé dans le statut.

## 4. Tâches

### Tâche 1 — Le statut d'un changement se lit par son verdict, ses portes et ses contrôles

`formatStatus` (`src/presentation/structured/text.ts`) écrit le titre de la demande, puis une ligne de
verdict (✔ accepté, ✘ bloqué ou en échec avec la cause, ⏸ décision attendue, … en cours avec la phase),
la ligne des sept portes en mots avec ✔, ✘, ? ou ○, les raisons d'une porte qui n'est pas passée, les
contrôles du candidat courant, la consommation et la prochaine action, en anglais et en français. Le bac à
sable n'apparaît que s'il n'est pas qualifié. Les identifiants, empreintes et révisions ne sont plus
écrits. Les lignes du programme et de ses jalons sont inchangées.

- Vérifie : `node --test test/v0-pure/status-text.test.ts`
- Tient : `test/v0-pure/status-text.test.ts`, « le statut d'un changement accepté à la première de trois tentatives, portes G0 à G5 passées, contrôles `unit`, `coverage` et `mutation` réussis, 77 700 jetons pour ~0,10 $ sur abonnement, est exactement le bloc du premier scénario ; un changement bloqué sur G2 a pour deuxième ligne `✘ Blocked on attempt 2 of 3 — no test can judge R1` ; une décision en attente a pour deuxième ligne `⏸ Waiting for your decision — /495 decide` ; un bac à sable qualifié n'est pas nommé, un bac à sable non qualifié donne `⚠ The seatbelt sandbox is not qualified` ; en français, le verdict est `✔ Accepté à la tentative 1 sur 3` »
- Rouge : `formatStatus` écrit aujourd'hui `Change: <id> r<revision> (<increment>)`, `Phase: … Status: … Outcome: …`, `Gates: G0=PASS …` et `Limits: sandbox:seatbelt:qualified` ; la deuxième ligne n'est pas `✔ Accepted on attempt 1 of 3` et l'assertion sur le bloc échoue

### Tâche 2 — Les contrôles du statut sont ceux du candidat courant

La vue de statut (`src/application/views.ts`) dit pour chaque preuve si elle juge le candidat courant ;
le statut ne montre que celles-là. Corrige l'entrée BUG-2026-10-05T130610 du registre.

- Vérifie : `node --test test/v2-kernel/status-current-candidate.test.ts`
- Tient : `test/v2-kernel/status-current-candidate.test.ts`, « un changement dont le premier candidat a échoué au contrôle `unit` et dont le second l'a réussi a un statut dont la section des contrôles du candidat montre `✔ unit       passed` et aucune ligne `✘ unit` »
- Rouge : la vue de statut reprend toutes les preuves du changement sans dire quel candidat chacune juge ; le statut écrit aujourd'hui `Evidence: unit=FAIL unit=PASS`, et la section attendue n'existe pas

### Tâche 3 — Un essai de qualification n'est pas un risque résiduel

Le rapport (`src/application/report.ts`) ne tire plus de risque `indeterminate_control`,
`control_limit`, `unstable_control`, `truncated_output` ni `excluded_from_measure` d'une preuve dont le
sujet est un témoin de qualification. `control_not_qualified` est inchangé.

- Vérifie : `node --test test/v2-kernel/report-risks-candidate.test.ts`
- Tient : `test/v2-kernel/report-risks-candidate.test.ts`, « un changement accepté dont les contrôles ont été qualifiés par un témoin cassé qui a répondu INDETERMINATE avec la note `spawn error` a un rapport dont aucun risque résiduel ne nomme `fixture`, `INDETERMINATE` ni `/nonexistent/495-broken-runner`, et un changement dont un contrôle n'est pas qualifié garde le risque `control_not_qualified` qui le nomme »
- Rouge : la boucle des risques de `buildReport` parcourt toutes les preuves, témoins compris ; le rapport contient aujourd'hui `indeterminate_control: control unit answered INDETERMINATE on fixture …` et `control_limit: control unit: spawn error: …`

### Tâche 4 — Le rapport se lit en quatre sections humaines

`formatReport` écrit l'en-tête avec la demande et le verdict, puis « What was asked » (chaque exigence
par son énoncé, ✔, ✘ ou ? et ses contrôles), « What was measured » (le tableau référence/candidat et le
compte des essais de qualification), « What was concluded » (les portes que le noyau a passées en une
ligne, puis chaque décision humaine et chaque revue), « What remains uncertain » (chaque risque par sa
phrase, sans son code), en anglais et en français. Le rapport d'un état des lieux garde sa section propre.
Les trois natures d'IMP-05 restent séparées : mesuré, conclu, incertain.

- Vérifie : `node --test test/v0-pure/report-text.test.ts`
- Tient : `test/v0-pure/report-text.test.ts`, « le rapport du changement accepté à deux exigences et trois contrôles qualifiés chacun sur trois essais commence par `495 report · add freeMinutes(busy) beside freeSlots — ✔ Accepted`, a les quatre sections dans l'ordre, un tableau `reference`/`candidate` de trois lignes, la phrase `3 checks were qualified on 9 witness runs before they were trusted.`, la ligne `✔ The kernel passed Mandate, Requirements, Checks frozen, Design, Candidate and Acceptance`, tient en 30 lignes et ne contient aucune empreinte ; en français, les sections sont `Ce qui était demandé`, `Ce qui a été mesuré`, `Ce qui a été conclu` et `Ce qui reste incertain` »
- Rouge : `formatReport` écrit aujourd'hui `Report <change_id> — Outcome: accepted`, `## Mechanical observations` avec une ligne par essai et son empreinte, et `## Residual risks` avec les codes ; la première ligne attendue n'y est pas

### Tâche 5 — La fin d'un déroulement montre le statut sans les transitions

Le message de fin d'un déroulement (`src/extension/conduct.ts`) est le statut du changement, sans la liste
des transitions de phase, qui restent au journal.

- Vérifie : `node --test test/v3-pi/conduct-end-message.test.ts`
- Tient : `test/v3-pi/conduct-end-message.test.ts`, « un `/495 start` qu'un agent scripté conduit jusqu'à l'acceptation affiche un dernier message dont la deuxième ligne est `✔ Accepted on attempt 1 of 3` et qui ne contient aucune ligne de la forme `<phase> -> <phase>/<status>` »
- Rouge : `conduct` ajoute aujourd'hui au statut les étapes du déroulement (`result.steps`), une ligne `clarifying -> specifying/ready` par transition

## 5. Hors périmètre

- Les phrases que composent le noyau et l'application, comme la prochaine action d'un changement bloqué,
  le motif d'un arrêt ou l'énoncé d'un risque résiduel : elles restent en anglais dans une session
  française. Les rendre dans la langue de la session est la décision de produit que demande
  BUG-2026-09-29T210000 (un code et ses arguments, ou un texte écrit dans la langue).
- Le statut d'un programme à plusieurs incréments, de ses jalons et de ses exceptions, et le rapport d'un
  état des lieux : leurs lignes sont inchangées ; les réécrire de la même façon est une story à part
  de e07.
- Les identifiants dont une commande a besoin (`/495 bind`, `/495 measure`) : `/495 bind` les liste
  toujours, et le statut d'un programme les montre.
- Le dialogue d'une décision (IH-04, IH-10) et l'écran de revue : leur présentation ne change pas.
- La démonstration du README : elle sera refaite une fois cette story versée.
