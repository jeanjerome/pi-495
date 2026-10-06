# Les identifiants de phase portent le nom de l'étape, et un dossier écrit avant reste lisible

Story : e32s02
Epic : e32
Statut : à faire

## 1. Ce que le lecteur gagne

Celui qui lit 495 par sa sortie structurée — le JSON des modes RPC et print, le dossier exporté, une
erreur canonique — y trouve les phases sous leurs mots techniques : `clarifying`, `specifying`,
`verification_design`, `designing`, `implementing`, `integrating`. L'écran les nomme Scoping,
Specification, Qualification, Design, Implementation et Integration (`e32s01`). Un outil qui suit 495 doit
tenir une table de correspondance que personne ne publie.

Il gagne des identifiants qui portent le nom de l'étape, et des dossiers déjà écrits qui se lisent et se
reprennent sans migration. C'est un défaut et non une préférence (`D-83`) : deux vocabulaires pour les
mêmes étapes, l'un à l'écran et l'autre dans les données, obligent chaque lecteur à traduire.

## 2. Promesses

Scenario: Un changement écrit les nouveaux identifiants
  Given un projet et un agent scripté qui mène un changement jusqu'à son acceptation
  When le changement est conduit de bout en bout
  Then les événements `phase.entered` de son journal nomment, dans l'ordre, `scoping`, `specification`, `qualification`, `design`, `implementation`, puis `verifying`, `deciding` et `closed`
  And aucun événement du journal ne porte `clarifying`, `specifying`, `verification_design`, `designing`, `implementing` ni `integrating`

Scenario: La sortie structurée nomme la phase par l'étape
  Given un changement arrêté en attente d'une décision pendant la spécification
  When le statut est demandé en mode RPC
  Then le champ `phase` de la vue du changement vaut `specification`

Scenario: Un dossier écrit avant se lit sous les nouveaux identifiants
  Given un journal dont les événements et la projection portent les anciens identifiants, écrit par une version d'avant, avec un changement en pause pendant la spécification et une révision qui l'avait ramené à `verification_design`
  When 495 charge ce changement
  Then sa phase est `specification`, et le retour de la révision se lit `qualification`
  And `/495 resume` le conduit jusqu'à son acceptation
  And la vérification d'intégrité du journal ne relève aucun problème : les événements écrits avant gardent leurs octets et leur chaîne d'empreintes

Scenario: Le contrat publié ne connaît que les nouveaux identifiants
  Given le contrat `contracts/v1/canonical-error.json`
  Then l'énumération de `phase` est `intake`, `scoping`, `specification`, `qualification`, `preparing`, `design`, `implementation`, `verifying`, `reviewing`, `deciding`, `integration`, `closed`
  And une erreur canonique levée pendant la qualification porte `"phase": "qualification"`

Scenario: Un refus nomme la phase par son nouvel identifiant
  Given un changement en spécification
  When une commande réservée à la conception lui est appliquée
  Then le refus dit que la commande n'est pas permise dans la phase `specification`, et qu'elle l'est dans `design`

## 3. Sécurité

La chaîne d'empreintes du journal est touchée : un dossier écrit avant n'est jamais réécrit. Ses
événements gardent leurs octets, et donc leur empreinte ; les anciens identifiants sont traduits quand ils
sont lus, jamais dans ce qui est stocké. Un dossier exporté avant reste vérifiable par son `verify.mjs`.

## 4. Tâches

### Tâche 1 — Le noyau écrit les nouveaux identifiants et traduit les anciens à la lecture

`PHASES` (`src/contracts/v1/common.ts`) prend les identifiants de `D-83` : `clarifying` devient
`scoping`, `specifying` `specification`, `verification_design` `qualification`, `designing` `design`,
`implementing` `implementation`, `integrating` `integration` ; les autres ne changent pas. Tout ce qui les
cite suit : les transitions et les rôles du domaine (`decide.ts`, `commands.ts`, `invalidation.ts`),
l'aiguillage du noyau (`harness.ts`), les vues (`views.ts`), les libellés de
`src/presentation/structured/text.ts`, l'extension et les tests. Un identifiant ancien lu dans un journal —
`phase` de `phase.entered` et de `resume_point.saved`, `rollback_phase` de `artifact.revised` — et dans la
projection d'un changement (`changes.phase`, `changes.state`) est traduit en son nouveau nom à la lecture,
en un seul endroit ; rien de stocké n'est réécrit.

