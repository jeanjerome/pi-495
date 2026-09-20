# Specs

`specs/` est la surface documentaire de 495. Les artefacts bigpowers y vivent à leur emplacement
canonique : `state.yaml`, `release-plan.yaml`, `execution-status.yaml`, `product/`,
`tech-architecture/`, `adr/`, `epics/`, `verifications/`, `bugs/`.

## `archive/` — le corpus antérieur

`archive/` porte le corpus rédigé avant la bascule, dans sa disposition d'origine :
`archive/amont/` pour les documents normatifs, `archive/chantiers/` pour les travaux ouverts,
`archive/revues/` pour les six revues obligatoires, et le suivi d'implémentation
(`STATUS.md`, `TRACEABILITY.md`, `DECISIONS.md`, `RISQUES-L0.md`, `QUALIFICATION.md`…) à sa racine.
`archive/README.md` en reste l'index.

Archivé veut dire : **ce n'est plus là qu'on écrit du neuf**, pas que c'est inerte. Deux contrôles
de Preflight lisent encore ce corpus, et ne peuvent refuser une régression que pour cette raison :

| Contrôle | Lit | Refuse |
|---|---|---|
| `scripts/check-architecture.ts` | `archive/amont/conception-technique.md` §4.1 | un `CMP-*` réclamé dans `src/` sans ligne au catalogue |
| `scripts/check-traceability.ts` | `archive/amont/expression-besoins.md`, `archive/TRACEABILITY.md` | une exigence `[P0]` absente de la matrice |

Une matrice régénérée depuis le code ne pourrait jamais être en désaccord avec lui : ces deux
contrôles ne gardent leur pouvoir de refus qu'en lisant des documents tenus à la main.

## Ce qui a été repris en format bigpowers

| Emplacement | Source | Écrit par |
|---|---|---|
| `tech-architecture/tech-stack.md` | dérivé du code | `map-codebase` |
| `adr/ADR-001..018` | `archive/amont/conception-technique.md` §15 | extraction |
| `adr/D-45…` | décisions d'implémentation, à raison d'un fichier par décision | à la main |
| `product/SCOPE_LATEST.yaml` | le périmètre du travail ouvert, 22 epics | `scope-work` |
| `release-plan.yaml` | l'index ordonné des epics | `plan-release` |

`D-01` à `D-44` restent dans `archive/DECISIONS.md` ; la série se continue sous `adr/`.
