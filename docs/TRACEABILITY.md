# Traçabilité exigence → contrôle → preuve (état P0)

Les fichiers de test portent les identifiants amont dans leurs intitulés. « V4 » et « e2e » sont
des campagnes exécutées manuellement (voir `QUALIFICATION.md`).

| Exigence / règle | Composants | Preuves |
| --- | --- | --- |
| BES-01, RM-001 | `domain/change`, `ledger` | `v0/change-rules` (request immuable), `v2/harness` (artefacts et digests) |
| BES-02, RM-003, SA-004, SA-005 | `decide.ts` G0, `harness.stepClarify`, extension | `v0/change-rules`, `v2/harness` (IH-01), `v3/pi-entries` (decision_required) |
| BES-03, SA-011, SEC-03 | `gates/g4.ts` | `v0/change-rules`, `v2/harness` (test protégé) |
| BES-04, RM-006..009, SA-006, SA-007 | `program/program.ts` | `v0/program` |
| BES-05, SA-034, RM-070 | `invalidation.ts` | `v0/change-rules` |
| REQ-01..03, RM-011 | G1, G2 | `v0/change-rules` |
| REQ-04, RM-013, RM-043 | G2, G4, `preparation.ts` | `v0/change-rules`, `v2/preparation` |
| CTX-01, CTX-02, CTX-05 | `context.ts` | `v2/harness` (manifestes), prompts étiquetés non fiables (revue de code) |
| AGT-01, AGT-02, RM-022 | `worker-main`, `intervention.start` | `v0/change-rules`, `v1/agent-port` |
| AGT-03, AGT-04, AGT-06, SA-018 | `worker-main` (garde de chemins), `scripted-agent`, `reports.ts` | `v1/agent-port`, `v0/reports` |
| VER-01, VER-02, SA-013, SA-014, RM-016, RM-017 | `parsers.ts`, `runner.ts` | `v1/control-runner`, `v2/harness` (/verify) |
| VER-03, AT-05 | `verification.record` | `v0/change-rules` (preuve étrangère rejetée) |
| VER-05, SA-009, PRE-03 | `qualification.ts` | `v1/control-runner`, `v2/preparation`, V4 Java |
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
| UX-06..UX-10, SA-022..SA-028, RM-057..RM-066 | `review.ts`, `diff.ts`, `review-surface.ts` | `v0/review-model`, `v0/review-surface` |
| UX-11 | `review-text.ts` | `v0/review-model` (données) ; concordance multicanale non exercée en RPC |
| EXT-03, PRE-02, REC-28 | `target.ts`, F-JAVA | `v1/control-runner`, V4 Java |
| EXT-04, NFR-07 | règle d'imports | `scripts/check-layers.ts` |
| NFR-01, NFR-02 | package, données locales | chargement par manifeste, aucun service distant |
| NFR-04 | bornes de flux | `v1/sandbox` (timeout, troncature) ; pas de mesure p95 |
| PRG-01, PRG-02 | capture vide / sans HEAD | `v2/workspace` ; socle non conduit de bout en bout |
| PRG-03..05 | `program.ts` | `v0/program` (noyau seulement) |
| SA-008 | `preparation.open`, `preparation.close` | `v2/preparation` |
| PRE-01 | `referenceHasTests` couvre le premier niveau de l'échelle (un fichier de test est présent) | **non couvert** : test découvrable, test exécuté et contrôle capable de détecter le défaut visé ne sont pas distingués ; voir `ROADMAP.md` |
| PRE-04, PRE-05 | — | **non couverts** |
| ARC-01..04, QLT-01..05 | — | **non couverts** ; voir `ROADMAP.md` |
