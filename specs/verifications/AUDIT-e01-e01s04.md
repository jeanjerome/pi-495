# Auto-revue — e01s04, une réponse donnée par erreur se révoque

| | |
|---|---|
| Périmètre | `git diff main...HEAD` (`e97cefe..87e7094`), puis les corrections `d0a9a55` à `09aebe2` ; code de production : `src/domain/change/{commands,events,decide,apply}.ts`, `src/domain/invalidation.ts`, `src/application/{artifacts,harness}.ts`, `src/application/phases/{clarify,implement,prepare,verification-design}.ts`, `src/export/export-service.ts`, `src/extension/command.ts` |
| Conduite le | 2026-09-28 |
| Branche | `une-reponse-donnee-par-erreur-se-revoque` |
| Mode | complet |
| Preflight au moment de la revue | verte à `422ba3c` avant toute correction (`e01s04-cycle-rouge-vert.md`), puis sur l'arbre de `09aebe2` sous Node 24.21.0, 2026-09-28T00:05:58Z à 00:08:48Z — `npm run build` puis `npm run check`, sortie 0, 551 tests ; Biome, 0 avertissement |

Classement par nombre de commits sur 90 jours, fichiers de code : `src/application/harness.ts` (44),
`src/domain/change/decide.ts` (17), `test/v0/change-rules.test.ts` (14),
`src/domain/change/commands.ts` (12), `src/application/phases/clarify.ts` (11),
`src/domain/change/events.ts` (10), `src/application/artifacts.ts` (10), puis
`src/domain/change/apply.ts` (7). Les fichiers de production ont été lus en premier, dans cet ordre.

## Ce que cette revue a corrigé avant son rapport

La branche ramène pour la première fois un changement construit jusqu'à son candidat en
clarification. Le noyau défait les gates, les adoptions, les preuves et les décisions, par le plan
de la révision du mandat. Mais la pause et la tentative ouverte ne sont pas dans ce plan, et
l'application lit d'autres historiques que l'état adopté. La tâche 3 coupait les rapports de
spécification à la dernière révocation ; les autres historiques n'étaient pas coupés. Cinq défauts
en venaient, tous atteignables par la seule branche. Chacun a son test, rouge au commit de test seul
et vert au correctif, rejoués en arbre détaché (`e01s04-cycle-rouge-vert.md`, tâches 6 et 7).

- **La pause perdue** (`3660d54`). La révocation entrait en clarification en `ready`, puis la
  demande IH-01 mettait le changement en `decision_required`. Un changement en pause cessait de
  l'être, et la réponse du propriétaire lançait la réécriture que sa pause retenait. Répondre ou
  clore une question, eux, laissent la pause. La révocation la reprend désormais par la commande de
  pause du noyau, dont le point de reprise est la décision IH-01. Le §6j et le §16 de la story le
  disent.
- **La tentative de la réponse révoquée reprise** (`3660d54`). Un producteur démarré puis arrêté
  laisse sa tentative ouverte. Après la révocation, le noyau inscrivait le producteur reconstruit
  sous cette tentative, et l'application le faisait travailler dans son espace de travail, préparé
  et écrit pour la réponse révoquée. La révocation close désormais la tentative ouverte, en
  `superseded`.
- **Le retour de correction mesuré sur la réponse révoquée** (`5396369`). `implement` donnait au
  producteur le dernier retour de correction du changement. Le producteur reconstruit recevait
  donc « requirement REQ-400: FAIL (unit=FAIL) ». Le retour ne va plus qu'à la tentative que la
  correction ouvre.
- **La préparation dite refusée, et ses tours épuisés** (`5396369`). La préparation reconstruite
  apprenait que « la préparation précédente a été refusée », d'une préparation adoptée. Et les
  préparations adoptées comptaient dans les deux tours : à la deuxième révocation, le changement
  s'arrêtait en `capability_missing` sans rien préparer. Les préparations sont coupées à la dernière
  révocation, par la lecture du journal qui coupe déjà les rapports de spécification.
- **L'espace de travail d'un producteur qui n'a pas démarré** (`5396369`). Refusé pour son modèle,
  un producteur laisse un espace de travail préparé, que la reprise réutilise. Le commentaire de
  `unstartedAttempt` annonçait qu'un retour arrière rendrait cette réutilisation fausse : la
  révocation en est un. L'espace enregistre désormais la préparation qui y a été écrite, et n'est
  repris que si elle est encore celle adoptée.
- **La lecture du journal écrite deux fois** (`5396369`). Couper les préparations aurait recopié la
  coupure des rapports. `proposedSinceRevocation` la porte pour tout genre d'artefact, et
  l'historique de la spécification la lit. `specification-reopening.test.ts` passe inchangé.
