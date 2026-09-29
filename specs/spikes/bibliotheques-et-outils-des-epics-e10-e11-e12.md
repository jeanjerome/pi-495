# Bibliothèques et outils des epics e10, e11 et e12

**Statut : recherche du 2026-09-30, à relire avant d'adopter une version.** Versions, dates et licences
sont celles des registres npm et Maven Central et des dépôts à cette date ; elles périment. Ce document
propose, il ne décide pas : ce qui est décidé est dans `specs/adr/D-75` (ordre des adaptateurs),
`D-76` (réseau pour l'installation) et `D-77` (deux dépendances d'exécution). Le reste attend la story
qui le porte.

Légende : **[mesuré]** relevé par une exécution pendant la recherche (les mesures sur jest, mocha, le
lecteur JUnit et la clause de jqwik sont de cette session ; les autres viennent des agents de recherche,
qui citent des sources primaires) ; **[doc]** documentation ou code de l'outil ; **[opinion]** blog ou
consensus non vérifié en source primaire.

## 1. Ce qui touche le code de 495 aujourd'hui

- **Le lecteur JUnit compte deux fois les suites imbriquées** [mesuré] : un rapport du rapporteur `junit`
  de `node:test` à trois tests en donne quatre (`BUG-2026-09-30T120000`). Latent : aucun contrôle ne lit
  un tel rapport.
