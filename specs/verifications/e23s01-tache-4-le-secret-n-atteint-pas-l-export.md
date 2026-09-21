# e23s01 — tâche 4 : un secret retiré de l'export est signalé sans être divulgué

Conduite le 2026-09-21 sur `sortie-vers-le-fournisseur-declaree`.

## Commande de la tâche

```
$ node --test test/v2/export-integration.test.ts
ℹ tests 7   ℹ pass 7   ℹ fail 0
```

Preflight complet (`npm run build && npm run check`) : sortie 0.

## Nature du cycle : caractérisation, vert à l'arrivée

`test/v2/export-integration.test.ts` existait déjà et tenait déjà la moitié négative de la recette
de SEC-05 — le secret n'apparaît dans aucun fichier texte du dossier expurgé, `redactions.json`
compris. Ce que cette tâche ajoute est la moitié qui manquait : que le signalement nomme
l'emplacement et le compte, et que sa forme ne puisse structurellement pas porter la valeur.

| Comportement | État à l'arrivée |
| --- | --- |
| Le secret n'apparaît dans aucun fichier du dossier (préexistant) | déjà vert |
| Un enregistrement de retrait ne porte que `path`, `count`, `kind` | vert à l'arrivée |
| Le type qui porte le signalement ne réserve aucun champ pour une valeur (garde structurelle) | vert à l'arrivée |

Aucun code de production écrit. Deux tests, un seul commit `test:`.

## Ce que la garde structurelle établit

`src/export/export-service.ts` retire un secret par `text.replace(re, () => { count++; return
"[REDACTED-BY-495]"; })` : le rappel ne déclare aucun paramètre, donc le texte trouvé n'entre jamais
en mémoire JS au-delà de l'appel de la fonction native `replace`. `redactions.push({ path, count,
kind: "secret-sentinel" })` ne peut donc pas fuir une valeur qu'il n'a jamais reçue. La garde fixe
la déclaration de type elle-même — un champ `value` ou `secret` ajouté à ce type ferait échouer le
test avant qu'il atteigne un fichier.

## Revue de sécurité — `security: high`

Aucun constat nouveau sur `src/export/export-service.ts`. Le canal modèle (tâche 3) et l'export
(cette tâche) sont désormais tous deux couverts pour la même classe de fuite ; aucun troisième canal
n'existe dans le périmètre de la story.

## Limite relevée, non traitée

`options.secret_patterns` de `exportChange` reste un point d'entrée générique : un appelant qui
fournit ses propres motifs pourrait en écrire un qui capture la valeur dans un groupe puis
l'utiliserait dans le message. Cette tâche prouve ce que `DEFAULT_SECRETS` et le seul appelant
existant font aujourd'hui, pas ce qu'un motif arbitraire pourrait faire.