- **Une règle recopiée** (`09aebe2`). `decision.withdrawn` recopiait la fin de `decision.recorded`.
  `withoutPending` la porte une fois. Aucun comportement ne change.
- **Une cible de test recopiée** (`5b7f0af`). La cible sans tests et les fichiers de `shout` passent
  de `test/v2/preparation.test.ts` à `test/helpers/fixtures.ts`, que le nouveau test importe aussi.

## Chaîne d'approvisionnement et sécurité

- ✓ Aucune dépendance ajoutée. `package.json` et `package-lock.json` sont inchangés.
- ✓ Aucun secret dans le diff. Aucune occurrence de `sk-`, `ghp_`, `AKIA` ni de clé privée.
- ✓ OWASP. La seule entrée nouvelle est l'identifiant tapé après `/495 revoke`. Le noyau le compare
  à l'égalité exacte aux questions du changement. Il n'atteint ni un shell ni une requête SQL
  construite, et n'est renvoyé qu'à la session qui l'a tapé.
- ✓ Contrôle d'accès (M3, M4). La révocation passe par `humanProvenanceIssue`, la vérification de
  la réponse à une décision et de la clôture. `decision.revoke`, qui ne vérifiait que l'origine, a
  disparu. La révocation désigne la question, et la décision révoquée est celle que le noyau a
  associée à la question. `harness495` n'offre aucune révocation, et
  `test/v3/question-closure.test.ts` l'épingle.
- ✓ Aucun constat HIGH. Les vérifications des tâches 1 à 4, écrites quand chacune a basculé,
  n'en retiennent aucun. Celles des tâches 6 et 7 non plus : aucune ne touche un chemin de
  provenance. Aucune exception n'est nécessaire, et `specs/security/EXCEPTIONS.md` n'existe pas.

## Provenance

- ✓ `e01s04-tasks.yaml` porte `type: feat` et `context: domain`.
- ✓ Les commits de chaque tâche, rouge et vert, sont cités dans `e01s04-cycle-rouge-vert.md`, y
  compris ceux des tâches 6 et 7.

## Loi de Déméter

- ✓ Aucune chaîne à travers des objets étrangers. `ctx.artifacts.proposedSinceRevocation(unit.state, …)`
  et `rt.harness.revokeQuestion(…)` suivent la forme des autres appels des phases et des
  sous-commandes.

## Conformité à CONVENTIONS.md

- ✓ Les relevés vont dans `specs/`. Aucun `gh issue create`, aucun appel direct à l'API GitHub.
- ✓ La révocation naît dans `domain/` (commande, événements, `apply`). L'application la conduit, et
  seule `extension/` touche Pi. `lint:layers` et `lint:architecture` sont verts.
- ✓ Aucun identifiant `CMP-*` nouveau, comme le §8 de la story l'annonce.

## Périmètre

- ✓ Le code de production touché est celui que le §20 de la story nomme. Les tâches 6 et 7 y
  ajoutent `implement.ts`, `prepare.ts` et `verification-design.ts`, que le §20 nomme désormais.
- ✓ Aucune fonction spéculative. Aucun état ni refus nouveau : la pause reprend la commande du
  noyau, la tentative est close par l'événement existant, et l'espace de travail enregistre un fait
  que son seul lecteur compare.
- ✓ Aucun défaut de gate découvert : Preflight était verte avant la première correction.

## Règle du scout

- ✓ Aucun code mort. Biome : 0 avertissement sur `src/`, `test/` et `scripts/` (compté, pas
  seulement lu au code de sortie). Aucun code commenté.
- ✓ Le commentaire de `unstartedAttempt`, que la branche rendait faux, dit désormais la condition
  réelle de la réutilisation.

## Types et sûreté

- ✓ Aucun `any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable` ni `biome-ignore` ajouté.
- ⚠ `as unknown as ExtensionAPI` et ses pareils font passer les faux de Pi pour ses types, dans
  `test/helpers/command-fixture.ts` et `test/v3/answer-revocation.test.ts`, comme
  `test/v3/question-closure.test.ts` le faisait. Rien de tel dans `src/`.
- ⚠ `PreparedWorkspace.preparation_id` est optionnel : un espace de travail enregistré par une
  version publiée n'en porte pas. Il n'est repris que si aucune préparation n'est adoptée, ce qui
  est sûr : au pire, une copie du projet de plus.

## Couverture des tests

