# Le dogfooding de pi-495 atteint G2, construit le candidat et l'intègre sous le contrôleur identifié au départ

Story : e40s05
Epic : e40
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire d'une cible Node qui a installé Stryker obtient un contrôle de mutation qui tourne, quand sa cible est en
TypeScript 7 ou quand il borne la suite. Aujourd'hui, Stryker 10 réécrit le `tsconfig.json` de sa copie de travail par
`ts.parseConfigFileTextToJson`, que TypeScript 7 n'a plus : il sort avant le premier test, le témoin positif échoue, et
G2 refuse le protocole. La borne de suite que le propriétaire écrit dans la configuration du contrôleur ne s'applique
qu'au contrôle de tests : Stryker lance `npm test`, donc toute la suite, y compris les tests que la borne écarte parce
qu'ils échouent confinés. Enfin, un passage initial de Stryker en échec laisse sa copie de travail sous `.stryker-tmp`.
Le linter, lancé ensuite dans la même copie, la lit, et un contrôle qui n'a rien à voir avec le candidat échoue.

Le propriétaire de pi-495 obtient le dogfooding que l'epic promet : le contrôleur stable conduit un changement réel de
pi-495, de la demande à l'intégration dans la copie. Des campagnes réelles l'ont mesuré. Le 11 octobre, la mutation de
pi-495 plante et G2 échoue. Le 12 octobre, avec un réglage de Stryker posé dans la cible et `test-output/` donné à
`unit`, G2, G3 et G4 passent. G5 échoue alors sur le linter, faute du nettoyage, et sur un test préparé que
l'instrumentation de Stryker fait échouer.

## 2. Promesses

Scenario: Le contrôle de mutation d'une cible en TypeScript 7 est qualifié
  Given une cible Node dont la suite tourne par `node --test`, qui a installé Stryker 10.0.0 et TypeScript 7.0.2 et porte un `tsconfig.json`
  When le contrôle de mutation est qualifié sur ses témoins, dans le bac à sable de la plateforme
  Then son témoin positif est PASS et son témoin négatif FAIL, et aucune sortie ne nomme `parseConfigFileTextToJson`

Scenario: Une mutation dont le passage initial échoue ne laisse pas sa copie de travail
  Given une cible Node qui a installé Stryker, et une copie de son témoin positif où un test de `test/` échoue
  When le contrôle de mutation est qualifié sur ses témoins
  Then son témoin positif est FAIL, et aucun dossier ne reste sous `.stryker-tmp` dans la copie du témoin

Scenario: La borne de suite du propriétaire borne aussi la mutation
  Given une cible Node qui a installé Stryker, un test `test/nested/sandbox.test.js` qui échoue, et une borne de suite qui nomme `test/*.test.js` et `test/*.test.mjs`
  When le contrôle de mutation est défini avec cette borne et qualifié sur ses témoins
  Then son témoin positif est PASS, et la sortie de Stryker ne nomme pas `test/nested/sandbox.test.js`

Scenario: La borne de la configuration du contrôleur est figée dans le contrôle de mutation
  Given une configuration du contrôleur dont `suite_paths` nomme `test/*.test.js` et `test/pure/**/*.test.js`, et une cible qui a installé Stryker
  When le protocole est figé à G2
  Then la commande figée du contrôle `mutation` nomme chacun de ces deux motifs, et celle du contrôle `unit` aussi

Scenario: La configuration du dogfooding donne `test-output/` au contrôle de tests détecté et couvre les témoins de la technologie
  Given `specs/experiments/e38/dogfood/config.json`, et une cible façonnée comme pi-495 qui a installé Stryker
  When la configuration est lue comme la politique du contrôleur stable
  Then `writable_paths` donne `test-output/` au contrôle `unit`, et chaque fichier de test que la technologie Node écrit comme témoin correspond à un motif de `suite_paths`

Scenario: Le contrôleur stable intègre un changement réel de pi-495
  Given le contrôleur stable à la tête de la branche, un vrai Pi, un vrai modèle, et la demande de couper au dernier mot le titre d'une demande de plus de 80 caractères
  When la campagne `node cycle/src/dogfood.ts` est menée jusqu'à son verdict
  Then le relevé dit G2, G5 et G6 PASS, nomme l'arbre intégré, et dit la construction du contrôleur inchangée

## 3. Sécurité

La mutation reçoit la borne de suite de la configuration du contrôleur, hors de la copie. Elle est figée à G2 avec le
protocole, comme celle du contrôle de tests. Le candidat ne la resserre pas et ne l'élargit pas :
- les fichiers de configuration de Stryker restent protégés ;
- sous une borne, les options que le contrôle passe à Stryker, le lanceur de tests et sa commande, l'emportent sur celles
  de la configuration de la cible.

