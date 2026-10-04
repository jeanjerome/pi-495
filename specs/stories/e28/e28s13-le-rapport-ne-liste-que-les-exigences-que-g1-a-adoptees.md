# Le rapport d'ingénierie ne liste que les exigences que G1 a adoptées

Story : e28s13
Epic : e28
Statut : à faire

## 1. Ce que le lecteur gagne

Corrige l'entrée BUG-2026-09-28T013100 du registre. Le propriétaire qui lance `/495 report` sur un
changement dont G1 a refusé les exigences lit aujourd'hui, sous « Requirements », le document que G1
vient de refuser, présenté comme les exigences du changement : le rapport lit les exigences par
`ArtifactRepository.latest`, qui retombe sur la dernière proposition quand rien n'est adopté, alors
que `RequirementLine` (`src/application/report.ts`) est définie comme une exigence adoptée. Le
lecteur du rapport prend pour engagement du changement ce que le noyau a écarté.

Le propriétaire, et quiconque relit le rapport d'un changement arrêté, gagnent une liste d'exigences
qui ne contient que ce que G1 a adopté, et qui dit « none » tant que rien ne l'est. C'est un défaut et
non une préférence : le rapport sépare ce qui est mesuré, conclu et non établi, et une proposition
refusée y figure aujourd'hui parmi ce qui est conclu.

## 2. Promesses

Scenario: Le rapport d'un changement que G1 refuse ne liste aucune exigence
  Given un changement dont la spécification lie la réponse à q1 à `REQ-400` et répète l'identifiant `REQ-400`
  And G1 l'a refusée pour `duplicate requirement id REQ-400`, sans rien adopter
  When le propriétaire lance `/495 report`
  Then les exigences du rapport d'ingénierie sont une liste vide
  And le rapport affiché dit « none » sous « ## Requirements »

Scenario: Le rapport d'un changement que G1 a accepté liste les exigences adoptées
  Given un changement sous `g5_human_acceptance` dont G1 a adopté `REQ-400` et qui attend la décision IH-10
  When le propriétaire lance `/495 report`
  Then les exigences du rapport d'ingénierie sont `REQ-400`

## 3. Sécurité

Sans objet : la story ne touche ni provenance, ni confinement, ni secrets, ni sortie de données ; le
noyau adopte et refuse les mêmes documents, seule la lecture des exigences par le rapport change.

## 4. Tâches

### Tâche 1 — Le rapport lit les exigences adoptées, et aucune quand rien ne l'est

`Harness.report` (`src/application/harness.ts`) lit les exigences que l'état du changement porte
adoptées (`state.adopted.requirements`) au lieu de `latest(state, "requirements")`, et passe `null` à
`engineeringReport` quand aucune ne l'est. La lecture du protocole et de l'état des lieux ne change
pas.

- Vérifie : `node --test test/v2-kernel/report-requirements.test.ts`
- Tient : `test/v2-kernel/report-requirements.test.ts`, « le rapport d'un changement qui attend IH-10 liste `REQ-400`, adoptée à G1 ; celui d'un changement dont G1 refuse une spécification qui répète `REQ-400` liste une exigence vide et `formatReport(report, "en")` porte « ## Requirements » suivi de « none » », monté comme `awaitingAcceptance` de `test/v2-kernel/answer-revocation.test.ts` (`makeHarness({ policy: { g5_human_acceptance: true } })`, `specificationRounds` et `specReport` de `test/helpers/harness-fixture.ts`), une spécification qui pose q1 puis une qui la lie à `REQ-400` (avec `[REQ-400, REQ-400]` pour le refus)
- Rouge : sondé sur `main` à 8e57266 avec le montage du refus de `test/v2-kernel/specification-reopening.test.ts` (6f) : G1 vaut `FAIL`, `state.adopted.requirements` est absent, et `harness.report` rend les exigences `REQ-422-MESSAGE`, `REQ-422-MESSAGE`, `REQ-UPDATE` du document refusé au lieu d'une liste vide

## 5. Hors périmètre

- Le protocole et l'état des lieux du rapport, lus eux aussi par `latest` : l'entrée ne porte que sur
  les exigences, et l'état des lieux est documenté comme « adopté ou dernier proposé ».
- Montrer dans le rapport les exigences proposées et refusées, sous leur propre titre : l'entrée
  attend une liste vide tant que rien n'est adopté, et ajouter une section serait un autre
  comportement.
- Les autres défauts ouverts du registre.
