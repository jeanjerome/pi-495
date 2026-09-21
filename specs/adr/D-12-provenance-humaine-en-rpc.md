# D-12: Provenance humaine en RPC

**Status:** Acceptée

**Décision.** En mode RPC, une réponse de décision n'est acceptée que si l'hôte a déclaré l'identité
humaine dans la variable d'environnement nommée par `human_origin.rpc_actor_env`
(`HARNESS495_RPC_HUMAN_ACTOR` par défaut). Sans elle, la décision reste `decision_required` et
l'extension l'indique.
**Motif.** Pi ne transmet aucune identité de client aux extensions ; ADR-014 interdit de déduire une
provenance humaine du seul contenu.
