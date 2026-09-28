# Recette — une réponse contraire au premier rapport atteint le protocole gelé, sur la cible Maven

Story `e01s05`, branche `e01s05`. Recette de l'epic e01 sur la cible Maven des campagnes `java-*`
(`~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture`, révision `d66382a`), celle où
le défaut qui a ouvert l'epic a été vu : un changement accepté en rendant 400 là où le propriétaire
avait décidé 422 (`specs/adr/D-37`, `D-70`).

## Ce qui a tourné

Un vrai Pi (`pi -ne --mode rpc --no-session -e <extension>`), l'extension chargée depuis `dist/` de
la construction `~/.495-campagnes/builds/e01s05-94d4fe0`, faite par `git archive` de `94d4fe0` ;
la tête de `main` au moment de la campagne est `acf4aba`, dont la différence avec `94d4fe0` ne
touche que `cycle/` (`git diff --stat 94d4fe0 acf4aba` : `cycle/prompts/rouge-vert.md`,
`cycle/src/cycle.ts`), pas `src/`. Chaque campagne relève par `get_commands` quelle construction
fournit `/495` ; sur celle-ci la commande liste
`start|status|resume|review|report|verify|decide|integrate|export|pause|close|revoke|cancel|bind|unbind`.

Banc : `~/.495-campagnes/scripts/e01s05-run.sh` et `e01s05-drive.ts`, dérivés de `reprise-run.sh`
et `reprise-drive.ts` ; `e01s05-scripts.mjs` écrit les agents scriptés ; `e01s05-lire.mjs` relit un
dossier depuis SQLite et le magasin d'objets. Politique `e01s05-config.json` : adoption du mandat
par l'humain, acceptation humaine à G5 (`HARNESS495_HUMAN_ACCEPTANCE=1`), intégration désactivée.

**Ce qui est feint.** Aucun modèle n'est appelé : chaque intervention est simulée par un agent
scripté (`HARNESS495_SCRIPTED_AGENT`), et le dossier le dit à chaque campagne (« interventions are
simulated from … ; no model is called »). Trois rapports de spécification sont écrits d'avance :
`e01s05-pose.json` pose q1 (« 400 comme le nom vide, ou 422 ? ») et q2 (la mise à jour), et
écrit à côté une exigence `REQ-400` pour 400 sans la lier à q1, qui est ouverte : son bloc
`answers` est vide ; `e01s05-garde-400.json` est ce que le modèle Flash-Next avait
écrit après la réponse (`java-flashnext-L2`) : il déclare q2, garde `REQ-400` et ne dit rien de
q1 ; `e01s05-lie-422.json` lie q1 à `REQ-422`, obligatoire, écrite pour 422 et le corps « Name
cannot be longer than 50 characters ». La préparation écrit un test de contrat JUnit à la frontière
HTTP (`UserNameLengthContractTest`, statut 422 et corps) et un test du domaine ; l'implémentation
ajoute la borne, `NameTooLongException` et son exposition en 422 ; la relecture est consultative
et vide. Les décisions humaines sont données par le pilote, sous l'acteur `jeanjerome`
(`HARNESS495_RPC_HUMAN_ACTOR`), à travers les vrais dialogues de Pi (`select`, `input`,
`confirm`) : une main n'a pas tapé les réponses, mais chaque réponse passe par la commande, le
dialogue et la provenance qu'un propriétaire emprunterait. Les contrôles Maven (`mvn -o test`,
JaCoCo, imports, PIT) tournent pour de vrai, sous Seatbelt.

