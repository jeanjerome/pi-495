# Relecture — e01s04, une réponse donnée par erreur se révoque

Règles : `CONVENTIONS.md` § Review (`specs/adr/D-62`, `D-65`, `D-67`) — pas de pourcentage, constats
situés, plafond de cinq tours. Chaque relecteur, neuf et sans contexte commun, travaille sur sa copie
sous `$HOME` (arbre détaché, `node_modules` lié), supprimée après le tour.

## Tour 1 — `git diff main...0164a21` (base `a62a844`), le 2026-09-28

| | |
|---|---|
| Relecteur A | **FAIL** — 0 bloquant, 4 à corriger, 5 à peser, 3 antérieurs |
| Relecteur B | **FAIL** — 1 bloquant, 4 à corriger, 9 à peser, 2 antérieurs |
| Porte | **FAIL** |
| Preflight à la révision relue | non relancée (règle 3) : verte à `09aebe2` (`e01s04-cycle-rouge-vert.md`, § Preflight des commits verts) ; `0164a21` ne touche que `specs/` |
| Commande de vérification des relecteurs | les six fichiers de test de la story (`test/v0/change-rules`, `test/v2/answer-revocation`, `specification-reopening`, `preparation`, `test/v3/answer-revocation`, `question-closure`) avec `--test-concurrency=1` : sortie 0, 126 tests dans 22 suites ; `npm run typecheck` : sortie 0 ; chez A comme chez B, sous Node 24.21.0 |
| Registre ouvert, non compté | `BUG-2026-09-23T155707`, `BUG-2026-09-27T170000`, `BUG-2026-09-27T170100`, `BUG-2026-09-27T220000` |

Le noyau fait ce que les étapes 1 à 5 et les flux 6a, 6c, 6e, 6f, 6g et 6j disent, et chaque garde de
`requireRevocable` tient sous mutation chez A comme chez B. Ce qui retient la porte, c'est ce que la
révocation laisse derrière elle hors de l'état adopté : le budget de tentatives, l'historique des
candidats, les propositions que `latest` sert encore, et deux lignes que la suite ne tient pas.

Réponses concordantes aux questions posées : la provenance passe par `humanProvenanceIssue`, sans
copie plus faible ; `harness495` n'offre aucune révocation et sa surface reste épinglée ; le mode
`print` refuse sans rien inscrire ; une deuxième révocation passe, une question reposée et pas encore
résolue est refusée, et le rejeu des événements rend l'état qu'`apply` produit (A, sonde P7) ; les
identifiants DEC-06, M1 à M6, §12 et (6c) des commentaires et des titres suivent l'usage de `main`.

### Bloquant

**R1-1 — Un changement reconstruit qui a épuisé ses tentatives s'arrête sans recours.** B. Rendu
atteignable par la branche. Prémisse vérifiée par le coordinateur dans le code : `interventionStart`
bloque en `attempts_exhausted` quand un `implement` doit ouvrir une tentative et que le budget est
consommé (`src/domain/change/decide.ts:961-968`) ; `implement` rend l'unité dès qu'elle est bloquée
(`src/application/phases/implement.ts:59`) ; seul `correctOrStop` demande IH-07
(`src/application/phases/decide.ts:37-48`) ; `changeUnblock` refuse tant que le budget reste épuisé
(`decide.ts:1336-1340`). Sur `main`, `interventionStart` n'atteignait ce blocage pour un `implement`
qu'avec `max_attempts` à 0 : le budget s'épuisait sur une correction, qui demande IH-07. La
révocation close la tentative ouverte (`decide.ts:379`), ce qui la compte même quand son producteur
n'a jamais tourné, et ne rend pas le budget (§18).

- Scénario (sonde P6 de B, par le harnais) : acceptation humaine, deux corrections, IH-10 en attente
  à 3/3 tentatives ; trois révocations après un candidat mènent au même point. Le propriétaire
  révoque Q1 et répond de nouveau ; la spécification est réécrite (une intervention payée), G0 à G3
  passent ; `implement` bloque « 3/3 attempts consumed », aucune décision en attente. `/495 resume`
  ne lève pas l'arrêt, `/495 decide` ne présente rien : il ne reste qu'à annuler le changement, ce
  que la story veut éviter, et `CONVENTIONS.md` § Defensive Code veut que le coupe-circuit demande
  un humain.
- A arrive au seuil du même chemin sans le suivre (sonde P8) : une révocation sur budget épuisé
  retire IH-07 et lève l'arrêt.
- Correctif proposé par B (ajoute un comportement) : demander IH-07 quand le `intervention.start`
  d'un `implement` est refusé pour son budget, et mettre la demande IH-07 de `correctOrStop` dans une
  seule fonction appelée des deux sites. L'état bloqué naît dans `interventionStart` ; `advance`,
  `changeUnblock` et la réponse IH-07 le lisent ; deux sites y mènent alors. La règle 2 demande de
  concevoir ce correctif avant de le poser, y compris l'autre voie : que la révocation ne compte pas
  une tentative dont le producteur n'a pas tourné, ou qu'elle laisse IH-07 en attente quand le
  budget est épuisé.

### À corriger

**R1-2 — La révocation reste admise après l'acceptation du candidat.** A. Introduit par la branche.
Prémisse vérifiée par le coordinateur : `requireRevocable` ne refuse que la phase `integrating`
(`decide.ts:411`), alors qu'IH-10 « accepter » pose `acceptance_decision_id`
(`src/domain/change/apply.ts:318`) sans faire entrer le changement en intégration : `presentDecisions`
(`src/extension/conduct.ts:61-139`) inscrit la décision sans avancer, et `answerDecision` n'évalue G5
que pour « corriger » (`src/application/harness.ts:802`). Le changement attend en `deciding/ready`
jusqu'à `/495 integrate` ou une reprise. Sonde P10 de A : après l'acceptation, `revokeQuestion` passe,
la phase devient `clarifying`, l'acceptation est révoquée. La story borne la révocation à « tant que
son candidat n'est pas accepté » (§1 DEC-06 ADDED, §2, §4, §18) ; le §6h, « dès que le changement est
en intégration », suppose que l'acceptation y fait entrer aussitôt. Correctifs proposés : refuser
quand `acceptance_decision_id` est posé (un refus de plus, une seule entrée, `question.revoke`) ;
retirer la fenêtre en évaluant G5 dès l'acceptation, qui déborde la story ; ou, si la révocation doit
rester ouverte jusqu'à l'intégration, le dire aux §2, §4, §18 et §19.

