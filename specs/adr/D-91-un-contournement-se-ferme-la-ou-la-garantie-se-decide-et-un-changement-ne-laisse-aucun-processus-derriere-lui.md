# D-91: Un contournement se ferme là où la garantie se décide, un changement ne laisse aucun processus derrière lui, et un délai de test ne se relève pas sans cause

**Status:** Acceptée (demande du propriétaire, 2026-10-12) ; précise `D-89` règle 1 et `D-85` règle 3
**Date:** 2026-10-12

## Contexte

La story `e40s03` a été lancée en mode automatique le 11 octobre à 21 h 40. Le propriétaire l'a arrêtée le 12 vers
1 h 05, pendant la recette, après 3 h 25 et 36 $. Le premier rouge-vert, qui tenait les quatre tâches, avait pris
26 min et 6,26 $. Le reste se répartit en deux causes.

**Une même garantie, fermée une variante à la fois.** La section sécurité de la story promet qu'aucun chemin hors de
la copie n'est proposé au propriétaire. Le chemin proposé est lu dans le message texte que le noyau publie pour chaque
refus. Ce message contient le nom du fichier que le code confiné a tenté de créer, et ce nom, le code confiné le
choisit. La borne était codée comme « un chemin qui ne commence pas par `/` est dans la copie » : toute lecture de
travers du message donnait `..`, et la proposition le laissait passer.
- Au second tour, un relecteur a forgé un nom qui imitait une seconde ligne de refus : 495 a lu `..` et proposé `../`.
- La session de retour a resserré l'expression qui lit le message.
- Au tour suivant, les deux relecteurs ont obtenu `../` par un nom qui contenait un saut de ligne.
- La session de retour a lu le message jusqu'à son repère.

Aucune des deux sessions n'a touché la fonction qui décide de la proposition. Chacune a reçu la remarque comme
« seul objet de ce passage ». Les deux retours ont coûté environ une heure et 15 $. Le cycle s'arrête au troisième
retour. Il en restait un.

C'est la troisième story où cela se produit. Sur `e38s11`, trois retours de relecture ont porté sur la garantie « la
preuve porte sur l'énoncé approuvé » : le cache d'artefacts de Lake, puis deux lectures différentes d'un même
`.olean`. Sur `e38s13`, deux retours ont porté sur « le contrôleur ne se remplace pas en cours de campagne » : les
scripts de `npm ci`, puis ce que `--ignore-scripts` laisse encore lire (`specs/verifications/e38s11/`, `e38s13/`).

**Une fuite de processus que personne n'a nommée.** La story lance `/usr/bin/log stream` pour lire les refus du noyau.
Cette lecture n'était arrêtée que lorsque le lancement se terminait normalement.
- À 22 h 18, pendant le premier tour de relecture, onze lectures ont démarré en dix secondes et sont restées en marche,
  rattachées à `launchd`. Leurs parents avaient été tués ; ce qui les a tués n'a pas été établi.
- Elles prenaient chacune 11 % d'un cœur, et `diagnosticd`, qui les alimente, 83 %. `fseventsd` tenait déjà un cœur
  ou plus, pour une raison étrangère à 495.
- Avec cette charge, les tests du contrôle formel ont dépassé leur délai de 2 s, `main` compris.

Le second rouge-vert a duré 1 h 28 ; le correctif qu'il devait porter, 2 min. Deux sessions de correction de
Preflight (16 puis 48 min) ont attribué l'échec à la machine. Elles ont relevé les délais de ces tests de 2 à 10 s et
à 5 s, ce qui a fait disparaître le symptôme. Ni l'autocontrôle, ni les quatre relecteurs, ni ces sessions n'ont nommé
la fuite. Le coordinateur l'a trouvée en listant les processus. Le propriétaire a dû les arrêter lui-même :
l'arrêt de processus de journalisation est refusé au mode automatique de Claude Code.

Les correctifs ont été faits à la main sur la branche : la lecture s'arrête avec le processus qui l'a démarrée, et
`..` n'est jamais proposé. Ils sont promis dans la story (tâches 5 et 6).

## Décision

1. **Un contournement se ferme là où la garantie se décide.** Quand la relecture rouvre une story sur un contournement
   de la section sécurité, la session de retour ferme la garantie au point où le code la décide, pour toute entrée qui
   y parvient, et le test tient la garantie à ce point. Fermer le chemin trouvé ne suffit pas : cela laisse au tour
   suivant un autre chemin vers le même point. Les deux peuvent se faire. La relecture qui suit rejoue le chemin comme
   `D-89` le prévoit.
2. **Un processus que la branche démarre s'arrête avec ce qui l'a démarré, même tué.** L'autocontrôle le vérifie sur
   le diff. Une session qui laisse en marche un processus qu'elle ou ses tests ont démarré le nomme dans sa sortie et
   l'arrête par son pid.
3. **Un délai de test dépassé ne se relève pas sans cause.** Une session de correction de Preflight devant un délai
   dépassé cherche d'abord ce qui charge la machine : les processus en marche, ceux que la branche a laissés, et la
   même suite sur `main`. Une charge que la branche cause est un défaut de la branche, corrigé comme tel. Un délai ne
   se relève qu'avec sa cause nommée dans la sortie de la session.

## Conséquences

La règle 1 peut faire un correctif plus large que la variante signalée. Il reste dans le périmètre de la garantie que
la story écrit : il n'ajoute ni promesse ni mécanisme. Une garantie que le code décide en plusieurs points se ferme en
chacun.

La règle 2 n'est pas vérifiée par l'outil. Sous macOS, un processus orphelin du cycle et une application que le
propriétaire ouvre sont tous deux rattachés à `launchd`, et rien de sûr ne les distingue. Elle repose sur
l'autocontrôle et sur les sessions.

La règle 3 allonge une session de correction devant un délai dépassé. En échange, elle évite de masquer une charge
que la branche introduit et qui se retrouverait chez les cibles.

Deux autres causes ont été relevées sans être tranchées : la largeur de la story (six promesses sur quatre couches,
que chaque retour fait relire en entier), et des tests qui reposent sur des pauses et des seuils de durée, fragiles
sous charge.
