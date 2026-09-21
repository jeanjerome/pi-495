# Specs

`specs/` est la surface documentaire de 495. Les artefacts bigpowers y vivent à leur emplacement
canonique : `state.yaml`, `release-plan.yaml`, `execution-status.yaml`, `product/`,
`tech-architecture/`, `adr/`, `epics/`, `verifications/`, `bugs/`.

## `references/` — les documents écrits ailleurs

`references/` porte les documents que 495 n'écrit pas et ne modifie pas, recopiés parce qu'un
contrôle les lit. Chaque copie annonce en tête d'où elle vient et dans quelle version. Aujourd'hui
`countable-story-format.md`, le format des stories que `plan-work` écrit : le paquet bigpowers
installé ne distribue que ses `SKILL.md`, et le format que ces procédures citent ne se trouve sinon
nulle part sur la machine.

| Contrôle | Lit | Refuse |
|---|---|---|
| `scripts/check-story-format.ts` | `references/countable-story-format.md` | une story d'`epics/` dont une des vingt sections manque, sort de son rang, change de nom ou n'annonce pas son état |

Le contrôle ne réénonce pas les vingt sections : il les extrait de la copie. Une story et le format
qu'elle prétend suivre ne peuvent donc pas diverger sans que l'un des deux soit modifié.

## `archive/` — le corpus antérieur

`archive/` porte le corpus rédigé avant la bascule, dans sa disposition d'origine :
`archive/amont/` pour les documents normatifs, `archive/chantiers/` pour les travaux ouverts,
`archive/revues/` pour les six revues obligatoires, et le suivi d'implémentation
(`STATUS.md`, `TRACEABILITY.md`, `RISQUES-L0.md`, `QUALIFICATION.md`…) à sa racine.
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
| `adr/D-01..D-45` | `archive/DECISIONS.md`, éclaté à raison d'un fichier par décision | extraction |
| `product/SCOPE_LATEST.yaml` | le périmètre du travail ouvert, 22 epics | `scope-work` |
| `release-plan.yaml` | l'index ordonné des epics | `plan-release` |

`ADR-001..018` viennent de la conception technique ; `D-01` et suivants sont les décisions prises
pendant l'implémentation. `D-18`, `D-19` et `D-20` sont chacun portés par deux décisions distinctes,
défaut conservé du journal d'origine et signalé dans les fichiers concernés.
