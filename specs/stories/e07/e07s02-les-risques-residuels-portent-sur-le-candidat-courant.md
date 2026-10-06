# Les risques résiduels d'un rapport portent sur le candidat courant

Story : e07s02
Epic : e07
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire qui lit `/495 report` d'un changement accepté oppose « What remains uncertain » au
candidat qu'il va intégrer. Depuis e07s01, un essai de qualification n'y figure plus, mais chaque
exécution d'un contrôle sur la référence ou sur un candidat d'une tentative précédente y ajoute encore
ses limites comme des doutes sur le changement. Le passage d'un contrôle de couverture sur la référence,
qui n'introduit aucune ligne, y écrit « control coverage: the candidate introduces no line JaCoCo
measures », alors que le même contrôle a mesuré des lignes sur le candidat : la ligne dit le contraire
du fait mesuré (`specs/archive/QUALIFICATION.md`, campagne du 19 septembre). Un `INDETERMINATE` du
premier candidat, écarté, reste un risque du second, accepté, et la phrase « N control run(s) observed
the candidate » compte les exécutions de tous les candidats.

Il gagne une section « What remains uncertain » dont chaque ligne tirée d'une exécution porte sur le
candidat que le rapport juge, celui dont « What was measured » montre déjà la colonne `candidate`.
C'est un défaut et non une préférence : l'epic veut des risques résiduels qui portent sur le candidat,
et un risque qui n'en parle pas fait douter d'un changement accepté.

## 2. Promesses

Scenario: Le passage d'un contrôle sur la référence n'est pas un risque du candidat
  Given un changement accepté dont le contrôle `coverage` a réussi sur la référence avec la note « the candidate introduces no line JaCoCo measures » et sur le candidat sans aucune limite
  And dont le contrôle `unit` a répondu INDETERMINATE sur la référence et réussi sur le candidat
  When le rapport du changement est composé
  Then aucun risque résiduel ne contient « introduces no line », ni ne nomme la référence
  And le tableau de « What was measured » montre `?` dans la colonne `reference` de la ligne `unit`

Scenario: Les limites d'un candidat précédent ne sont pas des risques du candidat accepté
  Given un changement accepté à sa deuxième tentative, dont le premier candidat a répondu INDETERMINATE au contrôle `unit` avec une sortie tronquée à 4096 octets et la note « two passes disagreed »
  When le rapport du changement est composé
  Then aucun risque résiduel ne nomme le premier candidat, ni « truncated », ni « two passes disagreed »

Scenario: Les limites du candidat courant restent des risques
  Given un changement dont le candidat courant a répondu INDETERMINATE au contrôle `unit` avec la note « two passes disagreed »
  When le rapport du changement est composé
  Then les risques résiduels `indeterminate_control` et `control_limit` nomment le contrôle `unit` et la note « two passes disagreed »

Scenario: Le compte des exécutions qui ne prouvent rien est celui du candidat courant
  Given un changement accepté à sa deuxième tentative, dont le premier candidat a été observé par un contrôle et le second par deux
  When le rapport du changement est composé
  Then le risque résiduel `controls_are_not_a_proof` commence par « 2 control run(s) observed the candidate »

## 3. Sécurité

Aucune exécution ne disparaît du dossier : le journal, le magasin d'objets, l'export et le champ
`observations` du rapport structuré gardent les exécutions sur la référence et sur chaque candidat, avec
leur verdict ; le verdict d'un contrôle sur la référence reste lisible dans la colonne `reference` de
« What was measured ». Seuls les risques résiduels tirés d'une exécution se restreignent au candidat
courant, identifié comme le tableau l'identifie déjà, par son empreinte de manifeste. Les risques qui ne
viennent pas d'une exécution sont inchangés : un contrôle non qualifié, une exigence sans contrôle, une
preuve invalidée, un arrêt avant la fin.

## 4. Tâches

