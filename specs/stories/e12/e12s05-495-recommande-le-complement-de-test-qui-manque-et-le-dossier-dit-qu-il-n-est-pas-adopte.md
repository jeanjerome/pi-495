# 495 recommande le complément de test qui manque à une cible, et le dossier dit qu'il n'est pas adopté

Story : e12s05
Epic : e12
Statut : à faire

## 1. Ce que le lecteur gagne

Le propriétaire dont une exigence n'a aucun test capable de la juger reçoit aujourd'hui la décision « aucun
test ne peut juger R » avec pour issues préparer, assigner à une revue humaine ou réviser. Le diagnostic
sait pourtant pourquoi la cible juge mal : pas de couverture des lignes introduites, pas de mutation. Il le
range dans des notes en texte libre (« no JaCoCo report bound outside a profile… »), sans dire quoi ajouter
ni avec quel outil, et sans que le rapport du changement retienne que ce complément manque.

Après la story, chaque technologie déclare le complément qu'elle recommande quand un capteur qu'elle sait
lire manque : l'outil, sa version, la date à laquelle cette version a été établie, sa source, et ce que
la cible doit changer. La décision d'arbitrage le présente, le protocole gelé le porte, et le rapport du
changement le liste comme complément recommandé et non adopté. Adopter le complément est `e12s06`, quand ce n'est qu'une modification de fichier, et `e12s07` et `e12s08`, quand il faut installer.

## 2. Promesses

Scenario: Une cible Maven qui n'a ni JaCoCo ni PIT reçoit deux recommandations
  Given un projet Maven dont le POM ne lie ni JaCoCo ni PIT hors profil
  When la pile de la cible est détectée
  Then la détection recommande la couverture avec JaCoCo, et la mutation avec PIT
  And chaque recommandation porte l'outil, sa version, la date où cette version a été établie, sa source et ce que le POM doit déclarer

Scenario: Une cible Maven dont PIT est déclaré mais illisible reçoit la recommandation de ce qui lui manque
  Given un projet Maven dont le POM déclare PIT sans rapport XML et avec des dossiers de rapport horodatés
  When la pile de la cible est détectée
  Then la détection recommande la mutation en nommant ce que le POM doit changer, et pas l'ajout de PIT

Scenario: Une cible Node reçoit la recommandation de ce que son lanceur sait produire
  Given un package.json dont scripts.test vaut « node --test », puis un dont scripts.test vaut « vitest run » sans fournisseur de couverture installé
  When la pile de chacun est détectée
  Then la première reçoit la recommandation d'ajouter --experimental-test-coverage à scripts.test, sans rien installer
  And la deuxième reçoit celle d'installer @vitest/coverage-v8 à la version du vitest installé

Scenario: 495 ne recommande pas ce qu'il ne sait pas lire, ni ce que la cible a déjà
  Given une cible Node dont scripts.test vaut « jest », puis une cible Node qui demande déjà la couverture, puis une cible Maven dont JaCoCo et PIT sont lus
  When la pile de chacune est détectée
  Then aucune n'a de recommandation

Scenario: Une technologie ajoutée déclare ses recommandations sans toucher au noyau
  Given une liste d'adaptateurs à laquelle un adaptateur de test déclare une recommandation
  When la pile d'un projet qu'il reconnaît est détectée
  Then la détection porte cette recommandation, et aucune table centrale ne la connaît

Scenario: La décision d'arbitrage présente les recommandations
  Given une exigence obligatoire qu'aucun test ne discrimine après deux préparations, sur une cible qui a deux recommandations
  When la décision IH-04 est demandée
  Then ses faits listent chaque recommandation avec l'outil, la version, la date et ce que la cible doit changer
  And ses options restent préparer, assigner à une revue humaine et réviser
  And sur une cible sans recommandation, ses faits sont ceux d'aujourd'hui