- Vérifie : `node --test test/v2-kernel/phase-ids.test.ts`
- Tient : `test/v2-kernel/phase-ids.test.ts`, « un changement conduit jusqu'à l'acceptation par un agent scripté écrit des `phase.entered` qui nomment dans l'ordre `scoping`, `specification`, `qualification`, `design`, `implementation`, `verifying`, `deciding`, `closed`, et aucun ancien identifiant ; un journal dont les événements et la projection portent les anciens identifiants, en pause pendant `specifying` après une révision ramenée à `verification_design`, se charge en phase `specification` avec un retour `qualification`, `/495 resume` le conduit à l'acceptation, et `verifyIntegrity` ne relève aucun problème ; une commande de conception appliquée en spécification est refusée pour la phase `specification`, permise dans `design` »
- Rouge : `PHASES` vaut aujourd'hui `clarifying`, `specifying`, `verification_design`… ; un changement écrit `phase.entered` `clarifying` puis `specifying`, et un journal ancien se charge en phase `specifying`

### Tâche 2 — Le contrat et la sortie structurée publient les nouveaux identifiants

`npm run contracts` régénère `contracts/v1/canonical-error.json` et `operation-result.json` depuis
`PHASES`. La vue du changement que reçoivent les modes RPC et print porte le nouvel identifiant.

- Vérifie : `node --test test/v0-pure/phase-contract.test.ts`
- Tient : `test/v0-pure/phase-contract.test.ts`, « l'énumération de `phase` de `contracts/v1/canonical-error.json` est `intake`, `scoping`, `specification`, `qualification`, `preparing`, `design`, `implementation`, `verifying`, `reviewing`, `deciding`, `integration`, `closed`, et une erreur canonique levée en qualification porte `"phase": "qualification"` »
- Rouge : l'énumération publiée liste `clarifying`, `specifying`, `verification_design`, `designing`, `implementing`, `integrating`

### Tâche 3 — Le corpus normatif cite les nouveaux identifiants

`specs/amont/specification-fonctionnelle.md` (le diagramme des états et les tableaux du §6), et les
occurrences de `specs/amont/conception-technique.md` et `specs/amont/expression-besoins.md` citent les
identifiants de `D-83`.

- Vérifie à la main : `grep -nE "clarifying|specifying|verification_design|designing|implementing|integrating" specs/amont/*.md` ne rend rien ; puis `npm run build` et `npm run check`, vert
- Tient : la recherche, vide, et la lecture du diagramme des états, dont les états sont `intake`, `scoping`, `specification`, `qualification`, `preparing`, `design`, `implementation`, `verifying`, `reviewing`, `deciding`, `integration`, `closed`
- Rouge : `specs/amont/specification-fonctionnelle.md` cite 32 fois les anciens identifiants, `conception-technique.md` et `expression-besoins.md` une fois chacun

## 5. Hors périmètre

- Les textes déjà enregistrés qui citent un ancien identifiant, comme la raison d'un arrêt « not allowed in
  phase specifying » : ce sont des faits passés, que la chaîne d'empreintes garde tels quels.
- Les noms des artefacts et leurs contrats (`mandate.json`, `requirements.json`, `protocol.json`,
  `design.json`) et les clés `policy.adoption.mandate`, `requirements`, `design` : ils nomment ce que les
  étapes produisent (`D-83`).
- Le numéro de version et les notes de publication qui annoncent le changement de contrat : à la
  prochaine publication, qui est du propriétaire.
- Les dossiers de `specs/verifications/`, les décisions et les stories versées.
