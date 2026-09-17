# Étage 2 — QLT-04 : couverture sur le code introduit

**État :** à faire
**Exigence :** QLT-04 [P0], avec QLT-02 en dépendance amont
**Dépend de :** étages 0 et 1

## Motif

QLT-04 demande des règles sur le code nouveau ou modifié, des tolérances nommées pour la dette
antérieure, et la non-aggravation comme critère. Sa recette : un candidat qui diminue un total de
constats mais introduit une violation interdite est refusé.

Un seuil global ne répond pas à cette exigence : il mesure l'hygiène d'un dépôt, bloque un
composant historiquement bas quel que soit le candidat, et laisse passer un ajout non testé quand
le reste compense.

Mesure relevée sur la cible Java pour un candidat accepté : 276 lignes instrumentées modifiées,
93 jamais exercées, 44 branches non couvertes, dont deux fichiers ajoutés à 0 %.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/ROADMAP.md (sections 1, 4 et 5) puis QLT-04 dans
docs/amont/expression-besoins.md.

QLT-04 demande des règles sur le code nouveau ou modifié, des tolérances nommées pour la dette
antérieure, et la non-aggravation comme critère. Pas de seuil global : un ratio de dépôt bloque
un composant historiquement bas quel que soit le candidat, et laisse passer un ajout non testé
quand le reste compense.

Ajoute un contrôle de couverture différentielle, en t'appuyant sur ce qui existe :
- la cible Maven produit déjà target/site/jacoco/jacoco.xml à chaque phase test (jacoco
  `report` y est lié hors profil) : aucune exécution supplémentaire n'est nécessaire ;
- `diffLines` (src/application/diff.ts) rend des segments `kind:"new"` avec `new_start`, donc
  les lignes introduites côté candidat ;
- le texte de référence et celui du candidat sont dans le CAS (artefact `files_<candidate_id>`),
  donc le calcul est hors ligne et vérifiable dans un dossier exporté ;
- `Finding.baseline_state` est renseigné par l'étage 1 : appuie-toi sur le classement
  préexistant / introduit plutôt que d'en refaire un propre à la couverture.

`PARSER_IDS` est un enum fermé dans src/contracts/v1/protocol.ts : après modification, lance
`npm run contracts`.

Point difficile à traiter explicitement : ce contrôle doit être qualifié comme les autres
(témoins positif, négatif, incident). Détermine ce que sont ces trois témoins pour un contrôle
de couverture, ou justifie un régime de qualification différent.

Critères d'acceptation :
- sur un candidat ajoutant du code non testé, verdict FAIL localisé au fichier et à la ligne ;
- sur un refactoring qui ne touche que des lignes déjà couvertes, verdict PASS ;
- `npm run check` passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Lignes introduites | `diffLines`, segments `kind:"new"` avec `new_start` |
| Octets de référence et de candidat | CAS, artefact `files_<candidate_id>` et instantané de référence |
| État de constat | `Finding.baseline_state`, renseigné par l'étage 1 |
| Enum fermé des parsers | `PARSER_IDS` ; régénérer avec `npm run contracts` |
| Rapport de couverture | produit par le contrôle de test existant, sous `target/site/jacoco/` |

## Journal

_À compléter._