Scenario: Le protocole gelé porte les recommandations et le rapport dit qu'elles ne sont pas adoptées
  Given un changement dont la cible a une recommandation et dont le protocole est gelé
  When le rapport du changement est rendu
  Then le protocole porte cette recommandation dans son diagnostic
  And le rapport liste un risque résiduel « recommended_complement_not_adopted » qui nomme le type de test, l'outil et sa version

Scenario: Un protocole gelé avant la story reste lisible
  Given un protocole gelé sans recommandation dans son diagnostic
  When il est relu et que le rapport est rendu
  Then le protocole est valide et le rapport ne porte aucun risque « recommended_complement_not_adopted »

Scenario: Dans un vrai Pi, la décision d'arbitrage d'une cible sans couverture recommande le complément
  Given une cible Node dont scripts.test vaut « node --test » et un agent scripté, déclaré comme tel, dont deux préparations ne retiennent aucun test discriminant, conduit dans un vrai Pi
  When la décision IH-04 est présentée au propriétaire
  Then elle recommande d'ajouter --experimental-test-coverage à scripts.test, avec sa version de Node et sa source
  And sur la construction d'avant la story, la même décision ne recommande rien

## 3. Sécurité

- Ce que 495 recommande est une donnée de l'adaptateur, jamais une sortie de modèle : un modèle ne propose ni
  outil ni version, et le contenu du projet n'en choisit aucun. Chaque recommandation porte la version et la
  date qui l'ont établie, comme `QLT-01` l'exige d'une recommandation « état de l'art ».
- Rien n'est installé, rien ne s'écrit dans la cible et aucun réseau n'est ouvert : la story ne fait que dire.
  L'installation est `e12s07` et `e12s08`, avec l'accord du propriétaire (`D-76`).
- Provenance : les recommandations viennent de la détection, qui ne lit que des fichiers du projet sans rien
  exécuter. Une recommandation ne dépend d'aucune sortie de contrôle.

## 4. Tâches

### Tâche 1 — Le diagnostic peut porter des recommandations

Le diagnostic de capacité du contrat gagne une liste optionnelle de recommandations : le type de test,
l'outil, sa version, la date où elle a été établie, sa source et ce que la cible doit changer. Un protocole
gelé sans cette liste reste valide. `npm run contracts` régénère le contrat publié.

- Vérifie : `node --test test/v0/contracts.test.ts`
- Tient : `test/v0/contracts.test.ts`, « given a capability diagnosis carrying a recommendation, then the schema accepts it, and given one without the list, then it is still accepted »
- Rouge : le schéma du diagnostic refuse un champ `recommendations` comme propriété inconnue

### Tâche 2 — Maven déclare ce qu'il recommande

L'adaptateur Maven recommande la couverture avec JaCoCo quand le POM ne le lie pas hors profil, la mutation avec
PIT quand il n'est pas déclaré, et, quand il est déclaré mais illisible, ce que le POM doit changer. Chaque
entrée porte l'outil, sa version, la date, la source et le changement.

- Vérifie : `node --test test/v1/recommendations.test.ts`
- Tient : `test/v1/recommendations.test.ts`, « given a Maven project binding neither JaCoCo nor PIT, then the detection recommends JaCoCo for coverage and PIT for mutation, each with its version, the date it was established, its source and the change the POM needs », « given PIT declared without an XML report and with timestamped directories, then the recommendation names what the POM must change » et « given a project whose JaCoCo and PIT are read, then it recommends nothing »
- Rouge : `detectMavenStack` ne renvoie aucune recommandation : la capacité manquante est une phrase (« no JaCoCo report bound outside a profile… ») qui ne nomme ni version, ni date, ni source

### Tâche 3 — Node déclare ce qu'il recommande

L'adaptateur Node recommande, pour `node --test`, d'ajouter `--experimental-test-coverage` à `scripts.test`, et,
pour vitest sans fournisseur installé, `@vitest/coverage-v8` à la version du vitest installé. Il ne
recommande rien pour jest, mocha ni pour une cible qui demande déjà la couverture.

