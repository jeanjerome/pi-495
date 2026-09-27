# Relecture — e01s03, seul l'humain clôt une question matérielle

Règles : `CONVENTIONS.md` § Review (`specs/adr/D-62`) — pas de pourcentage, constats situés, plafond
de cinq tours. Chaque relecteur, neuf et sans contexte commun, travaille sur sa copie sous `$HOME`
(arbre détaché, `node_modules` lié), supprimée après le tour.

## Tour 1 — `git diff main...20a8614` (base `8e7d931`), le 2026-09-27

| | |
|---|---|
| Relecteur A | **FAIL** — 1 bloquant, 3 à corriger, 7 à peser |
| Relecteur B | **FAIL** — 1 bloquant, 2 à corriger, 6 à peser, 2 antérieurs |
| Porte | **FAIL** |
| Preflight à la révision relue | `npm run build && npm run check` sous Node 26.9.0, 16:15:20Z à 16:18:49Z, sortie 0, 513 tests, `dist/` inchangé |
| Commande de vérification des relecteurs | les quatre fichiers de test de la story avec `--test-concurrency=1`, puis `npm run typecheck` : sortie 0, 117 tests, chez A comme chez B ; `npm test` chez A, 513 tests |
| Registre ouvert, non compté | `BUG-2026-09-23T155707` |

### Bloquant

**R1-1 — Un changement enregistré avant la branche lit chacune de ses questions comme close, ce
qui rouvre M1.** A et B, chacun par ses propres sondes. Introduit par la branche. Prémisse vérifiée
par le coordinateur : `SqliteLedger.loadChange` (`src/adapters/storage-sqlite/ledger.ts:289-295`)
rend l'état tel que `JSON.parse` le lit dans `changes.state`, sans rejouer les événements ; l'`apply`
de `main` (et de la 0.2.1 publiée) n'écrit ni `closed_at` ni `closed_by` sur une question posée ; le
champ se lit donc `undefined`, et `q.closed_at !== null` le compte comme clos.

- Lieux : `state.ts:53` (type), `state.ts:356,382,469,480`, `decide.ts:339,380,387,484`,
  `clarify.ts:148,156,166`, et `context.ts:248,250`, qui teste la valeur par vérité et se contredit
  avec les autres sites.
