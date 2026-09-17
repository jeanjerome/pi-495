# Étage 3 — ARC-04 : contraindre par l'architecture active

**État :** à faire
**Exigence :** ARC-04 [P0], avec ARC-01 et CON-03 en dépendance amont et ARC-05 [P1] en aval
**Dépend de :** étage 1

## Motif

ARC-04 : « une architecture adoptée ne doit pas rester seulement une consigne dans le contexte ».
Une conception transmise au producteur dans son contexte n'est qu'une instruction, donc soumise à
la même inférence que le code produit. Tant qu'aucun contrôle ne l'observe, elle n'est pas
opposable.

Sa recette : un candidat fonctionnel plaçant une responsabilité dans un module interdit échoue au
contrôle prévu ; un changement volontaire de frontière exige une révision architecturale adoptée.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/ROADMAP.md (sections 1 et 4) puis ARC-01 à ARC-04 dans
docs/amont/expression-besoins.md.

ARC-04 : « une architecture adoptée ne doit pas rester seulement une consigne dans le contexte ».
Recette : un candidat fonctionnel plaçant une responsabilité dans un module interdit échoue au
contrôle prévu.

Ajoute des constats structurels — frontières, cycles, dépendances interdites — dans l'enveloppe
`Finding` existante (src/contracts/v1/evidence.ts, catégorie "structure" déjà prévue), produits
par un adaptateur d'analyse natif à l'écosystème et exécutés par le runner générique. Le
registre de références a tranché : adaptateurs natifs par écosystème, enveloppe de constat
commune, pas de moteur sémantique universel.

Précédent interne : scripts/check-layers.ts applique déjà une règle de frontières au dépôt 495
lui-même. La cible ~/Projets/495-workspace/cibles/simple-demo-hexagonal-architecture est
hexagonale : `domain` ne doit dépendre ni de `infrastructure` ni d'un framework — une première
règle naturelle et vérifiable.

Comme à l'étage 2, les constats se jugent sur le delta ; le classement préexistant / introduit
vient de l'étage 1 : une violation préexistante est tolérée et nommée, une violation introduite
est refusée.

Critères d'acceptation :
- un candidat introduisant un import de `infrastructure` dans `domain` échoue avec la
  localisation exacte ;
- un cycle préexistant n'échoue pas mais apparaît en constat `preexisting` ;
- `npm run check` passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Catégorie de constat | `FINDING_CATEGORIES` comprend déjà `"structure"` |
| Localisation | `Region` du contrat `Finding` : lignes et colonnes |
| Précédent interne | `scripts/check-layers.ts`, règle d'imports entre couches de 495 |
| Doctrine multi-langage | `docs/amont/references-externes.md` § 5 : adaptateurs natifs, enveloppe commune |

## Journal

_À compléter._