Stryker se lance par le code que porte la commande figée du contrôle, et s'importe depuis le `node_modules` de la copie,
comme aujourd'hui son exécutable : jamais depuis le `PATH` de l'hôte. Les droits d'écriture de la mutation ne changent
pas, `reports/mutation` et `.stryker-tmp`, et un lien posé à la place de `.stryker-tmp` fait toujours refuser le contrôle
(e40s02). Le nettoyage ne supprime que la copie de travail de Stryker, sous `.stryker-tmp`. Sur une cible en
TypeScript 7, le `tsconfig.json` est copié tel quel dans la copie de travail de Stryker au lieu d'être réécrit.

## 4. Tâches

### Tâche 1 — Stryker est lancé par son API, et ne réécrit pas le tsconfig d'une cible en TypeScript 7

Dans `src/adapters/stacks/node/mutation/mutation-control.ts`, la commande du contrôle lance Stryker par son API,
`node --input-type=module -e <lanceur> --`. Le lanceur importe `@stryker-mutator/core` depuis la copie et reçoit la
portée `--mutate=<fichiers>` que le contrôleur ajoute en fin de commande. Il passe à Stryker le rapport JSON, un seul
processus, la portée, et, quand le `node_modules/typescript/package.json` de la copie déclare une version majeure de 7 ou
plus, un `tsconfigFile` qui ne nomme aucun fichier de la copie. Stryker lit toujours la configuration de la cible. Le test
existant de `test/v1-adapters/node-stack.test.ts` qui lit la commande suit la nouvelle forme. Le test installe Stryker
10.0.0 et TypeScript 7.0.2, aux versions exactes et sans script d'installation, dans une cible `node --test` qui porte un
`tsconfig.json`. Il qualifie le contrôle sur ses témoins par le lanceur générique et le bac à sable de la plateforme.

- Vérifie : `node --test test/v4-platform/node-mutation.test.ts`
- Tient : `test/v4-platform/node-mutation.test.ts`, « sur une cible qui porte TypeScript 7.0.2 et un tsconfig.json, le contrôle de mutation est qualifié : témoin positif PASS, témoin négatif FAIL, et aucune sortie ne nomme parseConfigFileTextToJson »
- Rouge : Stryker 10 réécrit le `tsconfig.json` de sa copie de travail par `ts.parseConfigFileTextToJson`, que TypeScript 7 n'a pas ; il sort en 1 avant le premier test, et le témoin positif est FAIL.

### Tâche 2 — Une mutation en échec ne laisse pas sa copie de travail

Le lanceur passe `cleanTempDir: "always"` à Stryker. Le test qualifie le contrôle de la cible de la tâche 1 sur des
témoins dont la copie positive porte en plus un test de `test/` qui échoue, puis lit `.stryker-tmp` dans cette copie.

- Vérifie : `node --test test/v4-platform/node-mutation.test.ts`
- Tient : `test/v4-platform/node-mutation.test.ts`, « un test en échec dans la copie du témoin positif fait le témoin FAIL, et ne laisse aucun dossier sous .stryker-tmp dans cette copie »
- Rouge : Stryker ne supprime sa copie de travail qu'après un passage réussi ; après un passage initial en échec, `.stryker-tmp/sandbox-*` reste dans la copie, comme dans la campagne du 12 octobre où `lint-code` l'a lue.

### Tâche 3 — La borne de suite atteint le contrôle de mutation

`CapabilityQuestion` (`src/application/stacks/plugin.ts`) porte la borne de suite du propriétaire, que
`recognise` reçoit en paramètre, vide par défaut. Sous une borne, le lanceur passe à Stryker le lanceur de tests
`command`, avec pour commande celle du contrôle de tests suivie de la borne, chaque argument cité pour le shell. Sans
borne, Stryker garde le lanceur et la commande que la cible a choisis. Le test installe Stryker 10.0.0 dans une cible
`node --test` dont `test/nested/sandbox.test.js` échoue. Il définit le contrôle avec la borne `test/*.test.js` et
`test/*.test.mjs` et le qualifie sur ses témoins.

- Vérifie : `node --test test/v4-platform/node-mutation.test.ts`
- Tient : `test/v4-platform/node-mutation.test.ts`, « sous une borne qui écarte test/nested/sandbox.test.js, en échec, le témoin positif de la mutation est PASS et la sortie de Stryker ne nomme pas test/nested/sandbox.test.js »
- Rouge : Stryker lance `npm test`, soit `node --test` sur toute la cible ; `test/nested/sandbox.test.js` échoue au passage initial, et le témoin positif est FAIL.

### Tâche 4 — La borne de la configuration du contrôleur est figée dans la mutation

