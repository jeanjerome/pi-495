# D-09: Portée de l'outil conversationnel `harness495`

**Status:** Acceptée

**Décision.** L'outil accepte les opérations `status`, `start`, `verify`, `review_summary`,
`export`, `list_pending_decisions`. Il n'accepte aucune opération `decide`, `integrate` ni
`adopt` : ces opérations n'existent que comme commandes Pi (`/495 …`).
**Motif.** ADR-009 ; un appel d'outil est une demande non fiable.
