# e01s02 — une spécification qui ne progresse plus arrête le changement avec un recours

Conduite le 2026-09-26 sur `specification-arretee-avant-g0`, depuis `main` à `38bf5a3` (Preflight
verte sous Node 26.9.0, 474 tests).

## Commandes des tâches

Tâche 1 relevée à `8852a2b`, tâche 2 à `6180916`, tâche 3 à `931a7fb`, tâche 4 à
`b34547a`, sous Node 26.9.0, le 2026-09-26.

```
$ node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   # tâche 1, à 8852a2b
ℹ tests 40   ℹ pass 40   ℹ fail 0
$ npm run build && npm run check                                                # à 8852a2b
ℹ tests 474   ℹ pass 474   ℹ fail 0
exit=0
$ node --test test/v2/specification-reopening.test.ts                           # tâche 2, à 6180916
ℹ tests 12   ℹ pass 12   ℹ fail 0
$ npm run build && npm run check                                                # à 6180916
ℹ tests 478   ℹ pass 478   ℹ fail 0
exit=0
$ node --test test/v2/specification-reopening.test.ts                           # tâche 3, à 931a7fb
ℹ tests 14   ℹ pass 14   ℹ fail 0
$ npm run build && npm run check                                                # à 931a7fb
ℹ tests 481   ℹ pass 481   ℹ fail 0
exit=0
$ node --test test/v2/specification-reopening.test.ts                           # tâche 4, à b34547a
ℹ tests 15   ℹ pass 15   ℹ fail 0
$ npm run build && npm run check                                                # à b34547a
ℹ tests 482   ℹ pass 482   ℹ fail 0
exit=0
```

Tâche 1 : 474 tests avant et après, aucun n'est ajouté ni retiré, sept changent d'attendu. Aux
cinq que le plan nommait (6b, 6c, 6g, 6h, 6j) et au report d'une déclaration dont l'exigence
disparaît (`harness.test.ts`) s'ajoute un septième que le plan ne nommait pas : dans
`harness.test.ts`, la spécification qui ignore toujours une réponse enregistrée (RM-011)
s'arrêtait elle aussi à G1.
6g ne conduit plus l'adoption du mandat : le mandat n'est plus proposé, et le test vérifie
qu'aucune adoption n'est demandée (scénario 6d de la story).

