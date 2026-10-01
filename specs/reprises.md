# Les reprises à comportement constant

Les reprises que l'audit de `src/` et `test/` du 2026-10-01 a retenues, dans l'ordre où elles se
font : les deux nettoyages de répertoires temporaires des tests, la passe sur les erreurs, puis les
suppressions de duplications, de jumeaux de types, de code mort et de commentaires qui citent une
décision. Une reprise ne change aucun comportement : elle prend le chemin court de `D-80`, conduit par
`npm run cycle -- reprises` (`cycle/README.md` § Les reprises), et arrive sur `main` en un commit.

Chaque section est une reprise : `Où` situe le code, `Constat` dit ce que l'audit a lu, `Reprise` dit
le changement minimal, `Règle` dit la règle de `CONVENTIONS.md` ou d'un skill du dépôt qu'il fait
tenir, et `Limite`, quand elle est là, dit ce que la reprise ne fait pas. Les numéros de ligne sont
ceux de `main` à `75e98ef` : ils glissent à mesure que les reprises sont versées, et le code fait foi.

`Statut` vaut `à faire` à l'écriture. L'outil l'écrit ensuite : `versée` au versement, dont le commit porte la reprise,
`écartée — <raison>` quand la session constate que la reprise changerait un comportement ou que le
code la dément. Une reprise écartée n'est pas perdue : son défaut va au registre ou à une story.

Les numéros suivent ceux des constats de l'audit. Ce qui manque à la liste a pris un autre chemin :

- 1 : au registre (`BUG-2026-10-01T200000`), porté par `e10s04` ;
- 2, 3 et 33 : la story `e30s01` ; 4 : `e30s02` ; 5 : `e30s03` ;
- 15 : au registre (`BUG-2026-10-01T200100`), car la correction change ce qu'un contrôle rapporte ;
- 46 : gardé, `CTX-05` nomme la boucle qu'il proposait de retirer ;
- 76 à 81 : à ne pas faire, ou déjà conformes.

## R06 — Les répertoires temporaires des tests de l'outil du cycle sont supprimés après chaque test

Statut : versée

