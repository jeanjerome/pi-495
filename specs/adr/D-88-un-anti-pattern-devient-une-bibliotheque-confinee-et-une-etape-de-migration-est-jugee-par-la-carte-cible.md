# D-88: Un anti-pattern devient une bibliothèque confinée, et une étape de migration est jugée par la carte de la cible, à défaut par celle de départ

**Status:** Acceptée (arbitrages du propriétaire, 2026-10-09) ; précise `D-87`
**Date:** 2026-10-09

## Contexte

`D-87` veut qu'un anti-pattern relevé par la revue de patterns, et qui s'écrit en règle de dépendance, soit
proposé comme règle de la carte pour être vérifié par un outil. La carte ne connaît que les relations
permises entre parties, les règles du style de chaque partie, l'absence de cycle et l'appartenance de
chaque source à une partie. L'anti-pattern que la revue relève le plus souvent lui échappe : un appel
direct de l'infrastructure depuis le domaine ou l'application, comme un `new` d'une classe JPA dans un
service ou un `import pg` dans un service Node. La grosse classe, le grand `switch` ou le singleton ne sont
pas des dépendances, et aucun outil d'import ne les vérifie.

`ARC-03` demande que chaque étape d'une migration ait des critères adaptés à l'état transitoire, et que les
règles de la cible qui ne tiennent pas encore ne soient désactivées qu'avec une portée et une échéance ; sa
recette rejette une nouvelle utilisation du chemin ancien. `ARC-04` veut que le candidat d'une étape soit
jugé par les règles actives. La carte est gelée dans le protocole de l'état des lieux qui l'adopte, une
migration tolère des règles par des exceptions datées (`e11s06`), et une transformation vise une
organisation différente de la carte de départ.

## Décision

1. **Un anti-pattern devient une seule forme nouvelle de règle : une bibliothèque confinée.** Seuls les
   paquets ou dossiers que la règle nomme peuvent utiliser telle bibliothèque, par exemple seul l'adaptateur
   de persistance importe `jakarta.persistence`, ou `pg`. Elle couvre l'appel direct de l'infrastructure, les
   requêtes dispersées et la journalisation mêlée au métier. Elle s'écrit pour ArchUnit et pour
   dependency-cruiser. Un anti-pattern d'une autre forme reste un texte de la recommandation. Une règle
   « tel paquet du projet n'importe pas tel autre », plus fine que les relations entre parties, n'est pas
   retenue : elle recoupe ce que la carte dit déjà.
2. **Le candidat d'une étape de migration est jugé par la carte de la cible quand la migration en a fait
   adopter une, sinon par la carte de départ, moins, dans les deux cas, les règles qu'une exception datée
   tolère.** Seul ce que l'étape ajoute est jugé : une nouvelle violation est refusée, celles que la
   référence portait déjà ne le sont pas. Un ajustement se juge dès maintenant sur la carte de départ ; une
   transformation se juge sur ce qu'elle vise, une fois sa carte cible adoptée.

## Conséquences

La règle de bibliothèque confinée entre dans la carte comme les relations entre parties : proposée avec ses
indices, adoptée par le propriétaire, gelée au protocole, vérifiée par le contrôle d'architecture de chaque
technologie, chaque violation localisée.

Juger une étape suppose que la carte cible puisse être adoptée avant elle : l'écriture de la cible en carte
précède le jugement des étapes dans l'epic `e11`. Une migration sans carte cible reste jugée sur sa carte de
départ, sans rien demander de plus au propriétaire.