Tâche 2 : 474 tests avant, 478 après. Trois tests sont ajoutés à
`test/v2/specification-reopening.test.ts` (la reprise, la reprise sans progrès, l'abandon) et un à
`test/v0/change-rules.test.ts` (qui peut lever un arrêt). Aucun n'est retiré.

Tâche 3 : 478 tests avant, 481 après. Deux tests sont ajoutés à
`test/v2/specification-reopening.test.ts` (exigence absente, exigence facultative seule) et un à
`test/v0/change-rules.test.ts`. Le test de `harness.test.ts` qui lie une réponse à `R1-trimee`
change d'attendu : le changement s'arrête avant G0, et la reprise obtient le rapport qui lie la
réponse à `R1` et `R2` et mène le changement à sa clôture. Il fixait les motifs de refus de G1
(« does not carry », « no mandatory requirement carries »), que la conduite du changement
n'atteint plus : le test de règle ajouté à `change-rules.test.ts` les fixe désormais sur G1 seul,
qui reste le juge des exigences.

Tâche 4 : 481 tests avant, 482 après. Un test est ajouté à
`test/v2/specification-reopening.test.ts` : un rapport qui porte la réponse et répète un
identifiant d'exigence atteint G1, qui le refuse. Aucun n'est retiré ni ne change d'attendu.

## Cycle rouge-vert

| Comportement | Rouge (test seul) | Vert |
| --- | --- | --- |
| Un rapport qui perd une réponse et que la borne interdit de rouvrir arrête le changement en clarification : stagnation levable, détail qui nomme la réponse, `resume` et `cancel`, ni mandat, ni G0, ni G1, ni adoption (6b, 6c, 6h, 6j, et les deux tests de `harness.test.ts`) | `103ce48` — contrôle négatif : phase `specifying` au lieu de `clarifying`, le mandat a été proposé et G1 a refusé la réponse | `8852a2b` |
| Aucune adoption n'est demandée pour le mandat d'un rapport qui perd une réponse (6g) | `103ce48` — `decision_required` au lieu de `blocked` : l'adoption du mandat (IH-02) est demandée | `8852a2b` |
| La reprise fait réécrire la spécification, la demande dit la réponse à déclarer, et un rapport qui la déclare mène le changement au-delà de G1 | `1fc82ff` — `blocked` au lieu de `closed` : la reprise lève l'arrêt, et la borne, qui ne voit pas la reprise, arrête de nouveau le changement sans intervention | `4f17bd3` |
| Une reprise qui obtient un rapport sans progrès arrête de nouveau le changement après une seule intervention, à chaque reprise (6a) | `1fc82ff` — 4 interventions `specify` au lieu de 5 : aucune après la reprise | `4f17bd3` |
| L'abandon d'un changement arrêté le clôt comme abandonné sans intervention (6b) | vert dès `1fc82ff` : le comportement tenait déjà, le test le fixe | `4f17bd3` |
| Une déclaration propre au rapport qui nomme une exigence absente laisse la réponse non portée : le rapport est rouvert pour elle, puis le changement s'arrête avant G0 quand le suivant ne gagne rien (6e, et `R1-trimee` dans `harness.test.ts`) | `292b904` — rouvert pour `q6` seule au lieu de `q1, q6`, et `R1-trimee` va jusqu'au refus de G1 (phase `specifying`) | `931a7fb` |
| Une déclaration propre au rapport qui ne nomme qu'une exigence facultative laisse la réponse non portée (6e) | `292b904` — rouvert pour `q6` seule au lieu de `q1, q6` | `931a7fb` |
| G1 refuse une réponse liée à une exigence absente ou à aucune obligatoire, et accepte une facultative nommée à côté d'une obligatoire (`change-rules.test.ts`) | vert dès `292b904` : la règle tenait, le test la reprend du test de `harness.test.ts` ; il échoue quand le motif « does not carry » est reformulé | `292b904` |
| Un refus de G1 nomme `cancel` dans la décision de gate et dans le détail de l'arrêt, et `revise_requirements` n'est nommée ni là, ni dans l'action affichée, ni dans les étapes (6f) | `e5f0f28` — l'action de la décision de G1 est `revise_requirements` au lieu de `cancel` | `b34547a` |
| Un agent, une sortie de modèle ou un appel d'outil ne lève pas un arrêt qu'une reprise lève (`change-rules.test.ts`) | vert dès `0afe199`, sur le code de `4f17bd3` : le comportement tenait déjà, le test le fixe ; il échoue quand `requireKernelAuthority` est retiré de `changeUnblock` | `0afe199` |
| Une déclaration propre au rapport qui ne tient pas dans ses exigences efface la liaison valide qu'il hérite : le rapport est rouvert pour la réponse, puis le changement s'arrête avant G0 (6e) | vert dès `cddf2c8` : le comportement tenait déjà, le test le fixe ; il échoue quand `else declared.delete` est retiré de `declarationsOfReport` | `cddf2c8` |
| Un changement mis en pause pendant une réécriture, comme le fait `/495 pause` (session interrompue, puis pause), reste en pause, et sa reprise laisse la borne mesurée depuis la dernière réponse (6c) | `bcdeb0b` — `blocked` au lieu de `paused` : le pas interrompu échoue sur `REVISION_CONFLICT` et le noyau bloque le changement par-dessus la pause ; la reprise lève ce blocage, compté comme un acte humain, et paie une réécriture de plus (6 interventions au lieu de 5) | `bc55ce2` |
| Un changement bloqué refuse la pause et garde son arrêt, son détail et sa levée par une reprise ; la reprise d'un arrêt pour stagnation obtient encore une réécriture (`change-rules.test.ts`, 6a) | `0d67f46` — la pause est acceptée : l'arrêt perd son motif, et une reprise ne le lève plus (BUG-2026-09-26T142500, défaut présent sur `main`) | `6d5a3e3` |

L'isolation est contrôlée à la main, par arbre de travail détaché. Le script
`verify-tdd-red-commit.sh` juge le dépôt du paquet bigpowers, pas celui-ci.

```
103ce48 (test seul)      node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=1  (7 échecs sur 40)
8852a2b (implémentation) node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=0  (40 sur 40)
1fc82ff (test seul)      node --test test/v2/specification-reopening.test.ts   exit=1  (2 échecs sur 12)
4f17bd3 (implémentation) node --test test/v2/specification-reopening.test.ts   exit=0  (12 sur 12)
0afe199 (mutation)       node --test --test-name-pattern="cannot lift a stop" test/v0/change-rules.test.ts   exit=1  (sans requireKernelAuthority)
0afe199 (test)           node --test --test-name-pattern="cannot lift a stop" test/v0/change-rules.test.ts   exit=0
292b904 (test seul)      node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts test/v0/change-rules.test.ts   exit=1  (3 échecs sur 85)
931a7fb (implémentation) node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts test/v0/change-rules.test.ts   exit=0  (85 sur 85)
931a7fb (mutation)       node --test --test-name-pattern="G1 refuses an answer bound" test/v0/change-rules.test.ts   exit=1  (motif reformulé)
e5f0f28 (test seul)      node --test test/v2/specification-reopening.test.ts   exit=1  (1 échec sur 15)
b34547a (implémentation) node --test test/v2/specification-reopening.test.ts   exit=0  (15 sur 15)
cddf2c8 (mutation)       node --test --test-name-pattern="own declaration names a requirement" test/v2/specification-reopening.test.ts   exit=1  (sans else declared.delete)
cddf2c8 (test)           node --test test/v2/specification-reopening.test.ts   exit=0  (16 sur 16)
bcdeb0b (test seul)      node --test test/v2/specification-reopening.test.ts   exit=1  (1 échec sur 17)
bc55ce2 (implémentation) node --test test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=0  (48 sur 48)
bc55ce2 (mutation)       node --test --test-name-pattern="does not count a pause" test/v2/specification-reopening.test.ts   exit=1  (sans blocked && dans specificationHistory)
0d67f46 (test seul)      node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts   exit=1  (2 échecs sur 59)
6d5a3e3 (implémentation) node --test test/v0/change-rules.test.ts test/v2/specification-reopening.test.ts test/v2/harness.test.ts   exit=0  (90 sur 90)
```

`6180916` renomme `sinceLastAnswer` en `sinceLastHumanAct` : la coupure est aussi une reprise.
Refactorisation sans effet sur les tests, Preflight verte à 478 tests.

## Ce qui a changé

- `specificationStanding` (`src/domain/change/state.ts`) sépare le rapport établi, qui porte toutes
  les réponses (`settled`), du rapport qui en perd une sans pouvoir être rouvert (`stalled`). Avant,
  les deux étaient `settled`.
- `clarify` (`src/application/phases/clarify.ts`) reprend un rapport `stalled` comme un rapport
  établi, pose d'abord toute question matérielle encore sans réponse, puis arrête le changement
  (`change.block`, motif `stagnation`, levable) au lieu de proposer le mandat.
- `specificationHistory` (`src/application/artifacts.ts`) coupe l'historique à la dernière réponse
  matérielle ou à la dernière levée d'un arrêt, la plus récente des deux dans le journal. Une levée
  est un passage de `blocked` à `ready` ; une pause et sa reprise n'en sont pas. Le rapport sur
  lequel l'arrêt a été levé est donc réécrit s'il ignore une réponse, et la borne s'applique ensuite.
- `declarationsOfReport` (`src/domain/change/state.ts`) juge la déclaration propre du rapport par
  `declarationHolds`, comme ses déclarations héritées. Avant, elle comptait sans examen. La
  réouverture, la mesure de progrès, la demande de l'intervention suivante et le document
  d'exigences lisent tous cette fonction.
- Le refus de G1 (`src/domain/change/decide.ts`) nomme `cancel` comme action suivante : passé G0,
  aucune phase ne revient à la spécification, et l'abandon est la seule issue qu'une sous-commande
  `/495` tienne. `specify` (`src/application/phases/specify.ts`) reprend l'action de la décision de
  G1 dans l'erreur qui arrête le changement, au lieu d'en écrire une seconde.
- La boucle d'avance du harnais (`src/application/harness.ts`) rend `paused` quand le pas qui échoue
  trouve le changement déjà mis en pause, au lieu de le bloquer. `/495 pause` interrompt la session
  en cours puis met le changement en pause ; le pas interrompu échoue alors sur un conflit de
  révision. Avant, le noyau posait un blocage `execution_error` par-dessus la pause, et la reprise
  levait ce blocage, que `specificationHistory` compte comme un acte humain.
- `changePause` (`src/domain/change/decide.ts`) refuse un changement bloqué. Avant, la pause
  remplaçait l'arrêt : sa reprise rendait un blocage sans motif, sans détail et non levable, et il ne
  restait que l'abandon (BUG-2026-09-26T142500).

## Revue de sécurité de la tâche 1

Aucun constat nouveau sur `src/application/phases/clarify.ts` et `src/domain/change/state.ts`.
L'arrêt n'émet que `change.block` : il ne lie ni ne délie aucune réponse. Un rapport `stalled`
n'atteint jamais la construction du mandat, donc ni G0 ni l'adoption de G1. La levée reste celle
d'un arrêt levable : `change.unblock`, que seul `resume` émet.

## Revue de sécurité de la tâche 2

Aucun constat nouveau sur `src/application/artifacts.ts` et `src/application/harness.ts`
(inchangé). En clarification, seul `change.unblock` fait passer un changement de `blocked` à
`ready` : les autres levées (nouvelle vérification, extension du budget de tentatives,
réconciliation d'un effet) exigent une phase ou un arrêt postérieurs à G0. `change.unblock` est
refusé à un agent, à une sortie de modèle et à un appel d'outil (test ajouté à `0afe199`), et seul
`resume` l'émet. Chaque reprise ne déplace la coupure qu'une fois : elle obtient une réécriture, puis
la borne s'applique (6a).