- Scénario (B, test jetable qui retire les deux champs de l'état enregistré) : question « 400 ou
  422 ? » posée, l'humain répond « 422 », le changement avance. Forme ancienne : une seule
  intervention de spécification, G0 PASS, G1 PASS, le document des exigences recopie « 422 »
  `observable: false` sans exigence, le mandat écrit `closed_by: null`, le changement est accepté.
  Forme de la branche : arrêt `stagnation` après deux interventions.
- Sondes de A : `answersOf` rend `observable: false` ; un rapport qui ignore q1 est jugé réglé ; G0
  passe avec une question matérielle ouverte ; `/495 close q1` est refusée « already closed » ; sur
  un vrai `SqliteLedger`, `verifyIntegrity` signale « projection differs from replay » ; le mandat
  porte toutes les questions, `language` compris, avec `closed_by: null`, que le schéma accepte.
- Relevé contredit : `specs/security/REVIEW.md` dit que seul l'événement `question.closed` écrit
  `closed_at`.
- Correctif proposé par les deux : un seul prédicat de clôture dans `state.ts` (par exemple
  `typeof q.closed_at === "string"`), champs déclarés facultatifs avec le commentaire « absent d'un
  dossier écrit avant… » que le dépôt emploie déjà (`location?`, `cost?`), appelé par les douze sites ;
  B cite aussi, en variante, compléter l'état au chargement ou le reconstruire par les événements
  (`rebuildChange` existe, sans appelant). Test de régression : un état enregistré sans les deux
  champs laisse la question ouverte, et G1 refuse « 422 » lié à rien.

### À corriger

**R1-2 — La mesure de progrès compte une question close comme un progrès (6b).** A et B.
Introduit par la branche. `answersTheReportCarries` (`state.ts:364-367`), avec `state.ts:315`
(`if (!a.observable) return closed;`). Deux réponses perdues, Q1 et Q6 ; le propriétaire clôt Q1 ; la
réécriture suivante déclare Q1 (non observable, ou liée) et perd encore Q6 : elle est jugée en
progrès, donc rouverte une fois de plus. B, bout en bout : 6 interventions puis `stagnation`, 5
avec le correctif ; le §6b veut une seule réécriture pour l'autre réponse (coût M7). Mutations
survivantes : `before` calculé sans l'ensemble des closes (A) ; `const closed = new Set<string>()` à
`state.ts:469`, et `if (!a.observable) return false;` à `state.ts:315` (B). Correctif proposé :
écarter les questions closes de `answersTheReportCarries`, puis retirer le drapeau `closed` de
`declarationHolds` et le défaut `closed = new Set()` de `declarationsOfReport`, dont
`specify.ts:16` dépend sans le dire ; un test du cas.

**R1-3 — Aucun test ne vérifie que le changement repart après `/495 close`.** A et B. Introduit par
la branche. Retirer `await conduct(...)` (`src/extension/command.ts:253`) laisse passer la suite : le
test « …and conducts the change onward as after a resume » (`test/v3/question-closure.test.ts:261-276`)
ne vérifie que `stop_reason !== "stagnation"`, déjà vrai après la levée du noyau. Le §7 veut que la
conduite reprenne comme après `/495 resume`. Correctif : vérifier ce que la conduite produit (mandat
proposé, G0 évalué sans nouvelle intervention, ou message de statut après la clôture).

**R1-4 — Aucun test ne vérifie qu'une question close figure une seule fois au mandat.** A.
Introduit par la branche. La tâche 6 de `e01s03-tasks.yaml` l'annonce ; le test IH-01
(`test/v2/specification-reopening.test.ts:747`) lit le mandat par `.find(...)`. Retirer
`!askedIds.has(s.id)` (`clarify.ts:156`) fait porter `q-scope` deux fois et la suite passe ; une
assertion `filter(...).length === 1` échoue sous la mutation et passe sans elle.

### À peser

- **R1-5** (A) — la garde `resumeLiftsStop` avant `changeUnblock` (`decide.ts:344`) n'est pas
  testée : « lever tout arrêt » survit. Un test où la clôture laisse en place un arrêt non
  réessayable.
- **R1-6** (A) — `closed_by` vient de l'acteur de la commande, pas de l'origine vérifiée
  (`decide.ts:343`, `apply.ts:132`) : `question.close` porté par `kernel` ou `executor` avec une
  origine humaine valide est accepté. Inatteignable par les deux entrées, qui passent `origin.actor`.
- **R1-7** (A, B) — `/495 close` ne teste pas `session.busy` (`command.ts:217-255`) : une clôture
  entre deux écritures d'une conduite en cours est inscrite, et le pas en cours finit en
  `REVISION_CONFLICT` puis en arrêt `execution_error` ; entre la fin d'une intervention et
  `artifact.propose`, le rapport payé est perdu. M6 tient. Argumenté sur le code, non reproduit.
  Correctif possible : refuser tant que `session.busy`, comme `tool.ts:73`.
- **R1-8** (A, B) — `closed_by` admet `null` dans le contrat (`protocol.ts:264`,
  `contracts/v1/mandate.json`) ; seul R1-1 l'écrit. `Type.Optional(Type.String())` le refuserait, et
  les mandats déjà écrits restent valides.
- **R1-9** (A, B) — deux textes nouveaux ne sont épinglés par aucun test : l'option anglaise
  « close » d'IH-01 marquée risquée (`decisions.ts:149-153`), et la phrase de la consigne `specify`
  qui fait de `observable: false` une proposition.
- **R1-10** (B) — le lien de la clôture IH-01 à sa décision (`human_decision_id`, `decide.ts:1337`)
  n'est pas testé : `null` survit. L'événement `decision.recorded` qui précède porte le même
  identifiant.
- **R1-11** (B) — `humanProvenanceIssue` (`decide.ts:149-159`) rend un message ou `null` au lieu de
  lever ; un `requireHumanProvenance` qui lève servirait les deux appelants.
- **R1-12** (A, B) — `close` et `cancel` répètent liaison, origine et confirmation dans
  `command.ts:217-290`, qui passe de 291 à 331 lignes (Duplicated Code). `closed_at` et `closed_by`
  voyagent ensemble (Data Clumps) ; `closure` dans `mandateQuestions` (Mysterious Name).
- **R1-13** (A) — relevés que le code contredit : `specs/security/REVIEW.md` dit que `harness495`
  n'expose que `status`, `start` et `list_pending_decisions`, alors que le code et le test qui
  épingle sa surface en montrent sept ; l'audit dit que `question-closure.test.ts` ne restaure pas
  `HARNESS495_*`, alors que des `beforeEach`/`afterEach` de `describe` les restaurent.

### Antérieurs à la branche, selon B — ne retiennent pas la porte, à placer (fix-or-log)

- **P1** — `decision.rejected`, émis à `decide.ts:1288`, est perdu : `decide` rend `{ok: false}` et
  `harness.commit` n'inscrit que sur `ok`. Le §12 de la story, qui dit qu'une clôture refusée pour sa
  provenance laisse la décision refusée au journal « comme toute décision refusée », est faux pour
  toute décision.
- **P2** — une autre forme de M1 : un modèle lie « 422 » à une exigence obligatoire marquée
  `satisfied_by_reference: true`. G1 ne lit pas ce drapeau (`decide.ts:505-515`), et une telle
  exigence n'est prouvée que par les tests existants qui passent encore
  (`preparation.ts:116-126`) ; aucun test en échec ne vérifie la réponse. G2 et G5 non tracés.

### Mutations

Tuées : 22 chez A, 27 chez B — gardes de provenance, d'intervention en cours, de décision en
attente, de phase, de matérialité et de double clôture ; refus de G1 d'une proposition non
observable ; `declarationHolds` ramenée au comportement de `main` ; branches closes d'`answersOf`,
de `questionsToAsk`, de `final`, de G0 et de G1 ; confirmation de `/495 close` ; clôture sous
l'acteur du noyau. Survivantes : celles de R1-2, R1-3, R1-4, R1-5, R1-9 et R1-10.

## Réponse au tour 1

Chaque constat, un par un ; corrigé ou écarté avec sa raison, aucun laissé sans décision
(`CONVENTIONS.md` § Review).

- **R1-1 (bloquant)** — corrigé. Un seul prédicat, `isQuestionClosed` (`state.ts`), remplace les
  treize comparaisons directes à `closed_at` dans `state.ts`, `decide.ts`, `clarify.ts` et
  `context.ts` ; `closed_at` et `closed_by` deviennent facultatifs dans `OpenQuestion`, avec le
  commentaire que porte déjà `location?`. Test de régression : un état privé des deux champs (le cas
  d'un dossier écrit avant la branche) laisse la question ouverte.
- **R1-2 (à corriger)** — corrigé. `answersTheReportCarries` écarte désormais les questions closes de
  son ensemble de réponses ; `declarationHolds` et `declarationsOfReport` perdent le paramètre
  `closed`, devenu mort une fois ce premier écart posé, et `specify.ts:16` cesse de dépendre d'un
  défaut implicite qu'il ne nommait pas. Scénario de B rejoué à l'identique : rouge à 6 interventions
  avant le correctif, vert à 5 après.
- **R1-3 (à corriger)** — corrigé. Le test de `question-closure.test.ts` vérifie maintenant que G0 est
  évalué et que le mandat est adopté après la clôture, pas seulement que l'arrêt est levé ; il échoue
  si `await conduct(...)` est retiré de `command.ts`, ce qu'il ne faisait pas avant.
- **R1-4 (à corriger)** — corrigé. `specification-reopening.test.ts` vérifie qu'une question posée par
  le rapport puis close par le propriétaire figure une seule fois au mandat ; il échoue si le filtre
  `!askedIds.has(s.id)` de `mandateQuestions` est retiré.
- **R1-5 (à peser)** — corrigé. Un test ferme un changement pour un motif qu'une reprise ne lève pas
  (`policy_denied`, non réessayable) puis clôt une question matérielle : l'arrêt reste en place. Tue
  la mutation qui rendrait `changeUnblock` inconditionnel dans `questionClose`.
- **R1-6 (à peser)** — corrigé. `question.closed` porte désormais l'acteur de l'origine humaine
  vérifiée (`c.origin.actor` en commande directe, `origin` en IH-01), jamais l'acteur d'exécution de
  la commande. Un test ferme une question sous un acteur noyau avec une origine humaine distincte et
  vérifie que `closed_by` est l'origine, pas l'exécutant.
- **R1-7 (à peser)** — corrigé. `/495 close` refuse tant que `session.busy`, comme `tool.ts`, et pose
  le drapeau pour la durée de la confirmation et de l'écriture, le relâchant avant `conduct` qui gère
  le sien pour la suite. Un test pose `session.busy` avant `close q1` et vérifie qu'aucune confirmation
  n'est demandée et que rien n'est inscrit.
- **R1-8 (à peser)** — corrigé. `closed_by` du contrat (`protocol.ts`, régénéré dans
  `contracts/v1/mandate.json`) passe de `string | null` optionnel à `string` optionnel, ce que le code
  garantit désormais (R1-1, R1-6). Un test constate que le contrat refuse `closed_by: null` et accepte
  son absence.
- **R1-9 (à peser)** — corrigé, les deux textes. L'option anglaise « close » d'IH-01 est désormais
  épinglée `risky: true`, comme la version française l'était déjà. La phrase de la consigne `specify`
  sur `observable: false` comme proposition est épinglée par une assertion sur le prompt système du
  rôle.
- **R1-10 (à peser)** — écarté, avec raison. Rien ne lit `human_decision_id` hors de l'événement
  lui-même : `OpenQuestion` ne porte pas ce champ, et l'identifiant de la décision qui a fermé une
  question reste retrouvable par `decision_id` sur l'événement `decision.recorded` qui précède. Un
  test qui l'épinglerait ne vérifierait aucun comportement observable ; à reconsidérer si un
  consommateur de ce champ apparaît.
- **R1-11 (à peser)** — écarté, avec raison. `humanProvenanceIssue` est appelée par deux chemins aux
  effets différents à l'échec : `questionClose` lève directement, `decisionAnswer` doit d'abord
  inscrire `decision.rejected` (P1) avant de refuser. Une fonction qui lève ne servirait pas ce second
  appelant sans dupliquer l'inscription autour de l'appel ; le prédicat qui rend un message reste la
  forme qui sert les deux sans une seconde copie.
- **R1-12 (à peser)** — partiellement corrigé. `closure`, nom mystérieux relevé pour `mandateQuestions`,
  devient `closedFields`. Le code dupliqué entre `close` et `cancel` (liaison, origine, confirmation)
  et le regroupement `closed_at`/`closed_by` sont laissés en l'état : les messages diffèrent par verbe
  et par hôte autorisé d'une sous-commande à l'autre, si bien qu'une extraction n'effacerait qu'une
  faible part de la répétition en échange d'une indirection ; à reprendre si une troisième
  sous-commande partage la même forme.
- **R1-13 (à peser)** — corrigé, les deux relevés. `specs/security/REVIEW.md` nomme désormais les sept
  opérations réelles de `harness495` (`status`, `list_pending_decisions`, `start`, `verify`,
  `review_summary`, `report`, `export`) aux trois endroits qui n'en citaient que trois.
  `AUDIT-e01-e01s03.md` cesse de dire que `question-closure.test.ts` ne restaure pas `HARNESS495_*` :
  son `describe` porte son propre `beforeEach`/`afterEach`, qui les sauve et les rétablit.
- **P1 et P2** — placés, pas corrigés dans ce tour : `decision.rejected` n'atteint jamais le journal,
  pour tout refus de décision, pas seulement pour une clôture (`BUG-2026-09-27T170000`) ; G1 ne lit
  pas `satisfied_by_reference` avant de lier une réponse à une exigence obligatoire, et G2/G5 restent
  à tracer (`BUG-2026-09-27T170100`). Les deux précèdent la branche et ne retiennent pas la porte
  (règle 1) ; chacun demande une investigation avant correctif (traçage des consommateurs de
  `decision.rejected` pour l'un, des chemins G2/G5 pour l'autre), donc `fix-bug` plutôt qu'un correctif
  immédiat — enregistrés dans `specs/bugs/registry.yaml`, statut `open`.

Preuves : chaque correctif ci-dessus a son test, chacun vérifié rouge sans le correctif et vert avec
(mutation rejouée à la main, pas seulement lue). Suite complète après tous les correctifs : 513 tests
plus les nouveaux de ce tour, `npm run typecheck` et `npm run contracts` sans écart.

## Tour 2 — `git diff 20a8614...271cc52` (tête `60b25f6`), le 2026-09-27

| | |
|---|---|
| Relecteur A | **FAIL** — 0 bloquant, 2 à corriger, 5 à peser |
| Relecteur B | **FAIL** — 0 bloquant, 3 à corriger, 4 à peser |
| Porte | **FAIL** |
| Preflight à la révision relue | `npm run check` chez A et chez B, avant toute mutation, sous Node 26.9.0 : sortie 0, 520 tests |
| Commande de vérification des relecteurs | les quatre fichiers de test de la story avec `--test-concurrency=1` : sortie 0, 124 tests ; `npm run typecheck` : sortie 0 ; chez A comme chez B |
| Registre ouvert, non compté | `BUG-2026-09-23T155707`, `BUG-2026-09-27T170000`, `BUG-2026-09-27T170100` |

Les correctifs du tour 1 tiennent dans le code : aucun des deux relecteurs ne trouve de comportement
faux. Ce qui retient la porte, ce sont les tests de deux correctifs, qui ne tiennent pas la ligne
corrigée, et du code mort que les correctifs ont laissé. Réponses concordantes aux questions posées :
rien ne lit l'`actor` d'un événement en y attendant l'exécutant (colonne `actor_id` écrite jamais
relue, `last_actor`, rejeu, export verbatim), et les deux entrées passent déjà l'acteur de l'origine,
si bien que la substitution de R1-6 ne change rien en production ; les treize lecteurs de `closed_at`
passent par `isQuestionClosed`, seul `apply.ts` l'écrit ; l'intervalle entre la levée de `busy` et sa
reprise par `conduct` est sûr, `conduct` le teste et le pose avant son premier `await` ; les scénarios
6a à 6f tiennent ; aucun mandat stocké n'est revalidé à la lecture ni à l'export (le schéma n'est lu
qu'à l'écriture, `clarify.ts:121`), et la 0.2.1 n'a jamais écrit `closed_by`.

### À corriger

**R2-1 — Aucun test ne tient l'exclusion des questions closes de la mesure de progrès.** A et B.
Introduit par la branche (le correctif de R1-2). Retirer `&& !isQuestionClosed(q)` de
`answersTheReportCarries` (`state.ts:382`) laisse passer la suite entière (520 chez A) ; rejoué par le
coordinateur, sortie 0 sur les quatre fichiers de la story. Le test de 6b ne l'atteint pas : sa
cinquième réécriture (`PROPOSES_NOTHING_FOR_CLOSED_Q1`, `test/v2/specification-reopening.test.ts:114`)
déclare Q1 non observable, et `declarationHolds` écarte désormais cette déclaration avant que
l'exclusion ne serve ; le test ne rougit que si les deux moitiés du correctif sont retirées ensemble.
Scénario : l'arrêt nomme Q1 et Q6 perdues, le propriétaire clôt Q1 ; la réécriture suivante lie Q1,
close, à l'exigence obligatoire `REQ-UPDATE` (A), ou hérite de cette liaison par des exigences
`[MESSAGE, UPDATE]` (B), et perd encore Q6. Sans l'exclusion, elle est jugée en progrès et rouverte :
6 interventions au lieu de 5, contre la seule réécriture du §6b et le coût M7. Les sondes de A et de B
passent à `60b25f6` et échouent sous la mutation. Correctif : une variante du test de 6b dont la
cinquième réécriture lie la question close de façon observable, ou en hérite.

**R2-2 — Le test de régression de R1-1 ne tient aucun des sites qu'il protège.** B (à corriger), A
(à peser). Introduit par la branche. `test/v0/change-rules.test.ts:458` n'exerce que
`isQuestionClosed` et `answersOf`. Remettre `closed_at !== null` à un seul site passe : G1
(`decide.ts:485`, chez A et B ; suite entière chez A ; rejoué par le coordinateur, sortie 0 sur les
quatre fichiers de la story), G0 (`decide.ts:381`), `final` (`state.ts:497`) chez B,
`answersTheReportIgnores` (`state.ts:368`) chez A. Sonde de B : « 422 » répondu, les deux champs
retirés de l'état (la forme que `loadChange` rend pour un dossier écrit avant la branche), le document
des exigences déclare q1 non observable sans exigence : G1 échoue à `60b25f6` et passe sous la
mutation de G1, soit M1 à la porte que le §6g donne pour dernière défense. Le tour 1 proposait « G1
refuse « 422 » lié à rien » comme test de régression ; cette moitié n'a pas été écrite. Correctifs
proposés : conduire l'état de forme ancienne jusqu'à G0 et G1 dans le test (A : par un vrai
`SqliteLedger`, sa sonde de bout en bout passe à `60b25f6`) ; ou, selon B, compléter
`closed_at`/`closed_by` quand `loadChange` lit un état, ce qui rend chaque site sûr quoi qu'il compare
et efface l'écart projection/rejeu que `verifyIntegrity` signalerait — un mécanisme de plus, que la
règle 2 demande de concevoir avant de le poser.

**R2-3 — Du code mort et un commentaire que le code contredit.** A et B. Introduit par la branche.
La branche `"already declared as fixing nothing observable"` de `specificationObjective`
(`context.ts:255-257`) ne peut plus s'exécuter : `declared` ne vient que de `declarationsOfReport`, qui
ne garde plus aucune déclaration non observable (A la remplace par un `throw`, 520 tests passent sans
l'atteindre ; B la retire, tout passe). `observable: d?.observable ?? true` d'`answersOf`
(`state.ts:414`) vaut toujours `true` (B, mutation survivante). Le commentaire
d'`answersTheReportIgnores` (`state.ts:362-363`) dit encore qu'un rapport qui déclare que la réponse ne
fixe rien d'observable la porte, le contraire du §6c et du §8. Correctif : réduire le ternaire à ses
deux cas, écrire `observable: true`, retirer la proposition du commentaire.

### À peser

- **R2-4** (A, B) — le maintien de `busy` pendant la confirmation et l'écriture de `/495 close`
  (`command.ts:235`) n'est pas testé : retirer `session.busy = true` passe les 8 tests de
  `question-closure.test.ts` ; le refus et la levée le sont. Cycle de vie nommé par les deux : né à
  `session.ts:69` ; posé par `conduct.ts:40`, `/495 verify` (`command.ts:110`), `/495 close`
  (`command.ts:235`) et l'outil (`tool.ts:74`) ; lu par `conduct.ts:36`, `tool.ts:73`,
  `command.ts:226` et `index.ts:21-22`, qui annule bascule et fourche de session. Effets du maintien :
  pendant la confirmation, bascule et fourche sont annulées, comme autour de `presentDecisions` ; un
  client RPC qui ne répond jamais garde le drapeau ; pendant un choix IH-01 ouvert dans `conduct`,
  `/495 close` répond le texte générique au lieu de « a decision is pending; close it there (IH-01) »
  du domaine (A). L'autre chemin de clôture, IH-01 par `/495 decide`, n'a pas de garde : c'est le cas
  de toute décision avant la branche (B).
- **R2-5** (A, B) — le texte du refus (`command.ts:227`) est en français seul, recopié de
  `conduct.ts:37`, quand les autres messages de la sous-commande suivent `session.lang()` et que
  `tool.ts` dit « busy » (Duplicated Code). B propose un seul refus sur `ExtensionSession`, dans la
  langue de la session, pour `conduct`, `verify` et `close`.
- **R2-6** (A, B) — la substitution `actor: origin` de la clôture par IH-01 (`decide.ts:1337`) n'est
  pas testée ; seule celle de la commande directe l'est. Sans effet en production :
  `harness.answerDecision` passe déjà `origin.actor` (`harness.ts:778-781`, `harness.ts:959`). Dans la
  même branche, `question.answered` garde `this.base()` (A).
- **R2-7** (A, B) — `closed_at`/`closed_by` ont trois états (absent, `null`, chaîne) :
  `apply.ts:120-121` écrit encore `null` à l'ouverture d'une question, si bien que `verifyIntegrity`
  signalerait pour toujours « projection differs from replay » sur un dossier de la 0.2.1 (aucun
  appelant dans `src/`), et `closedFields` (`clarify.ts:149-150`) garde par `&& s.closed_by` un cas
  impossible, puisque `apply.ts:131-133` pose les deux champs du même événement. Correctif proposé :
  ne plus les écrire à l'ouverture et les typer `closed_at?: string`, `closed_by?: ActorRef`, ou un seul
  objet `closure` facultatif (Data Clumps), dont `isQuestionClosed` deviendrait le garde de type. B
  relève que la raison écrite pour R1-12 ne couvre pas ce regroupement.
- **R2-8** (A) — commentaires et relevé : `command.ts:233` dit que la clôture « is itself lost between
  the end of an intervention and the artifact it paid for », alors que c'est le rapport payé qui est
  perdu ; `state.ts:377` raconte l'histoire du défaut (« that is what kept a report … from being
  recognised as stalled ») au lieu du comportement ; `specs/security/REVIEW.md:873,953` qualifient les
  sept opérations de `harness495` de « lecture et démarrage », alors que `verify` inscrit
  `verification.rerun` et relance la vérification (`harness.ts:852-867`) et qu'`export` écrit un
  dossier — la conclusion, qu'aucune ne décide, n'adopte ni ne clôt, tient.
- **R2-9** (B) — la raison écrite pour R1-10, « rien ne lit `human_decision_id` », est en partie
  fausse : l'export écrit chaque événement tel quel dans `events.jsonl` (`export-service.ts:155-157`),
  et le §12 de la story fait de la décision IH-01 une partie de la clôture tracée. A juge la raison
  vraie dans le code. Reste à peser.

### Relevé, non compté (règle 5)

`specs/security/REVIEW.md:941` (« `declarationHolds` rend `closed` ») et `:999` (« `closed_at` n'est
pas null ») étaient vrais à la révision que leur section relève (`ea1bd1d`) : ils suivent le code sans
le contredire, à reformuler quand le relevé sera réancré (B).

### Mutations

Tuées, chez A comme chez B (19 chez B) : substitution d'acteur de la commande directe, garde et levée de `busy`,
`closed_by` de nouveau nullable au contrat, clôture qui lève tout arrêt ou le lève toujours, retrait de
`conduct` après `/495 close`, retrait du filtre `!askedIds.has`, option anglaise de clôture non
risquée, retrait de la phrase de la consigne `specify`, `isQuestionClosed` ramené à `!== null`.
Survivantes : celles de R2-1, R2-2, R2-3, R2-4 et R2-6, et `human_decision_id: null` sur une clôture
IH-01 (R1-10).

### Non vérifié

Ni A ni B n'a reproduit la course de R1-7 dans un vrai Pi ou en RPC, ni rejoué de campagne ; B n'a pas
inspecté `dist/` ; A n'a pas relu les deux entrées nouvelles du registre.

## Réponse au tour 2

Chaque constat, un par un ; corrigé ou écarté avec sa raison, aucun laissé sans décision
(`CONVENTIONS.md` § Review).

- **R2-1 (à corriger)** — corrigé par le test, le code tenait déjà. Un nouveau scénario de 6b
  (`BINDS_CLOSED_Q1_TO_UPDATE`, `specification-reopening.test.ts`) lie la question close, de façon
  observable, à l'exigence qu'elle tenait déjà, au lieu de déclarer qu'elle ne fixe rien d'observable :
  `declarationHolds` ne l'écarte plus avant que l'exclusion de `answersTheReportCarries`
  (`state.ts:384`) ne serve. Rejoué à la main : retirer `&& !isQuestionClosed(q)` fait passer de 5 à 6
  interventions et le test échoue ; en place, il passe.
- **R2-2 (à corriger)** — corrigé, quatre tests. Un état légataire (`closed_at`/`closed_by` absents,
  comme `SqliteLedger.loadChange` le rend pour un dossier antérieur à la branche) est conduit jusqu'à
  G0 (`decide.ts:381`) et jusqu'à G1 (`decide.ts:485`) directement, et jusqu'à `specificationStanding`
  pour `final` (`state.ts:502`, question non répondue) et pour `answersTheReportIgnores`
  (`state.ts:370`, question répondue non liée). Les quatre mutations que le tour 2 proposait (remettre
  `closed_at !== null` à chacun des quatre sites, un par un) sont rejouées à la main : chacune fait
  échouer le test qui lui correspond, seul.
- **R2-3 (à corriger)** — corrigé, les trois points. Le ternaire à trois branches de
  `specificationObjective` (`context.ts`) perd sa branche morte, `declared` ne contenant jamais une
  déclaration non observable par construction de `declarationHolds` ; `answersOf` (`state.ts`) écrit
  `observable: true` au lieu de `d?.observable ?? true`, dont la valeur était déjà toujours `true` ; le
  commentaire d'`answersTheReportIgnores` (`state.ts:362`) cesse de dire qu'une déclaration non
  observable porte la réponse. Aucun changement de comportement : `declarationHolds` le garantit par
  construction, et la suite passe à l'identique.
- **R2-4 (à peser)** — en partie corrigé. Le maintien de `busy` pendant la confirmation et l'écriture
  de `/495 close` est désormais épinglé : un test observe `session.busy` au moment où la confirmation
  est posée, puis vérifie qu'il est relâché avant `conduct` (`question-closure.test.ts`), tué par le
  retrait de `session.busy = true` (`command.ts:236`). Les deux autres effets relevés restent en l'état,
  avec raison. Pendant une décision IH-01 que `conduct` présente, `busy` reste posé — `presentDecisions`
  est appelé dans le même bloc `try` — et `/495 close` y répond le message générique au lieu du refus
  spécifique de `questionClose` (« a decision is pending; close it there (IH-01) ») ; ce message
  spécifique reste atteignable dès que la fenêtre se referme (le choix fait ou reporté), et le message
  générique reste exact tant qu'elle dure, une opération étant réellement en cours : pas un défaut, le
  mécanisme fait ce pour quoi R1-7 l'a posé. Le second point, `/495 decide` sans garde `busy` pour
  aucune interaction, close comprise, précède la branche pour toute décision (confirmé par B) : la
  branche ajoute une option à une commande déjà sans garde, elle n'introduit ni n'aggrave le défaut ;
  il ne retient donc pas la porte (règle 1), laissé à instruire séparément si une course y est un jour
  observée.
- **R2-5 (à peser)** — corrigé. `ExtensionSession.busyRefusal()` (`session.ts`) rend le refus dans
  `session.lang()` ; `conduct.ts` et `/495 close` (`command.ts`) l'appellent tous deux au lieu de
  recopier le texte français. `tool.ts` garde son `"busy"` propre : un code lu par un appelant modèle,
  pas un message humain dans la langue de la session, donc hors de ce regroupement.
- **R2-6 (à peser)** — corrigé par le test. `question.closed` porté par IH-01 (`decide.ts:1337`) est
  désormais épinglé sous un acteur de commande distinct de l'origine vérifiée (`decision.answer`
  exécuté par `KERNEL`, origine `HUMAN`) : `closed_by` doit rester celui de l'origine, tué par le
  retrait de `actor: origin` à ce site (`change-rules.test.ts`). Sans effet en production aujourd'hui,
  `harness.answerDecision` passant déjà `origin.actor` comme acteur de la commande — défense en
  profondeur, pas correctif de comportement. `question.answered` garde `this.base()` volontairement :
  enregistrer une réponse n'est pas restreint à une origine humaine vérifiée comme clore l'est
  (RM-024), donc la même substitution n'y a pas la même raison d'être.