**R1-3 — Le changement reconstruit est jugé en stagnation sur un candidat d'avant la révocation.** A
et B. Rendu atteignable par la branche. `changeCorrect` lit `candidate_history`
(`decide.ts:1205-1209`), que le cas `question.revoked` d'`apply` (`apply.ts:135-157`) laisse en place.
Scénario (sondes P1 de A et P3 de B) : le candidat F échoue à G5, une correction ouvre la tentative 2 ;
le propriétaire révoque et répond de nouveau ; le producteur reconstruit, privé à dessein du retour
d'avant, réécrit F, qui échoue ; après l'extension IH-07, le noyau bloque « 2 identical candidates
without measurable progress », arrêt non réessayable, alors que le changement reconstruit n'a produit
qu'un candidat. Témoin de A : un changement neuf, même producteur, tourne deux fois avant l'arrêt ;
avec `s.candidate_history = []` dans le cas `question.revoked`, le changement reconstruit tourne deux
fois et les six fichiers passent. La même clé porte le compteur de relances techniques
`budgets.retries["verify:<digest>"]` (`src/application/phases/decide.ts:88`), selon A et B, sur le
code seul. Correctif proposé : la remise à zéro dans `apply`, sans état nouveau (l'historique naît de
`candidate.frozen` et seul `changeCorrect` le lit), et la sonde en test de régression.

**R1-4 — Après une révocation, `latest` sert encore le protocole et les exigences proposés sous la
réponse révoquée.** B à corriger, A à peser. Rendu atteignable par la branche. `ArtifactRepository.latest`
(`src/application/artifacts.ts:74-78`) retombe sur la dernière proposition quand l'adoption est
retirée. Effets relevés :

- la consigne du `prepare` reconstruit dit « The kernel will judge your work by running … »
  (`src/application/context.ts:155`) avec les contrôles et les règles de structure du protocole
  révoqué (`harness.ts:532`, `:545-550`), ce que la première préparation ne reçoit pas (sonde P1 de
  B, P3 de A) ;
- `/495 report` et l'opération `report` de `harness495` listent `REQ-400` sous « Requirements »
  (`harness.ts:387-390`), liste que `src/application/report.ts:47` définit comme les exigences
  adoptées, et les risques résiduels du protocole révoqué (sonde P2 de B et de A) ;
- `state.candidate` garde le candidat d'avant la révocation, que montrent `/495 status`
  (`views.ts:133`), le rapport et `/495 review` par défaut (`harness.ts:718`) (C3 de B, A5).

A le pèse : la lettre du §14 et du §15 mesure l'état et les décisions, et le rapport lit déjà la
dernière proposition après un refus à G1 sur `main`. B le retient : le rapport contredit son propre
contrat, c'est le cas que M5 nomme (« le dossier affirmerait une chose que l'état contredit »), et la
consigne du `prepare` atteint le changement reconstruit, ce que le §14 vise. Correctifs proposés, sans
mécanisme nouveau : faire retomber `latest` sur `proposedSinceRevocation(state, kind).at(-1)` pour
les genres adoptés à une gate, `reference` et `request` exclus (proposés une fois à la création),
ce qui rendrait `currentSpecification` inutile ; ou faire lire l'adoption seule au rapport et à
`runIntervention` ; et, selon A, `candidate = null` dans `question.revoked`, que vérification,
relecture, décision et G5 ne lisent qu'après un nouveau gel.

**R1-5 — Aucun test ne tient que la décision révoquée est celle de la question (M4).** A et B.
Introduit par la branche. Retirer `&& d.decision_id === q.decision_id` (`decide.ts:363-365`) passe
les six fichiers : les tests révoquent toujours Q1, répondue avant Q2, si bien que `find` rend la
bonne décision par hasard. Sonde (P6 de A, KP1 de B) : Q1 puis Q2 répondues, Q2 révoquée ; sous la
mutation, `hd_q1` est révoquée et `hd_q2` reste valide ; la sonde passe sur la branche. Correctif : la
sonde en test, sans changement de comportement.

**R1-6 — Aucun test ne tient la coupure de l'héritage dans `specificationHistory`.** A et B. Introduit
par la branche. Rétablir le découpage de `main` (`Math.max(0, …)`, `slice(0, actedOn)`), ou calculer
`actedOn` sans la révocation (`artifacts.ts:115-121`), passe les six fichiers : les tests v2 passent de
`REQ-400` à `REQ-422`, si bien que la déclaration héritée ne tient jamais. Sonde (P5 de A et de B) :
le rapport réécrit après la révocation garde l'exigence liée à Q1 et ne dit rien de Q1 ; sur la
branche, la spécification est rouverte puis le changement s'arrête en stagnation avant G1 ; sous la
mutation, G1 passe et lie « 422 » à l'exigence écrite pour « 400 », le défaut que l'epic ferme (§14,
§5 étape 6). Correctif : la sonde en test, sans changement de comportement.

### À peser

- **R1-7** (B) — un changement mis en pause pendant une vérification ne se révoque pas : l'opération
  de vérification reste ouverte et `requireRevocable` refuse `OPERATION_ACTIVE` (`decide.ts:420`),
  alors que rien ne tourne (sonde KP2) ; `/495 resume` relance la vérification et, sous l'acceptation
  automatique par défaut, G5 clôt le changement. De même après un arrêt brutal qui laisse l'opération
  ouverte. Introduit. Le correctif change un refus : registre, règle 6.