### Tâche 1 — Les risques tirés d'une exécution ne lisent que le candidat courant

`engineeringReport` (`src/application/report.ts`) ne tire les risques `indeterminate_control`,
`unstable_control`, `truncated_output`, `excluded_from_measure`, `control_limit` et
`preexisting_findings_tolerated` que des preuves dont le sujet est le candidat courant du changement.
Un changement sans candidat n'en tire aucun.

- Vérifie : `node --test test/v0-pure/report-risks-current-candidate.test.ts`
- Tient : `test/v0-pure/report-risks-current-candidate.test.ts`, « un changement accepté dont `coverage` a réussi sur la référence avec la note `the candidate introduces no line JaCoCo measures`, dont `unit` a répondu INDETERMINATE sur la référence, et dont un premier candidat a répondu INDETERMINATE à `unit` avec une sortie tronquée et la note `two passes disagreed`, a un rapport dont aucun risque résiduel ne contient `introduces no line`, `reference`, l'identifiant du premier candidat, `truncated` ni `two passes disagreed`, et dont le texte montre `?` dans la colonne `reference` de la ligne `unit` ; un candidat courant qui a répondu INDETERMINATE avec la note `two passes disagreed` garde les risques `indeterminate_control` et `control_limit` qui la nomment »
- Rouge : la boucle des risques de `engineeringReport` parcourt toutes les preuves dont le sujet n'est pas un témoin ; elle écrit aujourd'hui `control_limit: control coverage: the candidate introduces no line JaCoCo measures`, `indeterminate_control: control unit answered INDETERMINATE on reference …` et `truncated_output: the output of control unit was truncated at 4096 bytes …` pour le premier candidat

### Tâche 2 — Le compte des exécutions qui ne prouvent rien est celui du candidat courant

Le risque `controls_are_not_a_proof` compte les exécutions qui ont observé le candidat courant.

- Vérifie : `node --test test/v0-pure/report-risks-current-candidate.test.ts`
- Tient : `test/v0-pure/report-risks-current-candidate.test.ts`, « un changement accepté dont le premier candidat a été observé par une exécution et le second par deux a un risque `controls_are_not_a_proof` qui commence par `2 control run(s) observed the candidate` »
- Rouge : `engineeringReport` compte toutes les observations dont le sujet est un candidat, quel qu'il soit ; la phrase commence aujourd'hui par `3 control run(s) observed the candidate`

## 5. Hors périmètre

- La notification d'une commande, deuxième écart du chantier G : elle ne reprend plus la première ligne
  du message depuis 1a6e0a8, où chaque message de 495 est dessiné une fois sur l'écran au lieu d'être
  notifié ; rien n'est à faire.
- Deux candidats identiques de deux tentatives partagent une empreinte de manifeste : les exécutions du
  premier comptent alors comme celles du candidat courant, dans le rapport comme dans le statut
  (BUG-2026-10-06T032710). Lier une preuve à la tentative qui l'a produite reste à décider.
- Les limites d'une exécution sur la référence, comme une sortie tronquée, ne sont plus dites dans le
  texte du rapport ; elles restent dans le dossier. Les montrer ailleurs dans le rapport, comme une
  limite de la mesure de la référence, serait un comportement de plus que rien ne demande aujourd'hui.
- La phrase « the candidate introduces no line … » que les analyseurs de couverture écrivent sur une
  exécution de la référence : elle reste dans la preuve telle quelle.
- Les risques résiduels écrits en anglais dans une session française et les identifiants qu'ils citent
  (BUG-2026-10-06T002900, BUG-2026-10-06T060200), l'en-tête « In progress » du rapport d'un changement
  bloqué (BUG-2026-10-06T060100) : des défauts du registre, traités par la phase des défauts de l'epic.
- Une preuve invalidée par la révision d'un artefact reste un risque `invalidated_evidence`, quel que
  soit le candidat qu'elle jugeait : elle dit qu'une révision a eu lieu.