- **R2-7 (à peser)** — écarté, avec raison. Les trois états de `closed_at`/`closed_by` (absent, `null`,
  chaîne) sont déjà résolus sans ambiguïté par leur seul lecteur, `isQuestionClosed` (R1-1, testé aux
  quatre sites par R2-2 ci-dessus) : un `null` écrit à l'ouverture (`apply.ts:120-121`) et une chaîne
  absente lisent tous deux « non close ». Retirer cette écriture et retyper les deux champs sans `null`
  demanderait de réécrire cinq assertions `assert.equal(…, null)` dans deux fichiers de test
  (`change-rules.test.ts`, `question-closure.test.ts`) pour un comportement inchangé, et `closedFields`
  (`clarify.ts:149-150`) resterait aussi correcte avec son garde actuel qu'avec un type resserré,
  TypeScript ne pouvant de toute façon pas prouver depuis les seuls types que `closed_by` est posé
  quand `closed_at` l'est. Aucun bénéfice observable pour le remaniement ; à reprendre si
  `verifyIntegrity` (sans appelant dans `src/` aujourd'hui) gagne un consommateur que cet écart gênerait
  réellement.
- **R2-8 (à peser)** — corrigé, les trois relevés. `command.ts:233-234` nomme l'artefact perdu, pas la
  clôture elle-même ; le commentaire d'`answersTheReportCarries` (`state.ts:377`) décrit ce que la
  fonction fait, plus l'histoire du défaut qu'elle corrige ; `specs/security/REVIEW.md` (les deux
  occurrences) cesse de dire que les sept opérations de `harness495` sont « de lecture et de démarrage »
  — `verify` relance une vérification et `export` écrit un dossier — sans changer la conclusion :
  aucune ne décide, n'adopte ni ne clôt.
- **R2-9 (à peser)** — corrigé, la disposition de R1-10 révisée. Le §12 de la story exige que la
  clôture par IH-01 soit tracée avec sa décision humaine ; l'export écrit chaque événement tel quel
  dans `events.jsonl` (`export-service.ts:155-157`), donc l'observable que R1-10 disait absent existe,
  dans le dossier exporté. Un test épingle que `question.closed` porte le même `human_decision_id` que
  `decision.recorded` pour la même clôture (`change-rules.test.ts`), tué par sa mise à `null`. La
  disposition « écarté » de R1-10 au tour 1 est donc corrigée ici plutôt que reconduite.

Preuves : chaque correctif a son test, chacun vérifié rouge sous la mutation qu'il vise et vert sans
elle (mutation rejouée à la main, pas seulement lue) : R2-1, les quatre de R2-2, R2-4, R2-6, R2-9.
Suite complète après tous les correctifs : `npm run build && npm run check` sous Node 26.9.0, sortie 0,
528 tests (520 + 8 nouveaux), `dist/` reconstruit.

## Tour 3 — `git diff 60b25f6 ac71f0a`, le 2026-09-27

| | |
|---|---|
| Relecteur A | **FAIL** — 0 bloquant, 1 à corriger, 9 à peser, 1 antérieur |
| Relecteur B | **FAIL** — 0 bloquant, 2 à corriger, 6 à peser, 1 antérieur |
| Porte | **FAIL** |
| Preflight à la révision relue | `npm run build && npm run check` chez A (19:12:52Z à 19:16:30Z) et chez B (19:13:47Z à 19:17:28Z), avant toute mutation, sous Node 26.9.0 : sortie 0, 528 tests, `lint:distribution` vert |
| Commande de vérification des relecteurs | les quatre fichiers de test de la story avec `--test-concurrency=1` : sortie 0, 132 tests, chez A comme chez B |
| Registre ouvert, non compté | `BUG-2026-09-23T155707`, `BUG-2026-09-27T170000`, `BUG-2026-09-27T170100` |

Les correctifs du tour 2 tiennent dans le code, et chaque test ajouté tue la mutation qu'il nomme :
R2-1 (6 interventions au lieu de 5), les quatre sites de R2-2, R2-6 et R2-9. Réponses concordantes
aux questions posées : `declared` n'est rempli que par `declarationsOfReport`, ou vaut une carte vide
sans rapport (`specificationObjective` n'a qu'un appelant, `clarify.ts:186`, `answersOf` qu'un seul en
production, `specify.ts:29`) ; le document des exigences recopie une question close et répondue
`observable: false` sans exigence, une question ouverte `observable: true` (chaque branche mutée fait
échouer 2, puis 9 ou 14 tests) ; le refus « busy » ne peut pas manquer de runtime, les deux sites
appelant d'abord `session.runtime()`, qui lève, et `lang()` retombe sur `"fr"` comme les autres
messages de ces sites ; `/495 decide` sans garde `busy` reste antérieur à la branche, l'option de
clôture passant par le même `decision.answer`, contre la même décision en attente et la même
révision. Aucun chemin de M1, M3, M6 ou M7 trouvé par A ; B en trouve un sous mutation (R3-1).

### À corriger

**R3-1 — La ligne qui fait de `observable: false` une proposition n'est tenue par aucun test, et R2-3
a retiré la seule défense qui en aurait vu la régression.** B. Introduit par la branche. Lieux :
`if (!a.observable) return false;` de `declarationHolds` (`state.ts:328`), avec `answersOf`
(`state.ts:416-419`), qui écrit désormais `observable: true`. Chaque déclaration non observable des
tests porte `requirement_ids: []`, cas que `named.length > 0` refuse déjà : la ligne n'y décide rien.
Scénario (sonde de bout en bout de B) : « 422 » répondu, le rapport réécrit déclare
`{question_id: q1, observable: false, requirement_ids: ["REQ-UPDATE"]}`, `REQ-UPDATE` obligatoire. Avec
la ligne, arrêt `stagnation` qui nomme la proposition. Sans elle, la proposition compte comme une
liaison, `answersOf` la recopie `observable: true` liée à `REQ-UPDATE`, G1 passe et le changement se
ferme sans que le propriétaire ait tranché la proposition du modèle : la menace M1. À `60b25f6`, la
même mutation était vue : `answersOf` recopiait `d.observable`, et G1 refusait (§6g) ; depuis R2-3, le
refus de G1 du §6g ne peut plus être atteint depuis la conduite, quelle que soit l'entrée, alors que
`specs/security/REVIEW.md` le nomme encore le dernier rempart de M1. Preuves : chez B, la ligne
retirée, sortie 0 sur les fichiers de la story et sur `npm test` (528) ; la sonde sort 0 à `ac71f0a` et
1 sous la mutation ; la même mutation sur le `state.ts` de `60b25f6` donne G1 FAIL. Rejoué par le
coordinateur à `ac71f0a` : la ligne remplacée par un commentaire, les quatre fichiers de la story
sortent 0, 132 tests sur 132. Correctif proposé : un test, sans mécanisme nouveau — une variante du
test unitaire de 6f (`change-rules.test.ts`, vers la ligne 295) dont la déclaration est
`{observable: false, requirement_ids: ["R1"]}`, R1 obligatoire, qui attend `ignored` égal à `[q1]` ; ou
la sonde de bout en bout, qui attend un arrêt `stagnation` nommant la proposition. En option, resserrer
`declared` en `Map<string, string[]>`, ce qui retire le champ `observable` toujours vrai et les deux
commentaires qui l'expliquent (voir R3-5).

**R3-2 — Des identifiants de constats de relecture dans des noms et des commentaires de tests.** A et B.
Introduit par la branche (`8fbb720`, `5573e8f`) : `git grep "R[0-9]-[0-9]" main -- src test` ne trouve
rien. Lieux : le commentaire de `test/v0/change-rules.test.ts:486` (« (R2-2) ») ; les titres de
`change-rules.test.ts:495, 515, 538, 563, 610, 668`, de `test/v2/specification-reopening.test.ts:621`
et de `test/v3/question-closure.test.ts:231`. « R2-4 » dit « tour 2, constat 4 » : la métadonnée de
relecture que `CONVENTIONS.md` § Commit Messages et la règle globale du propriétaire, qui vise les
commentaires, écartent ; l'identifiant ne désignera plus rien une fois la relecture close. A relève
aussi que les commentaires de `change-rules.test.ts:528` et `:579` fondent leur prémisse sur « a report
from before the branch », prémisse fausse puisque `answers[]` précède la branche : la vraie est que
`requirements()` ne lie rien à q1. Correctif : retirer les suffixes « R2-x », garder BES-02, M1, RM-024
et §12 ; reformuler les deux commentaires (« a document that binds nothing to q1 »).

### À peser

- **R3-3** (A, B) — le test de R2-4 n'observe pas que `busy` est relâché avant `conduct` : il lit
  `session.busy` une fois la commande entière rendue, ce que le `finally` de `conduct` garantit déjà.
  `await conduct(...)` déplacé dans le `try` : le test de R2-4 passe, le fichier échoue par le seul test
  de R1-3. La réponse au tour 2 (« puis vérifie qu'il est relâché avant `conduct` ») dit plus que le
  test. Sonde de A : `assert.ok(!pi.said.includes(session.busyRefusal()))` passe sans mutation, échoue
  sous elle.
- **R3-4** (A, B) — R2-5 n'a pas de test : `busyRefusal()` toujours en français passe la suite (528 chez
  A), comme le retrait de l'`emit` du refus de `/495 close` (`command.ts:227`), qui devient muet ; le
  §6j veut un refus « en disant pourquoi », et le test « busy » ne vérifie que l'absence de
  confirmation et d'écriture. Correctif : `assert.ok(pi.said.includes(session.busyRefusal()))`, et en
  option une session anglaise.
- **R3-5** (A, B) — un invariant tenu par trois commentaires (`context.ts:253-256`, `state.ts:416-418`,
  `state.ts:316-322`) alors que le type de `declared`, `Map<string, AnswerDeclaration>`, admet encore
  `observable: false` (Primitive Obsession) ; « never the third case » (`context.ts:256`) renvoie à une
  branche que le code n'a plus. Correctif : ne rendre de `declarationsOfReport` que ce qu'une
  déclaration tenue porte.
- **R3-6** (A, B) — Duplicated Code : les deux tests légataires de `specificationStanding`
  (`change-rules.test.ts:549-553`, `:575-581`) recopient le corps de `stripClosedFields`, écrit
  quelques lignes plus haut.
- **R3-7** (A) — `question-closure.test.ts:236-240` remplace `ctx.ui.confirm` sur une instance de
  `FakeContext` : un bouchon en ligne par-dessus la classe factice. Correctif : un point d'observation
  des confirmations dans `FakeContext`.
- **R3-8** (A, B) — la raison écrite pour R2-7 est en partie fausse : TypeScript peut prouver que
  l'acteur est posé avec l'instant pour un seul objet facultatif `closure: {at, by}`, variante que R2-7
  nommait, dont `isQuestionClosed` serait le garde de type et qui retirerait `&& s.closed_by`
  (`clarify.ts:150`). Le reste tient : `verifyIntegrity` sans appelant dans `src/`, cinq assertions
  `null` à réécrire, comportement inchangé.
- **R3-9** (A) — un client RPC qui ne répond jamais à la confirmation de `/495 close` garde `busy` ; les
  dialogues de Pi acceptent `{timeout, signal}` (`ExtensionUIDialogOptions`), aucun dialogue de 495 n'en
  passe. Même classe que le `select` d'IH-01 que `conduct` présente sous `busy`.
- **R3-10** (A, B) — R2-8 est partiel : `question-closure.test.ts:5` et le titre de la ligne 327 disent
  encore l'outil pourvu d'opérations « read and start » seules.
- **R3-11** (A, B) — des sujets de commit décrivent la relecture et non un comportement (`ac71f0a`,
  `0e7ee41`, `9345eeb`) ; `5573e8f` dit que `/495 close` tient `busy` pendant sa confirmation,
  comportement déjà présent à `60b25f6` (vérifié par le coordinateur : `command.ts:235` y pose le
  drapeau), le commit n'ajoutant que le refus localisé. B relève 13 commits de `main` qui nomment un
  tour de relecture. Une fusion écrasée les effacerait.

### Antérieurs à la branche, selon A et B — à situer (fix-or-log)

- **P3** — `/495 verify` pose et lève `busy` sans le lire (`command.ts:104-119`). Un `verify` lancé
  pendant qu'un autre détenteur attend un dialogue lève le drapeau sous lui, par son `finally` ; A
  enchaîne : `/495 close` attend sa confirmation, un `verify` échoue vite en clarification et lève
  `busy`, un `/495 resume` passe la garde de `conduct`, et la clôture en attente peut tomber au milieu
  de la conduite, dans la fenêtre de R1-7. B ajoute que `/495 resume` inscrit `harness.resume`
  (`command.ts:97`) avant la garde de `conduct`. Placé antérieur par les deux : `conduct` tenait déjà
  `busy` pendant `presentDecisions`, et `verify` le levait de même. La branche ajoute pourtant un
  détenteur, la confirmation de `/495 close`, et la conséquence nommée par A est propre à la clôture :
  la réponse au tour dit si la branche rend ce défaut atteignable (règle 1). Non reproduit. La
  documentation de Pi (`rpc-commands.md`) dit qu'une commande d'extension s'exécute immédiatement
  pendant le flux du modèle ; qu'elle s'exécute aussi pendant une autre commande d'extension est déduit,
  pas lu. Correctif proposé par A : refuser par `session.busyRefusal()` quand `busy` est posé, comme
  `tool.ts:73`, sans état ni entrée nouvelle.

### Mutations

Tuées : 12 chez A, 14 chez B — R2-1 ; les quatre sites de R2-2 ; `answersOf` sur l'état légataire ;
chaque branche d'`answersOf` inversée ; la demande qui dit toujours « to declare » ; `busy = true`
retiré de `/495 close` ; la levée retirée du `finally` ; R2-6 ; R2-9. Survivantes : la ligne
`observable` de `declarationHolds` (R3-1, rejouée par le coordinateur) ; `busyRefusal()` en français
seul et le refus muet (R3-4) ; `conduct` déplacé dans le `try`, que le test de R2-4 laisse passer
(R3-3). Deux survivantes sans constat, selon B : la comparaison légataire de `decide.ts:388`,
équivalente puisque la liste de `:381` nomme déjà chaque question matérielle, et celle de
`state.ts:384`, qui échoue du côté sûr (un dossier légataire s'arrête au lieu d'être rouvert).

### Non vérifié

Ni A ni B n'a lancé Pi en TUI ou en RPC, ni rejoué de campagne ; P3 et R3-9 sont argumentés sur le code
et la documentation de Pi ; `dist/` n'est vu qu'à travers `lint:distribution` ; B n'a lu que les §5 à 12
et 17 de la story, A que les passages modifiés de `specs/security/REVIEW.md`.

## Réponse au tour 3

Chaque constat, un par un ; corrigé ou écarté avec sa raison, aucun laissé sans décision
(`CONVENTIONS.md` § Review).

- **R3-1 (à corriger)** — corrigé par le test. Une variante de 6f (`change-rules.test.ts`) déclare
  `{observable: false, requirement_ids: ["R1"]}` sur une exigence obligatoire et attend que
  `declared` ne tienne pas `q1` et que la spécification le tienne pour ignoré : rejoué à la main, la
  retirer de `declarationHolds` fait échouer ce seul test (134 sur 134 sinon, les quatre fichiers de
  la story, 132 + les 2 tests ajoutés au tour 3). Le correctif optionnel proposé (resserrer `declared`
  en requirement ids seuls) est fait, voir R3-5. En vérifiant ce constat, `specs/security/REVIEW.md`
  (§ M1) s'est trouvé tenir la même affirmation obsolète que R2-3 avait rendue fausse : il disait
  encore `gateG1` « dernier rempart » d'une réponse non observable, alors que ce chemin n'est plus
  atteignable depuis la conduite ; corrigé dans le même mouvement (règle 1, un défaut que la relecture
  découvre appartient à la branche qui le rend inatteignable de vue).
- **R3-2 (à corriger)** — corrigé, les deux points. Les neuf identifiants « R2-x » sont retirés des
  titres et du commentaire de test qui les portaient (`change-rules.test.ts`,
  `specification-reopening.test.ts`, `question-closure.test.ts`), BES-02, M1, RM-024 et §12 gardés ;
  la vraie raison des deux commentaires à prémisse fausse est écrite (`requirements()` et le rapport
  légataire du test ont un `answers` vide, ils ne nomment simplement pas q1 — rien à voir avec leur
  antériorité à la branche).
- **R3-3 (à peser)** — corrigé. Le test de R2-4 observe désormais directement que `conduct` n'est pas
  lui-même refusé pour cause de `busy` (`!pi.said.includes(session.busyRefusal())`), ce que sa
  seule assertion finale (`session.busy === false`) ne garantissait pas. Rejoué à la main : déplacer
  `await conduct(...)` dans le `try` de `/495 close` (`command.ts`) fait échouer ce test par sa
  propre assertion, et le test de clôture bout en bout par la sienne (G0 non évalué) — la régression
  était déjà tenue par la suite, seul le test dédié se taisait dessus.
- **R3-4 (à peser)** — corrigé, les deux mutations. Le test « busy » existant vérifie maintenant que
  le message dit est bien celui du refus (« opération est déjà en cours »), tué par le retrait de
  l'`emit` de `/495 close` (`command.ts:227`) ; un nouveau test ouvre une session anglaise
  (`HARNESS495_LANGUAGE=en`) et vérifie le texte anglais du refus, tué par `busyRefusal()` recopiant
  le français sans lire `lang()`. Les deux mutations rejouées séparément : chacune ne fait échouer que
  le ou les tests qui la visent (1, puis 2).
- **R3-5 (à peser)** — corrigé. `declared` (`declarationsOfReport`, `SpecificationStanding`,
  `specificationObjective`, `writeSpecification`) est retypé `Map<string, string[]>` (les requirement
  ids, plus rien d'autre) : `AnswerDeclaration` ne sert plus qu'aux déclarations brutes d'un rapport
  (`DeclaringReport.answers`), là où `observable` varie réellement. Les deux commentaires qui
  soutenaient l'invariant « toujours observable » (`context.ts:253-256`, `state.ts:416-418`)
  disparaissent avec le champ qu'ils expliquaient ; celui de `declarationHolds` (`state.ts:315-323`,
  BES-02) reste, il documente la règle métier de la fonction, pas un type. Comportement inchangé :
  `npx tsc --noEmit` propre, les 530 tests passent, `dist/` reconstruit.
- **R3-6 (à peser)** — corrigé. `stripClosedFields` est scindée en un `legacyState(state, id)` pur
  (`change-rules.test.ts`), qui rend la copie sans écrire dans un `Runner`, et un `stripClosedFields`
  qui l'appelle. Les deux tests de `specificationStanding` sur un état légataire appellent
  `legacyState` au lieu de recopier son corps.
- **R3-7 (à peser)** — corrigé. `FakeContext` porte un point d'observation, `onConfirm`, appelé par
  son propre `ui.confirm` avant de répondre ; le test de R2-4 le pose au lieu de remplacer
  `ctx.ui.confirm` par un stub en ligne.
- **R3-8 (à peser)** — reconnu, la raison de R2-7 précisée ici plutôt que réécrite au tour 2 (comme
  R2-9 a précisé R1-10 au tour précédent). TypeScript peut bien prouver l'invariant que R2-7 écartait :
  avec un objet facultatif unique `closure: {at, by}` (la variante que R2-7 nommait), un seul champ
  garde les deux, et `clarify.ts:150` perdrait `&& s.closed_by`. La disposition ne change pas pour
  autant — aucun bénéfice observable ne justifie de réécrire cinq assertions `assert.equal(…, null)`
  pour un comportement inchangé — seul le « TypeScript ne peut pas prouver » de tour 2 était faux ; la
  bonne raison est qu'aucun consommateur (`verifyIntegrity` sans appelant) ne rendrait aujourd'hui la
  preuve utile.
- **R3-9 (à peser)** — écarté, avec raison. Un client RPC qui ne répond jamais à la confirmation de
  `/495 close` garde `busy` pour la session, mais c'est la même classe que le `select` d'IH-01 que
  `conduct` présente déjà sous `busy` pendant `presentDecisions`, présente avant la branche : celle-ci
  ajoute une instance de plus à un risque déjà accepté, elle n'en ajoute pas un genre nouveau (même
  raisonnement que le second point de R2-4 au tour 2). À revoir ensemble si un mécanisme de timeout de
  dialogue (`{timeout, signal}`, que Pi expose) est un jour posé sur l'un des deux.