`designVerification` (`src/application/phases/verification-design.ts`) et la préparation
(`src/application/phases/prepare.ts`) passent `suite_paths` de la politique à `recognise`. Le test mène jusqu'au gel du
protocole un harnais dont la cible porte `node_modules/@stryker-mutator/core` et dont la politique borne la suite à
`test/*.test.js` et `test/pure/**/*.test.js`.

- Vérifie : `node --test test/v2-kernel/preparation.test.ts`
- Tient : `test/v2-kernel/preparation.test.ts`, « sous une politique qui borne la suite, la commande figée de mutation nomme chaque motif de la borne, comme celle de unit »
- Rouge : la phase appelle `recognise` sans la borne ; seule la commande de `unit` la reçoit, par `withOwnerPaths`, et la commande figée de `mutation` ne nomme aucun des deux motifs.

### Tâche 5 — La configuration du dogfooding donne test-output/ à unit et couvre les témoins

`specs/experiments/e38/dogfood/config.json` porte `policy.writable_paths`, qui donne `test-output/` à `unit`, et ajoute
`test/*.test.mjs` à `suite_paths`. La technologie Node écrit en `.mjs` les témoins de la couverture et de la mutation, à
la racine de `test/`, et la borne actuelle les écarte. `specs/experiments/e38/dogfood/README.md` dit ce que la
configuration donne à `unit`, ce que la borne couvre, et où en est le dogfooding. Le test reconnaît une cible façonnée
comme pi-495 qui a installé Stryker, et lit les fichiers de test de ses témoins.

- Vérifie : `node --test test/v4-platform/dogfood-controls.test.ts`
- Tient : `test/v4-platform/dogfood-controls.test.ts`, « la configuration du dogfooding donne test-output/ au contrôle unit, et chaque fichier de test que la technologie Node écrit comme témoin d'une suite node --test correspond à un motif de suite_paths »
- Rouge : la configuration ne porte pas `writable_paths` ; `test/495-unasserted-witness.test.mjs` et `test/495-covered-witness.test.mjs` ne correspondent à aucun motif de `suite_paths`.

### Tâche 6 — Recette : le contrôleur stable intègre un changement réel de pi-495

Mener depuis l'arbre de la branche `node cycle/src/dogfood.ts --controleur HEAD --candidat HEAD --objectif "<la demande>"`,
sous `anthropic/claude-sonnet-5-5`, avec la demande des campagnes du 11 et du 12 octobre : couper au dernier mot le titre
d'une demande de plus de 80 caractères. Rejouer la campagne jusqu'à ce que l'une intègre, et compter les campagnes. Une
campagne arrêtée par un piège inscrit au registre, `BUG-2026-10-12T171000` ou `BUG-2026-10-12T171500`, compte comme un
essai et ne fait pas échouer la recette. Toute autre cause d'arrêt la fait échouer. Le témoin négatif est la même
campagne avec `--controleur main`, contrôleur d'avant la story : elle s'arrête au plus tard à G2.

- Vérifie à la main : mener les campagnes ci-dessus, lire chaque `releve.json` et le dossier de la campagne qui intègre, et garder dans le dossier de la story le nombre de campagnes, la cause de l'arrêt de chacune et le relevé du témoin négatif.
- Tient : `specs/verifications/e40s05/`, relevé d'une campagne qui dit G2, G5 et G6 PASS, nomme l'arbre intégré et dit la construction du contrôleur inchangée, et relevé du témoin négatif arrêté au plus tard à G2.
- Rouge : sous le contrôleur de `main`, la mutation de pi-495 sort sur `ts.parseConfigFileTextToJson` et G2 échoue (campagne `dogfood-20261011T090513`).

## 5. Hors périmètre

- **Un test préparé que la mutation rend insatisfaisable.** Un test figé qui lit le texte de son module échoue sous
  l'instrumentation de Stryker et passe partout ailleurs, et le constat de la mutation ne nomme pas ce test. Le
  producteur ne peut ni le voir ni le corriger : `BUG-2026-10-12T171000`.
- **Le propriétaire simulé du dogfooding** ne répond qu'à l'adoption, l'acceptation et l'intégration. Une campagne où
  l'agent écrit une caractérisation que la référence contredit s'arrête sur la question qui suit :
  `BUG-2026-10-12T171500`.
- **Les générations `v1` à `v4` de pi-495** restent hors du contrôle confiné : e40s06 et e40s07.
- **La durée d'une mutation bornée.** Le lanceur de tests `command` n'a pas de couverture par test : chaque mutant relance
  toute la suite bornée. Le délai du contrôle, 30 minutes, ne change pas, et la recette relève la durée mesurée.
- **Une cible en TypeScript 6 ou avant** garde la réécriture du `tsconfig.json` que Stryker fait aujourd'hui.
- **Les autres lanceurs sous une borne.** La mutation bornée reprend la commande du contrôle de tests, quel qu'en soit le
  lanceur ; seul `node --test` est éprouvé.
