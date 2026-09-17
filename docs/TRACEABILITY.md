# Traçabilité exigence → contrôle → preuve (état P0)

Les fichiers de test portent les identifiants amont dans leurs intitulés. « V4 » et « e2e » sont
des campagnes exécutées manuellement (voir `QUALIFICATION.md`).

L'expression de besoins porte 85 exigences fonctionnelles `[P0]` en `####` et 8 exigences non
fonctionnelles `NFR-01` à `NFR-08` `[P0]` en `###`, soit 93. Chacune doit posséder une ligne ici,
couverte ou explicitement non couverte : une exigence absente de cette table n'est pas une exigence
satisfaite, c'est une exigence dont l'état est inconnu.

| Exigence / règle | Composants | Preuves |
| --- | --- | --- |
| BES-01, RM-001 | `domain/change`, `ledger` | `v0/change-rules` (request immuable), `v2/harness` (artefacts et digests) |
| BES-02, RM-003, SA-004, SA-005 | `decide.ts` G0, `harness.stepClarify`, extension | `v0/change-rules`, `v2/harness` (IH-01), `v3/pi-entries` (decision_required) |
| BES-03, SA-011, SEC-03 | `gates/g4.ts` | `v0/change-rules`, `v2/harness` (test protégé) |
| BES-04, RM-006..009, SA-006, SA-007 | `program/program.ts` | `v0/program` |
| BES-05, SA-034, RM-070 | `invalidation.ts` | `v0/change-rules` |
| REQ-01..03, RM-011 | G1, G2 | `v0/change-rules` |
| REQ-04, RM-013, RM-043 | G2, G4, `preparation.ts` | `v0/change-rules`, `v2/preparation` |
| CON-01 | rôle `observe` de `context.ts` (interdiction d'exécuter build et scripts d'installation), profil sandbox `observe` en lecture seule | `v1/sandbox` (profil), `v0/change-rules` (observation possible à toute phase) ; l'instruction de rôle elle-même est vérifiée par revue de code |
| CON-02 | G3, artefact de conception versionné | `v0/change-rules`, `v0/change-nominal` |
| CTX-01, CTX-02, CTX-05 | `context.ts` | `v2/harness` (manifestes), prompts étiquetés non fiables (revue de code) |
| CTX-04 | `context.ts` reconstruit le manifeste à chaque intervention ; compaction Pi activée dans `worker-main.ts` | `v2/harness` (manifestes) ; **non qualifié** : aucune compaction forcée ni reprise de session après compaction n'est exercée |
| AGT-01, AGT-02, RM-022 | `worker-main`, `intervention.start` | `v0/change-rules`, `v1/agent-port` |
| AGT-03, AGT-04, AGT-06, SA-018 | `worker-main` (garde de chemins), `scripted-agent`, `reports.ts` | `v1/agent-port`, `v0/reports` |
| VER-01, VER-02, SA-013, SA-014, RM-016, RM-017 | `parsers.ts`, `runner.ts` | `v1/control-runner`, `v2/harness` (/verify) |
| VER-03, AT-05 | `verification.record` | `v0/change-rules` (preuve étrangère rejetée) |
| VER-05, SA-009, PRE-03 | `qualification.ts` | `v1/control-runner`, `v2/preparation`, V4 Java |
| PRE-01 | `preparation.ts` (`referenceTestFiles` pour le fichier présent, `diagnoseControlCapability` pour les trois niveaux suivants), `harness.stepVerificationDesign` qui ouvre la préparation sur l'absence de discrimination, `Protocol.capability_diagnosis` qui fige le diagnostic dans le protocole | `v2/preparation` (les quatre niveaux distingués ; une cible pourvue de tests ouvre une préparation pour un ajout de comportement), `v2/harness` (un refactoring reste prouvé par la suite verte, sans préparation), campagne `scripts/diagnose-capability.ts` sur la cible Java multi-module ; **partiel** : la cartographie demandée par l'exigence ne porte ni les assertions, ni l'instabilité, ni les dépendances des contrôles — l'instabilité relève de VER-08 |
| VER-06, RM-038, SA-035 | G5 arbitrage | `v0/change-rules` |
| DEC-01, RM-031 | reducer | `v0/properties` (jamais d'événement normatif par un agent) |
| DEC-02 | `buildFeedback` | `v2/harness` (feedback ≤ 64 Kio) |
| DEC-03, DEC-04, RM-032..035, SA-015, SA-016 | budgets, stagnation | `v0/change-rules`, `v2/harness` |
| DEC-05, PF-17 | pause/resume, ledger | `v0/change-rules`, `v2/harness`, `v2/ledger` |
| DEC-06, RM-037, RM-040, SA-030, SA-031 | `decision.answer` | `v0/change-rules`, `v2/harness`, `v3/pi-entries` |
| SEC-01, SEC-02 (voies d'action) | `sandbox/backends.ts`, `worker-main` | `v1/sandbox` (Seatbelt), `v1/control-runner` (candidat en lecture seule) |
| SEC-04 | réseau refusé par profil | `v1/sandbox` |
| SEC-05, SA-036, RM-071 | `export-service.ts` | `v2/export-integration` |
| GIT-01, GIT-02, SA-003, RM-049..051 | `git-workspace.ts`, `walk.ts` | `v2/workspace` |
| GIT-03, GIT-05, SA-020, SA-021, RM-053..055 | `git/integrator.ts`, reducer | `v0/change-rules`, `v2/export-integration` |
| EVD-01, EVD-02, EVD-03, NFR-03, NFR-08 | `ledger.ts`, `cas.ts`, `export-service.ts` | `v2/ledger`, `v2/export-integration`, `v0/contracts` |
| UX-01 | extension | e2e `pi -p "/495 start …"` avec modèle réel |
| UX-02, UX-04, SA-029 | extension, `views.ts` | `v3/pi-entries` |
| UX-03 | `views.ts`, `text.ts` | `v3/pi-entries` |
| UX-05 | `extension/index.ts` (`bind`, `unbind`, résolution par session puis par `cwd`), liaison conservée dans le journal et non dans la session Pi, `operations.idempotency_key` unique | `v2/ledger` (liaison, déliaison), `v3/pi-entries` ; **non qualifié** : le rechargement de l'extension et la bifurcation de conversation ne sont pas exercés |
| UX-06..UX-10, SA-022..SA-028, RM-057..RM-066 | `review.ts`, `diff.ts`, `review-surface.ts` | `v0/review-model`, `v0/review-surface` |
| UX-11 | `review-text.ts` | `v0/review-model` (données) ; concordance multicanale non exercée en RPC |
| EXT-01 | `target.ts` (`capability_missing`), `backends.ts` (sandbox non qualifiée refusée), motif d'arrêt `capability_missing` | `v1/sandbox`, `v1/control-runner`, `v2/harness` |
| EXT-02 | `runtime.ts` (`environment_digest` couvrant l'arbre exécuté), `ResourceLoader` explicite de `worker-main.ts` : aucun skill, `AGENTS.md`, extension ou package du projet n'est chargé | `v1/agent-port` ; **non qualifié** : la requalification déclenchée par un changement de version n'est pas exercée |
| EXT-03, PRE-02, REC-28 | `target.ts`, F-JAVA | `v1/control-runner`, V4 Java |
| EXT-04, NFR-07 | règle d'imports | `scripts/check-layers.ts` |
| IMP-05 | pause et annulation, dossier exportable hors modèle, constats de revue séparés du verdict | `v0/change-rules`, `v2/export-integration`, `v0/review-model` ; **non qualifié** : la séparation observations mécaniques / jugements / risques résiduels dans le rapport n'est portée par aucun contrôle |
| NFR-01, NFR-02 | package, données locales | chargement par manifeste, aucun service distant |
| NFR-04 | bornes de flux | `v1/sandbox` (timeout, troncature) ; pas de mesure p95 |
| NFR-06 | `runtime.ts` (diagnostics locaux), export expurgé ; aucun point de télémétrie n'existe dans les sources | `v2/export-integration`, revue de code (absence d'endpoint) |
| PRG-01, PRG-02 | capture vide / sans HEAD | `v2/workspace` ; socle non conduit de bout en bout |
| PRG-03..05 | `program.ts` | `v0/program` (noyau seulement) |
| SA-008 | `preparation.open`, `preparation.close` | `v2/preparation` |

## Exigences non couvertes

| Exigence | État | Renvoi |
| --- | --- | --- |
| PRE-04, PRE-05 | caractérisation de l'existant et évolution de la capacité de vérification par cycle : absentes | `ROADMAP.md` |
| VER-08 | les contrôles ne sont exécutés que sur le candidat, jamais sur la référence ; `runner.ts` écrit `baseline_state: "new"` en dur et les valeurs `preexisting` / `removed` ne sont jamais produites ; aucune politique d'instabilité préenregistrée | `ROADMAP.md`, `chantiers/01` |
| CON-03 | la règle de frontières exécutable n'existe que pour le dépôt 495 lui-même (`check-layers.ts`, qui relève de NFR-07) ; aucune règle architecturale opposable n'est portée sur une cible | `ROADMAP.md`, `chantiers/03` |
| ARC-01..04 | architecture réalisée, cible, migration progressive et contrainte sur la génération : absentes | `ROADMAP.md`, `chantiers/03` |
| QLT-01..05 | référentiel, baseline, réduction de dette, non-dégradation et conformité démontrée : absentes | `ROADMAP.md`, `chantiers/02` |
| RAG-01, RAG-02, RAG-04 | identification d'un besoin de connaissance, corpus officiel versionné et vérification de l'utilisation de la documentation : absentes | `STATUS.md` |
| EXP-01..04 | disciplines applicables, proportionnalité des choix, mobilisation des expertises et évaluation de la démarche : absentes | `STATUS.md` |
| NFR-05 | backend `bwrap` implémenté, Linux x86-64 jamais exécuté ; la portabilité est annoncée, pas qualifiée | `STATUS.md`, `chantiers/C` |
| IH-04 | l'arbitrage de vérifiabilité est déclaré dans les contrats mais exclu de `buildDecisionRequest` et de `requestDecision` ; une exigence qui reste non discriminable après deux préparations arrête le changement sur `capability_missing` au lieu d'être portée à l'arbitrage humain | `ROADMAP.md`, `chantiers/00` |
