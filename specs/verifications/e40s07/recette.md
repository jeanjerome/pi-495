# Recette — toute la suite de pi-495 jugée par son dogfooding, les tests de bac à sable hors confinement

Story `e40s07`, branche `e40s07`, menée du 12 au 13 octobre 2026 sans l'outil du cycle, sur décision du propriétaire :
rouge avant le code tâche par tâche, deux relecteurs indépendants, recette réelle, versement à la main après son accord.

## Arbitrages du propriétaire, avant le code

Après une mesure de chaque génération sous Seatbelt, lancée comme le noyau lance un contrôle, sur une copie jetable de
`main` à `01c0ab8a` : `v0-pure`, `test/cycle` et `v2-kernel` (494 tests, 122 s) passent entièrement ; échouent 6
fichiers de `v1-adapters` (24 s), 10 de `v3-pi` (90 s) et 22 de `v4-platform` (1420 s). Lancés hors confinement, ces 38
fichiers passent : 150 tests, 116 s.

- Les 38 fichiers sont nommés un par un dans la configuration du contrôleur, pour `test-sandbox`, hors confinement :
  aucun motif que le candidat pourrait étendre.
- L'agent qui prépare est tenu aux fichiers que lance la suite bornée (`BUG-2026-10-11T105300`), plutôt que d'élargir
  `unit` au noyau : la mutation y relancerait 494 tests de plus à chaque mutant, plus d'une heure de chaque côté.
- Un contrôle déclaré doit passer sur le candidat : un échec qu'il partage avec la référence n'est plus toléré
  (`BUG-2026-10-12T222000`).
- La recette conduit le vrai lanceur du dogfooding avec un agent scripté, sans campagne sous un vrai modèle.

## Rouge-vert

| Tâche | Rouge, vu avant le code | Vert |
|-------|-------------------------|------|
| 1 — un contrôle déclaré ne passe pas sur un échec partagé | `own-check` : `actual: 'PASS'`, attendu `'FAIL'`, note « 1 preexisting finding(s) tolerated » | `4f4e4352` |
| 2 — la préparation tenue à la borne | `actual: ['test/v2-kernel/shout.test.js']`, attendu `[]` | `6c1ee2f5` |
| 3 — deux contrôles de suite au dogfooding | `actual: []`, attendu `['test-sandbox']` | `4d5bae83` |

Preflight verte à `4d5bae83` (1804 tests, 0 échec, 10 sautés), puis à `a7e2a6ea` (1807 tests, 0 échec, 10 sautés) après
les corrections de la relecture ; `e229e5da` ne change que du texte.

## Relecture

Deux relecteurs indépendants en lecture seule, en parallèle pendant la Preflight, sur `main...e40s07` : l'un sur la
justesse du noyau, l'autre sur la sécurité et la section 3. Aucun bloquant.

Premier tour, corrigé rouge puis vert :
- la borne était lue comme des motifs de fichiers pour toute suite Node, alors que vitest et jest lisent leurs arguments
  comme des filtres : un test préparé que vitest lance aurait été écarté. La technologie dit désormais quels motifs sa
  suite lit comme des fichiers (`suiteFilePatterns`, seulement `node --test`), et un `./` en tête est retiré
  (`f7f375fd`) ;
- le rapport disait « la tolérance les a laissés passer » d'un contrôle déclaré jugé sans tolérance (`f7f375fd`) ;
- la configuration que lit le test de partition n'était protégée par aucun contrôle : un candidat pouvait la réécrire
  pour faire passer ce test sur sa copie (`a7e2a6ea`) ;
- ce qu'est un fichier de test se lisait sur la copie de l'agent, qu'il pouvait rendre méconnaissable en effaçant
  `package.json` (`a7e2a6ea`) ;
- la section 3 surestimait la protection : un fichier peut être ajouté sous un chemin protégé, `src/` et `examples/`
  sont le code du candidat, et une préparation peut mettre à jour un test existant, l'un des 38 compris (`a7e2a6ea`).

Second tour : rien sur le code ; une phrase inexacte corrigée (`e229e5da`).

## Recette réelle

### Le dogfooding intègre avec toute la suite jugée

`node cycle/src/dogfood.ts --objectif "<la demande d'e40s05>" --controleur e229e5da --candidat e229e5da`, vrai Pi 1.0.4,
avec `HARNESS495_SCRIPTED_AGENT` : l'agent scripté rejoue le changement réel que la campagne d'e40s05
`dogfood-20261012T163907` a intégré sous Sonnet — sa spécification, sa préparation et son implémentation, lues dans ce
dossier, et les fichiers de son commit intégré, passés au formateur du dépôt. Banc :
`~/.495-campagnes/scripts/e40s07-agents.mjs`.

`dogfood-20261012T215825` (25 min) : **intégrée**, `status completed`, G0 à G6 PASS, les douze contrôles PASS sur le
candidat, contrôleur relu identique à la fin, aucun défaut (`releve-dogfood-20261012T215825.json`). Dans le dossier :

| Contrôle | Référence | Candidat | Bac à sable |
|----------|-----------|----------|-------------|
| `test` | PASS, 132 s | PASS, 130 s : 1670 tests, 1660 passent, 10 sautés | `seatbelt` |
| `test-sandbox` | PASS, 113 s | PASS, 105 s : 151 tests, tous passent | `unconfined`, note « ran outside confinement, by the owner's decision » |