- ✓ Chaque fonction nouvelle a son test, par l'interface publique : `questionRevoke`,
  `requireRevocable` et `withoutPending` par les commandes du noyau (`change-rules.test.ts`) ;
  `revokeQuestion`, `currentSpecification`, `proposedSinceRevocation` et `unstartedAttempt` par le
  harnais (`test/v2/answer-revocation.test.ts`) ; `actOnQuestion` par une vraie session
  d'extension (`test/v3/answer-revocation.test.ts`, `question-closure.test.ts`).
- ✓ Les cinq défauts de cette revue ont chacun leur test de régression, rouge seul à `d0a9a55` ou à
  `5b7f0af`.
- ✓ F.I.R.S.T. Chaque test crée son dépôt et son dossier temporaires et les supprime.
  `test/v3/answer-revocation.test.ts` sauve et rétablit les variables `HARNESS495_*`. Les faux de Pi
  sont des classes (`FakeContext`).

## SOLID et heuristiques

- ✓ `requireRevocable` dit si la révocation est admise ; `questionRevoke` émet ; `apply` inscrit.
  `questionRevoke` passe ainsi de 48 à 36 lignes, tâche 6 comprise.
- ✓ La commande nouvelle suit le patron du noyau : un membre de l'union, un cas du `switch`, dont
  le `never` garantit l'exhaustivité. La cause `resolution_revoked` réutilise le plan de la révision
  du mandat, au lieu d'en recopier la liste.
- Odeurs de Fowler : *Duplicated Code* (`decision.withdrawn`, la coupure du journal, la cible de
  test) est corrigé. *Long Function* reste, voir le style.

## Style

- ⚠ `src/extension/command.ts` passe de 346 à 381 lignes. `/495 close` et `/495 revoke` partagent
  désormais `actOnQuestion` au lieu d'un bloc recopié ; le reste du fichier est la fonction
  d'enregistrement de toutes les sous-commandes, que ni la story ni un défaut ne demande de couper.
- ⚠ `src/domain/change/decide.ts` (1 702), `src/application/harness.ts` (1 005) et
  `src/domain/change/apply.ts` (446) dépassaient déjà 300 lignes sur `main`.
- ⚠ `questionRevoke` (36 lignes) et `requireRevocable` (22) dépassent 20 lignes, comme les autres
  commandes du noyau : chaque ligne est une émission ou un refus nommé.
- ✓ `proposedSinceRevocation`, `requireRevocable`, `withoutPending`, `PreparedWorkspace` et
  `actOnQuestion` sont uniques dans le dépôt.
- ✓ Les commentaires ajoutés disent pourquoi : la tentative ouverte porte un espace écrit pour la
  réponse révoquée, un retour mesuré avant la révocation l'a été sur elle, la pause est au
  propriétaire.

## Points laissés à la relecture

- Après une révocation, et jusqu'à ce que la spécification réécrite propose ses exigences, le
  rapport d'ingénierie liste sous « Exigences » celles de la dernière proposition, donc celles de la
  réponse révoquée. Il en va de même après un refus à G1 sur `main` : le rapport lit la dernière
  proposition, pas l'adoption. Le rapport garde aussi le candidat d'avant la révocation, dont les
  preuves sont invalidées. Rien de cela n'est adopté ni ne fonde une gate. La relecture dira s'il
  faut couper le rapport à la révocation.
- Le budget de tentatives et celui de durée ne sont pas rendus par une révocation (§18). Chaque
  construction consomme donc une tentative : sous `max_attempts: 3`, un changement révoqué deux fois
  après son candidat en est à sa dernière.

## Rationalisations repérées

- « Le noyau défait tout ce que défait la révision du mandat, donc la reconstruction repart de
  zéro » : le plan de la révision du mandat n'avait jamais été atteint en production, et il ne
  couvre ni la pause, ni la tentative, ni ce que l'application lit hors de l'état adopté. Cherché
  historique par historique.
- « Le retour d'une correction n'est que du texte donné au modèle » : c'est un contexte mesuré sur
  une exigence que le propriétaire a révoquée. Corrigé.
- « Deux tours de préparation, c'est un budget, et la story dit qu'une révocation ne rend pas le
  budget » : le §18 parle des tentatives. Les tours de préparation bornent « le même manque », et
  le changement reconstruit prépare pour des exigences qui ne sont plus les mêmes.
- « L'espace de travail d'un producteur qui n'a pas démarré est un cas rare » : il suffit d'un
  modèle refusé par la vérification des capacités, puis d'une révocation. Corrigé.
- `command.ts` au-delà de 300 lignes est laissé, avec la raison donnée au style. C'est un choix,
  pas un oubli.

## Verdict

PASS après correction. Suite : `request-review`.