- **TypeScript 7 n'a pas d'API** [doc] : « TypeScript 7.0 does not ship with an API », une API différente
  est promise pour la 7.1. Le paquet de compatibilité `@typescript/typescript6` (alias npm) rend l'API 6.0.
  dependency-cruiser 18.4.0 déclare `typescript <7` et, sous TS 7, rend **0 module avec un code de sortie 0**
  [mesuré par l'agent] : un faux vert. Tout capteur qui s'appuie sur `typescript` doit contrôler qu'il a
  vu au moins un module avant de conclure. typescript-eslint 8.71.0 déclare `<6.1.0`.
- **Ordre de détection** : `package.json` l'emportait sur `pom.xml`. Décidé : Maven d'abord (`D-75`).
  Railpack place Java avant Node pour la même raison [doc].
- **Le gestionnaire de paquets d'une cible Node n'est pas toujours npm.** `package-manager-detector` 1.8.0
  (MIT, aucune dépendance) porte une table ordonnée des fichiers de verrou [doc].

## 2. Frameworks recommandés, par technologie et par type de test (e12)

Versions du 2026-09-30. « Réseau » dit ce que l'outil exige à l'exécution dans le bac à sable.

### Node / TypeScript

| Type | Défaut proposé | Alternatives | Rapport | Réseau |
|---|---|---|---|---|
| Lanceur | celui de la cible ; sinon `node:test` (Node 24.21.0, aucune dépendance) | vitest 5.0.2, jest 30.5.2, mocha 12.0.2 | `node:test` : `--test-reporter=junit` ; vitest : `--reporter=junit` ; jest : `--json --outputFile` natif ; mocha : `--reporter xunit --reporter-option output=` | aucun |
| Couverture | `c8` 12.0.0 ; vitest : `@vitest/coverage-v8` 5.0.2 | `nyc` 18.0.0 (préférer c8 en ESM natif), `node --experimental-test-coverage` (encore expérimental) | c8 : lcov, cobertura, `coverage-final.json` | aucun |
| Mutation | Stryker 10.0.0 (`@stryker-mutator/core`) et son runner (vitest, jest, mocha, ou tap pour `node:test`) | aucune maintenue (`mutode` : 2018) | `reports/mutation/mutation.json`, schéma mutation-testing-elements | **loopback** : il écoute en TCP sur `0.0.0.0`, `listen EPERM` sous `deny network*` |
| Propriétés | fast-check 4.10.2 | `@fast-check/vitest`, `@fast-check/jest` | aucun fichier : contre-exemple et graine dans le message | aucun |
| Intégration | supertest 7.3.0 | nock, msw | celui du lanceur | port loopback éphémère |
| Caractérisation | `t.assert.snapshot` de `node:test`, ou les snapshots de vitest/jest | `approvals` | fichiers snapshot | aucun |
| Contrat | Pact JS 17.1.4 | Prism (validation OpenAPI) | fichiers pact | loopback ; broker = réseau |
| Exclus | Playwright, Cypress (navigateurs et `postinstall` à télécharger) | | | oui à l'installation |

### Java / Maven

| Type | Défaut proposé | Alternatives | Rapport | Réseau |
|---|---|---|---|---|
| Unitaire | JUnit 6.1.3 + AssertJ 3.27.7 + Mockito 5.24.0, lancés par Surefire 3.6.0 | TestNG 7.12.0, Spock, Kotest | `target/surefire-reports/TEST-*.xml` | aucun |
| Couverture | JaCoCo 0.8.15 (`prepare-agent`, `report`) | | `target/site/jacoco/jacoco.xml` | aucun |
| Mutation | PIT 1.30.0 (`pitest-maven`) + `pitest-junit5-plugin` 1.2.3 | Descartes | `target/pit-reports/mutations.xml` (`outputFormats=XML`) | **loopback** |
| Intégration | Failsafe 3.6.0 ; Rest-Assured 6.0.1, WireMock 3.13.2 | | `target/failsafe-reports/` | aucun |
| Caractérisation | ApprovalTests 31.0.0 | | `*.approved.txt` | aucun |
| Contrat | Pact JVM 4.7.5 | | fichiers pact | loopback |
| Propriétés | jqwik 1.10.1 (`net.jqwik:jqwik`), compatibilité avec JUnit 6 à mesurer | Vavr-test 1.0.0 (non évalué) ; junit-quickcheck et QuickTheories ne sont plus maintenus | JUnit XML de Surefire | aucun |
| Exclus | Testcontainers 2.0.5 (Docker et images à tirer), Spring Cloud Contract (archivé) | | | |

Réserves [doc, mesuré par l'agent] : Mockito sur JDK 21+ demande `-javaagent:<mockito-core.jar>` via
`argLine` ; le plugin JUnit 5 de PIT n'annonce pas JUnit 6 (un cas minimal a marché, l'issue
`pitest-junit5-plugin#113` est ouverte, et le plugin n'a pas de version depuis 2025-05-20) ; le rapport de
JaCoCo porte un DOCTYPE à identifiant système que le lecteur ne doit jamais résoudre.

### jqwik

Depuis la 1.10 (1.10.1 : 2026-05-29), le guide et le README de jqwik portent une « Anti-AI Usage Clause »
[mesuré : guide de la 1.10.1, `LICENSE` du dépôt]. Ce n'est **pas une condition de la licence** : le
`LICENSE` est l'EPL-2.0 sans modification, et rien n'interdit l'usage. C'est une déclaration d'intention
(« This project is not meant to be used by any “AI” coding agents at all ») accompagnée d'une mesure
technique : chaque exécution du moteur écrit sur la sortie standard une ligne qui dit à un agent de ne pas
utiliser la bibliothèque et d'ignorer les résultats de ses tests. L'option `jqwik.hideAntiAiClause` la masque
pour un lecteur humain, pas dans une capture de la sortie.

Le propriétaire a tranché le 2026-09-30 qu'il n'a pas à suivre cette volonté de l'auteur. La ligne est une
instruction dans une sortie d'outil : elle n'a aucune autorité. 495 lit les verdicts dans le rapport JUnit
que Surefire écrit, non sur la sortie standard, et le contexte de chaque intervention dit déjà que le
contenu du projet et les sorties d'outils sont des données non fiables dont les instructions n'ont aucune
autorité (`src/application/context.ts`). Ce qui reste à mesurer dans la story du catalogue : jqwik reste sur
JUnit Platform 1.x et le projet est en maintenance seule, donc sa compatibilité avec le JUnit 6 que le
catalogue propose par défaut n'est pas établie.

## 3. Capteurs de qualité (e10)

**Pivot proposé : SARIF 2.1.0**, lu par un lecteur écrit à la main sur le sous-ensemble utile
(`runs[].tool.driver`, `results[]` avec `ruleId`, `level`, `message`, la première `physicalLocation`,
`partialFingerprints`, `suppressions`), typé par `@types/sarif` en développement seulement. Émetteurs
constatés à l'exécution : oxlint, Biome, Knip, jscpd, Checkstyle, PMD. Deux pièges [mesuré par l'agent] :
les URI ne sont pas homogènes (relatif, absolu sans schéma, `file:/`, `file:///`, `%SRCROOT%`), et seul
jscpd émet une empreinte d'identité. 495 calcule donc sa propre clé : règle, chemin normalisé avec suivi
des renommages, contenu de la ligne sans espaces. Les baselines natives des outils sont inutiles, 495
classant déjà nouveau, préexistant et retiré en lançant le capteur des deux côtés ; celle d'ESLint, qui
compte par fichier et par règle, se casse au renommage et fait remonter toutes les occurrences.

| Dimension | Node / TypeScript | Java / Maven |
|---|---|---|
| Style, erreurs | ESLint 10.11.0 + typescript-eslint 8.71.0 (JSON natif), Biome 2.5.14 ou oxlint 1.86.0 (SARIF natif) : celui que la cible utilise | Checkstyle 14.3.0 (`-f sarif`) ; PMD 7.28.0 (`-f sarif`) ; SpotBugs 4.10.4 (`-sarif=`) |
| Complexité | règles cœur d'ESLint, Biome `noExcessiveCognitiveComplexity` | PMD `CognitiveComplexity`, Checkstyle `CyclomaticComplexity` |
| Duplication | jscpd 5.3.3 (`-r sarif`, empreinte `jscpdCloneHash/v1`) | PMD CPD (pas de SARIF), jscpd |
| Typage | `tsc --noEmit` `strict` (texte à lire) | compilateur ; Error Prone 2.50.0, NullAway 0.14.2 |
| Code mort | Knip 6.38.0 (`--reporter sarif`) | |
| Vulnérabilités | OSV-scanner 2.6.0 (hors ligne avec base préchargée) | OSV-scanner, OWASP dependency-check 13.0.0 (base NVD, réseau) |
| Licences | license-checker-rseidelsohn 5.0.1 | license-maven-plugin 2.7.1 |

Pièges Java [doc] : `maven-checkstyle-plugin` 3.6.0 embarque Checkstyle 9.3 et `maven-pmd-plugin` 3.28.0
embarque PMD 7.17.0, donc le moteur se force ; Checkstyle 13 et 14 et Error Prone demandent un JDK 21, une
cible en Java 8, 11 ou 17 veut un JDK d'analyse distinct ; le message de Checkstyle suit la locale de la JVM
(`-Duser.language=en`).

**Écartés** : `eslint-plugin-sonarjs` 4.2.2 (le `package.json` dit LGPL, le `LICENSE` livré est une licence
« source-available » qui interdit de concurrencer SonarQube) ; CodeQL (licence limitée, l'analyse
automatisée est exclue) ; règles du registre Semgrep (interne seulement, pas de redistribution) ;
SonarQube (serveur et base) ; plato, escomplex, license-checker (abandonnés).

**Séparer propre, généré, tiers** : aucune convention générale, sauf `// Code generated … DO NOT EDIT` (Go)
et les attributs `linguist-generated`, `linguist-vendored` de `.gitattributes`. 495 classe les fichiers
avant de lancer un capteur, avec des règles que le référentiel de la cible déclare, passe la même liste
d'exclusions à chacun et rapporte comme non mesuré ce qu'un capteur n'a pas pu ignorer.

**Seuils citables** (QLT-01 : un agent n'invente aucun seuil) : NIST SP 500-235, août 1996 (complexité
cyclomatique 10, jusqu'à 15 avec justification) ; Heitlager, Kuipers, Visser, QUATIC 2007 (classes de
complexité, duplication 3, 5, 10 et 20 %, couverture 20, 60, 80 et 95 %) ; « Sonar way » (nouveau code :
couverture 80 %, duplication 3 %, lu le 2026-09-30, sans date de mise à jour) ; Google Testing Blog,
2020-08-07 (couverture 60, 75, 90 %, « no ideal number ») ; CVSS 4.0 pour la gravité des
vulnérabilités. Ce que fixent les outils par défaut (ESLint `complexity` 20, Biome et PMD cognitive 15,
Checkstyle 10, jscpd 50 jetons) est un défaut d'outil : il s'inscrit comme tel, avec l'outil et sa
version.

## 4. Architecture (e11)

| Besoin | Node / TypeScript | Java / Maven |
|---|---|---|
| Graphe de modules, cycles | dependency-cruiser 18.4.0 (JSON, cycles, alias tsconfig, `dynamic`), Knip `--cycles`, skott | jdeps (JDK, sans toucher au POM, exige des classes compilées), ArchUnit 1.5.1 (`slices().beFreeOfCycles()`) |
| Règles de dépendance | dependency-cruiser `forbidden`/`allowed` ; eslint-plugin-boundaries 7.2.0 ; Sheriff, Nx si la cible les a | ArchUnit `layeredArchitecture()` ; Spring Modulith 2.1.1 ; Maven Enforcer ; JPMS |
| Violations connues | `--baseline`, `--ignore-known`, `--baseline-mode shrink-only`, `staleEntriesSeverity: error` | `FreezingArchRule` (magasin en fichiers) |
| Ligne d'un constat | **absente** de dependency-cruiser : seconde passe dans le fichier `from` | ArchUnit : à relire |

Aucune baseline outillée n'a de périmètre ni d'échéance : la règle transitoire d'ARC-03 est un registre
tenu par 495, comparé à l'ensemble des violations connues. Angle mort de la lecture des sources : la
réflexion, l'injection et la configuration (`Class.forName`, `getBean("nom")`, `META-INF/services`,
`spring.factories`). JPMS (`opens`, `uses`, `provides`) est la seule source où un tel lien est déclaré
statiquement. Vocabulaire proposé pour marquer un lien par sa méthode d'observation :
`référence-de-type-bytecode`, `import-source`, `manifeste-build`, `config-déclarée`, `document-déclaré`,
`non-observé-à-l'exécution`.

