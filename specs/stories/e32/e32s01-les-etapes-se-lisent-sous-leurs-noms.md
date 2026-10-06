# Les étapes d'un changement se lisent sous leurs noms, du cadrage à l'intégration

Story : e32s01
Epic : e32
Statut : en cours

## 1. Ce que le lecteur gagne

Le propriétaire qui suit un changement lit ses étapes sous trois vocabulaires. Le statut et le rapport
disent Mandate, Requirements, Checks frozen, Design, Candidate, Acceptance, Integration (en français
Mandat, Exigences, Contrôles gelés…). Le pied de page dit `495 specifying/running`, avec le mot technique
de la phase. Le README dit « G2 — Verification » et `AGENTS.md` « Frozen verification protocol »,
« Isolated candidate », « Model-free checks ». Rien ne lui dit que « Checks frozen », « Verification » et
`verification_design` sont la même étape.

Il gagne un seul nom par étape, le même à l'écran et dans la documentation : Scoping, Specification,
Qualification, Design, Implementation, Acceptance, Integration, et en français Cadrage, Spécification,
Qualification, Conception, Implémentation, Acceptation, Intégration (`D-83`). C'est un défaut et non une
préférence : trois noms pour une étape font chercher au lecteur une différence qui n'existe pas.

## 2. Promesses

Scenario: Le statut nomme les sept étapes
  Given un changement accepté à sa première tentative, G0 à G5 passées, G6 non atteinte, et une session Pi en anglais
  When le propriétaire tape `/495 status`
  Then la ligne des étapes est « ✔ Scoping  ✔ Specification  ✔ Qualification  ✔ Design  ✔ Implementation  ✔ Acceptance  ○ Integration »
  And dans une session en français, elle est « ✔ Cadrage  ✔ Spécification  ✔ Qualification  ✔ Conception  ✔ Implémentation  ✔ Acceptation  ○ Intégration »

Scenario: Le rapport nomme les étapes que le noyau a passées
  Given le même changement et une session en anglais
  When le propriétaire tape `/495 report`
  Then la section de ce qui a été conclu contient « ✔ The kernel passed Scoping, Specification, Qualification, Design, Implementation and Acceptance »

Scenario: Un changement en cours dit son étape avant son activité
  Given un changement dont l'agent écrit le candidat à la première de trois tentatives, et une session en anglais
  When le propriétaire tape `/495 status`
  Then la ligne qui dit où il en est est « … Implementation · writing the candidate on attempt 1 of 3 »
  And en français, « … Implémentation · écriture du candidat à la tentative 1 sur 3 »

Scenario: Le pied de page nomme l'étape
  Given un changement en cours dans l'étape de spécification, et une session en anglais
  Then la ligne 495 du pied de page commence par « 495 Specification · running »
  And en français, par « 495 Spécification · running »
  And la ligne d'un changement clos et accepté commence par « 495 Closed · completed » en anglais et « 495 Clos · completed » en français

Scenario: La documentation nomme les étapes comme l'écran
  Given le README, `AGENTS.md`, `specs/amont/expression-besoins.md` et `specs/amont/specification-fonctionnelle.md`
  Then leurs tableaux des gates nomment G0 à G6 Scoping, Specification, Qualification, Design, Implementation, Acceptance, Integration en anglais, et Cadrage, Spécification, Qualification, Conception, Implémentation, Acceptation, Intégration en français
  And le tableau des transitions du corpus nomme Cadrage l'ancienne « Clarification » et Qualification l'ancien « Protocole de vérification »

## 3. Sécurité

Sans objet : la story change des libellés ; aucun identifiant, aucune donnée et aucun confinement ne
change.

## 4. Tâches

### Tâche 1 — Le statut et le rapport nomment les étapes

Les libellés des gates de `src/presentation/structured/text.ts` prennent les noms de `D-83`, en anglais
et en français. La ligne d'un changement en cours fait précéder son activité du nom de l'étape qui la
contient : l'accueil et la clarification sont du cadrage, la spécification de la spécification, la
conception de la vérification et la préparation de la qualification, la conception de la conception,
l'écriture du candidat de l'implémentation, l'exécution des contrôles, la relecture et la décision de
l'acceptation, l'intégration de l'intégration. L'activité suit, en minuscule après « · ». Les tests
existants qui lisent les anciens noms (`status-text`, `report-text`, `pi-rpc-sdk`) lisent les nouveaux.

