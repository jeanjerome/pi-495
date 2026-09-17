# Traçabilité exigence → contrôle → preuve (état P0)

Les fichiers de test portent les identifiants amont dans leurs intitulés. « V4 » et « e2e » sont
des campagnes exécutées manuellement (voir `QUALIFICATION.md`).

L'expression de besoins porte 85 exigences fonctionnelles `[P0]` en `####` et 8 exigences non
fonctionnelles `NFR-01` à `NFR-08` `[P0]` en `###`, soit 93. Chacune doit posséder une ligne ici,
couverte ou explicitement non couverte : une exigence absente de cette table n'est pas une exigence
satisfaite, c'est une exigence dont l'état est inconnu. `scripts/check-traceability.ts`, branché sur
`npm run check`, développe les notations de plage de la première colonne et refuse un identifiant
`[P0]` de l'amont qui n'apparaît dans aucune des deux tables.

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
| CTX-04 | `context.ts` reconstruit le manifeste à chaque intervention ; compaction Pi activée dans `worker-main.ts` ; les révisions adoptées, les budgets et le feedback borné sont tenus par le journal, jamais par un résumé de modèle | `v2/harness` (manifestes ; une session rouverte sur le même journal, avec un agent neuf, retrouve les mêmes révisions de mandat, exigences, protocole et conception, les mêmes budgets consommés et le feedback dû à la tentative suivante, puis rebâtit des instructions complètes portant les contrôles gelés avant la coupure) |
| AGT-01, AGT-02, RM-022 | `worker-main`, `intervention.start` | `v0/change-rules`, `v1/agent-port` |
| AGT-03, AGT-04, AGT-06, SA-018 | `worker-main` (garde de chemins), `scripted-agent`, `reports.ts` | `v1/agent-port`, `v0/reports` |
| VER-01, VER-02, SA-013, SA-014, RM-016, RM-017 | `parsers.ts`, `runner.ts` | `v1/control-runner`, `v2/harness` (/verify) |
| VER-03, AT-05 | `verification.record` | `v0/change-rules` (preuve étrangère rejetée) |
| VER-05, SA-009, PRE-03 | `qualification.ts` | `v1/control-runner`, `v2/preparation`, V4 Java |
| PRE-01 | `preparation.ts` (`referenceTestFiles` pour le fichier présent, `diagnoseControlCapability` pour les trois niveaux suivants), `harness.stepVerificationDesign` qui ouvre la préparation sur l'absence de discrimination, `Protocol.capability_diagnosis` qui fige le diagnostic dans le protocole | `v2/preparation` (les quatre niveaux distingués ; une cible pourvue de tests ouvre une préparation pour un ajout de comportement), `v2/harness` (un refactoring reste prouvé par la suite verte, sans préparation), campagne `scripts/diagnose-capability.ts` sur la cible Java multi-module ; **partiel** : la cartographie demandée par l'exigence ne porte ni les assertions, ni l'instabilité, ni les dépendances des contrôles — l'instabilité relève de VER-08 |
| VER-08, REC-25 | `domain/baseline.ts` (classement des constats, tolérance, règle d'instabilité), `domain/findings.ts` (identité d'un constat sans workspace ni ligne), `harness.referencePasses` (passage sur la référence, mémorisé par contrôle, référence et environnement), `Protocol.baseline` gelé à G2, `runner.ts` qui localise et empreinte chaque constat | `v0/baseline` (classement, renommage, tolérance, instabilité, réutilisation d'un passage), `v1/baseline` (deux passages réels : un défaut hérité et un défaut introduit donnent deux constats dont un seul bloque ; un renommage ne les sépare pas ; deux passages divergents restent INDETERMINATE), `v2/harness` (passage de référence enregistré puis relu à la tentative suivante ; contrôle instable conservé INDETERMINATE, sans relance technique) ; **partiel** : G2 exige qu'un contrôle qualifié passe sur la référence, de sorte qu'aucun contrôle qualifié ne porte aujourd'hui de constat préexistant — la tolérance est exercée par ses contrôles, pas encore par un cycle complet |
| QLT-04 | `application/coverage.ts` (lignes introduites reconstruites depuis le CAS), parseur `jacoco-xml` et `measurableIntroducedPaths` dans `parsers.ts`, contrôle `coverage` et témoins propres dans `target.ts`, `harness.introducedLines` qui alimente chaque invocation, artefact `base_files_<candidate_id>` | `v0/coverage` (lignes introduites, renommage prouvé, textes non lisibles rapportés), `v1/coverage` (constat bloquant localisé au fichier et à la ligne, refactoring sur lignes exercées accepté, dette antérieure nommée sans bloquer, mesure absente jamais lue comme couverture, trois témoins), `v2/harness` (lignes introduites transmises aux contrôles et vides sur la référence, deux textes conservés au dossier), campagne V4 Java avec JaCoCo réel ; **partiel** : la règle de non-aggravation porte sur la couverture du code introduit d'une cible Maven — exclusions, annotations de silence et modifications de seuils ne sont tenues que par la protection des `pom.xml`, et QLT-01, QLT-02, QLT-03, QLT-05 restent absentes |
| ARC-04, CON-03, REC-23, REC-33 | `StructureRule` et `ControlDefinition.structure_rules` gelées dans le protocole à G2, `adapters/execution/structure.ts` (déclarations `package` et `import`, graphe de paquets, composantes fortement connexes), parseur `java-imports` du runner générique, `structureRules` / `pomIdentity` / `packageRootOf` dans `target.ts`, témoin négatif propre au contrôle, `ContextInput.boundaries` qui transmet les frontières au producteur | `v1/structure` (règles dérivées des POM et de la disposition des paquets ; import interdit introduit refusé avec sa localisation exacte ; même violation non écrite par le candidat rapportée sans faire échouer ; cycle nommé là où le candidat l'a fermé ; cycle préexistant classé `preexisting` et toléré ; trois témoins ; frontières dans le prompt du producteur et non dans celui du relecteur), campagne sur la cible Maven réelle ; **partiel** : la portée est la cible Maven multi-module, `src/test/java` n'est dans aucune portée, la liste des familles de framework est gelée dans l'adaptateur, et un lien établi par réflexion ou configuration n'est pas observé (ARC-01) |
| VER-04, REC-19 | contrôle `mutation` et parseur `pitest-xml` de `target.ts` et du runner générique, `adapters/execution/mutation.ts` (portée depuis les déclarations de paquet, lecture du rapport, classement des statuts), `ControlDefinition.scope_argument` gelé avec le protocole, `readsMutationReport` et `mutationNegativeWitness` dans `target.ts`, profil d'isolation `loopback` | `v1/mutation` (mutant survivant sur une ligne écrite refusé avec fichier, ligne, opérateur et méthode ; survivant sur une classe non touchée sans effet ; survivant sur une ligne non écrite d'une classe modifiée compté en dette ; mutant indécis `INDETERMINATE` ; budget dépassé `INDETERMINATE` puis `resolve_incident` à G5 sans dépense de tentative ; seuil de la cible nommé et non opposé ; rapport absent ou tronqué jamais lu comme une suite qui tue tout ; portée dérivée des déclarations, non lancée sur la référence ; trois témoins), `v1/sandbox` (un profil `loopback` se joint lui-même et aucun autre hôte), campagne V4 Java avec PITest réel sous Seatbelt ; **partiel** : l'angle mutation seul — propriétés, fuzzing, contrats, tests différentiels et métamorphiques absents, activation selon le risque absente, portée limitée aux sources `.java` d'une cible Maven, et aucun mutant exclu justifié n'est gelé avec le protocole |
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
| UX-05 | `extension/index.ts` (`bind`, `unbind`, résolution par session puis par `cwd`), liaison conservée dans le journal et non dans la session Pi, opérations projetées dans la table `operations` par `ledger.appendChange` sous une clé `idempotency_key` unique en base | `v2/ledger` (liaison, déliaison ; extension rechargée et conversation bifurquée : la seconde session retrouve la liaison par `cwd` et l'opération active, et l'ouverture d'un second contrôle ou d'une seconde intégration sous la même clé est refusée sans laisser d'événement ; une clé déjà prise le reste après clôture), `v0/change-rules` (`OPERATION_ACTIVE`), `v3/pi-entries` |
| UX-06..UX-10, SA-022..SA-028, RM-057..RM-066 | `review.ts`, `diff.ts`, `review-surface.ts` | `v0/review-model`, `v0/review-surface` |
| UX-11 | `review-text.ts` | `v0/review-model` (données) ; concordance multicanale non exercée en RPC |
| EXT-01 | `target.ts` (`capability_missing`), `backends.ts` (sandbox non qualifiée refusée), motif d'arrêt `capability_missing` | `v1/sandbox`, `v1/control-runner`, `v2/harness` |
| EXT-02 | `runtime.ts` (`environment_digest` couvrant l'arbre exécuté), `describeEnvironment` qui empreinte les versions des composants sondés, `reusableQualification` conditionnée à l'environnement, gate G2 et invalidation `environment_changed` | `v1/agent-port` (aucun skill, `AGENTS.md`, extension ou package du projet n'est chargé), `v1/platform-paths` (une version de composant qui bouge donne une autre empreinte, toutes choses égales par ailleurs ; la qualification établie sous l'ancienne n'est pas réutilisée, le protocole qui la porte échoue à G2, les preuves mesurées avant sont invalidées et le changement revient à la conception de la vérification ; une mise à jour pendant une intervention est refusée) |
| EXT-03, PRE-02, REC-28 | `target.ts`, F-JAVA | `v1/control-runner`, V4 Java |
| EXT-04, NFR-07 | règle d'imports | `scripts/check-layers.ts` |
| IMP-05 | pause et annulation, dossier exportable hors modèle, constats de revue séparés du verdict, `application/report.ts` (trois natures : ce que les contrôles ont mesuré, ce qui en a été conclu et par quelle autorité, ce qui reste non établi), `formatReport` et `/495 report` | `v0/change-rules`, `v2/export-integration`, `v0/review-model`, `v0/engineering-report` (une revue de modèle est classée en jugement et jamais en observation, aucun identifiant n'appartient à deux natures, une exécution dont tous les contrôles passent nomme encore ce qu'elle n'établit pas, et les limites — indécis, instable, tronqué, exclu, toléré, non qualifié, exigence sans contrôle — deviennent des risques nommés), `v2/harness` (le rapport d'un changement conduit est une projection du journal, identique à la relecture et sans exécuter quoi que ce soit) |
| NFR-01, NFR-02 | package, données locales | chargement par manifeste, aucun service distant |
| NFR-04 | bornes de flux | `v1/sandbox` (timeout, troncature) ; pas de mesure p95 |
| NFR-06 | `runtime.ts` (diagnostics locaux), export expurgé ; aucun point de télémétrie n'existe dans les sources | `v2/export-integration`, `v2/telemetry` (un changement conduit de la demande à l'export expurgé, sockets, DNS, `http`/`https` et `fetch` instrumentés, n'ouvre aucune connexion et ne résout aucun hôte, et tout ce qui s'exécute hors du processus le fait sous un profil `denied` ; aucune source ne porte de client réseau ni d'URL d'endpoint) |
| PRG-01, PRG-02 | capture vide / sans HEAD | `v2/workspace` ; socle non conduit de bout en bout |
| PRG-03..05 | `program.ts` | `v0/program` (noyau seulement) |
| SA-008 | `preparation.open`, `preparation.close` | `v2/preparation` |

## Exigences non couvertes

| Exigence | État | Renvoi |
| --- | --- | --- |
| PRE-04, PRE-05 | caractérisation de l'existant et évolution de la capacité de vérification par cycle : absentes | `ROADMAP.md` |
| ARC-01..03 | architecture réalisée, cible argumentée et migration progressive : absentes ; ARC-04 et CON-03 ont leur ligne ci-dessus, et la stack Node n'a pas d'adaptateur structurel | `ROADMAP.md`, `chantiers/03` |
| QLT-01..03, QLT-05 | référentiel, baseline, réduction de dette et conformité démontrée : absentes ; QLT-04 a sa ligne ci-dessus | `ROADMAP.md`, `chantiers/02` |
| RAG-01, RAG-02, RAG-04 | identification d'un besoin de connaissance, corpus officiel versionné et vérification de l'utilisation de la documentation : absentes | `STATUS.md` |
| EXP-01..04 | disciplines applicables, proportionnalité des choix, mobilisation des expertises et évaluation de la démarche : absentes | `STATUS.md` |
| NFR-05 | backend `bwrap` implémenté, Linux x86-64 jamais exécuté ; la portabilité est annoncée, pas qualifiée | `STATUS.md`, `chantiers/C` |
| IH-04 | l'arbitrage de vérifiabilité est déclaré dans les contrats mais exclu de `buildDecisionRequest` et de `requestDecision` ; une exigence qui reste non discriminable après deux préparations arrête le changement sur `capability_missing` au lieu d'être portée à l'arbitrage humain | `ROADMAP.md`, `chantiers/00` |
