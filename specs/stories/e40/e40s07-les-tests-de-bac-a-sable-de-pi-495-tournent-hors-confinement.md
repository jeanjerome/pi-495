# Les tests de bac à sable de pi-495 tournent dans un contrôle hors confinement, et le dogfooding atteint l'intégration avec toute sa suite

Story : e40s07
Epic : e40
Statut : versée

## 1. Ce que le lecteur gagne

Le propriétaire de pi-495 qui fait conduire un changement de pi-495 par pi-495 le voit jugé par toute sa suite.
Aujourd'hui, le contrôleur stable ne lance que `test/v0-pure` et `test/cycle` : les générations `v1` à `v4` ne sont
jugées que par la Preflight, hors de 495, et « un dogfooding ne les compte pas comme passées ». Mesuré le 12 octobre à
`01c0ab8a`, chaque génération lancée sous Seatbelt comme le noyau lance un contrôle : `v2-kernel` passe entièrement
(494 tests, 2 min), et seuls 38 fichiers échouent — 6 de `v1-adapters`, 10 de `v3-pi`, 22 de `v4-platform` — parce
qu'ils lancent un bac à sable, ou l'extension qui en lance un, et que Seatbelt refuse un second profil.

Le contrôleur stable déclare désormais deux contrôles de suite : `test`, confiné, qui lance toute la suite de
`npm run test` sauf ces 38 fichiers, et `test-sandbox`, que le propriétaire déclare hors confinement (e40s06) et qui
lance ces 38 fichiers et eux seuls, nommés un par un. Un fichier de test qu'un candidat ajoute tourne confiné ; s'il
démarre un bac à sable, il y échoue et bloque le changement tant que le propriétaire ne l'a pas ajouté à la liste.

Deux défauts empêchaient ce jugement de valoir quelque chose :
- un contrôle déclaré qui échoue déjà sur la référence passait G5 sur le candidat comme un constat préexistant toléré
  (`BUG-2026-10-12T222000`). Le propriétaire a tranché le 12 octobre : un contrôle déclaré doit passer sur le candidat,
  et un échec qu'il partage avec la référence le fait échouer ;
- l'agent qui prépare les tests les range où l'usage de pi-495 les range, sous `test/v2-kernel/`, où la suite bornée
  ne les lance jamais : la suite préparée est INDETERMINATE et le changement s'arrête avant G2
  (`BUG-2026-10-11T105300`). Le propriétaire a tranché de tenir l'agent plutôt que d'élargir la borne au noyau, qui
  ferait relancer 494 tests de plus à chaque mutant : le mandat de préparation nomme les fichiers que la suite lance,
  et un fichier de test écrit ailleurs n'est pas retenu, avec la raison.

## 2. Promesses

Scenario: Un contrôle déclaré qui échoue déjà sur la référence fait échouer G5
  Given un projet dont un contrôle que le propriétaire déclare échoue sur la référence comme sur le candidat, et dont un test détecté échoue déjà sur la référence
  When le changement atteint G5
  Then l'évidence du contrôle déclaré sur le candidat est FAIL sans note de tolérance, G5 échoue en disant « declared control own-check: FAIL », et le test détecté qui échouait déjà reste un constat préexistant toléré

Scenario: Un test préparé que la suite bornée ne lance pas n'est pas retenu, et l'agent sait où écrire
  Given une configuration du contrôleur qui borne la suite à `test/*.test.js`
  When la préparation écrit son test sous `test/v2-kernel/`
  Then le dossier de la préparation ne retient pas ce fichier et dit qu'il n'est pas retenu parce que la suite ne le lance pas, en nommant la borne, et le mandat de préparation nomme les fichiers que la suite lance

Scenario: Chaque fichier de la suite de pi-495 est jugé par un et un seul contrôle du dogfooding
  Given la configuration du contrôleur stable
  When on lit chaque fichier que `npm run test` lance
  Then chacun est lancé soit par `test`, confiné, soit par `test-sandbox`, hors confinement, jamais par les deux ni par aucun, `test-sandbox` nomme ses fichiers un par un et est le seul contrôle déclaré hors confinement

