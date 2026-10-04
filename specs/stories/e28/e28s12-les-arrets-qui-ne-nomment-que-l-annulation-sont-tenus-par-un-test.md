# Les arrêts qui ne nomment que l'annulation sont tenus par un test

Story : e28s12
Epic : e28
Statut : en cours

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-09-28T163300 du registre. Trois arrêts du changement ne nomment que
l'annulation comme sortie, parce qu'aucune reprise ne les lève : le projet où aucun contrôle n'est
détectable, le protocole qui ne se gèle pas, et les contrôles qui déclarent un cycle de rapports. Le
propriétaire lit cette sortie dans `/495 status`, à la fin de la prochaine action : « (next: cancel) ».
Le code la tient aujourd'hui, mais aucun test ne la lit : remettre à sa place un ancien nom
(`prepare_capabilities`), ou une reprise que rien ne lève (`resume, cancel`), laisse passer toute la
suite.

Celui qui gagne est le propriétaire qui se fie à cette sortie : une régression qui lui renverrait une
action qui n'existe pas, ou une reprise qui retombe sur le même arrêt, serait arrêtée par un test au
lieu de lui parvenir. C'est un défaut et non une préférence : une promesse qu'aucun test ne tient peut
être défaite par n'importe quel changement sans que la Preflight le voie.

## 2. Promesses

Scenario: L'arrêt d'un projet sans contrôle détectable ne nomme que l'annulation
  Given un projet Node dont `scripts.test` vaut `tsc && node --test`
  When le changement avance jusqu'à la conception de la vérification
  Then il s'arrête `capability_missing`, et la prochaine action que montre `/495 status` est « blocked: capability_missing — CAPABILITY_MISSING: scripts.test chains commands through a shell (tsc && node --test), which 495 cannot run (next: cancel) »

Scenario: L'arrêt d'un protocole qui ne se gèle pas ne nomme que l'annulation
  Given le projet de référence, dont chaque témoin de qualification du contrôle `unit` répond FAIL
  When le changement avance jusqu'à la conception de la vérification
  Then il s'arrête `capability_missing`, et la prochaine action que montre `/495 status` commence par « blocked: capability_missing — CAPABILITY_MISSING: protocol not frozen: » et finit par « (next: cancel) »

Scenario: L'arrêt sur un cycle de rapports ne nomme que l'annulation
  Given deux contrôles dont chacun lit le rapport que l'autre écrit, `x` et `y`
  When la vérification les ordonne
  Then elle refuse avec le texte « CONFIGURATION_ERROR: controls declare a cycle of reports: x, y (next: cancel) », celui que le harnais inscrit au détail de l'arrêt

## 3. Sécurité

Sans objet : la story n'ajoute que des tests ; aucun arrêt, aucun refus ni aucune mesure de confinement
ne change.

## 4. Tâches

### Tâche 1 — Un test lit la sortie de l'arrêt d'un projet sans contrôle détectable

Un test de noyau ouvre un changement sur un projet suivi par Git, copie de la référence dont
`package.json` porte `scripts.test` à `tsc && node --test`, le fait avancer, et lit la ligne « Next
action » de `formatStatus(view, "en")`, celle que `/495 status` montre. L'arrêt est levé par
`src/application/phases/verification-design.ts` quand la détection ne rend aucun contrôle. Aucun code ne
change : le test tient ce que le code fait.

- Vérifie à la main : écrire le test ; remplacer `nextActions: ["cancel"]` par `nextActions: ["prepare_capabilities"]` à l'arrêt « no control available » de `verification-design.ts`, lancer `node --test test/v2-kernel/cancel-only-stops.test.ts` et lire l'échec sur la ligne « Next action » qui finit par « (next: prepare_capabilities) » ; rétablir la ligne, relancer la même commande et la lire verte
- Tient : `test/v2-kernel/cancel-only-stops.test.ts`, « un projet dont `scripts.test` vaut `tsc && node --test` s'arrête `capability_missing`, et la prochaine action de `/495 status` est `blocked: capability_missing — CAPABILITY_MISSING: scripts.test chains commands through a shell (tsc && node --test), which 495 cannot run (next: cancel)` »
- Rouge : le code tient la promesse et aucun test ne la lit ; sondé sur `main` à 19d72e4 : la mutation ci-dessus, avec celles des tâches 2 et 3, laisse passer `test/v1-adapters`, `test/v2-kernel` et `test/v3-pi`, et la même sonde lit « … which 495 cannot run (next: prepare_capabilities) » dans la prochaine action

