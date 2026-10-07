# D-86: Une technologie est un greffon, qui porte aussi ses lecteurs de rapports

**Status:** Acceptée (arbitrage du propriétaire, 2026-10-07) ; amende le point 3 de `D-75`
**Date:** 2026-10-07

## Contexte

`D-75` veut qu'une technologie s'ajoute par un seul module et que tout ce qui dépend d'elle soit porté par
lui. `e12s01` a réalisé la liste d'adaptateurs, mais seulement pour la détection : le test qui ajoute une
technologie fictive s'arrête à `detectStack`. Le reste de la chaîne n'a jamais été éprouvé, et le
propriétaire a constaté le 2026-10-07 que l'engagement n'est pas tenu.

Relevé le même jour, hors de `src/application/stacks/` :

- **Rapports.** La liste des formats est fermée au contrat (`PARSER_IDS`, `src/contracts/v1/protocol.ts:21`),
  le lanceur les énumère dans un `switch` (`src/adapters/execution/runner.ts:159`), leur nature est une table
  exhaustive (`PARSER_NATURES`, `src/domain/survey.ts:82`), et les lecteurs portent des faits de langage :
  `.java`, `src/test/`, `/target/` (`parsers.ts`, `mutation.ts`), les sources JS/TS du lecteur LCOV (`lcov.ts`).
- **Compléments.** `src/application/installation.ts` (542 lignes) est écrit pour npm et Maven ; la même
  alternative `npm`/`maven` revient dans `phases/quality-referential.ts`, `phases/verification-design.ts`, les
  textes de `decisions.ts`, et `complement.ts:109` tient tout fichier autre que `pom.xml` pour un `package.json`.
- **Copie et contrôles.** Les exclusions de la copie nomment `target/`, `node_modules/.vite/` et les sorties
  de Stryker (`src/adapters/workspace/git-workspace.ts:23`) ; `node_modules/` est protégé pour toute cible
  (`verification.ts:60`, `domain/gates/g4.ts:86`) ; le nom d'un fichier de test ne connaît que JS/TS et
  `Test.java` (`preparation.ts:67`) ; `JAVA_HOME` et `MAVEN_OPTS` sont transmis à toute cible
  (`stacks/stack.ts:79`) ; `java` et `mvn` sont sondés pour l'identité de l'environnement de tout projet
  (`environment.ts:113`) ; la disposition `src/test/resources` de Maven est dans le registre (`target.ts:47`).

Ajouter une troisième technologie toucherait une dizaine de modules génériques. Les deux adaptateurs, eux,
font 897 lignes (Node) et 1 015 lignes (Maven) chacun dans un seul fichier.

## Décision

1. **Une technologie est un dossier qui implémente une interface unique**, et rien d'autre ne la connaît. Ce
   que l'interface déclare : la détection, les contrôles et leurs témoins ; les lecteurs de ses rapports et la
   nature de chacun ; ce que ses outils écrivent dans une copie et qui n'est pas un changement ; le répertoire
   de ses dépendances installées ; les variables d'environnement que ses contrôles lisent et les outils dont la
   version entre dans l'identité de l'environnement ; la forme d'un fichier de test et d'une ressource de test ;
   l'installation ou la résolution d'un complément, son inspection et le texte qui le présente au propriétaire ;
   les modifications de fichier qu'un complément apporte.
2. **Une technologie apporte ses lecteurs de rapports.** Le contrat ne ferme plus la liste des formats : ce
   point remplace le point 3 de `D-75`. Ce qui fait d'un rapport une preuve ne change pas : le contrôle qui le
   lit se qualifie sur ses témoins (cas qui passe, cas qui échoue, panne de l'outil), et le protocole gelé
   enregistre le lecteur et sa version. Les formats que plusieurs technologies écrivent — code de sortie, JUnit
   XML, LCOV — restent une bibliothèque commune, sans fait de langage, que les technologies emploient.
3. **Le code générique ne nomme aucune technologie**, aucun de ses outils, fichiers de projet ou répertoires.
   La preuve : une technologie fictive, déclarée dans un seul dossier avec un format de rapport à elle, des
   sorties de build, des dépendances installées et un complément, conduit un changement jusqu'à l'acceptation
   sans qu'un module hors de son dossier soit modifié.
4. **La liste des technologies est remise par la racine de composition** (`extension/`) ; le code générique
   ne connaît que l'interface. Le sens des couches est tenu, et l'ordre de `D-75` ne change pas : Maven précède
   Node.

## Conséquences

Le contrat change : `npm run contracts` le régénère, et un dossier écrit avant doit se relire, comme `D-83`
l'a fait pour les identifiants de phase. `e11` attend cet epic : le diagnostic d'architecture d'une cible
Node ajouterait sinon un format de plus à la liste fermée et une ligne à chaque table. Le découpage des deux
adaptateurs par sujet se fait dans leur dossier, avec la story qui les y déplace.
