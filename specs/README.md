# Specs

`specs/` est le suivi du projet pi-495 : ce qu'il est, ce qui lui reste à faire, ce qu'il a prouvé.
La façon dont un changement est fait vit ailleurs, dans `cycle/`.

| Emplacement | Porte | Écrit par |
|---|---|---|
| `plan.yaml` | le travail ouvert : les epics dans l'ordre où ils se font, leur objet, leur motif, leurs stories | la main |
| `stories/<epic>/` | les stories du travail en cours, au format de `cycle/format-de-story.md` | la main, au pas 1 du cycle ; l'outil fait avancer leur statut |
| `bugs/registry.yaml`, `bugs/BUG-*.md` | les défauts connus, ouverts ou corrigés, et leur analyse | la main |
| `adr/` | les décisions du produit, une par fichier : `ADR-001..018` extraites de la conception technique, `D-*` prises pendant l'implémentation | la main |
| `verifications/` | les preuves qui parlent du produit : campagnes enregistrées, mesures, et le dossier de chaque story versée par le cycle actuel | l'outil du cycle ; les mesures, la main |
| `security/` | le modèle de menace d'un epic | la main |
| `communication/` | le chantier parallèle qui fait essayer pi-495 : plan, règles, mesures | la main, aux moments clés |
| `spikes/` | les explorations qui ont précédé une décision | la main |
| `archive/` | le corpus rédigé avant le 2026-09-21, dans sa disposition d'origine | plus rien |

## `archive/` — le corpus antérieur

`archive/amont/` porte les documents normatifs, `archive/chantiers/` les travaux de l'époque,
`archive/revues/` les six revues obligatoires, et le suivi d'implémentation (`STATUS.md`,
`TRACEABILITY.md`, `RISQUES-L0.md`, `QUALIFICATION.md`…) à sa racine. `archive/README.md` en reste
l'index. Le texte normatif des exigences est là, et nulle part ailleurs : `plan.yaml` le désigne
sans le restituer.

Archivé veut dire que rien de neuf ne s'y écrit, pas que c'est inerte. Deux contrôles de Preflight
lisent ce corpus, et ne peuvent refuser une régression que pour cette raison :

| Contrôle | Lit | Refuse |
|---|---|---|
| `scripts/check-architecture.ts` | `archive/amont/conception-technique.md` §4.1 | un `CMP-*` réclamé dans `src/` sans ligne au catalogue |
| `scripts/check-traceability.ts` | `archive/amont/expression-besoins.md`, `archive/TRACEABILITY.md` | une exigence `[P0]` absente de la matrice |

Une matrice régénérée depuis le code ne pourrait jamais être en désaccord avec lui : ces deux
contrôles ne gardent leur pouvoir de refus qu'en lisant des documents tenus à la main. Un composant
nouveau reçoit donc sa ligne au catalogue, et une exigence devenue couverte sa ligne à la matrice,
dans le changement qui les apporte.

Les décisions `D-18`, `D-19` et `D-20` sont chacune portées par deux fichiers, défaut conservé du
journal d'origine et signalé dans les fichiers concernés.
