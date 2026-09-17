# Suivi des travaux

Ce répertoire porte les travaux ouverts sur 495, un fichier par étage. Chaque fiche contient le
motif, un prompt autonome à lancer dans une session vierge, les critères d'acceptation et un
journal à compléter au fil de l'avancement.

La démonstration qui les justifie est dans `../ROADMAP.md` : le principe du contrôle de
l'introduit, et pourquoi aucun contrôle qualifié ne peut seul prouver un comportement nouveau.

## Étages

| Étage | Exigence | Objet | État | Fiche |
| --- | --- | --- | --- | --- |
| 0 | PRE-01 | diagnostic de capacité de contrôle ; la préparation s'ouvre sur l'absence de discrimination | à faire | [00-pre-01-capacite-de-controle.md](00-pre-01-capacite-de-controle.md) |
| 1 | QLT-04 | couverture sur le code introduit, non-aggravation | à faire | [01-qlt-04-couverture-introduite.md](01-qlt-04-couverture-introduite.md) |
| 2 | ARC-04 | constats structurels, architecture opposable | à faire | [02-arc-04-architecture-active.md](02-arc-04-architecture-active.md) |
| 3 | VER-04 | mutation sur les classes modifiées | à faire | [03-ver-04-mutation-code-modifie.md](03-ver-04-mutation-code-modifie.md) |

## Contraintes communes

**L'ordre compte.** L'étage 1 mesure la couverture du code introduit ; c'est l'étage 0 qui
garantit qu'une suite discriminante existe. Inversés, on mesurerait la couverture de tests qui
ne prouvent rien.

**Les étages 1 à 3 touchent au protocole gelé.** Modifier `PARSER_IDS` ou `ControlDefinition`
impose `npm run contracts`. Ces modifications changent aussi `environment_digest`, qui couvre le
digest de l'arbre exécuté : un changement en cours au moment de la mise à jour verra son
protocole invalidé. Ne pas engager ces travaux pendant qu'un cycle tourne.

**Critère de sortie commun.** `npm run check` passe, la matrice `../TRACEABILITY.md` est
actualisée pour les exigences devenues couvertes, et `../STATUS.md` reflète ce qui est
réellement qualifié sur la machine de référence.
