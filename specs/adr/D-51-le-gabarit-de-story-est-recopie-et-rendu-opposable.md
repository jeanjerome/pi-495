# D-51: Le gabarit de story est recopié dans le dépôt, et un contrôle le rend opposable

**Status:** Acceptée
**Date:** 2026-09-21

## Context

`plan-work` écrit une story au format *countable-story-format* : un bloc d'en-tête, puis vingt
sections de noms et d'ordre fixes, chacune annonçant son état d'approbation. Le paquet bigpowers
installé sous `.claude/skills/` porte 81 compétences et rien d'autre : l'arborescence `docs/` de
l'amont n'est pas distribuée. Les `SKILL.md` de `slice-tasks` et `plan-work` installés sont
pourtant identiques à l'octet à ceux de l'amont — seule la documentation qu'ils citent manque, pas
la procédure qui l'exige.

Le format n'existait donc nulle part sur la machine, et `D-45` en a tiré que les capsules d'epic ne
pouvaient pas être écrites.

## Decision

Le format est recopié sous `specs/references/countable-story-format.md`, épinglé à la version d'où
il vient, et `scripts/check-story-format.ts` entre dans Preflight sous `lint:story-format`. Le
contrôle refuse une story d'`epics/` dont une des vingt sections manque, sort de son rang, change
de nom ou n'annonce pas son état d'approbation.

Le contrôle ne réénonce pas les vingt sections : il les extrait de la copie, en ignorant les
en-têtes des blocs de code — l'exemple complet du gabarit reproduit les vingt sections telles
qu'une story les porte, et les compter en déclarerait quarante. C'est ce qui donne au contrôle son
pouvoir de refus : une story et le format qu'elle prétend suivre ne peuvent pas diverger sans que
l'un des deux soit modifié, et la copie ne peut pas se dégrader en décoration.

Les vingt sections sont tenues telles quelles. Là où 495 n'a rien à dire — interface, notifications,
accessibilité — la section porte « sans objet » et sa raison en une ligne, ce que le format prévoit
lui-même. Supprimer une section plafonnerait la maturité de toutes les stories du dépôt pour
économiser trois lignes.

## Consequences

`specs/references/` est un troisième régime documentaire, à côté de ce que 495 écrit et de ce qu'il
a archivé : ce qu'il ne fait que recopier. Une copie y annonce en tête sa provenance et sa version,
et une resynchronisation se lit comme une comparaison avec l'amont.

La copie vieillira. Elle vieillira de manière visible, puisque sa version est écrite dedans, au lieu
de vieillir en silence derrière une adresse qui répond encore mais ne sert plus le même texte.

Le contrôle tient le contrat de structure, pas le contenu : le bloc d'en-tête et la taille en
Fibonacci font partie du format et ne sont pas vérifiés, pas plus que la couverture Gherkin du §17.
Une story qui passe le contrôle a ses vingt sections à leur rang ; elle n'a pas pour autant quelque
chose à dire dans chacune.

Le dernier paragraphe de `D-45` cesse d'être exact sur ce point : le gabarit n'est plus absent.

**Alternative rejetée :** un simple renvoi à l'adresse amont dans `specs/README.md`. Elle ne
coûtait aucun entretien, mais ne refusait rien, et le jour où l'adresse bouge le format redevient
introuvable — sans qu'on sache quelle version avait servi aux stories déjà écrites.

**Alternative rejetée :** un format local réduit aux sections qui parlent à 495. Elle raccourcissait
les stories au prix d'une divergence assumée avec ce que les compétences installées attendent, et
d'un plafond de maturité posé d'avance sur tout le dépôt.
