# D-84: Linux est une plateforme revendiquée, confinée par bubblewrap

**Status:** Acceptée (arbitrage du propriétaire, 2026-10-07) ; remplace `D-31`
**Date:** 2026-10-07

## Contexte

`D-31` a refusé Linux pour une raison de mesure, non de code : la seule machine Linux disponible était un
conteneur où `bwrap` ne crée d'espace de noms qu'en `--privileged`, c'est-à-dire là où la frontière à
constater a déjà été retirée. Le backend `bubblewrap` a donc été gardé, et sa qualification échoue sur
toute machine.

Apple container 1.5.0 fait tourner chaque conteneur dans sa propre machine virtuelle, avec son propre
noyau Linux (6.12, arm64). Sondé le 2026-10-07 dans une telle machine, Debian 13 et `bwrap` 0.8, en
utilisateur ordinaire et sans privilège : `bwrap --ro-bind / / --unshare-all` réussit, et le backend de 495
confine ce que la matrice d'attaque de Seatbelt éprouve. Une écriture hors des chemins accordés est refusée
(`EROFS`) et n'a pas lieu. Un chemin protégé, lu directement ou par un lien symbolique, est absent
(`ENOENT`). Une écriture dans le répertoire personnel est refusée. Sous un réseau refusé, le processus
n'atteint que lui-même (`ENETUNREACH` vers tout autre hôte). La raison de `D-31` ne tient plus.

## Décision

1. **Linux est une plateforme revendiquée.** Le backend `bubblewrap` est qualifié sur une machine Linux qui
   offre `bwrap` dans `PATH` et sur laquelle `bwrap` crée, sans privilège, les espaces de noms qu'il demande.
   La qualification le sonde ; quand l'une de ces conditions manque, elle échoue en la nommant, et la
   sélection refuse tout rôle confiné avec `capability_missing` (`ADR-013`).
2. **La qualification se fait sur Linux arm64**, dans une machine virtuelle d'Apple container : la matrice
   d'attaque, la suite entière et les deux campagnes de référence. Le propriétaire tient Linux x86-64 pour
   couvert par cette qualification (arbitrage du 2026-10-07). La documentation dit que Linux est testé sous
   arm64.
3. **Sous Linux, un réseau refusé est un espace de noms réseau à soi**, qui ne porte que l'interface de
   bouclage : le processus confiné peut se joindre lui-même et n'atteint aucun autre hôte, pas même un
   service de la machine qui l'héberge. Les profils `denied` et `loopback` y sont donc confinés de la même
   façon (`D-29`).

## Conséquences

`NFR-05` est satisfaite pour macOS arm64 et Linux. La matrice d'attaque de `bubblewrap` est éprouvée sous
Linux par `scripts/linux/test.sh`, qui fait tourner les tests de 495 dans une machine virtuelle depuis le
Mac ; les campagnes de référence y tournent par `scripts/linux/campagne.sh`, avant chaque publication comme
sur le Mac.

Une machine Linux sans espaces de noms utilisateur, comme un conteneur ordinaire, n'est pas qualifiée, et
le refus le dit.
