# Étage 3 — VER-04 : mutation sur les classes modifiées

**État :** à faire
**Exigence :** VER-04 [P1], accessible au socle par le runner générique
**Dépend de :** étage 1

## Motif

La couverture répond à « cette ligne est-elle exercée ». Elle ne répond pas à « un test
remarquerait-il que cette ligne change ». La mutation est l'instrument de cette seconde question,
et c'est le seul étage que la couverture ne peut pas atteindre.

Deux règles de cadrage s'appliquent. L'orchestration générique de tests natifs relève du socle,
tandis qu'une intégration spécialisée à un outil de mutation vient ensuite : le travail passe donc
par le runner générique et un parser. Et un essai de mutation n'est pas déterministe par son seul
nom — seeds, environnement, résultats attendus et instabilité doivent être maîtrisés et
documentés.

## Prompt

```
Dans ~/Projets/495-pi-package, lis docs/ROADMAP.md (sections 3 et 5) puis VER-04 dans
docs/amont/expression-besoins.md, ainsi que le paragraphe sur les budgets des
contrôles coûteux (section 12 du même document).

Deux règles de cadrage à respecter :
- l'orchestration générique de tests natifs relève du socle ; un intégrateur dédié à un outil de
  mutation relève de la suite. Passe donc par le runner générique et un parser, pas par une
  intégration spécialisée ;
- « les essais de mutation ne sont pas déclarés déterministes par leur seul nom : seeds,
  environnement, résultats attendus et instabilité doivent être maîtrisés et documentés ».

La cible Maven a déjà PITest configuré : sortie XML, rapports non horodatés (chemin stable),
`mutationThreshold` par module. Scope les mutants aux classes modifiées par le candidat — les
chemins changés sont dans le manifeste, et `diffLines` donne les lignes.

Budget : un contrôle de mutation reçoit un budget propre. Si ce budget empêche de produire une
preuve obligatoire, le changement reste INDETERMINATE ; le seuil n'est jamais abaissé pour
terminer. Vérifie que ce chemin donne bien un incident, donc une reprise légitime, et non un
FAIL sur le candidat.

Critères d'acceptation :
- un mutant survivant sur une classe modifiée produit un constat localisé ;
- un mutant survivant sur une classe non touchée par le candidat ne fait pas échouer ;
- un dépassement de budget donne INDETERMINATE et non FAIL ;
- `npm run check` passe.
```

## Points d'ancrage

| Élément | Emplacement |
| --- | --- |
| Frontière incident / verdict | `incidentOf` dans `parsers.ts` : seuls lancement, timeout et signal sont INDETERMINATE |
| Chemins modifiés | manifeste de candidat, entrées dont `baseline_state !== "unchanged"` |
| Budget par contrôle | `timeout_ms` de `ControlDefinition` ; budgets de politique dans `policy.budgets` |
| Configuration côté cible | PITest en XML non horodaté, seuil par module |

## Journal

_À compléter._
