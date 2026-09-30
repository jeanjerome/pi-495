# D-76: L'installation d'un framework approuvé ouvre le réseau à cette seule étape

**Status:** Acceptée
**Date:** 2026-09-30

## Contexte

`D-72` décide que 495 installe le framework de tests que le propriétaire a approuvé, et laisse ouverte
la voie : les contrôles d'une cible Node tournent sans réseau (`network: denied`), et aucune étape du
noyau n'installe une dépendance. Le profil `allowed` existe dans le type et dans les deux backends de
confinement, et aucun appelant ne le pose. La copie de travail reprend le `node_modules` déjà présent
sur la machine, sans rien y installer.

Le propriétaire a accepté le 2026-09-30 que 495 ouvre le réseau.

## Décision

1. **Le réseau n'est ouvert que pour l'étape d'installation d'un framework que le propriétaire a
   approuvé.** Les contrôles, les interventions et toute autre étape restent sans réseau.
2. **Ce qui est installé est ce que le catalogue nomme**, à la version qu'il fixe, et rien d'autre : ni
   dépendance transitive choisie par la session, ni paquet proposé par un modèle. Quand le paquet doit
   suivre un outil que la cible a déjà installé (le fournisseur de couverture de vitest), le catalogue fixe
   la règle et la version est celle de cet outil, lue dans la référence.
3. **Les scripts d'installation du paquet ne s'exécutent pas.**
4. **L'étape est confinée** comme les autres, avec un profil qui n'ouvre que le réseau, et son résultat
   (paquets installés, versions, empreintes du verrou) est inscrit au dossier.
5. **Le propriétaire peut installer lui-même** l'outil avant de lancer le changement ; 495 le constate
   alors dans la référence et n'installe rien.

## Conséquences

C'est la première fois qu'une étape de 495 fait sortir du code vers le réseau. La sortie de données
vers le dépôt de paquets est déclarée comme celle vers le fournisseur de modèle (`D-46`), et la story
qui la réalise décrit ce qu'un paquet installé peut atteindre malgré les scripts désactivés.

Le propriétaire a écarté le 2026-09-30, pour l'installation du fournisseur de couverture de vitest, deux
protections : un pré-contrôle de la version auprès d'une base publique de paquets malveillants, qui ajoute
une seconde sortie réseau, et un délai d'ancienneté de version, qui n'a pas d'objet quand la version est
celle d'un outil que la cible a déjà retenue. Les deux se rouvrent avec un catalogue qui choisit lui-même
des versions.