Scenario: Le dogfooding de pi-495 atteint l'intégration avec toute sa suite jugée
  Given le contrôleur stable de la branche et un changement réel de pi-495 écrit par un agent scripté
  When le lanceur du dogfooding le conduit dans un vrai Pi
  Then le changement est intégré, `test` et `test-sandbox` sont PASS sur le candidat, et le verdict G5 nomme `test-sandbox` comme exécuté hors confinement sur décision du propriétaire

## 3. Sécurité

`test-sandbox` lance hors confinement le code du candidat que ces 38 fichiers importent : il lit `~/.ssh` et les
identifiants de l'hôte, a le réseau et écrit partout où écrit le propriétaire. C'est ce que `D-90` accepte et ce que la
Preflight fait déjà sur la machine du propriétaire ; l'évidence et le verdict le nomment (e40s06).

Le candidat n'étend pas ce contrôle :
- ses fichiers sont nommés un par un dans la configuration du contrôleur, hors de la copie : aucun motif ne fait
  tourner hors confinement un fichier que le candidat ajoute ou renomme ;
- `test/`, `scripts/`, `package.json` et le dossier de cette configuration sont protégés pour lui comme pour `test` :
  l'implémentation ne modifie ni ne supprime un fichier existant de ces chemins, ni l'un des 38, ni une aide de
  `test/`, ni la configuration que lit le test de partition. Elle peut y ajouter un fichier : un test de `test/` qui ne porte pas l'un des 38 noms tourne confiné ;
- `test` exclut ces fichiers par leur nom ; un fichier du même nom ailleurs sous `test/` ne tournerait nulle part, ce
  que le test de partition refuse.

Ce que la protection ne couvre pas, et que `D-90` accepte au même titre que `src/` : le code hors de ces chemins que
les 38 fichiers importent ou lancent — `src/`, `examples/fictitious-technology/` — est celui du candidat, et une
préparation peut mettre à jour un test existant, l'un des 38 compris, que `test-sandbox` lance alors tel qu'elle l'a
écrit, hors confinement.

Un contrôle déclaré n'est plus jamais tenu pour passé sur un échec qu'il partage avec la référence : un contrôle hors
confinement qui échoue des deux côtés ne passe plus G5 sans avoir rien jugé.

Tenir la préparation à la borne ne donne aucun droit : le fichier écarté n'est ni retenu ni lancé, et les chemins où la
préparation peut écrire restent ceux de la technologie. Ce qu'est un fichier de test se lit sur le projet, jamais sur la
copie de l'agent, et la borne ne se lit comme des fichiers que sous `node --test` : vitest et jest lisent leurs
arguments comme des filtres, et aucun fichier n'y est écarté.

## 4. Tâches

### Tâche 1 — Un contrôle déclaré ne passe pas sur un échec qu'il partage avec la référence

`Verification.run` (`src/application/verification.ts`) compare un contrôle que le protocole gelé nomme dans
`project_control_ids` à sa passe sur la référence sous la tolérance `block_any` : son échec reste un échec, et sa note
de tolérance disparaît. Les contrôles détectés gardent la tolérance du protocole. Le test, dans
`test/v2-kernel/change-on-failing-project.test.ts`, conduit jusqu'à G5 un changement sur le projet dont
`test/farewell.test.js` échoue déjà, sous une politique qui déclare `own-check`, une commande qui sort en 1.

- Vérifie : `node --test test/v2-kernel/change-on-failing-project.test.ts`
- Tient : `test/v2-kernel/change-on-failing-project.test.ts`, « un contrôle déclaré qui échoue sur la référence comme sur le candidat est FAIL sur le candidat sans note de tolérance, G5 échoue sur declared control own-check: FAIL, et test/farewell.test.js reste un constat preexisting toléré par unit »
- Rouge : `compareToReference` reçoit la tolérance `no_aggravation` du protocole pour tout contrôle ; l'évidence de `own-check` est PASS avec « 1 preexisting finding(s) tolerated » et G5 passe.

