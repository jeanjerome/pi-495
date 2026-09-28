# e01s04 — une réponse donnée par erreur se révoque

Relevé le 2026-09-28 sur `une-reponse-donnee-par-erreur-se-revoque`, sous Node 24.21.0. Chaque
commande de tâche est rejouée sur le commit de test seul, puis sur le commit qui le rend vert, chacun
dans un arbre de travail détaché, `node_modules` lié par symlink. Le script `verify-tdd-red-commit.sh`
juge le dépôt du paquet bigpowers, pas celui-ci.

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| Le noyau révoque la résolution d'une question matérielle, désignée par la question : la question est reposée par IH-01 dans la même décision, G0 et les gates suivantes, les adoptions et les décisions en attente hors IH-01 sont retirées ; refusée sans provenance humaine qualifiée et hors d'atteinte (tâche 1) | `cda78c3` — 5 échecs sur 70, un par cas | `a82c2cd` |
| Le harnais révoque la résolution d'une question pour le propriétaire et lui présente la question reposée par IH-01, sans lancer d'intervention ; le dossier exporté dit révoquée toute décision que l'état tient pour révoquée (tâche 2) | `787a9f4` — 2 échecs sur 2 | `e86ae15` |
| Après une révocation, aucun rapport de spécification écrit avant elle n'est repris ni hérité : la spécification est réécrite sur la nouvelle réponse ou la clôture, qui atteint les exigences adoptées à G1 et le protocole gelé à G2 (tâche 3) | `d439f01` — 2 échecs sur 28 | `41351f0` |
| `/495 revoke <question>` exige une liaison, une question, une session libre et une provenance humaine, confirme ce que la révocation défait, puis présente la question reposée ; un refus du noyau affiche son code, et l'aide nomme `revoke` (tâche 4) | `fd4c090`, corrigé à `3953245` — 6 échecs sur 16 | `422ba3c` |
| Une révocation laisse en pause un changement en pause, que sa reprise présente, et close la tentative restée ouverte, si bien que le changement reconstruit travaille dans une tentative à lui (tâche 6, auto-revue) | `d0a9a55` — 2 échecs sur 72 | `3660d54` |
| Le changement reconstruit après une révocation ne reçoit aucun retour de correction mesuré avant elle, prépare ses tests comme un premier tour et ne reprend aucun espace de travail préparé avant elle (tâche 7, auto-revue) | `5b7f0af` — 3 échecs sur 7 | `5396369` |
| Une révocation est refusée une fois le candidat accepté, garde valide une extension de budget accordée, et le changement reconstruit n'est jugé sur aucun candidat, historique ou relance d'avant elle (relecture, R1-2, R1-3, R1-8) | `2b66063` — 3 échecs sur 76 | `ec30acb` |
| Une qualification reprise ne note que la suite préparée jugée à côté d'elle (relecture, R1-10, et P2, antérieur) | `2b66063` — 1 échec sur 14 | `f2172d9` |
| Le changement reconstruit sans tentative restante demande une extension (IH-07) ; le rapport et la consigne de préparation ne lisent rien de proposé avant la révocation ; la question reposée est rangée avant d'être inscrite (relecture, R1-1, R1-4, R1-11) | `2b66063` — 4 échecs sur 14 | `3233666` |
| La question reposée après une révocation a pour sujet l'arbre sur lequel le changement a été ouvert, non le candidat que la révocation retire (relecture, R2-8) | `37c92a9` — 1 échec sur 94 | `f8c46d4` |