Ce que la campagne établit : que la réponse enregistrée atteint le rapport suivant, les exigences
adoptées, le protocole gelé et les preuves. Ce qu'elle n'établit pas : qu'un modèle réel écrit le
rapport qui lie la réponse (`e01s04-r-vrai-modele` à `r4` l'ont mesuré sur la cible JavaScript),
ni le sort d'une acceptation : IH-10 est laissée en attente, le candidat n'est ni accepté ni
intégré.

## Le changement, dossier `~/.495-campagnes/e01s05-m4-422-protocole`

Quatre campagnes enchaînées, chacune copiant le dossier de la précédente ; `e01s05-m4-422-protocole`
porte les 106 événements du changement `chg_mulh6pkz6bc958c0ec`.

| Campagne | Agent | Commandes | Ce que le dossier porte |
|---|---|---|---|
| `e01s05-m1-pose` | `pose` | `/495 start …`, IH-01 × 2 répondues | `#10` `#12` q1 et q2 ouvertes, matérielles ; `#15` `question.answered q1 "422"` et `#17` q2 « à la création et à la mise à jour », par `jeanjerome/human/rpc_qualified` |
| `e01s05-m2-stagnation` | `garde-400` | `/495 resume` | la demande (`ctx_mulh77ut…`) porte « Q q1 … -> 422 [to declare in `answers`] » ; le rapport garde 400 et ne déclare pas q1 ; réouverture (`ctx_mulh78wg…`, « q2 already declared, carried by REQ-MAJ ») ; même rapport ; `#28 status.changed blocked stagnation — the specification loses material answer(s) q1 and its latest rewriting carries none an earlier report did not; resume rewrites the specification, close <question> closes a question that is no longer material, cancel abandons the change`, `retryable=true`. Aucun mandat proposé, G0 non évalué |
| `e01s05-m3-clore-revoque` | `garde-400` | `/495 close q2`, `/495 revoke q1` | voir la clôture et la révocation ci-dessous |
| `e01s05-m4-422-protocole` | `lie-422` | `/495 resume` (IH-01 : « 422 »), `/495 resume` (IH-02 : adopter), `/495 resume` | voir ci-dessous |

### La réponse « 422 » atteint le protocole gelé

- `#41` `decision.recorded dec_mulh8u9fdb4fdc1df9 answer` et `#42` `question.answered q1 "422"`,
  `hd_mulh9cfcae4135abf8`, par `jeanjerome/human/rpc_qualified/host_qualified`.
- La demande de spécification qui suit (`ctx_mulh9gm5…`) porte « Q q1 … -> 422 [to declare in
  `answers`] » et « Q q2 … -> closed by the owner: no longer material, nothing to declare ».
- `#48` mandat proposé, `#49` G0 INDETERMINATE (IH-02), `#51` adopté par `jeanjerome`, `#53` G0
  PASS, `#54` `artifact.adopted mandate mnd_mulh9jrxe977621339`. Le mandat porte q2 comme close :
  `open_questions=[{id:"q2", closed_by:"jeanjerome", answer:"à la création et à la mise à jour"}]`.
- `#57` exigences proposées, `#58` G1 PASS, `#59` `artifact.adopted requirements
  rqs_mulh9js155a42c7e95` (`sha256:41050d44…`), `#60` `requirements.recorded
  mandatory_requirement_ids=["REQ-422","REQ-50","REQ-MAJ"]`. Le document adopté, lu dans le
  magasin d'objets :
  - `REQ-422 mandatory=true` : « La création d'un utilisateur dont le nom dépasse 50 caractères
    est refusée par un 422 dont le corps est 'Name cannot be longer than 50 characters' » ;
  - bloc `answers` : `{question_id:"q1", answer:"422", observable:true,
    requirement_ids:["REQ-422"]}` et `{question_id:"q2", answer:"à la création et à la mise à
    jour", observable:false, requirement_ids:[]}` — le rapport avait déclaré q2 liée à `REQ-MAJ` ;
    la question étant close, le noyau recopie sa réponse comme ne fixant rien d'observable
    (`D-70`, point 3).
- `#65` préparation bornée (les contrôles de la cible ne décident pas `REQ-422` ni `REQ-MAJ`),
  `#73` `preparation.closed qualified=true` avec les deux fichiers de test, `#77` G2 PASS, `#78`
  `artifact.adopted protocol prt_mulhacjte31b88e8cd` (`sha256:18adda0e…`), `#79`
  `protocol.frozen control_ids=["maven-test","coverage","structure","mutation"]`. Le protocole, lu
  dans le magasin d'objets :
  - obligation `REQ-422 mandatory=true controls=["maven-test","coverage","structure","mutation"]
    combination=all_pass` ;
  - qualification `maven-test: qualified=true positive=PASS negative=FAIL incident=INDETERMINATE`
    (`evq_mulh9wfw0…` 40 tests PASS, `evq_mulh9wfwc…` le témoin injecté détecté, FAIL) ;
    diagnostic `discriminating`, note « prepared suite adopted: 2 file(s) failing on the
    reference » ;
  - `protected_paths` porte `…/UserNameLengthContractTest.java` et `…/UserNameLengthTest.java`.

### Le contrôle porte le contrat décidé

`#99` `evidence.recorded maven-test PASS` sur `cand_9ae493d870ca`, preuve `evd_mulhannxbd2b82dc02`
(`requirement_refs` `REQ-422`, `REQ-50`, `REQ-MAJ` ; `facts.tests=42 failures=0 files=7`, contre 38
tests et 5 fichiers sur la référence, `evr_mulhaj4i…`). Ses artefacts nomment
`report:infrastructure/target/surefire-reports/TEST-io.scalastic.demo.infrastructure.user.adapter.inbound.rest.UserNameLengthContractTest.xml` ;
dans l'espace de travail du candidat (`workspaces/ws_mulhacoz_9`), ce rapport porte `tests="2"
failures="0" errors="0"` : `creation_shouldRefuseANameLongerThanFiftyCharactersWith422` et
`creation_shouldSayWhyANameLongerThanFiftyCharactersIsRefused`. Le contrôle `maven-test` porte
donc le contrat décidé : un candidat qui rendrait 400 y échouerait. `#100`–`#102` coverage,
structure et mutation PASS ; `#105` G5 INDETERMINATE, IH-10 demandée et laissée en attente.

Le même rapport `garde-400`, sur la même réponse, avait arrêté le changement à `#28` et `#36` sans
proposer de mandat : ce que G1 refusait avant l'epic est désormais arrêté avant G0, en nommant q1
et les trois issues (`D-70`, point 2).

## La clôture et la révocation, dans Pi, sur la cible Maven

Campagne `e01s05-m3-clore-revoque`, copie de `m2-stagnation` (changement arrêté en stagnation sur
q1), agent `garde-400`, deux commandes tapées dans Pi par le pilote sous l'acteur `jeanjerome`,
chacune confirmée par le dialogue `confirm` de Pi.

- `/495 close q2` — dialogue « Clore la question q2 ? Elle n'est plus matérielle ; sa réponse ne
  liera plus aucune exigence. », confirmé. `#29 question.closed q2` par
  `jeanjerome/human/rpc_qualified/host_qualified` (`role: change_owner`,
  `human_decision_id: null` : la clôture n'est pas une décision d'IH-01 mais un acte de la
  commande). `#30 status.changed ready` par le même acteur : la stagnation est levée. La
  spécification est relancée (`#31`–`#35`) ; sa demande (`ctx_mulh8r4i…`) porte « Q q2 … -> closed
  by the owner: no longer material, nothing to declare ». Le rapport `garde-400` ne porte toujours
  pas q1 : `#36 status.changed blocked stagnation … loses material answer(s) q1`. La clôture d'une
  question n'efface pas la réponse à l'autre.
- `/495 revoke q1` — dialogue « Révoquer ce que vous avez décidé de la question q1 ? Elle vous
  sera reposée, et le mandat, les exigences et tout ce qui a été adopté depuis ne le seront
  plus. », confirmé. `#37 question.revoked q1 human_decision=hd_mulh6qmq1dacdddad7
  asked_again=dec_mulh8u9fdb4fdc1df9` par `jeanjerome/human/rpc_qualified/host_qualified` ;
  `#38 decision.revoked hd_mulh6qmq1dacdddad7 resolution of question q1 revoked by the owner` ;
  `#39 phase.entered clarifying resolution of question q1 revoked by the owner` ;
  `#40 decision.requested IH-01 dec_mulh8u9fdb4fdc1df9`. Le dialogue reposé offre trois issues :
  `answer — Répondre (texte libre)`, `close — Clore : la question n'est plus matérielle`,
  `abandon — Abandonner le changement` ; le pilote répond « plus tard ». L'état lu dans SQLite
  porte `human decisions: IH-01/answer(revoked), IH-01/answer` et la question q1 sans réponse.
- La suite (`m4`) répond « 422 » à cette IH-01 reposée : `#41` `decision.recorded
  dec_mulh8u9fdb4fdc1df9 answer hd_mulh9cfcae4135abf8`, la réponse qui atteint le protocole gelé.

Ce que cette campagne n'établit pas : la révocation a eu lieu avant G0, rien n'était adopté ; elle
n'a donc défait que la réponse. Le retrait des gates, du mandat, des exigences et du protocole par
une révocation après G0 est tenu par `specs/verifications/reprise-de-verification-et-revocation`
(campagne B, cible JavaScript) et par les tests de `test/v0/change-rules.test.ts`.

## Contrôle négatif : la construction d'avant l'epic

Même banc, même cible, mêmes agents scriptés, mêmes réponses, sur
`~/.495-campagnes/builds/e01s01-avant-bdebd23`, construction de `02e86ef`, le `main` d'avant
`bdebd23` (qui engage l'epic). `get_commands` y désigne `/495` comme
`start|status|resume|review|report|verify|decide|integrate|export|pause|cancel|bind|unbind` : ni
`close`, ni `revoke`. Dossier final `~/.495-campagnes/e01s05-n4-reprise`, changement
`chg_mulhz4yi0b2d76d503`, 38 événements.

| Campagne | Agent | Commandes | Ce que le dossier porte |
|---|---|---|---|
| `e01s05-n1-pose` | `pose` | `/495 start …`, IH-01 × 2 | IH-01 n'offre que deux issues (`answer`, `abandon`) ; `#15 question.answered q1 "422"`, `#17` q2, par `jeanjerome/human/rpc_qualified` |
| `e01s05-n2-garde-400` | `garde-400` | `/495 resume`, IH-02 : adopter | la demande (`ctx_mulhzlig…`) porte « Q q1 … -> 422 [to declare in `answers`] » ; le rapport garde 400 et ne déclare pas q1 ; aucune réouverture, aucun arrêt : `#23` mandat proposé (`open_questions=[]`), `#24` G0 INDETERMINATE, `#26` adopté par `jeanjerome` |
| `e01s05-n3-g1` | `garde-400` | `/495 resume` | `#28` G0 PASS, `#29` mandat adopté, `#32` exigences proposées `rqs_muli038g…` (`sha256:d457df9b…`), `#33 gate.decided G1 FAIL material answer q1 fixes an observable contract that no requirement carries`, `#34 status.changed blocked execution_error retryable=false PRECONDITION_FAILED: requirements rejected at G1: … (next: revise_requirements)` |
| `e01s05-n4-reprise` | `lie-422` | `/495 resume` | `#35 status.changed ready` par `jeanjerome` ; aucune intervention de spécification ne tourne, bien que l'agent scripté sache lier 422 ; `#36` les mêmes exigences (`sha256:d457df9b…`) sont reproposées, `#37` G1 FAIL pour le même motif, `#38` bloqué de nouveau |

Les exigences proposées à `#32` et `#36`, lues dans le magasin d'objets, portent `REQ-400` (« …
refusée par un 400 »), `REQ-50`, `REQ-MAJ`, et un bloc `answers` où q1 vaut `{answer:"422",
observable:true, requirement_ids:[]}` : la réponse est enregistrée mais aucune exigence ne la
porte. Aucune exigence n'est adoptée (aucun `artifact.adopted requirements`,
aucun `requirements.recorded`) ; aucun protocole n'est gelé. Le changement est perdu : bloqué,
`retryable=false`, sur une issue `revise_requirements` qu'aucune commande ne tient, et `resume`
reproduit le refus sans réécrire la spécification — ce que `D-70` décrit comme l'état d'avant
(`java-flashnext-L2`, événements 183 à 195).

Sur la construction de la tête, la même suite (`m2`) s'arrête avant G0 en nommant q1, et la
réponse « 422 » atteint `REQ-422`, l'obligation du protocole et la preuve `maven-test` (`m4`).

## Preflight

La branche ne touche que `specs/adr/` et `specs/verifications/` ; Preflight est relancée à la tête
de branche à la fin du pas, sous Node 24, et son résultat est celui que l'outil du cycle relève.
