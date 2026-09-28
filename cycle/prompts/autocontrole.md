Pas 3 du cycle, l'autocontrôle, pour la story {{id}} sur la branche `{{branche}}` (base `{{base}}`).
Relis `git diff {{base}}...HEAD` contre les standards de CONVENTIONS.md, avec la liste ci-dessous.
Corrige sur la branche tout ce que tu trouves, en commits séparés, sans ajouter de comportement ; une
correction qui ajouterait un refus, un état ou un mécanisme va au registre `specs/bugs/registry.yaml`
et sera traitée après la relecture. `npm run check` doit être vert à la fin ; lis son code de
sortie. Ne pousse rien.

Ce que la relecture ne cherchera pas, et que tu es donc seul à tenir :

- **Périmètre.** Le diff ne contient que ce que la story demande : rien de refactorisé en passant,
  aucune capacité spéculative, aucun fichier touché hors du besoin.
- **Code mort.** Rien de commenté, rien d'inutilisé, aucun export que rien ne lit.
- **Types.** Aucun `any`, aucun `@ts-ignore`, aucun `as unknown as`, aucune fonction publique non typée.
- **Tests.** Chaque fonction nouvelle a un test ; chaque correction a son test de non-régression ;
  les tests passent par l'interface publique ; F.I.R.S.T. Un test dont le titre promet plus que son
  assertion est renommé ou complété.
- **Une responsabilité.** Aucune fonction ni aucun module ne fait deux choses sans rapport ; une
  dépendance est injectée, pas importée globalement ; pas de chaîne d'appels à travers des objets
  sans rapport.
- **Noms.** Chaque nom a un sens précis et unique ; pas de `data`, `handler`, `Manager`, `Service`.
- **Commentaires.** Le pourquoi, jamais le quoi ; aucune référence à une story, un tour, une session.
- **Couches.** La direction des dépendances de AGENTS.md § Architecture tient ; tout composant
  nouveau a son `CMP-*` au catalogue ; une exigence devenue couverte a sa ligne à la matrice.
- **Secrets et sortie.** Aucun secret dans le diff ; rien d'imprimé qui ne passe par la couche de
  présentation.

Avant de rendre ta sortie, nomme toute raison que tu t'es donnée pour sauter un point : le silence
n'est pas une réponse.

---

{{story}}
