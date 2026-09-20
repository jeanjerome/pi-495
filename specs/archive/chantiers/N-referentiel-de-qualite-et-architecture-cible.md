# Transverse N — le référentiel de qualité d'une cible, et l'architecture qu'on lui oppose

**État :** ouvert
**Objet :** `QLT-01..03`, `QLT-05` et `ARC-01..03` sont absentes du noyau — 495 ne sait pas conduire
une remise aux standards sur une cible
**Ne s'insère pas dans l'échelle des étages ; hérite de ce que les étages 1, 2 et 3 ont livré**

## Motif

`REC-35` « Remise aux standards sans fonctionnalité nouvelle » demande baseline, plan et réduction
démontrée des écarts, comportement préservé — `QLT-01`, `QLT-02`, `QLT-03`, `QLT-05`. `REC-33`
demande un diagnostic localisé et des alternatives proportionnées — `ARC-01`, `ARC-02`. Aucune de
ces exigences n'est tenue.

Ce que le noyau sait faire s'arrête juste au bord. `QLT-04` juge la couverture du code introduit
d'une cible Maven ; `ARC-04` et `CON-03` opposent au candidat les frontières que ses POM déclarent.
Les deux jugent **un candidat contre une référence**. Ni l'un ni l'autre ne sait dire ce que vaut la
référence elle-même — ce qui est exactement ce que `QLT-02` (baseline de l'existant) et `ARC-01`
(architecture réellement présente) réclament.

Une distinction à ne pas perdre en route : adopter Biome sur le code du harnais (`D-42`, `D-43`)
applique à 495 la discipline que `QLT-01` décrit ; cela ne donne au noyau **aucune** des capacités
que `QLT-01` exige pour une cible. `specs/archive/TRACEABILITY.md` le dit à ses lignes 71 et 72, et reste
inchangée tant que rien n'est tenu.

## Ce qui est déjà là

- `Finding.baseline_state` (`new`, `preexisting`, `removed`, `unknown`) et le classement contre la
  référence : tout capteur nouveau en hérite sans le réimplémenter (`VER-08`, étage 1).
- `src/adapters/execution/structure.ts` — déclarations `package` et `import`, graphe de paquets,
  composantes fortement connexes. C'est **la moitié observable d'`ARC-01`** : modules, dépendances,
  cycles, frontières localisées. Pour une cible Maven seulement. `TRACEABILITY.md` ligne 34 nomme
  déjà le manque restant : « un lien établi par réflexion ou configuration n'est pas observé ».
- `src/application/coverage.ts` et le contrôle de couverture différentielle (étage 2) : le précédent
  le plus proche d'un capteur de la famille QLT — capteur qui lit le rapport écrit par un autre
  contrôle, trois témoins, témoin négatif propre. Reprendre cette forme plutôt qu'en inventer une.
- La catégorie `"quality"` est au contrat fermé `FINDING_CATEGORIES` et **est déjà émise** par
  `mutation.ts` et `parsers.ts` : un constat de qualité n'ouvre aucune migration de contrat.
- `CMP-TGT` (Target Adapter Registry, `conception-technique.md` §4.1) est le point d'accroche déclaré
  pour la découverte des capacités d'une stack. Aucun `CMP-*` ne couvre aujourd'hui un diagnostic
  d'architecture ni un référentiel de qualité : il faudra en créer, avec leur ligne au catalogue dans
  le même changement.
- `DECISIONS.md` ne porte aucune décision sur un référentiel de qualité, une baseline de dette ou une
  architecture cible. Terrain vierge, rien à re-trancher.

## Ordre imposé

`QLT-01 → QLT-02 → QLT-03 → QLT-05` est une chaîne stricte : chacune lit la sortie de la précédente.
Une baseline sans référentiel adopté ne mesure rien ; un plan de réduction sans baseline ne priorise
rien ; une conformité sans plan ne démontre rien.

`ARC-02` et `ARC-03` exigent `ARC-01` d'abord : on ne recommande pas une architecture cible sans
diagnostic, et on n'étale pas une migration sans cible adoptée.

Les deux chaînes sont indépendantes l'une de l'autre. `ARC-01` est la moins chère — la moitié de son
observable est écrite. `QLT-01` est la plus rentable — elle débloque trois exigences.

## Questions matérielles

Ces quatre-là ne se tranchent pas dans le code.

1. **Quelle stack d'abord.** Étendre l'adaptateur Maven, qui porte toutes les campagnes qualifiées,
   ou combler le trou Node ? Le transverse E est ouvert — le contrôle `unit` ne passe pas sur une
   référence en vitest —, donc viser Node tire E en prérequis.
2. **Quel référentiel.** `QLT-01` exige des seuils « sourcés et datés lors de leur adoption » et
   interdit qu'un agent les invente. Le noyau embarque-t-il un profil de départ par stack, ou
   seulement le mécanisme d'adoption, la cible apportant ses règles ? La lettre de l'exigence —
   « permettre de définir » — penche pour le mécanisme seul.
3. **Granularité des `CMP-*`.** Un composant pour `ARC-01..03`, ou une famille séparée par métier
   (diagnostic, recommandation, étagement de migration) ? Le découpage commande les lignes du
   catalogue et la taille des incréments.
4. **Le référentiel entre-t-il au protocole gelé ?** `StructureRule` y a été gelée pour `ARC-04`. Si
   le référentiel de `QLT-01` suit le même chemin, il tombe sous la contrainte commune de ce
   répertoire : toucher au protocole gelé impose `npm run contracts`, change `environment_digest` et
   invalide le protocole d'un changement en cours. Ne pas l'engager pendant qu'un cycle tourne.

## Prompt

```
Dans ~/Projets/495-pi-package, lis d'abord AGENTS.md et CONVENTIONS.md, puis
specs/archive/chantiers/N-referentiel-de-qualite-et-architecture-cible.md en entier.

Objet : donner au noyau la capacité QLT-01 — permettre de définir, pour une cible, les
conventions, seuils et contrôles pertinents par technologie et par composant, chaque règle
exposant son oracle, toute recommandation « état de l'art » portant sa source et sa date
d'adoption. Lis la formulation exacte en §4.17 de specs/archive/amont/expression-besoins.md, et la
recette REC-35 du même document.

Ne commence pas par écrire du code. Commence par répondre aux quatre questions matérielles de
la fiche : cherche la réponse dans l'amont et dans le code existant, et demande à l'humain ce
que l'amont ne tranche pas. La question 4 — le référentiel entre-t-il au protocole gelé à G2 —
décide de la forme de tout le reste.

Étudie src/application/coverage.ts et src/adapters/execution/structure.ts avant de concevoir :
ce sont les deux capteurs de la même famille déjà livrés, et la forme à reprendre.

Contraintes : tout CMP-* nouveau reçoit sa ligne au catalogue §4.1 de
specs/archive/amont/conception-technique.md dans le même changement ; npm run check doit être vert avant
et après ; QLT-01 ne s'inscrit dans specs/archive/TRACEABILITY.md que pour ce qui est réellement tenu et
éprouvé sur une cible.
```

## Points d'ancrage

- `specs/archive/amont/expression-besoins.md` §4.16 (`ARC-01..05`) et §4.17 (`QLT-01..05`) ; recettes `REC-33`
  à `REC-36`
- `specs/archive/TRACEABILITY.md` lignes 71 et 72 (absences déclarées), ligne 34 (`ARC-04` / `CON-03` et le
  manque `ARC-01`), ligne 33 (`QLT-04` et ce qu'il ne couvre pas)
- `specs/archive/ROADMAP.md` §1 « le contrôle de l'introduit » et §2 « la moitié de P0 non commencée »
- `specs/archive/DECISIONS.md` `D-42` et `D-43` — l'adoption d'un référentiel externe sur le harnais, et
  pourquoi elle ne vaut pas `QLT-01`
- `src/application/coverage.ts`, `src/adapters/execution/structure.ts`, `src/application/target.ts`
- `src/contracts/v1/evidence.ts` (`FINDING_CATEGORIES`, `baseline_state`), `src/contracts/v1/protocol.ts`
  (`StructureRule`)
- Chantiers voisins : étage 2 (`QLT-04`), étage 3 (`ARC-04`, `CON-03`), transverse E (stack Node)

## Journal

- 2026-09-20 — fiche ouverte. Le harnais lui-même est passé sous référentiel externe (Biome, `D-42`
  et `D-43`) : lint et formateur refusés par Preflight, 446 constats ramenés à zéro. La capacité pour
  une cible reste entière, et c'est l'objet de cette fiche.
