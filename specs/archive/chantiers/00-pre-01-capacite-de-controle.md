# Étage 0 — PRE-01 : diagnostic de capacité de contrôle

**État :** livré non qualifié, hors IH-04 et cartographie complète
**Exigence :** PRE-01 [P0], avec PRE-04 et PRE-05 en dépendance aval
**Interaction humaine concernée :** IH-04, arbitrage de vérifiabilité

## Motif

PRE-01 exige de distinguer quatre niveaux : un fichier de test présent, un test découvrable, un
test exécuté, et un contrôle capable de détecter le défaut visé. `referenceHasTests`
(`src/application/preparation.ts`) n'implémentait que le premier — une regex sur le nom de fichier —
et c'était elle qui décidait de l'ouverture de la préparation.

Toute cible contenant au moins un fichier de test sautait donc la préparation, n'obtenait aucune
suite discriminante, et voyait ses exigences déclarées satisfaites par des tests qui les ignorent.
C'était la recette de PRE-01 prise en défaut : l'insuffisance convertie en couverture satisfaisante.

## Prompt

```
Dans ~/Projets/495-pi-package, lis d'abord specs/archive/ROADMAP.md (sections 1, 2 et 5) puis la
section PRE-01 de specs/archive/amont/expression-besoins.md.

PRE-01 exige de distinguer quatre niveaux : un fichier de test présent, un test découvrable,
un test exécuté, et un contrôle capable de détecter le défaut visé. `referenceHasTests`
(src/application/preparation.ts) n'implémente que le premier — une regex sur le nom de
fichier — et c'est elle qui décide, dans `stepVerificationDesign` (src/application/harness.ts,
variable `hasTests`), si la phase de préparation s'ouvre.

Conséquence : toute cible contenant au moins un fichier de test saute la préparation, n'obtient
aucune suite discriminante, et voit ses exigences déclarées satisfaites par des tests qui les
ignorent.

Remplace ce déclencheur par un diagnostic de capacité de contrôle conforme à PRE-01. Le noyau
dispose déjà de la brique qui compte : `stepPrepare` calcule `on_reference` et `discriminant`
pour une suite préparée, et n'adopte que `on_reference === "FAIL"`.

Attention à la tension : un refactoring dont l'exigence est « comportement inchangé » est
légitimement prouvé par une suite verte. N'ouvre pas une préparation pour ces cas-là. IH-04
(arbitrage de vérifiabilité, oracle insuffisant) est l'issue humaine prévue quand une exigence
reste non discriminable ; elle est déclarée dans les contrats mais exclue de
`buildDecisionRequest` et de `requestDecision`.

Critères d'acceptation :
- la cible ~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture, qui contient une
  trentaine de tests, ouvre une préparation pour une demande d'ajout de comportement ;
- le test V2 « accepts a conforming change end to end » (refactoring sur F-TS) continue de
  passer sans préparation ;
- corrige la ligne PRE-01 de specs/archive/TRACEABILITY.md quand elle devient vraie ;
- `npm run check` passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Déclencheur | `stepVerificationDesign` : deux passes de `diagnoseControlCapability`, puis `openPreparation` |
| Échelle à quatre niveaux | `referenceTestFiles` (niveau 1) et `diagnoseControlCapability` (niveaux 2 à 4) |
| Nature de l'exigence | `satisfied_by_reference`, porté par le rapport de spécification puis par `Requirement` |
| Mesure des niveaux 2 et 3 | `countReferenceCases`, sur les constats du témoin positif |
| Diagnostic figé | `Protocol.capability_diagnosis`, et le mandat de préparation qui porte celui qui l'a ouvert |
| Discrimination déjà calculée | `stepPrepare` : `on_reference`, `discriminant`, `loadable` |
| Adoption conditionnelle | `adoptedPreparation` n'accepte qu'un enregistrement `qualified` |
| IH-04 exclue | `buildDecisionRequest` et `requestDecision`, par `Exclude<HumanInteraction, …>` |

## Journal

L'échelle est implémentée à ses quatre niveaux : un fichier nommé comme un test, un cas que la
commande de test de la cible découvre, un cas qu'elle exécute, et un contrôle capable de détecter le
défaut visé par une exigence. Les niveaux 2 et 3 se lisent sur les constats du témoin positif, que
G2 exécute de toute façon : ce témoin est écrit à côté de la suite de la référence, et le nombre de
cas rapportés moins ceux du témoin donne ce que la référence découvre et exécute d'elle-même.

Le niveau 4 se décide par exigence, et demande de savoir ce que l'exigence affirme. Tout contrôle
que le protocole peut geler est vert sur la référence, puisque G2 refuse un capteur dont le témoin
positif n'y passe pas : un tel contrôle rend le même verdict selon qu'un comportement absent
apparaît ou non. Une exigence qui affirme un comportement nouveau n'est donc discriminée que par une
suite qui échoue sur la référence. Une exigence que la référence honore déjà est le cas inverse : la
non-régression la décide, pourvu que la suite existante exécute réellement quelque chose.

Cette distinction est déclarée par l'intervention de spécification, champ `satisfied_by_reference`,
et non devinée par le noyau (voir `specs/adr/`, D-21). La valeur par défaut d'une sortie qui
l'omet est `false`, c'est-à-dire l'ouverture d'une préparation.

La première passe du diagnostic précède l'écriture des témoins : ce qu'aucun contrôle ne peut
décider est connu sans rien exécuter, et la préparation s'ouvre alors sans payer une qualification
que la préparation invaliderait. La seconde passe suit la boucle de qualification et tranche les
exigences de non-régression sur les cas réellement exécutés.

Vérifié sur `~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture` (Maven
multi-module, 5 classes de test) avec `node scripts/diagnose-capability.ts <cible>` : niveau
`file_present`, préparation ouverte pour un ajout de comportement, non ouverte pour une exigence de
comportement conservé. La régression déterministe correspondante est dans `v2/preparation`.

### Ce qui reste

- **IH-04.** Deux préparations refusées arrêtent toujours le changement sur `capability_missing`.
  L'arbitrage de vérifiabilité — obligation, lacune, options, risque, avec pour issues préparer,
  assigner une revue humaine ou réviser l'exigence — reste absent de `buildDecisionRequest` et de
  `requestDecision`. Le diagnostic qui motive l'arrêt est enregistré, mais n'est présenté à personne.
- **La cartographie.** PRE-01 demande aussi les assertions, les dépendances et l'instabilité des
  contrôles existants. Le diagnostic porte la technologie, l'exécution effective, l'environnement et
  les angles morts ; l'instabilité relève de VER-08 (étage 1), les deux autres restent à écrire.
- **G2.** La gate n'exige toujours pas la discrimination : elle accepte une obligation couverte par
  un contrôle qualifié sans regarder `capability_diagnosis`. Le déclencheur rend le cas rare, la
  gate ne l'interdit pas.