```
cda78c3 (test seul)      node --test test/v0/change-rules.test.ts   exit=1  (5 échecs sur 70)
a82c2cd (implémentation) node --test test/v0/change-rules.test.ts   exit=0  (70 sur 70)
787a9f4 (test seul)      node --test test/v2/answer-revocation.test.ts   exit=1  (2 échecs sur 2)
e86ae15 (implémentation) node --test test/v2/answer-revocation.test.ts   exit=0  (2 sur 2)
d439f01 (test seul)      node --test test/v2/answer-revocation.test.ts test/v2/specification-reopening.test.ts   exit=1  (2 échecs sur 28)
41351f0 (implémentation) node --test test/v2/answer-revocation.test.ts test/v2/specification-reopening.test.ts   exit=0  (28 sur 28)
fd4c090 (test seul)      node --test test/v3/answer-revocation.test.ts test/v3/question-closure.test.ts   exit=1  (6 échecs sur 16)
3953245 (test seul)      node --test test/v3/answer-revocation.test.ts test/v3/question-closure.test.ts   exit=1  (6 échecs sur 16)
422ba3c (implémentation) node --test test/v3/answer-revocation.test.ts test/v3/question-closure.test.ts   exit=0  (16 sur 16)
d0a9a55 (test seul)      node --test test/v0/change-rules.test.ts   exit=1  (2 échecs sur 72)
3660d54 (implémentation) node --test test/v0/change-rules.test.ts   exit=0  (72 sur 72)
5b7f0af (test seul)      node --test test/v2/answer-revocation.test.ts   exit=1  (3 échecs sur 7)
5396369 (implémentation) node --test test/v2/answer-revocation.test.ts   exit=0  (7 sur 7)
2b66063 (test seul)      node --test test/v0/change-rules.test.ts   exit=1  (3 échecs sur 76)
2b66063 (test seul)      node --test test/v2/answer-revocation.test.ts   exit=1  (5 échecs sur 14)
2b66063 (test seul)      node --test test/v3/answer-revocation.test.ts   exit=0  (7 sur 7)
ec30acb (implémentation) node --test test/v0/change-rules.test.ts   exit=0  (76 sur 76)
f2172d9 (implémentation) node --test test/v2/answer-revocation.test.ts   exit=1  (4 échecs sur 14, ceux de 3233666)
3233666 (implémentation) node --test test/v2/answer-revocation.test.ts   exit=0  (14 sur 14)
37c92a9 (test seul)      node --test test/v2/answer-revocation.test.ts test/v0/change-rules.test.ts   exit=1  (1 échec sur 94)
f8c46d4 (implémentation) node --test test/v2/answer-revocation.test.ts test/v0/change-rules.test.ts   exit=0  (94 sur 94)
```

Chaque échec du rouge est une assertion sur le comportement attendu, pas une erreur d'import ou de
chargement.

## Tâche 1

Au commit de test seul, `revokeResolution` conduit la révocation par la seule révocation du noyau,
`decision.revoke`, sur la décision qui avait résolu la question, comme le ferait une commande
seulement branchée. Au commit vert, elle passe par `question.revoke`. Les assertions ne changent pas.

| Cas | Échec au rouge |
| --- | --- |
| (a) étapes 1 à 5 | `Q1 has no answer any more` |
| (b) 6a | `Q1 is no longer closed` |
| (c) 6f | `a revocation from agent/tui_session/session is refused for its provenance` : `accepted` au lieu de `INVALID_PROVENANCE` |
| (d) 6h | `a revocation of q1 is refused (/cancelled/)` : le changement annulé accepte la révocation |
| (e) 6e | les décisions en attente sont `[IH-01 dec_q2]`, sans l'IH-01 qui repose Q1 |

Un test ne rapporte que son premier échec. Les sept refus de (d) ont donc été sondés un par un contre
`decision.revoke`, au même commit. Le changement annulé, la phase `integrating`, l'intervention qui
tourne et la vérification en cours sont acceptés. La question inconnue, la question non matérielle et
la question non résolue sont refusées en `UNKNOWN_REFERENCE human decision none does not exist`. Ce
motif ne nomme pas la question, et le code n'est pas le bon pour les deux dernières : ces trois refus
échouent aussi au rouge, alors que le plan les laissait aux mutations.

## Tâche 2

Le plan conduisait le rouge par `decision.revoke`, que la tâche 1 a retiré. Au commit de test seul,
`revoke` commet donc la commande du noyau `question.revoke` telle quelle, par `Harness.commit`, avec la
demande IH-01 construite comme la clarification la construit : c'est ce que ferait une commande
seulement branchée. Au commit vert, elle passe par `Harness.revokeQuestion`. Les assertions ne
changent pas.

| Test | Échec au rouge |
| --- | --- |
| la question reposée est présentée | `the one decision presented to the owner asks Q1 again` : `[]`. L'état tient l'IH-01 en attente, mais aucune demande n'est inscrite pour la présenter |
| le rapport et le dossier exporté | `the exported index says revoked the decision the state holds revoked` : `false` |

Le « (revoked) » du rapport, lu dans l'état, passe dès le rouge, comme le plan l'annonçait. Il en va
de même de l'absence d'intervention. Ces deux assertions restent aux mutations.

## Tâche 3

