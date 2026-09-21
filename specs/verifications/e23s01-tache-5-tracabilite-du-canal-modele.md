# e23s01 — tâche 5 : la traçabilité porte SEC-05 sur le canal modèle

Conduite le 2026-09-21 sur `sortie-vers-le-fournisseur-declaree`.

## Commande de la tâche

```
$ npm run lint:traceability
traceability complete: 85 functional + 8 non-functional [P0] requirements, all present in the matrix
```

Preflight complet (`npm run check`) : sortie 0.

## Nature de la tâche : édition documentaire, pas de cycle rouge-vert

`scripts/check-traceability.ts` est un contrôle de complétude — chaque identifiant `[P0]` de
l'amont doit apparaître dans une des deux tables. Il ne juge pas ce qu'une ligne décrit. SEC-05 y
figurait déjà avant cette story, via `export-service.ts` ; le contrôle était vert avant l'édition et
reste vert après. Il n'y a rien à rendre rouge : la tâche est de rendre la ligne exacte, pas de la
faire apparaître.

## Ce qui a changé

**Ligne SEC-05** — porte désormais les trois preuves de cette story en plus de l'export :
`policy.ts` (destinations déclarées), `intervention.ts` (refus avant que le fournisseur soit
joint), `export-service.ts` (inchangé). Colonne des preuves : `v1/egress` en plus de
`v2/export-integration`.

**Ligne NFR-06** — porte désormais la distinction que D-46 nomme dans ses conséquences : la
campagne `v2/telemetry` mesure l'absence de télémétrie du **produit**, et le canal modèle — par
lequel le worker joint le fournisseur configuré dans Pi — est hors de cette mesure et couvert par
SEC-05. Sans cette clause, un lecteur pressé pouvait lire la ligne NFR-06 comme couvrant aussi le
canal modèle, ce qu'elle n'a jamais mesuré.

## Une erreur commise et corrigée dans le même geste

Le premier remplacement laissait une parenthèse fermante orpheline en fin de ligne NFR-06 — le
texte ajouté n'ouvrait pas la parenthèse qu'il fermait. `npm run lint:traceability` ne l'aurait pas
vu, ce contrôle ne lisant pas la prose des colonnes. Relevé par relecture avant commit, corrigé, et
vérifié par un passage ligne à ligne du fichier entier comptant parenthèses ouvrantes et fermantes
— pas seulement les deux lignes touchées.

## Revue de sécurité — `security: low`

Édition documentaire seule ; aucun chemin de code touché.