- **R3-10 (à peser)** — corrigé, les deux relevés restants. Le commentaire de tête et le titre du test
  M3 de `question-closure.test.ts` cessent de dire l'outil pourvu d'opérations « de lecture et de
  démarrage » ; ils disent qu'aucune de ses sept opérations ne décide, n'adopte ni ne clôt, comme
  `specs/security/REVIEW.md` le dit déjà depuis R2-8.
- **R3-11 (à peser)** — écarté, avec raison. Les sujets de commit qui se réfèrent à un tour de
  relecture (`ac71f0a`, `0e7ee41`, `9345eeb`, et les treize que B relève sur `main`) datent d'une
  branche encore en revue, pas de l'historique qu'une fusion y laissera : `release-branch` fusionne en
  écrasant, ce qui les efface avec le détail des tours au profit d'un message qui décrit le
  comportement livré. Réécrire l'historique intermédiaire maintenant n'apporterait rien que la fusion
  ne fasse déjà, pour le risque de rebase sur une branche encore ouverte à trois tours.
- **P3 (antérieur, fix-or-log)** — situé, ne retient pas la porte (règle 1), loggé. `conduct` tenait
  déjà `busy` pendant `presentDecisions` avant la branche, et `verify` levait déjà le drapeau sans le
  lire depuis le même code sur `main` : la branche ajoute un détenteur de plus (la confirmation de
  `/495 close`) à une exposition déjà atteignable par la décision IH-01 que `conduct` présente, elle
  n'ouvre pas un chemin qui ne l'était pas. Non reproduit contre un Pi réel : `rpc-commands.md` dit
  qu'une commande d'extension s'exécute immédiatement pendant le flux du modèle, ce qui ne dit rien de
  deux commandes d'extension qui se chevaucheraient sur une même session — déduit, pas lu. Loggé
  `BUG-2026-09-27T220000` (`specs/bugs/registry.yaml`) plutôt que fixé à l'aveugle : reproduire contre
  un Pi réel avant de poser une garde sur `verify` que rien n'aura confirmée nécessaire.

