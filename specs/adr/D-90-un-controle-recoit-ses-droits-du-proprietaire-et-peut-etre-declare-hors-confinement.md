# D-90: Un contrôle reçoit ses droits du propriétaire, jamais du candidat, et le propriétaire peut en déclarer un hors confinement

**Status:** Acceptée (arbitrage du propriétaire, 2026-10-11) ; règle 3 remplacée par `D-92`
**Date:** 2026-10-11

## Contexte

Le premier dogfooding réel de pi-495, le 11 octobre, a montré deux besoins que 495 ne sert pas
(`specs/spikes/confinement-de-l-execution-dans-d-autres-projets.md`, § « Ce que la campagne du 11 octobre a montré »).

Le premier besoin porte sur les droits. Un contrôle a besoin de chemins que 495 ne connaît pas d'avance. Il dépend
aujourd'hui de la configuration git de l'hôte, qui signe les commits avec une clé de `~/.ssh`. Et un droit accordé par
le chemin réel d'un lien s'élargit à toute la copie quand le candidat commite `test-output -> .`.

Le second porte sur ce qui ne peut pas tourner confiné. Seatbelt refuse d'appliquer un second profil sous un premier :
551 des 1734 tests de pi-495 échouent sous le confinement d'un contrôle, parce qu'ils démarrent eux-mêmes Seatbelt ou
bubblewrap. Aucun des dix-sept projets lus ne contourne ce refus.

L'étude citée a été menée séparément par deux IA, et le propriétaire a tranché leurs trois désaccords le 11 octobre.
Pour le second besoin, il avait d'abord retenu une VM macOS qui aurait confiné ces tests à la place de Seatbelt. Il
l'a remplacée le même jour par un contrôle déclaré hors confinement : la VM demandait un outil que l'étude n'a pas lu,
et une machinerie que le produit n'aurait servie qu'à une seule cible.

## Décision

1. **Les droits d'un contrôle se lisent dans la configuration du contrôleur, hors de la copie du candidat**, comme
   aujourd'hui.
   - Ce que le candidat écrit n'élargit jamais un droit.
   - Un droit ne s'accorde jamais par la cible d'un lien.
   - Les dossiers inscriptibles de la copie sont créés par le contrôleur : ce que le candidat y a mis fait refuser.
2. **git, dans un contrôle, ne lit ni la configuration globale ni la configuration système de l'hôte.** C'est la seule
   configuration de l'hôte qu'un constat a mise en cause ; le dossier personnel et le temporaire restent ceux
   d'aujourd'hui.
3. **Un droit manquant est proposé au propriétaire, jamais accordé sans lui.**
   - Sous macOS, la proposition vient des refus que le noyau publie en direct (`log stream`).
   - Sous Linux, aucune source sûre n'existe : la proposition vient de la sortie du contrôle, et le propriétaire la
     voit comme une indication du candidat, non vérifiée.
4. **Le propriétaire peut déclarer un contrôle hors confinement.**
   - L'exception est écrite dans la configuration du contrôleur, pour un contrôle nommé ; le candidat ne peut ni la
     créer ni l'étendre.
   - Le propriétaire l'adopte explicitement, et elle est figée avec les autres contrôles.
   - Le dossier et le verdict disent que ce contrôle a tourné hors confinement sur décision du propriétaire.
   - Rien ne la propose automatiquement, à pi-495 comme à une autre cible.
5. **Ce n'est pas un repli.** Un backend non qualifié refuse toujours par `capability_missing` au lieu d'exécuter sans
   confinement. Le hors-confinement n'arrive que dans le contrôle que le propriétaire a déclaré.
6. **495 ne lance ni VM ni conteneur.** Apple `container` crée sous macOS la VM Linux qui sert à produire pi-495
   (`scripts/linux/`). Ce n'est pas un choix pour les projets cibles, où la conteneurisation n'est pas abordée : 495 y
   génère du code applicatif, et un Dockerfile s'y écrit comme tout autre fichier.

## Conséquences

Le dogfooding de pi-495 juge toute sa suite : les tests de bac à sable dans le contrôle déclaré hors confinement, les
autres confinés.

Ce contrôle lit `~/.ssh` et les identifiants de l'hôte, et a le réseau. Le code que le candidat écrit et que ces tests
importent tourne donc sans protection. Ce n'est pas plus que ce que le développement de pi-495 expose aujourd'hui :
la Preflight du cycle lance déjà toute la suite sans confinement sur la machine du propriétaire. C'est pour cela que
l'exception se déclare, s'adopte et se lit dans le verdict, et qu'aucune détection ne la propose.

Le hors-confinement existait déjà pour toute l'instance, par `isolation.allow_unconfined` ou
`HARNESS495_ALLOW_UNCONFINED=1`, qui retire les garanties SEC-02 et SEC-03 à tous les contrôles. L'exception par
contrôle les garde pour tous les autres.

Sous Linux, la proposition d'un droit repose sur un texte que le candidat écrit. Le propriétaire est la seule barrière,
et l'écran de proposition doit le lui dire.

La qualification de Seatbelt lit la plateforme sans appliquer de profil : sous un autre Seatbelt, 495 se croit
qualifié. Ce défaut reste au registre (`BUG-2026-10-11T013000`) ; le dogfooding n'en dépend plus.