- Vérifie : `node --test test/v0-pure/step-names.test.ts`
- Tient : `test/v0-pure/step-names.test.ts`, « le statut anglais d'un changement accepté, G0 à G5 passées, a la ligne `  ✔ Scoping  ✔ Specification  ✔ Qualification  ✔ Design  ✔ Implementation  ✔ Acceptance  ○ Integration` et le français `  ✔ Cadrage  ✔ Spécification  ✔ Qualification  ✔ Conception  ✔ Implémentation  ✔ Acceptation  ○ Intégration` ; le rapport anglais contient `  ✔ The kernel passed Scoping, Specification, Qualification, Design, Implementation and Acceptance` ; un changement qui écrit son candidat à la tentative 1 sur 3 a la ligne `… Implementation · writing the candidate on attempt 1 of 3` en anglais et `… Implémentation · écriture du candidat à la tentative 1 sur 3` en français »
- Rouge : les libellés des gates valent aujourd'hui `Mandate`, `Requirements`, `Checks frozen`, `Candidate`… et `Mandat`, `Exigences`, `Contrôles gelés`, `Candidat` ; la ligne d'un changement en cours est `… Writing the candidate on attempt 1 of 3`, sans étape

### Tâche 2 — Le pied de page nomme l'étape

La ligne que `updateFooter` (`src/extension/session.ts`) écrit commence par le nom de l'étape qui
contient la phase du changement, dans la langue de la session, puis « · » et le statut ; un changement
clos dit « Closed » ou « Clos ». Le statut (`running`, `completed`…) et la marque d'une décision en
attente ne changent pas.

- Vérifie : `node --test test/v3-pi/footer-step-name.test.ts`
- Tient : `test/v3-pi/footer-step-name.test.ts`, « la ligne 495 d'un changement en cours dans l'étape de spécification commence par `495 Specification · running` en anglais et `495 Spécification · running` en français ; celle d'un changement clos et accepté commence par `495 Closed · completed` et `495 Clos · completed` »
- Rouge : `updateFooter` écrit `495 ${c.phase}/${c.status}`, soit `495 specifying/running` et `495 closed/completed`, quelle que soit la langue

### Tâche 3 — La documentation et le corpus nomment les étapes comme l'écran

Les tableaux des gates du README (« The seven gates ») et d'`AGENTS.md`, ceux de
`specs/amont/expression-besoins.md` et de `specs/amont/specification-fonctionnelle.md` §12 prennent les
noms de `D-83`. Dans le tableau des transitions de `expression-besoins.md` §6.2, « Clarification »
devient « Cadrage » et « Protocole » ou « Protocole de vérification » devient « Qualification » ; les
activités (Accueil, Préparation, Vérification, Revue, Décision) gardent leur nom.

- Vérifie à la main : lire les tableaux nommés ci-dessus, puis `npm run build` et `npm run check`, vert
- Tient : la lecture des tableaux, où G0 à G6 portent les noms de `D-83` et où « Mandate », « Requirements », « Verification », « Candidate », « Frozen verification protocol », « Isolated candidate », « Model-free checks », « Local integration » ne nomment plus une gate
- Rouge : le README nomme G0 « Mandate » et G2 « Verification », `AGENTS.md` G2 « Frozen verification protocol » et G4 « Isolated candidate », le corpus G0 « Mandat » et G2 « Vérifiabilité »

## 5. Hors périmètre

- Les identifiants de phase (`specifying`, `verification_design`…) dans le journal, le JSON et les
  contrats : e32s02.
- Les mots du statut d'exécution (`running`, `completed`, `blocked`) dans le pied de page : ce sont des
  états, pas des étapes ; ils restent tels quels.
- Le mandat, les exigences, le protocole et la conception comme artefacts : ils gardent leur nom
  (`D-83`).
- Les décisions et les stories versées, et les dossiers de `specs/verifications/` : ils disent ce qui
  était vrai quand ils ont été écrits.