- **R1-8** (A, B) — une extension de budget IH-07, et selon A une décision IH-12, révoquée par le plan
  de la révision du mandat (`src/domain/invalidation.ts:39-49`) garde son effet : `max_attempts` reste
  relevé (sondes P9 de A, KP3 de B), et le rapport comme l'export disent révoquée une décision dont
  l'effet tient, contre M5 (« ne dit révoquée que d'une révocation dont l'effet est tenu »). Rendu
  atteignable. Correctifs proposés : écarter IH-07 et IH-12 du plan, ou défaire l'extension, ou dire
  au §18 que les extensions restent.
- **R1-9** (A, B) — `unstartedAttempt` (`artifacts.ts:205`) reprend un espace de travail préparé avant
  la révocation quand aucune des deux constructions n'a de préparation (`null === null`) : copie
  intacte de la référence, sans dommage, que le §8 admet, mais que le §14 (« repris : 0 ») et le
  dernier scénario du §17 excluent à la lettre ; le titre de `test/v2/answer-revocation.test.ts:316`
  promet le cas général et ne tient que celui de préparations différentes. Introduit. Texte seul.
- **R1-10** (B) — une qualification reprise porte la note « prepared suite on the bare reference… »
  d'une préparation retirée, recopiée dans les notes du protocole reconstruit
  (`src/application/verification.ts:193`, sonde P4 : la note en double). Rendu atteignable.
- **R1-11** (B, raisonnement seul) — `revokeQuestion` range la demande IH-01 après l'inscription
  (`harness.ts:1000`), quand `requestDecision` la range avant (`harness.ts:701`) : un échec de
  `putDecisionRequest` après l'inscription laisserait une IH-01 en attente qu'on ne peut ni présenter
  ni répondre. La mutation qui range d'abord survit. Introduit.
- **R1-12** (A, B) — lignes ajoutées que la suite ne tient pas, mutations survivantes : l'effacement
  de `mandate`, `requirement_ids` et `mandatory_requirement_ids` (`apply.ts:153-156`), visible dans le
  `state.json` exporté ; `answered_at` non effacé ; `human_decision_id` de `question.revoked` à `null` ;
  `preparation_id` non écrit, puis la normalisation `?? null` d'un espace enregistré sans lui
  (`artifacts.ts:205`, commentaire `:31-33`), si bien que la reprise d'un espace dont la préparation
  est encore adoptée n'est pas tenue ; le retour donné à un producteur reconstruit repris ; la langue
  de l'IH-01 reposée ; le texte anglais de la confirmation. Introduit. Tests, ou retrait de la
  normalisation.
- **R1-13** (A, B) — odeurs. *Duplicated Code* : `writtenBeforeLastAct` et `proposedSinceRevocation`
  (`artifacts.ts:128-157`) relisent chacune tout le journal pour compter les propositions, et
  `clarify` le relit trois fois par pas (A, B) ; la demande IH-01 est construite deux fois,
  `requestDecision` à la clarification et `buildDecisionRequest` dans `revokeQuestion`, la langue
  dérivée différemment — égales aujourd'hui parce que `mandate.language` vaut
  `requestedLanguage ?? "fr"` (B). *Mysterious Name* : `withoutPending` remet aussi le changement en
  `ready` (B).
- **R1-14** (B) — style des tests : `test/v3/answer-revocation.test.ts:39` remplace
  `process.stdout.write` en ligne, là où `CONVENTIONS.md` veut une classe factice pour une
  entrée-sortie ; `test/helpers/command-fixture.ts:32` porte l'identifiant de story « e01s02 », déplacé
  depuis `main` (règle du scout).

A relève sans le retenir que l'IH-01 reposée suit la langue du changement, comme à la clarification,
et la confirmation celle de la session, quand le §16 dit les deux dans la langue de la session : elles
ne diffèrent que si la langue réglée diffère de celle du changement.

### Antérieurs à la branche, selon A et B — ne retiennent pas la porte, à placer (fix-or-log)

- **P1** (A, B) — le rapport lit `latest` et non l'adoption : après un refus à G1, il liste des
  exigences proposées puis refusées. La part que la branche rend atteignable est R1-4.
- **P2** (A, B, raisonnement seul) — les notes de qualification s'accumulent à chaque reprise d'une
  qualification (`verification.ts:180-195`), dès que G2 est de nouveau atteinte après une préparation.
- **P3** (A) — après une acceptation IH-10, `presentDecisions` n'avance pas le changement, qui attend
  `/495 integrate` ou une reprise. C'est la fenêtre de R1-2 ; seule, c'est le comportement de `main`.

### Mutations

Tuées, chez A (36 sur 44) comme chez B : chaque garde de `requireRevocable` (provenance, changement
actif, matérialité, résolution, résolution par clôture, `integrating`, intervention qui tourne,
opération ouverte) ; dans `questionRevoke`, l'IH-01 non révoquée, la tentative non close, aucune
invalidation, aucun retrait, IH-01 retirées aussi, pause perdue ou forcée, pas de retour en
clarification, question non reposée ; dans `apply`, réponse, clôture, `decision_id`, adoptions ou
protocole gardés, `decision.withdrawn` sans effet, `withoutPending` sans remise en `ready` ; côté
application, aucune coupure dans `proposedSinceRevocation` ou `currentSpecification`,
`unstartedAttempt` sans comparaison des préparations, retour de correction pris au dernier, refus et
tours de préparation comptés d'avant la révocation, demande IH-01 non rangée, question nommée par son
identifiant au lieu de son texte ; export `revoked` toujours faux ; `/495 revoke` routée vers
`close`, sans confirmation, sans lecture ou maintien de `busy`, sans conduite après l'acte,
confirmation française.