Les deux tests échouent sur la même assertion : aucune intervention de spécification n'est lancée
après la nouvelle résolution (`the specification is written again after the new answer`, puis
`after the close`). La clarification reprend le rapport qui liait Q1 à REQ-400 et le tient pour
établi. Sondée au même commit sans les deux assertions sur la réécriture, la suite du premier test
échoue sur `the requirements adopted at G1 bind 422 to the requirement written after it` : les
exigences adoptées lient « 422 » à REQ-400. Le mandat qui porte Q1 close avec l'acteur passe dès le
rouge : le rapport repris ne pose plus Q1, et la question close s'y ajoute. Cette assertion reste aux
mutations.

## Tâche 4

Au commit de test seul, `revoke` n'est pas une sous-commande : `/495 revoke q1` répond par la ligne
d'aide et n'inscrit rien.

| Test | Échec au rouge |
| --- | --- |
| confirmation acceptée | `the selection presented next asks Q1 again with its three outcomes` : aucune sélection |
| mode `print` | la sortie standard porte la ligne d'aide, sans « provenance humaine » |
| confirmation refusée | `the revocation is put to the owner before anything is inscribed` : aucune confirmation demandée |
| question inconnue | aucune sortie ne porte `495 error: UNKNOWN_REFERENCE` |
| session tenue | aucune sortie ne porte le refus de la session tenue |
| aide et description | la description de `/495` ne nomme pas `revoke` |

La confirmation refusée a son rouge, contrairement au plan : le test compte les confirmations
demandées, comme celui de 6k d'e01s03. L'absence d'intervention passe dès le rouge et reste aux
mutations.

À `fd4c090`, le test du mode `print` lisait les messages envoyés à Pi. En `print`, la session écrit
tout sur la sortie standard. Ce test ne pouvait donc pas passer, et son rouge ne disait rien. Le
premier vert l'a montré. Le code a été mis de côté, sans commit. `3953245` lit la sortie standard, et
le rouge rejoué montre la ligne d'aide. Le code a été repris ensuite.

Les faux de Pi et le changement arrêté sur Q1 de `question-closure.test.ts` passent dans
`test/helpers/command-fixture.ts`, que les deux fichiers importent. Les dix tests de la clôture
passent à chaque commit de la tâche. Au commit vert, `/495 close` et `/495 revoke` partagent une
même routine : liaison, question, session libre, provenance, confirmation, puis conduite.

Le README nomme `/495 close` et `/495 revoke` dans le tableau des commandes. Il ne nommait pas
`/495 close`.

## Tâches 6 et 7, trouvées à l'auto-revue

L'auto-revue a cherché ce que le changement reconstruit après une révocation lit encore de ce qui a
été construit avant elle. Le noyau défait les gates, les adoptions, les preuves et les décisions.
L'application lit d'autres historiques : les rapports de spécification, que la tâche 3 coupe déjà,
mais aussi les préparations, les retours de correction, la tentative ouverte et les espaces de
travail préparés. Chacun a son test, écrit d'abord.

| Test | Échec au rouge |
| --- | --- |
| (6a) un changement en pause, révoqué | `the owner's pause holds across the revocation` : `decision_required` au lieu de `paused` |
| (6b) la tentative ouverte avant la révocation | `the attempt opened on the revoked answer is closed` : `open` au lieu de `superseded` |
| (7) le producteur reconstruit après une correction | `the producer of the rebuilt change is not handed what was measured under the revoked answer` : son contexte porte « Feedback from the previous attempt », mesuré sur REQ-400 |
| (7) la préparation reconstruite | `the preparation of the change rebuilt on 422 is told of no refusal` : son contexte porte « The previous preparation was refused », d'une préparation adoptée |
| (7) l'espace de travail d'un producteur qui n'a pas démarré | `the producer of the rebuilt change works in a workspace prepared with the preparation adopted after the revocation` : le même chemin avant et après |

Un test ne rapporte que son premier échec. Deux suites ont donc été sondées au même commit :
- (6b) sans la première assertion : le noyau inscrit le producteur reconstruit sous `att_1`, la
  tentative de la réponse révoquée ;
- (7), la préparation, sans l'assertion sur le refus annoncé : à la deuxième révocation, le
  changement s'arrête en `capability_missing`, « no discriminant test could be prepared after two
  preparation interventions », alors que les deux préparations ont été adoptées.

`09aebe2` ne change aucun comportement : un seul endroit retire une décision de la liste des
décisions en attente, qu'elle soit enregistrée ou retirée. Les fichiers de la cible sans tests
passent dans `test/helpers/fixtures.ts`, que `test/v2/preparation.test.ts` importe aussi.

## Réponse au tour 1 de la relecture

