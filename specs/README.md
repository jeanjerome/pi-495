# Specs

`specs/` est le suivi du projet pi-495 : ce qu'il est, ce qui lui reste à faire, ce qu'il a prouvé.
La façon dont un changement est fait vit ailleurs, dans `cycle/`.

| Emplacement | Porte | Écrit par |
|---|---|---|
| `plan.yaml` | le travail ouvert : les epics dans l'ordre où ils se font, leur objet, leur motif, leurs stories | la main |
| `epics/` | le dossier d'un epic, un fichier `<epic>-<titre>.md` : le résultat attendu, l'existant au point de départ, les limites, les livraisons et leur ordre, le raccordement aux autres epics. Tout epic ajouté au plan depuis `e38` en a un, que son entrée cite en `source:` | la main, avec l'entrée du plan |
| `reprises.md` | les reprises à comportement constant, dans l'ordre où elles se font, et leur statut (`D-80`) | la main ; l'outil du cycle écrit le statut |
| `stories/<epic>/` | les stories du travail en cours, au format de `cycle/format-de-story.md` | la main, au pas 1 du cycle ; l'outil fait avancer leur statut |
| `bugs/registry.yaml`, `bugs/registry-fixed.yaml`, `bugs/BUG-*.md` | les défauts ouverts (`registry.yaml`), les défauts corrigés avec la révision qui les a corrigés (`registry-fixed.yaml`), et leur analyse | la main ; l'outil du cycle déplace une entrée corrigée vers l'archive |
| `adr/` | les décisions du produit, une par fichier : `ADR-001..018` extraites de la conception technique, `D-*` prises pendant l'implémentation | la main |
| `verifications/` | les preuves qui parlent du produit : campagnes enregistrées, mesures, et le dossier de chaque story versée par le cycle actuel | l'outil du cycle ; les mesures, la main |
| `security/` | le modèle de menace d'un epic | la main |
| `communication/` | le chantier parallèle qui fait essayer pi-495 : plan, règles, mesures | la main, aux moments clés |
| `spikes/` | les explorations qui ont précédé une décision | la main |
| `amont/` | le texte normatif : exigences, spécification, conceptions | la main, par révision explicite |
| `archive/` | des rapports de mesure antérieurs au 2026-09-21 (qualification, modèle local, vitesses) | plus rien |

## `amont/` — le texte normatif

`amont/README.md` en est l'index. Le texte normatif des exigences est là, et nulle part ailleurs :
`plan.yaml` le désigne sans le restituer. Un contrôle de Preflight le lit :
`scripts/check-architecture.ts` lit le catalogue de `amont/conception-technique.md` §4.1 et refuse un
`CMP-*` réclamé dans `src/` sans ligne au catalogue. Un composant nouveau reçoit donc sa ligne au
catalogue, dans le changement qui l'apporte.

Les décisions `D-18`, `D-19` et `D-20` sont chacune portées par deux fichiers, défaut conservé du
journal d'origine et signalé dans les fichiers concernés.
