# D-75: Une technologie s'ajoute par un seul module

**Status:** Acceptée ; point 3 amendé par `D-86`
**Date:** 2026-09-30

## Contexte

495 lit aujourd'hui deux technologies, Maven et Node. Le propriétaire a indiqué le 2026-09-30 que les
technologies prises en charge s'étofferont, et que les ajouter doit être facile.

Aujourd'hui, en ajouter une touche quatre endroits : un module sous `src/application/stacks/`, la
chaîne de `if` de `detectStack` (`src/application/target.ts`), l'union `StackDetection["stack"]`
(`src/application/stacks/stack.ts`), et, quand elle produit un rapport qu'aucun parseur ne lit, la
liste fermée `PARSER_IDS` du contrat (`src/contracts/v1/protocol.ts`) et le `switch` du lanceur
(`src/adapters/execution/runner.ts`). Les capacités que `e10`, `e11` et `e12` ajoutent (référentiel de
qualité, diagnostic d'architecture, catalogue de frameworks) multiplieraient ces endroits par le
nombre de technologies si chacune vivait dans une table centrale.

## Décision

1. **Une technologie est un adaptateur, et tout ce qui dépend d'elle est porté par lui.** Ses
   contrôles, ses témoins, son référentiel de qualité, son analyse d'architecture, son catalogue de
   frameworks par type de test et ses chemins protégés sont déclarés par son module. Aucune table
   centrale ne liste des technologies ou des frameworks.
2. **Le noyau découvre les adaptateurs dans une liste**, qu'un nouvel adaptateur rejoint par une
   ligne. La détection ne se déduit plus d'une chaîne de conditions sur des fichiers. Quand un projet
   porte les marqueurs de deux technologies, **le premier adaptateur de la liste l'emporte, et Maven
   précède Node** (arbitrage du propriétaire, 2026-09-30) : un projet Maven qui porte aussi un
   `package.json`, l'outillage de son front, est jugé comme un projet Maven, non comme un projet Node dont
   les tests Java ne seraient pas lus. Le sens inverse, plus rare, est celui qu'on accepte de perdre.
3. **Un format de rapport nouveau reste un parseur nouveau**, déclaré au contrat : un rapport qu'un
   contrôle lit est une preuve, et son format se qualifie comme tel.
4. **Toute story de `e10`, `e11`, `e12` et `e29` place ce qu'elle ajoute par technologie dans
   l'adaptateur**, et le dit dans ses promesses : une table centrale ou une condition sur le nom d'une
   technologie n'y a pas sa place.

## Conséquences

La première story de `e12` réalise la liste d'adaptateurs à comportement constant : les deux
technologies actuelles passent par elle, et un test ajoute une technologie fictive par un seul module.