Rejoué le 2026-09-28 dans un arbre détaché, `node_modules` lié, à chaque commit de la réponse. Les
échecs de `2b66063`, chacun sur son assertion :

- (R1-2) « the revocation is refused » : `accepted` au lieu de `INVALID_TRANSITION`, après une
  acceptation IH-10 enregistrée ;
- (R1-3) « the first candidate of the rebuilt change is corrected, not judged a stagnation: 2
  identical candidates without measurable progress » : `stagnation` au lieu de `null` ;
- (R1-8) « the budget extension is not said revoked » : `false` au lieu de `true` ;
- (R1-4) « no requirement is adopted once the answer is revoked » : `[ 'REQ-400' ]` au lieu de `[]` ;
  et « the preparation of the change rebuilt on 422 is judged by no control frozen before the
  revocation » : le prompt système de la préparation reconstruite nomme le contrôle `unit` du
  protocole gelé avant la révocation ;
- (R1-11) « Q1 stays answered » : `null` au lieu de `'400'`, quand le rangement de la question
  reposée échoue après l'inscription de la révocation ;
- (R1-10) « unit: prepared suite on the bare reference: FAIL (discriminant) | prepared suite on the
  bare reference: FAIL (discriminant) » : 2 notes au lieu de 1 ;
- (R1-1) le changement reconstruit s'arrête `blocked` au lieu de `decision_required` :
  « implementing -> implementing/blocked ».

Les tests qui tiennent une ligne déjà juste passent à `2b66063` ; leur rouge est vu sous mutation, sur
`1479c27`, chaque mutation tuant ce seul test :

| Mutation | Test qui échoue |
| --- | --- |
| la décision révoquée est la première IH-01 valide, sans comparer `decision_id` (R1-5, M4) | « …whichever was answered first (M4) » |
| `specificationHistory` hérite des rapports d'avant la révocation (`priors.slice(0, actedOn)`) (R1-6) | « a report rewritten after the revocation that no longer declares Q1 inherits no binding… » |
| `question.revoked` garde le mandat et les exigences (R1-12) | « revoking an answer asks the question again… » : « the mandate and the requirements… » |
| `question.revoked` garde `answered_at` (R1-12) | même test : « nor the time it was answered » |
| `question.revoked` porte `human_decision_id: null` (R1-12) | même test : « the revocation names the IH-01 decision it revokes » |
| l'espace de travail n'enregistre pas sa préparation (R1-12) | « a workspace whose producer never started is taken up while its preparation is adopted… » |
| un producteur repris reçoit le dernier retour, `state.feedback.at(-1)` (R1-12) | « the producer of the rebuilt change, resumed on its own attempt… » |
| la question reposée est demandée en français (R1-12) | « asks Q1 again in the language the change was started in » |
| la confirmation anglaise ne dit plus ce qui est défait (R1-12) | « confirms in English, in an English session… » |
| la question reposée est rangée après l'inscription (R1-11) | « a revocation whose question asked again cannot be stored… » |

`1479c27` ne change aucun comportement : les deux coupures du journal, au dernier acte humain et à la
dernière révocation, comptent les propositions par une seule fonction, `writtenBeforeLast`, chacune
par sa propre lecture du journal, et `settlePending` remplace `withoutPending`.

## Réponse au tour 2 de la relecture

Rejoué le 2026-09-28 dans un arbre détaché, `node_modules` lié. À `37c92a9`, les deux fichiers de
test touchés, `test/v2/answer-revocation.test.ts` et `test/v0/change-rules.test.ts`, rendent 1 échec
sur 94. L'échec porte sur son assertion :

- (R2-8) « the question asked again names no candidate the change no longer has » : le sujet de
  l'IH-01 reposée porte l'empreinte du candidat que la révocation retire, au lieu de celle de la
  référence que portait la première IH-01.

Vert à `f8c46d4` : 94 sur 94, dans un arbre détaché.

Les autres tests de ce tour tiennent une ligne déjà juste et passent à `37c92a9`. Leur rouge est vu
sous mutation, au même commit, chaque mutation rejouée puis retirée :