**Architecture déclarée lisible par machine**, dans l'ordre où la lire : les configurations de règles déjà
présentes (`.dependency-cruiser.*`, `sheriff.config.ts`, tests ArchUnit et magasin `Freeze`,
`import-control.xml`, `@ApplicationModule`, `module-info.java`), puis Structurizr (dépôt unifié
`structurizr/structurizr`, v2026.09.19), OpenAPI 3.2.1, AsyncAPI 3.1.0, Compose Spec, `catalog-info.yaml` de
Backstage, MADR 4.0.0 (sa section « Confirmation » nomme la vérification). arc42, Nygard et ArchiMate sont
de la prose ou rares.

**Structure vérifiable d'une recommandation et d'une migration** (le jugement reste au propriétaire) :
une contrainte a la forme d'un scénario de qualité en six parties ; une alternative renseigne bénéfice,
complexité, coût de migration et risque, avec au moins « garder » ; une conclusion cite des contraintes qui
existent ; une étape de migration porte un contrat d'entrée qui s'exécute, une frontière de coexistence
(une règle de dépendance sur des chemins), une phase expand, migrate ou contract, et un retour arrière
déclaré et exécuté. Sources : Fowler, Strangler Fig (2024-08-22), Branch by Abstraction (2014),
Parallel Change (2014) ; Kazman, Klein, Clements, CMU/SEI-2000-TR-004 (ATAM) ; Ford, Parsons, Kua,
*Building Evolutionary Architectures*, 2e éd., 2022. Aucune étude ne fournit de règle causale entre
monolithe et microservices (Su, Li, Taibi, arXiv 2308.15281, 2023 ; Su, Li, arXiv 2401.11867, 2024).

