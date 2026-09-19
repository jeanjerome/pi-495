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
| 2 | QLT-04 | couverture sur le code introduit, non-aggravation | livré pour une cible Maven dont JaCoCo lie `report` hors profil ; le capteur se qualifie dans le cycle depuis que le rapport qu'il lit est déclaré par le contrôle qui l'écrit (fiche D) ; la stack Node et les autres clauses de QLT-04 restent absentes | [02-qlt-04-couverture-introduite.md](02-qlt-04-couverture-introduite.md) |
| 3 | ARC-04, CON-03 | constats structurels, architecture opposable | livré pour une cible Maven multi-module ; ARC-01 partiellement, ARC-02, ARC-03 et la stack Node restent absentes | [03-arc-04-architecture-active.md](03-arc-04-architecture-active.md) |
| 4 | VER-04 | mutation sur les classes modifiées | livré pour une cible Maven déclarant PITest en XML à chemin stable ; les autres angles de VER-04 et l'activation selon le risque restent absents | [04-ver-04-mutation-code-modifie.md](04-ver-04-mutation-code-modifie.md) |

## Travaux transverses

Ils ne s'insèrent pas dans l'échelle des étages et peuvent avancer en parallèle.

| Réf | Objet | État | Fiche |
| --- | --- | --- | --- |
| A | complétude de la matrice de traçabilité, et le contrôle qui l'empêche de se rouvrir | livré : `scripts/check-traceability.ts` sur `npm run check`, et les cinq recettes `CTX-04`, `UX-05`, `EXT-02`, `IMP-05`, `NFR-06` exercées | [A-matrice-completude.md](A-matrice-completude.md) |
| B | les six revues obligatoires de qualification | partiel : les six dossiers existent (`../revues/`), trois revues conduites et leurs bloquants clos par des contrôles, trois en attente d'une autorité ou d'un environnement absents | [B-revues-obligatoires.md](B-revues-obligatoires.md) |
| C | clôture du jalon L0 : Linux, RPC, risques instruits, paramètres différés | clos : Linux non revendiqué avec son refus éprouvé sur Linux, RPC et hôte SDK exercés, les dix risques instruits dans `../RISQUES-L0.md`, les trois paramètres fixés sur un corpus mesuré | [C-cloture-jalon-l0.md](C-cloture-jalon-l0.md) |
| D | la qualification d'un capteur qui lit le rapport d'un autre contrôle, et le cycle réel qu'elle bloquait | clos : le rapport lu est déclaré par le contrôle qui l'écrit (`D-36`), les quatre capteurs se qualifient, et la cible Maven va de la demande à l'acceptation avec le modèle local, une réponse humaine à `IH-01` en cours de route | [D-qualification-capteur-a-rapport.md](D-qualification-capteur-a-rapport.md) |
| E | la commande de test d'une cible Node, et les exclusions de workspace | ouvert : le contrôle `unit` ne passe pas sur une référence en vitest, et une copie de travail perd le `dist/` de ses dépendances | [E-adaptateur-node-commande-de-test.md](E-adaptateur-node-commande-de-test.md) |
| F | une sortie structurée refusée, et le changement qui n'a plus d'issue | ouvert : deux lancements sur trois y meurent sur la cible Maven, le blocage est déclaré réessayable et aucune entrée Pi n'expose l'action nommée | [F-sortie-structuree-refusee.md](F-sortie-structuree-refusee.md) |
| L | une réponse à une question matérielle qui n'atteint pas les exigences | ouvert, et c'est lui qui commande l'ordre : un changement accepté rend `400` là où son propriétaire avait décidé `422`, et le protocole gelé exige ce `400` en égalité stricte | [L-reponse-humaine-sans-effet.md](L-reponse-humaine-sans-effet.md) |
| G | la lisibilité de l'état d'un changement, arrêté ou abouti | ouvert : cause répétée trois fois, notification sur la ligne la moins décisive, onze risques résiduels sur douze qui ne portent pas sur le candidat, dont un qui énonce le contraire du fait mesuré | [G-lisibilite-etat-arrete.md](G-lisibilite-etat-arrete.md) |
| H | l'inventaire d'un arbre : sous-module, fichier spécial, et le workspace qui porte la revue | ouvert : le genre `submodule` est déclaré et jamais produit, un fichier spécial devient une suppression fantôme, et la revue dépend d'un workspace que rien ne réclame | [H-inventaire-cas-particuliers.md](H-inventaire-cas-particuliers.md) |
| K | la clarté des prompts d'intervention, et les skills du harnais | ouvert : les instructions sont un bloc unique sans découpage ni sélection par rôle ; trois campagnes montrent qu'elles se contredisent ou se noient, et la voie instruite est de charger des skills du harnais par un chemin contrôlé, inscrites au manifeste | [K-clarte-des-prompts-et-skills-du-harnais.md](K-clarte-des-prompts-et-skills-du-harnais.md) |
| J | le mandat qui interdit la vérification qu'il exige | ouvert : le prompt ordonne au producteur de lancer les contrôles lui-même, le mandat lui interdit d'écrire hors des racines de test, et seule une exclusion de workspace invisible depuis le prompt sauve celui qui passe par Maven | [J-mandat-de-preparation-contradictoire.md](J-mandat-de-preparation-contradictoire.md) |
| I | ce que Pi rend déjà, et ce que la revue réimplémente | ouvert : la mesure d'une ligne stylée est reprise de `pi-tui` (`D-35`) ; reprendre ses composants demande d'arbitrer ce que la règle de couches protège | [I-ce-que-pi-rend-deja.md](I-ce-que-pi-rend-deja.md) |

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