| Mutation | Tests qui échouent |
| --- | --- |
| une qualification reprise garde ses notes, `qualifications[id] = reusable` (R2-1) | « …rebuilt without a preparation notes no prepared suite… » : la note « FAIL (discriminant) » gardée ; « …rebuilt with a preparation notes its prepared suite… » : aucune note |
| une qualification faite à neuf ne note pas la suite préparée (R2-1, m17) | « …notes the prepared suite of the rebuilt change alone », « …rebuilt without a preparation… », « …rebuilt with a preparation… » (le contrôle `lint`, qualifié à neuf) |
| la demande IH-07 sans faits, sans recommandation, sans l'argument « 3/3 », ou en français forcé (R2-5) | « a change rebuilt with no attempt left asks its owner for a budget extension (IH-07)… », pour chacune des quatre |
| le site `implement` ne donne aucun fait à la demande IH-07 (R2-5) | le même test |
| le plan de la révision du mandat révoque aussi IH-07 (R2-7) | « a budget extension survives a revision of the mandate… » et « …survives a revocation… » |

`9aa014b` ne change que le texte d'un refus. `ca15d89` ne change aucun comportement : `latest` ne lit
le journal que pour un genre non adopté, la demande IH-07 vérifie elle-même l'épuisement du budget, et
le repli jamais atteint de son fait est retiré.

## Preflight des commits verts

| Commit | Node | Début, fin | Tests |
| --- | --- | --- | --- |
| `a82c2cd` | 24.21.0 | 2026-09-27T23:20:14Z, 2026-09-27T23:22:56Z | 536 dans 119 suites, 0 échec ; `npm run build` puis `npm run check`, chacune rendant 0 |
| `e86ae15` | 24.21.0 | 2026-09-27T23:26:29Z, 2026-09-27T23:29:10Z | 538 dans 120 suites, 0 échec ; `npm run build` puis `npm run check`, chacune rendant 0 |
| `41351f0` | 24.21.0 | 2026-09-27T23:32:16Z, 2026-09-27T23:35:00Z | 540 dans 121 suites, 0 échec ; `npm run build` puis `npm run check`, chacune rendant 0 |
| `422ba3c` | 24.21.0 | 2026-09-27T23:40:23Z, 2026-09-27T23:43:11Z | 546 dans 122 suites, 0 échec ; `npm run build` puis `npm run check`, chacune rendant 0 (tâche 5) |
| `09aebe2` | 24.21.0 | 2026-09-28T00:05:58Z, 2026-09-28T00:08:48Z | 551 dans 123 suites, 0 échec ; `npm run build` puis `npm run check`, chacune rendant 0, sur l'arbre de `09aebe2` avec le texte de la story déjà modifié ; Biome, 0 avertissement (auto-revue) |
| `3233666` | 24.21.0 | 2026-09-28T01:22:02Z, 2026-09-28T01:25:00Z | 563 dans 124 suites, 0 échec ; `npm run build` puis `npm run check`, chacune rendant 0 ; Biome, 0 avertissement (réponse au tour 1) |
| `1479c27` | 24.21.0 | 2026-09-28T01:25:25Z, 2026-09-28T01:28:24Z | 563 dans 124 suites, 0 échec ; `npm run build` puis `npm run check` sur l'arbre de `1479c27` avant son commit, chacune rendant 0 ; Biome, 0 avertissement |
| `f8c46d4` | 24.21.0 | 2026-09-28T02:38:23Z, 2026-09-28T02:41:24Z | 567 dans 124 suites, 0 échec ; `npm run build` puis `npm run check` sur l'arbre de `f8c46d4` avant son commit, chacune rendant 0 ; Biome, 0 avertissement (réponse au tour 2) |
| `9aa014b` | 24.21.0 | 2026-09-28T02:41:52Z, 2026-09-28T02:44:53Z | 567 dans 124 suites, 0 échec ; même conduite ; `lint:story-format` tient les 19 stories |
| `ca15d89` | 24.21.0 | 2026-09-28T02:45:52Z, 2026-09-28T02:48:54Z | 567 dans 124 suites, 0 échec ; même conduite ; Biome, 0 avertissement |

## Vérifications de sécurité

- **Tâche 1** : aucun constat sur `src/domain/change/decide.ts`, `src/domain/change/apply.ts` et
  `src/domain/invalidation.ts`. `decision.revoke` et la cause `authorization_revoked` sont retirés.
  `decision.revoked` n'est plus émis que par l'invalidation et par `question.revoke`, qui vérifie la
  provenance par `humanProvenanceIssue`, comme la réponse à une décision et la clôture. La décision
  révoquée est l'IH-01 valide dont la demande est celle que le noyau a associée à la question
  (`decision_id`). L'appelant fournit seulement l'identifiant de la demande qui repose la question
  (M4). Après la décision, aucune gate ne subsiste, seule la demande d'origine reste adoptée, et seules
  les IH-01 restent en attente (M5). Une intervention qui tourne ou une opération ouverte refuse la
  révocation en `OPERATION_ACTIVE` (M6).