### Tâche 2 — Un test lit la sortie de l'arrêt d'un protocole qui ne se gèle pas

Dans le même fichier, un test ouvre un changement sur le projet de référence avec un exécuteur de
contrôles qui rend FAIL à chaque témoin de qualification du contrôle `unit`, comme le fait déjà
`test/v2-kernel/preparation.test.ts`, le fait avancer, et lit la ligne « Next action » de
`formatStatus(view, "en")`. L'arrêt est levé par `verification-design.ts` quand G2 ne passe pas. Aucun
code ne change.

- Vérifie à la main : écrire le test ; remplacer `{ nextActions: ["cancel"] }` par `{ nextActions: ["resume", "cancel"] }` à l'arrêt « protocol not frozen » de `verification-design.ts`, lancer `node --test test/v2-kernel/cancel-only-stops.test.ts` et lire l'échec sur la ligne « Next action » qui finit par « (next: resume, cancel) » ; rétablir la ligne, relancer la même commande et la lire verte
- Tient : `test/v2-kernel/cancel-only-stops.test.ts`, « un protocole dont le contrôle `unit` n'est pas qualifié s'arrête `capability_missing`, et la prochaine action de `/495 status` commence par `blocked: capability_missing — CAPABILITY_MISSING: protocol not frozen: ` et finit par `(next: cancel)` »
- Rouge : le code tient la promesse et aucun test ne la lit ; `test/v2-kernel/preparation.test.ts` atteint cet arrêt mais ne lit que les raisons de `stop_detail` ; sondé sur `main` à 19d72e4 : la prochaine action de cet arrêt finit par « (next: cancel) », et la mutation ci-dessus laisse passer `test/v1-adapters`, `test/v2-kernel` et `test/v3-pi`

### Tâche 3 — Un test lit la sortie de l'arrêt sur un cycle de rapports

Dans `test/v2-kernel/verification.test.ts`, un test donne à `orderOf` du coordinateur de vérification
(`coordinatorOver`) deux contrôles `x` et `y`, `x` écrivant le rapport `a` et lisant `b`, `y` l'inverse,
et lit le `toText()` de l'erreur levée, le texte que le harnais inscrit au détail de l'arrêt
(`src/application/harness.ts`). Aucun adaptateur de pile ne déclare de cycle, si bien que le
coordinateur est le seul point où un test l'atteint. Aucun code ne change.

- Vérifie à la main : écrire le test ; remplacer `{ nextActions: ["cancel"] }` par `{ nextActions: ["prepare_capabilities"] }` à l'arrêt « controls declare a cycle of reports » de `src/application/verification.ts`, lancer `node --test test/v2-kernel/verification.test.ts` et lire l'échec sur le texte qui finit par « (next: prepare_capabilities) » ; rétablir la ligne, relancer la même commande et la lire verte
- Tient : `test/v2-kernel/verification.test.ts`, « deux contrôles dont chacun lit le rapport de l'autre sont refusés avec le texte `CONFIGURATION_ERROR: controls declare a cycle of reports: x, y (next: cancel)` »
- Rouge : le code tient la promesse et aucun test ne la lit ; aucun test n'appelle `orderOf` (seul `orderControls` du domaine est testé, dans `test/v1-adapters/control-runner.test.ts`) ; sondé sur `main` à 19d72e4 : la mutation ci-dessus laisse passer `test/v1-adapters`, `test/v2-kernel` et `test/v3-pi`

## 5. Hors périmètre

- Le quatrième arrêt que l'entrée nomme, la préparation qui ne peut pas tourner après deux essais :
  il n'existe plus, une exigence qu'aucun test ne peut juger après deux préparations est posée au
  propriétaire comme une décision en attente (d11e940).
- Le retrait d'IH-07 de l'arrêt sur le budget de durée épuisé : `test/v2-kernel/increment-budget.test.ts`
  le tient depuis e28s10 ; sondé à 19d72e4, remettre `["request_decision:IH-07"]` au refus de
  `interventionStart` fait échouer ce test sur le texte exact de la prochaine action.
- Les autres arrêts qui ne nomment que l'annulation (`src/application/intervention.ts`, le bac à sable
  non qualifié déjà tenu par `test/v2-kernel/harness.test.ts`) : l'entrée ne les nomme pas.
- BUG-2026-10-03T073952 : qu'un projet dont `scripts.test` nomme un lanceur illisible s'arrête sans état
  des lieux reste à sa propre story ; cette story ne lit que la sortie de cet arrêt.
- La traduction du texte de ces arrêts dans une session en français : il reste en anglais.
