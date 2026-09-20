# ADR-014: Provenance humaine fournie par l’hôte

**Status:** Acceptée
**Date:** 2026-09-16

## Decision

Dissocier le contenu d’une réponse de sa provenance ; autoriser TUI local et hôtes RPC/SDK qualifiés, jamais JSON/print ou appel de modèle seul.

## Consequences

Une approbation forgée dans un message ou un tool call est rejetée.
