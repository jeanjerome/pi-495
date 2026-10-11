# D-90: Un contrôle reçoit ses droits du propriétaire, jamais du candidat, et ce qui ne tourne pas confiné est jugé dans une VM sur la même révision

**Status:** Acceptée (arbitrage du propriétaire, 2026-10-11)
**Date:** 2026-10-11

## Contexte

Le premier dogfooding réel de pi-495, le 11 octobre, a montré deux besoins que 495 ne sert pas
(`specs/spikes/confinement-de-l-execution-dans-d-autres-projets.md`, § « Ce que la campagne du 11 octobre a montré »).

Le premier besoin porte sur les droits. Un contrôle a besoin de chemins que 495 ne connaît pas d'avance. Il dépend
aujourd'hui de la configuration git de l'hôte, qui signe les commits avec une clé de `~/.ssh`. Et un droit accordé par
le chemin réel d'un lien s'élargit à toute la copie quand le candidat commite `test-output -> .`.

Le second porte sur ce qui ne peut pas tourner confiné. Seatbelt refuse d'appliquer un second profil sous un premier :
551 des 1734 tests de pi-495 échouent sous le confinement d'un contrôle.

L'étude citée a lu dix-sept projets. Deux IA l'ont menée séparément, et le propriétaire a tranché leurs trois
désaccords le 11 octobre.

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
4. **Un test qui ne peut pas tourner confiné se saute avec son motif et reste une obligation.**
   - La qualification de Seatbelt applique un vrai profil : sous un autre Seatbelt, 495 refuse par
     `capability_missing` au lieu de se croire qualifié.
   - L'obligation reste non réglée tant qu'une exécution sur la même révision, dans un environnement séparé et
     qualifié, ne l'a pas réglée.
   - Aucun code du candidat ne tourne sur l'hôte sans confinement.
5. **L'environnement séparé est une VM, lancée par le noyau sur une copie de la révision figée, avec des montages
   qu'il fixe.**
   - Pour les tests qui démarrent bubblewrap : la VM Linux d'Apple `container`, que `scripts/linux/` emploie déjà.
   - Pour Docker, quand une cible en aura besoin : la même VM, avec son propre démon, jamais celui de l'hôte. Aucune
     cible n'en a besoin aujourd'hui, et e40 ne le réalise pas.
   - Pour les tests qui démarrent Seatbelt : une VM macOS, sans Seatbelt autour. L'outil de virtualisation est lu et
     essayé avant d'être retenu.

## Conséquences

Le dogfooding de pi-495 peut juger toute sa suite, chaque test là où il peut tourner, sans relâcher le confinement de
l'hôte.

La règle d'un backend non qualifié reste celle de `CLAUDE.md` : refuser par `capability_missing` plutôt qu'exécuter
hors confinement. Aucun projet lu ne donne de raison de la changer.

Sous Linux, la proposition d'un droit repose sur un texte que le candidat écrit. Le propriétaire est la seule barrière,
et l'écran de proposition doit le lui dire.

Une VM macOS coûte une image de plusieurs dizaines de Go, et macOS limite à deux les VM macOS actives par machine
(sources secondaires). Aucun projet lu ne le fait : la story qui la réalise commence par un essai, et son bilan revient
au propriétaire si l'outil ne tient pas.

Un démarrage bloqué de `container` est signalé sous macOS 27 (ticket #2275 du projet) : la story qui fait lancer la VM
Linux par le noyau commence par cet essai. Docker dans cette VM demandera un réglage de l'image, que l'epic qui le
réalisera essaiera.