Survivantes : celles de R1-5, R1-6, R1-11 et R1-12 ; et, équivalentes selon leurs auteurs,
`decision.withdrawn` sans remise du statut (`enter` suit), `resolvedBy` sans lecture de la validité
(la révocation repointe `q.decision_id`), l'acteur de la commande à la place de celui de l'origine
(le harnais passe `origin.actor`), `judged` pris à `attempts.at(-2)` (la tentative ouverte est
toujours la dernière), et un crochet que seuls les tests emploient (B).

### Non vérifié

Ni A ni B n'a conduit de session Pi réelle, TUI ou RPC, ni deux sessions concurrentes, ni le mode
`json` de `/495 revoke` ; ni un parcours d'intégration au-delà du refus `integrating` ; ni les piles
Maven ; ni la durée des lectures du journal sur un grand dossier ; ni la rédaction de l'export (B). Le
correctif de R1-3 a été posé puis retiré par A ; ceux de R1-1, R1-2 et R1-4 ne l'ont pas été. R1-11
repose sur le raisonnement seul.

## Réponse au tour 1

Chaque constat, un par un ; corrigé ou écarté avec sa raison, aucun laissé sans décision
(`CONVENTIONS.md` § Review). Tests d'abord, vus rouges sur leur assertion à `2b66063`, puis
`ec30acb` (noyau), `f2172d9` (notes de qualification, défaut antérieur P2, commit à part), `3233666`
(application) et `1479c27` (remaniement sans comportement). Rouges, verts et mutations :
`e01s04-cycle-rouge-vert.md`, § Réponse au tour 1 de la relecture.

- **R1-1 (bloquant)** — corrigé, sur le mécanisme existant. Conçu d'abord (règle 2) : l'arrêt
  `attempts_exhausted` naît dans le noyau à deux endroits, `correctionAuthorize` et
  `interventionStart` d'un `implement` qui doit ouvrir une tentative ; seul le premier menait à IH-07.
  Les deux autres voies ne couvrent pas le cas : ne pas compter la tentative close par la révocation
  laisse intact un budget réellement dépensé (la sonde P6 de B dépense trois tentatives de
  producteurs qui ont tourné), et garder IH-07 en attente à la révocation n'a pas d'objet quand c'est
  IH-10 qui attend. Le §18 veut que le changement reconstruit dépense sur le même budget, et
  `CONVENTIONS.md` § Defensive Code veut que le coupe-circuit demande un humain. La demande IH-07 est
  donc sortie de `correctOrStop` dans une seule fonction, `requestBudgetExtension`
  (`src/application/phases/phase.ts`), que `correctOrStop` et `implement` appellent quand le noyau a
  arrêté le changement pour son budget. Aucun état, aucun refus, aucune entrée nouvelle : l'état naît
  toujours dans le noyau, la réponse IH-07 le lève comme avant, et l'espace de travail préparé avant
  l'arrêt est repris par la tentative que l'extension ouvre. Test : trois reconstructions après un
  candidat épuisent le budget ; la quatrième demande IH-07, puis, l'extension accordée, implémente et
  attend IH-10. Le §18 le dit.
- **R1-2 (à corriger)** — corrigé par le refus proposé : `requireRevocable` refuse dès
  qu'`acceptance_decision_id` est posé, comme en intégration, avec un seul message, « the candidate
  is accepted; decline the integration or cancel the change ». Une seule entrée, `question.revoke`.
  Le §6h dit « un candidat accepté, par le propriétaire (IH-10) ou par G5 en entrant en intégration »,
  ce que les §1, §2, §4 et §18 disaient déjà. Test : IH-10 acceptée, la révocation est refusée et rien
  n'est inscrit.
- **R1-3 (à corriger)** — corrigé dans `apply`, sans état nouveau : `question.revoked` vide
  `candidate_history` et `budgets.retries`. Les deux ne comptent que ce qui a été mesuré sur un
  candidat ; les tentatives dépensées restent dépensées (§18). Test : un candidat d'avant la révocation,
  rebâti à l'identique, n'est jugé ni en stagnation ni en relance épuisée.
- **R1-4 (à corriger)** — corrigé, sans mécanisme nouveau. `ArtifactRepository.latest` retombe sur
  la dernière proposition écrite depuis la dernière révocation (`proposedSinceRevocation`), hors la
  référence, relevée à la création avant toute question ; la demande reste lue par son adoption.
  `currentSpecification` devient inutile et disparaît : `clarify.ts` revient à sa ligne de `main`.
  `question.revoked` pose `candidate = null` : vérification, relecture, décision et G5 ne le lisent
  qu'après un nouveau gel, et `/495 status`, le rapport et `/495 review` ne montrent plus le candidat
  d'avant. Tests : le rapport d'un changement révoqué ne liste ni exigence ni candidat ; la consigne
  de la préparation reconstruite ne nomme aucun contrôle du protocole révoqué (prompt système). Le
  §8 le dit.
- **R1-5 (à corriger)** — corrigé par la sonde en test (M4) : Q1 puis Q2 répondues, Q2 révoquée,
  `hd_q2` révoquée, `hd_q1` valide. Tue la mutation qui retire la comparaison de `decision_id`.
- **R1-6 (à corriger)** — corrigé par la sonde en test : un rapport réécrit après la révocation qui
  garde REQ-400 et ne dit rien de Q1 n'hérite d'aucune liaison ; G1 n'est pas atteinte et le
  changement s'arrête en stagnation nommant q1. Tue la mutation qui rétablit `priors.slice(0, actedOn)`.
- **R1-7 (à peser)** — au registre (règle 6), comme introduit par la branche :
  `BUG-2026-09-28T013000`. Prémisse lue dans le code : `changePause` ne ferme aucune opération, et
  `requireRevocable` refuse toute opération ouverte. Le correctif change un refus.
