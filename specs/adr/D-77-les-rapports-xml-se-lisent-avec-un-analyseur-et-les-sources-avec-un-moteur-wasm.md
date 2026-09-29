# D-77: Les rapports XML se lisent avec un analyseur, et les sources avec un moteur WASM

**Status:** Acceptée
**Date:** 2026-09-30

## Contexte

495 lit les rapports de tests, de couverture et de mutation avec des expressions régulières
(`src/adapters/execution/parsers.ts`), et les déclarations `import` d'une cible Java avec une expression
régulière par ligne (`src/adapters/execution/structure.ts`). Deux limites, mesurées le 2026-09-30.

Le lecteur JUnit additionne les attributs de chaque `<testsuite>` : sur un rapport de `node:test` à
deux suites imbriquées et trois tests, il en compte quatre. Un rapport est la sortie d'un processus
que le projet jugé a écrit : l'entrée est non fiable, et une expression régulière ne la borne pas.

Lire les imports d'une autre technologie demande, pour chacune, un lecteur de plus, alors que
`D-75` veut qu'ajouter une technologie ne coûte qu'un module. Et TypeScript 7 (sorti le 2026-07-08),
celui de 495 et de beaucoup de cibles, n'expose pas d'API pour lire un fichier source.

495 n'a aujourd'hui que deux dépendances d'exécution, `@xynogen/pix-pretty` et `jiti`. Le propriétaire a
accepté le 2026-09-30 d'en ajouter deux.

## Décision

1. **Les rapports XML se lisent avec `@rgrove/parse-xml`** (ISC, aucune dépendance). Il ignore le DOCTYPE
   sans résoudre ni entité ni DTD externe, et rejette les entités qui s'emboîtent : le rapport de JaCoCo,
   qui porte un DOCTYPE à identifiant système, se lit sans jamais tenter d'accès. Sont écartés
   `fast-xml-parser` (huit avis de sécurité en 2026, tous sur les entités et le DOCTYPE),
   `@xmldom/xmldom` (quinze avis le 2026-09-08) et `xml2js` (non maintenu).
2. **Les sources se lisent avec `web-tree-sitter`** (MIT, WASM), une grammaire par langage et une
   requête de quelques lignes par adaptateur, jamais avec un module natif. Une faille mémoire de
   l'analyseur, qui lit du code non fiable, reste dans le module WASM et non dans le processus de 495.
3. **Une dépendance entre avec la première story qui la lit, jamais avant.** L'analyseur XML entre avec
   `e12s02` ; le moteur d'analyse des sources entre avec la première story qui doit lire les sources d'une
   technologie (`e11`).
4. **Chacune est attribuée dans le NOTICE et reste sur la liste permissive**, comme toute dépendance
   redistribuée avec le paquet.

## Conséquences

Le paquet publié pèse plus lourd, et le propriétaire répond de leurs mises à jour. Un rapport qui n'est
pas du XML lisible, ou qui dépasse la borne, n'est jamais un succès. Le choix des grammaires (une par
langage plutôt que le paquet de 22 Mo qui en regroupe seize) est celui de la story qui apporte le
moteur.

Ne sont pas décidés ici : le format commun des constats d'analyse (SARIF), la clé d'identité d'un
constat, et la liste des frameworks recommandés. Ils restent des propositions du dossier
`specs/spikes/`, à arbitrer par les stories qui les portent.