- Où : test/cycle/*.test.ts (11 fichiers sur 12) · test/helpers/cycle.ts:58-68,76-87,97-108
- Constat : depot(), fauxClaude() et contexte() créent un à trois tempDir() chacun ; aucun rmSync, afterEach ni t.after sous test/cycle (vingt appels à tempDir). Mesuré sur la machine : 25 654 dossiers 495-* pour 1,9 Go dans $TMPDIR, du 29 septembre au 1er octobre. Non supprimés : le propriétaire décide.
- Reprise : Une liste cleanups et un afterEach dans helpers/cycle.ts, alimentés par les trois helpers, sur le modèle des fichiers v2.
- Règle : Isolation : un test crée son répertoire et le supprime dans afterEach.

## R07 — Les répertoires temporaires des tests se nettoient d'une seule façon

Statut : versée

- Où : test/helpers/harness-fixture.ts:212-214 · test/helpers/fixtures.ts:6
- Constat : makeHarness et tempDir allouent sans nettoyage, et les appelants ont quatre styles : cleanups[] + afterEach (v2), root de module + afterEach (v1), try/finally dans le it (v1/installation.test.ts:251-258,417-424,499-529 ; v4/java-stack.test.ts:139,229), mkdtemp de module + after (v1/junit-reader.test.ts:111-112). Deux racines coexistent : os.tmpdir() et <cwd>/test-output/ (25 Mo).
- Reprise : makeHarness enregistre son nettoyage (ou renvoie dispose()), tempDir prend un registre optionnel ; puis fondre les quatre styles.
- Règle : Un seul style par arbre ; nettoyage dans afterEach.

## R08 — Les adaptateurs enveloppent la panne de ce qu'ils pilotent dans une erreur qui garde sa cause

Statut : écartée — Les erreurs que git() lève, comme celle de l'échec de git commit dans l'intégrateur, ne sont pas internes : l'intégrateur en recopie le message mot pour mot dans le detail de l'événement operation.effect du dossier (integrator.ts, detail = error.message). Le préfixe « git <cmd> failed in <cwd>: » demandé par la reprise changerait donc le texte d'un événement, ce que D-80 §2 interdit.

- Où : src/adapters/workspace/git-workspace.ts:61-66 · object-store/cas.ts:68-71 · git/integrator.ts:172
- Constat : Aucun { cause } dans tout src/ (grep : 0). git() relance l'erreur brute d'execFile ; l'intégrateur construit new Error(`git commit failed: ${stderr}`) sans origine. La chaîne ne se lit pas du symptôme à la cause.
- Reprise : throw new Error(`git ${args[0]} failed in ${cwd}`, { cause: error }) dans git() ; même forme pour la lecture du CAS et l'intégrateur.
- Règle : Un adaptateur enveloppe la panne de ce qu'il pilote dans un Error avec cause.
- Limite : Le message de l'erreur qui enveloppe garde le texte de l'erreur d'origine, précédé de son contexte : un message que le dossier ou le propriétaire lit ne perd rien (D-80).

## R09 — Le message d'une erreur se lit par une seule fonction qui accepte toute valeur levée

Statut : versée

- Où : 19 sites sous adapters/ et extension/ · application : review.ts:319, installation.ts:374, phases/specify.ts:46
- Constat : 22 (error as Error).message sur un catch unknown ; instanceof Error une seule fois (pi-worker/capabilities.ts:160). .message.split(...) à parsers.ts:254 et jest-report.ts:95 plante si ce qui est lancé n'est pas un Error.
- Reprise : Un messageOf(error: unknown): string dans domain/errors.ts (instanceof Error ? message : String(error)) ; remplacer les 22 sites.
- Règle : as seulement vers unknown ou à une frontière validée.

## R10 — La borne de lecture des rapports JUnit se reconnaît sans lire son message

Statut : à faire

- Où : src/adapters/execution/runner.ts:439-445
- Constat : La borne de 500 fichiers est levée dans le try qui avale les échecs de readdir, puis récupérée par (error as Error).message.startsWith("JUnit report scan exceeded").
- Reprise : Sortir la vérification de la borne du try (lister dans le try, boucler dehors), ou une classe locale ScanBound extends Error testée par instanceof.
- Règle : Jamais de contrôle par message : un résumé est pour un humain et peut être reformulé.

## R11 — Les refus du worker se reconnaissent par leur classe et non par leur texte

Statut : à faire

- Où : src/adapters/pi-worker/worker-main.ts:187,192
- Constat : blocked = /outside the workspace|budget exhausted|not allowed/.test(message) et /budget exhausted/ : des erreurs levées dans le même fichier (l.46,49,56,145,149) sont reconnues par regex sur leur texte.
- Reprise : Une classe locale Refusal extends Error { kind: "workspace" | "budget" } levée aux cinq sites, instanceof aux deux sites de lecture.
- Règle : Jamais de contrôle par message.

## R12 — Chaque abandon d'erreur dit pourquoi il est sans conséquence

Statut : à faire

- Où : runner.ts:393,428 · supervisor.ts:131 · git-workspace.ts:175 · cas.ts:77 · extension/session.ts:204,348 · application : stacks/node.ts:353, stacks/maven.ts:297,359,423,575,581, environment.ts:63,71, complement.ts:80
- Constat : Catch vides ou .catch(() => undefined) sans la phrase qui dit pourquoi l'abandon est inoffensif. Les catch commentés (node.ts:25, artifacts.ts:294, environment.ts:39,82, policy.ts:35, reports.ts:155,168) montrent la forme attendue.
- Reprise : Une ligne de commentaire chacun, ou faire remonter l'échec du readdir dans notes comme structure.ts:98 le fait.
- Règle : La seule forme tolérée d'un catch vide dit ce qui est abandonné et pourquoi c'est sans conséquence.
- Limite : Les lectures que la story e30s03 corrige (l'index des fichiers du candidat, la relecture des rapports de spécification) ne sont plus des abandons : n'y touche pas. S'y ajoutent les abandons que e30s03 laisse hors périmètre : `verification.ts` (qualification antérieure), `phases/implement.ts:45`, `harness.ts:419,422,750`. Seul un commentaire est ajouté : faire remonter un échec dans des notes changerait un comportement.

## R13 — Une vue modale de Pi rend son échec sans fabriquer de valeur

Statut : à faire

- Où : src/extension/session.ts:249-263
- Constat : .then(done, (e) => { failure = e; done(undefined as unknown as T) }) : un T fabriqué pour faire passer un rejet par le done: (result: T) => void de Pi, qui n'a pas de chemin de rejet (types.d.ts:118).
- Reprise : ctx.ui.custom<{ value: T } | { failure: unknown }> avec void (async () => { try { done({ value: await work() }) } catch (failure) { done({ failure }) } })().
- Règle : async/await plutôt qu'une chaîne .then ; un as qui ne valide rien.
- Limite : Le composant visuel et ce qu'il affiche ne changent pas ; seule la façon de transmettre l'échec change.

## R14 — Les deux conversions forcées du worker vers les types de Pi sont retirées ou justifiées

Statut : à faire

- Où : src/adapters/pi-worker/worker-main.ts:246,328
- Constat : Deux as never : l'objet d'opérations ls forcé au-delà de LsToolOptions de Pi ; une string nue forcée en ThinkingLevel.
- Reprise : l.328 : rétrécir contre getSupportedThinkingLevels(model), déjà utilisé dans capabilities.ts:110, et refuser le mandat sinon. l.246 : respecter la forme de Pi, ou écrire ce qui a été cherché et pas trouvé.
- Règle : as seulement vers unknown ou après validation.
- Limite : Pour la l.328, la reprise ne change rien à ce que reçoit Pi : si un rétrécissement contre les niveaux que Pi déclare oblige à refuser un mandat, c'est un comportement nouveau, et la reprise écrit à la place, au point du cast, ce qui a été cherché dans l'API de Pi et pas trouvé.

## R16 — La porte G5 reçoit le protocole et le candidat que l'appelant a vérifiés

Statut : à faire

- Où : src/domain/gates/g5.ts:21-22
- Constat : const protocol = state.protocol!; const candidate = state.candidate!; alors que l'invariant est établi chez l'appelant (decide.ts:832-833 échoue avant d'appeler).
- Reprise : evaluateG5(state, protocol, candidate, policy), ou un paramètre state & { protocol: FrozenProtocol; candidate: CandidateRef }.
- Règle : ! au point qui connaît l'invariant, pas un appel plus loin.

## R17 — Les assertions non nulles qu'un rétrécissement remplace sont retirées

Statut : à faire

- Où : phases/review.ts:19 · stacks/maven.ts:625-654 · views.ts:128-130 · context.ts:154,158,176 · preparation.ts:107 · phases/decide.ts:54-74 · phases/integrate.ts:24-26
- Constat : ! remplaçables par un rétrécissement : narrowing perdu dans un callback après la garde (review.ts:13), perdu à travers filter (maven.ts:618), flatMap plutôt que filter + !, input.controls ?? []. Dans decide.ts et integrate.ts, candidate! sans précondition dans la fonction. Les autres ! du périmètre (diff.ts, review.ts:198-398, harness.ts:277,318, qualification.ts:146…) sont des invariants justifiés.
- Reprise : Au cas par cas : prédicat de type sur le filter, flatMap, ?? [] ; une précondition explicite dans les deux phases.
- Règle : ! seulement pour un invariant que le type ne voit pas, là où il est connu.

## R18 — Les tests vérifient une erreur par sa classe et son code

Statut : à faire

- Où : test/v2/model-admitted.test.ts:141 · v2/specification-reopening.test.ts:512 · v2/harness.test.ts:1348
- Constat : Une sentinelle comparée par message (error.message === "this test never drives a session") ; deux contrôles de code sans instanceof DomainError. Les autres correspondances auditées (v1/model-admitted:58,93-99, config-schema:132, change-rules:959,1248,1540) affirment d'abord le code puis le texte, qui est le produit ; structure:185, stryker-mutation:98-99 et control-runner:945,1018 affirment le texte d'un finding : légitimes.
- Reprise : assert.ok(e instanceof DomainError) aux deux sites ; une classe NeverDriven extends Error pour la sentinelle.
- Règle : Une erreur se vérifie par instanceof DomainError et son code.

## R19 — Les décisions de porte se construisent par une seule fonction

Statut : à faire

- Où : src/domain/change/decide.ts — 14 émissions gate.decided : G0 ×3 l.503-558, G1 ×3 l.635-690, G2 l.711, G3 ×3 l.765-820, G4 l.1080, G5 l.840, G6 ×2 l.886-920
- Constat : Chaque émission répète un littéral d'environ 20 lignes avec evidence_retained: [], evidence_ignored: [], evidence_missing: [], fail_requirements: [], indeterminate_requirements: []. Environ 280 des 1 746 lignes du fichier sont cette seule forme. Le fichier est un réducteur agrégé qui partage emit/fail/state ; sa taille vient de là, pas d'un mélange de préoccupations, et une scission en fichiers obligerait à faire circuler Ctx.
- Reprise : Un helper decideGate(gate, verdict, evaluated, reasons, next_action, extras = {}) sur Ctx qui remplit les cinq listes vides ; les gates qui passent des listes réelles (G2, G4, G5) passent extras. Environ 200 lignes de moins, comportement identique.
- Règle : Extraire la logique partagée dans une fonction.

## R20 — La constante des limites vides n'existe qu'une fois

Statut : à faire

- Où : src/ports/execution.ts:297-304 vs src/contracts/v1/evidence.ts:38-45
- Constat : EMPTY_LIMITS défini deux fois, octet pour octet. Seul celui de evidence.ts est importé (test/v0/engineering-report.test.ts) ; lint:exports laisse passer la copie parce que le nom apparaît ailleurs.
- Reprise : Supprimer la copie de ports/execution.ts.
- Règle : Export mort ; ne jamais dupliquer.

## R21 — L'ordre des phases et des portes vient du contrat

Statut : à faire

- Où : src/domain/change/decide.ts:1733-1746 · src/domain/invalidation.ts:21
- Constat : PHASE_ORDER est la même liste de 12 phases, dans le même ordre, que PHASES (contracts/v1/common.ts:150) ; ORDER est la même liste de 7 gates que GATES (common.ts:191). Une phase ajoutée d'un côté dérive de l'autre.
- Reprise : import { PHASES, GATES } et supprimer les deux tableaux locaux.
- Règle : Vocabulaire fermé défini une fois.

## R22 — Les ports et le domaine nomment les types du contrat au lieu de les réécrire

Statut : à faire

- Où : commands.ts:29 · ports/ledger.ts:57-58,93-95 · ports/execution.ts:38,187,227-240 · change/apply.ts:414-415,439
- Constat : Jumeaux manuscrits de types existants : le verdict réécrit en cinq littéraux alors que Verdict (common.ts:148) sert déjà à EvidenceEntry et à evidence.recorded ; OperationStatus, EffectState, Phase, ExecStatus, Outcome réécrits dans les ports ; output_schema réécrit au lieu de keyof typeof OUTPUT_SCHEMAS ; AttemptCounters (state.ts:72) réécrit en ligne six fois.
- Reprise : Remplacer chacun par l'alias existant ; les helpers d'apply.ts prennent AttemptCounters.
- Règle : Dériver du contrat, ne jamais réécrire son jumeau.

## R23 — Les unions répétées du domaine portent un nom unique

Statut : à faire

- Où : state.ts:149,124 · events.ts:136,103,66-70,91-97 · commands.ts:125,108 · contracts/v1/reports.ts:21,27-32
- Constat : « approve | reject | consultative » écrit quatre fois ; le résultat d'intervention « completed | failed | cancelled | truncated » trois fois ; les formes mandat {allowed_paths, integration, language} et modèle {provider_id, model_id, thinking_level, location?} deux fois chacune. La sévérité de revue est un Type.Union de littéraux alors que Closed(SEVERITIES) est l'idiome du dépôt (evidence.ts:63,87).
- Reprise : Nommer ReviewConclusion, InterventionResult, MandateTerms, ModelIdentity une fois dans state.ts et importer ; Closed(SEVERITIES) dans reports.ts.
- Règle : Une union, un nom, un endroit.

## R24 — Une seule interface décrit la vue d'un rapport de spécification

Statut : à faire

- Où : src/domain/change/state.ts:315-318 vs 436-439
- Constat : DeclaringReport et SpecificationReportView sont la même forme ; declarationsOfReport prend l'une, specificationStanding l'autre.
- Reprise : Garder l'exportée, supprimer DeclaringReport.
- Règle : Interface dupliquée.

## R25 — Le verdict de G5 n'a plus de branche morte

Statut : à faire

- Où : src/domain/gates/g5.ts:186-187
- Constat : if (v.includes("FAIL") && !v.some(…)) return "FAIL"; puis return v.includes("FAIL") ? "FAIL" : … : la première ligne est subsumée par la seconde.
- Reprise : Supprimer la l.186.
- Règle : Branche morte.

## R26 — Le réducteur rejette par un seul chemin

Statut : à faire

- Où : src/domain/change/decide.ts:1409-1418
- Constat : rejectWith construit un DomainError et retourne reject(...) ; toutes les autres méthodes lancent via this.fail, que decide() rattrape vers le même {ok:false}. Deux chemins pour un seul résultat.
- Reprise : Remplacer les six return rejectWith(msg, code) par this.fail(code, msg) et supprimer rejectWith.
- Règle : Un helper en double.

## R27 — La fin d'une intervention en cours se construit par une seule fonction

Statut : à faire

- Où : src/domain/change/decide.ts:181-190 vs 1332-1341
- Constat : block() et changeCancel() construisent chacun un intervention.finished à compteurs nuls, unknownCost(...), unobservedEnd(...).
- Reprise : Un helper endRunningIntervention(result, detail).
- Règle : Quasi-doublon.

## R28 — Les identifiants fermés du réducteur sont typés

Statut : à faire

- Où : decide.ts:934 · decide.ts:1646 · gates/g2,g4,g5.ts et state.ts:167
- Constat : hasValidDecision accepte quatre interactions, deux seulement sont appelées (l.523,655,785) ; allowed: Record<string, string[]> pour les transitions d'effet alors qu'EffectState existe (d'où le ?. l.1654) ; next_action est un ensemble fermé de 12 littéraux porté en string.
- Reprise : Rétrécir à "IH-02" | "IH-05" ; Record<EffectState, readonly EffectState[]> ; type NextAction = … | `request_decision:${HumanInteraction}`.
- Règle : string là où un type fermé ou un littéral de gabarit existe.

## R29 — Le cas impossible d'un aiguillage exhaustif s'écrit d'une seule façon

Statut : à faire

- Où : apply.ts:401 · program.ts:180,324 · decide.ts:303,477 vs invalidation.ts:153
- Constat : (never as { type: string }).type dans le default exhaustif, contre JSON.stringify(never) dans invalidation.ts.
- Reprise : JSON.stringify(never) partout.
- Règle : Un as sur never incohérent d'un fichier à l'autre.

## R30 — Le type des schémas TypeBox s'importe comme un type

Statut : à faire

- Où : src/contracts/v1/reports.ts:193,202,206,212
- Constat : import("typebox").TSchema écrit en ligne quatre fois ; extractJsonOutput(): unknown | undefined, qui vaut unknown.
- Reprise : import type { TSchema } from "typebox" ; type de retour unknown.
- Règle : import type est l'idiome du dépôt.

## R31 — Le commentaire de Closed dit ce que la fonction émet

Statut : à faire

- Où : src/contracts/v1/common.ts:16
- Constat : Le commentaire dit « Uses anyOf of constants » ; Closed émet { type: "string", enum: [...] }.
- Reprise : Reformuler : « émet un enum de chaînes ».
- Règle : Commentaire périmé qui contredit le code.

## R32 — Le commentaire des budgets dit la règle sans le journal de mesure

Statut : à faire

- Où : src/domain/policy.ts:66-80
- Constat : Quinze lignes de commentaire qui racontent une campagne de mesure (noms de modèles, taux d'appel, scripts/measure-budgets.ts). C'est un « pourquoi », donc défendable, mais il se lit comme un processus.
- Reprise : Garder la phrase qui énonce la règle (quelle borne tombe en premier), retirer le journal de mesure.
- Règle : Un commentaire décrit le comportement, pas le processus qui l'a produit.
- Confiance : plausible, non vérifié par une compilation ou une mesure ; écarter la reprise si la lecture du code la dément.

## R34 — L'ouverture d'un changement ne fabrique plus un état nul

Statut : à faire

- Où : src/application/harness.ts:360,380
- Constat : let unit: Unit = { state: null as unknown as ChangeState, revision: 0 } n'est jamais lu avant d'être réaffecté l.380 (l.361-379 ne touchent pas unit). Le state! l.380 affirme que le réducteur produit un état sur change.create.
- Reprise : Supprimer la l.360 ; déclarer let unit: Unit = { state, revision } l.380 après if (!state) throw new DomainError("INVALID_TRANSITION", …).
- Règle : as unknown as pour fabriquer une valeur ; initialiseur mort.

## R35 — L'ouverture d'un changement garde le programme qu'elle vient d'écrire

Statut : à faire

- Où : src/application/harness.ts:319-359,400
- Constat : commitProgram renvoie ProgramState ; les trois appels jettent la valeur, puis l.400 recharge avec loadProgram(programId)!.
- Reprise : const program = this.commitProgram(…) et le renvoyer ; retirer le ! l.400 (celui de l.277 reste, c'est l'état qui vient d'être ajouté).
- Règle : ! remplaçable par la valeur déjà en main.

## R36 — Le harnais ne reçoit plus deux dépendances qu'il ne lit pas

Statut : à faire

- Où : src/application/harness.ts:87-89 · src/extension/runtime.ts:118-119
- Constat : HarnessDeps.instance_id et HarnessDeps.denied_read_paths sont injectés et jamais lus dans application/ (vérifié : aucun deps.instance_id ni deps.denied_read_paths dans src/). Les sandboxes reçoivent denied_read_paths par un autre chemin (runtime.ts:69,89).
- Reprise : Retirer les deux champs de HarnessDeps et de l'appel du runtime.
- Règle : Pas de couche de configuration inutilisée.

## R37 — Le harnais ne garde que l'ordre des phases

Statut : à faire

- Où : src/application/harness.ts (1 036 lignes ; 51 des 300 derniers commits)
- Constat : 14 dépendances injectées, 3 collaborateurs construits, une façade PhaseContext à 17 membres, 17 méthodes publiques et 3 champs publics, environ 7 préoccupations : câblage, primitives de commit, start (106 l.), modèles de lecture, boucle de conduite et politique erreur→blocage, runIntervention (177 l. : contexte, trois magasins, cinq commits, budget), answerDecision (86 l. en cinq blocs quasi identiques), opérations explicites. L'en-tête l.8 dit « This module holds the order of the phases, and nothing else » : faux.
- Reprise : Trois extractions, pas une scission en classes (chaque méthode est une transaction fine sur le ledger et les tests v2 appellent harness.X ; scinder serait du brassage) : runIntervention vers phases/intervene.ts avec {artifacts, interventions, objects, commit, now, id, language} ; les effets d'answerDecision l.826-877 en table Record<interaction, (response) => ChangeCommand | null> ; openReview vers review.ts. Puis corriger l'en-tête. Le fichier tombe vers 750 lignes.
- Règle : Une responsabilité par module ; un commentaire ne contredit pas le code.
- Limite : Pas de scission en plusieurs classes : seulement les trois extractions nommées, puis l'en-tête corrigé.

## R38 — Une demande de décision se construit par un objet d'options

Statut : à faire

- Où : src/application/phases/phase.ts:81-92 et six appels : clarify.ts:71-81, phase.ts:121,138-148, verification-design.ts:121-132, decide.ts:59,61, integrate.ts:28-38
- Constat : requestDecision prend dix paramètres positionnels ; les appelants écrivent des trous null, undefined, undefined, language. Le défaut language = "fr" (harness.ts:716) n'est jamais utilisé, chaque appelant le passe.
- Reprise : Un objet d'options { interaction, subject, facts, recommendation, arg?, decisionId?, language, adoptable? } avec language obligatoire.
- Règle : Lisibilité ; défaut inutile.

## R39 — Les types de l'intervention et des interactions de phase ne sont plus réécrits

Statut : à faire

- Où : phases/phase.ts:39-45,48 vs harness.ts:520-526,710 et decisions.ts:402
- Constat : InterventionOutcome réécrit en ligne comme type de retour de runIntervention ; Exclude<HumanInteraction, "IH-03" | …> écrit trois fois alors que PhaseInteraction existe.
- Reprise : Promise<InterventionOutcome> ; importer PhaseInteraction.
- Règle : Jumeaux manuscrits.

## R40 — Les contrôles des piles partent d'une base commune

Statut : à faire

- Où : stacks/maven.ts:30-50,57-77,83-103,109-138 · stacks/node.ts:40-62,259-282 · maven.ts:247,362,426,545 et 355-360,419-424
- Constat : Six littéraux ControlDefinition à 19 champs dont 10 à 12 identiques (version, cwd, env_allowlist, env, requires, writable_paths, protected, structure_rules, network, scope_argument), environ 65 lignes ; node.ts dérive déjà ses cinq autres contrôles par spread de nodeTestControl, maven.ts n'étend rien. Dans maven.ts, le strip /<profiles\b[\s\S]*?<\/profiles>/g est écrit quatre fois et la boucle lire-le-POM-ou-continuer deux fois. Au-delà, les deux stacks ne partagent que la forme StackDetection : témoins JS contre Java, parsing JSON contre XML, rien à mutualiser.
- Reprise : Un baseControl(requirementRefs) de dix lignes dans stack.ts, que chaque adaptateur étend ; un outsideProfiles(xml) dans maven.ts. Rien de plus : un cadre commun aux stacks contredirait CONVENTIONS § Structure.
- Règle : Extraire la logique partagée ; pas d'abstraction préventive.

## R41 — La conception de la vérification se lit comme une séquence d'étapes

Statut : à faire

- Où : src/application/phases/verification-design.ts:297-463
- Constat : Une fonction de 167 lignes avec quatre fermetures internes (diagnose, takenByOwner, settleUnjudged, needsPreparation) et un diagnostic en deux passes ; adoptInstalls sort au premier échec avec un objet reconstruit (l.265-271).
- Reprise : Remonter les quatre fermetures en fonctions de module prenant (detection, requirements, unit) ; la phase garde la séquence.
- Règle : Une chose par fonction.

## R42 — Le coordinateur reconnaît un lint par ce que l'adaptateur déclare

Statut : à faire

- Où : src/application/verification.ts:344-347
- Constat : r.category.includes("quality" | "lint") et control_id === "lint" codés dans le coordinateur ; épinglé par engineering-report.test.
- Reprise : L'adaptateur étiquette le contrôle (par exemple kind: "lint") plutôt qu'un test sur son identifiant.
- Règle : CONVENTIONS § Structure : ce qu'une capacité ajoute par technologie se déclare dans l'adaptateur, jamais dans une condition centrale sur un nom.

## R43 — La détection d'un fichier binaire n'existe qu'une fois

Statut : à faire

- Où : src/application/review.ts:96-100 = src/application/coverage.ts:69-73
- Constat : isBinary identique dans les deux fichiers ; coverage.ts importe déjà de review.ts.
- Reprise : Exporter une fois, importer l'autre.
- Règle : Ne jamais dupliquer.

## R44 — Les options qu'aucun appelant ne fait varier sont retirées

Statut : à faire

- Où : decisions.ts:411 · review.ts:350 · installation.ts:86-87
- Constat : authority? jamais passé par un appelant ; readChanges(..., context = 3) jamais varié ; les défauts d'installableRecommendations inutilisés (les deux appelants passent quatre arguments).
- Reprise : Supprimer authority et les défauts ; garder context seulement sur hunks, varié par les tests.
- Règle : Options jamais variées.

## R45 — Le harnais lit ses raisons d'arrêt dans une table

Statut : à faire

- Où : src/application/harness.ts:483-489,902,923-925,73
- Constat : Ternaire imbriqué code d'erreur → raison ; verify() rapporte stopped_because: "max_steps" sur succès ; pause utilise deux identifiants de corrélation là où resume en utilise un ; Finding importé d'un module déjà importé l.13.
- Reprise : Une table Record ; une valeur "completed" ou réutiliser stopOf ; un seul cor ; fusionner l'import.
- Règle : Lisibilité.

## R47 — Les commentaires du code disent le comportement au lieu de citer une décision

Statut : à faire

- Où : application : diff.ts:2, context.ts:38,229, harness.ts:666,793, stacks/node.ts:6, target.ts:2, review.ts:2, stack.ts:2 · domaine : imposed-layers.ts:2,13,38,54, decide.ts:602, ports/execution.ts:157,198,244
- Constat : Identifiants de décision ou de story dans des commentaires (D-06, D-19, D-37, D-48, D-55, D-72, « §6a–§6c of e23s02 »). Aucun « chantier », « lot » ni « previously » trouvé. Les tags d'exigence (QLT-04, VER-05, RM-010) pointent le corpus normatif et restent.
- Reprise : Remplacer chaque identifiant par la phrase que la décision énonce, par exemple « la couche que Pi observe sur le chemin OAuth ».
- Règle : Consigne globale : aucune référence de type D12 ou chantier dans un commentaire ; décrire le comportement.

## R48 — Le registre projette un changement par une seule fonction

Statut : à faire

- Où : src/adapters/storage-sqlite/ledger.ts:214-228 ≡ 304-318
- Constat : L'INSERT INTO changes … ON CONFLICT et son .run à neuf arguments sont dupliqués mot pour mot.
- Reprise : private projectChange(state: ChangeState): void appelé des deux endroits.
- Règle : Ne jamais dupliquer.

## R49 — Les transactions du registre passent par une seule enveloppe qui garde l'erreur d'origine

Statut : à faire

- Où : src/adapters/storage-sqlite/ledger.ts:113-170 et 585-602
- Constat : Deux enveloppes BEGIN IMMEDIATE / COMMIT / ROLLBACK écrites à la main ; celle du bail ne garde pas le ROLLBACK (l.600), un rollback en échec remplace l'erreur d'origine.
- Reprise : private transaction<T>(work: () => T): T portant le rollback gardé.
- Règle : Doublon ; ne jamais perdre l'erreur d'origine.

## R50 — Le registre lit ses lignes par une seule fonction

Statut : à faire

- Où : src/adapters/storage-sqlite/ledger.ts (27 as : l.184-197, 296, 384, 467-513, 561-570 as unknown as SessionBinding[])
- Constat : Chaque ligne SQL est crue ; .all() passe par as unknown as parce que Record<string, SQLOutputValue>[] n'est pas comparable au type du port. Le schéma et l'écrivain sont au dépôt, la confiance est défendable, mais elle est éparpillée.
- Reprise : Un rows<T>(stmt, …): T[] unique où as unknown as apparaît une fois avec sa raison ; les colonnes JSON state sont le seul risque réel et peuvent passer par check(...) si un schéma existe.
- Règle : Frontière gardée, ou confiance centralisée avec sa raison.

## R51 — L'arrêt d'un groupe de processus s'écrit une seule fois

Statut : à faire

- Où : src/adapters/sandbox/process.ts:48-64 vs src/adapters/pi-worker/supervisor.ts:97-104,115-116,185-190
- Constat : killGroup (kill du groupe de processus avec ESRCH avalé) et la paire SIGTERM → setTimeout(SIGKILL, grace).unref() sont écrits deux fois, trois paires de timers.
- Reprise : export function terminateGroup(child, graceMs) dans sandbox/process.ts ; pi-worker importe déjà sandbox/backends.ts.
- Règle : Ne jamais dupliquer.

## R52 — Les rapports d'incident des lecteurs de contrôles se construisent par une seule fonction

Statut : à faire

- Où : execution/parsers.ts:73-74,109,226-227,508-509 · structure.ts:262-263 · jest-report.ts:75-76 · mutation.ts:464-482
- Constat : { verdict: "INDETERMINATE", facts: { exit_code, incident }, notes: [incident], failures: [] } écrit sept fois ; le helper outside(...) de FAIL écrit trois fois (parsers.ts:111,229, jest-report.ts:78).
- Reprise : incidentReport(obs, incident, extraFacts?) et exitedOutsideTests(obs, facts, note, output) dans parsers.ts.
- Règle : Ne jamais dupliquer.

## R53 — Les rapports JaCoCo et PIT se lisent avec l'analyseur XML

Statut : à faire

- Où : execution/parsers.ts:213-216,332-335 (intAttr/strAttr, guillemets doubles seulement) · mutation.ts:213-222 (tagText/attr, les deux)
- Constat : JUnit est lu par @rgrove/parse-xml ; JaCoCo et PIT sont raclés par regex avec deux lecteurs d'attributs divergents.
- Reprise : Lire JaCoCo et PIT par parseXml avec un parcours du style testCasesOf ; supprime decodeXml, intAttr, strAttr, tagText, attr.
- Règle : Préférer la bibliothèque déjà présente ; une logique, une fonction.
- Limite : Constat plausible : si l'analyseur XML lit un rapport autrement que les expressions d'aujourd'hui sur un des rapports de `test/fixtures/`, la reprise est écartée.
- Confiance : plausible, non vérifié par une compilation ou une mesure ; écarter la reprise si la lecture du code la dément.

## R54 — La commande /495 répartit ses sous-commandes par une table

Statut : à faire

- Où : src/extension/command.ts:44-318 · conduct.ts
- Constat : Un switch de 270 lignes à 16 cas ; if (!session.binding) { emit("no binding"); return } dix fois ; session.lang() === "fr" ? … : … treize fois alors que presentation/structured/text.ts:5-44 utilise des tables L[lang] ; l.197 un ternaire mort ("Export" : "Export").
- Reprise : const bound = (ctx) => session.binding ?? (emit(ctx, "no binding"), null) ; une table T[lang] pour les libellés de l'extension ; un handler par sous-commande dans un Record<Subcommand, Handler>.
- Règle : Une responsabilité par fonction ; ne jamais dupliquer.

## R55 — La vérification d'un dossier exporté réutilise l'empreinte du noyau

Statut : à faire

- Où : src/export/export-service.ts:289,308-311
- Constat : await import("node:fs/promises") alors que writeFile et mkdir sont importés statiquement l.6 ; await import("node:crypto") dans la boucle par événement, recalculant à la main ce que digestBytes (importé l.9) fait.
- Reprise : const expected = digestBytes(new TextEncoder().encode(`${previous ?? ""}${canonicalize(e.event)}`)) ; import statique de readFile.
- Règle : Code minimal ; inspecter ce que les dépendances font déjà.

## R56 — Le protocole du worker n'exporte que ce qu'on lit

Statut : à faire

- Où : src/adapters/pi-worker/protocol.ts:27-43
- Constat : ProducerReport, ReviewReport, ObservationReport, SpecificationReport et leurs quatre alias …Type sont réexportés et lus par personne (grep sur src, test, scripts) ; check-exports.ts:29 ne voit que export function | const, le gate est aveugle aux réexports.
- Reprise : Ne garder que OUTPUT_SCHEMAS, TOOLS_FOR_ROLE, extractJsonOutput, normalizeOutput, retainedRefusedText.
- Règle : Supprimer le code mort ; un export que personne ne lit est un contrat que personne ne tient.

## R57 — Les outils du worker sont typés sans any

Statut : à faire

- Où : src/adapters/pi-worker/worker-main.ts:153,172-180
- Constat : biome-ignore pour ToolDefinition<any, any, any>. Pi déclare TState = any par défaut et execute comme méthode (bivariante), donc ToolDefinition<TSchema, unknown> accepte peut-être déjà chaque résultat de create*ToolDefinition ; Pi déclare aussi AnyToolDefinition (types.d.ts:378) sans l'exporter.
- Reprise : Essayer type AnyTool = ToolDefinition; et retirer l'ignore ; le cast tool.execute as (…) l.172-180 tombe avec.
- Règle : any jamais.
- Confiance : plausible, non vérifié par une compilation ou une mesure ; écarter la reprise si la lecture du code la dément.

## R58 — Le commentaire orphelin des options de l'exécuteur est retiré

Statut : à faire

- Où : src/adapters/execution/runner.ts:42-45
- Constat : RunnerOptions se termine par un doc-commentaire (« Absolute paths never readable… ») qui ne documente aucun champ.
- Reprise : Supprimer le commentaire.
- Règle : Un commentaire ne contredit pas le code.

## R59 — Les tests importent une fonction depuis son module d'origine

Statut : à faire

- Où : src/adapters/execution/runner.ts:454 · storage-sqlite/ledger.ts:725
- Constat : Réexport d'application/qualification et export { evidenceDigest } : seuls test/v1/control-runner.test.ts:7 et test/v2/ledger.test.ts:6 lisent à travers eux, tous les autres tests importent l'origine.
- Reprise : Importer l'origine dans les deux tests, supprimer les deux lignes.
- Règle : Indirection morte.

## R60 — Les bornes d'un instantané viennent de la politique d'espace de travail par défaut

Statut : à faire

- Où : src/adapters/git/integrator.ts:68-72,89-93,175-179 · src/extension/runtime.ts:116
- Constat : { max_file_bytes: 8 * 1024 * 1024, max_entries: 50_000 } écrit quatre fois ; DEFAULT_WORKSPACE_POLICY (git-workspace.ts:26) porte les mêmes valeurs.
- Reprise : { ...DEFAULT_WORKSPACE_POLICY, exclusions: reference.exclusions }.
- Règle : Ne jamais dupliquer.

## R61 — Les bornes et motifs des lecteurs de rapports sont déclarés une seule fois

Statut : à faire

- Où : execution/parsers.ts:304,309-311 · mutation.ts:68,73-75 · lcov.ts:88
- Constat : MAX_NAMED_PATHS = 10 déclaré trois fois ; la paire de regex de parsers.ts:309-311 et mutation.ts:73-75 quasi identique.
- Reprise : Exporter une fois depuis parsers.ts.
- Règle : Ne jamais dupliquer.

## R62 — Les événements d'outil de l'agent scripté se construisent par une seule fonction

Statut : à faire

- Où : src/adapters/pi-worker/scripted-agent.ts:107-134,139-164,169-183
- Constat : Les paires tool_started / tool_finished sont écrites trois fois, environ 60 lignes.
- Reprise : function* toolEvents(tool, id, ok).
- Règle : Ne jamais dupliquer.

## R63 — La surface de revue attend ses chargements sans chaîne de then

Statut : à faire

- Où : src/presentation/tui/review-surface.ts:171-218
- Constat : .then / .finally dans settle et diffFor : lancer-et-oublier voulu (le rendu ne doit pas bloquer), mais en chaîne.
- Reprise : private async settle(...) avec try/catch/finally, sites d'appel en void this.settle(...) ; même comportement.
- Règle : async/await plutôt qu'une chaîne .then.

## R64 — La requête de revue a un seul type

Statut : à faire

- Où : presentation/tui/review-command.ts:6-10 · review-text.ts:12-16 · review/view.ts:12-15 · review/reader-pane.ts:72,87 · review/tree-pane.ts:93
- Constat : Le type { changes(), content() } écrit en ligne trois fois ; deux volets codent du français en dur alors que Labels existe.
- Reprise : Un ReviewQuery exporté de application/review.ts ; trois clés de libellés.
- Règle : Ne jamais dupliquer ; libellés au même endroit.
- Limite : Seulement le type : déplacer les libellés français codés en dur vers `Labels` changerait le texte affiché à un utilisateur anglophone, ce n'est pas une reprise.

## R65 — Les projets de test du harnais se créent et se nettoient par une seule aide

Statut : à faire

- Où : project() ×10, track() ×8 : v2/harness.test.ts:27-42, telemetry:20-35, export-integration:24-38, answer-revocation:25-40, observed-layers-dossier:17-28, tool-call-budget:9-24, specification-reopening:16-31, verifiability-arbitration:49-56, preparation:33-40
- Constat : Corps identiques : tempDir("495-proj-") → push → fixtureTs → initRepo, et track pousse t.root ; chacun avec son bloc cleanups + afterEach. answer-revocation ajoute seulement un paramètre de fixture. v3/question-closure délègue déjà à commandProject() ; v3/model-select:66 et v1/target-registry:19 sont les deux vraiment différents.
- Reprise : trackedProject(fixture = fixtureTs), track() et un registre afterEach partagé dans helpers/harness-fixture.ts, qui possède déjà makeHarness. Environ 9 × 16 lignes supprimées.
- Règle : Ne jamais dupliquer.

## R66 — Les observations et les invocations de contrôle des tests viennent d'une seule aide

Statut : à faire

- Où : obs() ×5 : v1/stryker-mutation:51, mutation:72, structure:52, coverage:68, control-runner:71 · base() ×4 : v1/coverage:110, structure:69, mutation:126, control-runner:56
- Constat : Corps identiques octet pour octet. base() existe déjà sous le nom invocationBase() dans helpers/lcov-control.ts:45 ; obs() double observation() de helpers/fake-npm.ts:22 et fake-maven.ts:35 (seuls les horodatages diffèrent).
- Reprise : Exporter invocationBase et une observation(over) depuis un petit helpers/execution-fixture.ts ; supprimer les neuf copies locales, environ 130 lignes.
- Règle : Ne jamais dupliquer.

## R67 — Les aides de test copiées d'un fichier à l'autre sont réunies

Statut : à faire

- Où : control() ×5 · entry() ×5 · doc() ×3 · piAvailable() ×4 (v3/pi-entries:22, model-select:416, config-refused:38, pi-rpc-sdk:27) · chunks() ×3 · depot() ×3 (cycle/git.test.ts:18, cycle/controls.test.ts:12)
- Constat : piAvailable ×4 identique, avec la constante PI et la note de skip dupliquées à côté ; entry() ×3 identique (v0/review-parameters, review-model, review-surface), deux différents ; control() ×5 ne diffèrent que par les défauts, ce que helpers/lcov-control.ts:20 absorbe déjà ; doc() même forme, nom par défaut différent ; chunks() ×3 mêmes trames SSE ; depot() ≈ helpers/cycle.ts:58 sans la story.
- Reprise : helpers/pi-available.ts (une fonction, PI, la note) ; fusionner les trois entry() ; openaiChunks(text, usage) pour v3 ; un controlOf(over) à une base.
- Règle : Ne jamais dupliquer.

## R68 — Les tests attendent une condition au lieu d'un délai

Statut : à faire

- Où : test/cycle/cycle.test.ts:193 (setTimeout(r, 700) dans le faux relecteur B) · v0/review-parameters.test.ts:99,191,208 (tick : 10 ms après render())
- Constat : Attentes devinées (« A a déjà échoué à ce stade », « le chargement asynchrone a résolu »), pas une condition. v0/review-surface.test.ts:120-130 drawn() montre la bonne forme : sonder jusqu'à ce que « chargement… » disparaisse. helpers/rpc-client.ts:117-127 waitQuiet attend une condition (flux silencieux) ; v1/agent-port.test.ts:55 est du jeu, fake-worker gère l'abort dans les deux ordres : acceptables.
- Reprise : review-parameters : sonder query.asked.length comme drawn(). cycle:193 : faire attendre B sur un fichier que le gestionnaire d'échec de A écrit, ou sonder existsSync(cwd).
- Règle : Pas d'attente arbitraire ; attendre la condition.

## R69 — Les tests règlent le bac à sable et l'intégrateur par les options du harnais

Statut : à faire

- Où : test/v2/harness.test.ts:1293 · v2/verifiability-arbitration.test.ts:682,833 (harness.deps.sandbox.qualification = …) · verifiability:1057 (harness.integrator = new GitIntegrator(…).step)
- Constat : Mutation de la dépendance injectée après construction : deps est readonly mais son objet est écrit, integrator est un champ public mutable (harness.ts:703). D'autres tests obtiennent le même effet par makeHarness({ sandbox: "platform" }).
- Reprise : Options sandbox: "unqualified" et integration: true dans HarnessOptions.
- Règle : Arranger par l'interface publique.

## R70 — L'horloge et les identifiants du banc des règles du changement sont déterministes

Statut : à faire

- Où : test/helpers/change-fixture.ts:44-48 (let clock + tick()) · :234 (Math.random() dans evidence_id)
- Constat : Horloge mutable de module partagée par tous les it d'un fichier ; v0/change-rules.test.ts:2413 compte sur le fait qu'elle a dépassé 10:00:00 (expires_at). Identifiants aléatoires non reproductibles (aucun test ne les affirme, inoffensif aujourd'hui).
- Reprise : tick est monotone, l'ordre ne peut pas inverser un verdict ; le moins coûteux est un identifiant à compteur et un resetClock() dans le constructeur de Runner.
- Règle : Pas d'état mutable partagé ; identifiants déterministes.
- Confiance : plausible, non vérifié par une compilation ou une mesure ; écarter la reprise si la lecture du code la dément.

## R71 — Les tests de l'extension passent par des doubles typés de Pi

Statut : à faire

- Où : test/v3/*.test.ts : 65 as unknown as ExtensionAPI / ExtensionContext / ExtensionCommandContext (model-select 18, resume 15, question-closure 13, answer-revocation 11…) et 36 pi.command!(…)
- Constat : ExtensionSession et registerCommand495 prennent l'ExtensionAPI entière (session.ts:92, command.ts:36) ; FakePi et FakeContext sont partiels, chaque site d'appel caste.
- Reprise : Soit rétrécir le paramètre de production à Pick<ExtensionAPI, "registerCommand" | "registerTool" | "registerMessageRenderer" | "on" | "sendMessage" | "appendEntry"> (FakePi entre sans cast), soit sans toucher src/ : FakePi.host(), FakeContext.asCommand(), FakePi.run(args, ctx) qui affirme l'enregistrement. Environ 100 casts et ! en moins.
- Règle : Fakes typés qui implémentent le port.
- Limite : Choisir l'option qui ne change pas la surface publique de l'extension si l'autre oblige à modifier un type exporté que Pi appelle.

## R72 — Un test réservé à macOS dit pourquoi il est sauté

Statut : à faire

- Où : test/v1/sandbox.test.ts:40 · control-runner.test.ts:357,608,820,1068 · lcov-control.test.ts:74
- Constat : darwin ? it : it.skip saute en silence hors macOS, sans note. Les { skip } de v4/java-stack:23, v3/* et v1/model-admitted:139 portent leur note.
- Reprise : { skip: process.platform !== "darwin" && "seatbelt is macOS-only" }.
- Règle : Jamais de skip sans note sur ce qui reste non résolu.

## R73 — Les règles du changement se testent dans trois fichiers

Statut : à faire

- Où : test/v0/change-rules.test.ts (2 815 lignes, 10 describe, 93 it)
- Constat : Trois sujets sans lien : clôture et révocation de questions (l.175-1738, 55 it, 60 % du fichier), gates G2/G4/G5 (l.1740-2028), budgets, décisions, intégration, pause (l.2030-2815). Le littéral DecisionRequest de 16 lignes est inliné neuf fois (l.191, 296, 490, 744, 936, 1077, 1111, 2086, 2137). Les six it « revoked / paused earlier build » (l.1365-1479) partagent mise en place et assertion à un événement près.
- Reprise : Scinder en trois fichiers le long des describe existants ; un builder decisionRequest(interaction, over), environ 140 lignes ; les six it en table.
- Règle : Un fichier, un comportement ; ne jamais dupliquer.
- Limite : La scission en trois fichiers et le constructeur `decisionRequest` seulement : réécrire des tests en table changerait leurs lignes d'assertion.

## R74 — Les répétitions des grands fichiers de test sont réunies

Statut : à faire

- Où : v2/harness.test.ts (2 133 l., describe fourre-tout l.54-1742) · v2/verifiability-arbitration.test.ts:817-852 vs 1372-1395 · v2/preparation.test.ts:360-367,441-448,553-560 · v1/control-runner.test.ts:592-929 · v2/specification-reopening.test.ts:180-193 vs 213-226
- Constat : Le script implement qui écrit RIGHT est répété 14 fois ; la fermeture answerPending apparaît dans six fichiers (harness ×3, specification-reopening:57-79, verifiability:136-154, preparation:1039-1055) ; askedAdoption / untouched / g4Decisions dupliqués npm contre Maven ; le patch POM JaCoCo trois fois identique alors que fixtureJava(..., withCoverage) existe (helpers/fixtures.ts:139) ; la fermeture run = async (fake) => { mkdtemp; install; runControl } sept fois ; le bloc QA/QB/RA/RB deux fois.
- Reprise : writesGreet(content) ; answerPending dans harness-fixture.ts ; paramétrer par stack ; réutiliser fixtureJava ; un helper run dans control-runner.
- Règle : Ne jamais dupliquer.
- Limite : Ne réunir que ce qui ne réécrit aucune ligne d'assertion ; paramétrer npm et Maven par pile est écarté si cela réécrit des assertions.

## R75 — Les commentaires des tests disent le comportement

Statut : à faire

- Où : 11 commentaires avec D-xx (v0/review-parameters:130, v2/harness:1171, en-têtes de v1/imposed-layers*, v3/session-*) · 18 commentaires de campagne (v2/harness:582-584,743-745,844-845,929-931,1068-1070 : « Measured on the java-flashnext-L campaign »)
- Constat : Commentaires qui citent une décision ou racontent une campagne. Les noms de tests portent des tags d'exigence (66 it dans 18 fichiers, 113 describe sur 226) : CONVENTIONS § Comments ne dit rien des noms, et ces tags sont le seul lien exigence ↔ test depuis le retrait de la matrice ; ils restent.
- Reprise : Réécrire les 29 commentaires en comportement ; laisser les noms.
- Règle : § Comments : décrire le comportement, jamais le processus.
