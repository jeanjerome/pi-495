# D-49: L'identité `claude-cli` annoncée sur le fil est acceptée pour la seule machine de référence

**Status:** Acceptée
**Date:** 2026-09-21

**Décision.** Sur le chemin d'abonnement, Pi s'annonce au fournisseur sous `user-agent:
claude-cli/2.1.251` et `x-app: cli`, avec les betas `claude-code-20250219` et `oauth-2025-04-20`.
495 ne compose aucun de ces en-têtes. Le chemin est retenu pour la qualification **sur la machine de
référence**, et aucun usage au-delà n'est revendiqué tant que la question n'a pas été instruite. La
restriction est portée aux contraintes de `specs/product/SCOPE_LATEST.yaml`.

**Motif.** 495 ne route l'API Pi que par `extension/` et `adapters/pi-worker/`, et n'appelle jamais
un modèle lui-même : il reçoit `ctx.model` et Pi le résout depuis son propre `models.json`
(`RM-022`). Ces en-têtes sont donc hors de ce que le harnais choisit, et hors de ce qu'il pourrait
changer autrement qu'en renonçant au fournisseur. Restreindre l'usage à la machine de référence
garde le bénéfice — un second témoin qualifié — sans revendiquer quoi que ce soit sur un usage que
le propriétaire n'a pas instruit.

**Conséquence.** Le périmètre porte la restriction, et non l'ADR seul, parce que c'est le périmètre
que lit quiconque reprend le travail. Si l'instruction conclut plus tard en sens contraire, `e23`
change d'objet : un second fournisseur qualifié passerait par une clé d'API facturée à l'usage ou
par un autre fournisseur du catalogue de Pi, et son coût changerait avec. Le fait est consigné
maintenant pour que ce réexamen porte sur un énoncé vérifiable, relevé sur le Pi 0.86.1 installé
(`dist/api/anthropic-messages.js` lignes 715-729 et 771).
