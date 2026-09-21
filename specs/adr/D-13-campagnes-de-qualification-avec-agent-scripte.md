# D-13: Campagnes de qualification avec agent scripté

**Status:** Acceptée

**Décision.** `HARNESS495_SCRIPTED_AGENT=<fichier.json>` remplace le worker Pi par l'agent
déterministe `ScriptedAgent` dans le runtime de l'extension. Le diagnostic de session l'annonce.
**Motif.** V3 exige des parcours reproductibles par les entrées Pi sans fournisseur réel (C-PI,
F-PIHOST, F-AGENTS).
**Conséquence.** Ce mode n'est jamais activé sans la variable ; il est visible dans `Limites`.
