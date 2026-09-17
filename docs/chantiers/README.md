# Suivi des travaux

Ce répertoire porte les travaux ouverts sur 495. Chaque fiche contient le motif, un prompt autonome
à lancer dans une session vierge, les critères d'acceptation et un journal à compléter au fil de
l'avancement.

La démonstration qui justifie les étages est dans `../ROADMAP.md` : le principe du contrôle de
l'introduit, et pourquoi aucun contrôle qualifié ne peut seul prouver un comportement nouveau.

## Étages du contrôle de l'introduit

| Étage | Exigence | Objet | État | Fiche |
| --- | --- | --- | --- | --- |
| 0 | PRE-01 | diagnostic de capacité de contrôle ; la préparation s'ouvre sur l'absence de discrimination | livré non qualifié ; restent IH-04, la cartographie complète et la condition de discrimination à G2 | [00-pre-01-capacite-de-controle.md](00-pre-01-capacite-de-controle.md) |
| 1 | VER-08 | exécution des contrôles sur la référence, classement préexistant / introduit, politique d'instabilité | livré ; le contrôle de couverture de l'étage 2 l'alimente, en classant `new` tout constat que son passage de référence ne porte pas | [01-ver-08-comparaison-a-la-reference.md](01-ver-08-comparaison-a-la-reference.md) |
| 2 | QLT-04 | couverture sur le code introduit, non-aggravation | livré pour une cible Maven dont JaCoCo lie `report` hors profil ; la stack Node et les autres clauses de QLT-04 restent absentes | [02-qlt-04-couverture-introduite.md](02-qlt-04-couverture-introduite.md) |
| 3 | ARC-04, CON-03 | constats structurels, architecture opposable | livré pour une cible Maven multi-module ; ARC-01 partiellement, ARC-02, ARC-03 et la stack Node restent absentes | [03-arc-04-architecture-active.md](03-arc-04-architecture-active.md) |
| 4 | VER-04 | mutation sur les classes modifiées | livré pour une cible Maven déclarant PITest en XML à chemin stable ; les autres angles de VER-04 et l'activation selon le risque restent absents | [04-ver-04-mutation-code-modifie.md](04-ver-04-mutation-code-modifie.md) |

## Travaux transverses

Ils ne s'insèrent pas dans l'échelle des étages et peuvent avancer en parallèle.

| Réf | Objet | État | Fiche |
| --- | --- | --- | --- |
| A | complétude de la matrice de traçabilité, et le contrôle qui l'empêche de se rouvrir | à faire | [A-matrice-completude.md](A-matrice-completude.md) |
| B | les six revues obligatoires de qualification | à faire | [B-revues-obligatoires.md](B-revues-obligatoires.md) |
| C | clôture du jalon L0 : Linux, RPC, risques instruits, paramètres différés | à faire | [C-cloture-jalon-l0.md](C-cloture-jalon-l0.md) |

## Contraintes communes

**L'ordre des étages compte.** L'étage 2 mesure la couverture du code introduit ; c'est l'étage 0
qui garantit qu'une suite discriminante existe, et l'étage 1 qui distingue un constat préexistant
d'un constat introduit. Inversés, on mesurerait la couverture de tests qui ne prouvent rien, et on
refuserait un candidat pour une dette qu'il n'a pas créée.

**Les étages 1 à 4 touchent au protocole gelé.** Modifier `PARSER_IDS` ou `ControlDefinition`
impose `npm run contracts`. Ces modifications changent aussi `environment_digest`, qui couvre le
digest de l'arbre exécuté : un changement en cours au moment de la mise à jour verra son protocole
invalidé. Ne pas engager ces travaux pendant qu'un cycle tourne.

## Critère de sortie

`npm run check` passe, `../TRACEABILITY.md` est actualisée pour les exigences devenues couvertes, et
`../STATUS.md` reflète ce qui est réellement qualifié sur la machine de référence.

Pour un travail qui prétend clore une capacité annoncée, ce critère ne suffit pas : c'est la règle
de décision de livraison de `../amont/conception-verification.md` §12 qui s'applique, en dix points.
Ses conditions les plus souvent oubliées :

- aucun `FAIL`, `INDETERMINATE` ou `NOT_RUN` obligatoire masqué par un score agrégé ;
- les contrôles faisant autorité possèdent une qualification courante : témoin positif,
  contre-exemple ciblé, incident de capteur et politique d'aléa lorsqu'elle s'applique ;
- les revues obligatoires applicables sont réalisées et leurs constats bloquants clos, refusés
  explicitement ou couverts par une dérogation ;
- les limitations, capacités absentes et environnements non qualifiés sont annoncés.