- **R1-8 (à peser)** — corrigé pour IH-07 : le plan de `fromMandate` (`src/domain/invalidation.ts`)
  garde valides les extensions de budget, comme les réponses. C'est la seule voie qui tient à la fois
  le §18 (même budget) et M5 (rien n'est dit révoqué dont l'effet tient) ; défaire l'extension
  reprendrait un budget que le §18 laisse, et le seul texte laisserait M5 faux. Le plan est partagé
  avec la révision du mandat, pour la même raison. IH-12 n'est pas touchée : elle ne naît que d'une
  intégration, qui suit l'acceptation, après laquelle la révocation est désormais refusée (R1-2). Test :
  une extension accordée reste valide et `max_attempts` reste relevé après la révocation. Les §5, §6d,
  §8 et §17 le disent.
- **R1-9 (à peser)** — corrigé, texte seul. Les §8, §14 et le dernier scénario du §17 disent qu'un
  espace sans préparation, copie intacte de la référence, peut être repris ; le titre du test dit le
  cas qu'il tient.
- **R1-10 (à peser)** — corrigé à la racine, avec P2 : `withPreparedSuite`
  (`src/application/verification.ts`) retire d'une qualification reprise la note de la suite préparée
  du protocole d'où elle vient avant d'y noter la suite jugée maintenant. Test : après une révocation,
  chaque contrôle du protocole regelé porte une seule note de suite préparée (deux avant).
- **R1-11 (à peser)** — corrigé : `revokeQuestion` range la demande IH-01 avant l'inscription, comme
  `requestDecision`. Une révocation refusée laisse alors une demande qu'aucune décision en attente ne
  nomme, que rien ne présente ni n'exporte ; l'ordre inverse pouvait laisser une IH-01 en attente sans
  demande. Test par un registre factice (`LedgerFailingRequests`, option `ledger` de `makeHarness`)
  dont le rangement échoue : rien n'est inscrit, Q1 reste répondue, IH-10 reste présentée.
- **R1-12 (à peser)** — corrigé, chaque ligne tenue par un test, chaque mutation rejouée et tuée :
  mandat et exigences effacés, `answered_at` effacé, `human_decision_id` de `question.revoked` (et
  `null` pour une clôture sans décision), espace repris tant que sa préparation est adoptée, aucun
  retour d'avant la révocation au producteur reconstruit repris, IH-01 reposée dans la langue du
  changement, confirmation anglaise. La normalisation `?? null` d'`unstartedAttempt` est retirée
  plutôt que testée : un espace enregistré sans sa préparation n'est plus repris, ce qu'en dit le
  commentaire de `PreparedWorkspace`.
- **R1-13 (à peser)** — corrigé pour deux odeurs sur trois. Les deux coupures du journal comptent les
  propositions par une seule fonction, `writtenBeforeLast`, que `writtenBeforeLastAct` et
  `proposedSinceRevocation` appellent. `withoutPending` devient `settlePending`. La langue de l'IH-01
  reposée se déduit comme à la clarification, `requestedLanguage(state) ?? "fr"`. La construction de
  la demande reste à deux sites, pour une raison : la révocation porte sa demande dans sa propre
  commande, pour que la question soit reposée dans la décision qui la révoque (§8), alors que
  `requestDecision` inscrit la sienne par `decision.request` ; les deux passent par
  `buildDecisionRequest`, le seul constructeur. Le nombre de lectures du journal par pas n'est pas
  mesuré ; `latest` ne lit le journal que pour un genre non adopté.
- **R1-14 (à peser)** — corrigé : la capture de la sortie standard devient une classe,
  `CapturedStandardOutput`, et `test/helpers/command-fixture.ts` ne cite plus d'identifiant de story.
- **P1 (antérieur)** — au registre, `BUG-2026-09-28T013100` : le rapport lit la dernière proposition,
  si bien qu'après un refus à G1 il liste des exigences refusées. La part que la branche rendait
  atteignable est corrigée avec R1-4 ; le reste demande de décider ce que le rapport montre avant G1.
- **P2 (antérieur)** — corrigé avec R1-10, par la même ligne, dans son propre commit (`f2172d9`).
- **P3 (antérieur)** — aucune suite. La conduite rend la main après avoir présenté une décision, pour
  toute décision et pas seulement l'acceptation ; la fenêtre qu'elle ouvrait à la révocation est
  fermée par le refus de R1-2.

Preuves : les six fichiers de test de la story, ceux de la commande de vérification des relecteurs,
138 tests dans 23 suites, 0 échec à `1479c27`. `npm run build` puis `npm run check` sous Node
24.21.0 à `3233666` (01:22:02Z à 01:25:00Z) et sur l'arbre de `1479c27` (01:25:25Z à 01:28:24Z) :
sortie 0, 563 tests dans 124 suites, Biome sans avertissement. Le tour 2 relit le diff depuis
`0164a21`, la révision relue au tour 1.

## Tour 2 — `git diff 0164a21 7ebf6bd`, le 2026-09-28

| | |
|---|---|
| Relecteur A | **PASS** — 0 bloquant, 0 à corriger, 7 à peser |
| Relecteur B | **PASS** — 0 bloquant, 0 à corriger, 7 à peser |
| Porte | **PASS** — aucun constat introduit ou rendu atteignable par la branche ne reste bloquant ou à corriger, chez A comme chez B (règle 4) |
| Preflight à la révision relue | non relancée (règle 3) : verte sur l'arbre de `1479c27` (`e01s04-cycle-rouge-vert.md`, § Preflight des commits verts) ; `7ebf6bd` ne touche que `specs/`, et `npm run lint:story-format` y tient |
| Commande de vérification des relecteurs | les six fichiers de test de la story avec `--test-concurrency=1` : sortie 0, 138 tests dans 23 suites, chez le coordinateur, chez A et chez B, sous Node 24.21.0 |
| Registre ouvert, non compté | `BUG-2026-09-23T155707`, `BUG-2026-09-27T170000`, `BUG-2026-09-27T170100`, `BUG-2026-09-27T220000`, `BUG-2026-09-28T013000`, `BUG-2026-09-28T013100` |