## 5. Lire les rapports et les sources

- **XML** : `@rgrove/parse-xml` 5.0.0, décidé (`D-77`). Le rapport de JaCoCo se lit sans résoudre son DOCTYPE.
- **Dialectes JUnit** [doc, code des émetteurs] : Surefire n'a pas de `<testsuites>` et ajoute
  `rerunFailure`, `flakyFailure` ; pytest sépare `failure` et `error` ; jest-junit compose classe et nom par
  gabarits ; gotestsum omet `errors` et `skipped` à zéro ; `node:test` met `errors="0"` et compte les erreurs
  en `failures`. Il n'existe pas de schéma officiel.
- **Autres formats** : LCOV et Cobertura (couverture), le schéma Stryker (mutation, famille Stryker et un
  greffon PIT tiers). TAP 14, CTRF, Open Test Reporting et les attributs OpenTelemetry `test.*` sont
  marginaux. Les paquets npm de lecture de JUnit, LCOV et Cobertura sont abandonnés ou dépendent d'un
  analyseur à risque. Un chemin de fichier peut contenir un saut de ligne : un lecteur LCOV traite les
  chemins comme un texte adverse.
- **Sources** : `web-tree-sitter` 0.27.0 (MIT, WASM), décidé (`D-77`) ; une requête `.scm` par adaptateur,
  car les grammaires ne livrent pas de requête d'imports. Le paquet `@vscode/tree-sitter-wasm` 0.3.1 regroupe
  seize grammaires en 22 Mo ; les grammaires unitaires sont plus légères (Java : 415 Ko). Kotlin n'a pas de
  `.wasm` livré. `oxc-parser` est l'autre voie pour TS/JS. Non retenus : Semgrep (règles), addons natifs
  (`tree-sitter`, `@ast-grep/napi`).
