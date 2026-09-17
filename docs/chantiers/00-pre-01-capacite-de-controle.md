# Étage 0 — PRE-01 : diagnostic de capacité de contrôle

**État :** à faire
**Exigence :** PRE-01 [P0], avec PRE-04 et PRE-05 en dépendance aval
**Interaction humaine concernée :** IH-04, arbitrage de vérifiabilité

## Motif

PRE-01 exige de distinguer quatre niveaux : un fichier de test présent, un test découvrable, un
test exécuté, et un contrôle capable de détecter le défaut visé. `referenceHasTests`
(`src/application/preparation.ts`) n'implémente que le premier — une regex sur le nom de fichier —
et c'est elle qui décide de l'ouverture de la préparation.

Toute cible contenant au moins un fichier de test saute donc la préparation, n'obtient aucune
suite discriminante, et voit ses exigences déclarées satisfaites par des tests qui les ignorent.
C'est la recette de PRE-01 prise en défaut : l'insuffisance est convertie en couverture
satisfaisante.

## Prompt

```
Dans ~/Projets/495-pi-package, lis d'abord docs/ROADMAP.md (sections 1, 2 et 5) puis la
section PRE-01 de docs/amont/expression-besoins.md.

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
- corrige la ligne PRE-01 de docs/TRACEABILITY.md quand elle devient vraie ;
- `npm run check` passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Déclencheur actuel | `stepVerificationDesign`, variable `hasTests` |
| Niveau 1 de l'échelle | `referenceHasTests` |
| Discrimination déjà calculée | `stepPrepare` : `on_reference`, `discriminant`, `loadable` |
| Adoption conditionnelle | `adoptedPreparation` n'accepte qu'un enregistrement `qualified` |
| IH-04 exclue | `buildDecisionRequest` et `requestDecision`, par `Exclude<HumanInteraction, …>` |

## Journal

_À compléter._