Les réponses au tour 1 tiennent, sauf trois qui tiennent en partie : le test de R1-10 ne tient pas la
note qu'il corrige (R2-1), la phrase de R1-13 sur les lectures du journal est fausse (R2-2), et R1-8
écarte IH-12 pour une raison qu'un repli d'intégration défait (R2-3). Aucun constat ne retient la
porte ; ceux qui suivent sont à peser, et relèvent des règles 6 et 7.

### À peser

**R2-1 — Le test de R1-10 ne tient pas la réécriture des notes d'une qualification reprise.** A et B.
Introduit : le test est de ce tour. La mutation `qualifications[id] = reusable`
(`src/application/verification.ts:198`) passe les six fichiers : une préparation adoptée écrit
toujours « FAIL (discriminant) », si bien que la note reprise et la note récrite ont le même texte et
que le test, qui compte les notes, en trouve une dans les deux cas. Il tient le doublon de P2, pas la
note d'une préparation retirée. Sondes : PA5 de A (premier changement préparé, révocation, changement
reconstruit sans préparation adoptée : aucune note sur la branche, « FAIL (discriminant) » gardée sous
la mutation) ; P7 de B (protocole gelé sans préparation, changement reconstruit qui prépare : une note
sur la branche, aucune sous la mutation). A relève aussi que retirer la note d'une qualification faite
à neuf survit (m17), trou d'avant la branche sur une ligne réécrite ici. Correctif : les sondes en
tests, sans comportement nouveau.

**R2-2 — `latest` relit tout le journal même pour un genre adopté.** A et B. Introduit.
`proposedSinceRevocation` est calculé avant la lecture de l'adoption (`src/application/artifacts.ts:85-87`) :
`latest(state, "mandate")`, mandat adopté, lit tout le journal (sondes PA2 de A, P5 de B), et
`runIntervention` appelle `latest` jusqu'à cinq fois par intervention, sur un journal qui gagne un
`budget.consume` par appel d'outil. La phrase de la réponse à R1-13, « `latest` ne lit le journal que
pour un genre non adopté », ne tient donc pas ; B ajoute que `specificationHistory` fait toujours deux
lectures, `writtenBeforeLast` étant une seule fonction et non une seule lecture. Correctif : ne
calculer la coupure qu'en l'absence d'adoption, et corriger la phrase ; aucun comportement ne change.

**R2-3 — Après un repli d'intégration, la révocation révoque une IH-12 dont l'effet tient.** A.
Introduit par la branche. Prémisse vérifiée par le coordinateur dans le code : quand la destination
avance et que l'arbre combiné change, l'invalidation ne révoque que IH-10, IH-11 et IH-08 et ramène le
changement en `verifying` (`src/domain/invalidation.ts`, cause `destination_advanced`) ; la révocation
d'IH-10 efface `acceptance_decision_id`, si bien que la révocation redevient admise, et le plan de
`fromMandate` révoque toute décision valide hors IH-01 et IH-07, IH-12 comprise. La raison donnée en
réponse à R1-8 (« IH-12 ne naît que d'une intégration, qui suit l'acceptation ») ne vaut plus sur ce
chemin. Sonde PA6 de A, au noyau : IH-10, IH-11 et IH-12 valides ; après le repli, `verifying ready
accepted` ; la révocation passe, `clarifying accepted`, IH-12 révoquée — contre M5. Le même chemin
porte `outcome: "accepted"` jusqu'en clarification, là où `artifact.revised` le remet à `pending`
(`src/domain/change/apply.ts:97`) ; l'`outcome` resté `accepted` en `verifying` après le repli est,
lui, antérieur à la branche. Chemin rare. Correctifs proposés : écarter IH-12 du plan de `fromMandate`,
ou le dire au §18 ; poser `outcome = "pending"` dans `question.revoked`. Ils changent un comportement
sans ajouter de refus, d'état ni de mécanisme.

**R2-4 — Le conseil du refus après l'acceptation n'est pas applicable.** A et B. Introduit. Texte seul.
« decline the integration or cancel the change » (`src/domain/change/decide.ts:412`) ne sert pas dans
la fenêtre que R1-2 ferme : IH-10 acceptée sans intégration mandatée, la conduite suivante clôt le
changement (`closed completed`, sondes PA4 de A et P4 de B), et une IH-11 déclinée garde
l'acceptation, si bien que la révocation reste refusée. B relève que le scénario 6h du §17 énumère
« clos, annulé ou en intégration » sans l'acceptation IH-10 que le §6h nomme désormais. Correctif :
ne proposer que l'annulation, et compléter le scénario.

**R2-5 — Le contenu de la demande IH-07 n'est tenu par aucun test.** A et B. Survivent, sur
`answer-revocation` et `test/v2/harness` : faits vides, recommandation nulle, argument « 3/3 » retiré,
langue forcée à « fr » (`src/application/phases/phase.ts:112-125`, `implement.ts:62`). Le bloc vient
de `correctOrStop`, où il n'était pas tenu sur `main` ; seuls les faits du site `implement` sont
neufs. B relève que le repli `?? "no attempt left"` n'est jamais atteint : un blocage pose toujours
son détail. Correctif : tests, et le repli retiré ; aucun comportement ne change.

**R2-6 — *Duplicated Code* autour de `requestBudgetExtension`.** A. Introduit. La même condition,
`blocked` et `attempts_exhausted`, garde ses deux appels (`implement.ts:61`,
`src/application/phases/decide.ts:36`). Correctif : la porter dans la fonction ; aucun comportement ne
change.