- Vérifie : `node --test test/v1/recommendations.test.ts`
- Tient : `test/v1/recommendations.test.ts`, « given node --test without the coverage flag, then the detection recommends adding --experimental-test-coverage and installing nothing », « given vitest without a coverage provider, then it recommends @vitest/coverage-v8 at the version of the installed vitest » et « given jest, mocha or a target that already asks for coverage, then it recommends nothing »
- Rouge : `detectNodeStack` ne renvoie aucune recommandation, et la couverture d'une cible Node n'a aucune capacité manquante qui la nomme

### Tâche 4 — Une technologie ajoutée déclare ses recommandations

La détection porte les recommandations de l'adaptateur qui a reconnu le projet, sans qu'aucun module du noyau
ne les connaisse.

- Vérifie : `node --test test/v1/recommendations.test.ts`
- Tient : `test/v1/recommendations.test.ts`, « given a list of adapters gaining a test adapter that declares a recommendation, then the detection of a project it recognises carries it »
- Rouge : `StackDetection` n'a aucun champ pour une recommandation : l'adaptateur de test ne peut en déclarer aucune et la détection ne renvoie rien

### Tâche 5 — La décision d'arbitrage présente les recommandations

Les faits de la décision IH-04 listent chaque recommandation de la détection ; les options ne changent pas ;
sans recommandation, les faits sont ceux d'aujourd'hui.

- Vérifie : `node --test test/v2/verifiability-arbitration.test.ts`
- Tient : `test/v2/verifiability-arbitration.test.ts`, « given a target with two recommendations and a requirement no control discriminates after two preparations, then the IH-04 facts list each with its tool, version, date and change and the options stay prepare, assign_review and revise, and without a recommendation the facts are unchanged »
- Rouge : `requestVerifiabilityArbitration` ne donne aux faits que les notes du diagnostic et la ligne de risque, si bien que la décision ne nomme aucun outil

### Tâche 6 — Le protocole gelé porte les recommandations, le rapport les liste

Le gel du protocole copie les recommandations de la détection dans le diagnostic, et le rapport liste chacune
comme risque résiduel `recommended_complement_not_adopted`, avec le type de test, l'outil et la version. Un
protocole sans recommandation ne produit aucun de ces risques.

- Vérifie : `node --test test/v2/verification.test.ts test/v0/engineering-report.test.ts`
- Tient : `test/v2/verification.test.ts`, « given a target with a recommendation, then the frozen protocol carries it in its diagnosis » ; `test/v0/engineering-report.test.ts`, « given a protocol whose diagnosis carries a recommendation, then the report lists recommended_complement_not_adopted naming the test type, the tool and its version, and a protocol without any lists none »
- Rouge : `freeze` ne copie aucune recommandation dans le diagnostic, et `buildEngineeringReport` ne connaît aucun risque « recommended_complement_not_adopted »

## 5. Hors périmètre

- Adopter le complément : l'option qui l'accepte est `e12s06` pour une modification de fichier ; l'installation, le réseau ouvert à cette
  seule étape et les chemins protégés qui suivent la phase sont `e12s07` et `e12s08`. Tant que l'option n'existe pas, aucune
  réponse ne « refuse » un complément : le dossier dit seulement qu'il n'est pas adopté.
- La recommandation de Stryker pour une cible Node : elle vient avec `e12s09`, quand 495 sait lire son
  rapport. Recommander ce qu'on ne lit pas mène à une impasse.
- Les autres types de test (propriétés, intégration, contrat, caractérisation) : aucun signal que 495 observe
  ne dit qu'ils manquent. Le catalogue de l'adaptateur peut les porter le jour où un tel signal existe.
- La couverture de jest et de mocha : `e12s04` ne la lit pas, elle n'est donc pas recommandée.
- Une recommandation par exigence non jugée : la story recommande ce qui manque à la cible, pas le complément
  qui jugerait telle exigence.
- Le rafraîchissement des versions recommandées : chaque entrée porte la date de sa version ; décider quand
  elle périme est une décision du propriétaire, pas de cette story.