### Tâche 2 — La préparation est tenue aux fichiers que lance la suite bornée

Quand la configuration du contrôleur borne la suite (`policy.suite_paths`), `preparationMandateObjective`
(`src/application/context.ts`) nomme ses motifs : seuls les fichiers de test qui y répondent sont lancés et retenus.
`preparedFilesFrom` (`src/application/preparation.ts`) ne retient pas un fichier de test que la préparation ajoute, que
la technologie reconnaît et qu'aucun motif ne couvre, et la phase de préparation (`src/application/phases/prepare.ts`) l'inscrit dans les notes :
« test file the bounded suite does not run, not retained: <chemin> (the suite runs <motifs>) ». Un fichier qui n'est
pas un test, une aide importée par exemple, reste retenu, comme un test existant que la préparation met à jour : le
contrôle déclaré de la cible le lance. Le test, dans `test/v2-kernel/preparation.test.ts`, conduit
une préparation qui écrit `test/v2-kernel/shout.test.js` sous une borne `test/*.test.js`.

- Vérifie : `node --test test/v2-kernel/preparation.test.ts`
- Tient : `test/v2-kernel/preparation.test.ts`, « sous une borne test/*.test.js, une préparation qui écrit test/v2-kernel/shout.test.js ne le voit pas retenu, le dossier dit que la suite bornée ne le lance pas en nommant la borne, et le mandat nomme les fichiers que la suite lance »
- Rouge : `preparedFilesFrom` retient tout fichier sous `test/` ; le fichier est retenu, jamais lancé, et la suite préparée est INDETERMINATE (« no test was executed ») ; le mandat ne nomme que `test/, tests/`.

### Tâche 3 — Le contrôleur stable juge toute la suite de pi-495, en deux contrôles

`specs/experiments/e38/dogfood/config.json` déclare `test`, confiné, sur `test/**/*.test.ts` moins les 38 fichiers
mesurés, exclus par leur nom, et `test-sandbox`, `unconfined: true`, qui lance ces 38 fichiers nommés un par un, avec
les mêmes chemins protégés et `requires: ["dist"]`. Le README du dossier dit ce qui tourne où et pourquoi. Le test, dans
`test/v4-platform/dogfood-controls.test.ts`, lit la configuration et l'arbre de `test/`.

- Vérifie : `node --test test/v4-platform/dogfood-controls.test.ts`
- Tient : `test/v4-platform/dogfood-controls.test.ts`, « chaque fichier de test que npm run test lance est lancé par test, confiné, ou par test-sandbox, hors confinement, et par un seul des deux ; test-sandbox nomme ses fichiers un par un et il est le seul contrôle déclaré hors confinement »
- Rouge : la configuration ne déclare pas `test-sandbox`, et `test` ne lance que `test/v0-pure` et `test/cycle` : les fichiers de `v1` à `v4` ne sont lancés par aucun contrôle.

## 5. Hors périmètre

- **Élargir la suite qui juge les exigences** (`unit`) au noyau : la mutation y relancerait 494 tests par mutant, plus
  d'une heure de chaque côté (arbitrage du propriétaire du 12 octobre).
- **Détecter qu'un test démarre un bac à sable** : la liste est celle que le propriétaire écrit et mesure.
- **Une campagne sous un vrai modèle** : la recette conduit le vrai lanceur avec un agent scripté (arbitrage du
  propriétaire du 12 octobre).
- **Linux** : la liste est mesurée sous Seatbelt ; bubblewrap s'emboîte autrement, et la VM de qualification lance
  toujours `npm run test:v4`.
- **La tolérance des contrôles détectés** ne change pas.