- **Détection de pile** : aucun catalogue déclaratif réutilisable. Railpack, successeur de Nixpacks
  (en maintenance seule), applique le schéma de `D-75` : un module par technologie, le premier qui détecte
  l'emporte. GitHub Linguist détecte le langage d'un fichier, pas l'outil de build ni le framework de test.

## 6. Installer une dépendance de développement épinglée (e12, `D-76`)

Recette proposée, le réseau n'étant ouvert que pour les deux dernières étapes :

1. La version exacte et son intégrité SHA-512 sont épinglées dans le catalogue de l'adaptateur, avec un
   délai d'ancienneté avant d'adopter une version neuve.
2. Pré-contrôle par 495, avant d'ouvrir le réseau : l'enregistrement OSV de cette version exacte
   (`api.osv.dev`), l'intégrité que `npm view` annonce, l'ancienneté de la publication.
3. `npm install --package-lock-only --ignore-scripts --save-exact --save-dev <paquet>@<version>`, puis
   inspection du verrou (nombre de paquets nouveaux, références git ou tarball, scripts d'installation).
4. `npm ci --ignore-scripts`, qui vérifie l'intégrité contre le verrou, puis `npm audit signatures`.
5. Réseau fermé : les contrôles s'exécutent sans réseau.

Limites [doc, incidents] : la provenance ne suffit pas (`keyv` 6.0.0, malveillante, portait une
attestation valide le 2026-08-04, enregistrement OSV `MAL-2026-11524`) ; les défauts changent entre npm 11
et 12 (npm 12 bloque les scripts de cycle de vie des dépendances par défaut), donc les options se passent
explicitement ; le `.npmrc` d'un projet non fiable est lu par npm ; `--ignore-scripts` casse les paquets qui
téléchargent un binaire à l'installation (Cypress, le script manuel de Pact). pnpm 11 et Yarn 4 ont leurs
propres délais d'ancienneté et désactivent les scripts par défaut. Maven n'a ni équivalent de
`--ignore-scripts` ni délai d'ancienneté : les sommes de contrôle de confiance du résolveur
(`.mvn/checksums/`, `failIfMissing=true`) et `-o` après résolution sont ce qu'il offre.

## 7. Ce qui n'a pas été vérifié

- Chiffres d'usage de Java (les pages JetBrains sont des images) ; pourcentages State of JS 2025 de
  Playwright, Cypress, Mocha et `node:test`. Téléchargements npm de la semaine du 2026-09-22 : vitest 126,6 M,
  Playwright 76,0 M, jest 53,8 M, fast-check 53,4 M, mocha 16,5 M, c8 5,1 M, Stryker 3,3 M.
- Non exécutés : Pact, Testcontainers, ApprovalTests, Failsafe, SpotBugs, Error Prone, Trivy, Grype.
- Compatibilité de PIT avec JUnit 6 sur un projet réel multi-modules ; comportement de WASM face à un addon
  natif sous Seatbelt ; sortie SARIF de Semgrep, ESLint (formateur Microsoft), OSV-scanner et OWASP
  dependency-check ; version d'entrée de `--reporter=sarif` dans Biome.
- Versions plus anciennes de jest et de mocha que 30.5.2 et 12.0.2 ; jest configuré avec ses propres
  `reporters` ou un `testResultsProcessor`.
- Les incidents de chaîne d'approvisionnement de 2025 et 2026 viennent surtout de blogs d'éditeurs de
  sécurité ; les sources primaires sont l'alerte CISA du 2025-09-23, l'avis CSA AD-2026-009, le billet de
  GitHub du 2025-09-22 et l'enregistrement OSV.

## 8. Sources principales (consultées le 2026-09-30)

Registres : `registry.npmjs.org`, `api.npmjs.org/downloads`, `repo1.maven.org/maven2` (`maven-metadata.xml`),
`api.github.com` (dépôts, versions, avis), `api.osv.dev`.
Outils et documentation : nodejs.org/api/test.html et le code de Node ; vitest.dev ; stryker-mutator.io ;
pitest.org et `pitest/pitest-junit5-plugin#113` ; jacoco.org ; jqwik.net et `jqwik-team/jqwik` ;
docs.junit.org ; biomejs.dev ; oxc.rs ; eslint.org ; knip.dev ; `kucherenko/jscpd` ; checkstyle.org ;
pmd.github.io ; spotbugs.readthedocs.io ; archunit.org ; docs.spring.io/spring-modulith ;
`sverweij/dependency-cruiser` ; devblogs.microsoft.com/typescript (annonces de TypeScript 6.0 et 7.0).
Formats : docs.oasis-open.org/sarif/sarif/v2.1.0 ; `testmoapp/junitxml` ; `stryker-mutator/mutation-testing-elements`.
Analyse : `tree-sitter/tree-sitter` ; `rgrove/parse-xml` ; advisories GitHub (fast-xml-parser, xmldom).
Détection et installation : `railwayapp/railpack` ; `github-linguist/linguist` ;
`antfu-collective/package-manager-detector` ; docs.npmjs.com ; notes de version de npm 12.0.0 et pnpm 11.0.0 ;
maven.apache.org/resolver/expected-checksums.html ; cisa.gov (alerte du 2025-09-23) ; csa.gov.sg
(AD-2026-009).
Seuils et méthode : nvlpubs.nist.gov (SP 500-235) ; Heitlager et al., QUATIC 2007 ; testing.googleblog.com
(2020-08-07) ; first.org/cvss/v4-0 ; docs.sonarsource.com ; martinfowler.com ; sei.cmu.edu ; arxiv.org
(2308.15281, 2401.11867).