Preuves : chaque correctif a son test, chacun vérifié rouge sous la mutation qu'il vise et vert sans
elle, rejouée à la main : R3-1 (retrait de la ligne `observable` de `declarationHolds`, sur les quatre
fichiers de la story, 134 tests : 1 échec, le seul nouveau) ; sur `question-closure.test.ts` seul (10
tests) : R3-3 (`conduct` déplacé dans le `try` de `/495 close`, 2 échecs), R3-4a (`busyRefusal()` figé
en français, 1 échec), R3-4b (`emit` retiré du refus de `/495 close`, 2 échecs). `npm run build && npm
run check` sous Node 26.9.0, sortie 0, 530 tests (528 + 2 nouveaux), `dist/` reconstruit, tous les
`lint:*` verts.

## Tour 4 — `git diff ac71f0a e0c8608`, le 2026-09-27

| | |
|---|---|
| Relecteur A | **FAIL** — 0 bloquant, 2 à corriger, 4 à peser |
| Relecteur B | **FAIL** — 0 bloquant, 1 à corriger, 4 à peser, 1 antérieur |
| Porte | **FAIL** |
| Preflight à la révision relue | `npm run build && npm run check` sous Node 26.9.0, sortie 0, 530 tests, tous les `lint:*` verts : chez le coordinateur (20:34:45Z à 20:38:20Z), chez A (20:40:31Z à 20:44:12Z) et chez B (20:40:39Z à 20:44:21Z), avant toute mutation |
| Commande de vérification des relecteurs | les quatre fichiers de test de la story avec `--test-concurrency=1` : sortie 0, 134 tests, chez A comme chez B |
| Registre ouvert, non compté | `BUG-2026-09-23T155707`, `BUG-2026-09-27T170000`, `BUG-2026-09-27T170100`, `BUG-2026-09-27T220000` |