**R2-7 — Aucun test ne tient qu'une révision du mandat garde les extensions IH-07.** A et B. Introduit.
`fromMandate` sert aussi la cause « mandate revised » ; le changement est cohérent, `max_attempts` ne
venant pas du mandat, mais rien dans `src/` n'émet `artifact.revise` pour le mandat, si bien que la
voie est inatteignable depuis Pi et non tenue. Correctif : un test v0, ou une phrase de la story.

**R2-8 — L'IH-01 reposée nomme pour sujet le candidat que la révocation retire.** B. Rendu atteignable
par le correctif de R1-4 : `revokeQuestion` construit le sujet par `subjectOfChange` sur l'état d'avant
la révocation (`src/application/harness.ts:983-986`), dont l'empreinte est le manifeste du candidat que
`question.revoked` met désormais à `null` ; la première IH-01 et `subjectOfChange` après la révocation
portent l'empreinte de la référence (sonde P3). Sans effet sur le fonctionnement : le noyau ne compare
l'empreinte du sujet que pour un sujet de genre `candidate`. L'écart reste au dossier. Correctif :
l'empreinte de la référence, ou un commentaire qui dit l'instantané ; aucun mécanisme nouveau.

**R2-9 — Couplage temporel non dit dans `writtenBeforeLast`.** B. Introduit. Texte seul. La fermeture
de `writtenBeforeLastAct` garde un état (`blocked`) et n'est juste que si `marks` est appelée une fois
par événement, dans l'ordre du journal, et jamais pour une proposition du genre
(`src/application/artifacts.ts:127-137`, `154-162`). L'équivalence avec les deux lectures remplacées
tient aujourd'hui, par lecture et par les mutations tuées de A (m18 à m20) et de B. Correctif : dire
ce contrat dans le commentaire.

**R2-10 — *Primitive Obsession* : la suite préparée est une note en texte libre retrouvée par son
préfixe.** B. Introduit. Aucune autre note ne commence par ce préfixe aujourd'hui
(`src/application/verification.ts:120-132`). Le correctif, un champ structuré, change le contrat du
protocole : registre, après la porte (règle 6).

### Antérieurs à la branche, selon A — ne retiennent pas la porte, à placer (fix-or-log)

- **P4** — après une IH-07 refusée (« stop »), `/495 resume` laisse le changement bloqué en disant
  qu'une extension est requise, mais rien ne la redemande ; c'est le comportement de `main` par
  `correctOrStop`. B note qu'une nouvelle révocation la redemande.
- **P5** — `/495 verify` après une révocation échoue en `INVALID_TRANSITION` dans la phase
  `clarifying`, comme sur `main` pour toute phase hors vérification et décision.

### Réponses au tour 1 vérifiées

- **R1-1** tient. IH-07 « étendre » (PA1b, P1) : le changement redevient `ready`, l'espace préparé
  avant l'arrêt est repris (quatre espaces avant, quatre après) et porte la tentative ouverte ; rien
  ne tourne ni ne reste ouvert. « Arrêter » (PA1a, P2) : blocage en `attempts_exhausted`, « budget
  extension refused », rien en attente ni ouvert. `attempts_exhausted` ne naît que de
  `correctionAuthorize`, d'`interventionStart`, que seul `implement` atteint, et de la réponse
  « stop ». Le contenu de la demande : R2-5.
- **R1-2** tient. `acceptance_decision_id` n'est effacé que par la révocation de l'IH-10, par une
  invalidation qui retire aussi l'acceptation (candidat remplacé, artefact révisé, preuve perdue,
  destination avancée) ; une IH-11 déclinée ou un `/495 verify` après l'acceptation la gardent, et la
  révocation reste refusée, ce que dit le §19. Le message : R2-4.
- **R1-3** et **R1-4** tiennent. `candidate = null` : les vues, le rapport, `openReview`,
  `context.ts` et `subjectOfChange` supportent l'absence ; vérification, relecture, décision, G5 et
  intégration ne lisent le candidat qu'après un nouveau gel ou sont gardées par leur phase.
  `candidate_history` n'est lu que par `correctionAuthorize`, `budgets.retries` que par
  `operationFail`. Appelants de `latest` : `reference`, `preparation` (lue par son adoption),
  `protocol`, `requirements`, `mandate`, `design`, `diagnostic` ; aucun n'a besoin d'une proposition
  d'avant la révocation, et la seule lecture voulue du passé, `prior_protocol_refs`, lit les
  propositions directement. Le sujet de l'IH-01 reposée : R2-8.
- **R1-5**, **R1-6**, **R1-9**, **R1-11**, **R1-12** et **R1-14** tiennent. Les demandes rangées ne
  sont lues que par identifiant, rien ne les énumère, et chaque tentative prend un identifiant neuf.
- **R1-8** tient pour IH-07, pas pour IH-12 (R2-3) ; la révision du mandat : R2-7.
- **R1-10** et **P2** : le comportement tient, le test ne tient pas la reprise (R2-1).
- **R1-13** tient en partie (R2-2).

### Mutations

Tuées, chez A (20) comme chez B : IH-07 retirée d'`implement`, ou demandée pour tout blocage ;
`candidate = null` retiré (en v2), `candidate_history` ou `retries` non vidés ; garde
`acceptance_decision_id` ou `integrating` retirée ; exclusion d'IH-07 retirée de `fromMandate` ;
aucune coupure dans `latest`, ou coupure retirée pour `protocol` ; demande IH-01 rangée après
l'inscription ; filtre du préfixe retiré ; dans la fermeture de `writtenBeforeLastAct`, `lifted` à
faux, `blocked` jamais mis à jour, question répondue jamais retenue ; et les rejeux du tour 1 (garde
M4, `slice(0, actedOn)`, `actedOn` sans la révocation, `answered_at`, `human_decision_id` nul, mandat
gardé, `preparation_id` à `null`, confirmation anglaise).

Survivantes : celles de R2-1, m17 comprise, et de R2-5 ; la langue de l'IH-01 prise à `this.language`,
équivalente puisque `mandate.language` vaut `requestedLanguage ?? "fr"` ; et, antérieures au diff, le
filtre `material` du `question.answered` et la priorité de l'adoption dans `latest`.