1670 + 151 = 1821, les 1807 tests de la Preflight et les 14 du test préparé. Les 10 sautés sont ceux de la Preflight,
nom pour nom : des tests propres à Linux et `F-JAVA`, aucun test TLC ou Lean. G5 PASS a pour seule raison « declared
control test-sandbox ran outside confinement, by the owner's decision ».

Un premier essai (`dogfood-20261012T213529`) s'est arrêté à la main : le test repris d'e40s05 n'était pas au format
qu'exige aujourd'hui biome, et `lint-code` échouait sur le candidat. Faute du banc, corrigée en passant chaque fichier de
l'agent au formateur.

### Témoins négatifs : un candidat qui casse ce que seul un test de bac à sable vérifie

Le candidat cassé porte le même changement, plus une suppression dans `src/adapters/execution/runner.ts` : l'évidence
d'un contrôle hors confinement ne dit plus « ran outside confinement, by the owner's decision ». Seul
`test/v1-adapters/unconfined-control.test.ts`, l'un des 38, le vérifie. La rupture est une suppression : elle
n'introduit aucune ligne qu'un mutant de la suite bornée laisserait survivre. Agent `e40s07-agent-casse2.json`.

| Campagne | Contrôleur | Issue |
|----------|------------|-------|
| `dogfood-20261012T232710` | `main` (`01c0ab8a`) | **intégrée**, G0 à G6 PASS, neuf contrôles déclarés, aucun `test-sandbox` ; le `runner.ts` intégré n'a plus la note (`releve-temoin-negatif-main-dogfood-20261012T232710.json`) |
| `dogfood-20261012T234526` | tête (`e229e5da`) | **G5 FAIL**, une seule cause : « declared control test-sandbox: FAIL ». Sur le candidat, `mutation` PASS, `test` PASS (confiné), `test-sandbox` FAIL, confirmé par une seconde passe ; sur la référence, les deux contrôles de suite passent. Campagne arrêtée à la main après ce verdict : les essais suivants rejouaient le même candidat. |

Une première paire de témoins (`dogfood-20261012T222414` sous la tête, `…T222419` sous `main`) reformulait la note au
lieu de la supprimer. La ligne reformulée a fait échouer la mutation sous les deux contrôleurs, si bien que `main`
non plus n'intégrait pas. Sous la tête, G5 nommait pourtant déjà « declared control test-sandbox: FAIL » : sur le
candidat, 150 tests passaient et 1 échouait, celui de `unconfined-control`, et une seconde passe le confirmait. Les
deux campagnes, lancées ensemble, ont dépassé l'heure qu'accorde le pilote à une reprise et sont mortes sans relevé :
défaut antérieur, inscrit `BUG-2026-10-13T012800`.

### La préparation tenue à la borne, et l'échec partagé d'un contrôle déclaré

Vrai Pi 1.0.4 en RPC, extension construite à la révision, cible greet d'e40s06, agent scripté, `/495 start add shout and
whisper beside greet`. Banc : `~/.495-campagnes/scripts/e40s07-run.sh`.

| Run | Construction | Réglage | Observé |
|-----|--------------|---------|---------|
| `e40s07-noyau1` | tête `e229e5da` | borne `test/*.test.js` ; la préparation écrit `test/v2-kernel/shout.test.js` | Le mandat dit « only the test files matching test/*.test.js run and are retained ». Les deux préparations ne retiennent aucun fichier, avec la note « test file the bounded suite does not run, not retained: test/v2-kernel/shout.test.js (the suite runs test/*.test.js) ». IH-04 est posé. |
| `e40s07-mainnoyau1` (témoin négatif) | `main` `01c0ab8a` | même réglage | Le fichier est retenu et ne tourne jamais. La suite préparée « passe » sur la référence sans rien prouver (« R1: no case of its own was observed »). IH-04 est posé. |
| `e40s07-confine1` | tête `e229e5da` | contrôle déclaré qui échoue confiné sur la référence comme sur le candidat (config d'e40s06) | Évidence FAIL sur le candidat, sans note de tolérance. G5 FAIL : « declared control sandbox-tests: FAIL ». Le même run à `024054d5` passait G5 en tolérant l'échec comme préexistant (`specs/verifications/e40s06/recette.md`). |

### Campagnes de référence, à `e229e5da`

- `npm run campagne -- npm` (`npm-20261012T231406`) : G0 à G4 PASS ; G5 FAIL sur la mutation du candidat, après trois
  essais du modèle. Verdict : « reference campaign: no defect of the harness ». La cible est sous vitest : la borne ne
  s'y applique pas, et aucun test préparé n'y est écarté.
- `npm run campagne -- maven` (`maven-20261012T232345`) : intégrée, G0 à G5 PASS, « no defect of the harness ».

La campagne npm a tourné pendant les deux premiers témoins de dogfooding, sur une machine chargée.

## Défauts

- `BUG-2026-10-12T222000` et `BUG-2026-10-11T105300` sont corrigés par cette story.
- Inscrit : `BUG-2026-10-13T012800` (low). Une campagne dont une seule reprise dépasse une heure meurt sans relevé.