Les correctifs du tour 3 tiennent dans le code, et chaque mutation que le tour nommait est tuée :
la ligne `observable` de `declarationHolds` (seul le test nouveau échoue), `conduct` déplacé dans le
`try` de `/495 close` (2 échecs, dont l'assertion nouvelle), `busyRefusal()` figé dans une langue
(1 échec, dans chaque sens), l'`emit` du refus retiré (les deux tests « busy »). Réponses concordantes
aux questions posées : le retypage de `declared` en `Map<string, string[]>` ne prive aucun
consommateur (seul `requirement_ids` était lu ; `clarify.ts:92` lit le rapport brut), et une entrée ne
peut pas être un tableau vide, `declarationHolds` exigeant une exigence obligatoire nommée ;
`HARNESS495_LANGUAGE` est sauvé et restauré ; `onConfirm` est un point d'observation de la classe
factice. Le paragraphe M1 corrigé de `specs/security/REVIEW.md` est exact : `gateG1` écarte une
question close avant de lire `observable` (`decide.ts:485`), `answersOf` écrit `observable: true` pour
toute question ouverte, et `declarationHolds` est le seul rempart sur ce chemin. A et B acceptent les
dispositions de R3-8 et R3-9 et le placement de P3 avant la branche ; tous deux contestent celle de
R3-11.

### À corriger

**R4-1 — Le commentaire de G1, celui du contrat et le §6g de la story disent encore que le refus
de G1 est un dernier rempart, ce que la correction de `specs/security/REVIEW.md` a démenti.** A et B.
Introduit par la branche : vrai à la révision qui l'a écrit (`33a3bd6`), faux depuis qu'`answersOf`
ne recopie plus `observable`. Lieux : `src/domain/change/decide.ts:493-495` (« the last rempart, since
the clarification stops on this proposal before G0 », avec un mot français dans un commentaire
anglais) ; `src/contracts/v1/protocol.ts:219-221` (A), qui dit que la déclaration `observable` vient de
la spécification, alors qu'elle vient désormais de l'état de clôture ; le §6g de la story, lignes
139-140 (« le refus reste le dernier rempart »). Preuves : la sonde de A et celle de B enchaînent
`declarationsOfReport`, `answersOf` et G1 sur `{q1, observable: false, requirement_ids: ["R1"]}`, R1
obligatoire — à `e0c8608`, G1 échoue sur « no requirement carries », jamais sur la branche
`observable` ; la ligne de `declarationHolds` retirée, `answersOf` rend `observable: true` lié à R1 et
**G1 passe**. Retirer le refus non observable de G1 ne fait échouer qu'un test sur 530
(`change-rules.test.ts:260`, un document construit à la main) (B). A note que c'est la croyance en ce
second rempart qui a laissé la ligne de R3-1 sans test. Vérifié par le coordinateur : les trois textes
sont tels que cités. Correctif proposé, sans mécanisme nouveau : dire aux trois endroits que G1 refuse
un tel document quel qu'en soit l'auteur, mais que la conduite n'en construit jamais, `declarationHolds`
écartant la proposition avant ; ne pas rendre à `answersOf` la recopie d'`observable`, qui rouvrirait
le chemin que R2-3 a fermé (B). A signale une variante qui ajoute un chemin, donc à concevoir d'abord
(règle 2) : qu'`answersOf` écrive `observable: false` pour une réponse ouverte dont la dernière
déclaration brute est une proposition, ce qui lui donne une seconde entrée.

**R4-2 — Des sujets de commit portent la métadonnée de relecture, et la raison écrite pour R3-11
repose sur une fusion écrasée que l'historique de `main` dément.** A (à corriger), B (à peser).
Introduit par la branche. Lieux : `e0c8608` (« hands question closure off to a fourth review
round »), `ae8e3de` (« records the disposition of every question-closure review finding »),
`8b45435` (« records the question-closure review as failing ») et la fin du sujet de `6dbf83a`
(« removes review-round identifiers ») — `CONVENTIONS.md` § Commit Messages écarte « which review
round ». La réponse à R3-11 dit que `release-branch` fusionnera en écrasant ; or `main` est linéaire et
e01s02 y est entrée commit par commit, ses sujets de relecture compris (`6f2bd30`, `aefa6b7`,
`0263b18`, `545a661`). Vérifié par le coordinateur : `git log main --merges` ne rend rien, `main`
compte 435 commits, les quatre sujets cités nomment un tour ; le dépôt n'a pas de
`scripts/land-branch.sh`, et celui du paquet bigpowers, que `release-branch` appelle en solo-local,
fusionne bien par `git merge --squash` (ligne 151) — mais la livraison précédente n'est pas passée
par lui. Correctif proposé, sans mécanisme nouveau : consigner dans la passation que cette branche
entre dans `main` par `git merge --squash`, sous un message qui dit le comportement livré, ou
réécrire ces sujets avant la livraison ; et corriger la disposition de R3-11.

### À peser

- **R4-3** (A) — R3-6 est partiel : `test/v0/change-rules.test.ts:499-503` recopie encore le corps de
  `legacyState` (clone JSON, recherche, retrait des deux champs), quelques lignes au-dessus de
  l'utilitaire (Duplicated Code), sous le nom `preBranch`, vocabulaire de processus que R3-2 retirait
  des commentaires. Vérifié par le coordinateur.
- **R4-4** (A) — `export interface AnswerDeclaration` (`state.ts:304`) n'a plus d'importeur hors de
  `state.ts` depuis `6a9aeae` ; `lint:exports` ne regarde que les fonctions et les constantes.
  Vérifié par le coordinateur (`grep` sur `src/`).
- **R4-5** (A, B) — deux relevés que le code contredit : la réponse à R3-5 (et la passation de
  `state.yaml`) dit que le commentaire de `state.ts:416-418` disparaît, alors qu'il est reformulé et
  gardé (`state.ts:408-410`, vrai du type nouveau) ; la réponse à R3-8 dit qu'aucun consommateur ne
  rendrait la preuve utile, dans la phrase même qui nomme `&& s.closed_by` de `clarify.ts:149` comme ce
  qu'elle retirerait (A). La disposition de R3-8 tient.
- **R4-6** (A) — aucun test ne tient qu'une proposition d'un rapport réécrit efface la liaison dont
  il hérite. La mutation `else declared.delete(…)` → `else if (a.observable) declared.delete(…)`
  (`state.ts:349`) survit à toute la suite chez A (530 sur 530) ; rejouée par le coordinateur sur les
  quatre fichiers de la story : sortie 0, 134 sur 134. Sous elle, la proposition est ignorée et la
  réponse reste liée à l'exigence obligatoire héritée : pas une fuite de M1, l'obligation restant, mais
  l'arrêt du §6c n'est pas tenu dans ce cas. Placé par A dans la branche, à un tour antérieur, hors du
  diff de ce tour. Correctif : un test unitaire où un rapport antérieur lie q1 à R1, le rapport courant
  déclare `{q1, observable: false, requirement_ids: []}`, et `ignored` vaut `[q1]`.
- **R4-7** (B) — le test « busy » en français dépend de `HARNESS495_LANGUAGE` absent de
  l'environnement : `HARNESS495_LANGUAGE=en node --test test/v3/question-closure.test.ts` fait échouer
  1 test sur 10 (rejoué par le coordinateur : sortie 1, 9 sur 10). Sur toute la suite, 6 échecs sur
  530, dont 5 antérieurs à la branche selon B (`model-select:528`, `pi-entries:96,136`,
  `pi-rpc-sdk:225,305`). Correctif : `delete process.env.HARNESS495_LANGUAGE` dans ce test, que
  l'`afterEach` restaure déjà.
- **R4-8** (B, A pour le second point) — Duplicated Code : le test nouveau recopie le bloc « ouvrir
  une question matérielle, puis un humain y répond », présent six fois dans `change-rules.test.ts`
  avec « 422 ou 400 ? » ; un `answerMaterialQuestion` près de `closeMaterialQuestion` les retirerait.
  Le message de sa première assertion (« declarationHolds refuses the declaration before
  requirement_ids is read ») nomme une fonction privée et un ordre d'évaluation que le test ne peut
  pas observer.

### Antérieur à la branche, selon A et B — ne retient pas la porte

- **P4-1** (B) — la question que laissait ouverte `BUG-2026-09-27T220000` est tranchée par la
  source de Pi 0.87.1 épinglée, lue et non exécutée : le mode RPC lance chaque ligne reçue sans
  l'attendre (`void handleInputLine(line)`, `dist/modes/rpc/rpc-mode.js:647`), le cas `prompt` lance
  `session.prompt` de même (`:302`), et `AgentSession.prompt` exécute une commande d'extension
  aussitôt, sans verrou (`dist/core/agent-session.js:1216-1224`). Deux commandes `/495` sur une même
  connexion RPC peuvent donc se chevaucher pendant un `await`. Vérifié par le coordinateur, en lecture.
  Le défaut reste antérieur (A : à `8e7d931`, `verify` posait et levait déjà `busy` sans le lire, et
  `conduct` le tenait déjà pendant `presentDecisions`) ; mais l'échelle fix-or-log ne permet de loguer
  que tant que la reproduction reste bloquée, ce qu'elle n'est plus à la lecture. La garde proposée au
  tour 3 (refuser par `session.busyRefusal()` quand `busy` est posé, comme `tool.ts`) relève de
  quick-fix.

### Mutations

Tuées : 7 chez A, 7 chez B — la ligne `observable` de `declarationHolds` ; `conduct` dans le `try` de
`/495 close` ; `busyRefusal()` figé en français, puis en anglais ; l'`emit` du refus retiré ; un refus
français écrit en dur ; `declarationsOfReport` qui ne garde que la première exigence, ou aucune ;
l'objectif qui n'imprime aucune exigence ; le refus non observable de G1 retiré (tué par le seul
`change-rules.test.ts:260`, voir R4-1). Survivantes : `HARNESS495_LANGUAGE` retiré de la liste
sauvée, sans effet puisque chaque fichier tourne dans son propre processus et qu'aucun test suivant ne
dépend de la langue (A) ; `else if (a.observable) declared.delete(…)` (R4-6, rejouée par le
coordinateur).

### Non vérifié

Ni A ni B n'a lancé Pi en TUI ou en RPC, ni rejoué de campagne ; P4-1 est lu dans la source de Pi, pas
exécuté ; `dist/` n'est vu qu'à travers `lint:distribution` ; A n'a lu en détail que le §6g, les
contrats et le §15 de la story, B que les §6c à 6j ; B n'a pas mesuré la couverture.

## Réponse au tour 4

Chaque constat, un par un ; corrigé ou écarté avec sa raison, aucun laissé sans décision
(`CONVENTIONS.md` § Review).

- **R4-1 (à corriger)** — corrigé, sans mécanisme nouveau. Les trois textes cessent de dire le refus
  non observable de G1 un second rempart que la conduite atteindrait : le commentaire de
  `decide.ts:492-497` dit que G1 refuse un tel document depuis n'importe quel producteur, mais que
  `answersOf`, le seul producteur de la conduite, n'en construit jamais, puisque `declarationHolds`
  écarte la proposition avant qu'elle puisse lier et qu'`answersOf` écrit `observable: true` pour
  toute question ouverte quelle qu'elle soit ; le commentaire d'`AnsweredQuestion`
  (`protocol.ts:219-224`) cesse de dire qu'`observable` vient de la spécification, et dit qu'il vient
  de l'état de clôture de la question seul ; le §6g de la story dit que G1 refuse un tel document de
  n'importe quel auteur, que la conduite n'en construit plus aucun, et que le cas s'arrête en
  clarification comme au 6f. La recopie d'`observable` n'est pas rendue à `answersOf` (la variante que
  A signalait comme rouvrant le chemin que R2-3 a fermé n'est pas prise) : aucun mécanisme nouveau,
  seule la prose change. Comportement inchangé.
- **R4-2 (à corriger)** — corrigé pour les quatre sujets du diff de ce tour, et la disposition de
  R3-11 corrigée. Les quatre sujets qui décrivaient la relecture plutôt qu'un comportement sont
  réécrits par un `git commit-tree` message par message (arbre et auteur inchangés, branche locale,
  jamais publiée) pour dire le contenu livré : l'un enregistre qu'aucun test ne tenait la ligne
  `observable` de `declarationHolds` et que des titres de test portaient des étiquettes numériques
  périmées ; un autre règle chaque défaut ouvert de la clôture de question — corrigé avec sa preuve,
  écarté avec sa raison, ou loggé comme bug ; un autre épingle la déclaration non observable, le refus
  « busy » dans la langue de la session, et retire les étiquettes et une prémisse fausse des titres et
  commentaires de test ; le dernier fait pointer la passation vers un nouveau contrôle sur le diff
  depuis le refus précédent. La disposition de R3-11 (écartée au tour 3, raison : « une fusion écrasée
  les effacera ») est fausse : `git log main --merges` ne rend rien (435 commits), et la story
  précédente est entrée dans `main` commit par commit, ses propres sujets de relecture compris
  (`6f2bd30`, `aefa6b7`, `0263b18`, `545a661`, déjà dans `main`). La correction de ce tour porte donc
  sur les quatre sujets que son propre diff introduisait ; les sujets antérieurs que R3-11 nommait
  (`ac71f0a`, `0e7ee41`, `9345eeb`) et les treize que B relevait sur cette branche restent tels quels —
  les réécrire en cascade sortirait du périmètre que ce tour relève, et la stratégie par laquelle la
  branche entière rejoint `main` (commit par commit, comme e01s02, ou autrement) reste une question
  ouverte pour `release-branch`, non tranchée ici.
- **R4-3 (à peser)** — corrigé. Le test légataire de `change-rules.test.ts` appelle désormais
  `legacyState(r.s, "q1")` au lieu de recopier son corps sous le nom `preBranch`.
- **R4-4 (à peser)** — corrigé. `AnswerDeclaration` (`state.ts:304`) perd son `export`, sans
  importeur hors de `state.ts` depuis `6a9aeae` ; `npm run build` avec `declaration: true` reste
  propre, TypeScript inscrivant l'interface non exportée dans le `.d.ts` du module qui la referme.
- **R4-5 (à peser)** — reconnu, la réponse au tour 3 corrigée ici plutôt que réécrite (comme R3-8 a
  précisé R2-7 sans réécrire le tour 2). Les deux relevés tiennent : le commentaire de
  `state.ts:416-418` n'a pas disparu avec `observable`, il est reformulé et gardé
  (`state.ts:408-410`, vrai du type resserré) — la réponse à R3-5 disait « disparaissent » à tort ; et
  la réponse à R3-8 se contredit dans sa propre phrase, qui nomme `&& s.closed_by` de
  `clarify.ts:149` comme ce qu'un `closure: {at, by}` unique retirerait — ce champ est donc bien un
  consommateur, la bonne raison restant que rien n'en tire aujourd'hui de preuve observable
  (`verifyIntegrity` sans appelant), pas qu'aucun consommateur n'existe. La disposition de R3-8 ne
  change pas.
- **R4-6 (à peser)** — corrigé par un test. Dans `change-rules.test.ts`, un rapport antérieur lie q1
  à R1 (obligatoire), puis le rapport courant déclare `{q1, observable: false, requirement_ids: []}` :
  `standing.declared.has("q1")` est vérifié faux et `standing.ignored` vaut `[q1]`. Rejouée à la main
  sur les trois fichiers de la story (`change-rules.test.ts`, `specification-reopening.test.ts`,
  `question-closure.test.ts`, 99 tests) : la mutation `else declared.delete(…)` →
  `else if (a.observable) declared.delete(…)` (`state.ts:349`) fait échouer ce seul test nouveau (98
  sur 99), sans elle 99 sur 99.
- **R4-7 (à peser)** — corrigé. `delete process.env.HARNESS495_LANGUAGE` ouvre le test « busy » en
  français de `question-closure.test.ts`, que l'`afterEach` restaure déjà ; rejoué avec
  `HARNESS495_LANGUAGE=en` déjà posé dans l'environnement avant le test, 10 sur 10 (1 sur 10 échouait
  avant le correctif).
- **R4-8 (à peser)** — corrigé, les deux points. `answerMaterialQuestion(r, id, question, answer?)`,
  à côté de `closeMaterialQuestion`, remplace le bloc « ouvrir une question matérielle, puis un humain
  y répond » à ses occurrences dans `change-rules.test.ts` (y compris celle du test de R4-6 et celle
  de R4-3) ; l'assertion qui nommait `declarationHolds` et un ordre d'évaluation dit maintenant « a
  proposal to fix nothing observable is never declared bound (M1) ».
- **P4-1 (antérieur, fix-or-log)** — la disposition change, le statut non. `BUG-2026-09-27T220000` ne
  reste plus bloqué en reproduction : son `evidence` cite désormais la lecture de la source de Pi
  0.87.1 (`rpc-mode.js:647,302`, `agent-session.js:1216-1224`) au lieu d'une déduction non confirmée,
  et son `follow_ups` demande de reproduire contre un Pi réel (sonde, puis test rouge) avant de poser
  la garde que le tour 3 propose — sized quick-fix une fois reproduit, pas corrigé à l'aveugle. Reste
  `open`, ne retient pas la porte (règle 1, antérieur à la branche).

Preuves : R4-6 a sa mutation rejouée sur les trois fichiers de la story (99 tests : 1 échec, le seul
nouveau) ; R4-7 rejoué avec `HARNESS495_LANGUAGE=en` dans l'environnement, `question-closure.test.ts`
seul (10 tests, 0 échec ; 1 échec avant le correctif). `npm run build && npm run check` sous Node
26.9.0, 21:36:13Z à 21:39:44Z, sortie 0, 531 tests (530 + 1 nouveau), `dist/` reconstruit, tous les
`lint:*` verts, `lint:exports` et `lint:declarations` compris (R4-4).
