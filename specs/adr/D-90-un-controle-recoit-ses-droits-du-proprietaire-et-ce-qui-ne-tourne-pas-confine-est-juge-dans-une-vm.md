# D-90: Un contrôle reçoit ses droits du propriétaire, jamais du candidat, et les tests de bac à sable de pi-495 tournent dans un bac à sable qui fonctionne

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
4. **Un test qui démarre un bac à sable et n'en trouve pas qui fonctionne se saute avec son motif et reste une
   obligation**, jamais comptée comme passée.
   - La qualification de Seatbelt applique un vrai profil : sous un autre Seatbelt, 495 refuse par
     `capability_missing` au lieu de se croire qualifié.
   - Aucun code du candidat ne tourne sur l'hôte sans confinement.
5. **Les tests de bac à sable de pi-495 tournent dans un bac à sable qui fonctionne, et 495 les juge.**
   - Sous Linux, bubblewrap démarré sous le confinement bubblewrap de 495, qui n'interdit pas de nouveaux espaces de
     noms utilisateur. L'essai se fait dans la VM Linux qu'Apple `container` crée sous macOS (`scripts/linux/`).
     C'est un outil de développement de pi-495, pas un choix fait pour les projets cibles.
   - Sous macOS, où Seatbelt refuse un second profil, une VM macOS confine le contrôle à la place de Seatbelt : elle
     reçoit une copie de la révision figée et protège l'hôte. La configuration du contrôleur la demande pour un
     contrôle ; rien ne la propose à une cible. L'outil de virtualisation est lu et essayé avant d'être retenu.

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

Sous Linux, bubblewrap emboîté n'est pas essayé : un noyau qui refuse les espaces de noms utilisateur imbriqués laisse
ces tests en obligation. L'essai se fait dans la VM Linux de `scripts/linux/` ; un démarrage bloqué de `container` est
signalé sous macOS 27 (ticket #2275 du projet), et la story commence par là.

La conteneurisation n'est pas abordée dans les projets cibles : 495 n'y lance ni Docker ni VM Linux, et un test qui aurait
besoin de Docker n'y est pas pris en charge. 495 génère du code applicatif ; un Dockerfile s'y écrit comme tout autre
fichier. Le propriétaire l'a précisé le 11 octobre.