### Non vérifié

Ni A ni B n'a conduit de session Pi réelle, TUI ou RPC, ni le mode `json` de `/495 revoke`, ni le
verrou de session sur la voie IH-07 (raisonnement seul chez A) ; l'intégration seulement au noyau
(PA6), pas par `GitIntegrator` ; ni la durée des lectures du journal sur un grand dossier. Les
mutations n'ont tourné que sur les fichiers ciblés. Chaque copie de travail est rendue propre, puis
supprimée.

## Réponse au tour 2

Chaque constat, un par un, selon les règles 6 et 7 : corrigé quand le correctif n'ajoute aucun
comportement, au registre sinon, et placé pour P4 et P5. Tests d'abord, à `37c92a9` ; puis `f8c46d4`
(sujet de l'IH-01 reposée), `9aa014b` (conseil du refus après l'acceptation) et `ca15d89`
(remaniement sans comportement). Rouge, vert et mutations : `e01s04-cycle-rouge-vert.md`, § Réponse
au tour 2 de la relecture.

- **R2-1** — corrigé par les sondes en tests. PA5 : un premier changement préparé, puis un changement
  reconstruit sans préparation, dont la qualification reprise ne porte aucune note de suite préparée.
  P7 : un premier changement sans préparation, puis un changement reconstruit qui prépare, dont la
  qualification reprise porte une note. La qualification faite à neuf est tenue avant la révocation,
  dans le test de R1-10 et dans PA5. La mutation `qualifications[id] = reusable` est tuée par PA5 et
  P7, et m17 par trois tests.
- **R2-2** — corrigé. `latest` ne prend la coupure qu'en l'absence d'adoption, si bien que la phrase
  de la réponse à R1-13 tient depuis `ca15d89`. `specificationHistory` lit le journal deux fois, une
  par coupure : le relevé rouge-vert disait « une seule lecture » de `1479c27`, il dit maintenant
  « une seule fonction ». Aucun comportement ne change, et aucun test ne mesure le nombre de lectures.
- **R2-3** — au registre (règle 6), comme introduit par la branche : `BUG-2026-09-28T025000`. Le
  correctif change les décisions dites révoquées et l'issue du changement.
- **R2-4** — corrigé, texte seul. Le refus dit « the candidate is accepted; only cancelling the change
  sets it aside ». Le scénario 6h du §17 nomme le candidat accepté par IH-10. Le §18 dit que décliner
  l'intégration garde l'acceptation, et que seule l'annulation écarte le changement.
- **R2-5** — corrigé. Le test de R1-1 tient la demande IH-07 entière, dans un changement ouvert en
  anglais : la question porte « 3/3 », le fait « 3/3 attempts consumed », la recommandation « stop »,
  et la langue est « en ». Les cinq mutations sont tuées : faits vides, recommandation nulle, argument
  retiré, langue forcée, fait du site `implement` retiré. Le repli `?? "no attempt left"` est retiré,
  puisqu'un arrêt du noyau pose toujours son détail (`block(reason, detail: string)`).
- **R2-6** — corrigé. La condition passe dans la fonction, renommée `requestBudgetExtensionIfExhausted`,
  qui rend tout autre état tel quel. `correctOrStop` et `implement` l'appellent sans garde.
- **R2-7** — corrigé par un test v0 : une révision du mandat garde valide l'extension accordée, et
  `max_attempts` reste relevé. Retirer IH-07 des exclusions du plan tue ce test et celui de R1-8.
- **R2-8** — corrigé. L'IH-01 reposée a pour sujet l'empreinte de la référence, comme la première
  IH-01. Le test est rouge au commit de test seul, où le sujet porte l'empreinte du candidat retiré,
  et vert à `f8c46d4`.
- **R2-9** — corrigé, texte seul. Le commentaire de `writtenBeforeLast` dit que `marks` est appelé une
  fois pour chaque autre événement, dans l'ordre du journal, et jamais pour une proposition du genre.
  `writtenBeforeLastAct` compte sur ce contrat.
- **R2-10** — au registre (règle 6), comme introduit par la branche : `BUG-2026-09-28T025100`. Le champ
  structuré change le contrat du protocole.
- **P4** — aucune suite, faute de défaut. L'issue « stop » d'IH-07 annonce « The change stays blocked;
  the dossier can be exported », et le changement reste arrêté comme elle l'annonce. Une reprise ne
  lève pas un arrêt `attempts_exhausted` (`resumeLiftsStop`), et le noyau refuse de le lever tant que
  le budget reste épuisé. Le propriétaire qui revient sur son refus annule le changement ; une
  nouvelle révocation redemande l'extension (B).
- **P5** — aucune suite, faute de défaut. En clarification, le changement n'a aucun candidat à
  vérifier. `/495 verify` y est refusé par le noyau avant toute écriture, et la commande affiche
  « 495 error: INVALID_TRANSITION: operation verification.rerun is not allowed in phase clarifying »
  avec les phases attendues.

Preuves, sous Node 24.21.0 : `npm run build` puis `npm run check`, sortie 0, 567 tests dans 124
suites, Biome sans avertissement, à `f8c46d4` (02:38:23Z à 02:41:24Z), `9aa014b` (02:41:52Z à
02:44:53Z) et `ca15d89` (02:45:52Z à 02:48:54Z), chaque fois sur l'arbre du commit avant qu'il soit
fait. Les six fichiers de test de la story, avec `--test-concurrency=1` à `ca15d89` : sortie 0, 142
tests dans 23 suites. La porte reste PASS (règle 4). Aucun constat ne demande de tour de relecteurs :
les correctifs n'ajoutent ni refus, ni état, ni mécanisme, et R2-4 comme R2-9 ne changent que du
texte (règle 7). Les relevés sont ancrés à `ca15d89` (règle 5).