- **Tâche 2** : aucun constat sur `src/application/harness.ts` et `src/export/export-service.ts`.
  `revokeQuestion` prend l'acteur et la provenance de l'origine que l'hôte a vérifiée, jamais du
  contenu. La demande IH-01 est inscrite par le noyau dans la décision de révocation. Elle n'est
  rangée pour la présentation qu'une fois cette décision acceptée : un refus ne laisse aucune demande
  derrière lui. L'index exporté dit `revoked` une décision si l'état la tient pour invalide, et
  seulement dans ce cas.
- **Tâche 3** : aucun constat sur `src/application/artifacts.ts` et `src/application/phases/clarify.ts`.
  `src/application/phases/specify.ts` n'a pas changé : il lit l'historique par `priorDiagnostics`,
  qui s'arrête désormais à la dernière révocation. Le journal fixe cette coupure, par l'événement
  `question.revoked`, sans état nouveau. Aucune déclaration faite avant une révocation ne porte la
  nouvelle réponse. Aucun rapport écrit sur la foi de la réponse révoquée ne fonde un mandat ni des
  exigences après elle. `specification-reopening.test.ts` passe sans modification : les bornes de
  réécriture d'e01s01 et e01s02 tiennent.
- **Tâche 4** : aucun constat sur `src/extension/command.ts`. `src/extension/tool.ts` n'a pas changé,
  et `question-closure.test.ts` épingle toujours ses sept opérations, `revoke` exclu. La révocation
  n'est donc atteignable que par une sous-commande humaine. Une session sans humain qualifié
  n'inscrit rien : le mode `print` est refusé avant toute écriture. `/495 revoke` lit le verrou de
  session avant de le prendre et le rend avant la conduite, par la même routine que `/495 close`.
- **Tâche 6** : aucun constat sur `src/domain/change/decide.ts` et `src/domain/change/apply.ts`. La
  révocation garde sa vérification de provenance et ses refus, tirés dans `requireRevocable`. La
  pause est reprise par la commande de pause du noyau, qui inscrit le point de reprise sur la
  décision IH-01 : aucun état nouveau.
- **Tâche 7** : aucun constat sur `src/application/artifacts.ts` et
  `src/application/phases/{implement,prepare,verification-design}.ts`. Les préparations sont
  coupées à la dernière révocation par la lecture du journal qui coupe déjà les rapports de
  spécification, désormais écrite une fois (`proposedSinceRevocation`). L'espace de travail
  enregistre la préparation qui y a été écrite ; un espace enregistré sans elle n'est repris que si
  aucune préparation n'est adoptée. Seule la qualification des contrôles se réutilise encore d'avant
  une révocation : elle porte sur la référence et l'environnement, que la révocation ne change pas.
- **Réponse au tour 1 de la relecture** : aucun constat sur `src/domain/change/{decide,apply}.ts`,
  `src/domain/invalidation.ts`, `src/application/{artifacts,harness,verification}.ts` et
  `src/application/phases/{phase,decide,implement}.ts`. La révocation gagne un refus, une fois le
  candidat accepté, et ne perd aucune de ses vérifications. La provenance passe toujours par
  `humanProvenanceIssue`. La demande IH-01 est rangée avant l'inscription : une révocation refusée
  laisse une demande qu'aucune décision en attente ne nomme, que ni `pendingDecisions` ni l'export ne
  lisent (`getDecisionRequest` ne lit que par identifiant). `latest` ne sert plus aucune proposition
  écrite avant la dernière révocation, hors la référence, si bien que le rapport ne dit plus adoptées
  des exigences qui ne le sont pas (M5). La demande IH-07 du changement reconstruit passe par le même
  chemin que celle d'une correction, `requestDecision`, sur la même provenance de réponse.
- **Réponse au tour 2 de la relecture** : aucun constat sur `src/application/{artifacts,harness}.ts`,
  `src/application/phases/{phase,decide,implement}.ts` et `src/domain/change/decide.ts`. Aucun refus,
  aucune vérification ni aucune provenance ne change. Le refus après l'acceptation garde son code et
  son action, `cancel` ; seul son texte change. Le sujet de l'IH-01 reposée est l'empreinte de la
  référence, lue dans l'état et non dans une entrée. La demande IH-07 est posée dans les mêmes cas
  qu'avant, et son fait vient toujours de l'arrêt que le noyau a posé.
